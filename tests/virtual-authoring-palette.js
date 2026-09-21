var engineDir = new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsoluteFile();
var serviceFile = new java.io.File(engineDir, "modules/flow-tree-service.js");
var service = eval(String(Packages.org.apache.commons.io.FileUtils.readFileToString(serviceFile, "UTF-8")));

function assertTrue(value, message) {
	if (!value) throw new Error(message);
}

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

var env = {
	jsonMapper: { readTree: JSON.parse },
	yamlMapper: { writeValueAsString: JSON.stringify },
	parseYamlSource: JSON.parse,
	listProjectFragments: function () { return { fragments: [] }; },
	blockCatalog: function () { return []; },
	catalogDefinition: function () { return { groups: [], types: [] }; },
	listFlowLibraries: function () { return []; },
	File: java.io.File,
	engineDir: function () { return engineDir; },
	normalizeTree: clone,
	compact: JSON.stringify,
	compactPlain: JSON.stringify,
	resolveBlockIcon: function () {},
	loadTypes: function () { return {}; },
	typeDescriptor: function (value) { return value || {}; },
	frontendBlocksForSettings: function () { return []; },
	frontendCreateDescriptorsForSettings: function () { return []; },
	frontendCreateDescriptorsForConfig: function () { return []; },
	raise: function (code, message) { throw new Error(code + ": " + message); }
};

function renameFixture(name) {
	return service.applyMutationRequest({ target: "engine",
		engineSource: JSON.stringify({ config: { service: { setting: "value" }, other: {} } }),
		mutation: { op: "renameKey", path: "config.service", value: name }
	}, {}, env);
}
var renamed = renameFixture("renamed");

var visibleRename = service.applyMutationRequest({ target: "engine",
	engineSource: JSON.stringify({ config: { service: { key: "value" } },
		configVisibility: { unrelated: "private", service: { key: "private" } } }),
	mutation: { op: "renameKey", path: "config.service", value: "renamed" }
}, {}, env);
var renamedVisibility = JSON.parse(visibleRename.source).configVisibility;
assertTrue(renamedVisibility.unrelated === "private", "Unrelated visibility must not block rename or change");
assertTrue(renamedVisibility["renamed.key"] === "private" && !renamedVisibility["service.key"],
	"Visibility must follow renamed descendants");
var flatRename = service.applyMutationRequest({ target: "engine",
	engineSource: JSON.stringify({ config: { service: { key: "value" } }, configVisibility: { "service.key": "private" } }),
	mutation: { op: "renameKey", path: "config.service.key", value: "renamed" }
}, {}, env);
assertTrue(JSON.parse(flatRename.source).configVisibility["service.renamed"] === "private",
	"Flat visibility paths must follow a renamed setting");
assertTrue(JSON.parse(renamed.source).config.renamed.setting === "value", "Rename must preserve descendants");
assertTrue(!JSON.parse(renamed.source).config.service, "Rename must remove the old key");
assertTrue(renamed.selectionMutationPath === "config.renamed", "Rename must return the new selection path");
["other", "", "a.b", "__proto__", "constructor"].forEach(function (name) {
	var rejected = false;
	try { renameFixture(name); } catch (e) { rejected = true; }
	assertTrue(rejected, "Invalid or colliding names must be rejected: " + name);
});

// Dry-run authoring exercises the real mutation pipeline without touching any project.
var mutationEnv = Object.assign({}, env, {
	projectDir: function () { return new java.io.File("/nonexistent-flow-lifecycle-fixture"); }
});
var added = service.authoringMutateRequest({
	surface: "virtual", includeTree: false, dryRun: true,
	engineSource: JSON.stringify({ config: { unsaved: { value: "keep" } } }),
	mutation: { op: "replace", __engineMutationPath: "config.added", value: {} }
}, {}, mutationEnv);
assertTrue(JSON.parse(added.source).config.unsaved.value === "keep", "Authoring must retain unsaved source values");
assertTrue(added.selectionMutationPath === "config.added", "Creation must return its selection path");
assertTrue(added.selectionVirtualPath === "config.added", "Engine creations must identify the projected object, not a frontend source path");
assertTrue(added.written === false && added.children.length === 0, "Dry-run with no projection must not write or build a tree");
var removedWithoutTree = service.applyMutationRequest({ target: "engine", includeTree: false,
	engineSource: JSON.stringify({ config: { keep: {}, remove: {} } }),
	mutation: { op: "delete", path: "config.remove" }
}, {}, env);
assertTrue(removedWithoutTree.children.length === 0, "Source-only mutations must not rebuild an unused projection");
assertTrue(JSON.parse(removedWithoutTree.source).config.keep !== undefined
	&& JSON.parse(removedWithoutTree.source).config.remove === undefined, "Source-only deletion must preserve other objects");

