// An agent writes a JavaScript regular expression literal: /^[0-9]+$/.test(q), s.match(/x/), s.replace(/x/g, y),
// s.split(/x/). Assigned alone in one of these exact forms, the literal is read as the text block that does the same
// (text.match, text.replace and text.split with regex: true) and promote saves that block. Any other form is refused
// at its line with the block to write, built from the operands of the line.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var __flowEngineDir = engineDir;
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("lib-flow-engine-regex-literals").toFile().getAbsolutePath());
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

function source(name, inputs, lines) {
	return ["const _flow = { sourceVersion: 2, inputs: { " + inputs.map(function (input) { return input + ": { type: \"string\" }"; }).join(", ") + " } }", "",
		"function " + name + "({ input, result }) {"].concat(lines.map(function (line) { return "  " + line; })).concat(["}"]).join("\n");
}

// The exact form is accepted, promote writes the block, and the promoted Flow gives what JavaScript gives
function rewritten(name, inputs, lines, expectedLines, runs) {
	var set = api("flowCodeSet", { name: name, code: source(name, inputs, lines) });
	assertTrue(set.ok === true, name + ": the exact form is accepted: " + JSON.stringify(set.error || set).substring(0, 1200));
	var promoted = api("flowCodePromote", { name: name, revision: set.revision });
	assertTrue(promoted.ok === true, name + ": promote: " + JSON.stringify(promoted.error || promoted).substring(0, 1200));
	var code = api("flowCodeGet", { name: name }).code;
	assertTrue(code.indexOf("/.") === -1 && code.indexOf("(/") === -1, name + ": no literal is left: " + code);
	// a long call is written on several lines, with a trailing comma
	function flat(text) {
		return String(text).replace(/,\s*([}\]])/g, "$1").replace(/\s+/g, " ").replace(/([{\[]) /g, "$1").replace(/ ([}\]])/g, "$1");
	}
	expectedLines.forEach(function (expected) {
		assertTrue(flat(code).indexOf(flat(expected)) !== -1, name + ": the promoted source has " + expected + ":\n" + code);
	});
	runs.forEach(function (run) {
		var ran = api("flowCodeRun", { name: name, input: run[0] });
		assertTrue(ran.ok === true && JSON.stringify(ran.result) === JSON.stringify(run[1]),
			name + ": " + JSON.stringify(run[0]) + " gives " + JSON.stringify(run[1]) + ": " + JSON.stringify(ran.error || ran.result).substring(0, 800));
	});
	return code;
}

function firstDiagnostic(response) {
	var error = response.error || {};
	var diagnostics = error.diagnostics || error.details && error.details.diagnostics || [];
	return diagnostics.filter(function (diagnostic) { return diagnostic.severity !== "warning"; })[0] || diagnostics[0] || {};
}

// Any other form is refused at its line, the block to write named, with the operands of the line
function refused(name, inputs, lines, code, line, parts) {
	var response = api("flowCodeSet", { name: name, code: source(name, inputs, lines) });
	var diagnostic = firstDiagnostic(response);
	var text = JSON.stringify(response.error || response);
	assertTrue(response.ok === false && response.error.code === code, name + ": expected " + code + ": " + text.substring(0, 1000));
	assertTrue(diagnostic.line === line, name + ": expected the diagnostic at line " + line + ": " + JSON.stringify(diagnostic).substring(0, 800));
	assertTrue(text.indexOf("FLOWSCRIPT_INVALID_BLOCK_CALL_SIGNATURE") === -1, name + ": not read as a block call: " + text.substring(0, 800));
	parts.forEach(function (part) {
		assertTrue(text.indexOf(JSON.stringify(part).slice(1, -1)) !== -1, name + ": the diagnostic names " + part + ": " + text.substring(0, 1600));
	});
	api("flowCodeDiscard", { name: name });
}

