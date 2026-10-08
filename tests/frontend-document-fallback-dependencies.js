// When the Svelte front document server fails, the Node process fallback installs the packages of the builder first
// when tsx is missing (with a local working directory, they are gone after a restart until installed again), instead
// of letting npm download tsx, and a failure tells the first cause, not only the fallback's.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));

function functionSource(name) {
	var start = source.indexOf("\n\tfunction " + name + "(") + 2;
	if (start < 2) {
		throw new Error("missing function " + name);
	}
	// up to its closing brace: comments and variables of the next function follow
	var end = source.lastIndexOf("\n\t}", source.indexOf("\n\tfunction ", start + 1)) + 3;
	return "(" + source.substring(start, end) + ")";
}

function assertTrue(value, message) {
	if (!value) {
		throw new Error(message);
	}
}

var File = java.io.File;
var toolRoot = java.nio.file.Files.createTempDirectory("flow-front-document-fallback").toFile();
var tsxCli = new File(toolRoot, "node_modules/tsx/dist/cli.mjs");
var ensured = 0;
var ran = [];
var logged = [];
var installFails = false;
var runFails = false;
var runtimeState = { frontendDocumentServerStats: { errors: 0, fallbacks: 0, lastError: "" } };
function frontendRunDocumentServer() { throw new Error("server start failed"); }
function frontendRejectProvider() {}
function frontendStudioLog(message) { logged.push(String(message)); }
function forgetDeadFrontendDocumentServers() {}
function frontendSvelteToolRoot() { return toolRoot; }
function ensureFrontendDocumentDependencies(root) {
	ensured++;
	if (installFails) {
		throw new Error("npm install failed");
	}
	tsxCli.getParentFile().mkdirs();
	tsxCli.createNewFile();
}
function frontendTsxCommandForToolRoot(root, script, args) {
	return tsxCli.isFile() ? ["node", String(tsxCli), script] : ["npm", "exec", "--", "tsx", script];
}
function frontendRunOneShot(args) {
	ran.push(args.join(" "));
	if (runFails) {
		var error = new Error("Svelte front document tsx fallback failed with exit code 1.");
		error.code = "FRONTEND_SOURCE_MUTATION_FAILED";
		throw error;
	}
	return "__C8O_FRONT_DOCUMENT__{}";
}
function frontendMarkedJson(output) { return { model: {} }; }
var frontendDescribeDocument = eval(functionSource("frontendDescribeDocument"));

function errorOf(fn) {
	try {
		fn();
	} catch (e) {
		return e;
	}
	return null;
}

try {
	assertTrue(frontendDescribeDocument(toolRoot, []).model, "the fallback describes the document");
	assertTrue(ensured === 1, "the packages are installed first, tsx being missing");
	assertTrue(ran.length === 1 && ran[0].indexOf("node ") === 0, "then tsx runs from them, npm never downloads it: " + ran);
	assertTrue(logged.some(function (line) { return line.indexOf("server start failed") >= 0; }), "the first cause is logged");

	frontendDescribeDocument(toolRoot, []);
	assertTrue(ensured === 1, "installed packages are not installed again by the fallback");

	runFails = true;
	var error = errorOf(function () { frontendDescribeDocument(toolRoot, []); });
	assertTrue(error && /server start failed/.test(error.message) && /exit code 1/.test(error.message),
		"a failure tells the first cause and the fallback's: " + (error && error.message));
	assertTrue(error.code === "FRONTEND_SOURCE_MUTATION_FAILED", "with the code of the fallback failure");

	tsxCli.delete();
	installFails = true;
	error = errorOf(function () { frontendDescribeDocument(toolRoot, []); });
	assertTrue(error && /server start failed/.test(error.message) && /npm install failed/.test(error.message),
		"an installation that fails is told too: " + (error && error.message));
} finally {
	Packages.org.apache.commons.io.FileUtils.deleteQuietly(toolRoot);
}

print("frontend-document-fallback-dependencies: packages installed before tsx, causes told");
