// Dev/build admission and their menu must consult the same effective source view.
var engineDir = new java.io.File(arguments[0]).getCanonicalFile();
var File = java.io.File;
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var JavaSystem = java.lang.System;
var source = String(FileUtils.readFileToString(new File(engineDir, "Engine.js"), "UTF-8"));
var copies = eval(String(FileUtils.readFileToString(new File(engineDir,
	"modules/source-working-copies.js"), "UTF-8")));
var root = java.nio.file.Files.createTempDirectory("flow-frontend-model-view-").toFile();

function assert(value, message) { if (!value) throw new Error(message); }
function extract(name, nextName) {
	var start = source.indexOf("function " + name + "(");
	var end = source.indexOf("\n\tfunction " + nextName + "(", start);
	assert(start >= 0 && end > start, name + " must remain extractable");
	return eval("(" + source.substring(start, end).trim() + ")");
}
function sourceView(request) {
	return copies.create(request, { File: File, FileUtils: FileUtils, hash: function (text) { return text; } });
}
function frontendDevEntry() { return null; }
function contextNodeToggle() { return null; }
function isFrontendTarget() { return true; }
function frontbuilderSettingsForRequest() { return { settings: {} }; }
function frontendModelPath(request) { return new File(request.sourcePath); }
function failure(operation, error) { return { ok: false, error: error }; }
var admitted = {};
var effectiveText;
function frontendEffectiveModelPath(request, info, modelPath) {
	effectiveText = sourceView(request).read(modelPath);
	// Stop before external tools: this exercises the real Dev/build admission guard.
	throw admitted;
}
var contextMenuItem = extract("contextMenuItem", "contextNodeToggle");
var frontendBuilderCommands = extract("frontendBuilderCommands", "frontendStudioBuilders");
var frontendStudioBuilders = extract("frontendStudioBuilders", "contextMenuRequest");
var contextMenuRequest = extract("contextMenuRequest", "contextMenuItem");
var frontendRunAction = extract("frontendRunActionLocked", "frontendActionSteps");

function check(request, available, text, label) {
	var menu = contextMenuRequest(request, []);
	["dev.start", "generate", "build"].forEach(function (action) {
		assert(menu.items.some(function (item) { return item.id === "frontbuilder.svelte." + action; }) === available,
			label + ": menu admission for " + action);
	});
	["generate", "build"].forEach(function (action) {
		var response;
		try { response = frontendRunAction(request, [], action); }
		catch (error) {
			assert(available && error === admitted, label + ": unexpected admission error " + error);
			assert(effectiveText === text, label + ": admission must retain the effective content");
			return;
		}
		assert(!available && response.error.code === "FRONTBUILDER_MODEL_REQUIRED",
			label + ": missing or removed model must reject " + action);
	});
}

try {
	var old = new File(root, "src/routes/product/[id]/+page.flow.svelte");
	old.getParentFile().mkdirs();
	FileUtils.writeStringToFile(old, "saved page", "UTF-8");
	var moved = new File(root, "src/routes/catalog/[id]/+page.flow.svelte");
	var drafts = {};
	drafts[String(moved.getCanonicalPath())] = "draft page";
	var base = { targetObject: { kind: "frontendRoutePage" }, sourceDrafts: drafts,
		sourceRemovals: [String(old.getCanonicalPath())] };
	check(Object.assign({}, base, { sourcePath: String(moved) }), true, "draft page", "Renamed draft");
	check(Object.assign({}, base, { sourcePath: String(old) }), false, null, "Removed saved source");
	check({ sourcePath: String(old) }, true, "saved page", "Discard restores saved source");
	check({ sourcePath: String(moved) }, false, null, "Discard removes new source");
	assert(old.isFile() && !moved.exists(), "Admission cannot publish a draft");
	assert(String(FileUtils.readFileToString(old, "UTF-8")) === "saved page", "Saved source stays untouched");
	print("frontend-model-working-copy OK");
} finally { FileUtils.deleteDirectory(root); }
