/* Copyright (c) 2001-2026 Convertigo SA. AGPL-3.0-or-later. */
package com.convertigo.libflowengine;

import java.math.*;
import java.time.*;
import java.time.format.*;
import java.util.*;
import java.util.regex.*;
import org.codehaus.jettison.json.JSONException;
import org.mozilla.javascript.ScriptRuntime;
import static com.convertigo.libflowengine.Rows.*;

/** Typed text cells and the explicit table HTML compatibility profile. */
final class Cells {
	static final String OPEN = "<div style='display:flex; white-space: normal; align-items:center; flex-wrap: wrap'>",
			CLOSE = "</div>";
	static final Map<String, String> COLORS = Map.ofEntries(Map.entry("light-blue", "#f0f4fc"),
			Map.entry("light-green", "#ecfcf1"), Map.entry("light-cyan", "#cff5fa"),
			Map.entry("light-orange", "#fffbf0"), Map.entry("light-yellow", "#fffbf0"),
			Map.entry("light-red", "#fff2f0"), Map.entry("light-brown", "#f5e6dc"),
			Map.entry("light-purple", "#f9f1fd"), Map.entry("light-pink", "#f7e1f2"),
			Map.entry("light-gray", "#f5f5f5"), Map.entry("blue", "#dae4fd"), Map.entry("green", "#d0f6dc"),
			Map.entry("cyan", "#a0ebf5"), Map.entry("orange", "#fff4da"), Map.entry("yellow", "#ffe9b4"),
			Map.entry("red", "#ffdeda"), Map.entry("brown", "#f5ceb0"), Map.entry("purple", "#dfb9f7"),
			Map.entry("pink", "#f7b2e7"), Map.entry("gray", "#d7d8d9"), Map.entry("dark-blue", "#acc8f8"),
			Map.entry("dark-green", "#a0eeba"), Map.entry("dark-cyan", "#70e0ef"), Map.entry("dark-orange", "#ffe9b4"),
			Map.entry("dark-yellow", "#ffdd8f"), Map.entry("dark-red", "#ffbdb4"), Map.entry("dark-brown", "#f5c098"),
			Map.entry("dark-purple", "#cf96f2"), Map.entry("dark-pink", "#f285d9"), Map.entry("dark-gray", "#cdcecd"),
			Map.entry("darker-blue", "#689ef1"), Map.entry("darker-green", "#41dd75"),
			Map.entry("darker-cyan", "#41d6ea"), Map.entry("darker-orange", "#ffd269"),
			Map.entry("darker-yellow", "#ffd269"), Map.entry("darker-red", "#ff7b69"),
			Map.entry("darker-brown", "#f5a96e"), Map.entry("darker-purple", "#bf73ee"),
			Map.entry("darker-pink", "#ff6dde"), Map.entry("darker-gray", "#b5b5b7"),
			Map.entry("deep-dark-green", "#10bf4a"), Map.entry("deep-dark-orange", "#ffc744"),
			Map.entry("white", "#fff"));
	static final Pattern INTEGER_PREFIX = Pattern.compile("^[\\s]*([+-]?[0-9]+)");
	static final Pattern DECIMAL = Pattern.compile("^-?\\d+(\\.\\d+)?$");
	static final Pattern ISO = Pattern.compile(
			"^([0-9]{4})-([0-9]{2})-([0-9]{2})(?:T([0-9]{2}):([0-9]{2})(?::([0-9]{2})(\\.[0-9]{1,3})?)?(Z|[+-][0-9]{2}:[0-9]{2})?)?$");

	static String escape(String text) {
		return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
	}

	static String option(Map<?, ?> field, String key) {
		var v = field == null ? MISSING : get(field, key);
		return v == MISSING || nil(v) ? "" : js(v);
	}

	static boolean truth(Object value) {
		return Boolean.TRUE.equals(value) || value instanceof Number n && n.doubleValue() == 1 || "1".equals(js(value))
				|| "true".equalsIgnoreCase(js(value));
	}

	static boolean truthy(Object value) {
		return value != MISSING && !nil(value) && !Boolean.FALSE.equals(value)
				&& !(value instanceof String s && s.isEmpty())
				&& !(value instanceof Number n && (n.doubleValue() == 0 || Double.isNaN(n.doubleValue())));
	}

	static String pad(long n, int width) {
		String s = Long.toString(n);
		return "0".repeat(Math.max(0, width - s.length())) + s;
	}

