/*
 * Conversion of a value to a declared type, the same everywhere a Flow receives a value (inputs over HTTP, through the
 * MCP or a Flow call):
 *
 *   string   number, boolean -> text; object, array -> compact JSON (never [object Object])
 *   integer  "42", 42.0 -> 42; a decimal number is truncated toward zero, as a Java cast (-4.7 -> -4)
 *   number   "4.2", 42 -> number
 *   boolean  true / false / 1 / 0, case insensitive
 *   array    an array, its items converted; a JSON array text -> array; one value -> [value]
 *   object   an object; a JSON object text -> object
 *   any, unknown or no type: no conversion
 *
 * A number above 2^53 written as text stays text (it would lose digits), with a warning. Absence and null are left to
 * the caller (default value, nullable), "" is a text like any other.
 *
 * convert(value, schema) -> { ok: true, value, warning? } or { ok: false, message }.
 */
(function () {
	var MAX_SAFE = 9007199254740991;
	var NUMBER_TEXT = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

	function kindOf(value) {
		if (value === null) {
			return "null";
		}
		if (Object.prototype.toString.call(value) === "[object Array]") {
			return "array";
		}
		return typeof value;
	}

	function types(schema) {
		var type = schema && schema.type;
		if (Object.prototype.toString.call(type) === "[object Array]") {
			return type.map(String);
		}
		type = String(type || "").trim();
		return type ? type.split("|").map(function (part) { return part.trim(); }) : [];
	}

	function ok(value, warning) {
		return warning ? { ok: true, value: value, warning: warning } : { ok: true, value: value };
	}

	function fail(message) {
		return { ok: false, message: message };
	}

	function describe(value) {
		var kind = kindOf(value);
		return kind === "string" ? "the text \"" + (value.length > 40 ? value.substring(0, 40) + "…" : value) + "\"" : "a value of type " + kind;
	}

	function parseJson(text, kind) {
		var trimmed = text.trim();
		if (kind === "array" ? trimmed.charAt(0) !== "[" : trimmed.charAt(0) !== "{") {
			return undefined;
		}
		try {
			var parsed = JSON.parse(trimmed);
			return kindOf(parsed) === kind ? parsed : undefined;
		} catch (e) {
			return undefined;
		}
	}

	function toNumber(value, integer) {
		var kind = kindOf(value);
		var number;
		if (kind === "number") {
			number = value;
		} else if (kind === "string" && NUMBER_TEXT.test(value.trim())) {
			number = Number(value.trim());
			if (Math.abs(number) > MAX_SAFE && /^[+-]?\d+$/.test(value.trim())) {
				return ok(value.trim(), "The number " + value.trim() + " is beyond 2^53: it stays text to keep its digits.");
			}
		} else {
			return fail("Expected " + (integer ? "an integer" : "a number") + ", received " + describe(value) + ".");
		}
		if (!isFinite(number)) {
			return fail("Expected a finite number, received " + describe(value) + ".");
		}
		return ok(integer ? (number < 0 ? Math.ceil(number) : Math.floor(number)) : number);
	}

	function toBoolean(value) {
		var kind = kindOf(value);
		if (kind === "boolean") {
			return ok(value);
		}
		if (kind === "number" && (value === 0 || value === 1)) {
			return ok(value === 1);
		}
		if (kind === "string") {
			var text = value.trim().toLowerCase();
			if (text === "true" || text === "1") {
				return ok(true);
			}
			if (text === "false" || text === "0") {
				return ok(false);
			}
		}
		return fail("Expected a boolean (true, false, 1 or 0), received " + describe(value) + ".");
	}

	function toText(value) {
		var kind = kindOf(value);
		if (kind === "string") {
			return ok(value);
		}
		if (kind === "number" || kind === "boolean") {
			return ok(String(value));
		}
		if (kind === "object" || kind === "array") {
			return ok(JSON.stringify(value));
		}
		return fail("Expected a text, received " + describe(value) + ".");
	}

	function toArray(value, schema) {
		var items = kindOf(value) === "array" ? value
			: kindOf(value) === "string" && parseJson(value, "array") !== undefined ? parseJson(value, "array")
			: [value];
		var out = [];
		var warning;
		for (var i = 0; i < items.length; i++) {
			var item = schema && schema.items ? convert(items[i], schema.items) : ok(items[i]);
			if (!item.ok) {
				return fail("Item " + i + ": " + item.message);
			}
			warning = warning || item.warning;
			out.push(item.value);
		}
		return ok(out, warning);
	}

	function toObject(value) {
		var kind = kindOf(value);
		if (kind === "object") {
			return ok(value);
		}
		if (kind === "string") {
			var parsed = parseJson(value, "object");
			if (parsed !== undefined) {
				return ok(parsed);
			}
		}
		return fail("Expected an object, received " + describe(value) + ".");
	}

	function convertTo(type, value, schema) {
		switch (type) {
			case "string":
				return toText(value);
			case "integer":
				return toNumber(value, true);
			case "number":
				return toNumber(value, false);
			case "boolean":
				return toBoolean(value);
			case "array":
				return toArray(value, schema);
			case "object":
				return toObject(value);
			case "null":
				return value === null ? ok(null) : fail("Expected null, received " + describe(value) + ".");
			default:
				return ok(value);
		}
	}

	function convert(value, schema) {
		var declared = types(schema).filter(function (type) { return type !== "any" && type !== "unknown"; });
		if (!declared.length || types(schema).indexOf("any") !== -1 || types(schema).indexOf("unknown") !== -1) {
			return ok(value);
		}
		var kind = kindOf(value);
		// a value already of one of the types is kept, before any conversion
		for (var i = 0; i < declared.length; i++) {
			if (declared[i] === kind || declared[i] === "number" && kind === "number" ||
					declared[i] === "integer" && kind === "number" && Math.floor(value) === value) {
				return convertTo(declared[i], value, schema);
			}
		}
		var first;
		for (var j = 0; j < declared.length; j++) {
			var converted = convertTo(declared[j], value, schema);
			if (converted.ok) {
				return converted;
			}
			first = first || converted;
		}
		return first;
	}

	// Whether a value of the source type converts to the declared type (checks of the sources).
	function convertible(expectedType, actualType) {
		var expected = types({ type: expectedType });
		var actual = String(actualType || "").trim();
		if (!expected.length || !actual || actual === "unknown" || actual === "any" ||
				expected.indexOf("any") !== -1 || expected.indexOf("unknown") !== -1) {
			return true;
		}
		return expected.some(function (type) {
			if (type === actual || type === "number" && actual === "integer" || type === "integer" && actual === "number") {
				return true;
			}
			if (type === "string") {
				return actual !== "null";
			}
			if (type === "number" || type === "integer" || type === "boolean") {
				return actual === "string" || type === "boolean" && (actual === "number" || actual === "integer");
			}
			if (type === "object") {
				return actual === "string";
			}
			if (type === "array") {
				return actual !== "null";
			}
			return false;
		});
	}

	return { convert: convert, convertible: convertible, types: types };
}())
