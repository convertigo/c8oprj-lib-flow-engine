/* Copyright (c) 2001-2026 Convertigo SA. AGPL-3.0-or-later. */
package com.convertigo.libflowengine;

import java.io.*;
import java.util.*;
import java.util.regex.*;
import com.fasterxml.jackson.core.*;
import org.codehaus.jettison.json.JSONException;
import org.mozilla.javascript.*;
import com.twinsoft.convertigo.engine.util.JsonData;
import com.twinsoft.convertigo.engine.util.DetachedJson;

/**
 * Whole-array kernels. Only ordinary JSON enters Java; unsupported JS semantics
 * return to the reference kernel before any getter or callback is invoked. No
 * project, request, row, scope or plan is cached in a static field.
 */
public final class Rows {
	static final Object MISSING = new Object();
	// The realm is borrowed only for the duration of one kernel call.
	private static final ThreadLocal<Scriptable> DIRECT_SCOPE = new ThreadLocal<>();
	private static Object result(Object value, Scriptable scope) throws JSONException {
		return RhinoCollections.unwrap(value, scope);
	}
	static final Pattern INDEX = Pattern.compile("0|[1-9][0-9]{0,9}");

	static final class Unsupported extends RuntimeException {
		Unsupported() {
			super(null, null, false, false);
		}
	}

	static final class Failure extends RuntimeException {
		final String code;

		Failure(String code, String message) {
			super(message, null, false, false);
			this.code = code;
		}
	}

	static void fail(String code, String message) {
		throw new Failure(code, message);
	}

	static void invalid(String message) {
		fail("ROWS_OPTIONS_INVALID", message);
	}

	static Map<String, Object> object(Object... pairs) {
		var scope = DIRECT_SCOPE.get();
		var result = scope == null ? JsonData.newObject() : RhinoCollections.object(scope);
		for (int i = 0; i < pairs.length; i += 2) result.put((String) pairs[i], pairs[i + 1]);
		return result;
	}

	static List<Object> array(Object... items) {
		var scope = DIRECT_SCOPE.get();
		var result = scope == null ? JsonData.newArray() : RhinoCollections.array(scope);
		Collections.addAll(result, items);
		return result;
	}

	static boolean nil(Object v) {
		return v == null;
	}

	static Object get(Map<?, ?> o, String key) {
		return o.containsKey(key) ? o.get(key) : MISSING;
	}

	static Object value(Object o, Object key) {
		if (o instanceof Map<?, ?> object)
			return get(object, String.valueOf(key));
		if (o instanceof List<?> a) {
			String s = String.valueOf(key);
			if (s.matches("0|[1-9][0-9]*")) {
				try {
					int i = Integer.parseInt(s);
					if (i < a.size())
						return a.get(i);
				} catch (NumberFormatException ignored) {
				}
			}
		}
		return MISSING;
	}

	static String text(Object v, String fallback, String name) {
		if (v == MISSING)
			return fallback;
		if (!(v instanceof String))
			invalid(name + " takes text.");
		return (String) v;
	}

	static boolean bool(Object v, boolean fallback, String name) {
		if (v == MISSING)
			return fallback;
		if (!(v instanceof Boolean))
			invalid(name + " takes true or false.");
		return Boolean.TRUE.equals(v);
	}

	static int integer(Object v, int fallback, int max, String name) {
		if (v == MISSING)
			return fallback;
		if (!(v instanceof Number))
			invalid(name + " takes a bounded integer.");
		double n = ((Number) v).doubleValue();
		if (!Double.isFinite(n) || n != Math.floor(n) || n < 1 || n > max)
			invalid(name + " takes a bounded integer.");
		return (int) n;
	}

	static List<?> options(Object value, String name, boolean required) {
		if (value == MISSING && !required)
			return array();
		if (!(value instanceof List<?>))
			invalid(name + " takes an array.");
		var a = (List<?>) value;
		if (a.size() > 4096)
			invalid(name + " has at most 4096 entries.");
		return a;
	}

	static Map<?, ?> row(Object v) {
		if (!(v instanceof Map<?, ?>))
			fail("ROWS_ROW_INVALID", "Each row must be an object.");
		return (Map<?, ?>) v;
	}

