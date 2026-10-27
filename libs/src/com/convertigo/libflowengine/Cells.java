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

/** Typed text cells, and the table profile of the native JSON steps (BaserowCellFormat). */
final class Cells {
	static final Pattern DECIMAL = Pattern.compile("^-?\\d+(\\.\\d+)?$");
	static final Pattern ISO = Pattern.compile(
			"^([0-9]{4})-([0-9]{2})-([0-9]{2})(?:T([0-9]{2}):([0-9]{2})(?::([0-9]{2})(\\.[0-9]{1,3})?)?(Z|[+-][0-9]{2}:[0-9]{2})?)?$");

	static String escape(String text) {
		return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
	}

	static boolean truthy(Object value) {
		return value != MISSING && !nil(value) && !Boolean.FALSE.equals(value)
				&& !(value instanceof String s && s.isEmpty())
				&& !(value instanceof Number n && (n.doubleValue() == 0 || Double.isNaN(n.doubleValue())));
	}

	static String fixed(double value, int digits) {
		if (Math.abs(value) >= 1e21)
			return ScriptRuntime.numberToString(value, 10);
		if (value == Math.rint(value) && Math.abs(value) < 1e15) {
			// an integer: the same text as its exact decimal expansion, without BigDecimal
			String integer = Long.toString((long) value);
			return digits == 0 ? integer : integer + "." + "0".repeat(digits);
		}
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

	static final class Column {
		final Map<?, ?> field;
		final boolean hidden;
		Boolean leanTyped;

		Column(Map<?, ?> field, boolean hidden) {
			this.field = field;
			this.hidden = hidden;
		}
	}

	static final class TablePlan {
		final List<?> names;
		final Object hidden;
		final Map<String, Map<?, ?>> fields = new HashMap<>();

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

	/** The table profile: the cells of the native JSON steps (BaserowCellFormat), the reference kernel without it. */
	static Object table(Map<?, ?> p, Control control, TablePlan layout) throws Exception {
		if (!Baserow.AVAILABLE)
			throw new Unsupported();
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
		// a column plan per call: a TablePlan can be shared by the threads of a row producer
		var plans = new HashMap<String, Column>();
		boolean lean = truthy(get(p, "valuesOnly"));
		String zone = truthy(get(p, "defaultTimezone")) ? js(get(p, "defaultTimezone")) : "UTC";
		var metadata = Boolean.TRUE.equals(get(p, "includeFields")) ? object() : null;
		var budget = new Budget(p);
		var format = new Baserow(zone);
		// a date of an unknown form is read by a script Date: a row producer thread needs a context of its own
		var entered = org.mozilla.javascript.Context.getCurrentContext() == null;
		if (entered)
			org.mozilla.javascript.Context.enter();
		try {
			return tableRows(p, rows, layout, plans, lean, metadata, budget, format, control);
		} finally {
			if (entered)
				org.mozilla.javascript.Context.exit();
		}
	}

	private static Object tableRows(Map<?, ?> p, List<?> rows, TablePlan layout, Map<String, Column> plans, boolean lean,
			Map<String, Object> metadata, Budget budget, Baserow format, Control control) throws Exception {
		var names = layout.names;
		var hidden = layout.hidden;
		var fields = layout.fields;
		var out = array();
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
					column = new Column(field, hidden instanceof List<?> a ? contains(a, key)
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
					if (column.leanTyped == null)
						column.leanTyped = Baserow.leanTyped(column.field);
					cell.put("value", Baserow.leanValue(current, column.leanTyped));
					if (metadata != null && column.field != null && !metadata.containsKey(key))
						metadata.put(key, format.leanFieldOptions(column.field));
				} else {
					var html = new StringBuilder(256);
					cell.put("value", format.cell(current, column.field, html));
					cell.put("displayValue", html.toString());
				}
				if (column.hidden)
					cell.put("hidden", true);
				target.put(key, cell);
			}
			out.add(target);
		}
		return Boolean.TRUE.equals(get(p, "includeFields")) ? object("rows", out, "fields", metadata) : out;
	}

	/** The cell format of the engine, absent from an older engine: never loaded when it is absent. */
	static final class Baserow {
		static final boolean AVAILABLE = present();
		private final com.twinsoft.convertigo.engine.json.BaserowCellFormat format;

		static boolean present() {
			try {
				Class.forName("com.twinsoft.convertigo.engine.json.BaserowCellFormat", false, Cells.class.getClassLoader());
				return true;
			} catch (ClassNotFoundException | LinkageError absent) {
				return false;
			}
		}

		Baserow(String zone) {
			format = new com.twinsoft.convertigo.engine.json.BaserowCellFormat(zone, null, null);
		}

		Object cell(Object value, Map<?, ?> field, StringBuilder html) throws Exception {
			html.append(com.twinsoft.convertigo.engine.json.BaserowCellFormat.BASE_HTML);
			return format.format(value, field, false, html);
		}

		Map<String, Object> leanFieldOptions(Map<?, ?> field) {
			return format.leanFieldOptions(field);
		}

		static boolean leanTyped(Map<?, ?> field) {
			return com.twinsoft.convertigo.engine.json.BaserowCellFormat.isLeanTyped(field);
		}

		static Object leanValue(Object value, boolean typed) {
			return com.twinsoft.convertigo.engine.json.BaserowCellFormat.leanValue(value, typed);
		}
	}
}
