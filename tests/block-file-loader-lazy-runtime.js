const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const loaderSource = fs.readFileSync(path.join(__dirname, "../libs/flow/modules/block-file-loader-service.js"), "utf8");
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
	sourceForFile: (value) => {
		sourceReads += 1;
		return `const _meta = { runtime: "rhino" }; function ${value.getName().replace(/\..*$/, "")}() {}`;
	},
	extractFlowScriptBlockMeta: () => ({ meta: { runtime: "rhino" } }),
	flowScriptBlockMetaFromRequest: () => ({}),
	normalizeTree: (value) => value,
	blockCodeRuntimeFromMeta: (meta) => meta.runtime,
	flowScriptBlockDescriptorFromMeta: (name, meta) => ({
		name,
		implementation: { runtime: meta.runtime },
		props: {},
	}),
	graphBlockCatalog: (descriptor) => descriptor,
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

loader.materializeFlowScriptBlock(blocks, "first");
assert.strictEqual(compiles, 1, "the first used block should compile exactly once");
assert.strictEqual(materializationLocks, 1, "the first materialization must enter its cold lock");
assert.strictEqual(materializationUnlocks, 1, "the first materialization must release its cold lock");
loader.materializeFlowScriptBlock(blocks, "first");
assert.strictEqual(compiles, 1, "a hot materialized block must not compile again");
assert.strictEqual(materializationLocks, 1, "a hot materialized block must bypass the cold lock");
assert.strictEqual(blocks.second.__flowScriptPlaceholder, true, "an unused block was materialized with its neighbor");

let staticAccessorCalls = 0;
loader.reserveFlowScriptBlockFile(blocks, file("third"), "core", "engine", null, env, {
	entryFor: () => {
		staticAccessorCalls += 1;
		return {
			runtime: "rhino",
			private: true,
			visibility: "private",
			catalog: { name: "third", implementation: "rhino", props: {} },
		};
	},
});
assert.strictEqual(staticAccessorCalls, 0, "reserving a block eagerly restored the workspace snapshot");
const readsBeforeStaticCatalog = sourceReads;
assert.strictEqual(blocks.third.catalog().name, "third");
assert.strictEqual(staticAccessorCalls, 1, "catalog discovery did not restore the static entry lazily");
assert.strictEqual(sourceReads, readsBeforeStaticCatalog, "static catalog hit reread the block source");
assert.strictEqual(blocks.third.private, true);
assert.strictEqual(blocks.third.visibility, "private");

console.log("block file loader lazy runtime tests passed");
