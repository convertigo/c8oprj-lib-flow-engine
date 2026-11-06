// The code check refuses a pattern built from data in a Flow callable over HTTP (public, hidden, or without
// _flow.accessibility), unless the block says dynamicPattern: true; a private Flow and a literal pattern pass; a literal
// pattern that repeats a repetition is reported as a warning.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("text-pattern-public-check-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var FileUtils = Packages.org.apache.commons.io.FileUtils;
function assert(value, message) { if (!value) throw new Error(message); }
try {
	var engine = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function validate(accessibility, call) {
		var meta = { sourceVersion: 2, inputs: { text: { type: "string", "default": "" }, pattern: { type: "string", "default": "" } } };
		if (accessibility) meta.accessibility = accessibility;
		var code = "const _flow = " + JSON.stringify(meta) + "\nfunction Check({input, local, result}) {\nlocal.found = " + call + "\nresult.found = local.found.matched\nreturn result\n}";
		return JSON.parse(engine.flowSourceValidate(JSON.stringify({ name: "Check", code: code })));
	}
	function find(response, code) {
		return (response.diagnostics || []).filter(function (d) { return d.code === code; })[0];
	}
	var dynamic = "text.match({ text: input.text, pattern: input.pattern })";
	["public", "hidden", null].forEach(function (accessibility) {
		var refused = validate(accessibility, dynamic), diagnostic = find(refused, "TEXT_PATTERN_NOT_LITERAL");
		assert(!refused.ok && diagnostic && diagnostic.severity === "error" && diagnostic.line === 3 && diagnostic.property === "pattern" &&
			/dynamicPattern: true/.test(diagnostic.hint), "a pattern from data is refused in a " + accessibility + " Flow: " + JSON.stringify(refused.diagnostics));
		var templated = validate(accessibility, "text.match({ text: input.text, pattern: `^${input.pattern}$` })");
		assert(find(templated, "TEXT_PATTERN_NOT_LITERAL"), "a templated pattern is refused in a " + accessibility + " Flow: " + JSON.stringify(templated.diagnostics));
		var allowed = validate(accessibility, "text.match({ text: input.text, pattern: input.pattern, dynamicPattern: true })");
		assert(allowed.ok && !find(allowed, "TEXT_PATTERN_NOT_LITERAL"), "dynamicPattern: true allows it: " + JSON.stringify(allowed.diagnostics));
		var literal = validate(accessibility, "text.match({ text: input.text, pattern: \"^[0-9]+$\" })");
		assert(literal.ok && !find(literal, "TEXT_PATTERN_NOT_LITERAL") && !find(literal, "TEXT_PATTERN_NESTED_REPETITION"), "a literal pattern passes: " + JSON.stringify(literal.diagnostics));
		var nested = validate(accessibility, "text.match({ text: input.text, pattern: \"^([a-z0-9]+-?)+$\" })"), warning = find(nested, "TEXT_PATTERN_NESTED_REPETITION");
		assert(nested.ok && warning && warning.severity === "warning", "a repeated repetition is a warning: " + JSON.stringify(nested.diagnostics));
	});
	// a local written once with a literal text is a literal pattern (lib_OAuth: local.urlPattern = "^(https://...)$")
	function validateLines(lines) {
		var code = "const _flow = { sourceVersion: 2, accessibility: \"public\", inputs: { text: { type: \"string\", default: \"\" }, pattern: { type: \"string\", default: \"\" } } }\n" +
			"function Check({input, local, result}) {\n" + lines.join("\n") + "\nresult.found = local.found.matched\nreturn result\n}";
		return find(JSON.parse(engine.flowSourceValidate(JSON.stringify({ name: "Check", code: code }))), "TEXT_PATTERN_NOT_LITERAL");
	}
	assert(!validateLines(["local.p = \"^[0-9]+$\"", "local.found = text.match({ text: input.text, pattern: local.p })"]), "a local set once to a literal text is literal");
	assert(validateLines(["local.p = input.pattern", "local.found = text.match({ text: input.text, pattern: local.p })"]), "a local set from the input is not");
	assert(validateLines(["local.p = \"^[0-9]+$\"", "if (input.text == \"x\") {", "local.p = input.pattern", "}", "local.found = text.match({ text: input.text, pattern: local.p })"]),
		"a local set twice, once from the input, is not");
	var privateFlow = validate("private", dynamic);
	assert(privateFlow.ok && !find(privateFlow, "TEXT_PATTERN_NOT_LITERAL"), "a private Flow may build its pattern: " + JSON.stringify(privateFlow.diagnostics));
	print("text-pattern-public-check OK");
} finally {
	FileUtils.deleteQuietly(project);
}
