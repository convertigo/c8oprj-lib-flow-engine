// tools/migrate-flowscript-v3.js: a dry run by default, --write writes only the Flows whose guard passed, a Flow the
// guard refuses stays in v2 with its cause, a project with an unexpected error is not written, and FlowScript strings of
// the tests are counted without being changed.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var files = Packages.org.apache.commons.io.FileUtils;
function check(ok, message) { if (!ok) throw new Error(message); }
var tool = new java.io.File(engineDir, "../tools/migrate-flowscript-v3.js").getCanonicalPath();

function project(flows, tests) {
	var dir = java.nio.file.Files.createTempDirectory("flow-v3-migrate-").toFile();
	Object.keys(flows).forEach(function (name) { files.writeStringToFile(new java.io.File(dir, "_flow/flows/" + name + ".flow.js"), flows[name], "UTF-8"); });
	Object.keys(tests || {}).forEach(function (name) { files.writeStringToFile(new java.io.File(dir, "tests/" + name), tests[name], "UTF-8"); });
	return dir;
}
function read(dir, path) { return String(files.readFileToString(new java.io.File(dir, path), "UTF-8")); }
function migrate(dir, write) {
	var command = new java.util.ArrayList();
	["java", "-Djava.awt.headless=true", "-Duser.language=en", "-Duser.country=US", "-cp", String(java.lang.System.getProperty("java.class.path")),
		"org.mozilla.javascript.tools.shell.Main", "-version", "200", tool, String(engineDir.getAbsolutePath()), String(dir.getAbsolutePath())]
		.concat(write ? ["--write"] : []).forEach(function (part) { command.add(new java.lang.String(String(part))); });
	var process = new java.lang.ProcessBuilder(command).redirectErrorStream(true).start();
	var reader = new java.io.BufferedReader(new java.io.InputStreamReader(process.getInputStream(), "UTF-8"));
	var output = "", line;
	while ((line = reader.readLine()) !== null) output += String(line) + "\n";
	check(process.waitFor() === 0, "migration tool: " + output);
	var start = output.indexOf("{\n");
	check(start >= 0, "migration report: " + output);
	return JSON.parse(output.substring(start));
}

var good = 'const _flow = { sourceVersion: 2, inputs: { items: { type: "array" } } }\n\n' +
	'function Good({ input, config, result }) {\n  local.kept = list.filter({ items: input.items, where: current > 1 })\n' +
	'  result.count = local.kept.length\n}\n';
var kept = 'const _flow = { sourceVersion: 2, inputs: { items: { type: "array" } } }\n\n' +
	'function Kept({ input, config, result }) {\n  forEachChunk({\n    items: input.items,\n    size: 2,\n' +
	'    $$each: function ({chunk}) {\n      local.n = chunk.length\n    },\n  })\n}\n';
var testSource = "var a = 'const _flow = { sourceVersion: 2 }\\nfunction A({ input, config, result }) {\\n  result.a = 1\\n}'\n" +
	"var b = `const _flow = { sourceVersion: 3 }\nfunction B({ input, config, result }) {\n  return { b: 1 }\n}`\n" +
	"var c = /function X\\(\\{ input/.test(a) ? 'not a source' : ''\n";
var dir = project({ Good: good, Kept: kept }, { "sample.js": testSource });

var dry = migrate(dir, false);
check(dry.mode === "dry-run" && !dry.written && dry.flows.total === 2 && dry.flows.migrated.length === 1 && dry.flows.migrated[0].flow === "_flow/flows/Good.flow.js"
	&& dry.flows.keptV2.length === 1 && dry.flows.keptV2[0].flow === "_flow/flows/Kept.flow.js" && /FLOWSCRIPT_V3_FUNCTION/.test(dry.flows.keptV2[0].reason),
	"dry run report: " + JSON.stringify(dry));
check(read(dir, "_flow/flows/Good.flow.js") === good && read(dir, "_flow/flows/Kept.flow.js") === kept, "a dry run writes nothing");
check(dry.tests.sources === 2 && dry.tests.v2 === 1 && dry.tests.v3 === 1 && dry.tests.files.length === 1, "test strings counted: " + JSON.stringify(dry.tests));

var written = migrate(dir, true);
check(written.written && written.flows.migrated.length === 1, "write report: " + JSON.stringify(written));
var migrated = read(dir, "_flow/flows/Good.flow.js");
check(/^const _flow = \{ sourceVersion: 3, /.test(migrated) && migrated.indexOf("local.kept = input.items.filter(item => item > 1)") >= 0,
	"written v3 text: " + migrated);
check(read(dir, "_flow/flows/Kept.flow.js") === kept && read(dir, "tests/sample.js") === testSource, "only the guarded Flow is written");
var again = migrate(dir, false);
check(again.flows.alreadyV3.length === 1 && again.flows.migrated.length === 0 && again.flows.keptV2.length === 1, "second run: " + JSON.stringify(again.flows));

var broken = project({ Good: good, Broken: 'const _flow = { sourceVersion: 2 }\n\nfunction Broken({ input, config, result }) {\n  local.x = (\n}\n' });
var refused = migrate(broken, true);
check(!refused.written && refused.flows.errors.length === 1 && refused.flows.errors[0].flow === "_flow/flows/Broken.flow.js" && refused.flows.migrated.length === 1,
	"unexpected error report: " + JSON.stringify(refused));
check(read(broken, "_flow/flows/Good.flow.js") === good, "nothing is written for a project with an unexpected error");
print("flowscript-v3-migrate OK");