	static Integer parseInteger(String value) {
		var m = INTEGER_PREFIX.matcher(value);
		if (!m.find())
			return null;
		try {
			return Integer.parseInt(m.group(1));
		} catch (NumberFormatException e) {
			throw new Unsupported();
		}
	}

	static String fixed(double value, int digits) {
		if (Math.abs(value) >= 1e21)
			return ScriptRuntime.numberToString(value, 10);
		String text = new BigDecimal(value).setScale(digits, RoundingMode.HALF_UP).toPlainString();
		if (value < 0 && new BigDecimal(text).signum() == 0)
			return "-" + text;
		return text;
	}

	record TextColumn(String key, Reader read, String type, int digits, String nullText, String trueText,
			String falseText, DateTimeFormatter date, ZoneId zone) {
	}

	static Object format(Map<?, ?> p, Control control) throws Exception {
		String profile = text(get(p, "profile"), "text", "profile");
		if (profile.equals("table"))
			return table(p, control);
		if (!profile.equals("text"))
			invalid("profile takes text or table.");
		var columns = options(get(p, "columns"), "columns", true);
		var keep = options(get(p, "keepColumns"), "keepColumns", false);
		var names = new HashSet<String>();
		var budget = new Budget(p);
		for (int i = 0; i < keep.size(); i++)
			text(keep.get(i), null, "keepColumns[]");
		boolean numeric = bool(get(p, "includeNumeric"), false, "includeNumeric"),
				escape = bool(get(p, "escapeHtml"), false, "escapeHtml"),
				valuesOnly = bool(get(p, "valuesOnly"), false, "valuesOnly");
		var plans = new ArrayList<TextColumn>();
		for (int i = 0; i < columns.size(); i++) {
			var spec = columns.get(i);
			var c = spec instanceof String name ? object("name", name) : row(spec);
			String name = text(get(c, "name"), null, "columns[].name");
			if (name == null)
				invalid("Each column needs a name.");
			String key = text(get(c, "key"), name, "columns[].key");
			if (!names.add(key) || contains(keep, key))
				invalid("Duplicate output column.");
			String type = text(get(c, "type"), text(get(c, "kind"), "text", "columns[].type"), "columns[].type");
			if (!List.of("text", "string", "number", "integer", "boolean", "date", "datetime", "json").contains(type))
				invalid("Unsupported column type.");
			Object d = get(c, "decimals");
			int digits = 2;
			if (d != MISSING) {
				if (!(d instanceof Number n) || n.doubleValue() != Math.floor(n.doubleValue()) || n.doubleValue() < 0
						|| n.doubleValue() > 20)
					invalid("decimals takes an integer from 0 to 20.");
				digits = ((Number) d).intValue();
			}
			Reader read = get(c, "path") == MISSING ? reader(name, budget)
					: r -> new PathPlan(get(c, "path")).read(r, budget);
			// Compile a path once, including wildcard expansion under the same budget.
			if (get(c, "path") != MISSING) {
				var path = new PathPlan(get(c, "path"));
				read = r -> path.read(r, budget);
			}
			DateTimeFormatter date = null;
			ZoneId zone = null;
			if (type.equals("date") || type.equals("datetime")) {
				String pattern = text(get(c, "pattern"), "dd/MM/yyyy", "columns[].pattern");
				if (pattern.equals("long"))
					pattern = "EEEE d MMMM yyyy";
				var tokens = Pattern.compile("yyyy|MMMM|MMM|MM|M|dd|d|EEEE|EEE|HH|H|mm|m|ss|s|[^A-Za-z]")
						.matcher(pattern);
				int end = 0, count = 0;
				while (tokens.find()) {
					if (tokens.start() != end || ++count > 256)
						invalid("Unsupported date pattern.");
					end = tokens.end();
				}
				if (end != pattern.length())
					invalid("Unsupported date pattern.");
				try {
					zone = ZoneId.of(text(get(c, "timeZone"), "UTC", "columns[].timeZone"));
					date = DateTimeFormatter.ofPattern(pattern,
							Locale.forLanguageTag(text(get(c, "locale"), "fr-FR", "columns[].locale")));
				} catch (RuntimeException e) {
					invalid("Date columns need a valid IANA timeZone and BCP47 locale.");
				}
			}
			plans.add(new TextColumn(key, read, type, digits, text(get(c, "nullText"), "", "columns[].nullText"),
					text(get(c, "trueText"), "Oui", "columns[].trueText"),
					text(get(c, "falseText"), "Non", "columns[].falseText"), date, zone));
		}
		var rows = check(p, plans.size() + keep.size(), control);
		var out = array();
		for (int i = 0; i < rows.size(); i++) {
			control.tick(i);
			var source = row(rows.get(i));
			var target = object();
			for (int k = 0; k < keep.size(); k++) {
				String key = (String) keep.get(k);
				if (source.containsKey(key))
					target.put(key, source.get(key));
			}
			for (int j = 0; j < plans.size(); j++) {
				control.tick(j);
				var plan = plans.get(j);
				var raw = plan.read.read(source);
				if (raw == MISSING)
					raw = null;
				if (valuesOnly) {
					target.put(plan.key, raw);
					continue;
				}
				String rendered;
				if (nil(raw))
					rendered = plan.nullText;
				else if (plan.date != null) {
					rendered = strictDate(raw, plan);
					if (rendered == null)
						fail("ROWS_DATE_INVALID", "Invalid ISO date in column at row.");
				} else if (plan.type.equals("boolean")) {
					if (!(raw instanceof Boolean))
						fail("ROWS_VALUE_INVALID", "Boolean column needs true or false.");
					rendered = Boolean.TRUE.equals(raw) ? plan.trueText : plan.falseText;
				} else if (plan.type.equals("number") || plan.type.equals("integer")) {
					double n = raw instanceof Number number ? number.doubleValue()
							: raw instanceof String s && !s.trim().isEmpty() ? ScriptRuntime.toNumber(s) : Double.NaN;
					if (!Double.isFinite(n))
						fail("ROWS_VALUE_INVALID", "Numeric column needs a finite number.");
					rendered = fixed(n, plan.type.equals("integer") ? 0 : plan.digits);
				} else
					rendered = plan.type.equals("json") || raw instanceof Map<?, ?> || raw instanceof List<?>
							? json(raw)
							: js(raw);
				if (escape)
					rendered = escape(rendered).replace("'", "&#39;");
				var cell = object("value", raw, "text", rendered);
				if (numeric)
					cell.put("numeric", DECIMAL.matcher(nil(raw) ? "" : js(raw)).matches());
				target.put(plan.key, cell);
			}
			out.add(target);
		}
		return out;
	}

