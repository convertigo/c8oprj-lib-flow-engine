// Read-only operations share one view of project descriptors. Later requests
// and execution/mutation paths still see disk edits.
var File = java.io.File;
var NativeFileUtils = Packages.org.apache.commons.io.FileUtils;
var engineDir = new File(arguments.length ? arguments[0] : "_flow").getAbsoluteFile();
var source = String(NativeFileUtils.readFileToString(new File(engineDir, "Engine.js"), "UTF-8"));
function functionSource(name) {
	var start = source.indexOf("\n\tfunction " + name + "(") + 2;
	if (start < 2) throw new Error("Missing function " + name);
	var end = source.indexOf("\n\t}\n", start);
	if (end < 0) throw new Error("Missing function end " + name);
	return "(" + source.substring(start, end + 3) + ")";
}
var checks = 0;
function assertTrue(value, message) {
	checks++;
	if (!value) throw new Error(message);
}
var descriptorReads = 0;
function canonicalPath(file) { return String(file.getCanonicalPath()); }
var FileUtils = { readFileToString: function (file, encoding) {
	descriptorReads++;
	return NativeFileUtils.readFileToString(file, encoding);
} };
eval(source.substring(source.indexOf("\tvar MEMOIZED_FINGERPRINT_OPERATIONS"), source.indexOf("\tvar callFingerprints")));
var callFingerprints = new java.lang.ThreadLocal();
var JavaHashMap = java.util.HashMap;
function parseRequest(json) { return JSON.parse(json); }
function withActiveRequest(request, callback) { return callback(); }
function response(value) { return value; }
function failure(operation, error) { return { ok: false, message: String(error) }; }
var engineCall = eval(functionSource("engineCall"));
var withReadOnlyMemo = eval(functionSource("withReadOnlyMemo"));
var projectDescriptorSource = eval(functionSource("projectDescriptorSource"));
var projectNameForRoot = eval(functionSource("projectNameForRoot"));
var loader = eval(String(NativeFileUtils.readFileToString(new File(engineDir, "modules/catalog-loader-service.js"), "UTF-8")));
var workspace = java.nio.file.Files.createTempDirectory("flow-readonly-project-files").toFile();
var root = new File(workspace, "consumer-repository");
function projectDir() { return root; }
function currentActiveRequest() { return {}; }
function currentProjectName(request) { return "ConsumerFallback"; }
function write(file, text) { NativeFileUtils.writeStringToFile(file, text, "UTF-8"); }
var descriptor = new File(root, "c8oProject.yaml");
var env = {
	File: File, FileUtils: FileUtils,
	projectDir: projectDir, engineDir: function () { return new File(workspace, "lib_flow_engine/_flow"); },
	sourcePaths: { path: function (path) { return "_flow/" + path; } },
	projectNameForRoot: projectNameForRoot, projectDescriptorSource: projectDescriptorSource,
	flowProviderName: function () { return "lib_flow_engine"; }
};
function descriptorText(name, reference) {
	return "\u2193" + name + " [core.Project]:\n  projectName: " + reference + "\n";
}
function referencedName() {
	var roots = loader.referencedProjectRoots(env, "_flow/blocks");
	return roots.length ? String(roots[0].getName()) : "";
}
function readOnly(callback) { return engineCall("flowCodeCheck", "{}", callback); }
try {
	new File(workspace, "ProviderA/_flow/blocks").mkdirs();
	new File(workspace, "ProviderB/_flow/blocks").mkdirs();
	write(descriptor, descriptorText("ConsumerOne", "ProviderA"));
	readOnly(function () {
		assertTrue(projectNameForRoot(root) === "ConsumerOne", "Project identity comes from its descriptor");
		assertTrue(referencedName() === "ProviderA", "References read the same descriptor");
		assertTrue(descriptorReads === 1, "Identity lookup and reference discovery read the descriptor once");
		write(descriptor, descriptorText("ConsumerTwo", "ProviderB"));
		assertTrue(projectNameForRoot(root) === "ConsumerOne" && referencedName() === "ProviderA", "One read-only operation retains its descriptor view");
		assertTrue(descriptorReads === 1, "Repeated reads do no additional descriptor I/O");
	});
	assertTrue(callFingerprints.get() == null, "The snapshot is released after the operation");
	readOnly(function () {
		assertTrue(projectNameForRoot(root) === "ConsumerTwo" && referencedName() === "ProviderB", "A later request sees both identity and reference edits");
		assertTrue(descriptorReads === 2, "A new operation revalidates disk");
	});
	["run", "applySourceMutation"].forEach(function (operation) {
		engineCall(operation, "{}", function () {
			write(descriptor, descriptorText("BeforeEdit", "ProviderA"));
			assertTrue(projectNameForRoot(root) === "BeforeEdit" && referencedName() === "ProviderA", operation + " reads the saved sources");
			write(descriptor, descriptorText("AfterEdit", "ProviderB"));
			assertTrue(projectNameForRoot(root) === "AfterEdit" && referencedName() === "ProviderB", operation + " observes edits inside the operation");
		});
	});
	engineCall("run", "{}", function () {
		write(descriptor, descriptorText("BeforeNestedCheck", "ProviderA"));
		withReadOnlyMemo(function () {
			assertTrue(projectNameForRoot(root) === "BeforeNestedCheck", "An MCP read-only capability starts its own descriptor view");
			write(descriptor, descriptorText("AfterNestedCheck", "ProviderB"));
			assertTrue(projectNameForRoot(root) === "BeforeNestedCheck", "The nested read-only capability has a stable view");
		});
		assertTrue(projectNameForRoot(root) === "AfterNestedCheck", "The enclosing runtime observes edits after that capability returns");
	});
	var absentRoot = new File(workspace, "initially-absent");
	readOnly(function () {
		assertTrue(projectDescriptorSource(absentRoot) === null, "A missing descriptor stays missing");
		write(new File(absentRoot, "c8oProject.yaml"), descriptorText("NewProject", "ProviderA"));
		assertTrue(projectDescriptorSource(absentRoot) === null, "A missing descriptor result is also scoped to the operation");
	});
	readOnly(function () {
		assertTrue(projectNameForRoot(absentRoot) === "NewProject", "A descriptor created between operations is discovered");
	});
	var failed = readOnly(function () { projectNameForRoot(root); throw new Error("expected"); });
	assertTrue(failed.ok === false && callFingerprints.get() == null, "Failure releases the descriptor observation");
	write(descriptor, descriptorText("ThreadBefore", "ProviderA"));
	var workerName = "";
	readOnly(function () {
		assertTrue(projectNameForRoot(root) === "ThreadBefore", "The calling thread starts its own view");
		var worker = new java.lang.Thread(function () {
			write(descriptor, descriptorText("ThreadAfter", "ProviderB"));
			workerName = projectNameForRoot(root);
		});
		worker.start(); worker.join();
		assertTrue(workerName === "ThreadAfter", "Another thread does not inherit the read-only view");
		assertTrue(projectNameForRoot(root) === "ThreadBefore", "The caller's view is isolated");
	});
	assertTrue(projectNameForRoot(root) === "ThreadAfter", "Outside a read-only operation the current descriptor is read");
	assertTrue(callFingerprints.get() == null, "No observation outlives the operation");
	print("read-only-project-files: " + checks + " checks passed");
} finally {
	NativeFileUtils.deleteDirectory(workspace);
}
