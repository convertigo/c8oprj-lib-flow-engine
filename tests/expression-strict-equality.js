var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var engineFile = new java.io.File(engineDir, "Engine.js");
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(engineFile, "UTF-8"));
var projectRoot = java.nio.file.Files.createTempDirectory("lib-flow-engine-strict-equality");
var __flowEngineDir = engineDir;
var __flowProjectDir = String(projectRoot.toFile().getAbsolutePath());
// A project block writing Rhino Java wrappers, created before the engine loads its catalog.
var blocksDir = projectRoot.resolve("_flow/blocks/probe");
java.nio.file.Files.createDirectories(blocksDir);
java.nio.file.Files.writeString(blocksDir.resolve("javaValues.block.js"), [
	"const _meta = {",
	"  \"version\": 1,",
	"  \"description\": \"Compares Java wrapped values with FlowScript strict equality.\",",
	"  \"runtime\": \"rhino\",",
	"}",
	"",
	"(function () {",
	"\treturn {",
	"\t\trun: function (ctx, node) {",
	"\t\t\tctx.scopes.local.javaText = new java.lang.String(\"0\");",
	"\t\t\tctx.scopes.local.javaZero = new java.lang.Integer(0);",
	"\t\t\tctx.scopes.local.javaFalse = new java.lang.Boolean(false);",
	"\t\t\treturn {",
	"\t\t\t\ttextIsText: ctx.expr(\"local.javaText === \\\"0\\\"\"),",
	"\t\t\t\tzeroIsZero: ctx.expr(\"local.javaZero === 0\"),",
	"\t\t\t\tzeroIsNotEmpty: ctx.expr(\"local.javaZero !== \\\"\\\"\"),",
	"\t\t\t\tfalseIsFalse: ctx.expr(\"local.javaFalse === false\"),",
	"\t\t\t\tfalseIsNotZero: ctx.expr(\"local.javaFalse !== 0\")",
	"\t\t\t};",
	"\t\t}",
	"\t};",
	"}())",
	""
].join("\n"));
var engine = eval(source);

function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

function run(flowSource, input) {
	var response = JSON.parse(engine.run(JSON.stringify({ flowSource: flowSource, input: input, includeTrace: false })));
	assertTrue(response.ok === true, "Flow run failed: " + JSON.stringify(response));
	return response.result;
}

// FlowScript === and !== keep JavaScript strict equality: 0, false, "" and null stay distinct.
var semantics = run([
	"function StrictEquality({ input, result }) {",
	"  result.zeroIsEmpty = input.zero === \"\"",
	"  result.zeroIsNotEmpty = input.zero !== \"\"",
	"  result.zeroIsText = input.zero === \"0\"",
	"  result.zeroIsZero = input.zero === 0",
	"  result.falseIsEmpty = input.no === \"\"",
	"  result.falseIsZero = input.no === 0",
	"  result.falseIsFalse = input.no === false",
	"  result.emptyIsZero = input.empty === 0",
	"  result.emptyIsEmpty = input.empty === \"\"",
	"  result.nullIsUndefined = input.nil === undefined",
	"  result.missingIsUndefined = input.missing === undefined",
	"  result.textIsNumber = input.text === 0",
	"  result.looseZeroIsEmpty = input.zero == \"\"",
	"  result.looseNullIsUndefined = input.nil == undefined",
	"  result.looseTextIsNotNumber = input.text != 0",
	"  return result",
	"}",
	""
].join("\n"), { zero: 0, no: false, empty: "", nil: null, text: "0" });
var expected = {
	zeroIsEmpty: false,
	zeroIsNotEmpty: true,
	zeroIsText: false,
	zeroIsZero: true,
	falseIsEmpty: false,
	falseIsZero: false,
	falseIsFalse: true,
	emptyIsZero: false,
	emptyIsEmpty: true,
	nullIsUndefined: false,
	missingIsUndefined: true,
	textIsNumber: false,
	// == and != keep JavaScript loose equality.
	looseZeroIsEmpty: true,
	looseNullIsUndefined: true,
	looseTextIsNotNumber: false
};
Object.keys(expected).forEach(function (key) {
	assertTrue(semantics[key] === expected[key],
		"FlowScript " + key + " should be " + expected[key] + ": " + JSON.stringify(semantics));
});

