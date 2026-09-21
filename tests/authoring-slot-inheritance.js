var engineDir = new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsoluteFile();
var service = eval(String(Packages.org.apache.commons.io.FileUtils.readFileToString(
	new java.io.File(engineDir, "modules/flow-tree-service.js"), "UTF-8")));
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function assertTrue(value, message) { if (!value) throw new Error(message); }
var env = {
	jsonMapper: { readTree: JSON.parse }, yamlMapper: { writeValueAsString: JSON.stringify },
	parseYamlSource: JSON.parse, normalizeTree: clone, compact: JSON.stringify, compactPlain: JSON.stringify,
	blockCatalog: function () { return []; }, catalogDefinition: function () { return { groups: [], types: [] }; },
	listFlowLibraries: function () { return []; },
	frontendBlocksForSettings: function () { return []; },
	frontendCreateDescriptorsForSettings: function () { return []; },
	frontendCreateDescriptorsForConfig: function () { return []; },
	raise: function (code, message) { throw new Error(code + ": " + message); }
};
function node(path, slots, ownerPath, slotId) {
	return { path: path, kind: "providerNode", type: "providerType", children: [],
		info: { sourceWritable: true, sourceMutationPath: path, slots: slots,
			parentSlot: ownerPath ? { ownerPath: ownerPath, slotId: slotId } : undefined } };
}
function inherited(path) { return { acceptsFrom: "parentSlot", sourceMutationPath: path }; }
function explicit(traits, path) { return { accepts: traits, sourceMutationPath: path }; }
var root = node("root", { content: explicit(["ui.block", "ui.control"], "content") });
var outer = node("outer", { then: inherited("then"), otherwise: inherited("otherwise") }, "root", "content");
var inner = node("inner", { then: inherited("nestedThen") }, "outer", "then");
var event = node("event", { actions: explicit(["ui.action"], "actions") }, "outer", "then");
// Deliberately unrelated visual ancestry: semantic references must be authoritative.
var tree = { children: [node("visualFolder", {}), inner, event, root, outer], descriptors: [
	{ id: "text", traits: ["ui.block"], insert: {} },
	{ id: "control", traits: ["ui.control"], insert: {} },
	{ id: "action", traits: ["ui.action"], insert: {} },
	{ id: "field", traits: ["json.field"], insert: {} },
	{ id: "untyped", targetKinds: ["providerNode"], insert: {} }
] };
function palette(focus, fixture) {
	return service.authoringPaletteFromTreeRequest({ surface: "virtual", definition: {},
		focusPath: focus, applyFallback: false }, {}, fixture || tree, env);
}
function ids(result) { return result.items.map(function (item) { return item.id; }).sort().join(","); }

// Sibling insertion is defined by the semantic parent's slot, not the neighbour's traits.
var siblingOwner = node("owner", { entries: Object.assign(explicit(["example.one", "example.two"], "values"), { collection: "array" }) });
var siblingAnchor = node("anchor", {}, "owner", "entries");
siblingAnchor.info.sourceMutationPath = "values[0]";
siblingAnchor.info.traits = ["example.one"];
var siblingTree = { children: [siblingOwner, siblingAnchor], descriptors: [
	{ id: "one", traits: ["example.one"], insert: {} },
	{ id: "two", traits: ["example.two"], insert: {} },
	{ id: "foreign", traits: ["example.foreign"], insert: {} }
] };
function siblingPalette(fixture, position) {
	return service.authoringPaletteFromTreeRequest({ surface: "virtual", definition: {}, focusPath: "anchor",
		position: position, applyFallback: false }, {}, fixture, env);
}
["before", "after"].forEach(function (position) {
	var result = siblingPalette(siblingTree, position);
	assertTrue(ids(result) === "one,two", "A sibling may have a different trait accepted by the same parent slot");
	assertTrue(result.items.every(function (item) { return item.targetSlot.id === "entries"; }), "No artificial siblings slot identity");
	assertTrue(result.items[0].targetSlot.index === (position === "before" ? 0 : 1), "Sibling index remains relative to the anchor");
	var readOnlyParent = clone(siblingTree);
	readOnlyParent.children[0].info.slots.entries.sourceWritable = false;
	assertTrue(siblingPalette(readOnlyParent, position).items.length === 0, "A read-only parent slot must reject insertion beside its child");
	var noOwner = clone(siblingTree);
	delete noOwner.children[1].info.parentSlot;
	assertTrue(siblingPalette(noOwner, position).items.length === 0, "No heuristic acceptance without a semantic parent slot");
});
assertTrue(ids(palette("inner")) === "control,text", "Nested controls must inherit the outer semantic slot");
assertTrue(ids(palette("event")) === "action", "An event must retain its explicit action contract");
assertTrue(ids(palette("outer")) === "control,control,text,text", "Each control branch inherits independently");
assertTrue(outer.info.slots.then.accepts === undefined, "Resolution must not overwrite the inherited declaration");