	static String strictDate(Object raw, TextColumn plan) {
		if (!(raw instanceof String text))
			return null;
		var m = ISO.matcher(text);
		if (!m.matches())
			return null;
		try {
			int year = Integer.parseInt(m.group(1));
			if (year < 1)
				return null;
			var date = LocalDateTime.of(year, Integer.parseInt(m.group(2)), Integer.parseInt(m.group(3)),
					m.group(4) == null ? 0 : Integer.parseInt(m.group(4)),
					m.group(5) == null ? 0 : Integer.parseInt(m.group(5)),
					m.group(6) == null ? 0 : Integer.parseInt(m.group(6)));
			if (m.group(8) != null)
				date = date.atOffset(ZoneOffset.of(m.group(8))).atZoneSameInstant(plan.zone).toLocalDateTime();
			return plan.date.format(date);
		} catch (RuntimeException invalid) {
			return null;
		}
	}

	static boolean contains(List<?> a, String key) {
		if (a == null)
			return false;
		for (int i = 0; i < a.size(); i++)
			if (key.equals(a.get(i)))
				return true;
		return false;
	}

	static String resolved(Map<?, ?> field) {
		if (field == null)
			return "";
		String type = option(field, "type");
		return List.of("formula", "count", "rollup", "lookup").contains(type)
				? option(field, option(field, "formula_type").equals("array") ? "array_formula_type" : "formula_type")
				: type;
	}

	static String kind(Map<?, ?> field, String type) {
		String f = option(field, "type");
		if (type.equals("rating") || type.equals("boolean"))
			return type;
		if (type.equals("number") || type.equals("autonumber") || List.of("number", "autonumber", "count").contains(f))
			return "number";
		if (type.equals("email") || f.equals("email"))
			return "email";
		if (type.equals("phone_number") || f.equals("phone_number"))
			return "phone_number";
		if (type.equals("date") || List.of("date", "created_on", "last_modified").contains(f))
			return "date";
		if (type.equals("duration") || f.equals("duration"))
			return "duration";
		return type;
	}

