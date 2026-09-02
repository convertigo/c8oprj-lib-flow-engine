var engineDir = new java.io.File(arguments.length > 0 ? arguments[0] : "libs/flow").getAbsoluteFile();
var serviceFile = new java.io.File(engineDir, "modules/flow-tree-service.js");
var service = eval(String(Packages.org.apache.commons.io.FileUtils.readFileToString(serviceFile, "UTF-8")));

function assertTrue(value, message) {
	if (!value) throw new Error(message);
}

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

var descriptor = { id: "Text", label: "Text" };
var builder = {
	path: "frontends.builder_svelte",
	kind: "frontendBuilder",
	type: "svelte",
	diagnostics: [{ code: "EXAMPLE" }],
	__authoringDescriptors: [descriptor],
	children: [{
		path: "frontends.builder_svelte.routes",
		kind: "folder",
		type: "routes",
		children: []
	}]
};
var tree = {
	ok: true,
	target: "engine",
	children: [{
		path: "frontends",
		kind: "folder",
		type: "frontends",
		children: [builder]
	}, {
		path: "catalog",
		kind: "folder",
		type: "catalog",
		children: []
	}]
};

var projected = service.authoringTreeBaseFromEngineTree({
	surface: "frontend",
	builder: "svelte",
	definition: {}
}, tree, {
	normalizeTree: clone
});

assertTrue(projected.ok === true && projected.target === "authoring",
	"shared candidate must expose an authoring response");
assertTrue(projected.children.length === 1
	&& projected.children[0].path === "frontends.builder_svelte",
	"shared candidate must contain only the selected frontend builder");
assertTrue(JSON.stringify(projected.descriptors) === JSON.stringify([descriptor]),
	"shared candidate must preserve dynamic authoring descriptors");
assertTrue(projected.children[0].__authoringDescriptors === undefined,
	"shared candidate must not leak internal descriptor storage");
assertTrue(tree.children[0].children[0].__authoringDescriptors !== undefined,
	"shared candidate projection must not mutate the cached describeTree snapshot");
assertTrue(projected.children[0] !== tree.children[0].children[0],
	"shared candidate must own an isolated builder projection");

print("frontend-authoring-shared-candidate OK");