// Same resolver, different provider vocabulary. No hardcoded frontend/backend kinds.
var specialized = clone(tree);
specialized.children[3].info.slots.content.accepts = ["json.field", "ui.control"];
assertTrue(ids(palette("inner", specialized)) === "control,field", "New semantic context must be resolved, not cached stale");
assertTrue(ids(palette("event", specialized)) === "action", "Explicit slots must not be unioned with their parent");
var empty = clone(tree);
empty.children[3].info.slots.content.accepts = [];
assertTrue(palette("inner", empty).items.length === 0, "An inherited empty slot must stay closed, without kind/type fallback");
assertTrue(palette("visualFolder").items.length === 0, "An explicit empty slots map must remain closed");

function expectError(fixture, code) {
	var error = "";
	try { palette("inner", fixture); } catch (e) { error = String(e); }
	assertTrue(error.indexOf(code + ":") >= 0, "Expected " + code + ", got " + error);
}
var missing = clone(tree);
delete missing.children[4].info.parentSlot;
expectError(missing, "UNRESOLVED_AUTHORING_SLOT");
missing = clone(tree);
missing.children[4].info.parentSlot.ownerPath = "absent";
expectError(missing, "UNRESOLVED_AUTHORING_SLOT");
missing = clone(tree);
missing.children[4].info.parentSlot.slotId = "absent";
expectError(missing, "INVALID_AUTHORING_SLOT");
missing = clone(tree);
delete missing.children[3].info.slots.content.accepts;
expectError(missing, "UNRESOLVED_AUTHORING_SLOT");
var cycle = clone(tree);
cycle.children[4].info.parentSlot = { ownerPath: "inner", slotId: "then" };
expectError(cycle, "CYCLIC_AUTHORING_SLOT");
var ambiguous = clone(tree);
ambiguous.children[1].info.slots.then.accepts = ["ui.block"];
expectError(ambiguous, "INVALID_AUTHORING_SLOT");
var invalidMode = clone(tree);
invalidMode.children[1].info.slots.then.acceptsFrom = "visualParent";
expectError(invalidMode, "INVALID_AUTHORING_SLOT");

// Identical AST paths in two source files must not share their slot contracts.
var qualified = clone(tree);
qualified.children[3].info.sourcePath = "/first.flow.svelte";
qualified.children[3].info.sourceMutationPath = "frontAst";
qualified.children[4].info.parentSlot = { sourcePath: "/first.flow.svelte", ownerPath: "frontAst", slotId: "content" };
var secondOwner = clone(qualified.children[3]);
secondOwner.path = "secondRoot";
secondOwner.info.sourcePath = "/second.flow.svelte";
secondOwner.info.slots.content.accepts = ["ui.action"];
qualified.children.unshift(secondOwner);
assertTrue(ids(palette("inner", qualified)) === "control,text", "Owner lookup must be source-qualified, not first-path matching");
qualified.children[5].info.parentSlot.sourcePath = "/second.flow.svelte";
assertTrue(ids(palette("inner", qualified)) === "action", "Changing the semantic owner changes the effective contract");
qualified.children[5].info.parentSlot.sourcePath = "/missing.flow.svelte";
expectError(qualified, "UNRESOLVED_AUTHORING_SLOT");
qualified.children[5].info.parentSlot.sourcePath = "/first.flow.svelte";
var mirror = clone(qualified.children[4]);
mirror.path = "mirrorRoot";
qualified.children.push(mirror);
assertTrue(ids(palette("inner", qualified)) === "control,text", "Equivalent projections of one source may share ownership");
mirror.info.slots.content.accepts = ["ui.action"];
expectError(qualified, "AMBIGUOUS_AUTHORING_SLOT_OWNER");
qualified.children.pop();
qualified.children[4].info.slots.content = inherited("content");
qualified.children[4].info.parentSlot = { sourcePath: "/first.flow.svelte", ownerPath: "frontAst", slotId: "content" };
expectError(qualified, "CYCLIC_AUTHORING_SLOT");

