const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function load(name) {
	return vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../libs/flow/modules", name), "utf8"), {});
}

const runtime = load("flow-runtime-service.js");
const snapshotService = load("flow-execution-snapshot-service.js");
const shared = new Map();
const loading = new Set();
let clock = 0;

function testHash(value) {
	let hash = 2166136261;
	for (const character of String(value)) {
		hash ^= character.charCodeAt(0);
		hash = Math.imul(hash, 16777619);
	}
	return `hash:${hash >>> 0}`;
}

function catalog(label) {
	let calls = 0;
	return {
		"demo.counter": {
			run() {
				calls += 1;
				return `${label}:${calls}`;
			}
		}
	};
}

function environment(stats, catalogFingerprint = "catalog-1") {
	return {
		blockName: (node) => node?.block || "",
		raise(code, message) {
			const error = new Error(message);
			error.code = code;
			throw error;
		},
		parseSource: (source) => source.startsWith("function ")
			? { version: 1, nodes: [{ block: "demo.counter" }] }
			: JSON.parse(source),
		sourceForFlowRequest: (request) => request.flowSource,
		sha256Hex: testHash,
		flowPlanCompilerFingerprint: () => "compiler-1",
		flowSnapshotService: snapshotService,
		flowSnapshotStats: stats,
		runtimeHandles: {
			assertSerializable: () => {},
			closeAll: () => {},
			isHandle: () => false,
			summary: (value) => value,
			create: () => {},
			value: () => {},
			close: () => {}
		},
		isFlowScriptSource: (source) => String(source).startsWith("function "),
		flowSnapshotCatalogFingerprint: () => catalogFingerprint,
		sharedFlowSnapshotKey: (identityHash, compiler, qname) => `${qname}:${identityHash}:${compiler}`,
		sharedFlowSnapshotGet: (key) => shared.get(key) || null,
		sharedFlowSnapshotClaim(key) {
			if (shared.has(key) || loading.has(key)) return false;
			loading.add(key);
			return true;
		},
		sharedFlowSnapshotAwait: (key) => shared.get(key) || null,
		sharedFlowSnapshotAbort(key) {
			loading.delete(key);
			shared.delete(key);
		},
		sharedFlowSnapshotPut(key, payload) {
			shared.set(key, payload);
			loading.delete(key);
			return true;
		},
		blocksWithFlowHelpers: (blocks) => blocks,
		materializeFlowScriptBlock: (blocks, name) => blocks[name],
		expandFlowDefinition: (_blocks, definition) => JSON.parse(JSON.stringify(definition)),
		nanoTime: () => ++clock * 1000000
	};
}

const source = JSON.stringify({ version: 1, nodes: [{ block: "demo.counter" }] });
const firstStats = {};
const secondStats = {};
const first = runtime.compileFlowPlan({ flowQName: "Sample.Counter", flowSource: source }, catalog("first"), environment(firstStats));
const second = runtime.compileFlowPlan({ flowQName: "Sample.Counter", flowSource: source }, catalog("second"), environment(secondStats));

assert.strictEqual(firstStats.compiles, 1);
assert.strictEqual(firstStats.sharedMisses, 1);
assert.strictEqual(firstStats.sharedWrites, 1);
assert.strictEqual(firstStats.hydrations, 1);
assert.strictEqual(secondStats.compiles || 0, 0, "the second runtime compiled a shared neutral snapshot again");
assert.strictEqual(secondStats.sharedHits, 1);
assert.strictEqual(secondStats.hydrations, 1);
assert.strictEqual(first.blocks["demo.counter"].run(), "first:1");
assert.strictEqual(second.blocks["demo.counter"].run(), "second:1");
assert.notStrictEqual(first.blocks["demo.counter"].run, second.blocks["demo.counter"].run,
	"the shared snapshot leaked a runtime-local function");

const flowScriptStats = {};
runtime.compileFlowPlan({ flowQName: "Sample.Script", flowSource: "function Script() {}" }, catalog("script"), environment(flowScriptStats, ""));
assert.strictEqual(flowScriptStats.sharedSkips, 1, "FlowScript depending on a live block catalog entered the shared cache");
assert.strictEqual(flowScriptStats.compiles, 1);

const firstFlowScriptStats = {};
const changedCatalogStats = {};
runtime.compileFlowPlan({ flowQName: "Sample.ScriptCatalog", flowSource: "function ScriptCatalog() {}" },
	catalog("catalog-one"), environment(firstFlowScriptStats, "catalog-1"));
runtime.compileFlowPlan({ flowQName: "Sample.ScriptCatalog", flowSource: "function ScriptCatalog() {}" },
	catalog("catalog-two"), environment(changedCatalogStats, "catalog-2"));
assert.strictEqual(firstFlowScriptStats.sharedWrites, 1);
assert.strictEqual(changedCatalogStats.compiles, 1,
	"a FlowScript snapshot was reused after its block catalog fingerprint changed");
assert.strictEqual(changedCatalogStats.sharedWrites, 1);

const badSource = JSON.stringify({ version: 1, nodes: [{ block: "demo.counter", id: "recovered" }] });
const badIdentityHash = testHash(`source\n${badSource}`);
const badKey = `Sample.Bad:${badIdentityHash}:compiler-1`;
shared.set(badKey, "not-json");
const recoveryStats = {};
runtime.compileFlowPlan({ flowQName: "Sample.Bad", flowSource: badSource }, catalog("recovered"), environment(recoveryStats));
assert.strictEqual(recoveryStats.sharedErrors, 1);
assert.strictEqual(recoveryStats.compiles, 1);
assert.strictEqual(recoveryStats.sharedWrites, 1, "an invalid shared payload was not replaced safely");
assert.doesNotThrow(() => snapshotService.deserialize(shared.get(badKey)));

console.log("flow shared snapshot cache tests passed");
