// A link to a Page not written yet made the build fail (FLOW_PAGE_LINK_UNKNOWN), so an agent had to write every linked
// Page, even empty, before a first build. The generation now says it in a "Warning: CODE: message" line of its output
// (frontbuilder 0.3.3), and the output of a step that succeeded is not kept: those lines are the warnings of the result,
// which the MCP says in its text.
var engineDir = new java.io.File(arguments[0]).getCanonicalFile();
var File = java.io.File;
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var JavaSystem = java.lang.System;
var source = String(FileUtils.readFileToString(new File(engineDir, "Engine.js"), "UTF-8"));
var root = java.nio.file.Files.createTempDirectory("flow-frontend-generation-warnings-").toFile();

function assert(value, message) { if (!value) throw new Error(message); }
function functionText(name) {
	var start = source.indexOf("\n\tfunction " + name + "(");
	if (start < 0) {
		return null;
	}
	// up to its closing brace: comments and variables of the next function follow
	var end = source.lastIndexOf("\n\t}", source.indexOf("\n\tfunction ", start + 1)) + 3;
	return source.substring(start, end).trim();
}
function extract(name) {
	var text = functionText(name);
	assert(text, name + " must remain extractable");
	return eval("(" + text + ")");
}

var model = new File(root, "src/routes/+page.flow.svelte");
var resourceRoot = new File(root, "frontbuilder");
var buildOutput = "";
function frontbuilderSettingsForRequest() { return { settings: {} }; }
function frontendModelPath() { return model; }
function sourceView() { return { isFile: function (file) { return file.isFile(); } }; }
function frontendEffectiveModelPath(request, info, modelPath) { return { file: modelPath }; }
function frontendDraftCount() { return 0; }
function frontendProjectRootFile() { return root; }
function frontendProjectName() { return "consumer"; }
function frontendSvelteResourceRoot() { return resourceRoot; }
function frontendGeneratedRootFile() { return new File(root, "_private/svelte"); }
function frontendAtomicBuildOutput() { return null; }
function frontendExecutable(name) { return "/usr/bin/" + name; }
function frontendExecutablePathPrefix() { return "/usr/bin:"; }
function frontendCatalogCacheKey() { return ""; }
function frontendPrivateCallsStep() { return null; }
var generateOutput = "";
function frontendRunStep(stepAction) {
	return { action: stepAction, command: stepAction, cwd: "/app", ok: true, exitCode: 0, skipped: false,
		stdout: stepAction === "generate" ? generateOutput : "Warning: NOT_A_GENERATION: an install line", durationMs: 0 };
}
function frontendDurationMs() { return 0; }
// A step that succeeded records the production state: kept out of this test.
function frontendProductionFingerprint() { return "fingerprint"; }
function frontendProductionLifecycle() { return { completed: function (state) { return state; }, observe: function (state) { return state; } }; }
function frontendReadProductionState() { return {}; }
function frontendWriteProductionState() {}
function frontendObserveProductionState() { return {}; }
function frontendBuiltUrl() { return ""; }
function frontendAcceptancePlan() { return null; }
function failure(operation, error) { return { ok: false, error: error }; }
// The helpers of the excerpt, when the Engine has them; the action itself is what is checked.
["frontendStepErrorLines", "frontendStepOutputExcerpt", "frontendWriteStepOutputLog", "frontendFailedStepOutput"].forEach(function (name) {
	if (functionText(name)) {
		this[name] = extract(name);
	}
}, this);
var frontendActionSteps = extract("frontendActionSteps");
var frontendGenerationOutputEnv = extract("frontendGenerationOutputEnv");
var frontendRunAction = extract("frontendRunActionLocked");

try {
	model.getParentFile().mkdirs();
	FileUtils.writeStringToFile(model, "page", "UTF-8");
	resourceRoot.mkdirs();
	FileUtils.writeStringToFile(new File(resourceRoot, "package.json"), "{}", "UTF-8");
	var warning = "FLOW_PAGE_LINK_UNKNOWN: Link button 'toDetail' targets unknown Page 'detail'. Existing Pages: home. " +
		"Until each missing Page is written with this id (_flow.page.id), its links lead nowhere: write it, or correct the link.";
	generateOutput = ["Generated App into _private/svelte", "Build output target: DisplayObjects/mobile", "Written files: none",
		"Unchanged files: 3", "Warning: " + warning].join("\n");
	var response = frontendRunAction({}, [], "build");
	assert(response.ok === true, "the build succeeds: " + JSON.stringify(response.details && response.details.steps));
	assert(JSON.stringify(response.warnings) === JSON.stringify([{ code: "FLOW_PAGE_LINK_UNKNOWN", severity: "warning",
		message: warning.substring("FLOW_PAGE_LINK_UNKNOWN: ".length) }]), "the warning of the generation is in the result: " +
		JSON.stringify(response.warnings));
	response = frontendRunAction({}, [], "generate");
	assert(response.ok === true && response.warnings && response.warnings.length === 1, "a generation says it too");
	generateOutput = "Generated App into _private/svelte\nUnchanged files: 3";
	response = frontendRunAction({}, [], "build");
	assert(response.ok === true && response.warnings === undefined, "a generation without warning adds none: " + JSON.stringify(response.warnings));
	print("frontend-generation-warnings OK");
} finally { FileUtils.deleteDirectory(root); }