	static Iterable<String> keys(Map<?, ?> object) {
		boolean indexed = false;
		for (var it = object.keySet().iterator(); it.hasNext();) {
			long n = ScriptRuntime.indexFromString((String) it.next());
			if (n >= 0 && n < 4294967295L) {
				indexed = true;
				break;
			}
		}
		if (!indexed)
			return () -> object.keySet().stream().map(key -> (String) key).iterator();
		var indices = new TreeMap<Long, String>();
		var other = new ArrayList<String>();
		for (var it = object.keySet().iterator(); it.hasNext();) {
			var key = (String) it.next();
			long n = ScriptRuntime.indexFromString(key);
			if (n >= 0 && n < 4294967295L)
				indices.put(n, key);
			else
				other.add(key);
		}
		var result = new ArrayList<String>(indices.values());
		result.addAll(other);
		return result;
	}

	static final class Control {
		final Context cx;
		final Scriptable scope;
		final Scriptable object;
		final Callable callback;

		Control(Context cx, Scriptable scope, Object control) {
			this.cx = cx;
			this.scope = scope;
			object = control instanceof Scriptable s ? s : null;
			var fn = object == null ? null : ScriptableObject.getProperty(object, "canContinue");
			callback = fn instanceof Callable c ? c : null;
		}

		boolean alive() {
			return !Thread.currentThread().isInterrupted()
					&& (callback == null || Context.toBoolean(callback.call(cx, scope, object, Context.emptyArgs)));
		}

		void tick(int i) {
			if ((i & 63) == 0 && (Thread.currentThread().isInterrupted()
					|| callback != null && !Context.toBoolean(callback.call(cx, scope, object, Context.emptyArgs))))
				fail("FLOW_EXECUTION_CANCELLED", "Row processing was cancelled.");
		}
	}

	static final class Budget {
		int remaining;

		Budget(Map<?, ?> p) {
			remaining = integer(get(p, "maxCells"), 1000000, 10000000, "maxCells");
		}

		void spend() {
			if (--remaining < 0)
				fail("ROWS_LIMIT_EXCEEDED", "JSON path or column expansion exceeds maxCells.");
		}
	}

	static List<?> check(Map<?, ?> p, int width, Control control) {
		var v = get(p, "rows");
		if (!(v instanceof List<?>))
			invalid("rows takes an array.");
		var a = (List<?>) v;
		if (a.size() > integer(get(p, "maxRows"), 100000, 1000000, "maxRows")
				|| (long) a.size() * Math.max(width, 1) > integer(get(p, "maxCells"), 1000000, 10000000, "maxCells"))
			fail("ROWS_LIMIT_EXCEEDED", "Row/cell budget exceeded; filter, project or page the source first.");
		control.tick(0);
		return a;
	}

	static final class PathPlan {
		final List<Object> parts = new ArrayList<>();
		boolean wildcard;

