// A top-level `;` ends a FlowScript statement, as in JavaScript. A one-line
// `var rows = list.map({...}); result.rows = rows` used to compile into one set
// whose value was the text of both statements, run "successfully" and return {}.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-statement-separators-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(name, request) { return JSON.parse(engine[name](JSON.stringify(request))); }
	function flow(body) { return 'const _flow = {sourceVersion:2}\nfunction Separators({ input, config, result }) {\n' + body + '\n}'; }
	function run(body) { return api("run", { flowSource: flow(body), input: { items: ["a", "b"] }, includeTrace: false }); }

	var mapped = run('  var rows = list.map({ items: input.items, select: { label: current } }); result.rows = rows');
	assert(mapped.ok && JSON.stringify(mapped.result.rows) === '[{"label":"a"},{"label":"b"}]', "One-line statements were not split: " + JSON.stringify(mapped));
	var twoLines = run('  var rows = list.map({ items: input.items, select: { label: current } })\n  result.rows = rows');
	assert(JSON.stringify(twoLines.result) === JSON.stringify(mapped.result), "One line and two lines differ: " + JSON.stringify(twoLines));

	var checked = api("flowSourceValidate", { name: "Separators", code: flow('  var rows = list.map({ items: input.items, select: { label: current } }); result.rows = rows;') });
	assert(checked.ok, "Separated statements rejected: " + JSON.stringify(checked));
	assert(checked.definition.nodes.length === 2 && checked.definition.nodes[1].props.path === "result.rows",
		"Expected two nodes, got: " + JSON.stringify(checked.definition.nodes));
	assert(checked.source.indexOf("result.rows = rows") === -1, "Statement text leaked into a value: " + checked.source);
	var written = api("flowSourceValidate", { name: "Separators", flowSource: checked.source, includeHeader: false });
	assert(written.ok && written.code.split("\n").filter(function (line) { return line.indexOf(";") !== -1; }).length === 0,
		"Canonical writer must put one statement per line: " + written.code);

	var scalars = run('  result.a = 1; result.b = "x;y"; result.c = { k: "v;w" }');
	assert(scalars.ok && scalars.result.a === 1 && scalars.result.b === "x;y" && scalars.result.c.k === "v;w",
		"Separators inside strings or objects must stay in the value: " + JSON.stringify(scalars));

	var slot = run('  if({ condition: true, $$then: function () { result.t = 1; result.u = 2 } })');
	assert(slot.ok && slot.result.t === 1 && slot.result.u === 2, "One-line slot body statements were not split: " + JSON.stringify(slot));

	var multiLine = run('  var picked = list.map({\n    items: input.items,\n    select: { label: current }\n  }); result.count = 2\n  result.picked = picked');
	assert(multiLine.ok && multiLine.result.count === 2 && multiLine.result.picked.length === 2,
		"A multi-line statement followed by `;` on its last line was not split: " + JSON.stringify(multiLine));

	var closing = run('  if({ condition: true, $$then: function () {\n    result.in = true; }\n  })');
	assert(closing.ok && closing.result["in"] === true, "Statement followed by the closing brace failed: " + JSON.stringify(closing));

	var broken = api("flowSourceValidate", { name: "Separators", code: flow('  result.a = 1\n  result.b = 2; var x = list.map(input.items)') });
	var brokenText = JSON.stringify(broken);
	assert(!broken.ok && brokenText.indexOf("FLOWSCRIPT_INVALID_BLOCK_CALL_SIGNATURE") !== -1,
		"The second statement of a line must be parsed and diagnosed: " + brokenText);
	var reference = api("flowSourceValidate", { name: "Separators", code: flow('  result.a = 1\n  var x = list.map(input.items)') });
	var line = /at line (\d+)/.exec(JSON.stringify(reference));
	assert(line && brokenText.indexOf("at line " + line[1]) !== -1, "The diagnostic must name the statement line: " + brokenText);

	print("source-statement-separators OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(project);
}