	static String timezone(Map<?, ?> field, String fallback) {
		String zone = "";
		for (var key : List.of("date_force_timezone", "date_timezone", "timezone", "date_time_zone")) {
			zone = option(field, key);
			if (!zone.isEmpty())
				break;
		}
		if (zone.isEmpty())
			zone = fallback;
		zone = zone.trim();
		return zone.isEmpty() || zone.equalsIgnoreCase("null") ? "UTC" : zone;
	}

	record Column(Map<?, ?> field, String resolved, String kind, boolean hidden) {
	}

	static final class TablePlan {
		final List<?> names;
		final Object hidden;
		final Map<String, Map<?, ?>> fields = new HashMap<>();
		final Map<String, Column> plans = new HashMap<>();

		TablePlan(Map<?, ?> p) throws JSONException {
			var schemaValue = get(p, "schema");
			var schema = schemaValue == MISSING || nil(schemaValue) ? array()
					: schemaValue instanceof List<?> a ? a : array(schemaValue);
			var namesValue = get(p, "columnNames");
			names = namesValue == MISSING || nil(namesValue) ? null
					: namesValue instanceof List<?> a ? a : array(namesValue);
			hidden = get(p, "hiddenColumns");

			for (int i = 0; i < schema.size(); i++) {
				var field = row(schema.get(i));
				fields.put(js(get(field, "name")), field);
			}

		}
	}

	static Object table(Map<?, ?> p, Control control) throws Exception {
		return table(p, control, null);
	}

	static Object table(Map<?, ?> p, Control control, TablePlan layout) throws Exception {
		var rawRows = get(p, "rows");
		var rows = rawRows == MISSING || nil(rawRows) ? array()
				: rawRows instanceof List<?> a ? a : array(rawRows);
		var bounded = object("rows", rows);
		for (var key : List.of("maxRows", "maxCells"))
			if (p.containsKey(key))
				bounded.put(key, p.get(key));
		check(bounded, 1, control);
		if (layout == null)
			layout = new TablePlan(p);
		var names = layout.names;
		var hidden = layout.hidden;
		var fields = layout.fields;
		var plans = layout.plans;
		boolean lean = truthy(get(p, "valuesOnly"));
		String zone = truthy(get(p, "defaultTimezone")) ? js(get(p, "defaultTimezone")) : "UTC";
		var metadata = Boolean.TRUE.equals(get(p, "includeFields")) ? object() : null;
		var out = array();
		var budget = new Budget(p);
		for (int i = 0; i < rows.size(); i++) {
			if (!control.alive())
				return Boolean.TRUE.equals(get(p, "includeFields"))
						? object("rows", array(), "fields", object())
						: array();
			var source = row(rows.get(i));
			var target = object();
			for (var key : keys(source)) {
				budget.spend();
				var column = plans.get(key);
				if (column == null) {
					var field = names == null || contains(names, key) ? fields.get(key) : null;
					String type = resolved(field);
					column = new Column(field, type, kind(field, type), hidden instanceof List<?> a ? contains(a, key)
							: hidden instanceof String s && s.contains(key));
					if (plans.size() >= 4096)
						plans.clear();
					plans.put(key, column);
				}
				var current = source.get(key);
				var cell = object("displayName", key, "type", "html");
				if (nil(current))
					cell.put("value", null);
				else if (lean) {
					var v = lean(current, column);
					if (v != MISSING)
						cell.put("value", v);
					if (metadata != null && column.field != null && !metadata.containsKey(key))
						metadata.put(key, fieldOptions(column, zone));
				} else {
					var formatted = cell(current, column, false, zone);
					if (formatted.value != MISSING)
						cell.put("value", formatted.value);
					cell.put("displayValue", OPEN + formatted.html);
				}
				if (column.hidden)
					cell.put("hidden", true);
				target.put(key, cell);
			}
			out.add(target);
		}
		return Boolean.TRUE.equals(get(p, "includeFields")) ? object("rows", out, "fields", metadata) : out;
	}