// 1. The exact forms (lines of the source: 1 is _flow, 3 the function, 4 the first statement)
rewritten("digits", ["q"], ["local.ok = /^[0-9]+$/.test(input.q)", "result.ok = local.ok"], [
	"local.okMatch = text.match({ text: String(input.q), pattern: \"^[0-9]+$\" })",
	"local.ok = local.okMatch.matched"
], [[{ q: "42" }, { ok: true }], [{ q: "4a" }, { ok: false }]]);
rewritten("caseless", ["q"], ["const ok = /^ab\\d+$/i.test(input.q)", "result.ok = ok"], [
	"text.match({ text: String(input.q), pattern: \"^ab\\\\d+$\", flags: \"i\" })",
	"local.ok = local.okMatch.matched"
], [[{ q: "AB12" }, { ok: true }], [{ q: "AB" }, { ok: false }]]);
rewritten("range", ["text"], ["local.m = input.text.match(/(\\d+)-(\\d+)/)", "result.m = local.m"], [
	"local.mMatch = text.match({ text: input.text, pattern: \"(\\\\d+)-(\\\\d+)\" })",
	"local.m = local.mMatch.matched ? local.mMatch.groups : null"
], [[{ text: "pages 12-34" }, { m: ["12-34", "12", "34"] }], [{ text: "none" }, { m: null }]]);
rewritten("dashes", ["text"], ["result.text = input.text.replace(/-/g, \" \")"], [
	"result.text = text.replace({ text: input.text, search: \"-\", replacement: \" \", regex: true })"
], [[{ text: "a-b-c" }, { text: "a b c" }]]);
rewritten("firstDash", ["text"], ["result.text = input.text.replace(/(\\d+)-(\\d+)/, \"$2-$1\")"], [
	"result.text = text.replace({ text: input.text, search: \"(\\\\d+)-(\\\\d+)\", replacement: \"$2-$1\", regex: true, all: false })"
], [[{ text: "12-34 56-78" }, { text: "34-12 56-78" }]]);
rewritten("everyA", ["text"], ["result.text = input.text.replaceAll(/a/gi, \"b\")"], [
	"result.text = text.replace({ text: input.text, search: \"a\", replacement: \"b\", regex: true, flags: \"i\" })"
], [[{ text: "Aa-c" }, { text: "bb-c" }]]);
rewritten("parts", ["text"], ["local.parts = input.text.split(/\\s*,\\s*/)", "result.parts = local.parts"], [
	"local.parts = text.split({ text: input.text, separator: \"\\\\s*,\\\\s*\", regex: true, trim: false, removeEmpty: false })"
], [[{ text: "a , b,c" }, { parts: ["a", "b", "c"] }]]);

// 2. The literal of a condition, the iteration-1 friction: refused at its line with the text.match to write first
refused("quantity", ["qs"], [
	"if (!/^[0-9]+$/.test(input.qs) || Number(input.qs) < 1) {",
	"  throw { code: \"BAD_INPUT\", message: \"quantity must be a positive integer\", status: 400 }",
	"}",
	"result.ok = true"
], "FLOWSCRIPT_VALIDATION_FAILED", 4, ["FLOWSCRIPT_EXPRESSION_UNSUPPORTED", "local.qsMatch = text.match({ text: String(input.qs), pattern: \"^[0-9]+$\" })",
	"read local.qsMatch.matched where the test was"]);

// 3. A longer expression, other arguments, a replacement function, other flags: refused at their line
refused("trimmed", ["text"], ["result.text = input.text.replace(/-/g, \" \").trim()"],
	"FLOWSCRIPT_EXPRESSION_UNSUPPORTED", 4, ["at line 4", "text.replace block with regex: true",
		"local.text = text.replace({ text: input.text, search: \"-\", replacement: \" \", regex: true })"]);
refused("limited", ["text"], ["local.parts = input.text.split(/,/, 2)", "result.parts = local.parts"],
	"FLOWSCRIPT_EXPRESSION_UNSUPPORTED", 4, ["at line 4", "text.split block with regex: true"]);
refused("upper", ["text"], ["result.text = input.text.replace(/a/g, m => m.toUpperCase())"],
	"FLOWSCRIPT_EXPRESSION_UNSUPPORTED", 4, ["at line 4", "text.replace block with regex: true"]);
refused("bare", ["text"], ["local.x = 1", "input.text.replace(/x/g, \"\")"],
	"FLOWSCRIPT_EXPRESSION_UNSUPPORTED", 5, ["at line 5", "text.replace block with regex: true"]);
refused("sticky", ["q"], ["local.ok = /^a/y.test(input.q)", "result.ok = local.ok"],
	"FLOWSCRIPT_VALIDATION_FAILED", 4, ["The flags of a pattern are g, i, m and s", "text.match"]);
refused("exec", ["q"], ["local.m = /(\\d+)/.exec(input.q)", "result.m = local.m"],
	"FLOWSCRIPT_VALIDATION_FAILED", 4, ["local.qMatch = text.match({ text: String(input.q), pattern: \"(\\\\d+)\" })"]);
refused("replaceAllWithoutG", ["text"], ["result.text = input.text.replaceAll(/a/, \"b\")"],
	"FLOWSCRIPT_EXPRESSION_UNSUPPORTED", 4, ["at line 4", "text.replace block with regex: true"]);

print("flowscript-regex-literals: " + checks + " checks");