var unrelatedProjectionCalls = 0;
var focusedEnv = Object.assign({}, env, {
	projectDir: function () { return engineDir; },
	listProjectFragments: function () { unrelatedProjectionCalls++; return { fragments: [] }; },
	catalogDefinition: function () { unrelatedProjectionCalls++; return { groups: [], types: [] }; },
	frontendBlocksForSettings: function () { unrelatedProjectionCalls++; return []; }
});
var focusedRequest = {
	target: "engine", projectionPaths: ["/config/service/value"],
	engineSource: JSON.stringify({ config: { service: { value: "old" },
		frontbuilder: { svelte: { target: "svelte" } } } }),
	mutation: { op: "replace", path: "config.service.value", value: "new" }
};
var focusedResult = service.applyMutationRequest(focusedRequest, {}, focusedEnv);
assertTrue(unrelatedProjectionCalls === 0, "A focused value mutation must not project unrelated catalog/frontend providers");
assertTrue(focusedResult.children.length === 1 && focusedResult.children[0].path === "config",
	"Only the requested projection branch must be returned");
assertTrue(JSON.parse(focusedResult.source).config.frontbuilder.svelte.target === "svelte",
	"Projection filtering must not drop unrelated source data");
assertTrue(JSON.parse(focusedResult.source).config.service.value === "new", "The draft must include the edited value");
delete focusedRequest.projectionPaths;
service.applyMutationRequest(focusedRequest, {}, focusedEnv);
assertTrue(unrelatedProjectionCalls > 0, "The fixture must exercise the unrelated providers for a full projection");

unrelatedProjectionCalls = 0;
var focusedPaste = service.authoringMutateRequest({ surface: "virtual", projectionPaths: ["config"],
	write: false, persist: false, engineSource: focusedRequest.engineSource,
	transfer: { sourcePath: "config.service", targetPath: "config.service", name: "service", value: { value: "copy" } }
}, {}, focusedEnv);
assertTrue(unrelatedProjectionCalls === 0, "Neither transfer validation nor its result may project unrelated frontend/catalog providers");
assertTrue(focusedPaste.children.length === 1 && focusedPaste.children[0].path === "config", "Paste returns the fresh requested branch");
assertTrue(JSON.parse(focusedPaste.source).config.service.service.value === "copy", "Paste still inserts through the slot contract");
assertTrue(JSON.parse(focusedPaste.source).config.frontbuilder.svelte.target === "svelte", "Paste preserves the complete source");
assertTrue(focusedPaste.written === false, "A draft paste must not write the source file");

var pasted = service.authoringMutateRequest({ surface: "virtual", includeTree: false, dryRun: true,
	engineSource: JSON.stringify({ config: { service4: { setting: "keep" } } }),
	transfer: { sourcePath: "config.service4", targetPath: "config.service4", name: "service4", value: { setting: "copy" } }
}, {}, mutationEnv);
var pastedConfig = JSON.parse(pasted.source).config;
assertTrue(pastedConfig.service4.service4.setting === "copy",
	"Pasting a group inside a group must now follow the officially declared group slot");
var pastedSetting = service.authoringMutateRequest({ surface: "virtual", includeTree: false, dryRun: true,
	engineSource: JSON.stringify({ config: { service: { setting: "keep" } } }),
	transfer: { sourcePath: "config.service.setting", targetPath: "config.service.setting", name: "setting", value: "copy" }
}, {}, mutationEnv);
assertTrue(JSON.parse(pastedSetting.source).config.service.setting2 === "copy",
	"Pasting a setting on itself must use its parent service");

var config = {
	path: "config",
	kind: "scope",
	type: "config",
	definition: { weather: { baseUrl: "https://example.test" } },
	info: { sourceMutationPath: "config", sourceWritable: true },
	children: [{
		path: "config.weather",
		kind: "object",
		type: "config",
		definition: { baseUrl: "https://example.test" },
		info: { sourceMutationPath: "config.weather", sourceWritable: true },
		children: []
	}]
};
var tree = service.describeTreeRequest({ target: "engine", includeFlowCatalog: false,
	definition: { config: config.definition } }, {}, env);

var rootPalette = service.authoringPaletteFromTreeRequest({
	surface: "virtual",
	focusPath: "config",
	position: "inside",
	detail: "compact",
	definition: { config: config.definition }
}, {}, tree, env);
assertTrue(rootPalette.ok && rootPalette.items.length === 1, "Config root must expose one Rhino palette action");
assertTrue(rootPalette.items[0].authoringAction.id === "config.create.group@entries",
	"The palette must expose an opaque virtual authoring action");
