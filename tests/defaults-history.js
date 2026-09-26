// Defaults across versions: a project reads the defaults of the definer version it
// recorded in _flow/dependencies.json (history in the block companion file), and the
// recorded version only moves when no default changed in between.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var temp = java.nio.file.Files.createTempDirectory("flow-defaults-history-").toFile();
function write(file, text) {
	files.forceMkdir(file.getParentFile());
	files.writeStringToFile(file, String(text), "UTF-8");
}
function assertTrue(condition, message) {
	if (!condition) throw new Error(message);
}

var library = new java.io.File(temp, "DefLib");
write(new java.io.File(library, "c8oProject.yaml"), "↑DefLib [core.Project]:\n  version: 2.0.0\n");
write(new java.io.File(library, "_flow/blocks/greet.block.js"), [
	"const _meta = {",
	'  "sourceVersion": 2,',
	'  "version": 1,',
	'  "description": "Returns a greeting.",',
	'  "targets": ["backend"],',
	'  "implementations": { "backend": { "runtime": "rhino" } },',
	'  "properties": {',
	'    "greeting": { "label": "Greeting", "kind": "value", "type": "string", "default": "Hello" }',
	"  },",
	'  "outputs": { "out": { "type": "string" } },',
	'  "runtime": "rhino",',
	"}",
	"",
	"(function () {",
	"  return { run: function (ctx, node) {",
	"    return String(ctx.input({ value: ctx.props(node).greeting }))",
	"  } }",
	"}())",
	""
].join("\n"));
var history = new java.io.File(library, "_flow/blocks/greet.block.defaults.json");
write(history, JSON.stringify({ format: "convertigo-flow-defaults",
	history: [{ until: "1.9.9", props: { greeting: "Bonjour" } }] }, null, 2));

var app = new java.io.File(temp, "DefApp");
write(new java.io.File(app, "c8oProject.yaml"),
	"↑DefApp [core.Project]:\n  version: 1.0.0\n  ↓DefLib_reference [references.ProjectSchemaReference]: \n    projectName: DefLib\n");
write(new java.io.File(app, "_flow/engine.yaml"), "version: 1\nconfig: {}\n");
write(new java.io.File(app, "_flow/blocks/.keep"), "");
var dependencies = new java.io.File(app, "_flow/dependencies.json");

function freshEngine() {
	var __flowEngineDir = engineDir;
	var __flowProjectDir = String(app.getAbsolutePath());
	return eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
}
function greet(engine) {
	var run = JSON.parse(engine.run(JSON.stringify({
		definition: { version: 1, flow: { sourceVersion: 2 }, nodes: [{ id: "g", block: "greet", out: "result.message", props: {} }] },
		includeTrace: false
	})));
	assertTrue(run.ok === true, "The flow runs: " + JSON.stringify(run).slice(0, 400));
	return JSON.stringify(run.result);
}
function shrinks(engine, value) {
	var changed = JSON.parse(engine.applyMutation(JSON.stringify({ target: "flow", includeTree: false,
		definition: { version: 1, flow: { sourceVersion: 2 }, nodes: [{ id: "g", block: "greet", props: { greeting: "Other" } }] },
		mutation: { op: "replace", path: "nodes[0].props.greeting", value: value } })));
	assertTrue(changed.ok === true, "Mutation applied: " + JSON.stringify(changed).slice(0, 300));
	return changed.source.indexOf(value) < 0;
}

try {
	// No recorded version: the current defaults apply.
	var engine = freshEngine();
	assertTrue(greet(engine).indexOf("Hello") >= 0, "Without a recorded version, the current default applies");

	// Written against DefLib 1.5.0: the default of that version applies, for reading and writing.
	write(dependencies, JSON.stringify({ format: "convertigo-flow-dependencies", projects: { DefLib: "1.5.0" } }, null, 2) + "\n");
	engine = freshEngine();
	assertTrue(greet(engine).indexOf("Bonjour") >= 0, "A source written against 1.5.0 reads the 1.5.0 default");
	assertTrue(shrinks(engine, "Bonjour") && !shrinks(engine, "Hello"),
		"Shrink compares with the default of the recorded version");

	// Save: the recorded version stays while a default changed in between.
	var kept = JSON.parse(engine.dependencies(JSON.stringify({})));
	assertTrue(kept.ok === true, "Dependencies computed: " + JSON.stringify(kept).slice(0, 300));
	var keptProjects = JSON.parse(kept.source).projects;
	assertTrue(keptProjects.DefLib === "1.5.0",
		"A version whose defaults changed is kept until the sources are migrated: " + kept.source);
	assertTrue(kept.warnings.length === 1 && kept.warnings[0].code === "FLOW_DEFAULTS_MIGRATION_REQUIRED",
		"The kept version is reported");
	assertTrue(!!keptProjects.lib_flow_engine, "lib_flow_engine is a definer of every Flow project");

	// Without any default change in between, the recorded version follows the definer.
	files.forceDelete(history);
	var moved = JSON.parse(freshEngine().dependencies(JSON.stringify({})));
	assertTrue(JSON.parse(moved.source).projects.DefLib === "2.0.0" && moved.changed === true && moved.warnings.length === 0,
		"The recorded version moves to the current definer version: " + moved.source);
	assertTrue(Object.keys(JSON.parse(moved.source).projects).join(",") === Object.keys(JSON.parse(moved.source).projects).sort().join(","),
		"Projects are written in a deterministic order");
} finally {
	files.deleteQuietly(temp);
}
print("defaults-history OK");