// Palette/action/paste consume the same effective accepts for named collections.
var definition = { nestedThen: {} };
inner.info.creationDescriptors = [{ id: "createText", traits: ["ui.block"], name: "text", value: "hello" }];
var action = service.authoringActionMutationFromTreeRequest({ definition: definition, surface: "virtual",
	action: { id: "createText@then", targetPath: "inner" } }, {}, tree, env);
var transfer = service.authoringTransferMutationFromTreeRequest({ definition: definition,
	transfer: { targetPath: "inner", traits: ["ui.block"], name: "text", value: "hello" } }, {}, tree, env);
assertTrue(action.__engineMutationPath === "/nestedThen/text" && action.__engineMutationPath === transfer.__engineMutationPath,
	"Action and clipboard must resolve inherited slots identically");
var rejected = false;
try {
	service.authoringTransferMutationFromTreeRequest({ definition: definition,
		transfer: { targetPath: "event", traits: ["ui.block"], name: "text", value: "hello" } }, {}, tree, env);
} catch (e) { rejected = String(e).indexOf("INVALID_AUTHORING_TRANSFER_TARGET:") >= 0; }
assertTrue(rejected, "A visual block must not be pasted into an action-only slot");

// Exercise the actual backend projection, including hidden (inline) slot folders and aliases.
var projectionEnv = Object.assign({}, env, {
	File: java.io.File, engineDir: function () { return engineDir; }, resolveBlockIcon: function () {},
	canonicalFlowDefinition: clone, expandFlowDefinition: function (blocks, definition) { return definition; },
	blockName: function (node) { return node.type; }, blockDescriptor: function (block) { return block || {}; },
	summaryText: String, typeDescriptor: function (value) { return value || {}; }
});
function projectedFixture(inline) {
	var blocks = {
		holder: { traits: ["example.holder"], slots: [
			{ name: "entries", aliases: ["nodes"], accepts: ["example.statement"], label: "Entries", inline: inline } ] },
		control: { traits: ["example.statement"], slots: [
			{ name: "then", acceptsFrom: "parentSlot", scope: "caller", label: "Then" },
			{ name: "else", acceptsFrom: "parentSlot", scope: "caller", label: "Else" } ] },
		leaf: { traits: ["example.statement"], slots: [] }
	};
	return service.describeTreeRequest({ target: "flow", definition: { nodes: [{ id: "container", type: "holder",
		nodes: [{ id: "branch", type: "control", then: [{ id: "value", type: "leaf" }] }] }] }
	}, blocks, projectionEnv);
}
function findPath(tree, path) {
	if (tree.path === path) return tree;
	var found;
	(tree.children || []).some(function (child) { found = findPath(child, path); return !!found; });
	return found;
}
[false, true].forEach(function (inline) {
	var projected = projectedFixture(inline);
	projected.descriptors = [{ id: "statement", traits: ["example.statement"], insert: {} },
		{ id: "other", traits: ["example.other"], insert: {} }];
	var branch = findPath(projected, "nodes[0].nodes[0]");
	var branchInfo = JSON.parse(branch.info);
	assertTrue(branchInfo.parentSlot.ownerPath === "nodes[0]" && branchInfo.parentSlot.slotId === "entries",
		"Backend child ownership must name the canonical slot, even through aliases/inline projection");
	assertTrue(branchInfo.slots.else.acceptsFrom === "parentSlot", "Empty backend branches must retain their slot contract");
	assertTrue(ids(palette(branch.path, projected)) === "statement,statement", "Backend control must resolve inherited slots");
	var branchFolder = findPath(projected, "nodes[0].nodes[0].then");
	assertTrue(ids(palette(branchFolder.path, projected)) === "statement", "Selecting a visible slot must use the same owner contract");
	assertTrue(palette("nodes[0].nodes[0].then[0]", projected).items.length === 0,
		"A declared backend leaf must not acquire children through a legacy kind fallback");
	assertTrue(JSON.parse(findPath(projected, "nodes[0]").info).slots.entries.sourceMutationPath === "nodes[0].nodes",
		"The semantic slot id must stay distinct from its concrete alias mutation path");
});
var pasteEnv = Object.assign({}, projectionEnv, {
	parseSource: JSON.parse, sourceForFlowRequest: function (request) { return request.flowSource; },
	analyzeFlowSource: function () { return {}; }, nodePath: function (node) { return node.id || ""; }
});
var pasteBlocks = { leaf: { traits: ["flow.node"], slots: [] } };
// Exercise the real Engine.js dispatcher too, not only the underlying tree module.
var engineCode = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var entryStart = engineCode.indexOf("function authoringMutateRequest(request, blocks) {");
var entryEnd = engineCode.indexOf("\n\tfunction describeTreeCacheKey", entryStart);
assertTrue(entryStart >= 0 && entryEnd > entryStart, "The production dispatcher must be found");
var sourceDispatchCalls = 0;
var engineAuthoringMutate = new Function("flowTreeService", "flowTreeServiceEnv", "applySourceMutationRequest",
	"return (" + engineCode.substring(entryStart, entryEnd).trim() + ");")(
	function () { return service; }, function () { return pasteEnv; }, function (request, blocks) {
		sourceDispatchCalls++;
		return service.applyMutationRequest(request, blocks, pasteEnv);
	});
