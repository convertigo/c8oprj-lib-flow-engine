var engineDir = new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsoluteFile();
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

function realPalette(focus, extra) {
	return JSON.parse(engine.authoringPalette(JSON.stringify(Object.assign({ target: "flow", surface: "virtual",
		definition: definition, focusPath: focus, detail: "normal", applyFallback: false }, extra || {}))));
}
var actual = realPalette("nodes");
assertTrue(actual.ok, "Public backend palette succeeds: " + JSON.stringify(actual));
assertTrue(actual.items.some(function (i) { return i.id === "flow.block.http.get"; }), "Backend HTTP is offered: " + JSON.stringify(actual));
var httpEntry = actual.items.filter(function (i) { return i.id === "flow.block.http.get"; })[0];
assertTrue(httpEntry.icon && httpEntry.description && httpEntry.properties && httpEntry.file && !httpEntry.definitionPath,
	"Backend entries keep icon, documentation, property and file metadata without inventing a frontend definition path");
assertTrue(!actual.items.some(function (i) { return i.id === "flow.block.browser.preference"; }), "Frontend-only block is excluded");
assertTrue(realPalette("nodes[0].nodes[0].then[0]").items.length === 0, "Closed leaf stays empty at public entry point");
assertTrue(realPalette("nodes", { sourceWritable: false }).items.length === 0, "Read-only root stays empty");
var branch = realPalette("nodes[0].nodes[0].then");
var entry = branch.items.filter(function (i) { return i.id === "flow.block.set"; })[0];
assertTrue(entry && entry.authoringAction && entry.virtualPrototype, "Palette exposes executable virtual prototype");
var inserted = JSON.parse(engine.authoringMutate(JSON.stringify({ target: "flow", surface: "virtual",
	definition: definition, write: false, persist: false, includeTree: true,
	action: { id: entry.id, targetPath: "nodes[0].nodes[0].then", targetSlotId: entry.targetSlot.id, position: "inside" } })));
assertTrue(inserted.ok, "Palette action inserts into inherited slot: " + JSON.stringify(inserted));
assertTrue(inserted.selectionMutationPath === "nodes[0].nodes[0].then[1]", "Inserted child is selected");
var rejected = JSON.parse(engine.authoringMutate(JSON.stringify({ target: "flow", surface: "virtual",
	definition: definition, action: { id: "flow.block.browser.preference", targetPath: "nodes", position: "inside" } })));
assertTrue(rejected.ok === false, "Forged incompatible action is rejected using the palette contract");
var ambiguous = JSON.parse(engine.authoringMutate(JSON.stringify({ target: "flow", surface: "virtual",
	definition: definition, action: { id: entry.id, targetPath: "nodes[0].nodes[0]", position: "inside" } })));
assertTrue(ambiguous.ok === false, "If with two compatible slots must require a destination choice");
var ownerInsert = JSON.parse(engine.authoringMutate(JSON.stringify({ target: "flow", surface: "virtual",
	definition: definition, sourceFile: String(new java.io.File(__flowProjectDir, "not-written.flow.js")),
	write: false, persist: false, action: { id: entry.id, targetPath: "", position: "inside" } })));
assertTrue(ownerInsert.ok && ownerInsert.selectionMutationPath === "nodes[1]",
	"Flow owner action resolves its root slot, including when the bridge supplies a sourceFile: " + JSON.stringify(ownerInsert));
assertTrue(!new java.io.File(__flowProjectDir, "not-written.flow.js").exists(), "Palette insertion must not write the saved source");
var before = JSON.parse(engine.authoringMutate(JSON.stringify({ target: "flow", surface: "virtual", definition: definition,
	action: { id: entry.id, targetPath: "nodes[0].nodes[0].then[0]", position: "before" } })));
assertTrue(before.ok && before.selectionMutationPath === "nodes[0].nodes[0].then[0]",
	"Sibling insertion follows the same slot contract and selects its actual index: " + JSON.stringify(before));
assertTrue(JSON.stringify(before.children).indexOf("set") >= 0, "Sibling insertion returns its updated tree");
var compactPalette = realPalette("nodes", { detail: "compact" });
assertTrue(compactPalette.items.some(function (i) { return i.id === "flow.block.http.get" && i.authoringAction && i.virtualPrototype; }),
	"Studio compact palette retains executable entries and computes against full structural metadata");
print("backend-provider-authoring OK");
print("backend public palette-to-mutation OK");

var betweenDefinition = { nodes: [{ id: "get", block: "http.get", url: "https://example.invalid" },
	{ id: "logger", block: "log", message: "done" }] };
var betweenPalette = JSON.parse(engine.authoringPalette(JSON.stringify({ target: "flow", surface: "virtual",
	definition: betweenDefinition, focusPath: "nodes" })));
var keysEntry = betweenPalette.items.filter(function (i) { return i.id === "flow.block.object.keys"; })[0];
assertTrue(keysEntry, "object.keys is offered for the executable Flow slot");
var between = JSON.parse(engine.authoringMutate(JSON.stringify({ target: "flow", surface: "virtual",
	definition: betweenDefinition, action: { id: keysEntry.id, targetPath: "nodes[1]", position: "before",
		targetSlotId: keysEntry.targetSlot.id } })));
assertTrue(between.ok && between.selectionMutationPath === "nodes[1]",
	"Studio palette slot identity must survive insertion between siblings: " + JSON.stringify(between));
var after = JSON.parse(engine.authoringMutate(JSON.stringify({ target: "flow", surface: "virtual",
	definition: betweenDefinition, action: { id: keysEntry.id, targetPath: "nodes[0]", position: "after",
		targetSlotId: keysEntry.targetSlot.id } })));
assertTrue(after.ok && after.selectionMutationPath === "nodes[1]", "After and before resolve the same parent insertion slot");
var parsedBetween = JSON.parse(engine.flowSourceValidate(JSON.stringify({ code: between.source })));
assertTrue(parsedBetween.ok && parsedBetween.definition.nodes.map(function (n) { return n.block; }).join(",") === "http.get,object.keys,log",
	"Serialization and reparse preserve exact insertion order");
assertTrue(realPalette("nodes").items.some(function (i) { return i.id === "flow.block.date.now"; }), "date.now is available in backend palette");
var timeSource = 'function Clock({ result }) { date.now({ out: "result.timestamp" }) }';
var lowerTime = Date.now();
var timeRun = JSON.parse(engine.run(JSON.stringify({ flowSource: timeSource, includeTrace: false })));
var upperTime = Date.now();
assertTrue(timeRun.result && typeof timeRun.result.timestamp === "number" && timeRun.result.timestamp >= lowerTime
	&& timeRun.result.timestamp <= upperTime, "Backend date.now must return a real current timestamp: " + JSON.stringify(timeRun));
var timeAnalysis = JSON.parse(engine.analyze(JSON.stringify({ flowSource: timeSource })));
assertTrue(timeAnalysis.schemas["result.timestamp"].type === "number", "date.now keeps typed output for downstream pickers");
var browserClock = eval("(" + read("blocks/date/now.browser.js") + ")");
var browserLowerTime = Date.now(), browserTime = browserClock();
assertTrue(browserTime >= browserLowerTime && browserTime <= Date.now(), "Existing browser implementation preserves the same timestamp contract");
print("backend sibling insertion and portable clock OK");
