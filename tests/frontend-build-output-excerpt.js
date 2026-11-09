// A failed frontend step reports the start and the end of its output: a production build prints its failure last
// (SvelteKit reports the prerendering after the compiled chunks), and an excerpt of the first characters hid it.
// The recognizable error lines come apart and bounded, and the whole output is kept in a private file of the project.
var engineDir = new java.io.File(arguments[0]).getCanonicalFile();
var File = java.io.File;
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var JavaSystem = java.lang.System;
var source = String(FileUtils.readFileToString(new File(engineDir, "Engine.js"), "UTF-8"));
var root = java.nio.file.Files.createTempDirectory("flow-frontend-build-output-").toFile();

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
function frontendRunStep(stepAction) {
	if (stepAction !== "build") {
		return { action: stepAction, ok: true, exitCode: 0, skipped: false, durationMs: 0 };
	}
	return { action: stepAction, command: "npm run build", cwd: "/app", ok: false, exitCode: 1, stdout: buildOutput, durationMs: 0 };
}
function frontendDurationMs() { return 0; }
function failure(operation, error) { return { ok: false, error: error }; }
// The helpers of the excerpt, when the Engine has them; the action itself is what is checked.
["frontendStepErrorLines", "frontendStepOutputExcerpt", "frontendWriteStepOutputLog", "frontendFailedStepOutput"].forEach(function (name) {
	if (functionText(name)) {
		this[name] = extract(name);
	}
}, this);
var frontendActionSteps = extract("frontendActionSteps");
var frontendRunAction = extract("frontendRunActionLocked");

function buildStep(response) {
	var steps = response.details.steps;
	return steps[steps.length - 1];
}

try {
	model.getParentFile().mkdirs();
	FileUtils.writeStringToFile(model, "page", "UTF-8");
	resourceRoot.mkdirs();
	FileUtils.writeStringToFile(new File(resourceRoot, "package.json"), "{}", "UTF-8");

	var chunks = [];
	for (var i = 0; chunks.join("\n").length < 6000; i++) {
		chunks.push(".svelte-kit/output/server/chunks/component" + i + ".js    " + (i % 9 + 1) + ".42 kB | gzip: 1.10 kB");
	}
	var failureLines = [
		"✓ built in 2.10s",
		"prerender_unseen_routes",
		"The following routes were marked as prerenderable, but were not prerendered because they were not found while crawling your app:",
		"  - /items/[id]",
		"error during build:",
		"[Error: Prerendering failed]",
		"npm error code 1"
	].join("\n");
	buildOutput = ["> app@0.0.0 build", "> vite build", "vite v8.3.4 building ssr environment for production..."].concat(chunks).join("\n") + "\n" + failureLines;
	assert(buildOutput.length > 4000 && buildOutput.substring(0, 4000).indexOf("Prerendering failed") < 0,
		"the simulated output has its error after the first 4000 characters");

	var response = frontendRunAction({}, [], "build");
	var step = buildStep(response);
	assert(response.ok === false && step.action === "build" && step.ok === false && step.exitCode === 1,
		"the build fails: " + JSON.stringify(response.details.steps));
	assert(step.stdout.indexOf("[Error: Prerendering failed]") >= 0 && step.stdout.indexOf("prerender_unseen_routes") >= 0,
		"the error at the end of the output is in the response: " + step.stdout.substring(step.stdout.length - 300));
	assert(step.stdout.indexOf("> app@0.0.0 build") === 0, "the start of the output stays");
	assert(step.stdout.length < 4200, "the excerpt stays bounded: " + step.stdout.length);
	assert(step.truncatedChars === buildOutput.length - 4000 && step.stdout.indexOf("[… " + step.truncatedChars + " characters cut") > 0,
		"the excerpt says how many characters are cut: " + step.truncatedChars);
	assert(JSON.stringify(step.errorLines) === JSON.stringify([
		"prerender_unseen_routes",
		"The following routes were marked as prerenderable, but were not prerendered because they were not found while crawling your app:",
		"error during build:",
		"[Error: Prerendering failed]",
		"npm error code 1"
	]), "the error lines come apart: " + JSON.stringify(step.errorLines));
	assert(step.outputLog === "_private/logs/frontbuilder-build.log", "the whole output has a private file: " + step.outputLog);
	assert(step.stdout.indexOf("full output in _private/logs/frontbuilder-build.log") > 0, "that the excerpt names");
	var log = String(FileUtils.readFileToString(new File(root, step.outputLog), "UTF-8"));
	assert(log.indexOf(buildOutput) > 0 && log.indexOf("build exit 1") > 0, "the file keeps the whole output");

	buildOutput = "vite build\nerror during build:\n[Error: short]";
	step = buildStep(frontendRunAction({}, [], "build"));
	assert(step.stdout === buildOutput && step.truncatedChars === undefined, "a short output stays whole");

	var many = [];
	for (var e = 0; e < 30; e++) {
		many.push("Error: failure " + e);
	}
	buildOutput = many.join("\n");
	step = buildStep(frontendRunAction({}, [], "build"));
	assert(step.errorLines.length === 20 && step.errorLines[19] === "Error: failure 29" && step.errorLinesOmitted === 10,
		"the error lines are bounded, the last ones kept: " + JSON.stringify(step.errorLines));

	buildOutput = "";
	step = buildStep(frontendRunAction({}, [], "build"));
	assert(step.stdout === undefined && step.outputLog === undefined, "a step without output reports none");
	print("frontend-build-output-excerpt OK");
} finally { FileUtils.deleteDirectory(root); }
