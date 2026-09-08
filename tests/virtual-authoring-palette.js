var engineDir = new java.io.File(arguments.length > 0 ? arguments[0] : "libs/flow").getAbsoluteFile();
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
assertTrue(added.written === false && added.children.length === 0, "Dry-run with no projection must not write or build a tree");

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
var tree = { ok: true, children: [config], descriptors: [] };

var rootPalette = service.authoringPaletteFromTreeRequest({
	surface: "virtual",
	focusPath: "config",
	position: "inside",
	detail: "compact",
	definition: { config: config.definition }
}, {}, tree, env);
assertTrue(rootPalette.ok && rootPalette.items.length === 1, "Config root must expose one Rhino palette action");
assertTrue(rootPalette.items[0].authoringAction.id === "virtual.create.scope",
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
assertTrue(servicePalette.ok && servicePalette.items.length === 1, "Config service must expose one Rhino palette action");
assertTrue(servicePalette.items[0].authoringAction.id === "virtual.create.object",
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
assertTrue(settingMutation.__engineMutationPath === "config.weather.setting",
	"The action must be recomputed from the current virtual target instead of trusting stale palette mutations");

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
