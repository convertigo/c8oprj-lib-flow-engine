// Conversion to declared types (type-conversion.js), for the inputs of a Flow whatever the caller, and the checks of
// the sources that no longer warn about what the runtime converts.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var __flowEngineDir = engineDir;
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("lib-flow-engine-type-conversion").toFile().getAbsolutePath());
var engine = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
var tc = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, "modules/type-conversion.js"), "UTF-8")));

function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

function eq(actual, expected, message) {
	assertTrue(JSON.stringify(actual) === JSON.stringify(expected), message + ": " + JSON.stringify(actual) + " != " + JSON.stringify(expected));
}

function value(v, type, extra) {
	var schema = extra || {};
	schema.type = type;
	var out = tc.convert(v, schema);
	assertTrue(out.ok, "should convert " + JSON.stringify(v) + " to " + type + ": " + out.message);
	return out.value;
}

function refused(v, type) {
	assertTrue(!tc.convert(v, { type: type }).ok, "should refuse " + JSON.stringify(v) + " as " + type);
}

// the table of the specification
eq(value(42, "string"), "42", "number to text");
eq(value(true, "string"), "true", "boolean to text");
eq(value({ a: [1, 2] }, "string"), "{\"a\":[1,2]}", "object to compact JSON");
eq(value("42", "integer"), 42, "text to integer");
eq(value(42.0, "integer"), 42, "42.0 to integer");
eq(value(-4.7, "integer"), -4, "truncation toward zero");
eq(value("4.7", "integer"), 4, "decimal text truncated");
refused("abc", "integer");
eq(value("4.2", "number"), 4.2, "text to number");
refused("4,2", "number");
eq(value("TRUE", "boolean"), true, "case insensitive");
eq(value("0", "boolean"), false, "0");
eq(value(1, "boolean"), true, "1");
refused("yes", "boolean");
refused(2, "boolean");
eq(value("x", "array"), ["x"], "one value to an array");
eq(value("[\"a\",\"b\"]", "array"), ["a", "b"], "JSON array text");
eq(value(["1", "2"], "array", { items: { type: "integer" } }), [1, 2], "items converted");
eq(value("{\"a\":1}", "object"), { a: 1 }, "JSON object text");
refused("a", "object");
refused([1], "object");
eq(value({ a: 1 }, "any"), { a: 1 }, "any: no conversion");
eq(value("12", "integer|string"), "12", "a union keeps a value already of one of its types");
var big = tc.convert("9007199254740993", { type: "integer" });
assertTrue(big.ok && big.value === "9007199254740993" && /2\^53/.test(big.warning), "a number beyond 2^53 stays text: " + JSON.stringify(big));
eq(value("", "string"), "", "\"\" is a text");
refused("", "number");
assertTrue(tc.convertible("number", "string") && tc.convertible("string", "object") && tc.convertible("array", "string") &&
	!tc.convertible("number", "object") && !tc.convertible("object", "number"), "convertible pairs");

// inputs of a Flow
function flow(inputs, body) {
	return "const _flow = { sourceVersion: 2, inputs: " + JSON.stringify(inputs) + " }\n\nfunction Probe({ input, config, result }) {\n" + body + "\n}\n";
}

function run(inputs, body, input) {
	return JSON.parse(engine.run(JSON.stringify({ flowSource: flow(inputs, body), input: input, includeTrace: false })));
}

var declared = {
	count: { type: "integer" },
	ratio: { type: "number" },
	enabled: { type: "boolean", default: false },
	tags: { type: "array", items: { type: "string" } },
	filter: { type: "object" },
	label: { type: "string" },
	limit: { type: "integer", default: 10 },
	note: { type: "string", nullable: true }
};
var body = "  return { count: input.count, ratio: input.ratio, enabled: input.enabled, tags: input.tags, filter: input.filter, label: input.label, limit: input.limit, note: input.note }";
var out = run(declared, body, { count: "3.9", ratio: "0.5", enabled: "TRUE", tags: "solo", filter: "{\"id\":7}", label: 12, note: null });
assertTrue(out.ok, "typed inputs: " + JSON.stringify(out));
eq(out.result, { count: 3, ratio: 0.5, enabled: true, tags: ["solo"], filter: { id: 7 }, label: "12", limit: 10, note: null }, "inputs converted, default given");
var empty = run(declared, body, { count: "", limit: "" });
assertTrue(empty.ok && empty.result.count === undefined && empty.result.limit === 10, "\"\" for a number is absent, then the default: " + JSON.stringify(empty));
var bad = run(declared, body, { count: "many" });
assertTrue(!bad.ok && bad.error.code === "FLOW_INPUT_TYPE_INVALID" && /count/.test(bad.error.message), "a value that does not convert: " + JSON.stringify(bad));
var nul = run(declared, body, { label: null, count: "null", note: null });
assertTrue(nul.ok && nul.result.label === undefined && nul.result.count === undefined && nul.result.note === null,
	"null is kept with nullable, else absent; the text null of a form parameter is null: " + JSON.stringify(nul));
var nullDefault = run(declared, body, { enabled: null, limit: "null" });
assertTrue(nullDefault.ok && nullDefault.result.enabled === false && nullDefault.result.limit === 10, "null takes the default: " + JSON.stringify(nullDefault));
var requiredNull = run({ id: { type: "integer", required: true } }, "  return { id: input.id }", { id: null });
assertTrue(!requiredNull.ok && requiredNull.error.code === "FLOW_INPUT_REQUIRED", "a required input cannot be null: " + JSON.stringify(requiredNull));
var required = run({ id: { type: "string", required: true } }, "  return { id: input.id }", {});
assertTrue(!required.ok && required.error.code === "FLOW_INPUT_REQUIRED", "a required input: " + JSON.stringify(required));
var strict = run({ n: { type: "number" } }, "  return { same: input.n === 4 }", { n: "4" });
assertTrue(strict.ok && strict.result.same === true, "=== compares the converted value: " + JSON.stringify(strict));

// the checks do not warn about what the runtime converts
function warnings(code) {
	var checked = JSON.parse(engine.flowSourceValidate(JSON.stringify({ name: "Probe", code: code })));
	return (checked.diagnostics || []).filter(function (d) { return d.severity === "warning"; }).map(function (d) { return d.code; });
}
var textInputs = flow({ n: { type: "string" }, items: { type: "string" } },
	"  local.sum = number.add({ left: input.n, right: 1 })\n  local.first = list.take({ items: input.items, count: 1 })\n  return { sum: local.sum, first: local.first }");
var found = warnings(textInputs);
assertTrue(found.indexOf("FLOWSCRIPT_PROPERTY_TYPE_MISMATCH") === -1 && found.indexOf("FLOWSCRIPT_EXPECTED_ARRAY") === -1,
	"a text converts to a number and to an array: " + JSON.stringify(found));
var objectInput = flow({ o: { type: "object" } }, "  local.first = list.take({ items: input.o, count: 1 })\n  return { first: local.first }");
assertTrue(warnings(objectInput).indexOf("FLOWSCRIPT_EXPECTED_ARRAY") !== -1, "an object where an array is expected still warns");

print("type conversion: ok");
