// Named configurations use the existing generic config AST/palette/mutations.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-named-configs-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function equal(actual, expected, message) { assert(JSON.stringify(actual) === JSON.stringify(expected), message + ": " + JSON.stringify(actual)); }
function find(node, path) {
	if (node.path === path) return node;
	for (var i = 0; i < (node.children || []).length; i++) {
		var found = find(node.children[i], path); if (found) return found;
	}
}
try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(method, request) { return JSON.parse(engine[method](JSON.stringify(request))); }
	var definition = { version: 1, config: { baserow: { host: "common" }, commonOnly: true }, configs: {
		B1: { baserow: { host: "b1", token: null }, flag: false },
		B2: { baserow: { host: "b2" }, flag: 0 },
		SmtpSendGrid: { smtp: { host: "mail" } }
	} };
	var request = { target: "engine", engineSource: JSON.stringify(definition), includeFlowCatalog: false };
	var tree = api("describeTree", request);
	assert(tree.ok && find(tree, "config.baserow.host") && find(tree, "configs.B1.baserow.host"), "Common and named source paths preserved");
	var collection = find(tree, "configs");
	assert(collection.name === "configs" && collection.summary === "Configs", "Single configuration collection identity");
	assert(!tree.children.some(function (node) { return node.path === "config"; }), "Common configuration must not remain a separate root");
	assert(collection.children[0].name === "default" && collection.children[0].path === "config", "default is the first peer, backed by common config");
	assert(collection.children[1].path === "configs.B1", "Named configurations are peers of default");
	["config", "config.baserow.host", "configs.B1"].forEach(function (path) {
		var partial = api("describeTree", Object.assign({}, request, { projectionPaths: [path] }));
		assert(partial.children.length === 1 && find(partial, "config.baserow.host") && find(partial, "configs.B2"), "Complete shared projection for " + path + ": " + JSON.stringify(partial.children.map(function (node) { return node.path; })));
	});
	var emptyTree = api("describeTree", Object.assign({}, request, { engineSource: "version: 1\n" }));
	assert(find(emptyTree, "configs").children.length === 1 && find(emptyTree, "config").name === "default", "default is present even without configuration sources");
	var collisionTree = api("describeTree", Object.assign({}, request, { engineSource: JSON.stringify({ configs: { default: { value: "named" } } }) }));
	assert(find(collisionTree, "config") && find(collisionTree, "configs.default.value"), "Presentation default must not reserve or overwrite a valid source key");
	var info = JSON.parse(find(tree, "configs.B1.flag").info);
	assert(info.sourceMutationPath === "configs.B1.flag" && info.propertyDefinitions["#flow_value"].type === "boolean", "Generic typed value editor");
	var readOnlyTree = api("describeTree", Object.assign({}, request, { sourceWritable: false }));
	assert(JSON.parse(find(readOnlyTree, "configs.B1.flag").info).sourceWritable === false,
		"Explicit read-only ownership must reach named config descendants");
	var bindingsTree = api("describeTree", Object.assign({}, request, { engineSource: JSON.stringify({ bindings: { example: "implementation" } }) }));
	assert(JSON.parse(find(bindingsTree, "bindings.example").info).sourceWritable === true,
		"Existing binding edits must declare ownership rather than rely on Java path names");
	var palette = api("authoringPalette", Object.assign({}, request, { surface: "virtual", focusPath: "configs" }));
	assert(palette.ok && palette.items.length === 1, "Named collection only accepts configurations");
	assert(palette.items[0].label === "Add named configuration" && palette.items[0].description, "Named configuration palette documentation");
	var commonPalette = api("authoringPalette", Object.assign({}, request, { surface: "virtual", focusPath: "config" }));
	assert(commonPalette.ok && commonPalette.items.length === 2, "default accepts both groups and settings through its descriptor");
	assert(commonPalette.items.some(function (item) { return item.label === "Add setting"; }), "default exposes the generic setting creation action");
	var created = api("authoringMutate", Object.assign({}, request, { surface: "virtual", dryRun: true,
		action: { id: palette.items[0].id, targetPath: "configs", position: "inside" } }));
	assert(created.ok && created.selectionVirtualPath === "configs.configuration" && find(created, "configs.configuration"), "Generic palette creation/reveal");
	assert(!new java.io.File(project, "_flow/engine.yaml").exists(), "Dry-run creation wrote the project source");
	var settings = api("authoringPalette", Object.assign({}, request, { surface: "virtual", focusPath: "configs.B1.baserow" }));
	assert(settings.ok && settings.items.length === 2, "Nested config palette reuses groups and settings");
	var renamed = api("applyMutation", Object.assign({}, request, { mutation: { op: "renameKey", path: "configs.B1", value: "ServerOne" } }));
	assert(renamed.ok && renamed.selectionMutationPath === "configs.ServerOne" && find(renamed, "configs.ServerOne.baserow.host"), "Generic config rename preserves children");
	var changed = api("applyMutation", Object.assign({}, request, { includeTree: false,
		mutation: { op: "replace", path: "configs.B1", value: [] } }));
	assert(!changed.ok && changed.error.code === "FLOW_CONFIG_DEFINITION_OBJECT_REQUIRED", "Invalid definition rejected even without tree projection");
	var source = "const _flow={sourceVersion:2}\nfunction Proof(){ result.snapshot = config }";
	var schemaTree = api("describeTree", { target: "flow", flowSource:
		"const _flow={sourceVersion:2,inputs:{name:{type:'string'}},outputs:{type:'object'}}\nfunction Proof(){}" });
	assert(JSON.parse(find(schemaTree, "flow.inputs.name.type").info).sourceWritable === true,
		"Input schema descendants must declare ownership");
	var readOnlySchema = api("describeTree", { target: "flow", flowSource:
		"const _flow={sourceVersion:2,inputs:{name:{type:'string'}}}\nfunction Proof(){}", readOnlyReference: true });
	assert(JSON.parse(find(readOnlySchema, "flow.inputs.name.type").info).sourceWritable === false,
		"Read-only schema descendants must not gain implicit writes");
	assert(!find(readOnlySchema, "effectiveConfig"), "A Flow without any configuration keeps its tree unchanged");
	files.writeStringToFile(new java.io.File(project, "_flow/engine.yaml"), JSON.stringify(definition), "UTF-8");
	engine.cacheClear();
	var run = api("run", { flowSource: source, includeTrace: false });
	assert(run.ok, "Runtime with unused named configs");
	equal(run.result.snapshot, definition.config, "Unselected definitions must not affect common config");
	var service = eval(String(files.readFileToString(new java.io.File(engineDir, "modules/project-config-service.js"), "UTF-8")));
	var env = { normalizeTree: function (value) { return JSON.parse(JSON.stringify(value)); } };
	var composed = service.resolveConfigReferences(definition, ["B1", "SmtpSendGrid", "B2"], env);
	equal(composed, { baserow: { host: "b2", token: null }, flag: 0, smtp: { host: "mail" } }, "Ordered merge, value by value, the last reference winning");
	composed.baserow.host = "mutated";
	assert(definition.configs.B2.baserow.host === "b2" && definition.configs.B1.baserow.host === "b1", "Resolution must detach source values");
	equal(service.resolveConfigReferences({ configs: { A: { list: [1, 2], obj: { a: 1 }, keep: { a: 1 } }, B: { list: [3], obj: null, keep: { b: 2 } } } },
		["A", "B"], env), { list: [3], obj: null, keep: { a: 1, b: 2 } }, "Objects merge, arrays and null replace");
	var poisoned = JSON.parse('{"configs":{"P":{"__proto__":{"polluted":true},"ok":1}}}');
	equal(service.resolveConfigReferences(poisoned, ["P"], env), { ok: 1 }, "A __proto__ key is never merged");
	assert(({}).polluted === undefined, "Merging must not pollute Object.prototype");
	equal(service.resolveConfigReferences(definition, ["B2", "B1"], env), definition.configs.B1, "Last explicit reference wins, including null/false");
	equal(service.resolveConfigReferences({}, [], env), {}, "Absent definitions/empty references are valid");
	function rejects(projectEngine, references, code) {
		var error;
		try { service.resolveConfigReferences(projectEngine, references, env); } catch (caught) { error = caught; }
		assert(error && error.code === code, "Expected " + code);
	}
	rejects(definition, "B1", "FLOW_CONFIG_REFERENCES_ARRAY_REQUIRED");
	rejects(definition, ["missing"], "FLOW_CONFIG_REFERENCE_NOT_FOUND");
	rejects(definition, ["toString"], "FLOW_CONFIG_REFERENCE_NOT_FOUND");
	rejects({ configs: [] }, [], "FLOW_CONFIG_DEFINITIONS_OBJECT_REQUIRED");
	rejects({ configs: { invalid: null } }, [], "FLOW_CONFIG_DEFINITION_OBJECT_REQUIRED");
	print("named-project-configs OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(project);
}
