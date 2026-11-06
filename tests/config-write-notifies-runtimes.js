// _flow/engine.yaml written by the engine (resource patch or delete, as flow-resource-patch does) is a source Convertigo
// did not write: the engine tells it (FlowEngineBridge.notifySourceMutation), as for the blocks it writes, so that the
// runtimes of the server read the new configuration at their next call. Before, a server runtime kept the configuration
// read before the write: Convertigo serves the stamp of a file it read for up to a minute, the stamp keys the parsed
// configuration, and a Flow run just after the write (sql.initialize of an initializer just declared) answered with the
// previous configuration (SQL_INITIALIZER_UNKNOWN ... none configured) until flow-cache-clear (runs i5l2_*, it2 to it5).
//
// Two engines stand for two runtimes of one server: the writer (the MCP) and the runner (the Flows of the project). The
// writer sees a recording stand-in of FlowEngineBridge. The runner sees the stamps of the server, kept as Convertigo
// keeps them until the project is invalidated; on each notification, the test does what Convertigo does (the snapshots
// of the project forgotten, a new data generation, the caches of the runtimes cleared at their next call).
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-config-write-notifies-").toFile().getCanonicalFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
try {
	var engineSource = String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
	var notifications = [];
	var stamps = {};
	// Packages, FlowEngineBridge replaced by leaf(bridge), all else unchanged
	function overlay(real, path, leaf) {
		return new Proxy({}, {
			get: function (target, key) {
				if (String(key) !== path[0]) return real[key];
				return path.length === 1 ? leaf(real[key]) : overlay(real[key], path.slice(1), leaf);
			}
		});
	}
	function bridgeOverlay(overrides) {
		return overlay(Packages, ["com", "twinsoft", "convertigo", "engine", "flow", "FlowEngineBridge"], function (bridge) {
			return new Proxy({}, {
				get: function (target, key) {
					return Object.prototype.hasOwnProperty.call(overrides, String(key)) ? overrides[String(key)] : bridge[key];
				}
			});
		});
	}
	var writer = (function (Packages) { return eval(engineSource); })(bridgeOverlay({
		notifySourceMutationWithReveal: function (projectDir, sourcePath, reveal) {
			notifications.push({ projectDir: String(projectDir), sourcePath: String(sourcePath), reveal: reveal === true });
		}
	}));
	// the stamp of a file as the server serves it: the first one read, until the project is invalidated
	var runner = (function (Packages) { return eval(engineSource); })(bridgeOverlay({
		serverFileFingerprint: function (file) {
			var path = String(file.getCanonicalPath());
			if (!Object.prototype.hasOwnProperty.call(stamps, path)) {
				stamps[path] = file.exists() ? path + "#" + file.lastModified() + ":" + file.length() : "missing:" + path;
			}
			return stamps[path];
		}
	}));
	function api(engine, name, request) { return JSON.parse(engine[name](JSON.stringify(request))); }

	var engineFile = new java.io.File(project, "_flow/engine.yaml");
	files.writeStringToFile(engineFile, "version: 1\nconfig:\n  proof:\n    word: v1\n", "UTF-8");
	var flowSource = 'const _flow = {sourceVersion:2}\nfunction Configured({ input, config, result }) {\n  return { word: config.proof.word }\n}\n';
	files.writeStringToFile(new java.io.File(project, "_flow/flows/Configured.flow.js"), flowSource, "UTF-8");
	function run() {
		var out = api(runner, "run", { flowSource: flowSource, flowName: "Configured", flowQName: "Proof.Configured", projectDir: __flowProjectDir, includeTrace: false });
		assert(out.ok !== false, "run: " + JSON.stringify(out).substring(0, 800));
		return String(out.result && out.result.word);
	}
	// what Convertigo does when told: the snapshots of the project forgotten, the runtimes cleared at their next call
	function deliver() {
		var told = notifications.splice(0);
		if (told.length) {
			stamps = {};
			runner.cacheClear("{}");
		}
		return told;
	}
	function written(label, told) {
		assert(told.length > 0, label + " did not tell Convertigo that the configuration of the project changed");
		assert(told.every(function (each) { return each.projectDir === __flowProjectDir && each.reveal === false; }),
			label + " told another project or asked to reveal: " + JSON.stringify(told));
		assert(told.some(function (each) { return /_flow\/engine\.yaml$/.test(String(each.sourcePath).replace(/\\/g, "/")); }),
			label + " did not name engine.yaml: " + JSON.stringify(told));
	}
	assert(run() === "v1", "the first run reads the first configuration");

	// a resource patch of engine.yaml: the next run reads the new configuration
	var current = api(writer, "resourceGet", { projectDir: __flowProjectDir, path: "_flow/engine.yaml" });
	var patched = api(writer, "resourcePatch", { projectDir: __flowProjectDir, path: "_flow/engine.yaml", baseHash: current.hash,
		patch: "--- a/_flow/engine.yaml\n+++ b/_flow/engine.yaml\n@@ -1,4 +1,4 @@\n version: 1\n config:\n   proof:\n-    word: v1\n+    word: v2-patched\n" });
	assert(patched.ok && patched.changed, "resourcePatch: " + JSON.stringify(patched));
	// the symptom of the runs: until Convertigo is told, the server runtime keeps the configuration it read
	assert(run() === "v1", "the stand-in of the server stamps no longer keeps the configuration read before the write");
	written("resource patch of engine.yaml", deliver());
	assert(run() === "v2-patched", "after a resource patch of engine.yaml, the Flow still read the previous configuration");

	// a dry run writes nothing and tells nothing
	var again = api(writer, "resourceGet", { projectDir: __flowProjectDir, path: "_flow/engine.yaml" });
	var dry = api(writer, "resourcePatch", { projectDir: __flowProjectDir, path: "_flow/engine.yaml", baseHash: again.hash, dryRun: true,
		patch: "--- a/_flow/engine.yaml\n+++ b/_flow/engine.yaml\n@@ -1,4 +1,4 @@\n version: 1\n config:\n   proof:\n-    word: v2-patched\n+    word: v3\n" });
	assert(dry.ok && dry.dryRun === true, "dry run: " + JSON.stringify(dry));
	assert(deliver().length === 0, "a dry run told Convertigo of a change");
	assert(run() === "v2-patched", "a dry run changed the configuration");

	// another resource of the project is not the configuration: nothing is told for it
	var doc = api(writer, "resourcePatch", { projectDir: __flowProjectDir, path: "docs/notes.md",
		patch: "--- /dev/null\n+++ b/docs/notes.md\n@@ -0,0 +1,1 @@\n+Notes.\n" });
	assert(doc.ok, "resourcePatch docs: " + JSON.stringify(doc));
	assert(deliver().length === 0, "a document of the project told Convertigo that its configuration changed");

	print("config-write-notifies-runtimes OK (" + checks + " checks)");
} finally {
	files.deleteQuietly(project);
}
