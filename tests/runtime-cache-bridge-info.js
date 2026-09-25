const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "../_flow/modules/runtime-cache-service.js"), "utf8");
const service = vm.runInNewContext(source, {});
const cache = {};
const caches = {
	blocks: cache,
	coreBlocks: cache,
	blockArtifacts: cache,
	blockCatalogHeads: cache,
	types: cache,
	flowPlans: cache,
	runPlanHeads: cache,
	configDefinitions: cache,
	libraries: cache,
	engineModules: cache,
	propertyEditor: cache,
	treeSnapshots: cache,
	frontendDocuments: cache,
	expressionTokens: cache,
	expressionPrograms: cache,
};
const env = {
	runtimeState: {
		id: "runtime",
		startedAt: "now",
		caches,
		persistentFrontendDocuments: {},
		frontendDocumentServerStats: {},
	},
	cacheUtils: { summary: (name) => ({ name }) },
	projectDir: () => null,
	canonicalPath: (value) => String(value),
	engineDir: () => "/engine",
	Thread: { currentThread: () => ({ getName: () => "test" }) },
	globalScope: {},
	flowSnapshotStats: {},
	compiledScriptCacheInfo: () => ({ name: "compiledScripts" }),
};

// The Convertigo bridge publishes its diagnostics as a scope snapshot.
assert.strictEqual(Object.keys(service.info(env).bridge).length, 0, "no bridge snapshot, no bridge diagnostics");
env.globalScope.__flowBridgeInfo = '{"generation":8,"methods":{"run":{"calls":3}}}';
const info = service.info(env);
assert.strictEqual(info.bridge.generation, 8);
assert.strictEqual(info.bridge.methods.run.calls, 3);

console.log("runtime-cache-bridge-info tests passed");
