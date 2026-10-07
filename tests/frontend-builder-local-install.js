// With a local working directory, the packages of a Svelte builder that accepts it are installed there, instead of in
// its folder of the library project: node_modules becomes a link, npm installs from a copy of the package files, and
// the builder package's own installation scripts run in its folder. Otherwise, nothing changes.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var File = java.io.File;
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var Files = java.nio.file.Files;

function extract(name) {
	var start = source.indexOf("function " + name + "(");
	if (start < 0) {
		throw new Error("missing function " + name);
	}
	// up to its closing brace: comments and variables of the next function follow
	var end = source.lastIndexOf("\n\t}", source.indexOf("\n\tfunction ", start + 1)) + 3;
	return eval("(" + source.substring(start, end) + ")");
}

function assertEqual(actual, expected, message) {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(message + ": " + JSON.stringify(actual) + " instead of " + JSON.stringify(expected));
	}
}

function assertTrue(value, message) {
	if (!value) {
		throw new Error(message);
	}
}

var BUILDER_INSTALL_SCRIPTS = ["preinstall", "install", "postinstall", "prepare"];
var relocatedBuilderModules = {};
var projectRootAbove = extract("projectRootAbove");
var projectNameForRoot = extract("projectNameForRoot");
var frontendRunCommandFor = extract("frontendRunCommandFor");
var frontendBuilderInstallPrefix = extract("frontendBuilderInstallPrefix");
var frontendBuilderAcceptsLinkedModules = extract("frontendBuilderAcceptsLinkedModules");
var frontendCopyBuilderPackageFiles = extract("frontendCopyBuilderPackageFiles");
var frontendBuilderLocalInstallCommands = extract("frontendBuilderLocalInstallCommands");

var base = Files.createTempDirectory("flow-builder-local-install-").toFile().getCanonicalFile();
var outside = new File(base, "outside/pkg");
outside.mkdirs();
var project = new File(base, "checkout");
var resourceRoot = new File(project, "_flow/frontbuilder/svelte");
new File(resourceRoot, "vendor").mkdirs();
new File(resourceRoot, "src-builder").mkdirs();
FileUtils.writeStringToFile(new File(project, "c8oProject.yaml"), "↑convertigo: 8.5.0\n↓lib_builder [core.Project]: \n  comment: test\n", "UTF-8");
var builderPackage = {
	name: "lib_builder",
	type: "module",
	convertigoFlow: { linkedNodeModules: true },
	scripts: { postinstall: "node src-builder/buildProvider.mjs", prepare: "node prepare.mjs", build: "vite build" },
	dependencies: { sdk: "file:vendor/sdk.tgz", near: "file:../../../../outside/pkg", svelte: "5.0.0" },
	devDependencies: { tsx: "4.0.0" }
};
function writeBuilderPackage(accepts) {
	var manifest = JSON.parse(JSON.stringify(builderPackage));
	if (!accepts) {
		delete manifest.convertigoFlow;
	}
	FileUtils.writeStringToFile(new File(resourceRoot, "package.json"), JSON.stringify(manifest), "UTF-8");
}
writeBuilderPackage(true);
FileUtils.writeStringToFile(new File(resourceRoot, "package-lock.json"), "{\"lockfileVersion\":3}", "UTF-8");
FileUtils.writeStringToFile(new File(resourceRoot, ".npmrc"), "prefer-offline=true\n", "UTF-8");
FileUtils.writeStringToFile(new File(resourceRoot, "vendor/sdk.tgz"), "tarball", "UTF-8");
var local = new File(base, "local");
var calls = [];
var enabled = true;
var fake = {
	isEnabled: function () { return enabled; },
	relocate: function (name, dir, relativePath) {
		calls.push([String(name), String(dir.getPath()), String(relativePath)]);
		var folder = new File(dir, relativePath);
		if (enabled && !Files.isSymbolicLink(folder.toPath())) {
			var target = new File(new File(local, "projects/" + name), relativePath);
			target.mkdirs();
			Files.createSymbolicLink(folder.toPath(), target.toPath());
		}
		return folder;
	},
	getProjectDirectory: function (name) { return new File(local, "projects/" + name); }
};
var available = null;
function localWorkDirectory() {
	return available;
}

