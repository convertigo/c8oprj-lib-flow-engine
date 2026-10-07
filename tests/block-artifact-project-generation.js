// A compiled block of a project or a library may keep Java classes of the class path of its project: its cached
// artifact is tied to that class path (the generation the Convertigo bridge binds for the call), a core block is not.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const loaderSource = fs.readFileSync(path.join(__dirname, "../_flow/modules/block-file-loader-service.js"), "utf8");
const loader = vm.runInNewContext(loaderSource, {});

function file(name) {
	return {
		getName: () => `${name}.block.js`,
		getParentFile: () => null,
		getAbsolutePath: () => `/blocks/${name}.block.js`,
	};
}

let generation = "App#1";
const written = [];
const read = [];
const env = {
	blockIdFromDescriptorFile: (value) => value.getName().replace(/\.block\.js$/, ""),
	readBlockArtifact: (key, fingerprint) => { read.push({ key, fingerprint }); return null; },
	writeBlockArtifact: (key, fingerprint) => { written.push({ key, fingerprint }); },
	blockSourceFingerprint: () => "source",
	blockCompilerFingerprint: "compiler",
	projectGeneration: () => generation,
	sourceForFile: () => "const _meta = { runtime: \"rhino\" };",
	normalizeTree: (value) => value,
	compileProjectBlockCode: (_blocks, name) => ({ descriptor: { name, implementation: { runtime: "rhino" }, props: {} } }),
	graphBlockFromDefinition: (descriptor) => ({ name: descriptor.name, run: () => descriptor.name, catalog: () => descriptor }),
	raise(code, message) {
		const error = new Error(`${code}: ${message}`);
		error.code = code;
		throw error;
	},
};

loader.loadFlowScriptBlockFile({}, file("own"), "project", "App", null, env);
loader.loadFlowScriptBlockFile({}, file("shared"), "reference", "lib_shared", null, env);
loader.loadFlowScriptBlockFile({}, file("log"), "core", "engine", null, env);

const fingerprint = (key) => written.find((entry) => entry.key === key).fingerprint;
assert.ok(fingerprint("App.own").endsWith("\nApp#1"), "a project block is tied to the class path of the call");
assert.ok(fingerprint("lib_shared.shared").endsWith("\nApp#1"), "a library block too");
assert.strictEqual(fingerprint("engine.log").includes("App#1"), false, "a core block is shared by all the projects");

generation = "App#2";
read.length = 0;
loader.loadFlowScriptBlockFile({}, file("own"), "project", "App", null, env);
assert.ok(read[0].fingerprint.endsWith("\nApp#2"), "a new class path compiles the block again");

delete env.projectGeneration;
written.length = 0;
loader.loadFlowScriptBlockFile({}, file("own"), "project", "App", null, env);
assert.strictEqual(written[0].fingerprint, "project\nsource\ncompiler", "an engine without class paths keeps the former identity");

console.log("block-artifact-project-generation OK");
