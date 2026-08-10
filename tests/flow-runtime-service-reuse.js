const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "../libs/flow/modules/flow-runtime-service.js"), "utf8");
const runtime = vm.runInNewContext(source, {});

class FakeFile {
	constructor(parent, child) {
		this.path = child === undefined ? String(parent) : `${parent}/${child}`;
	}
}

let blockNameReads = 0;
let materializeCalls = 0;
let liveContext = { request: "first" };
let clock = 0;
const env = {
	File: FakeFile,
	nodeProps: (node) => Object.assign({}, node.props || node || {}),
	nodePath: (node) => String(node && node.id || ""),
	normalizeTree: (value) => value,
	currentProjectName: () => "Sample",
	canonicalPath: (file) => file.path,
	engineDir: () => "/engine",
	projectDir: () => "/project",
	effectiveConfig: () => ({}),
	intOption: (value, fallback) => value === undefined ? fallback : value,
	runtimeHandles: {
		assertSerializable: () => {},
		closeAll: () => {},
		isHandle: () => false,
		summary: (value) => value,
		create: () => {},
		value: () => {},
		close: () => {},
	},
	currentConvertigoContext: () => liveContext,
	nanoTime: () => ++clock * 1000000,
	materializeFlowScriptBlock(blocks, name) {
		materializeCalls += 1;
		return blocks[name].materialized;
	},
};
Object.defineProperty(env, "blockName", {
	enumerable: true,
	get() {
		blockNameReads += 1;
		return (node) => node && node.block || "";
	},
});

const first = runtime.createRunContext({}, {}, {}, {}, env);
assert.strictEqual(first.convertigoContext(), liveContext);

liveContext = { request: "second" };
const second = runtime.createRunContext({}, {}, {}, {}, env);
assert.strictEqual(second.convertigoContext(), liveContext,
	"the reused runtime service captured a stale Convertigo request context");
assert.strictEqual(first.convertigoContext(), liveContext,
	"an existing run context should resolve the current live context lazily");
assert.strictEqual(blockNameReads, 1,
	"the runtime service factory should read a stable environment only once");

let traceCalls = 0;
const concrete = { run: () => "concrete" };
second.blocks = { concrete };
second.trace = () => { traceCalls += 1; };
second.profile = { blocks: [], hotPath: {} };
assert.strictEqual(runtime.executeNode(second, { block: "concrete" }, env), "concrete");
assert.strictEqual(materializeCalls, 0,
	"a concrete block prepared by the Flow plan should bypass the dynamic loader");

const materialized = { run: () => "materialized" };
second.blocks.lazy = { __flowScriptPlaceholder: true, materialized };
assert.strictEqual(runtime.executeNode(second, { block: "lazy" }, env), "materialized");
assert.strictEqual(materializeCalls, 1,
	"a dynamic placeholder should still be materialized before execution");
assert.strictEqual(traceCalls, 2);
assert.strictEqual(second.profile.hotPath.executeNodeCalls, 2);
assert.ok(second.profile.hotPath.executeNodeResolveMs > 0);
assert.ok(second.profile.hotPath.executeNodePropsMs > 0);
assert.ok(second.profile.hotPath.executeNodeRunMs > 0);
assert.ok(second.profile.hotPath.executeNodeCommitMs > 0);
assert.ok(second.profile.hotPath.executeNodeTotalMs > 0);
assert.strictEqual(second.profile.blocks.length, 2);

console.log("flow runtime service reuse tests passed");
