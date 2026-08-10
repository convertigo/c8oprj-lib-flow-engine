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
const machines = new Map();
let clock = 0;

function machineImage(payload) {
	const definition = JSON.parse(payload);
	let index = 0;
	function visitNodes(value) {
		if (!value || typeof value !== "object") return;
		if (Array.isArray(value)) {
			value.forEach(visitNodes);
			return;
		}
		if (value.block || value.type) {
			Object.defineProperty(value, "__flowMachineNodeIndex", {
				value: index++, enumerable: false, writable: false, configurable: false,
			});
		}
		Object.keys(value).forEach((key) => {
			if (key !== "props") visitNodes(value[key]);
		});
	}
	function freeze(value) {
		if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
		Object.keys(value).forEach((key) => freeze(value[key]));
		return Object.freeze(value);
	}
	visitNodes(definition.nodes || []);
	return freeze(definition);
}

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
		sharedFlowMachineImageGet: (key) => machines.get(key) || null,
		sharedFlowMachineImagePut(key, payload) {
			if (!machines.has(key)) machines.set(key, machineImage(payload));
			return machines.get(key);
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
const firstEnv = environment(firstStats);
const secondEnv = environment(secondStats);
const first = runtime.compileFlowPlan({ flowQName: "Sample.Counter", flowSource: source }, catalog("first"), firstEnv);
const second = runtime.compileFlowPlan({ flowQName: "Sample.Counter", flowSource: source }, catalog("second"), secondEnv);

assert.strictEqual(firstStats.compiles, 1);
assert.strictEqual(firstStats.sharedMisses, 1);
assert.strictEqual(firstStats.sharedWrites, 1);
assert.strictEqual(firstStats.hydrations, 1);
assert.strictEqual(secondStats.compiles || 0, 0, "the second runtime compiled a shared neutral snapshot again");
assert.strictEqual(firstStats.machineMisses, 1);
assert.strictEqual(firstStats.machineStores, 1);
assert.strictEqual(secondStats.machineHits, 1);
assert.strictEqual(secondStats.sharedHits || 0, 0,
	"a machine image hit still deserialized the neutral snapshot");
assert.strictEqual(secondStats.hydrations || 0, 0,
	"a machine image hit still hydrated a private definition");
assert.strictEqual(first.definition, second.definition,
	"the two runtimes did not receive the same immutable definition");
assert(Object.isFrozen(first.definition));
assert(Object.isFrozen(first.definition.nodes[0]));
assert.strictEqual(first.definition.nodes[0].__flowRuntimeNode, undefined,
	"runtime state was attached to the shared machine node");
const firstCtx = {
	stopped: false, traceEnabled: false, blocks: first.blocks,
	preparedNodes: first.preparedNodes, preparation: first.preparation,
	write: () => {}, trace: () => {},
};
const secondCtx = {
	stopped: false, traceEnabled: false, blocks: second.blocks,
	preparedNodes: second.preparedNodes, preparation: second.preparation,
	write: () => {}, trace: () => {},
};
assert.strictEqual(first.preparedNodes[0], undefined);
assert.strictEqual(second.preparedNodes[0], undefined);
assert.strictEqual(runtime.executeNode(firstCtx, first.definition.nodes[0], firstEnv), "first:1");
assert.strictEqual(runtime.executeNode(secondCtx, second.definition.nodes[0], secondEnv), "second:1");
assert.strictEqual(typeof first.preparedNodes[0].execute, "function");
assert.strictEqual(typeof second.preparedNodes[0].execute, "function");
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