		PathPlan(Object raw) {
			String s = text(raw, "$", "path");
			if (s.length() > 2048)
				invalid("path is limited to 2048 characters.");
			int i = 0;
			if (s.startsWith("$"))
				i++;
			else if (!s.startsWith("[") && !s.isEmpty())
				s = "." + s;
			while (i < s.length()) {
				char c = s.charAt(i++);
				Object part;
				if (c == '.') {
					int begin = i;
					while (i < s.length() && ".[]".indexOf(s.charAt(i)) < 0 && !Character.isWhitespace(s.charAt(i)))
						i++;
					if (begin == i)
						pathError();
					String key = s.substring(begin, i);
					part = key.equals("*") ? null : key;
				} else if (c == '[') {
					while (i < s.length() && Character.isWhitespace(s.charAt(i)))
						i++;
					if (i == s.length())
						pathError();
					c = s.charAt(i++);
					if (c == '\'' || c == '"') {
						char quote = c;
						var key = new StringBuilder();
						boolean closed = false;
						while (i < s.length()) {
							c = s.charAt(i++);
							if (c == quote) {
								closed = true;
								break;
							}
							if (c == '\\') {
								if (i == s.length())
									pathError();
								c = s.charAt(i++);
								if (c == 'u') {
									if (i + 4 > s.length() || !s.substring(i, i + 4).matches("[0-9a-fA-F]{4}"))
										pathError();
									key.append((char) Integer.parseInt(s.substring(i, i + 4), 16));
									i += 4;
									continue;
								}
								c = switch (c) {
								case 'n' -> '\n';
								case 'r' -> '\r';
								case 't' -> '\t';
								case 'b' -> '\b';
								case 'f' -> '\f';
								default -> c;
								};
							}
							key.append(c);
						}
						if (!closed)
							pathError();
						part = key.toString();
					} else if (c == '*')
						part = null;
					else {
						int begin = i - 1;
						while (i < s.length() && Character.isDigit(s.charAt(i)))
							i++;
						String number = s.substring(begin, i);
						if (!number.matches("0|[1-9][0-9]*"))
							pathError();
						part = number;
					}
					while (i < s.length() && Character.isWhitespace(s.charAt(i)))
						i++;
					if (i >= s.length() || s.charAt(i++) != ']')
						pathError();
				} else {
					pathError();
					return;
				}
				parts.add(part);
				if (part == null)
					wildcard = true;
				if (parts.size() > 64)
					pathError();
			}
		}

		static void pathError() {
			fail("ROWS_PATH_INVALID", "Invalid bounded JSON path.");
		}

		Object read(Object source, Budget budget) throws JSONException {
			if (!wildcard) {
				for (var part : parts) {
					source = value(source, part);
					if (source == MISSING)
						break;
				}
				return source;
			}
			var current = new ArrayList<Object>();
			current.add(source);
			for (var part : parts) {
				var next = new ArrayList<Object>();
				for (var item : current) {
					if (part == null) {
						if (item instanceof Map<?, ?> object)
							for (var k : keys(object)) {
								next.add(object.get(k));
								budget.spend();
							}
						else if (item instanceof List<?> a)
							for (int i = 0; i < a.size(); i++) {
								next.add(a.get(i));
								budget.spend();
							}
					} else {
						var v = value(item, part);
						if (v != MISSING)
							next.add(v);
					}
				}
				current = next;
			}
			var result = array();
			for (var v : current)
				result.add(v);
			return result;
		}
	}

	interface Reader {
		Object read(Map<?, ?> row) throws JSONException;
	}

	static Reader reader(String name, Budget budget) {
		if (name.startsWith("$")) {
			var path = new PathPlan(name);
			if (path.wildcard)
				invalid("Column paths for distinct/group cannot contain wildcards.");
			return r -> path.read(r, budget);
		}
		return r -> get(r, name);
	}

	static final class Sanitizer {
		final List<?> redactions, drop, mask;
		final int maxNodes, maxDepth;
		int visits;

		Sanitizer(Object value) throws JSONException {
			var p = row(value);
			redactions = options(get(p, "redactions"), "sanitize.redactions", false);
			drop = options(get(p, "dropKeys"), "sanitize.dropKeys", false);
			mask = options(get(p, "maskKeys"), "sanitize.maskKeys", false);
			for (var a : List.of(redactions, drop, mask))
				for (int i = 0; i < a.size(); i++)
					text(a.get(i), null, "sanitize entries");
			maxNodes = integer(get(p, "maxNodes"), 100000, 10000000, "sanitize.maxNodes");
			maxDepth = integer(get(p, "maxDepth"), 50, 128, "sanitize.maxDepth");
		}

		Object copy(Object value, int depth) throws JSONException {
			if (++visits > maxNodes || depth > maxDepth)
				fail("ROWS_READ_BOUNDS", "JSON response exceeds the structural safety limit.");
			if (value instanceof String text) {
				for (int i = 0; i < redactions.size(); i++) {
					String secret = (String) redactions.get(i);
					if (!secret.isEmpty() && text.contains(secret))
						text = text.replace(secret, "[redacted]");
				}
				return text;
			}
			if (value instanceof Map<?, ?> object) {
				var out = object();
				for (var key : keys(object)) {
					if (Cells.contains(mask, key.toLowerCase(Locale.ROOT)))
						out.put(key, "[redacted]");
					else if (!Cells.contains(drop, key))
						out.put(key, copy(object.get(key), depth + 1));
				}
				return out;
			}
			if (value instanceof List<?> a) {
				var out = array();
				for (int i = 0; i < a.size(); i++)
					out.add(copy(a.get(i), depth + 1));
				return out;
			}
			return value;
		}
	}

