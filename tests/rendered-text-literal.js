// The text a template property gives is data: text.lines and list.search keep a runtime text that spells a scope
// path as it is. A bare scope path written in the source (the former spelling of ${local.text}) is still read.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-rendered-text-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function same(actual, expected, message) {
	assert(JSON.stringify(actual) === JSON.stringify(expected), message + ": " + JSON.stringify(actual) + " instead of " + JSON.stringify(expected));
}
try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	var marker = "CFG-7731-MARKER";
	function run(body, input, definition) {
		var request = definition
			? { definition: { flow: { sourceVersion: 2, config: { demo: { marker: marker } } }, nodes: definition }, includeTrace: false, input: input || {} }
			: { flowSource: 'const _flow = { sourceVersion: 2, config: { demo: { marker: "' + marker + '" } } }\n' +
				'function Rendered({ input, config, result }) {\n' + body + '\n}\n', includeTrace: false, input: input || {} };
		var out = JSON.parse(engine.run(JSON.stringify(request)));
		assert(out.ok, "The run failed: " + JSON.stringify(out.error) + "\n" + body);
		return out.result;
	}
	["config.demo.marker", " config.demo.marker ", "input.t", "local.x"].forEach(function (text) {
		same(run('  result.lines = text.lines({ text: input.t })', { t: text }).lines, [text.trim()], "text.lines keeps the runtime text " + JSON.stringify(text));
	});
	var items = [{ t: "config.demo.marker" }, { t: marker }];
	same(run('  result.found = list.search({ items: input.items, query: input.q })', { items: items, q: "config.demo.marker" }).found, [items[0]],
		"list.search searches the runtime text");
	same(run('  local.text = "a\\nb"\n  result.lines = text.lines({ text: local.text })').lines, ["a", "b"], "text.lines reads an expression");
	same(run('  result.lines = text.lines({ text: `${config.demo.marker}` })').lines, [marker], "text.lines renders a source template");
	// a definition written with the former bare path still reads it
	same(run(null, {}, [{ block: "set", props: { path: "local.text", value: "c\nd" } },
		{ block: "text.lines", props: { text: "local.text" }, out: "result.lines" }]).lines, ["c", "d"], "A bare path of a definition is read");
	print("rendered-text-literal OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(project);
}
