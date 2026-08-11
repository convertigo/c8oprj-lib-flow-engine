const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const cacheUtilsSource = fs.readFileSync(path.join(__dirname, "../libs/flow/modules/cache-utils.js"), "utf8");
const serviceSource = fs.readFileSync(path.join(__dirname, "../libs/flow/modules/run-plan-head-service.js"), "utf8");
const cacheUtils = vm.runInNewContext(cacheUtilsSource, {});
const service = vm.runInNewContext(serviceSource, {});

const cache = cacheUtils.createBoundedMapState(2);
let now = 1000;
let projectDir = "/projects/Sample";
const env = {
	cache,
	projectDir: () => projectDir,
	currentTimeMillis: () => now,
	probeIntervalMs: 60000,
	writeRuntimeBoundedCache: cacheUtils.writeBoundedMap,
	clearRuntimeBoundedCache: cacheUtils.clearBoundedMap,
};

const request = {
	flowQName: "Sample.Minimal",
	flowSource: "function Minimal({ result }) { result.ok = true }",
};
const blocks = { set: {} };
const plan = { definition: { nodes: [] } };

assert.strictEqual(service.read(request, env), null);
assert.strictEqual(cache.misses, 1);
service.write(request, blocks, plan, env);
assert.strictEqual(service.read(request, env).plan, plan);
assert.strictEqual(cache.hits, 1);

now += 59999;
assert.strictEqual(service.read(request, env).blocks, blocks,
	"a hot run plan should not probe the catalog before 60 seconds");

const changedSource = Object.assign({}, request, {
	flowSource: "function Minimal({ result }) { result.ok = false }",
});
assert.strictEqual(service.read(changedSource, env), null,
	"a Flow source change must invalidate the head immediately");

now += 1;
assert.strictEqual(service.read(request, env), null,
	"the catalog must be revalidated when the 60 second window expires");
const refreshedBlocks = { set: {}, changed: {} };
const refreshedPlan = { definition: { nodes: [{ block: "changed" }] } };
service.write(request, refreshedBlocks, refreshedPlan, env);
assert.strictEqual(service.read(request, env).plan, refreshedPlan);

projectDir = "/projects/Other";
assert.strictEqual(service.read(request, env), null,
	"run plan heads must be isolated by project directory");
projectDir = "/projects/Sample";

service.clear(env);
assert.strictEqual(cache.size, 0,
	"an explicit block catalog invalidation must discard every run plan head");
assert.strictEqual(service.read(request, env), null);

assert.strictEqual(service.read({ flowQName: "Sample.ByNameOnly" }, env), null,
	"a named Flow without an embedded source must keep the existing disk-aware path");

console.log("run plan head service tests passed");