	static Object read(Map<?, ?> p, Control control) throws Exception {
		var path = new PathPlan(get(p, "path"));
		var rows = check(p, 1, control);
		var out = array();
		var skip = bool(get(p, "skipMissing"), false, "skipMissing");
		var fallback = get(p, "defaultValue");
		if (fallback == MISSING)
			fallback = null;
		var budget = new Budget(p);
		var sanitizer = get(p, "sanitize") == MISSING ? null : new Sanitizer(get(p, "sanitize"));
		for (int i = 0; i < rows.size(); i++) {
			control.tick(i);
			var source = rows.get(i);
			if (source instanceof String text) {
				try {
					source = parse(text);
				} catch (Unsupported fallbackException) {
					throw fallbackException;
				} catch (Exception invalid) {
					fail("ROWS_JSON_INVALID", "Row is not valid JSON.");
				}
			}
			if (sanitizer != null) {
				sanitizer.visits = 0;
				source = sanitizer.copy(source, 0);
			}
			var v = path.read(source, budget);
			if (v != MISSING)
				out.add(v);
			else if (!skip)
				out.add(fallback);
		}
		return out;
	}

	record Projection(String key, String identity, Reader read) {
	}

	static Object select(Map<?, ?> p, Control control) throws Exception {
		return new Selection(p).apply(p, control);
	}

	static final class Selection {
		final List<?> columns;
		final Map<?, ?> rename;
		final Budget budget;
		final int limit;
		final ArrayList<Projection> plans = new ArrayList<>();
		final LinkedHashMap<String, String> outputs = new LinkedHashMap<>();

		Selection(Map<?, ?> p) throws Exception {
			var first = options(get(p, "firstColumns"), "firstColumns", false);
			var order = options(get(p, "columnsOrder"), "columnsOrder", false);
			var columnSpec = get(p, "columns");
			columns = columnSpec == MISSING ? null : options(columnSpec, "columns", true);
			rename = get(p, "rename") == MISSING ? object() : row(get(p, "rename"));
			for (var key : keys(rename))
				text(rename.get(key), null, "rename");
			budget = new Budget(p);
			for (var specs : List.of(first, columns == null ? order : columns))
				for (int i = 0; i < specs.size(); i++) {
					var spec = specs.get(i);
					String name, identity;
					Reader read;
					if (spec instanceof String key) {
						name = text(get(rename, key), key, "rename");
						identity = key;
						read = reader(key, budget);
					} else {
						var obj = row(spec);
						name = text(get(obj, "key"), null, "columns[].key");
						if (name == null)
							invalid("A projected path needs a key.");
						var path = new PathPlan(get(obj, "path"));
						identity = js(get(obj, "path"));
						var fallback = get(obj, "defaultValue");
						boolean nullAsMissing = bool(get(obj, "nullAsMissing"), false, "columns[].nullAsMissing");
						read = r -> {
							var v = path.read(r, budget);
							return v == MISSING || nullAsMissing && nil(v) ? fallback : v;
						};
					}
					if (outputs.containsKey(name)) {
						if (!outputs.get(name).equals(identity))
							invalid("Two columns write the same output key.");
						continue;
					}
					outputs.put(name, identity);
					plans.add(new Projection(name, identity, read));
				}
			limit = budget.remaining;
		}

		Object apply(Map<?, ?> p, Control control) throws Exception {
			budget.remaining = limit;

			var rows = check(p, Math.max(plans.size(), 1), control);
			var out = array();
			for (int i = 0; i < rows.size(); i++) {
				control.tick(i);
				var source = row(rows.get(i));
				var target = object();
				for (var plan : plans) {
					var v = plan.read.read(source);
					if (v != MISSING)
						target.put(plan.key, v);
				}
				if (columns == null)
					for (var key : keys(source)) {
						budget.spend();
						String to = text(get(rename, key), key, "rename");
						if (!target.containsKey(to))
							target.put(to, source.get(key));
						else if (!outputs.containsKey(to) || !outputs.get(to).equals(key))
							invalid("Two columns write the same output key.");
					}
				out.add(target);
			}
			return out;
		}
	}

