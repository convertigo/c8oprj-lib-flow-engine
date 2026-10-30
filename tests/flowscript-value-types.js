// Type errors in FlowScript name the type received. An input declared array receiving the text "1,2" is a list of one
// item, said in the warnings of the run; a text method called on a list (split on input.ids) fails with
// EXPRESSION_METHOD_TYPE_MISMATCH instead of "Unsupported method", and code-check refuses it on an input declared array
// (the symmetric list method on an input declared string too) and warns on a path whose schema tells the type; a method
// called on an absent value gives undefined with a warning; includes on a list is the one of the list, never of its text.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var __flowEngineDir = engineDir;
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("flowscript-value-types").toFile().getAbsolutePath());
var engine = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function flow(body) {
	return "const _flow = { sourceVersion: 2, inputs: { ids: { type: \"array\" }, q: { type: \"string\" }, n: { type: \"integer\" }, " +
		"numbers: { type: \"array\", items: { type: \"integer\" } }, raw: { type: \"any\" } } }\nfunction Probe({ input, config, result }) {\n" + body + "\n}\n";
}
function run(body, input) { return JSON.parse(engine.run(JSON.stringify({ flowSource: flow(body), input: input || {}, includeTrace: false }))); }
function check(body) { return JSON.parse(engine.flowSourceValidate(JSON.stringify({ code: flow(body), name: "Probe" }))); }
function diagnostic(validation, code) {
	return (validation.diagnostics || []).filter(function (item) { return item.code === code; })[0];
}

// An input declared array.
var wrapped = run("  result.ids = input.ids", { ids: "1,2" });
assert(wrapped.ok === true && JSON.stringify(wrapped.result.ids) === "[\"1,2\"]", "a text is a list of one item: " + JSON.stringify(wrapped));
var converted = (wrapped.warnings || [])[0] || {};
assert(converted.code === "FLOW_INPUT_CONVERTED" && converted.path === "input.ids" && /received the text "1,2": it is a list of one item/.test(converted.message),
	"which the run says: " + JSON.stringify(wrapped.warnings));
var single = run("  result.ids = input.ids", { ids: "42" });
assert(single.ok === true && JSON.stringify(single.result.ids) === "[\"42\"]" && single.warnings === undefined, "a parameter sent once is a list without warning");
assert(JSON.stringify(run("  result.ids = input.ids", { ids: "[\"1\",\"2\"]" }).result.ids) === "[\"1\",\"2\"]", "a JSON array text is a list");
var typedItems = run("  result.numbers = input.numbers", { numbers: "1,2" });
assert(typedItems.ok === false && typedItems.error.code === "FLOW_INPUT_TYPE_INVALID" && /received the text "1,2"/.test(typedItems.error.message),
	"typed items refuse it, naming the text: " + JSON.stringify(typedItems));

// A text method on a list, at run time.
var split = run("  result.parts = input.ids.split(\",\")", { ids: ["1", "2"] });
assert(split.ok === false && split.error.code === "EXPRESSION_METHOD_TYPE_MISMATCH" &&
	split.error.message === "split is a text method, the value of input.ids is a list ([\"1\",\"2\"])." && /already a list/.test(split.error.hint),
	"split on a list names the type received: " + JSON.stringify(split));
var trimmed = run("  result.t = input.raw.trim()", { raw: ["a"] });
assert(trimmed.ok === false && trimmed.error.code === "EXPRESSION_METHOD_TYPE_MISMATCH" && /trim is a text method, the value of input\.raw is a list/.test(trimmed.error.message),
	"trim of a list is no longer the trim of its text: " + JSON.stringify(trimmed));
