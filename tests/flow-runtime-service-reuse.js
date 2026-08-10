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

let preparedNodePropsCalls = 0;
let preparedRunnerBuilds = 0;
const preparedEnv = Object.assign({}, env, {
	nodeProps(node) {
		preparedNodePropsCalls += 1;
		return Object.assign({}, node.props || {});
	},
	compileExpression(source) {
		return (ctx) => ctx.scopes.input[source];
	},
	compileTemplateTree(value) {
		return () => value;
	},
	compileWriteScopePath(path) {
		return (ctx, value) => ctx.write(path, value);
	},
	literalValue(value) {
		return value;
	},
});
const preparedBlock = {
	__flowOrigin: "core",
	prepareNode(node, helpers) {
		preparedRunnerBuilds += 1;
		assert.strictEqual(helpers.props.value, 42);
		const answer = helpers.compileExpression("answer");
		return (ctx) => answer(ctx);
	},
	run: () => { throw new Error("prepared runner was not used"); },
};
const preparedNode = { block: "prepared", props: { out: "result.answer", value: 42 } };
runtime.prepareExecutionPlan({
	definition: { nodes: [preparedNode] },
	blocks: { prepared: preparedBlock },
}, preparedEnv);
assert.strictEqual(Object.prototype.propertyIsEnumerable.call(preparedNode, "__flowRuntimeNode"), false);
assert.strictEqual(JSON.stringify(preparedNode).includes("__flowRuntimeNode"), false);
assert.strictEqual(typeof preparedNode.__flowRuntimeNode.execute, "function");
const preparedWrites = [];
const preparedCtx = runtime.createRunContext({}, {}, preparedNode.__flowRuntimeNode.catalog, {}, preparedEnv);
preparedCtx.scopes.input.answer = 42;
preparedCtx.write = (out, value) => preparedWrites.push({ out, value });
preparedCtx.trace = () => {};
assert.strictEqual(runtime.executeNode(preparedCtx, preparedNode, preparedEnv), 42);
assert.deepStrictEqual(preparedWrites, [{ out: "result.answer", value: 42 }]);
assert.strictEqual(preparedNodePropsCalls, 1,
	"prepared dispatch rebuilt node properties on the hot path");
assert.strictEqual(preparedRunnerBuilds, 1,
	"prepared runner should be built exactly once with the plan");
assert.strictEqual(Object.isFrozen(preparedNode.__flowRuntimeNode.props), true);

preparedCtx.scopes.input.answer = 84;
assert.strictEqual(runtime.executeNode(preparedCtx, preparedNode, preparedEnv), 84,
	"prepared runner captured the first request value");
assert.strictEqual(preparedRunnerBuilds, 1,
	"prepared runner was rebuilt on the hot path");

let preparedFlowRunnerBuilds = 0;
const preparedFlowNode = { block: "prepared.flow", props: { out: "result.flow" } };
const preparedFlowBlock = {
	__flowOrigin: "project",
	__blockImplementationRuntime: "flow",
	prepareNode() {
		preparedFlowRunnerBuilds += 1;
		return (ctx) => ctx.scopes.input.answer + 1;
	},
	run: () => { throw new Error("prepared Flow runner was not used"); },
};
runtime.prepareExecutionPlan({
	definition: { nodes: [preparedFlowNode] },
	blocks: { "prepared.flow": preparedFlowBlock },
}, preparedEnv);
const preparedFlowWrites = [];
const preparedFlowCtx = runtime.createRunContext({}, {}, preparedFlowNode.__flowRuntimeNode.catalog, {}, preparedEnv);
preparedFlowCtx.scopes.input.answer = 9;
preparedFlowCtx.write = (out, value) => preparedFlowWrites.push({ out, value });
preparedFlowCtx.trace = () => {};
assert.strictEqual(runtime.executeNode(preparedFlowCtx, preparedFlowNode, preparedEnv), 10);
assert.deepStrictEqual(preparedFlowWrites, [{ out: "result.flow", value: 10 }]);
assert.strictEqual(preparedFlowRunnerBuilds, 1,
	"Flow composite runner should be prepared exactly once with the plan");

let sharedRunnerBuilds = 0;
const sharedNode = { block: "shared", props: { out: "result.shared", value: 7 } };
Object.defineProperty(sharedNode, "__flowMachineNodeIndex", {
	value: 0, enumerable: false, writable: false, configurable: false,
});
Object.freeze(sharedNode.props);
Object.freeze(sharedNode);
const sharedBlock = {
	__flowOrigin: "core",
	prepareNode(_node, helpers) {
		sharedRunnerBuilds += 1;
		const value = helpers.props.value;
		return () => value;
	},
	run: () => { throw new Error("shared machine prepared runner was not used"); },
};
const sharedPlan = runtime.prepareExecutionPlan({
	definition: { nodes: [sharedNode] },
	blocks: { shared: sharedBlock },
	machineImage: true,
}, preparedEnv);
assert.strictEqual(sharedNode.__flowRuntimeNode, undefined,
	"a runtime descriptor was attached to an immutable machine node");
assert.strictEqual(typeof sharedPlan.preparedNodes[0].execute, "function");
const sharedWrites = [];
const sharedCtx = runtime.createRunContext({}, sharedPlan.definition, sharedPlan.blocks, {}, sharedPlan, preparedEnv);
sharedCtx.write = (out, value) => sharedWrites.push({ out, value });
sharedCtx.trace = () => {};
assert.strictEqual(runtime.executeNode(sharedCtx, sharedNode, preparedEnv), 7);
assert.deepStrictEqual(sharedWrites, [{ out: "result.shared", value: 7 }]);
assert.strictEqual(sharedRunnerBuilds, 1,
	"the immutable machine node rebuilt its runtime runner on the hot path");

console.log("flow runtime service reuse tests passed");