	static Object parse(String text) throws IOException, JSONException {
		try (var parser = new JsonFactory().createParser(text)) {
			var token = parser.nextToken();
			if (token == null)
				throw new IOException("Empty JSON");
			var value = parse(parser, token, 0);
			if (parser.nextToken() != null)
				throw new IOException("Trailing JSON");
			return value;
		}
	}

	private static Object parse(JsonParser p, JsonToken token, int depth) throws IOException, JSONException {
		if (depth > 128)
			throw new Unsupported();
		return switch (token) {
		case START_OBJECT -> {
			var o = object();
			while (p.nextToken() != JsonToken.END_OBJECT) {
				if (p.currentToken() != JsonToken.FIELD_NAME)
					throw new IOException("Invalid JSON object");
				var key = p.currentName();
				var next = p.nextToken();
				if (next == null)
					throw new IOException("Incomplete JSON");
				o.put(key, parse(p, next, depth + 1));
			}
			yield o;
		}
		case START_ARRAY -> {
			var a = array();
			JsonToken next;
			while ((next = p.nextToken()) != JsonToken.END_ARRAY) {
				if (next == null)
					throw new IOException("Incomplete JSON");
				a.add(parse(p, next, depth + 1));
			}
			yield a;
		}
		case VALUE_STRING -> p.getText();
		case VALUE_TRUE -> true;
		case VALUE_FALSE -> false;
		case VALUE_NULL -> null;
		case VALUE_NUMBER_INT, VALUE_NUMBER_FLOAT -> {
			double n = p.getDoubleValue();
			if (!Double.isFinite(n))
				throw new Unsupported();
			yield n;
		}
		default -> throw new IOException("Invalid JSON token");
		};
	}

	static String js(Object v) {
		if (v == MISSING)
			return "undefined";
		if (nil(v))
			return "null";
		if (v instanceof String s)
			return s;
		if (v instanceof Number n)
			return ScriptRuntime.numberToString(n.doubleValue(), 10);
		if (v instanceof Boolean b)
			return b ? "true" : "false";
		if (v instanceof List<?> a) {
			var s = new StringBuilder();
			for (int i = 0; i < a.size(); i++) {
				if (i > 0)
					s.append(',');
				var item = a.get(i);
				if (!nil(item) && item != MISSING)
					s.append(js(item));
			}
			return s.toString();
		}
		return "[object Object]";
	}

	static String json(Object v) throws Exception {
		var output = new StringWriter();
		try (var generator = new JsonFactory().createGenerator(output)) {
			write(generator, v);
		}
		return output.toString();
	}

	private static void write(JsonGenerator out, Object v) throws Exception {
		if (v instanceof Map<?, ?> o) {
			out.writeStartObject();
			for (var k : keys(o)) {
				out.writeFieldName(k);
				write(out, o.get(k));
			}
			out.writeEndObject();
		} else if (v instanceof List<?> a) {
			out.writeStartArray();
			for (int i = 0; i < a.size(); i++)
				write(out, a.get(i));
			out.writeEndArray();
		} else if (nil(v) || v == MISSING)
			out.writeNull();
		else if (v instanceof String s)
			out.writeString(s);
		else if (v instanceof Boolean b)
			out.writeBoolean(b);
		else if (v instanceof Number n)
			out.writeNumber(ScriptRuntime.numberToString(n.doubleValue(), 10));
		else
			throw new Unsupported();
	}

