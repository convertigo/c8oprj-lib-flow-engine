var engineDir = new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsoluteFile();
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
var intermediateKinds = ["frontendRoutes", "frontendRouteSegment", "frontendEvents", "frontendStructure",
	"frontendActionVariables", "frontendLibrary", "frontendThemeSource", "thirdPartyContainer"];
intermediateKinds.forEach(function (kind, index) {
	var node = model("intermediate" + index, kind, {}, []);
	node.props = { root: true, count: 3, param: "editable", clientAction: "business", requestable: "business", tuning: 4,
		technical: "path", information: "computed" };
	node.propertyDefinitions = {
		param: { label: "Parameter", type: "string", category: "Routing" },
		clientAction: { type: "string" },
		requestable: { type: "string" },
		tuning: { type: "number", expert: true },
		technical: { type: "string", category: "Build", readOnly: true },
		information: { type: "string", category: "Information" }
	};
	inputs.push(node);
});
var modern = model("structureId", "frontendWidget", {}, ["ui.block"]);
modern.sourceVersion = 2;
modern.sourceKind = "input";
modern.sourceRelativePath = "Example.flow.svelte";
modern.disabled = false;
modern.comment = "authoring";
modern.out = "local.output";
modern.props = { id: "businessId", disabled: true, kind: "businessKind", block: "businessBlock",
	"$$id": "businessDouble", "$$$id": "businessTriple", value: { mode: "source",
		source: { category: "fullsync", actionId: "read", operation: "get" } } };
