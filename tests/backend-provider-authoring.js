var engineDir = new java.io.File(arguments.length > 0 ? arguments[0] : "libs/flow").getAbsoluteFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("flow-backend-authoring-").toAbsolutePath());
function read(name) { return String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, name), "UTF-8")); }
var engine = eval(read("Engine.js"));
var service = eval(read("modules/flow-tree-service.js"));
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function assertTrue(value, message) { if (!value) throw new Error(message); }
var catalog = JSON.parse(engine.catalog(JSON.stringify({ detail: "full" })));
var byId = {};
catalog.blocks.forEach(function (block) { byId[block.blockId] = block; });
assertTrue(byId["if"].slots[0].acceptsFrom === "parentSlot", "Real If metadata must declare inheritance");
assertTrue(byId.forEach.slots[0].acceptsFrom === "parentSlot" && byId.forEach.slots[0].current === "item",
	"ForEach inheritance must retain its typed current scope");
assertTrue(byId["set"].traits.indexOf("flow.node") >= 0 && byId["set"].slots.length === 0,
	"Executable leaf must advertise its trait and closed slots");
var compact = JSON.parse(engine.catalog(JSON.stringify({ detail: "compact", q: "forEach" })));
var compactLoop = compact.blocks.filter(function (block) { return block.blockId === "forEach"; })[0];
assertTrue(compactLoop.traits.indexOf("flow.node") >= 0 && compactLoop.slots[0].acceptsFrom === "parentSlot",
	"Compact catalogue must not drop structural metadata");
var definition = { nodes: [{ id: "loop", block: "forEach", items: "[]", nodes: [
	{ id: "condition", block: "if", condition: "true", then: [{ id: "assign", block: "set", path: "result.ok", value: true }] }
] }] };
var tree = JSON.parse(engine.describeTree(JSON.stringify({ target: "flow", definition: definition })));
assertTrue(tree.ok, "Real backend projection must succeed: " + JSON.stringify(tree.error));
tree.descriptors = [{ id: "set", traits: byId["set"].traits, insert: {} },
	{ id: "frontendOnly", traits: ["ui.block"], insert: {} }];
var env = { normalizeTree: clone, compact: JSON.stringify, compactPlain: JSON.stringify,
	raise: function (code, message) { throw new Error(code + ": " + message); } };
function palette(path) {
	return service.authoringPaletteFromTreeRequest({ surface: "virtual", definition: {}, focusPath: path }, {}, tree, env);
}
assertTrue(palette("nodes").items.length === 1, "Flow root accepts only backend statements");
assertTrue(palette("nodes[0]").items.length === 1, "Real ForEach resolves the root contract: " + JSON.stringify(palette("nodes[0]")));
assertTrue(palette("nodes[0].nodes[0]").items.length === 2, "Real nested If resolves both branches through inline ForEach");
assertTrue(palette("nodes[0].nodes[0].then").items.length === 1, "Visible branch resolves the same contract");
assertTrue(palette("nodes[0].nodes[0].then[0]").items.length === 0, "Real leaf remains closed");
var readOnly = JSON.parse(engine.describeTree(JSON.stringify({ target: "flow", definition: definition, sourceWritable: false })));
readOnly.descriptors = tree.descriptors;
assertTrue(service.authoringPaletteFromTreeRequest({ surface: "virtual", definition: {}, focusPath: "nodes[0]" },
	{}, readOnly, env).items.length === 0, "An explicitly read-only Flow must not be made writable by its block descriptor");
var mapContext = JSON.parse(engine.context(JSON.stringify({
	flowSource: JSON.stringify({ input: { items: { type: "array", items: { type: "object", properties: { title: { type: "string" } } } } },
		nodes: [{ id: "map", block: "list.map", items: "input.items", select: "current.title", out: "result.titles" }] }),
	node: "map", property: "select", include: ["current"], detail: "compact"
})));
assertTrue(mapContext.scopes.current.indexOf("current.title") >= 0,
	"Explicitly empty slots must not make an expression iterator look like a child-node container: " + JSON.stringify(mapContext));
print("backend-provider-authoring OK");