	private static Object input(Object v, Scriptable scope, IdentityHashMap<Object, Boolean> seen, int depth)
			throws JSONException {
		if (depth > 128)
			throw new Unsupported();
		if (v == null)
			return null;
		if (Undefined.isUndefined(v))
			return MISSING;
		if (v instanceof CharSequence s)
			return s.toString();
		if (v instanceof Boolean)
			return v;
		if (v instanceof Number n) {
			if (!Double.isFinite(n.doubleValue()))
				throw new Unsupported();
			return n;
		}
		if (!(v instanceof ScriptableObject s))
			throw new Unsupported();
		if (s.getClass() != NativeObject.class && s.getClass() != NativeArray.class)
			throw new Unsupported();
		if (s.getClass() == NativeObject.class && s.getAllIds().length != s.getIds().length)
			throw new Unsupported();
		var prototype = s instanceof NativeArray ? ScriptableObject.getArrayPrototype(scope)
				: ScriptableObject.getObjectPrototype(scope);
		if (s.getPrototype() != prototype || ScriptableObject.hasProperty(s, "getClass")
				|| ScriptableObject.hasProperty(s, "__flowHandle") || ScriptableObject.hasProperty(s, "toJSON")
				|| ScriptableObject.hasProperty(s, SymbolKey.TO_STRING_TAG))
			throw new Unsupported();
		if (seen.put(s, true) != null)
			throw new Unsupported();
		try {
			if (s instanceof NativeArray a) {
				if (a.getLength() > 1000000 || a.has("map", a) || a.has("constructor", a))
					throw new Unsupported();
				var out = DIRECT_SCOPE.get() == null ? array() : null;
				for (int i = 0; i < a.getLength(); i++) {
					var getter = a.getGetterOrSetter(null, i, false);
					if (getter != null && !Undefined.isUndefined(getter) || !a.has(i, a))
						throw new Unsupported();
					var item = input(a.get(i, a), scope, seen, depth + 1);
					if (item == MISSING)
						throw new Unsupported();
					if (out != null) out.add(item);
				}
				return out == null ? RhinoCollections.read(a, scope) : out;
			}
			var out = DIRECT_SCOPE.get() == null ? object() : null;
			for (var id : s.getIds()) {
				if (id instanceof Symbol)
					throw new Unsupported();
				String key = id.toString();
				var getter = id instanceof Number n ? s.getGetterOrSetter(null, n.intValue(), false)
						: s.getGetterOrSetter(key, 0, false);
				if (getter != null && !Undefined.isUndefined(getter))
					throw new Unsupported();
				var item = input(id instanceof Number n ? s.get(n.intValue(), s) : s.get(key, s), scope, seen,
						depth + 1);
				if (item == MISSING) throw new Unsupported();
				if (out != null) out.put(key, item);
			}
			return out == null ? RhinoCollections.read(s, scope) : out;
		} finally {
			seen.remove(s);
		}
	}

	/**
	 * Request-local fused pure kernels for an exclusive row producer. Never cache
	 * this object globally: it owns its caller realm and its project generation.
	 */
	public static final class Pipeline {
		private final Scriptable scope;
		private final List<?> steps;
		private final Selection[] selections;
		private final Cells.TablePlan[] tables;

		private Pipeline(Scriptable scope, List<?> steps) throws Exception {
			this.scope = scope;
			this.steps = steps;
			selections = new Selection[steps.size()];
			tables = new Cells.TablePlan[steps.size()];
			for (int i = 0; i < steps.size(); i++) {
				var step = row(steps.get(i));
				var p = row(step.get("options"));
				var name = (String) step.get("operation");
				if (name.equals("select"))
					selections[i] = new Selection(p);
				if (name.equals("formatCells") && "table".equals(p.get("profile")))
					tables[i] = new Cells.TablePlan(p);
			}
		}

		public synchronized Object apply(Object rows) throws Exception {
			var previous = DIRECT_SCOPE.get();
			DIRECT_SCOPE.set(scope);
			var cx = Context.getCurrentContext();
			try {
				if (!com.twinsoft.convertigo.engine.util.SanitizedJson.ordinaryRealm(cx, scope))
					return null;
				Object current = input(rows, scope, new IdentityHashMap<>(), 0);
				Object fields = null;
				for (int i = 0; i < steps.size(); i++) {
					var step = row(steps.get(i));
					var options = row(step.get("options"));
					var p = object();
					for (var key : keys(options))
						p.put(key, options.get(key));
					p.put("rows", current);
					var control = new Control(cx, scope, null);
					current = selections[i] != null ? selections[i].apply(p, control)
							: tables[i] != null ? Cells.table(p, control, tables[i])
									: execute((String) step.get("operation"), p, control);
					if (current instanceof Map<?, ?> envelope && envelope.containsKey("rows")) {
						fields = envelope.get("fields");
						current = envelope.get("rows");
					}
				}
				var out = object("rows", current);
				if (fields != null)
					out.put("fields", fields);
				return result(out, scope);
			} catch (Unsupported unsupported) {
				return null;
			} catch (Failure failure) {
				throw scriptFailure(cx, scope, failure);
			} finally { if (previous == null) DIRECT_SCOPE.remove(); else DIRECT_SCOPE.set(previous); }
		}
	}

