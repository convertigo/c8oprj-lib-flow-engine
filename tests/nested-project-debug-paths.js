// The debugger must keep local sources in the requested project, even without c8oProject.yaml.
var File = java.io.File;
var files = Packages.org.apache.commons.io.FileUtils;
var __flowEngineDir = String(new File(arguments[0]).getCanonicalPath());
var temporary = java.nio.file.Files.createTempDirectory("flow-debug-paths-").toFile();
var host = new File(temporary, "Host");
var target = new File(host, "nested/Target");
var __flowProjectDir = String(host);
var source = String(files.readFileToString(new File(__flowEngineDir, "Engine.js"), "UTF-8"));
// Expose the real path calculation only in this test's Engine, through its normal request scope.
var engine = eval(source.replace("var api = {", "var api = { debugSourcePath: function (json) {" +
	"return projectCall('debugSourcePath', json, function (request) {" +
	"return { uri: debugSourceUrl(new File(request.sourceFile)) }; }); },"));
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function write(file, text) {
	files.forceMkdir(file.getParentFile());
	files.writeStringToFile(file, text, "UTF-8");
}
function uri(root, file) {
	return JSON.parse(engine.debugSourcePath(JSON.stringify({ projectDir: String(root), sourceFile: String(file) }))).uri;
}
try {
	write(new File(host, "c8oProject.yaml"), "↓Host [core.Project]:\n");
	var flow = new File(target, "_flow/flows/Smoke.flow.js");
	write(flow, "function Smoke() {}\n");
	assert(!new File(target, "c8oProject.yaml").exists(), "The target must have no project descriptor");
	assert(uri(target, flow) === "Target/_flow/flows/Smoke.flow.js", "Local debug URI must use the target project");
	assert(uri(host, flow) === "Host/nested/Target/_flow/flows/Smoke.flow.js", "The request selects the debug URI root");
	assert(uri(target, flow) === "Target/_flow/flows/Smoke.flow.js", "Request roots must not leak between calls");
	var library = new File(temporary, "Library");
	write(new File(library, "c8oProject.yaml"), "↓SharedLibrary [core.Project]:\n");
	var block = new File(library, "_flow/blocks/shared.block.js");
	write(block, "function shared() {}\n");
	assert(uri(target, block) === "SharedLibrary/_flow/blocks/shared.block.js", "External library sources keep their owner");
	print("nested-project-debug-paths OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(temporary);
}
