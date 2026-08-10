const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "../libs/flow/modules/graph-block-runtime-service.js"), "utf8");
const graphRuntime = vm.runInNewContext(source, {});
let clock = 0;
let catalogCalls = 0;
let templateCompiles = 0;

const definition = {
	name: "profiled",
	__flowBlockId: "demo.profiled",
	props: {
		value: { kind: "value", type: "number" },
	},
	implementation: { runtime: "flow" },
	__graphDefinition: { version: 1, nodes: [] },
};
const file = {
	getAbsolutePath: () => "/tmp/profiled.block.js",
};
const env = {
	File: function () {},
	FileUtils: {},
	canonicalPath: (value) => String(value),
	fileFingerprint: () => "",
	evalCompiledSource: () => ({}),
	normalizeTree: (value) => value,
	raise(code, message) {
		const error = new Error(message);
		error.code = code;
		throw error;
	},
	blockImplementation: (value) => value.implementation || {},
	validateBlockImplementationSource: () => ({}),
	validateBlockHooksSource: () => ({}),
	parseYamlSource: () => ({}),
	graphBlockCatalog: (value) => ({ props: value.props || {} }),
	blockName: (node) => node?.block || "",
	blockCatalog(block) {
		catalogCalls += 1;
		return block.catalog();
	},
	nodeProps: (node) => Object.assign({}, node.props || {}),
	summaryText: String,
	renderTemplateTree: (_ctx, value) => value,
	readScopePath: () => undefined,
	graphBlockStackLabel: (stack) => stack.join(" > "),
	compileTemplateTree(value) {
		templateCompiles += 1;
		const match = typeof value === "string" && value.match(/^\{\{\s*local\.([A-Za-z_$][\w$]*)\s*\}\}$/);
		return match ? (ctx) => ctx.scopes.local[match[1]] : () => value;
	},
	nanoTime: () => ++clock * 1000000,
};

const block = graphRuntime.graphBlockFromDefinition(definition, file, "project", "project", env);
const originalInput = { outer: true };
const originalLocal = { kept: true, value: 42 };
const originalResult = { outer: true };
const ctx = {
	profile: { hotPath: {} },
	graphBlockStack: [],
	maxGraphBlockDepth: 8,
	scopes: {
		input: originalInput,
		props: {},
		local: originalLocal,
		result: originalResult,
		current: null,
	},
	returned: undefined,
	stopped: false,
	literal: (value) => value,
	template: (value) => value,
	expr: (value) => value,
	props: (node) => Object.assign({}, node.props || {}),
	runNodes() {
		this.scopes.result.value = this.scopes.input.value;
		return this.scopes.result;
	},
};

const node = { block: "demo.profiled", props: { value: "{{ local.value }}" } };
Object.defineProperty(node, "__flowRuntimeNode", {
	value: { props: Object.freeze({ value: "{{ local.value }}" }) },
	enumerable: false,
});
const result = block.run(ctx, node);
assert.strictEqual(result.value, 42);
originalLocal.value = 43;
assert.strictEqual(block.run(ctx, node).value, 43);
assert.strictEqual(ctx.scopes.input, originalInput);
assert.strictEqual(ctx.scopes.local, originalLocal);
assert.strictEqual(ctx.scopes.result, originalResult);
assert.strictEqual(ctx.graphBlockStack.length, 0);
assert.strictEqual(ctx.profile.hotPath.graphBlockCalls, 2);
assert.strictEqual(catalogCalls, 0, "runtime graph execution rebuilt an immutable block catalog");
assert.strictEqual(templateCompiles, 1, "graph properties were recompiled on the hot path");
assert.strictEqual(ctx.profile.hotPath.graphBlockPreparedPropsMisses, 1);
assert.strictEqual(ctx.profile.hotPath.graphBlockPreparedPropsHits, 1);
assert.ok(ctx.profile.hotPath.graphBlockCatalogMs > 0);
assert.ok(ctx.profile.hotPath.graphBlockResolvePropsMs > 0);
assert.ok(ctx.profile.hotPath.graphBlockFrameEnterMs > 0);
assert.ok(ctx.profile.hotPath.graphBlockExecuteMs > 0);
assert.ok(ctx.profile.hotPath.graphBlockFrameRestoreMs > 0);
assert.ok(ctx.profile.hotPath.graphBlockTotalMs > 0);

const preparedRunner = block.prepareNode(node, { props: node.__flowRuntimeNode.props });
originalLocal.value = 44;
assert.strictEqual(preparedRunner(ctx).value, 44);
originalLocal.value = 45;
assert.strictEqual(preparedRunner(ctx).value, 45);
assert.strictEqual(templateCompiles, 2, "prepared graph properties were rebuilt after plan preparation");
assert.strictEqual(ctx.profile.hotPath.graphBlockPreparedRunnerHits, 2);
assert.strictEqual(ctx.scopes.input, originalInput);
assert.strictEqual(ctx.scopes.local, originalLocal);
assert.strictEqual(ctx.scopes.result, originalResult);
assert.strictEqual(ctx.graphBlockStack.length, 0);

console.log("graph block runtime profile tests passed");