assertTrue(rootPalette.items[0].virtualPrototype.kind === "object",
	"The service action must expose a projected virtual object prototype");
assertTrue(rootPalette.items[0].icon === "mdi:cube-outline",
	"The service prototype must reuse the projected tree icon");

var servicePalette = service.authoringPaletteFromTreeRequest({
	surface: "virtual",
	focusPath: "config.weather",
	position: "inside",
	detail: "compact",
	definition: { config: config.definition }
}, {}, tree, env);
assertTrue(servicePalette.ok && servicePalette.items.length === 2, "A group must expose group and setting creation");
servicePalette.items.sort(function (a, b) { return a.virtualPrototype.kind === "field" ? -1 : 1; });
assertTrue(servicePalette.items[0].authoringAction.id === "config.create.value@entries",
	"The setting palette entry must expose an opaque virtual authoring action");
assertTrue(servicePalette.items[0].virtualPrototype.kind === "field",
	"The setting action must expose a projected virtual field prototype");
assertTrue(JSON.parse(servicePalette.items[0].virtualPrototype.definition) === "",
	"An empty scalar prototype must stay a scalar");
assertTrue(servicePalette.items[0].icon === "mdi:variable",
	"The setting prototype must reuse the projected tree icon");
assertTrue(servicePalette.items[0].description.length > 0,
	"Every virtual palette prototype must carry documentation");

var settingMutation = service.authoringActionMutationFromTreeRequest({
	surface: "virtual",
	definition: { config: config.definition },
	action: {
		id: servicePalette.items[0].id,
		targetPath: "config.weather",
		position: "inside"
	}
}, {}, tree, env);
assertTrue(settingMutation.__engineMutationPath === "/config/weather/setting",
	"The action must be recomputed from the current virtual target instead of trusting stale palette mutations");

// Exercise the palette action end-to-end: actions use JSON pointers, unlike a
// hand-written dotted mutation. Studio must receive an actual projected path.
["config.create.group@entries", "config.create.value@entries"].forEach(function (actionId) {
	var result = service.authoringMutateRequest({
		surface: "virtual", includeTree: false, dryRun: true,
		engineSource: JSON.stringify({ config: config.definition }),
		action: { id: actionId, targetPath: "config.weather", position: "inside" }
	}, {}, mutationEnv);
	var projection = service.describeTreeRequest({ target: "engine", includeFlowCatalog: false,
		definition: JSON.parse(result.source) }, {}, env);
	function containsSelection(node) {
		return node.path === result.selectionVirtualPath || (node.children || []).some(containsSelection);
	}
	assertTrue(result.selectionVirtualPath !== "config.weather" && containsSelection(projection),
		"Palette creation must select its projected child: " + result.selectionVirtualPath);
});
assertTrue(pasted.selectionVirtualPath === "config.service4.service4",
	"Clipboard insertion must use the same projected selection convention as palette insertion");

// The creation mechanism must not inspect a Config/backend/frontend kind or type.
var foreignDefinition = { entries: {} };
var foreignNode = { path: "entries", kind: "arbitraryKind", type: "arbitraryType", definition: {},
	info: { sourceMutationPath: "entries", sourceWritable: true,
		slots: { children: { accepts: ["example.entry"], sourceMutationPath: "entries", sourceWritable: true } },
		creationDescriptors: [
			{ id: "example.create", name: "entry", kind: "anotherKind", type: "anotherType",
				traits: ["example.entry"], value: { enabled: true }, description: "An entry from an independent provider." },
			{ id: "example.forbidden", name: "wrong", traits: ["example.other"], value: {} }
		] }, children: [] };
var foreignTree = { children: [foreignNode] };
var foreignPalette = service.authoringPaletteFromTreeRequest({ surface: "virtual", focusPath: "entries",
	definition: foreignDefinition }, {}, foreignTree, env);
assertTrue(foreignPalette.items.length === 1 && foreignPalette.items[0].id === "example.create@children",
	"Only accepted traits must determine a foreign provider's creation palette");
var foreignMutation = service.authoringActionMutationFromTreeRequest({ surface: "virtual", definition: foreignDefinition,
	action: { id: foreignPalette.items[0].id, targetPath: "entries" } }, {}, foreignTree, env);
assertTrue(foreignMutation.__engineMutationPath === "/entries/entry" && foreignMutation.value.enabled === true,
	"Mutation must be materialized from the same foreign provider descriptor");
var forbiddenRejected = false;
try {
	service.authoringActionMutationFromTreeRequest({ surface: "virtual", definition: foreignDefinition,
		action: { id: "example.forbidden@children", targetPath: "entries" } }, {}, foreignTree, env);
} catch (e) { forbiddenRejected = true; }
assertTrue(forbiddenRejected, "An action absent from the valid palette must not bypass trait validation");

