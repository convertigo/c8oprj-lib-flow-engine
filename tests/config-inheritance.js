// Inherited configuration: the engine.yaml configuration of the Flow projects a project references are its
// parents, merged value by value in the order of the references (each preceded by its own parents), under the
// project's own configuration; configParents takes a branch from a named parent; the trace tells the origin.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var workspace = java.nio.file.Files.createTempDirectory("lib-flow-engine-config-inheritance").toFile();

function project(name, references, config, extra) {
	var root = new java.io.File(workspace, name);
	var lines = ["↑convertigo: 8.5.0.m006", "↓" + name + " [core.Project]: "];
	references.forEach(function (reference, index) {
		lines.push("  ↓ref" + index + " [references.ProjectSchemaReference]: ");
		lines.push("    projectName: " + reference);
	});
	files.writeStringToFile(new java.io.File(root, "c8oProject.yaml"), lines.join("\n") + "\n", "UTF-8");
	var definition = { version: 1 };
	if (config) definition.config = config;
	Object.keys(extra || {}).forEach(function (key) { definition[key] = extra[key]; });
	files.writeStringToFile(new java.io.File(root, "_flow/engine.yaml"), JSON.stringify(definition), "UTF-8");
	return root;
}

// LibBase <- LibA ; LibB ; App references LibA then LibB
project("LibBase", [], { sql: { pool: { size: 4, timeoutMs: 1000 }, dialect: "ansi" }, email: { smtp: { host: "base.smtp", port: 25 } } });
project("LibA", ["LibBase"], { sql: { pool: { size: 8 } }, email: { smtp: { host: "a.smtp" } }, a: { only: true } });
project("LibB", [], { email: { smtp: { host: "b.smtp", security: "starttls" } }, sql: { dialect: "postgres" } });
var app = project("App", ["LibA", "LibB"], { sql: { pool: { size: 2 } }, app: { name: "demo" } });

var source = String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var __flowEngineDir = engineDir;
var __flowProjectDir = String(app.getAbsolutePath());
var engine = eval(source);

function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

function api(method, request) {
	return JSON.parse(engine[method](JSON.stringify(request)));
}

var flow = "const _flow = { sourceVersion: 2, config: { sql: { pool: { size: 99, retries: 3 } }, flowOnly: 1 } }\nfunction Proof({ input, config, result }) {\n  return { config: config }\n}\n";

var run = api("run", { flowSource: flow, includeTrace: false });
assertTrue(run.ok === true, "run: " + JSON.stringify(run).substring(0, 600));
var config = run.result.config;
// parents in reference order, last wins: LibBase < LibA < LibB, then App
assertTrue(config.email.smtp.host === "b.smtp", "LibB, the last reference, wins over LibA and LibBase: " + JSON.stringify(config.email));
assertTrue(config.email.smtp.port === 25 && config.email.smtp.security === "starttls", "values merge across parents: " + JSON.stringify(config.email));
assertTrue(config.sql.dialect === "postgres", "LibB overrides the dialect of LibBase: " + JSON.stringify(config.sql));
assertTrue(config.sql.pool.size === 2, "the project overrides its parents: " + JSON.stringify(config.sql));
assertTrue(config.sql.pool.timeoutMs === 1000, "a grandparent value stays when nobody overrides it: " + JSON.stringify(config.sql));
assertTrue(config.sql.pool.retries === 3 && config.flowOnly === 1, "the defaults of the Flow stay under the parents: " + JSON.stringify(config));
assertTrue(config.a.only === true && config.app.name === "demo", "each layer contributes its own branches: " + JSON.stringify(config));

// the call configuration wins over everything
var called = api("run", { flowSource: flow, includeTrace: false, config: { email: { smtp: { port: 2525 } } } });
assertTrue(called.result.config.email.smtp.port === 2525 && called.result.config.email.smtp.host === "b.smtp", "the call merges over the rest: " + JSON.stringify(called.result.config.email));

// configParents takes the branch from the named parent, whatever the reference order
project("App", ["LibA", "LibB"], { sql: { pool: { size: 2 } } }, { configParents: { "email.smtp": "LibA" } });
engine.cacheClear();
var selected = api("run", { flowSource: flow, includeTrace: false }).result.config;
assertTrue(selected.email.smtp.host === "a.smtp" && selected.email.smtp.port === 25 && selected.email.smtp.security === undefined,
	"email.smtp comes from LibA (with what LibA inherits from LibBase), not from LibB: " + JSON.stringify(selected.email));
assertTrue(selected.sql.dialect === "postgres", "the other branches keep the reference order: " + JSON.stringify(selected.sql));

// an unknown parent is an explicit error
project("App", ["LibA"], {}, { configParents: { "email.smtp": "LibZ" } });
engine.cacheClear();
var unknown = api("run", { flowSource: flow, includeTrace: false });
assertTrue(unknown.ok === false && JSON.stringify(unknown).indexOf("FLOW_CONFIG_PARENT_UNKNOWN") !== -1, "unknown parent: " + JSON.stringify(unknown).substring(0, 400));

// a new reference is seen at once (the parents are cached by the fingerprints of their files)
project("App", ["LibA"], { app: { name: "demo" } });
engine.cacheClear();
assertTrue(api("run", { flowSource: flow, includeTrace: false }).result.config.email.smtp.host === "a.smtp", "LibA alone");
java.lang.Thread.sleep(1100);
project("App", ["LibA", "LibB"], { app: { name: "demo" } });
assertTrue(api("run", { flowSource: flow, includeTrace: false }).result.config.email.smtp.host === "b.smtp", "a reference added later is a parent at once");