	public static Pipeline prepare(Object raw) throws Exception {
		if (!(raw instanceof Scriptable source))
			return null;
		var scope = ScriptableObject.getTopLevelScope(source);
		var cx = Context.getCurrentContext();
		try {
			if (!com.twinsoft.convertigo.engine.util.SanitizedJson.ordinaryRealm(cx, scope))
				return null;
			var steps = (List<?>) input(raw, scope, new IdentityHashMap<>(), 0);
			if (steps.size() > 8)
				throw new Unsupported();
			for (int i = 0; i < steps.size(); i++) {
				var s = row(steps.get(i));
				String name = (String) s.get("operation");
				if (!List.of("read", "select", "formatCells").contains(name)
						|| !(s.get("options") instanceof Map<?, ?>))
					throw new Unsupported();
			}
			// Consume/seal the plan without retaining any caller JS value.
			var snapshot = (Map<?, ?>) JsonData.snapshot(object("steps", steps));
			return new Pipeline(scope, (List<?>) snapshot.get("steps"));
		} catch (Unsupported | ClassCastException unsupported) {
			return null;
		}
	}

	private static Object execute(String operation, Map<?, ?> p, Control control) throws Exception {
		return switch (operation) {
		case "read" -> read(p, control);
		case "select" -> select(p, control);
		case "formatCells" -> Cells.format(p, control);
		default -> throw new Unsupported();
		};
	}

	private static JavaScriptException scriptFailure(Context cx, Scriptable scope, Failure error) {
		var result = cx.newObject(scope);
		ScriptableObject.putProperty(result, "code", error.code);
		ScriptableObject.putProperty(result, "message", error.getMessage());
		ScriptableObject.putProperty(result, "status", 400);
		return new JavaScriptException(result, "rows", 0);
	}

	private static final boolean AVAILABLE = compatibleEngine();

	private static boolean compatibleEngine() {
		try {
			return Map.class.isAssignableFrom(JsonData.class.getMethod("newObject").getReturnType())
					&& JsonData.class.getMethod("snapshot", Object.class) != null;
		} catch (ReflectiveOperationException | LinkageError unavailable) {
			return false;
		}
	}

	public static boolean available() {
		return AVAILABLE;
	}

	public static Object run(String operation, Object values, Object callback) throws Exception {
		if (!(values instanceof Scriptable source))
			return null;
		var scope = ScriptableObject.getTopLevelScope(source);
		var cx = Context.getCurrentContext();
		var previous = DIRECT_SCOPE.get();
		DIRECT_SCOPE.set(scope);
		try {
			if (!com.twinsoft.convertigo.engine.util.SanitizedJson.ordinaryRealm(cx, scope))
				return null;
			if (callback instanceof ScriptableObject c) {
				if (!c.has("canContinue", c) && ScriptableObject.hasProperty(c, "canContinue"))
					return null;
				var getter = c.getGetterOrSetter("canContinue", 0, false);
				if (getter != null && !Undefined.isUndefined(getter))
					return null;
			}
			var p = row(input(values, scope, new IdentityHashMap<>(), 0));
			var control = new Control(cx, scope, callback);
			Object result = execute(operation, p, control);
			return result(result, scope);
		} catch (Unsupported fallback) {
			return null;
		} catch (Failure error) {
			throw scriptFailure(cx, scope, error);
		} finally { if (previous == null) DIRECT_SCOPE.remove(); else DIRECT_SCOPE.set(previous); }
	}
}
