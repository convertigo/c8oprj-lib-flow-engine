// The human Build panel discovers opaque commands through the runtime descriptor.
var File = java.io.File;
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var source = String(FileUtils.readFileToString(new File(arguments[0], "Engine.js"), "UTF-8"));
function assert(value, message) { if (!value) throw new Error(message); }
function extract(name, next) {
	var start = source.indexOf("function " + name + "(");
	var end = source.indexOf("\n\tfunction " + next + "(", start);
	assert(start >= 0 && end > start, name + " must remain extractable");
	return eval("(" + source.substring(start, end).trim() + ")");
}
var contextMenuItem = extract("contextMenuItem", "contextNodeToggle");
var frontendBuilderCommands = extract("frontendBuilderCommands", "frontendStudioBuilders");
var frontendStudioBuilders = extract("frontendStudioBuilders", "contextMenuRequest");
function projectEngineDefinitionForRequest(request) { return request.engineDefinition; }
function frontendCatalogService() {
	return { frontbuilderSettings: function (config) {
		return Object.keys(config.frontbuilder || {}).map(function (key) {
			return { name: key, settings: config.frontbuilder[key] };
		});
	} };
}
function frontendModelPath(request, info) {
	assert(!request.sourcePath && !request.sourceFile, "A selected page cannot override builder admission");
	assert(!request.targetObject.info, "Selected node source hints cannot override the builder model");
	return info.settings.modelPath;
}
function sourceView(request) { return { isFile: function (path) { return request.effectiveFiles.indexOf(path) >= 0; } }; }
function frontendDevEntry(request, info) { return request.activeBuilders.indexOf(info.name) >= 0 ? {} : null; }
function frontendProjectRootFile(request) { return "project-root"; }
function frontendBuildOutputBuilt(projectRoot, buildOutput) { return projectRoot === "project-root" && buildOutput === "built-output"; }
var request = {
	root: { kind: "engine", qname: "Project.CustomEngine" },
	targetObject: { kind: "frontendRoutePage", info: { sourcePath: "other/+page.flow.svelte" } },
	sourcePath: "other/+page.flow.svelte", sourceFile: "other/+page.flow.svelte",
	engineDefinition: { config: { frontbuilder: {
		customer: { modelPath: "draft-only/+page.flow.svelte" },
		admin: { modelPath: "admin/+page.flow.svelte", buildOutput: "built-output" },
		removed: { modelPath: "removed/+page.flow.svelte" }
	} } },
	effectiveFiles: ["draft-only/+page.flow.svelte", "admin/+page.flow.svelte"],
	activeBuilders: ["admin"]
};
var builders = frontendStudioBuilders(request);
assert(builders.length === 3, "All configured builders, not hardcoded conventional names");
assert(builders[0].state.built === false && builders[1].state.built === true,
	"Each builder tells whether its own production output holds a build");
assert(builders[0].target === "Project.CustomEngine", "Action target uses the supplied identity");
assert(builders[0].commands.serve.payload.builder === "customer", "Commands retain builder selection");
assert(builders[0].available && builders[0].commands.build.enabled, "Draft-only model is available");
assert(builders[1].state.serving && !builders[1].commands.build.enabled,
	"Active Dev disables production, as in the context menu");
assert(builders[1].commands.open.enabled && builders[1].commands.stop.enabled,
	"An active Dev server can be opened or stopped");
assert(!builders[2].available && !builders[2].commands.serve.enabled,
	"Removed models are not enabled merely because a saved source existed");
request.root.kind = "flow";
assert(frontendStudioBuilders(request).length === 0, "Backend flows do not advertise frontend builders");
print("frontend-studio-builder OK");
