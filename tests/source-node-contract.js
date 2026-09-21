// Standalone Rhino tests of the shared AST boundary, not a new production dialect.
var root = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
function module(name) {
	return eval(String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(root, "modules/" + name), "UTF-8")));
}
var contract = module("source-node-contract.js").create(module("source-attribute-name-codec.js"), {
	id: "string", block: "string", disabled: "boolean", comment: "string"
});
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function rejects(fn, code) {
	try { fn(); } catch (error) { assert(error.code === code, String(error)); return; }
	throw new Error("Expected " + code);
}
var binding = { kind: "source", value: { scopeId: "orders", path: ["rows", "id"], operation: "fullsync.get" } };
var data = JSON.parse('{"id":5,"disabled":false,"props":{"id":6},"nodes":[{"id":7}],"__proto__":{"polluted":true}}');
var node = contract.readAttributes([
	{ name: "$$id", value: "countReferences" },
	{ name: "$$disabled", value: false },
	{ name: "id", value: 5 },
	{ name: "disabled", value: binding },
	{ name: "$$$id", value: "business double dollar" },
	{ name: "$id", value: "business single dollar" },
	{ name: "nodes", value: [data] },
	{ name: "props", value: { id: 8 } },
	{ name: "__proto__", value: false },
	{ name: "constructor", value: 0 },
	{ name: "toString", value: "" },
	{ name: "optional", value: null }
]);
assert(node.meta.id === "countReferences" && node.props.id === 5, "independent ids");
assert(node.meta.disabled === false && node.props.disabled.value.scopeId === "orders", "independent disabled binding");
assert(node.props.disabled.value.operation === "fullsync.get", "complete reference");
assert(node.props.$$id === "business double dollar" && node.props.$id === "business single dollar", "escape");
assert(node.props.constructor === 0 && node.props.toString === "" && node.props.optional === null, "explicit defaults");
assert(Object.prototype.hasOwnProperty.call(node.props, "__proto__") && node.props.__proto__ === false, "prototype key");
assert(({}).polluted === undefined, "no prototype mutation");
var child = contract.readAttributes([{ name: "$$id", value: "child" }, { name: "id", value: "row" }]);
node.slots.nodes = [child];
var snapshot = contract.snapshot(node);
assert(snapshot.slots.nodes[0].meta.id === "child", "structural child");
assert(JSON.stringify(snapshot.props.nodes[0]) === JSON.stringify(data), "business data never interpreted as a node");
var reparsed = contract.readAttributes(contract.writeAttributes(snapshot));
assert(JSON.stringify(reparsed.meta) === JSON.stringify(snapshot.meta), "metadata read/write/read");
assert(JSON.stringify(reparsed.props) === JSON.stringify(snapshot.props), "properties read/write/read");
assert(Object.keys(reparsed.slots).length === 0, "slots separate from attributes");
snapshot.slots.nodes[0].props.id = "modified";
snapshot.props.disabled.value.path.push("changed");
assert(child.props.id === "row" && binding.value.path.length === 2, "snapshot has no aliases");
assert(node.props.disabled.value.path.length === 2, "source not mutated");
rejects(function () { contract.readAttributes([{ name: "$$typo", value: true }]); }, "FLOW_SOURCE_ENGINE_ATTRIBUTE_UNKNOWN");
rejects(function () { contract.readAttributes([{ name: "$$disabled", value: "false" }]); }, "FLOW_SOURCE_ENGINE_ATTRIBUTE_TYPE");
rejects(function () { contract.readAttributes([{ name: "$$id", value: 5 }]); }, "FLOW_SOURCE_ENGINE_ATTRIBUTE_TYPE");
rejects(function () { contract.readAttributes([{ name: "$$id", value: "" }]); }, "FLOW_SOURCE_ENGINE_ATTRIBUTE_TYPE");
rejects(function () { contract.readAttributes([{ name: "id", value: 1 }, { name: "id", value: 2 }]); }, "FLOW_SOURCE_DUPLICATE_ATTRIBUTE");
rejects(function () { contract.readAttributes([{ name: "$$id", value: "a" }, { name: "$$id", value: "b" }]); }, "FLOW_SOURCE_DUPLICATE_ATTRIBUTE");
rejects(function () { contract.snapshot({ meta: {}, props: {}, slots: {}, id: "flat" }); }, "FLOW_AST_UNKNOWN_FIELD");
rejects(function () { contract.snapshot({ meta: {}, props: {}, slots: { then: {} } }); }, "FLOW_AST_EXPECTED_SLOT");
[undefined, NaN, Infinity, function () {}, new Date()].forEach(function (value) {
	rejects(function () { contract.readAttributes([{ name: "value", value: value }]); }, "FLOW_AST_NON_JSON_VALUE");
});
var cyclic = {}; cyclic.self = cyclic;
rejects(function () { contract.readAttributes([{ name: "value", value: cyclic }]); }, "FLOW_AST_CYCLIC_VALUE");
var cyclicNode = contract.readAttributes([]); cyclicNode.slots.nodes = [cyclicNode];
rejects(function () { contract.snapshot(cyclicNode); }, "FLOW_AST_CYCLIC_VALUE");
var sparse = []; sparse.length = 2;
rejects(function () { contract.readAttributes([{ name: "value", value: sparse }]); }, "FLOW_AST_NON_JSON_VALUE");
var getter = {}; Object.defineProperty(getter, "id", { enumerable: true, get: function () { throw new Error("getter ran"); } });
rejects(function () { contract.readAttributes([{ name: "value", value: getter }]); }, "FLOW_AST_NON_JSON_VALUE");
var began = java.lang.System.nanoTime();
for (var i = 0; i < 1000; i++) contract.snapshot(node);
print("source-node-contract OK (" + checks + " checks; 1000 snapshots " + ((java.lang.System.nanoTime() - began) / 1000000).toFixed(1) + " ms)");