function foreignTransfer(traits, fixture, definition, targetSlotId) {
	return service.authoringTransferMutationFromTreeRequest({ definition: definition || foreignDefinition,
		transfer: { sourcePath: "external.original", targetPath: "entries", targetSlotId: targetSlotId,
			traits: traits, name: "entry", value: { enabled: true } } }, {}, fixture || foreignTree, env);
}
assertTrue(foreignTransfer(["example.entry"]).__engineMutationPath === foreignMutation.__engineMutationPath,
	"Palette and paste must resolve the same destination for an independent provider");
assertTrue(foreignTransfer(["example.unrelated", "example.entry"]).__engineMutationPath === "/entries/entry",
	"An object with multiple traits is accepted when one matches the slot");
function expectTransferError(traits, fixture, definition, slotId, code) {
	var error = "";
	try { foreignTransfer(traits, fixture, definition, slotId); } catch (e) { error = String(e); }
	assertTrue(error.indexOf(code + ":") >= 0, "Expected transfer error " + code + ", got " + error);
}
expectTransferError(["example.other"], null, null, null, "INVALID_AUTHORING_TRANSFER_TARGET");
expectTransferError([], null, null, null, "INVALID_AUTHORING_TRANSFER");
var readOnlyTree = clone(foreignTree);
readOnlyTree.children[0].info.slots.children.sourceWritable = false;
expectTransferError(["example.entry"], readOnlyTree, null, null, "INVALID_AUTHORING_TRANSFER_TARGET");
var ambiguousTree = clone(foreignTree);
ambiguousTree.children[0].info.slots.other = { accepts: ["example.entry"],
	sourceMutationPath: "otherEntries", sourceWritable: true };
expectTransferError(["example.entry"], ambiguousTree, null, null, "AMBIGUOUS_AUTHORING_TRANSFER_TARGET");
assertTrue(foreignTransfer(["example.entry"], ambiguousTree, { entries: {}, otherEntries: {} }, "other")
	.__engineMutationPath === "/otherEntries/entry", "Explicit destination slot must resolve ambiguity");
expectTransferError(["example.entry"], ambiguousTree, null, "missing", "INVALID_AUTHORING_TRANSFER_TARGET");
assertTrue(foreignTransfer(["example.entry"], null, { entries: [] }).op === "insert",
	"The same trait/slot resolver supports array collections as well as named collections");
var ambiguousPalette = service.authoringPaletteFromTreeRequest({ surface: "virtual", focusPath: "entries",
	definition: { entries: {}, otherEntries: {} } }, {}, ambiguousTree, env);
assertTrue(ambiguousPalette.items.length === 2, "A template must be materialized once per compatible slot, not cross-matched");
var staleMutation = service.authoringActionMutationFromTreeRequest({ surface: "virtual",
	definition: { entries: { entry: { enabled: false } } },
	action: { id: foreignPalette.items[0].id, targetPath: "entries" } }, {}, foreignTree, env);
assertTrue(staleMutation.__engineMutationPath === "/entries/entry2",
	"Replaying an old palette action must recalculate the name without overwriting the existing child");

var projected = service.describeTreeRequest({
	target: "engine",
	detail: "full",
	includeFlowCatalog: false,
	definition: {
		config: { service: {}, nested: { empty: {} }, hiddenOnly: { secret: "private" }, privateEmpty: {} },
		configVisibility: { "hiddenOnly.secret": "private", privateEmpty: "private" }
	}
}, {}, env);
var projectedConfig = projected.children.filter(function (node) { return node.path === "config"; })[0];
assertTrue(JSON.parse(projectedConfig.info).deletable === false,
	"The configuration root must not be deletable");
assertTrue(projectedConfig.children.every(function (node) { return JSON.parse(node.info).deletable === true; }),
	"Configuration entries must advertise deletion independently of their Java class");
var projectedPaths = projectedConfig.children.map(function (node) { return node.path; });
assertTrue(projectedPaths.indexOf("config.service") !== -1,
	"A newly added empty service must remain visible in the virtual tree");
assertTrue(projectedPaths.indexOf("config.hiddenOnly") === -1 && projectedPaths.indexOf("config.privateEmpty") === -1,
	"Visibility filtering must still hide private-only containers and private empty objects");
var nestedConfig = projectedConfig.children.filter(function (node) { return node.path === "config.nested"; })[0];
assertTrue(nestedConfig.children[0].path === "config.nested.empty",
	"Nested empty configuration objects must remain editable");

print("virtual-authoring-palette OK");
