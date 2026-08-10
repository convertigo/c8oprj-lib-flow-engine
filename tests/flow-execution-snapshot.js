const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "../libs/flow/modules/flow-execution-snapshot-service.js"), "utf8");
const service = vm.runInNewContext(source, {});
const original = {
	version: 1,
	nodes: [{ block: "demo.counter", props: { value: "{{ input.value }}" } }]
};
const snapshot = service.create({
	flowQName: "Sample.Counter",
	sourceHash: "source-1",
	compilerFingerprint: "compiler-1",
	definition: original
});

assert.strictEqual(snapshot.format, "convertigo.flow.execution-snapshot");
assert.strictEqual(snapshot.version, 1);
assert.deepStrictEqual(Array.from(snapshot.blockNames), ["demo.counter"]);
assert(snapshot.payloadBytes > 0);
assert(Object.isFrozen(snapshot));
assert(Object.isFrozen(snapshot.definition));
assert(Object.isFrozen(snapshot.definition.nodes[0]));

original.nodes[0].props.value = "changed";
assert.strictEqual(snapshot.definition.nodes[0].props.value, "{{ input.value }}",
	"the snapshot retained mutable input data");

assert.throws(() => service.create({ definition: { nodes: [{ block: "bad", run() {} }] } }),
	/JSON-compatible values/);

function catalog(label) {
	let count = 0;
	return {
		"demo.counter": {
			run() {
				count += 1;
				return `${label}:${count}`;
			}
		}
	};
}

const firstCatalog = catalog("first");
const secondCatalog = catalog("second");
const hydrateEnv = {
	blocksWithFlowHelpers: (blocks) => blocks,
	materializeDefinitionBlocks: () => {},
	expandFlowDefinition: (_blocks, definition) => JSON.parse(JSON.stringify(definition))
};
const first = service.hydrate(snapshot, firstCatalog, hydrateEnv);
const second = service.hydrate(service.deserialize(service.serialize(snapshot)), secondCatalog, hydrateEnv);

assert.notStrictEqual(first.blocks, second.blocks);
assert.notStrictEqual(first.blocks["demo.counter"].run, second.blocks["demo.counter"].run);
assert.notStrictEqual(first.definition, second.definition);
assert.deepStrictEqual(JSON.parse(JSON.stringify(first.definition)), JSON.parse(JSON.stringify(second.definition)));
assert.strictEqual(first.blocks["demo.counter"].run(), "first:1");
assert.strictEqual(first.blocks["demo.counter"].run(), "first:2");
assert.strictEqual(second.blocks["demo.counter"].run(), "second:1",
	"hydrated runtimes shared closure state");

console.log("flow execution snapshot tests passed");