	static Map<?, ?> fieldOptions(Column c, String zone) throws JSONException {
		var out = object("type", option(c.field, "type"));
		var resolved = get(c.field, "formula_type");
		if (!List.of("formula", "count", "rollup", "lookup").contains(option(c.field, "type"))
				|| resolved != MISSING && !nil(resolved))
			out.put("resolvedType", c.resolved);
		for (var key : List.of("date_format", "date_time_format", "duration_format", "number_decimal_places",
				"date_include_time")) {
			var v = get(c.field, key);
			if (v != MISSING && !nil(v))
				out.put(key, js(v));
		}
		if (c.kind.equals("date"))
			out.put("timezone", timezone(c.field, zone));
		return out;
	}

	static Object primitive(Object value) {
		if (value instanceof Map<?, ?> o) {
			var v = get(o, "value");
			if (v != MISSING && !nil(v) && !(v instanceof Map<?, ?>) && !(v instanceof List<?>))
				return v;
			v = get(o, "name");
			if (v != MISSING && !nil(v) && nilOrMissing(get(o, "is_image")) && nilOrMissing(get(o, "url")))
				return v;
		}
		return value;
	}

	static boolean nilOrMissing(Object v) {
		return v == MISSING || nil(v);
	}

	static Object lean(Object value, Column column) throws JSONException {
		if (value instanceof List<?> array) {
			var result = array();
			for (int i = 0; i < array.size(); i++) {
				var v = lean(array.get(i), column);
				result.add(v == MISSING ? null : v);
			}
			return result;
		}
		if (List.of("rating", "boolean", "number", "email", "phone_number", "date", "duration").contains(column.kind))
			return primitive(value);
		return leanAny(value);
	}

	static Object leanAny(Object value) throws JSONException {
		if (value instanceof List<?> array) {
			var result = array();
			for (int i = 0; i < array.size(); i++) {
				var v = leanAny(array.get(i));
				result.add(v == MISSING ? null : v);
			}
			return result;
		}
		if (value instanceof Map<?, ?> object) {
			var v = get(object, "value");
			if (v != MISSING && !nil(v) && (v instanceof Map<?, ?> || v instanceof List<?>))
				return leanAny(v);
			if (!nilOrMissing(v)
					|| !nilOrMissing(get(object, "name")) && nilOrMissing(get(object, "is_image"))
							&& nilOrMissing(get(object, "url"))
					|| !nilOrMissing(get(object, "url")) && !nilOrMissing(get(object, "label"))
							&& nilOrMissing(get(object, "is_image"))
					|| !nilOrMissing(get(object, "is_image")))
				return object;
			return MISSING;
		}
		return value;
	}

	record Cell(Object value, String html) {
	}

	static Cell cell(Object element, Column c, boolean nested, String zone) throws Exception {
		if (element instanceof List<?> values) {
			var result = array();
			var html = new StringBuilder();
			for (int i = 0; i < values.size(); i++) {
				var v = cell(values.get(i), c, true, zone);
				result.add(v.value == MISSING ? null : v.value);
				html.append(v.html);
			}
			return new Cell(result, html + (nested ? "" : CLOSE));
		}
		var primitive = primitive(element);
		String text, html;
		switch (c.kind) {
		case "rating" -> {
			var n = parseInteger(js(primitive));
			if (n == null || n <= 0)
				html = "";
			else {
				if (n > 100000)
					throw new Unsupported();
				html = "<span style=\"color:#f59e0b;letter-spacing:1px\">" + "&#9733;".repeat(n) + "</span>";
			}
		}
		case "boolean" -> html = truth(primitive)
				? "<span style=\"display:inline-flex;width:16px;height:16px;border:1px solid #22c55e;background:#22c55e;border-radius:3px;color:#fff;align-items:center;justify-content:center;font-size:12px;line-height:16px\">&#10003;</span>"
				: "<span style=\"display:inline-flex;width:16px;height:16px;border:1px solid #cbd5e1;background:#fff;border-radius:3px\"></span>";
		case "number" -> {
			text = number(primitive, c.field);
			html = nested ? pill(escape(text), "light-gray") : escape(text);
		}
		case "email" -> {
			text = nil(primitive) ? "" : js(primitive).trim();
			html = text.isEmpty() ? "" : "<a href=\"mailto:" + escape(text) + "\">" + escape(text) + "</a>";
		}
		case "phone_number" -> {
			text = nil(primitive) ? "" : js(primitive).trim();
			String href = text.replaceAll("[^0-9+]", "");
			html = text.isEmpty() ? ""
					: href.isEmpty() ? escape(text) : "<a href=\"tel:" + escape(href) + "\">" + escape(text) + "</a>";
		}
		case "date" -> {
			text = date(primitive, c.field, zone);
			html = nested ? pill(escape(text), "light-gray") : escape(text);
		}
		case "duration" -> {
			text = duration(primitive, c.field);
			html = nested ? pill(escape(text), "light-gray") : escape(text);
		}
		default -> {
			return any(element, nested, c.resolved);
		}
		}
		return new Cell(primitive, html + (nested ? "" : CLOSE));
	}

