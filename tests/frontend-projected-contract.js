var engineDir = new java.io.File(arguments.length > 0 ? arguments[0] : "libs/flow").getAbsoluteFile();
var files = Packages.org.apache.commons.io.FileUtils;
var service = eval(String(files.readFileToString(new java.io.File(engineDir, "modules/flow-tree-service.js"), "UTF-8")));
var project = java.nio.file.Files.createTempDirectory("flow-projected-contract-").toFile();
var source = new java.io.File(project, "Example.flow.svelte");
files.writeStringToFile(source, '<FlowComponent id="example"><Structure /></FlowComponent>', "UTF-8");
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function assertTrue(value, message) { if (!value) throw new Error(message); }
function model(id, kind, slots, traits) {
	return { id: id, kind: kind, type: "button", sourcePath: String(source),
		sourceMutationPath: "frontAst." + id, slots: slots, traits: traits,
		props: { id: id }, children: [], sourceWritable: true,
		frontendInsertMutationPath: "wrong.legacy.destination" };
}
var closed = model("closed", "frontendWidget", {}, []);
var specialized = model("specialized", "frontendWidget", {
	content: { label: "Items", accepts: ["example.child"], sourceMutationPath: "frontAst.specialized.items" }
}, ["example.host"]);
var blocked = model("blocked", "frontendEventBlock", {
	actions: { accepts: [], sourceMutationPath: "blocked.actions" }
}, []);
var readonly = model("readonly", "frontendWidget", {
	items: { accepts: ["example.child"], sourceWritable: false, sourceMutationPath: "readonly.items" }
}, []);
var multiple = model("multiple", "frontendDirectiveBlock", {
	first: { accepts: ["example.child"], sourceMutationPath: "multiple.first" },
	second: { accepts: ["example.child"], sourceMutationPath: "multiple.second" }
}, []);
// Exercise the lightweight root-normalization path as well as the normal provider path.
var normalized = model("normalized", "frontendComponent", {}, []);
normalized.sourceMutationPath = "oldRoot";
delete normalized.frontendInsertMutationPath;
var inputs = [closed, specialized, blocked, readonly, multiple, normalized];
closed.parentSlot = { sourcePath: String(source), ownerPath: "frontAst.specialized", slotId: "content" };
var env = {
	File: java.io.File, FileUtils: files, projectDir: function () { return project; },
	engineDir: function () { return engineDir; },
	resourceRelativePath: function (root, file) {
		return file.toPath().startsWith(root.toPath()) ? String(root.toPath().relativize(file.toPath())) : "";
	},
	jsonMapper: { readTree: JSON.parse }, yamlMapper: { writeValueAsString: JSON.stringify },
	parseYamlSource: JSON.parse, normalizeTree: clone, compact: JSON.stringify, compactPlain: JSON.stringify,
	blockCatalog: function () { return []; }, catalogDefinition: function () { return { groups: [], types: [] }; },
	listFlowLibraries: function () { return []; }, listProjectFragments: function () { return { fragments: [] }; },
	resolveBlockIcon: function () {}, typeDescriptor: function (value) { return value || {}; },
	describeFrontendDocument: function () { return { model: { version: 1 }, tree: { children: clone(inputs) } }; },
	raise: function (code, message) { throw new Error(code + ": " + message); }
};
var tree = service.describeTreeRequest({ target: "engine", includeFrontendCatalog: false, includeFlowCatalog: false,
	definition: { config: { frontbuilder: { svelte: { modelPath: source.getName() } } } } }, {}, env);
var projected = {};
function visit(node) {
	assertTrue(node.kind !== "error", "Projection failed: " + JSON.stringify(node));
	var definition = node.definition ? JSON.parse(node.definition) : {};
	if (definition.id) projected[definition.id] = node;
	(node.children || []).forEach(visit);
}
visit(tree);
tree.descriptors = [{ id: "child", traits: ["example.child"], insert: {} },
	{ id: "event", traits: ["ui.event"], insert: {} }];
inputs.forEach(function (input) {
	var node = projected[input.id];
	assertTrue(!!node, "Missing projected node: " + input.id);
	var info = JSON.parse(node.info);
	assertTrue(JSON.stringify(info.parentSlot) === JSON.stringify(input.parentSlot), "Semantic ownership must survive projection: " + input.id);
	assertTrue(JSON.parse(node.definition).parentSlot === undefined, "Semantic ownership must not become authored bean data");
	assertTrue(JSON.stringify(info.traits) === JSON.stringify(input.traits), "Traits must survive projection: " + input.id);
	assertTrue(JSON.stringify(info.slots) === JSON.stringify(input.slots), "Slots must survive projection: " + input.id);
	var palette = service.authoringPaletteFromTreeRequest({ surface: "virtual", definition: {}, focusPath: node.path }, {}, tree, env);
	assertTrue(palette.items.length === (input === specialized ? 1 : input === multiple ? 2 : 0),
		"Palette must follow the declared contract: " + input.id + " " + JSON.stringify(palette));
	assertTrue((info.frontendInsertMutationPath || "") === (input === specialized ? "frontAst.specialized.items" : ""),
		"Default insertion must not invent a destination: " + input.id + " " + JSON.stringify(info));
});
assertTrue(closed.frontendInsertMutationPath === "wrong.legacy.destination", "Provider input must not be mutated");
var unavailable = service.describeTreeRequest({ target: "engine", includeFrontendCatalog: false, includeFlowCatalog: false,
	definition: { config: { frontbuilder: { svelte: { modelPath: source.getName() } } } } }, {},
	Object.assign({}, env, { describeFrontendDocument: function () { throw new Error("Cannot run program node: ENOENT"); } }));
assertTrue(JSON.stringify(unavailable).indexOf("Cannot run program node: ENOENT") >= 0,
	"An unavailable provider must remain a visible error, not a successful alternate projection");
assertTrue(JSON.stringify(unavailable).indexOf("FRONTEND_EMBEDDED_PROJECTION") < 0,
	"Missing Node must not silently replace the provider's authoring model");
print("frontend-projected-contract OK");
