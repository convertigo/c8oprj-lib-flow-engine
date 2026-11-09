// An agent writes a JavaScript loop first: while (local.y != 0) { ... } in a greatest common divisor, for (...) over a
// counter or a list. The statement was read as a call of a block named while or for whose properties were a text, and
// code-set answered FLOWSCRIPT_PARSE_FAILED "Cannot set property "0" of undefined to "l"" at line 0. It is now refused
// at its line, with the loop blocks to write instead (the while block and its iteration limit, forEach). A regular
// expression literal keeps its own refusal at its line, with the text.match block.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var __flowEngineDir = engineDir;
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("lib-flow-engine-javascript-loops").toFile().getAbsolutePath());
var engine = eval(String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
var checks = 0;

function assertTrue(condition, message) {
	checks++;
	if (!condition) {
		throw new Error(message);
	}
}

function api(method, request) {
	return JSON.parse(engine[method](JSON.stringify(request)));
}

function firstDiagnostic(response) {
	var error = response.error || {};
	var diagnostics = error.diagnostics || error.details && error.details.diagnostics || [];
	return diagnostics[0] || {};
}

function refused(name, lines, code, line, hintParts) {
	var response = api("flowCodeSet", { name: name, code: lines.join("\n") });
	var diagnostic = firstDiagnostic(response);
	var text = JSON.stringify(response.error || response);
	assertTrue(response.ok === false && response.error.code === code, name + ": expected " + code + ": " + text.substring(0, 1000));
	assertTrue(diagnostic.line === line, name + ": expected the diagnostic at line " + line + ": " + JSON.stringify(diagnostic).substring(0, 600));
	assertTrue(text.indexOf("Cannot set property") === -1, name + ": no internal error: " + text.substring(0, 600));
	hintParts.forEach(function (part) {
		assertTrue((String(response.error.hint || "") + " " + String(diagnostic.hint || "")).indexOf(part) !== -1, name + ": the hint names " + part + ": " + text.substring(0, 1200));
	});
	api("flowCodeDiscard", { name: name });
	return response;
}

// 1. The greatest common divisor of the light bench (anonymized): a JavaScript while loop
refused("gcd", [
	"const _flow = { sourceVersion: 2, inputs: { a: { type: \"integer\" }, b: { type: \"integer\" } } }",
	"",
	"function gcd({ input, result }) {",
	"  local.x = input.a",
	"  local.y = input.b",
	"  while (local.y != 0) {",
	"    local.t = local.y",
	"    local.y = local.x % local.y",
	"    local.x = local.t",
	"  }",
	"  result.gcd = local.x",
	"}"
], "FLOWSCRIPT_LOOP_UNSUPPORTED", 6, ["while({ condition: local.y != 0, maxIterations: 1000, $$nodes: function () {", "WHILE_ITERATION_LIMIT", "forEach({ items"]);

// 2. A counter: for (let i = 0; i < n; i++)
refused("sum", [
	"function sum({ input, result }) {",
	"  local.s = 0",
	"  for (let i = 0; i < input.n; i++) {",
	"    local.s = local.s + i",
	"  }",
	"  result.s = local.s",
	"}"
], "FLOWSCRIPT_LOOP_UNSUPPORTED", 3, ["while({ condition: local.i < input.count", "local.i = local.i + 1", "maxIterations is 1000"]);

// 3. A list: for (const item of input.items)
refused("total", [
	"function total({ input, result }) {",
	"  local.s = 0",
	"  for (const item of input.items) {",
	"    local.s = local.s + item",
	"  }",
	"  result.s = local.s",
	"}"
], "FLOWSCRIPT_LOOP_UNSUPPORTED", 3, ["forEach({ items: input.items, $$nodes: function () { ... current ... } })"]);

// 4. do { } while ()
refused("countdown", [
	"function countdown({ input, result }) {",
	"  local.y = 3",
	"  do {",
	"    local.y = local.y - 1",
	"  } while (local.y > 0)",
	"  result.y = local.y",
	"}"
], "FLOWSCRIPT_LOOP_UNSUPPORTED", 3, ["while({ condition:", "maxIterations"]);

// 5. A nested JavaScript loop inside a while block body is refused at its own line
refused("nested", [
	"function nested({ input, result }) {",
	"  local.i = 0",
	"  while({ condition: local.i < 3, $$nodes: function () {",
	"    while (local.j < 2) {",
	"      local.j = local.j + 1",
	"    }",
	"    local.i = local.i + 1",
	"  } })",
	"}"
], "FLOWSCRIPT_LOOP_UNSUPPORTED", 4, ["while({ condition: local.j < 2"]);

// 6. The regular expression literals of the light bench keep their refusal at their line, with text.match
refused("digits", [
	"const _flow = { sourceVersion: 2, inputs: { quantity: { type: \"string\" } } }",
	"",
	"function digits({ input, result }) {",
	"  if (!/^[0-9]+$/.test(input.quantity)) {",
	"    throw { code: \"BAD_INPUT\", message: \"quantity must be an integer\", status: 400 }",
	"  }",
	"  result.ok = true",
	"}"
], "FLOWSCRIPT_VALIDATION_FAILED", 4, ["text.match"]);
// (input.text.replace(/-/g, " ") assigned alone is rewritten to text.replace with regex: true, flowscript-regex-literals.js)
refused("cleaned", [
	"function cleaned({ input, result }) {",
	"  result.text = input.text.replace(/-/g, \" \").trim()",
	"}"
], "FLOWSCRIPT_EXPRESSION_UNSUPPORTED", 2, ["text.replace block with regex: true", "replaceAll without regex take a text"]);

// 7. The while block itself, with its body as $$nodes, still runs: the greatest common divisor
var gcd = api("flowCodeSet", { name: "gcdBlock", code: [
	"const _flow = { sourceVersion: 2, inputs: { a: { type: \"integer\" }, b: { type: \"integer\" } } }",
	"",
	"function gcdBlock({ input, result }) {",
	"  local.x = input.a",
	"  local.y = input.b",
	"  while({ condition: local.y != 0, maxIterations: 100, $$nodes: function () {",
	"    local.t = local.y",
	"    local.y = local.x % local.y",
	"    local.x = local.t",
	"  } })",
	"  result.gcd = local.x",
	"}"
].join("\n") });
assertTrue(gcd.ok === true, "the while block is accepted: " + JSON.stringify(gcd.error || gcd).substring(0, 800));
var ran = api("flowCodeRun", { name: "gcdBlock", input: { a: 84, b: 36 } });
assertTrue(ran.ok === true && ran.result.gcd === 12, "the while block runs: " + JSON.stringify(ran).substring(0, 600));

print("flowscript-javascript-loops: " + checks + " checks");
