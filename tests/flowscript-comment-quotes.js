// A // comment is text: an apostrophe, a double quote or a brace in it ("// the item's due date") made the body of the
// Flow look unbalanced, since the scan that finds the end of a function (or slot function) body read the apostrophe as
// the start of a string: code-set answered "Unbalanced FlowScript function body at line 2", the line of the signature,
// whatever the line of the comment. The scans now skip the comments as they skip the strings; a /* */ comment, which a
// FlowScript body does not take, is refused at its own line as unsupported syntax, not as an unbalanced body.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-comment-quotes-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(name, request) { return JSON.parse(engine[name](JSON.stringify(request))); }
	function flow(lines) {
		return ['const _flow = { sourceVersion: 2, inputs: { count: { type: "integer", default: 2 } } }',
			'function Orders({ input, config, result }) {'].concat(lines, ['  result.done = true', '}', '']).join("\n");
	}
	function runs(label, lines, expected) {
		var code = flow(lines);
		var checked = api("flowSourceValidate", { name: "Orders", code: code });
		assert(checked.ok, label + ": the check refused it: " + JSON.stringify(checked).substring(0, 600));
		var out = api("flowCodeRun", { name: "Orders", code: code, includeTrace: false, input: { count: 2 } });
		assert(out.ok, label + ": the run failed: " + JSON.stringify(out).substring(0, 600));
		Object.keys(expected).forEach(function (key) {
			assert(JSON.stringify(out.result[key]) === JSON.stringify(expected[key]), label + ": result." + key + " is " + JSON.stringify(out.result[key]));
		});
		assert(out.result.done === true, label + ": the statement after the comment did not run");
	}

	runs("apostrophe", ["  // 1 to 3: the item's due date and status", '  result.a = "x"'], { a: "x" });
	runs("double quote", ['  // the "draft" state', '  result.a = "x"'], { a: "x" });
	runs("braces", ["  // returns { ok } when it's done", '  result.a = "x"'], { a: "x" });
	runs("backtick", ["  // a `code` mark", '  result.a = "x"'], { a: "x" });
	runs("after a statement", ['  result.a = "x" // the order\'s state'], { a: "x" });
	runs("in an if body", ["  if (input.count > 1) {", "    // more than one order's line", '    result.a = "many"', "  }"], { a: "many" });
	runs("in a slot function", ['  if({ $$id: "large", condition: input.count > 1, $$then() {', "    // the order's lines", '    result.a = "large"', "  } })"], { a: "large" });
	runs("in a loop slot", ['  forEach({ $$id: "lines", items: [1, 2], $$nodes(line) {', "    // each line's count", "    result.n = (result.n || 0) + 1", "  } })"], { n: 2 });
	runs("// in a string stays text", ['  result.a = "https://example.test/it\'s"'], { a: "https://example.test/it's" });

	// a project block body
	var block = api("blockCodeSet", { name: "proof.note", code: 'const _meta = { description: "Notes." }\n' +
		"function note({ input, result }) {\n  // the note's text\n  result.text = \"noted\"\n}\n" });
	assert(block.ok, "a block whose body has an apostrophe in a comment: " + JSON.stringify(block).substring(0, 600));

	// a /* */ comment is refused at its line, not as an unbalanced body
	var refused = api("flowSourceValidate", { name: "Orders", code: flow(['  result.a = "x"', "  /* the order's name */", '  result.b = "y"']) });
	var text = JSON.stringify(refused);
	assert(!refused.ok && text.indexOf("FLOWSCRIPT_UNBALANCED_SYNTAX") === -1 && /line 4/.test(text),
		"a block comment is refused at its line, not as an unbalanced body: " + text.substring(0, 600));

	print("flowscript-comment-quotes OK (" + checks + " checks)");
} finally {
	files.deleteQuietly(project);
}
