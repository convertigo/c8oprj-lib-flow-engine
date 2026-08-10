const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "../libs/flow/modules/flow-runtime-service.js"), "utf8");
const runtime = vm.runInNewContext(source, {});

class FakeFile {
	constructor(parent, child) { this.path = child === undefined ? String(parent) : `${parent}/${child}`; }
}

let runnerBuilds = 0;
const env = {
	File: FakeFile,
	blockName: (node) => node && node.block || "",
	nodeProps: (node) => Object.assign({}, node && node.props || {}),
	nodePath: (node) => String(node && node.id || ""),
	normalizeTree: (value) => value,
	currentProjectName: () => "Sample",
	canonicalPath: (value) => value.path || String(value),
	engineDir: () => "/engine",
	projectDir: () => "/project",
	effectiveConfig: () => ({}),
	intOption: (value, fallback) => value === undefined ? fallback : value,
	readScopePath: () => undefined,
	readObjectPath: () => undefined,
	writeScopePath: () => undefined,
	compileWriteScopePath: () => () => undefined,
	evaluateExpression: () => undefined,
	compileExpression: () => () => undefined,
	compileTemplateTree: (value) => () => value,
	literalValue: (value) => value,
	renderTemplate: (_template, ctx) => ctx,
	renderTemplateTree: (_ctx, value) => value,
	inputValue: () => undefined,
	safeFilePart: String,
	loadFlowLibrary: () => ({}),
	currentConvertigoContext: () => ({}),
	runtimeHandles: {
		assertSerializable: () => {}, closeAll: () => {}, isHandle: () => false,
		summary: (value) => value, create: () => {}, value: () => {}, close: () => {},
	},
};

const branch = (name) => ({
	__flowOrigin: "core",
	prepareNode() {
		runnerBuilds += 1;
		return (ctx, node) => {
			ctx.scopes.local.executed.push(node.id);
			return node.id;
		};
	},
	run: () => { throw new Error(`unprepared ${name} runner used`); },
});
const blocks = {
	if: {
		__flowOrigin: "core",
		prepareNode() {
			runnerBuilds += 1;
			return (ctx, node) => ctx.runNodes(ctx.scopes.input.takeThen ? node.then : node.else);
		},
		run: () => { throw new Error("unprepared if runner used"); },
	},
	then: branch("then"),
	else: branch("else"),
};

let index = 0;
function machineNode(node) {
	Object.defineProperty(node, "__flowMachineNodeIndex", {
		value: index++, enumerable: false, writable: false, configurable: false,
	});
	Object.freeze(node.props || {});
	for (const key of ["then", "else"]) {
		(node[key] || []).forEach(machineNode);
		Object.freeze(node[key] || []);
	}
	return Object.freeze(node);
}

const thenNode = { id: "then", block: "then", props: {} };
const elseNodes = Array.from({ length: 64 }, (_, item) => ({ id: `else-${item}`, block: "else", props: {} }));
const root = machineNode({ id: "branch", block: "if", props: {}, then: [thenNode], else: elseNodes });
const definition = Object.freeze({ nodes: Object.freeze([root]) });
const plan = runtime.prepareExecutionPlan({ definition, blocks, machineImage: true }, env);

assert.strictEqual(plan.preparedNodes.filter(Boolean).length, 0,
	"plan preparation should not build runners for branches that may never execute");
assert.strictEqual(runnerBuilds, 0);

const ctx = runtime.createRunContext({ input: { takeThen: true } }, definition, blocks, {}, plan, env);
ctx.scopes.local.executed = [];
ctx.trace = () => {};
runtime.executeNodes(ctx, definition.nodes, env);
assert.deepStrictEqual(ctx.scopes.local.executed, ["then"]);
assert.strictEqual(runnerBuilds, 2, "only the branch dispatcher and the selected child should be prepared");
assert.strictEqual(plan.preparedNodes.filter(Boolean).length, 2);

ctx.scopes.input.takeThen = true;
ctx.stopped = false;
runtime.executeNodes(ctx, definition.nodes, env);
assert.strictEqual(runnerBuilds, 2, "hot execution should reuse the selected branch runners");

ctx.scopes.input.takeThen = false;
ctx.stopped = false;
runtime.executeNodes(ctx, definition.nodes, env);
assert.strictEqual(runnerBuilds, 66, "the alternate branch should prepare only when first reached");
assert.strictEqual(plan.preparedNodes.filter(Boolean).length, 66);

console.log("flow lazy preparation tests passed");