	static String color(Object value) {
		return COLORS.getOrDefault(js(value), "lightgrey");
	}

	static String pill(Object value, Object color) {
		return "<div style=\"background-color: " + color(color)
				+ ";border-radius: 10px; padding-left: 10px; padding-top: 4px; padding-bottom: 4px; width: fit-content; padding-right: 10px; margin-top: 3px;\">"
				+ js(value) + "</div>";
	}

	static String url(Object raw) {
		String text = nil(raw) ? "" : js(raw).trim();
		if (text.isEmpty())
			return "";
		String href = Pattern.compile("^(https?://|mailto:|tel:)", Pattern.CASE_INSENSITIVE).matcher(text).find() ? text
				: "https://" + text;
		return "<a href=\"" + escape(href) + "\" target=\"_blank\" rel=\"noopener noreferrer\">" + escape(text)
				+ "</a>";
	}

	static Cell any(Object element, boolean nested, String type) throws Exception {
		Object value = element;
		String html = "";
		if (nil(element))
			throw new Unsupported();
		if (element instanceof List<?> array) {
			var result = array();
			var text = new StringBuilder();
			for (int i = 0; i < array.size(); i++) {
				var v = any(array.get(i), true, type);
				result.add(v.value == MISSING ? null : v.value);
				text.append(v.html);
			}
			value = result;
			html = text.toString();
		} else if (element instanceof Map<?, ?> o) {
			var v = get(o, "value");
			if (!nilOrMissing(v) && (v instanceof Map<?, ?> || v instanceof List<?>)) {
				var result = any(v, true, type);
				html = result.html;
				value = result.value;
			} else if (!nilOrMissing(v))
				html = type.equals("url") ? url(v) : pill(v, get(o, "color"));
			else if (!nilOrMissing(get(o, "name")) && nilOrMissing(get(o, "is_image")) && nilOrMissing(get(o, "url")))
				html = pill(get(o, "name"), get(o, "color"));
			else if (!nilOrMissing(get(o, "url")) && !nilOrMissing(get(o, "label")) && nilOrMissing(get(o, "is_image")))
				html = "<div style=\"background-color: " + color("light-blue")
						+ ";border-radius: 10px; padding-left: 10px; padding-top: 4px; padding-bottom: 4px; width: fit-content; padding-right: 10px; margin-top: 3px; cursor:pointer\"><a  href=\""
						+ js(get(o, "url")) + "\" target=\"_blank\">" + js(get(o, "label")) + "</a></div>";
			else if (!nilOrMissing(get(o, "is_image")))
				html = (Boolean.TRUE.equals(get(o, "is_image"))
						|| get(o, "is_image") instanceof Number n && n.doubleValue() == 1
						|| "1".equals(get(o, "is_image")))
								? "<img style='width: 100%; margin-top: 5px; margin-bottom: 5px; border-radius: 3px; box-shadow: 0px 8px 9px -4px rgba(0,0,0,0.73);' src=\""
										+ js(get(o, "url")) + "\" ></img>"
								: "<p style='background-color : lightgray;' ><a  href=\"" + js(get(o, "url"))
										+ "\" target=\"_blank\" download=\"" + js(get(o, "visible_name")) + "\">"
										+ js(get(o, "visible_name")) + "</a></p>";
			else
				throw new Unsupported();
		} else
			html = type.equals("url") ? url(element) : js(element);
		return new Cell(value, html + (nested ? "" : CLOSE));
	}

	static String number(Object value, Map<?, ?> field) {
		if (nil(value) || "".equals(value) || Boolean.FALSE.equals(value)
				|| value instanceof Number n && n.doubleValue() == 0)
			return "";
		String text = js(value), source = text.replaceFirst(",", ".");
		if (!DECIMAL.matcher(source).matches())
			return text;
		double number = Double.parseDouble(source);
		if (!Double.isFinite(number))
			throw new Unsupported();
		Integer places = parseInteger(option(field, "number_decimal_places"));
		if (places == null) {
			if (List.of("autonumber", "count").contains(option(field, "type")))
				places = 0;
			else
				return text;
		}
		return fixed(number, Math.max(0, Math.min(20, places)));
	}