["nodes[0]", "nodes", ""].forEach(function (destination) {
	var result = engineAuthoringMutate({ target: "flow", flowName: "test", sourceFile: "/fixture/meteo.flow",
		flowSource: JSON.stringify({ nodes: [{ type: "leaf", id: "original", value: "keep" }] }),
		transfer: { sourcePath: "nodes[0]", targetPath: destination, traits: ["flow.node"],
			value: { type: "leaf", id: "original", value: "keep" } }
	}, pasteBlocks);
	var nodes = JSON.parse(result.source).nodes;
	assertTrue(nodes.length === 2 && nodes[1].value === "keep", "Backend paste must work on leaf, root slot and source owner");
	assertTrue(nodes[0].id === "original" && nodes[1].id === "original2", "Copied node identities must not collide");
	assertTrue(result.selectionMutationPath === "nodes[1]", "The newly inserted node must be selected");
});
assertTrue(sourceDispatchCalls === 0, "A backend clipboard command must be resolved before low-level source mutation dispatch");
engineAuthoringMutate({ target: "flow", sourceFile: "/fixture/meteo.flow",
	flowSource: JSON.stringify({ nodes: [] }), mutation: { op: "insert", path: "nodes", value: { type: "leaf" } }
}, pasteBlocks);
assertTrue(sourceDispatchCalls === 1, "Already resolved source mutations must keep their existing adapter");
var emptySlotBlocks = Object.assign({}, pasteBlocks, {
	holder: { traits: ["flow.node"], slots: [{ name: "children", accepts: ["flow.node"], label: "Children" }] }
});
var emptySlotResult = service.authoringMutateRequest({ target: "flow",
	flowSource: JSON.stringify({ nodes: [{ type: "holder", id: "container" }] }),
	transfer: { sourcePath: "external", targetPath: "nodes[0]", traits: ["flow.node"], value: { type: "leaf", id: "item" } }
}, emptySlotBlocks, pasteEnv);
assertTrue(JSON.parse(emptySlotResult.source).nodes[0].children[0].id === "item",
	"The declared array slot must allow inserting its first child without a pre-existing array");
print("authoring-slot-inheritance OK");
