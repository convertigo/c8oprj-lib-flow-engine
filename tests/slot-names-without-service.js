// The slot names of a node depend only on the block catalog: a tree walk or a validation asks
// them for every node, and each call used to create the whole flow tree service from its
// environment. The exports answer from the catalog alone.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var service = eval(String(Packages.org.apache.commons.io.FileUtils.readFileToString(
	new java.io.File(engineDir, "modules/flow-tree-service.js"), "UTF-8")));

function assertTrue(value, message) {
	if (!value) {
		throw new Error(message);
	}
}

var env = {
	blockName: function (node) { return node.block || node.type || ""; },
	blockCatalog: function (block) { return block && typeof block.catalog === "function" ? block.catalog() : {}; }
};
// creating the service reads its environment: here it fails
Object.defineProperty(env, "File", { get: function () { throw new Error("the flow tree service was created"); } });

var blocks = {
	"if": { catalog: function () { return { slots: [{ name: "then", aliases: ["$$then"] }, "else"] }; } },
	"list.map": { catalog: function () { return { children: ["select"] }; } }
};
assertTrue(JSON.stringify(service.childSlotNamesForMutation(blocks, { block: "if" }, env)) === '["then","$$then","else"]',
	"slots and aliases of the catalog");
assertTrue(JSON.stringify(service.childSlotNamesForMutation(blocks, { type: "list.map" }, env)) === '["select"]',
	"children of the catalog");
assertTrue(JSON.stringify(service.childSlotNamesForMutation(blocks, { block: "unknown" }, env))
	=== '["nodes","do","then","else","catch","finally"]', "default slots");

var definitions = service.slotDefinitions({ slots: [{ name: "then", label: "Then", scope: "branch" }] });
assertTrue(definitions.length === 1 && definitions[0].label === "Then" && definitions[0].scope === "branch"
	&& definitions[0].inline === false, "slot definitions: " + JSON.stringify(definitions));
var active = service.activeSlots({ then: [{ block: "log" }], "else": [] }, { slots: ["then", "else"] });
assertTrue(active.length === 1 && active[0].id === "then" && active[0].nodes.length === 1, "active slots: " + JSON.stringify(active));

print("slot-names-without-service: slot names from the catalog, without the service");