// The default guard of a Flow input must keep an explicit 0 (MCP code-run sends JSON numbers),
// in a value expression and in an if condition.
var guardFlow = [
	"function LimitGuard({ input, result }) {",
	"  result.limit = input.limit === undefined || input.limit === \"\" ? 20 : input.limit",
	"  if({",
	"    $$id: \"emptyLimit\",",
	"    condition: input.limit === \"\",",
	"    $$then: function () {",
	"      set({ $$id: \"branchEmpty\", path: \"result.branch\", value: \"empty\" })",
	"    },",
	"    $$else: function () {",
	"      set({ $$id: \"branchSet\", path: \"result.branch\", value: \"set\" })",
	"    },",
	"  })",
	"  return result",
	"}",
	""
].join("\n");
[
	{ input: { limit: 0 }, limit: 0, branch: "set" },
	{ input: { limit: "0" }, limit: "0", branch: "set" },
	{ input: { limit: false }, limit: false, branch: "set" },
	{ input: { limit: "" }, limit: 20, branch: "empty" },
	{ input: {}, limit: 20, branch: "set" }
].forEach(function (testCase) {
	var guarded = run(guardFlow, testCase.input);
	assertTrue(guarded.limit === testCase.limit && guarded.branch === testCase.branch,
		"Input guard lost " + JSON.stringify(testCase.input) + ": " + JSON.stringify(guarded));
});

// A declared number, integer or boolean input given as text (HTTP variables) takes its type, so
// === answers the same for an HTTP or an MCP caller; other text stays as it came.
var typedFlow = [
	"const _flow = {",
	"  inputs: {",
	"    limit: { type: \"number\", default: 20 },",
	"    page: { type: \"integer\" },",
	"    exact: { type: \"boolean\" },",
	"    label: { type: \"string\" },",
	"  },",
	"}",
	"",
	"function TypedInputs({ input, result }) {",
	"  result.limit = input.limit",
	"  result.limitIsZero = input.limit === 0",
	"  result.page = input.page",
	"  result.exact = input.exact",
	"  result.label = input.label",
	"  return result",
	"}",
	""
].join("\n");
var fromHttp = run(typedFlow, { limit: " 0 ", page: "3", exact: "FALSE", label: "0" });
var fromMcp = run(typedFlow, { limit: 0, page: 3, exact: false, label: "0" });
[fromHttp, fromMcp].forEach(function (typed) {
	assertTrue(typed.limit === 0 && typed.limitIsZero === true && typed.page === 3 && typed.exact === false && typed.label === "0",
		"Declared inputs did not take their type: " + JSON.stringify(typed));
});
var untouched = run(typedFlow, { limit: "", page: "3.5", exact: "yes" });
assertTrue(untouched.limit === "" && untouched.page === "3.5" && untouched.exact === "yes",
	"Text that is not of the declared type stays as it came: " + JSON.stringify(untouched));

// Rhino Java wrappers written by a block compare as their JavaScript values.
var javaValues = run([
	"function JavaValues({ input, result }) {",
	"  result.values = probe.javaValues({ $$id: \"javaValues\" })",
	"  return result",
	"}",
	""
].join("\n"), {}).values;
assertTrue(javaValues && javaValues.textIsText === true && javaValues.zeroIsZero === true &&
	javaValues.zeroIsNotEmpty === true && javaValues.falseIsFalse === true && javaValues.falseIsNotZero === true,
	"Java wrapped values did not compare as JavaScript values: " + JSON.stringify(javaValues));

Packages.org.apache.commons.io.FileUtils.deleteDirectory(projectRoot.toFile());
print("expression-strict-equality OK");