try {
	assertEqual(frontendBuilderInstallPrefix(resourceRoot), null, "without local working directory, the builder folder installs its packages");
	assertEqual(calls.length, 0, "an engine without local working directory is not asked");

	available = fake;
	enabled = false;
	var link = new File(resourceRoot, "node_modules").toPath();
	var previous = new File(base, "previous-local/projects/lib_builder/_flow/frontbuilder/svelte/node_modules");
	previous.mkdirs();
	Files.createSymbolicLink(link, previous.toPath());
	assertEqual(frontendBuilderInstallPrefix(resourceRoot, true), null, "with a local working directory not in use, nothing changes");
	assertTrue(!Files.exists(link, java.nio.file.LinkOption.NOFOLLOW_LINKS), "a link left by a previous configuration goes");
	assertTrue(previous.isDirectory(), "without its target");
	var byHand = new File(base, "by-hand");
	byHand.mkdirs();
	Files.createSymbolicLink(link, byHand.toPath());
	frontendBuilderInstallPrefix(resourceRoot, true);
	assertTrue(Files.isSymbolicLink(link), "a link made by hand stays");
	Files.delete(link);
	assertEqual(calls.length, 0, "the engine relocates nothing when its local working directory is not in use");

	enabled = true;
	writeBuilderPackage(false);
	assertEqual(frontendBuilderInstallPrefix(resourceRoot, true), null, "an older builder keeps its packages in its folder");
	assertEqual(calls.length, 0, "nothing is relocated for it");

	writeBuilderPackage(true);
	calls = [];
	var prefix = frontendBuilderInstallPrefix(resourceRoot, true);
	assertEqual(calls, [["lib_builder", String(project.getPath()), "_flow/frontbuilder/svelte/node_modules"]],
		"the engine relocates node_modules of the builder, in the project named by its c8oProject.yaml");
	assertEqual(String(prefix.getPath()), String(new File(local, "projects/lib_builder/_flow/frontbuilder/svelte").getPath()),
		"npm installs in the place of the builder folder in the local working directory");
	assertTrue(Files.isSymbolicLink(new File(resourceRoot, "node_modules").toPath()), "node_modules of the builder is a link");
	assertEqual(String(frontendBuilderInstallPrefix(resourceRoot).getPath()), String(prefix.getPath()), "the place is kept");
	assertEqual(calls.length, 1, "the place is looked up once until an installation checks it again");
	frontendBuilderInstallPrefix(resourceRoot, true);
	assertEqual(calls.length, 2, "an installation checks the place again");

	var leftOut = frontendCopyBuilderPackageFiles(resourceRoot, prefix);
	assertEqual(leftOut, ["postinstall", "prepare"], "the installation scripts of the builder package are left out, in npm order");
	var copied = JSON.parse(String(FileUtils.readFileToString(new File(prefix, "package.json"), "UTF-8")));
	assertEqual(copied.scripts, { build: "vite build" }, "other scripts are kept");
	assertEqual(copied.dependencies.svelte, "5.0.0", "dependencies are kept");
	assertEqual(copied.devDependencies, { tsx: "4.0.0" }, "development dependencies are kept");
	assertEqual(copied.dependencies.sdk, "file:vendor/sdk.tgz", "a local package of the builder folder keeps its path");
	assertEqual(String(FileUtils.readFileToString(new File(prefix, "vendor/sdk.tgz"), "UTF-8")), "tarball", "and comes along");
	assertEqual(copied.dependencies.near, "file:" + String(outside.getCanonicalPath()), "a local package elsewhere is reached by its full path");
	assertEqual(String(FileUtils.readFileToString(new File(prefix, "package-lock.json"), "UTF-8")), "{\"lockfileVersion\":3}", "the lock file is copied");
	assertTrue(new File(prefix, ".npmrc").isFile(), "the npm configuration of the builder is copied");
	assertTrue(String(FileUtils.readFileToString(new File(resourceRoot, "package.json"), "UTF-8")).indexOf("postinstall") > 0,
		"the builder folder keeps its package file");

	var commands = frontendBuilderLocalInstallCommands("npm", resourceRoot, prefix, leftOut);
	assertEqual(commands.map(function (command) { return [command.args, String(command.cwd.getPath())]; }), [
		[["npm", "--prefix", String(prefix.getAbsolutePath()), "install", "--prefer-offline", "--no-audit", "--no-fund"], String(prefix.getPath())],
		[["npm", "--prefix", String(resourceRoot.getAbsolutePath()), "run", "postinstall"], String(resourceRoot.getPath())],
		[["npm", "--prefix", String(resourceRoot.getAbsolutePath()), "run", "prepare"], String(resourceRoot.getPath())]
	], "npm installs the packages locally, then the scripts of the builder package run in its folder");

	FileUtils.deleteQuietly(new File(resourceRoot, ".npmrc"));
	frontendCopyBuilderPackageFiles(resourceRoot, prefix);
	assertTrue(!new File(prefix, ".npmrc").exists(), "a configuration removed from the builder is removed from the copy");

	relocatedBuilderModules = {};
	var notInProject = new File(base, "loose/svelte");
	notInProject.mkdirs();
	assertEqual(frontendBuilderInstallPrefix(notInProject, true), null, "a builder folder outside a project installs in place");
} finally {
	FileUtils.deleteQuietly(base);
}

print("frontend-builder-local-install OK");
