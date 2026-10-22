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

let sourceReads = 0;
let compiles = 0;
let catalogs = 0;
let catalogContext = "projectA";
let materializationLocks = 0;
let materializationUnlocks = 0;
const env = {
	blockIdFromDescriptorFile: (value) => value.getName().replace(/\.block\.js$/, ""),
	readBlockArtifact: () => null,
	writeBlockArtifact: () => {},
	createBlockMaterializationLock: () => ({
		lock: () => { materializationLocks += 1; },
		unlock: () => { materializationUnlocks += 1; },
	}),
	blockSourceFingerprint: () => "source",
	blockCompilerFingerprint: "compiler",
	catalogContextKey: () => catalogContext,
	sourceForFile: (value) => {
		sourceReads += 1;
		return `const _meta = { runtime: "rhino" }; function ${value.getName().replace(/\..*$/, "")}() {}`;
	},
	extractFlowScriptBlockMeta: () => ({ meta: { runtime: "rhino" } }),
	flowScriptBlockMetaFromRequest: () => ({}),
	normalizeTree: (value) => JSON.parse(JSON.stringify(value)),
	blockCodeRuntimeFromMeta: (meta) => meta.runtime,
	flowScriptBlockDescriptorFromMeta: (name, meta) => ({
		name,
		implementation: { runtime: meta.runtime },
		props: {},
	}),
	graphBlockCatalog: (descriptor) => { catalogs++; return descriptor; },
	compileProjectBlockCode: (_blocks, name) => {
		compiles += 1;
		return { descriptor: { name, implementation: { runtime: "rhino" }, props: {} } };
	},
	graphBlockFromDefinition: (descriptor) => ({
		name: descriptor.name,
		run: () => descriptor.name,
		catalog: () => descriptor,
	}),
	raise(code, message) {
		const error = new Error(`${code}: ${message}`);
		error.code = code;
		throw error;
	},
};

const blocks = {};
loader.reserveFlowScriptBlockFile(blocks, file("first"), "core", "engine", null, env);
loader.reserveFlowScriptBlockFile(blocks, file("second"), "core", "engine", null, env);

for (const method of ["implementationRuntime", "catalog", "displayName", "analyze", "analyzeShallow", "run", "materialize"]) {
	assert.strictEqual(blocks.first[method], blocks.second[method], `${method} must be shared by lazy descriptors`);
	assert.strictEqual(Object.prototype.hasOwnProperty.call(blocks.first, method), false,
		`${method} must not allocate an own placeholder closure`);
}
assert.deepStrictEqual(Object.keys(blocks.first).filter((name) => typeof blocks.first[name] === "function"), [],
	"a reserved block should contain data only");

assert.strictEqual(blocks.first.implementationRuntime(), "rhino");
assert.strictEqual(sourceReads, 1, "reading one descriptor should not parse another block");
assert.strictEqual(compiles, 0, "reading metadata should not compile a runner");

// Catalogue consumers own their copies; hot lookups do not reconstruct metadata.
const firstCatalog = blocks.first.catalog();
firstCatalog.props.changedByCaller = { type: "string" };
assert.strictEqual(blocks.first.catalog().props.changedByCaller, undefined);
assert.strictEqual(catalogs, 1, "one descriptor construction for repeated reads");
catalogContext = "projectB";
blocks.first.catalog();
assert.strictEqual(catalogs, 2, "a different project must recompose core traits");
catalogContext = "projectB-with-draft";
blocks.first.catalog();
assert.strictEqual(catalogs, 3, "a changed draft must recompose metadata");
const reloaded = {};
loader.reserveFlowScriptBlockFile(reloaded, file("first"), "core", "engine", null, env);
reloaded.first.catalog();
assert.strictEqual(catalogs, 4, "a reloaded block owns a fresh descriptor");
assert.notStrictEqual(reloaded.first.__flowCatalog, blocks.first.__flowCatalog,
	"runtime-local descriptors must not leak between block instances");

loader.materializeFlowScriptBlock(blocks, "first");
assert.strictEqual(compiles, 1, "the first used block should compile exactly once");
assert.strictEqual(materializationLocks, 1, "the first materialization must enter its cold lock");
assert.strictEqual(materializationUnlocks, 1, "the first materialization must release its cold lock");
loader.materializeFlowScriptBlock(blocks, "first");
assert.strictEqual(compiles, 1, "a hot materialized block must not compile again");
assert.strictEqual(materializationLocks, 1, "a hot materialized block must bypass the cold lock");
assert.strictEqual(blocks.second.__flowScriptPlaceholder, true, "an unused block was materialized with its neighbor");

console.log("block file loader lazy runtime tests passed");
