// A frontend action that generates gives the frontbuilder the catalog key of the request
// (FRONTBUILDER_CATALOG_CACHE_KEY, an environment variable an older provider ignores): the
// companion then reuses the catalog and the portable blocks a mutation loaded under the
// same key instead of reading every component and block again.
var engineDir = new java.io.File(arguments[0]).getCanonicalFile();
var File = java.io.File;
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var JavaSystem = java.lang.System;
var source = String(FileUtils.readFileToString(new File(engineDir, "Engine.js"), "UTF-8"));
var root = java.nio.file.Files.createTempDirectory("flow-frontend-generation-key-").toFile();

function assert(value, message) { if (!value) throw new Error(message); }
function extract(name, nextName) {
	var start = source.indexOf("function " + name + "(");
	var end = source.indexOf("\n\tfunction " + nextName + "(", start);
	assert(start >= 0 && end > start, name + " must remain extractable");
	return eval("(" + source.substring(start, end).trim() + ")");
}

var model = new File(root, "src/routes/+page.flow.svelte");
var resourceRoot = new File(root, "frontbuilder");
var catalogKey = "catalog-key";
var stepEnvironments = {};
function frontbuilderSettingsForRequest() { return { settings: {} }; }
function frontendDevEntry() { return null; }
function frontendModelPath() { return model; }
function sourceView() { return { isFile: function (file) { return file.isFile(); } }; }
function frontendEffectiveModelPath(request, info, modelPath) { return { file: modelPath }; }
function frontendDraftCount() { return 0; }
function frontendProjectRootFile() { return root; }
function frontendProjectName() { return "consumer"; }
function frontendSvelteResourceRoot() { return resourceRoot; }
function frontendGeneratedRootFile() { return new File(root, "_private/svelte"); }
function frontendExecutable(name) { return "/usr/bin/" + name; }
function frontendExecutablePathPrefix() { return "/usr/bin:"; }
function frontendCatalogCacheKey(request) { return catalogKey; }
function frontendRunStep(stepAction, npm, resourceRoot, projectRoot, projectName, modelPath, generatedRoot, generationMode, envValues) {
	stepEnvironments[stepAction] = JSON.parse(JSON.stringify(envValues));
	return { action: stepAction, ok: true, exitCode: 0, skipped: false, durationMs: 0 };
}
function frontendDurationMs() { return 0; }
function frontendObserveProductionState() { return {}; }
function failure(operation, error) { return { ok: false, error: error }; }
var frontendActionSteps = extract("frontendActionSteps", "frontendActionStepPerformed");
var frontendRunAction = extract("frontendRunActionLocked", "frontendActionSteps");

try {
	model.getParentFile().mkdirs();
	FileUtils.writeStringToFile(model, "page", "UTF-8");
	resourceRoot.mkdirs();
	FileUtils.writeStringToFile(new File(resourceRoot, "package.json"), "{}", "UTF-8");

	["generate", "install"].forEach(function (action) {
		stepEnvironments = {};
		var response = frontendRunAction({}, [], action);
		assert(response.ok, action + " runs: " + JSON.stringify(response));
		assert(stepEnvironments.generate.FRONTBUILDER_CATALOG_CACHE_KEY === catalogKey,
			action + " generates with the catalog key: " + JSON.stringify(stepEnvironments.generate));
	});

	stepEnvironments = {};
	frontendRunAction({}, [], "serve");
	assert(stepEnvironments.serve && stepEnvironments.serve.FRONTBUILDER_CATALOG_CACHE_KEY === undefined,
		"an action that does not generate does not compute the key");

	catalogKey = "";
	stepEnvironments = {};
	frontendRunAction({}, [], "generate");
	assert(stepEnvironments.generate.FRONTBUILDER_CATALOG_CACHE_KEY === undefined,
		"without a catalog fingerprint the frontbuilder loads its catalog");
	print("frontend-generation-catalog-key OK");
} finally { FileUtils.deleteDirectory(root); }
