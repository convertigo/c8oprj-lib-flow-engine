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
assertTrue(rootPalette.items[0].authoringMutation.__engineMutationPath === "config.service",
	"Rhino must compute the service mutation path");

var servicePalette = service.authoringPaletteFromTreeRequest({
	surface: "virtual",
	focusPath: "config.weather",
	position: "inside",
	detail: "compact",
	definition: { config: config.definition }
}, {}, tree, env);
assertTrue(servicePalette.ok && servicePalette.items.length === 1, "Config service must expose one Rhino palette action");
assertTrue(servicePalette.items[0].authoringMutation.__engineMutationPath === "config.weather.setting",
	"Rhino must compute the setting mutation path");
assertTrue(servicePalette.items[0].authoringMutation.value === "", "A new setting must start as an editable scalar");

print("virtual-authoring-palette OK");
