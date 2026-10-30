// The escape sequences of a FlowScript string are those of JavaScript, in every place a string is read: a quoted
// value, a string inside an expression, a template literal, a project block. "\r\n" in an expression used to give
// "r" and a line feed, "\uFEFF" the text uFEFF, and a double-quoted value with \' or \x41 its raw text. The writer
// keeps them: a BOM, a zero-width space or a line separator is written back as its escape, not as an invisible
// character.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-string-escapes-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function codes(text) {
	var out = [];
	for (var i = 0; i < String(text).length; i++) out.push(String(text).charCodeAt(i).toString(16));
	return out.join(" ");
}
function same(actual, expected, message) {
	assert(actual === expected, message + ": got [" + codes(actual) + "], expected [" + codes(expected) + "]");
}
try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(name, request) { return JSON.parse(engine[name](JSON.stringify(request))); }
	function flow(body) {
		return 'const _flow = {sourceVersion:2}\nfunction Notes({ input, config, result }) {\n' + body + '\n}\n';
	}
	function run(body) {
		var out = api("run", { flowSource: flow(body), includeTrace: false, input: {} });
		assert(out.ok, "The run failed: " + JSON.stringify(out.error) + "\n" + body);
		return out.result;
	}

	// Each escape of JavaScript, the expected text being what Rhino itself reads from the same literal.
	var escapes = ["\\n", "\\r", "\\t", "\\b", "\\f", "\\v", "\\0", "\\\\", "\\/", "\\a", "\\x41", "\\u00e9", "\\uFEFF",
		"\\u2028", "\\u{1F600}", "\\u{41}"];
	escapes.forEach(function (escape) {
		var expected = eval('"a' + escape + 'z"');
		var both = run('  result.dq = "a' + escape + 'z"\n  result.sq = \'a' + escape + 'z\'');
		same(both.dq, expected, "A double-quoted value with " + escape);
		same(both.sq, expected, "A single-quoted value with " + escape);
		var expression = run('  local.word = "z"\n  result.v = "a' + escape + '" + local.word');
		same(expression.v, expected, "A string in an expression with " + escape);
		var template = run('  local.word = "z"\n  result.v = `a' + escape + '${local.word}`');
		same(template.v, expected, "A template literal with " + escape);
		var property = run('  set({ $$id: "keep", path: "result.v", value: "a' + escape + 'z" })');
		same(property.v, expected, "A block property with " + escape);
	});
	var quotes = run('  result.dq = "it\\\'s \\"quoted\\""\n  result.sq = \'it\\\'s \\"quoted\\"\'\n  result.tpl = `\\`tick\\` \\${kept}`\n' +
		'  local.word = "x"\n  result.ex = \'a\\\'b\' + "c\\"d" + local.word');
	same(quotes.dq, "it's \"quoted\"", "Escaped quotes in a double-quoted value");
	same(quotes.sq, "it's \"quoted\"", "Escaped quotes in a single-quoted value");
	same(quotes.tpl, "`tick` ${kept}", "An escaped backtick and \\${ in a template literal");
	same(quotes.ex, "a'bc\"dx", "Escaped quotes in an expression");
	var lines = run('  local.lines = ["id;label", "1;Desk"]\n  result.csv = local.lines.join("\\r\\n") + "\\r\\n"\n' +
		'  result.bom = "\\uFEFF" + result.csv\n  result.index = local.lines[1].split("\\u003B").at(1)');
	same(lines.csv, "id;label\r\n1;Desk\r\n", "join(\"\\r\\n\") gives CR LF");
	same(lines.bom, "\uFEFFid;label\r\n1;Desk\r\n", "\\uFEFF in an expression is the BOM");
	same(lines.index, "Desk", "\\u003B in a method argument is a semicolon");
	var bracket = run('  local.row = { "a\\tb": 1, "c\'d": 2 }\n  result.tab = local.row["a\\tb"]\n  result.quote = local.row[\'c\\\'d\']');
	assert(bracket.tab === 1 && bracket.quote === 2, "The escapes of a bracket key: " + JSON.stringify(bracket));

	// A project block reads its strings the same way.
	var block = 'const _meta = {\n  "sourceVersion": 2,\n  "properties": { "rows": { "kind": "expression", "type": "array" } },\n' +
		'  "outputs": { "out": { "type": "object" } }\n}\n\nfunction notes_lines({ input, config }) {\n' +
		'  local.end = "\\r\\n"\n  return {\n    content: "\\uFEFF" + input.rows.join("\\r\\n") + local.end\n  }\n}\n';
	var set = api("blockCodeSet", { name: "notes.lines", code: block });
	assert(set.ok, "blockCodeSet: " + JSON.stringify(set));
	var called = run('  result.file = notes.lines({ rows: ["a", "b"] })');
	same(called.file.content, "\uFEFFa\r\nb\r\n", "The escapes of a project block");

	// What JavaScript refuses is refused with the escape and the fix, never read as other text.
	[
		['  result.v = "a\\x4z"', "\\x4z"],
		['  result.v = "a\\u12z"', "\\u12z"],
		["  result.v = 'a\\u{110000}'", "\\u{110000}"],
		['  result.v = "a\\1"', "\\1"],
		['  local.word = "z"\n  result.v = "a\\x4" + local.word', "\\x4"],
		['  local.word = "z"\n  result.v = `a\\u00G${local.word}`', "\\u00G"]
	].forEach(function (fixture) {
		var out = api("flowSourceValidate", { name: "Notes", code: flow(fixture[0]) });
		var executed = api("run", { flowSource: flow(fixture[0]), includeTrace: false, input: {} });
		var text = JSON.stringify(out) + JSON.stringify(executed);
		assert(!out.ok || !executed.ok, "An invalid escape must be refused: " + fixture[0] + " " + text);
		assert(text.indexOf(fixture[1]) !== -1 && text.indexOf("\\\\uXXXX") !== -1,
			"The refusal names the escape and the escapes to use: " + text);
	});

	// The template-syntax reader: a line continuation is nothing, as in JavaScript.
	var syntax = eval(String(files.readFileToString(new java.io.File(engineDir, "modules/template-syntax.js"), "UTF-8")));
	same(syntax.unescape("a\\\nb\\\r\nc").value, "abc", "A line continuation");
	assert(!!syntax.unescape("a\\").error, "A final backslash is an error");

	// The writer keeps the escapes of invisible characters and of the controls.
	function written(code) {
		var parsed = api("flowSourceValidate", { name: "Notes", code: code });
		assert(parsed.ok, "Parse failed: " + JSON.stringify(parsed));
		var out = api("flowSourceValidate", { name: "Notes", flowSource: parsed.source, includeHeader: false, includeImplicitReturn: false });
		assert(out.ok, "Write failed: " + JSON.stringify(out));
		return out.code;
	}
	var invisible = flow('  set({ $$id: "mark", path: "result.mark", value: "\\uFEFF\\u200B\\u2028\\u202E\\u00AD\\u0085|\\r\\n\\t" })\n' +
		'  set({ $$id: "label", path: "result.label", value: { "k\\uFEFF": "v\\u2029" } })\n' +
		'  local.word = "z"\n  set({ $$id: "mixed", path: "result.mixed", value: `\\uFEFF\\u0007${local.word}` })');
	var code = written(invisible);
	assert(!/[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u00AD\u200B\u2028\u2029\u202E\uFEFF]/.test(code),
		"The written source holds an invisible character: [" + codes(code) + "]");
	assert(code.indexOf("\\uFEFF\\u200B\\u2028\\u202E\\u00AD\\u0085|\\r\\n\\t") !== -1, "The quoted value keeps its escapes:\n" + code);
	assert(code.indexOf("\\uFEFF\\u0007${local.word}") !== -1, "The template literal keeps its escapes:\n" + code);
	var before = run(invisible.split("\n").slice(2, -2).join("\n")), after = api("run", { flowSource: code, includeTrace: false, input: {} });
	assert(after.ok && JSON.stringify(after.result) === JSON.stringify(before), "The written source runs the same: " + JSON.stringify(after));
	same(after.result.mark, "\uFEFF\u200B\u2028\u202E\u00AD\u0085|\r\n\t", "The written value");
	assert(written(code) === code, "The writer is stable");

	print("flowscript-string-escapes OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(project);
}
