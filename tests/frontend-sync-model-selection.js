// A source-change notification selects the builder, not the affected file.
var File = java.io.File;
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var engineDir = new File(arguments[0]);
var source = String(FileUtils.readFileToString(new File(engineDir, "Engine.js"), "UTF-8"));
var start = source.indexOf("function frontendModelPath(");
var end = source.indexOf("\n\tfunction frontendSourceDrafts(", start);
if (start < 0 || end <= start) throw new Error("frontendModelPath not found");
var frontendModelPath = eval("(" + source.substring(start, end).trim() + ")");

function fileForProjectPath(root, value) {
	var file = new File(String(value));
	return (file.isAbsolute() ? file : new File(root, String(value))).getCanonicalFile();
}
function assertSame(actual, expected, message) {
	if (!actual.equals(expected.getCanonicalFile())) throw new Error(message + ": " + actual);
}

var root = java.nio.file.Files.createTempDirectory("flow-sync-model-").toFile();
try {
	var saved = new File(root, "model/+page.flow.svelte");
	saved.getParentFile().mkdirs();
	FileUtils.writeStringToFile(saved, "saved root page", "UTF-8");
	var removed = new File(root, "model/removed/+page.flow.svelte");
	var info = { settings: { modelPath: "model/+page.flow.svelte" } };
	var request = { projectDir: String(root), sourcePath: String(removed),
		action: { id: "frontbuilder.svelte.dev.sync", payload: { sourcePath: String(removed) } } };
	assertSame(frontendModelPath(request, info), saved, "Sync must use the declared builder model");
	request.sourcePath = String(new File(root, "model/draft/+page.flow.svelte"));
	assertSame(frontendModelPath(request, info), saved, "A newly created page is also notification data");
	request.action.payload.modelPath = "model/other/+page.flow.svelte";
	assertSame(frontendModelPath(request, info), new File(root, request.action.payload.modelPath),
		"An explicit model selection stays authoritative");
	delete request.action.payload.modelPath;
	request.action.id = "frontbuilder.svelte.generate";
	assertSame(frontendModelPath(request, info), removed, "A direct action still selects its source");
	if (removed.exists()) throw new Error("Selection cannot publish or recreate a removed source");
	print("frontend-sync-model-selection OK");
} finally { FileUtils.deleteDirectory(root); }
