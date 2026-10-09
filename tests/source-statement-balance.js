// A FlowScript statement read over several lines is balanced incrementally: each line is
// scanned once, not the whole statement again for every line (a 400-line `const _flow`
// object was scanned 400 times on every validation, compilation and run). The result is
// the same: brackets and quotes inside strings, escapes, and the diagnostic of a statement
// left open.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-statement-balance-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
function assert(value, message) { if (!value) throw new Error(message); }
try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(name, request) { return JSON.parse(engine[name](JSON.stringify(request))); }
	function flow(body) { return 'const _flow = {sourceVersion:2}\nfunction Balance({ input, config, result }) {\n' + body + '\n}'; }
	function run(body) { return api("run", { flowSource: flow(body), input: {}, includeTrace: false }); }

	var strings = run([
		'  result.value = {',
		'    a: "( [ { \\" ",',
		"    b: 'x\\'y ] ) }',",
		'    c: [1, 2,',
		'      3]',
		'  }'
	].join("\n"));
	assert(strings.ok && strings.result.value.a === '( [ { " ' && strings.result.value.b === "x'y ] ) }"
		&& JSON.stringify(strings.result.value.c) === "[1,2,3]", "Brackets and quotes inside strings: " + JSON.stringify(strings));

	var items = [];
	for (var i = 0; i < 400; i++) {
		items.push('    { "index": ' + i + ', "label": "item ' + i + ' ( [ {" },');
	}
	var long = run('  result.items = [\n' + items.join("\n") + '\n  ]');
	assert(long.ok && long.result.items.length === 400 && long.result.items[399].label === "item 399 ( [ {",
		"A 400-line statement: " + JSON.stringify(long).substring(0, 400));

	function diagnostic(body) {
		return JSON.stringify(api("flowSourceValidate", { name: "Balance", code: flow(body) }));
	}
	var openCall = diagnostic('  result.a = 1\n  if ({ condition: (1 > 0, $$then: function () {\n    result.c = 3\n  } })');
	assert(openCall.indexOf("Unbalanced FlowScript statement at line 3: missing )") !== -1,
		"A call left open is reported: " + openCall);
	var openArray = diagnostic('  result.a = [\n    "x\\"]",\n    \'y\\\'(\'\n');
	assert(openArray.indexOf("Unbalanced FlowScript statement at line 2: missing ]") !== -1,
		"Escaped quotes and brackets inside strings do not close the statement: " + openArray);
	print("source-statement-balance: strings, long statement and open statement OK");
} finally {
	files.deleteQuietly(project);
}