var joined = run("  result.j = input.raw.join(\"-\")", { raw: "a,b" });
assert(joined.ok === false && /join is a list method, the value of input\.raw is a text\./.test(joined.error.message), "join on a text too: " + JSON.stringify(joined));
var objectTrim = run("  result.t = input.raw.toLowerCase()", { raw: { a: 1 } });
assert(objectTrim.ok === false && /toLowerCase is a text method, the value of input\.raw is an object/.test(objectTrim.error.message), "an object: " + JSON.stringify(objectTrim));
var includes = run("  result.a = input.raw.includes(\"a\")\n  result.comma = input.raw.includes(\",\")", { raw: ["a", "b"] });
assert(includes.ok === true && includes.result.a === true && includes.result.comma === false, "includes of a list is the one of the list: " + JSON.stringify(includes));
var chained = run("  result.c = input.q.trim().split(\" \").join(\"-\")", { q: " a b " });
assert(chained.ok === true && chained.result.c === "a-b", "chains keep working: " + JSON.stringify(chained));
var refused = run("  result.x = input.q.trim().constructor(\"x\")", { q: "a" });
assert(refused.ok === false && refused.error.code === "INVALID_EXPRESSION" && /Unsupported method in an expression: constructor/.test(refused.error.message),
	"a method outside the lists stays unsupported");

// A method on an absent value.
var absent = run("  result.parts = input.raw.split(\",\")\n  result.low = input.q.toLowerCase()", {});
assert(absent.ok === true && absent.result.parts === undefined && absent.result.low === "", "absent values give undefined and \"\": " + JSON.stringify(absent));
var codes = (absent.warnings || []).map(function (warning) { return warning.path + ":" + warning.method + ":" + warning.value; }).sort().join();
assert(codes === "input.q:toLowerCase:undefined,input.raw:split:undefined" && /split\(\) is called on input\.raw, which is absent \(undefined\): the expression gives undefined/.test(
	absent.warnings.filter(function (warning) { return warning.method === "split"; })[0].message), "both are warnings of the run: " + JSON.stringify(absent.warnings));
var repeated = run("  forEach({\n    items: input.ids,\n    $$nodes: function () {\n      local.x = input.raw.trim()\n    },\n  })", { ids: ["a", "b", "c"] });
assert(repeated.ok === true && repeated.warnings.length === 1 && repeated.warnings[0].count === 3, "a warning repeated in a loop is counted once: " + JSON.stringify(repeated.warnings));

// code-check.
var onArrayInput = check("  result.parts = input.ids.split(\",\")");
var listError = diagnostic(onArrayInput, "FLOWSCRIPT_TEXT_METHOD_ON_LIST");
assert(onArrayInput.ok === false && listError && listError.severity === "error" && listError.path === "input.ids" && listError.method === "split" &&
	listError.message === "split is a text method, but input.ids is a list (declared array)." && /already a list/.test(listError.next),
	"code-check refuses a text method on an input declared array: " + JSON.stringify(onArrayInput.diagnostics));
var onTextInput = check("  result.j = input.q.join(\"-\")");
var textError = diagnostic(onTextInput, "FLOWSCRIPT_LIST_METHOD_ON_TEXT");
assert(onTextInput.ok === false && textError && textError.severity === "error" && textError.path === "input.q",
	"and a list method on an input declared string: " + JSON.stringify(onTextInput.diagnostics));
var onSchema = check("  local.sorted = list.sort({items: input.ids})\n  result.l = local.sorted.toLowerCase()");
var schemaWarning = diagnostic(onSchema, "FLOWSCRIPT_TEXT_METHOD_ON_LIST");
assert(onSchema.ok === true && schemaWarning && schemaWarning.severity === "warning" && schemaWarning.path === "local.sorted" &&
	/its schema says array/.test(schemaWarning.message), "a warning where the schema of the analysis tells the type: " + JSON.stringify(onSchema.diagnostics));
var fine = check("  result.n = input.ids.length\n  result.has = input.ids.includes(\"a\")\n  result.parts = input.q.split(\",\")\n  result.j = input.ids.join(\",\")");
assert(fine.ok === true && !diagnostic(fine, "FLOWSCRIPT_TEXT_METHOD_ON_LIST") && !diagnostic(fine, "FLOWSCRIPT_LIST_METHOD_ON_TEXT"),
	"methods of both types and methods of the right type pass: " + JSON.stringify(fine.diagnostics));
print("flowscript-value-types OK (" + checks + " checks)");