// the trace gives the origin of each value
var service = eval(String(files.readFileToString(new java.io.File(engineDir, "modules/project-config-service.js"), "UTF-8")));
project("App", ["LibA", "LibB"], { sql: { pool: { size: 2 } } }, { configParents: { "email.smtp": "LibA" } });
engine.cacheClear();
var traced = api("run", { flowSource: "const _flow = { sourceVersion: 2 }\nfunction T({ input, config, result }) {\n  return { ok: true }\n}\n", includeTrace: false });
assertTrue(traced.ok === true, "run without Flow defaults");
var env = {
	projectDir: function () { return app; },
	engineDir: function () { return new java.io.File(engineDir); },
	sourcePaths: { root: "_flow", path: function (name) { return "_flow/" + name; } },
	File: java.io.File,
	FileUtils: files,
	// the test projects write JSON (valid YAML); the engine.yaml of lib_flow_engine is real YAML with an empty config
	parseYamlSource: function (text) { try { return JSON.parse(String(text)); } catch (e) { return { config: {} }; } },
	normalizeTree: function (value) { return JSON.parse(JSON.stringify(value)); },
	collectConfigKeys: function () { return []; },
	canonicalPath: function (file) { return String(file.getCanonicalPath()); },
	fileFingerprint: function (file) { return String(file.lastModified()); },
	referencedProjectRoots: function (root) {
		var text = String(files.readFileToString(new java.io.File(root, "c8oProject.yaml"), "UTF-8"));
		var out = [], m, re = /projectName:\s*([A-Za-z0-9_.-]+)/g;
		while ((m = re.exec(text)) !== null) out.push(new java.io.File(workspace, m[1]));
		return out;
	},
	projectNameForRoot: function (root) { return String(root.getName()); },
	engineProviderName: function () { return "lib_flow_engine"; }
};
var definition = JSON.parse(String(files.readFileToString(new java.io.File(app, "_flow/engine.yaml"), "UTF-8")));
var trace = service.effectiveConfigTrace({}, { flow: {} }, definition, env);
assertTrue(trace.sources["sql.pool.size"] === "default", "project value: " + JSON.stringify(trace.sources));
assertTrue(trace.sources["sql.pool.timeoutMs"] === "parent LibBase", "grandparent value: " + JSON.stringify(trace.sources));
assertTrue(trace.sources["sql.dialect"] === "parent LibB", "parent value: " + JSON.stringify(trace.sources));
assertTrue(trace.sources["email.smtp.host"] === "parent LibA (configParents)", "selected branch: " + JSON.stringify(trace.sources));

// The project the HTTP request targets wins over the configuration of a library Flow it triggers, for the values it
// sets itself (default and the configurations of the tags of the requested sequence; not its own parents).
project("App", ["LibA", "LibB"], { email: { smtp: { host: "app.smtp" } }, sql: { pool: { size: 2 } } });
var attributes = {};
var context = { httpServletRequest: {
	getParameter: function (name) { return name === "__sequence" ? "Entry" : null; },
	getRequestURI: function () { return "/convertigo/projects/App/.json"; },
	getAttribute: function (name) { return attributes[name] === undefined ? null : attributes[name]; },
	setAttribute: function (name, value) { attributes[name] = value; }
} };
var libFlow = "const _flow = { sourceVersion: 2 }\nfunction LibProof({ input, config, result }) {\n  return { config: config }\n}\n";
var __flowProjectDir = String(new java.io.File(workspace, "LibA").getAbsolutePath());
var libEngine = eval(source);
var fromApp = JSON.parse(libEngine.run(JSON.stringify({ flowSource: libFlow, project: "LibA", includeTrace: false }))).result.config;
assertTrue(fromApp.email.smtp.host === "app.smtp", "the requested project App sets the SMTP host of the LibA Flow: " + JSON.stringify(fromApp.email));
assertTrue(fromApp.email.smtp.port === 25, "LibA keeps the values App does not set (inherited from LibBase): " + JSON.stringify(fromApp.email));
assertTrue(fromApp.sql.pool.size === 2 && fromApp.sql.dialect === "ansi", "App's own values only, not its parent LibB: " + JSON.stringify(fromApp.sql));
assertTrue(String(attributes["convertigo.flow.requestProjectConfig"]).indexOf("app.smtp") !== -1, "computed once per HTTP request");
// a request to LibA itself, or without request, keeps the configuration of LibA
attributes = {};
context.httpServletRequest.getRequestURI = function () { return "/convertigo/projects/LibA/.json"; };
var direct = JSON.parse(libEngine.run(JSON.stringify({ flowSource: libFlow, project: "LibA", includeTrace: false }))).result.config;
assertTrue(direct.email.smtp.host === "a.smtp", "a request to LibA keeps LibA's configuration: " + JSON.stringify(direct.email));
context = undefined;
var standalone = JSON.parse(libEngine.run(JSON.stringify({ flowSource: libFlow, project: "LibA", includeTrace: false }))).result.config;
assertTrue(standalone.email.smtp.host === "a.smtp", "without request, LibA's configuration: " + JSON.stringify(standalone.email));
print("config inheritance: ok");
