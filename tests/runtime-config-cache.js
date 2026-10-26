// A shared runtime resolves the configuration of a running Flow once per project, Flow and named configurations,
// while the global symbols keep their generation; a layer given by the request or by another requested project is
// resolved for each call.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var source = String(FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
function assert(value, message) { if (!value) throw new Error(message); }
function extract(name) {
	var start = source.indexOf("\n\tfunction " + name + "(") + 2;
	assert(start >= 2, name + " must remain extractable");
	var end = source.lastIndexOf("\n\t}", source.indexOf("\n\tfunction ", start + 1)) + 3;
	return source.substring(start, end);
}
var service = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, "modules/project-config-service.js"), "UTF-8")));

var symbols = { "app.server": "first.example" };
var generation = 1, resolutions = 0, rootLayer;
var definition = { flow: { config: { remote: { server: "${app.server}" } } } };
var projectEngine = { version: 1, config: { remote: { port: 443 } }, configs: { staging: { remote: { port: 8443 } } } };
function makeRuntime(shared) {
	return (function () {
		var entries = {};
		var sharedRuntime = shared ? { symbolsGeneration: function () { return generation; } } : null;
		var runtimeConfigs = shared ? {
			read: function (key, fingerprint) { var e = entries[key]; return e && e.fingerprint === fingerprint ? e.value : null; },
			write: function (key, fingerprint, value) { entries[key] = { fingerprint: fingerprint, value: value }; return value; }
		} : null;
		function projectDir() { return "/workspace/projects/Lab"; }
		function projectConfigService() { return service; }
		function projectConfigEnv() {
			return {
				normalizeTree: function (value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); },
				collectConfigKeys: function () { return []; },
				globalScope: null
			};
		}
		function compileConfigSymbols(text) {
			resolutions++;
			return text.replace(/\$\{([^}=]+)(?:=([^}]*))?\}/g, function (all, name, def) {
				return symbols[name] !== undefined ? symbols[name] : def !== undefined ? def : "";
			});
		}
		function requestRootLayer() { return rootLayer; }
		function flowExecutionSnapshotService() { return { freeze: function (value) { return Object.freeze(value); } }; }
		return eval("(" + extract("runtimeEffectiveConfig") + ")");
	})();
}

var run = makeRuntime(true);
var request = { flowQName: "Lab.Read" };
var first = run(request, definition, projectEngine);
assert(first.remote.server === "first.example" && first.remote.port === 443, "the configuration is merged and resolved");
var count = resolutions;
assert(run({ flowQName: "Lab.Read" }, definition, projectEngine) === first && resolutions === count,
	"the next requests reuse the resolved configuration without resolving the symbols again");
assert(Object.isFrozen(first), "the shared configuration cannot be changed by a request");

symbols["app.server"] = "second.example"; generation++;
var second = run(request, definition, projectEngine);
assert(second !== first && second.remote.server === "second.example", "a new symbols generation resolves the configuration again");

var tagged = run({ flowQName: "Lab.Read", tagContext: { assignments: { "Lab.Read": ["t1"] },
	tags: { t1: { metadata: { flow: { configs: ["staging"] } } } } } }, definition, projectEngine);
assert(tagged.remote.port === 8443 && run(request, definition, projectEngine) === second,
	"named configurations selected by tags have their own entry");

count = resolutions;
var call = run({ flowQName: "Lab.Read", config: { remote: { server: "${app.server}" } } }, definition, projectEngine);
run({ flowQName: "Lab.Read", config: { remote: { server: "${app.server}" } } }, definition, projectEngine);
assert(call.remote.server === "second.example" && resolutions > count + 1 && !Object.isFrozen(call),
	"a configuration given by the call is resolved for each call");

rootLayer = { project: "Other", config: { remote: { port: 9000 } } };
var rooted = run(request, definition, projectEngine);
assert(rooted.remote.port === 9000 && rooted !== second, "a request for another project resolves its own layer");
rootLayer = undefined;

var plain = makeRuntime(false);
count = resolutions;
var a = plain(request, definition, projectEngine), b = plain(request, definition, projectEngine);
assert(a !== b && resolutions > count + 1, "without a shared runtime, each request resolves its configuration");

print("runtime-config-cache OK");