modern.propertyDefinitions = { value: { kind: "binding", type: "object" } };
modern.sourcePropertyMutationPaths = {};
Object.keys(modern.props).forEach(function (key) { modern.sourcePropertyMutationPaths[key] = modern.sourceMutationPath + ".props." + key; });
inputs.push(modern);
var visual = model("visual", "frontendWidget", {}, ["ui.block"]);
visual.sourceVersion = 2;
visual.sourceKind = "heading";
visual.props = { text: "Title", sourceKind: "business" };
inputs.push(visual);
var producer = model("producer", "frontendActionBlock", {}, ["ui.action"]);
producer.sourceVersion = 2;
producer.outputs = { out: { type: "string" } };
producer.props = { out: "business" };
inputs.push(producer);
var consumer = clone(producer);
consumer.id = "consumer";
consumer.outputs = {};
inputs.push(consumer);
var namedSource = model("humanName", "thirdPartySourceWrapper", {}, []);
namedSource.projectionId = "stableSourceKey";
namedSource.sourceVersion = 2;
namedSource.sourceKind = "thirdPartyDefinition";
inputs.push(namedSource);
closed.parentSlot = { sourcePath: String(source), ownerPath: "frontAst.specialized", slotId: "content" };
var env = {
	sourceAttributeNameCodec: function () { return eval(String(files.readFileToString(new java.io.File(engineDir, "modules/source-attribute-name-codec.js"), "UTF-8"))); },
	nodeEngineProperties: function (node, outputs) { return eval(String(files.readFileToString(new java.io.File(engineDir, "modules/flow-node-utils.js"), "UTF-8"))).enginePropertiesFor(node, outputs); },
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
	loadTypes: function () { return {
		binding: { editor: { component: "flow-binding-editor" } },
		path: { editor: { component: "flow-path-editor" } },
		text: { editor: { native: "text", component: "flow-text-editor" } },
		boolean: { enum: [false, true], editor: { native: "choice", component: "flow-boolean-editor" } }
	}; },
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
var projectedSource = projected.humanName;
assertTrue(projectedSource.path.indexOf("stableSourceKey") >= 0 && projectedSource.path.indexOf("humanName") < 0,
	"Explicit navigation identity is independent of authored Name for arbitrary source kinds");
assertTrue(JSON.parse(projectedSource.info).renameValue === "humanName", "Rename edits Name, never the projection key");
assertTrue(JSON.parse(projectedSource.definition).projectionId === undefined, "Projection key is not authored data");
intermediateKinds.forEach(function (kind, index) {
	var definitions = JSON.parse(projected["intermediate" + index].info).propertyDefinitions;
	assertTrue(!definitions.root && !definitions.count, "Projection data must not invent editors for " + kind);
	assertTrue(definitions.id.label === "Name" && definitions.id.category === "Information", "Common identity for " + kind);
	assertTrue(definitions.param.category === "Base properties" && !definitions.param.readOnly,
		"Declared business properties must not be reinterpreted by their names for " + kind);
	assertTrue(!definitions.clientAction.hidden && !definitions.clientAction.readOnly,
		"A declared business field may use an internal-looking name for " + kind);
	assertTrue(JSON.parse(projected["intermediate" + index].info).propertyOrder.indexOf("requestable") >= 0,
		"Property order must not hide declared fields based on object kind: " + kind);
	assertTrue(definitions.tuning.category === "Expert", "Explicit advanced setting for " + kind);
	assertTrue(definitions.technical.category === "Information" && definitions.technical.readOnly,
		"Read-only properties belong to Information for " + kind);
	assertTrue(definitions.information.readOnly, "Information is never writable for " + kind);
});
var modernNode = projected.structureId;
var modernDefinition = JSON.parse(modernNode.definition);
var modernInfo = JSON.parse(modernNode.info);
assertTrue(modernInfo.propertyDefinitions.value.editorMode === "custom", "Frontend binding uses the shared editor contract");
assertTrue(modernInfo.propertyDefinitions.$$comment.editorMode === "text", "Frontend Comment stays native text");
assertTrue(modernInfo.propertyDefinitions.$$disabled.editorMode === "choice", "Frontend Is active stays a declared choice");
assertTrue(modernInfo.propertyDefinitions.$$out.hidden === false && modernInfo.propertyDefinitions.$$out.category === "Expert",
	"Existing capture stays accessible even without a declared output");
["sourceKind", "sourceVersion", "sourceRelativePath", "sourceWritable"].forEach(function (key) {
	var def = modernInfo.propertyDefinitions[key];
	assertTrue(def.readOnly === true && def.category === "Information", "Technical metadata must be read only: " + key);
});
["slots", "traits"].forEach(function (key) {
	assertTrue(modernInfo.propertyDefinitions[key].hidden === true, "Internal contracts must not be human settings: " + key);
});
var visualInfo = JSON.parse(projected.visual.info);
assertTrue(visualInfo.propertyDefinitions.$$out.hidden === true, "Visual component without a result must not expose Output");
assertTrue(visualInfo.propertyDefinitions.sourceKind.definitionPath === "props.sourceKind"
	&& visualInfo.propertyDefinitions._sourceKind.definitionPath === "sourceKind"
	&& visualInfo.propertyDefinitions._sourceKind.readOnly === true, "Technical metadata never shadows business properties");
var producerInfo = JSON.parse(projected.producer.info);
assertTrue(producerInfo.propertyDefinitions.$$out.hidden !== true
	&& producerInfo.propertyDefinitions.out.definitionPath === "props.out", "Business out must not hide a declared frontend capture");
assertTrue(JSON.parse(projected.consumer.info).propertyDefinitions.$$out.hidden === true,
	"Projection cache must include the output contract, not only business properties");
assertTrue(modernInfo.renameValue === "structureId", "Rename edits structural identity, not a colliding business id");
assertTrue(modernInfo.renameMutation.op === "replace" && modernInfo.renameMutation.path === modern.sourceMutationPath + ".id",
	"Frontend identity exposes its mutation through the same provider capability as backend and config");
assertTrue(modernInfo.renameMutation.selectionMutationPath === modern.sourceMutationPath, "Rename retains a precise selection after the virtual path changes");
assertTrue(JSON.stringify(modernDefinition.props) === JSON.stringify(modern.props), "V2 must not flatten business props into structural fields");
assertTrue(modernDefinition.id === "structureId" && modernDefinition.disabled === false, "V2 structural identity and enable state");
assertTrue(modernNode.path.indexOf("structureId") >= 0 && modernNode.path.indexOf("businessId") < 0, "Reveal path must follow structural identity");
Object.keys(modern.props).forEach(function (key) {
	var spelling = env.sourceAttributeNameCodec().encode("property", key);
	assertTrue(modernInfo.propertyDefinitions[spelling].definitionPath === "props." + key, "Business definition path: " + spelling);
	assertTrue(modernInfo.sourcePropertyMutationPaths[spelling] === modern.sourceMutationPath + ".props." + key, "Business mutation path: " + spelling);
});
["id", "disabled", "comment", "out"].forEach(function (key) {
	assertTrue(modernInfo.propertyDefinitions["$$" + key].definitionPath === key, "Engine definition path: " + key);
	assertTrue(modernInfo.sourcePropertyMutationPaths["$$" + key] === modern.sourceMutationPath + "." + key, "Engine mutation path: " + key);
});
var unavailable = service.describeTreeRequest({ target: "engine", includeFrontendCatalog: false, includeFlowCatalog: false,
	definition: { config: { frontbuilder: { svelte: { modelPath: source.getName() } } } } }, {},
	Object.assign({}, env, { describeFrontendDocument: function () { throw new Error("Cannot run program node: ENOENT"); } }));
assertTrue(JSON.stringify(unavailable).indexOf("Cannot run program node: ENOENT") >= 0,
	"An unavailable provider must remain a visible error, not a successful alternate projection");
assertTrue(JSON.stringify(unavailable).indexOf("FRONTEND_EMBEDDED_PROJECTION") < 0,
	"Missing Node must not silently replace the provider's authoring model");
print("frontend-projected-contract OK");
