// The scenario of a test calls the same requestable several times, in order, with other inputs or under other users:
// FLOWSCRIPT_REPEATED_EXTERNAL_CALLS, raised to an error by code-set and code-promote to stop copied endpoint calls,
// refused a private test Flow calling .GetItem seven times, with a list.map hint that does not fit a sequence. A private
// Flow named test... keeps it as a warning, with how to call as another user; any other Flow is refused as before.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-test-repeated-calls-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(name, request) { return JSON.parse(engine[name](JSON.stringify(request))); }
	function flow(name, accessibility) {
		var lines = ['const _flow = { sourceVersion: 2' + (accessibility ? ', accessibility: "' + accessibility + '"' : '') + ' }',
			'function ' + name + '({ input, result }) {'];
		for (var i = 1; i <= 5; i++) lines.push('  local.step' + i + ' = requestable.call({ requestable: ".GetItem", input: { id: ' + i + ' } })');
		return lines.concat(['  result.ok = true', '}', '']).join("\n");
	}
	function repeated(out) {
		var all = (out.diagnostics || []).concat(out.warnings || []).concat(out.error && out.error.details && out.error.details.diagnostics || []);
		return all.filter(function (d) { return d.code === "FLOWSCRIPT_REPEATED_EXTERNAL_CALLS"; })[0];
	}
	var test = api("flowCodeSet", { name: "test_Items", code: flow("test_Items", "private") });
	var warning = repeated(test);
	assert(test.ok === true && warning && warning.severity === "warning" && /session\.authenticate/.test(warning.hint),
		"a private test Flow keeps the repetition as a warning: " + JSON.stringify(test).substring(0, 800));
	var camel = api("flowCodeSet", { name: "testItems", code: flow("testItems", "private") });
	assert(camel.ok === true, "testItems is a test Flow too: " + JSON.stringify(camel).substring(0, 400));

	function refused(name, accessibility, label) {
		var out = api("flowCodeSet", { name: name, code: flow(name, accessibility) });
		var diagnostic = repeated(out);
		assert(out.ok === false && diagnostic && diagnostic.severity === "error", label + " is refused as before: " + JSON.stringify(out).substring(0, 600));
	}
	refused("Items", "private", "a private Flow not named test");
	refused("test_Public", "hidden", "a test Flow that is not private");
	refused("testimony", "private", "a name that only starts with the letters of test");
	var checked = api("flowCodeCheck", { name: "Items", code: flow("Items", "private") });
	assert(repeated(checked) && repeated(checked).severity === "warning", "code-check keeps it a warning: " + JSON.stringify(checked).substring(0, 400));

	print("test-flow-repeated-calls OK (" + checks + " checks)");
} finally {
	files.deleteQuietly(project);
}