	static String date(Object value, Map<?, ?> field, String fallback) {
		if (nil(value) || "".equals(value) || Boolean.FALSE.equals(value)
				|| value instanceof Number n && n.doubleValue() == 0)
			return "";
		String raw = js(value);
		String year, month, day;
		int hours = 0, minutes = 0;
		var only = Pattern.compile("^(\\d{4})-(\\d{2})-(\\d{2})$").matcher(raw);
		if (only.matches()) {
			year = only.group(1);
			month = only.group(2);
			day = only.group(3);
		} else {
			try {
				String normalized = raw.replaceFirst(" ", "T").replaceFirst("([+-]\\d{2})(\\d{2})$", "$1:$2");
				ZoneId zone = ZoneId.of(timezone(field, fallback));
				LocalDateTime time;
				if (Pattern.compile("[zZ]$|[+-]\\d{2}:?\\d{2}$").matcher(normalized).find())
					time = OffsetDateTime.parse(normalized).atZoneSameInstant(zone).toLocalDateTime();
				else
					time = LocalDateTime.parse(normalized);
				year = String.valueOf(time.getYear());
				month = pad(time.getMonthValue(), 2);
				day = pad(time.getDayOfMonth(), 2);
				hours = time.getHour();
				minutes = time.getMinute();
			} catch (RuntimeException invalid) {
				throw new Unsupported();
			} // The JS reference owns legacy Date.parse formats.
		}
		String format = option(field, "date_format").toUpperCase(Locale.ROOT),
				text = (format.equals("EU") || format.equals("EUROPEAN")) ? day + "/" + month + "/" + year
						: format.equals("US") ? month + "/" + day + "/" + year : year + "-" + month + "-" + day;
		Object include = field == null ? MISSING : get(field, "date_include_time");
		if (truth(include) || nilOrMissing(include) && Pattern.compile("[T\\s]\\d{2}:\\d{2}").matcher(raw).find()) {
			if (option(field, "date_time_format").contains("12"))
				text += " " + (hours % 12 == 0 ? 12 : hours % 12) + ":" + pad(minutes, 2)
						+ (hours >= 12 ? " PM" : " AM");
			else
				text += " " + pad(hours, 2) + ":" + pad(minutes, 2);
		}
		return text;
	}

	static String duration(Object value, Map<?, ?> field) {
		if (nil(value) || "".equals(value) || Boolean.FALSE.equals(value)
				|| value instanceof Number n && n.doubleValue() == 0)
			return "";
		String text = js(value), source = text.replaceFirst(",", ".");
		if (!DECIMAL.matcher(source).matches())
			return text;
		double secondsValue = Double.parseDouble(source);
		if (!Double.isFinite(secondsValue) || Math.abs(secondsValue) > Long.MAX_VALUE / 1000.0)
			throw new Unsupported();
		String sign = secondsValue < 0 ? "-" : "";
		long ms = Math.round(Math.abs(secondsValue) * 1000), secondsTotal = ms / 1000, milliseconds = ms % 1000,
				days = secondsTotal / 86400, hoursTotal = secondsTotal / 3600, hours = secondsTotal % 86400 / 3600,
				minutes = secondsTotal % 3600 / 60, seconds = secondsTotal % 60;
		String format = option(field, "duration_format");
		if (format.isEmpty())
			format = "h:mm:ss";
		if (format.equals("d h"))
			return sign + days + "d " + hours + "h";
		if (format.equals("d h m"))
			return sign + days + "d " + hours + "h " + minutes + "m";
		if (format.equals("d h m s"))
			return sign + days + "d " + hours + "h " + minutes + "m " + seconds + "s";
		int digits = format.contains(".sss") ? 3 : format.contains(".ss") ? 2 : format.contains(".s") ? 1 : 0;
		String sec = pad(seconds, 2) + (digits == 0 ? "" : "." + pad(milliseconds, 3).substring(0, digits));
		return sign + (format.startsWith("d h:mm") ? days + "d " + hours : hoursTotal) + ":" + pad(minutes, 2)
				+ (format.contains(":ss") ? ":" + sec : "");
	}
}
