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
const firstLiveContext = { request: "first" };
const secondLiveContext = { request: "second" };
let liveContext = firstLiveContext;
let liveProjectDir = "/project/first";
let clock = 0;
let effectiveConfigCalls = 0;
let canonicalPathCalls = 0;
let schemaRead = null;
const env = {
	File: FakeFile,
	nodeProps: (node) => Object.assign({}, node.props || node || {}),
	nodePath: (node) => String(node && node.id || ""),
	normalizeTree: (value) => value,
	currentProjectName: () => "Sample",
	canonicalPath(file) {
		canonicalPathCalls += 1;
		return file.path;
	},
	engineDir: () => new FakeFile("/engine"),
	projectDir: () => new FakeFile(liveProjectDir),
	effectiveConfig(_request, _definition, projectEngine) {
		effectiveConfigCalls += 1;
		return { name: projectEngine.name || "none" };
	},
	readOutputSchema(request, definition, node, property, outPath) {
		schemaRead = { request, definition, node, property, outPath };
		return { type: "string" };
	},
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
assert.strictEqual(first.convertigoContext(), firstLiveContext);
assert.strictEqual(effectiveConfigCalls, 0,
	"the best-case request frame should not build configuration before it is read");
assert.strictEqual(canonicalPathCalls, 0,
	"the best-case request frame should not canonicalize technical paths before they are read");

let projectEngineLoads = 0;
const lazy = runtime.createRunContext({}, {}, {}, () => {
	projectEngineLoads += 1;
	return { name: "sample" };
}, env);
assert.strictEqual(projectEngineLoads, 0,
	"the project Engine definition should stay unloaded on a config-free Flow");
assert.deepStrictEqual(lazy.scopes.config, { name: "sample" });
assert.strictEqual(projectEngineLoads, 1);
assert.strictEqual(effectiveConfigCalls, 1);
assert.strictEqual(lazy.engine.name, "sample");
assert.strictEqual(projectEngineLoads, 1,
	"config and engine should share one project Engine definition load");
assert.strictEqual(lazy.scopes.config, lazy.scopes.config,
	"the effective config should be materialized only once");
assert.strictEqual(effectiveConfigCalls, 1);
assert.strictEqual(lazy.scopes.request.engineDir, "/engine");
assert.strictEqual(canonicalPathCalls, 1);
assert.strictEqual(lazy.scopes.request.engineDir, "/engine");
assert.strictEqual(canonicalPathCalls, 1,
	"a technical request path should be canonicalized only on its first read");

liveContext = secondLiveContext;
liveProjectDir = "/project/second";
const second = runtime.createRunContext({}, {}, {}, {}, env);
assert.strictEqual(second.convertigoContext(), secondLiveContext,
	"the second frame did not capture its Convertigo request context");
assert.strictEqual(first.convertigoContext(), firstLiveContext,
	"a Flow frame resolved another invocation's Convertigo context");
assert.strictEqual(first.scopes.request.projectDir, "/project/first",
	"a Flow frame resolved another invocation's project directory");
assert.strictEqual(second.scopes.request.projectDir, "/project/second",
	"the second frame did not capture its project directory");
assert.strictEqual(blockNameReads, 1,
	"the runtime service factory should read a stable environment only once");
assert.strictEqual(
	Object.getOwnPropertyDescriptor(first.scopes.request, "engineDir").get,
	Object.getOwnPropertyDescriptor(second.scopes.request, "engineDir").get,
	"technical request getters should be shared instead of allocating request closures"
);
assert.strictEqual(
	Object.getOwnPropertyDescriptor(first.scopes, "config").get,
	Object.getOwnPropertyDescriptor(second.scopes, "config").get,
	"config getters should be shared instead of allocating request closures"
);
assert.strictEqual(
	Object.getOwnPropertyDescriptor(first, "engine").get,
	Object.getOwnPropertyDescriptor(second, "engine").get,
	"project Engine getters should be shared instead of allocating request closures"
);
assert.strictEqual(Object.keys(first.scopes.request).includes("engineDir"), true,
	"shared lazy accessors must preserve request field enumerability");
assert.strictEqual(Object.keys(first.scopes.request).includes("__flowFrameState"), false,
	"the private frame state must not leak into request data");

let envelopeRuns = 0;
const envelopeNode = { block: "envelope.ok" };
const envelopeBlocks = {
	"envelope.ok": {
		__flowOrigin: "core",
		run(ctx) {
			assert.strictEqual(ctx.profile, undefined,
				"envelope profiling must preserve the direct unprofiled node path");
			envelopeRuns += 1;
			ctx.scopes.result.ok = true;
			return true;
		},
	},
};
const envelopePlan = {
	definition: { nodes: [envelopeNode] },
	blocks: envelopeBlocks,
	preparedNodes: null,
	preparation: {
		mode: "lazy",
		preparedNodes: 0,
		preparedRunners: 0,
		preparedWriters: 0,
		materializedBlocks: 0,
	},
};
const envelopeEnv = Object.assign({}, env, {
	readRunPlanHead: () => ({ blocks: envelopeBlocks, plan: envelopePlan }),
	loadProjectEngineDefinition: () => ({}),
	snapshot: (value) => value,
	learnResultSchema: () => null,
	schemaSummary: (value) => value,
});
const envelopeResult = runtime.runFlowRequest({
	profile: "envelope",
	includeTrace: false,
	__deferResultSerializationSafety: true,
}, undefined, envelopeEnv);
assert.strictEqual(envelopeResult.ok, true);
assert.strictEqual(JSON.stringify(envelopeResult.result), JSON.stringify({ ok: true }));
assert.strictEqual(envelopeRuns, 1);
assert.strictEqual(envelopeResult.profile.mode, "envelope");
assert.strictEqual(envelopeResult.profile.runPlanHeadHit, true);
assert.strictEqual(envelopeResult.profile.blocks, undefined,
	"envelope profiling must not allocate deep per-block samples");
assert.strictEqual(envelopeResult.profile.hotPath, undefined,
	"envelope profiling must not allocate deep hot-path counters");
for (const name of ["createContextMs", "executeNodesMs", "runFlowRequestMs"]) {
	assert.ok(envelopeResult.profile[name] > 0, `missing envelope phase ${name}`);
}
for (const name of ["captureInvocationMs", "requestScopeMs", "scopesMs", "frameObjectMs", "lazyCapabilitiesMs", "totalMs"]) {
	assert.ok(envelopeResult.profile.createContext[name] > 0, `missing frame phase ${name}`);
}

for (const name of ["props", "read", "write", "expr", "template", "runNodes", "callBlock", "trace"]) {
	assert.strictEqual(first[name], second[name], `${name} should be shared by all request frames`);
	assert.strictEqual(Object.prototype.hasOwnProperty.call(first, name), false,
		`${name} should not allocate an own request closure`);
}
assert.deepStrictEqual(
	Object.keys(first).filter((name) => typeof first[name] === "function"),
	["__installColdContextMethods"],
	"the best-case request frame should allocate only one lazy capability installer"
);
assert.strictEqual(first.__installColdContextMethods, second.__installColdContextMethods,
	"the lazy capability installer should be shared by all request frames");
assert.strictEqual(Object.prototype.hasOwnProperty.call(first, "flowCodeGet"), false);
assert.strictEqual(typeof first.flowCodeGet, "function");
assert.strictEqual(Object.prototype.hasOwnProperty.call(first, "flowCodeGet"), true,
	"the authoring capability should materialize only when first requested");
assert.strictEqual(Object.prototype.hasOwnProperty.call(first, "__installColdContextMethods"), false);
const schemaNode = { id: "schema-node" };
assert.deepStrictEqual(first.schemaForOutput(schemaNode, "value", "result.value"), { type: "string" });
assert.strictEqual(schemaRead.request, first.request,
	"shared cold methods should retain the request from their owning frame");
assert.strictEqual(schemaRead.definition, first.definition,
	"shared cold methods should retain the definition from their owning frame");
assert.strictEqual(schemaRead.node, schemaNode);
assert.strictEqual(Object.prototype.hasOwnProperty.call(second, "flowCodeGet"), false,
	"materializing cold capabilities in one frame must not affect another frame");

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
assert.strictEqual(preparedNode.__flowRuntimeNode, undefined,
	"plan compilation should not prepare a node before it is reached");
const preparedWrites = [];
const preparedCtx = runtime.createRunContext({}, {}, { prepared: preparedBlock }, {}, null, preparedEnv);
preparedCtx.scopes.input.answer = 42;
preparedCtx.write = (out, value) => preparedWrites.push({ out, value });
preparedCtx.trace = () => {};
assert.strictEqual(runtime.executeNode(preparedCtx, preparedNode, preparedEnv), 42);
assert.strictEqual(Object.prototype.propertyIsEnumerable.call(preparedNode, "__flowRuntimeNode"), false);
assert.strictEqual(JSON.stringify(preparedNode).includes("__flowRuntimeNode"), false);
assert.strictEqual(typeof preparedNode.__flowRuntimeNode.execute, "function");
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
assert.strictEqual(preparedFlowNode.__flowRuntimeNode, undefined);
const preparedFlowWrites = [];
const preparedFlowCtx = runtime.createRunContext({}, {}, { "prepared.flow": preparedFlowBlock }, {}, null, preparedEnv);
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
assert.strictEqual(sharedPlan.preparedNodes[0], undefined,
	"an immutable machine runner was prepared before its node was reached");
const sharedWrites = [];
const sharedCtx = runtime.createRunContext({}, sharedPlan.definition, sharedPlan.blocks, {}, sharedPlan, preparedEnv);
sharedCtx.write = (out, value) => sharedWrites.push({ out, value });
sharedCtx.trace = () => {};
assert.strictEqual(runtime.executeNode(sharedCtx, sharedNode, preparedEnv), 7);
assert.strictEqual(typeof sharedPlan.preparedNodes[0].execute, "function");
assert.deepStrictEqual(sharedWrites, [{ out: "result.shared", value: 7 }]);
assert.strictEqual(sharedRunnerBuilds, 1,
	"the immutable machine node rebuilt its runtime runner on the hot path");

console.log("flow runtime service reuse tests passed");
