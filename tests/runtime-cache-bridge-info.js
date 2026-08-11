const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "../libs/flow/modules/runtime-cache-service.js"), "utf8");
const service = vm.runInNewContext(source, {});
const cache = {};
let bridgeCalls = 0;
const caches = {
	blocks: cache,
	coreBlocks: cache,
	blockArtifacts: cache,
	blockCatalogHeads: cache,
	types: cache,
	flowPlans: cache,
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
		frontendDocumentServers: {},
	},
	cacheUtils: { summary: (name) => ({ name }) },
	projectDir: () => null,
	canonicalPath: (value) => String(value),
	engineDir: () => "/engine",
	Thread: { currentThread: () => ({ getName: () => "test" }) },
	globalScope: {},
	bridgeInfo: () => {
		bridgeCalls += 1;
		return '{"generation":7,"methods":{"run":{"calls":3}}}';
	},
	flowSnapshotStats: {},
	compiledScriptCacheInfo: () => ({ name: "compiledScripts" }),
};

const first = service.info(env);
assert.strictEqual(bridgeCalls, 1, "bridge diagnostics must be pulled only when cache info is requested");
assert.strictEqual(first.bridge.generation, 7);
assert.strictEqual(first.bridge.methods.run.calls, 3);

env.globalScope.__flowBridgeInfo = '{"generation":8}';
const second = service.info(env);
assert.strictEqual(bridgeCalls, 1, "an explicitly supplied bridge snapshot remains backward compatible");
assert.strictEqual(second.bridge.generation, 8);

console.log("runtime-cache-bridge-info tests passed");
