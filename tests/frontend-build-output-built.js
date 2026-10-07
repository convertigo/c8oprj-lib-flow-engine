// The builders tell whether their production output holds a build: the _app folder of SvelteKit, which the page of an
// unbuilt application delivered with a project has not. A server builds the applications delivered without it.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var File = java.io.File;
var FileUtils = Packages.org.apache.commons.io.FileUtils;

function extract(name) {
	var start = source.indexOf("\n\tfunction " + name + "(") + 2;
	if (start < 2) {
		throw new Error("missing function " + name);
	}
	var end = source.lastIndexOf("\n\t}", source.indexOf("\n\tfunction ", start + 1)) + 3;
	return eval("(" + source.substring(start, end) + ")");
}

function assertEqual(actual, expected, message) {
	if (actual !== expected) {
		throw new Error(message + ": " + actual + " instead of " + expected);
	}
}

var fileForProjectPath = extract("fileForProjectPath");
var frontendBuildOutputBuilt = extract("frontendBuildOutputBuilt");
var project = java.nio.file.Files.createTempDirectory("flow-build-output-built-").toFile().getCanonicalFile();
try {
	assertEqual(frontendBuildOutputBuilt(null, ""), false, "no project, no build");
	assertEqual(frontendBuildOutputBuilt(project, ""), false, "no output");
	var mobile = new File(project, "DisplayObjects/mobile");
	mobile.mkdirs();
	FileUtils.writeStringToFile(new File(mobile, "index.html"), "This is an unbuilt application", "UTF-8");
	assertEqual(frontendBuildOutputBuilt(project, ""), false, "the page of an unbuilt application is not a build");
	new File(mobile, "_app/immutable").mkdirs();
	assertEqual(frontendBuildOutputBuilt(project, ""), true, "a SvelteKit build in the default output");
	assertEqual(frontendBuildOutputBuilt(project, "/DisplayObjects/mobile"), true, "a leading slash is ignored");
	assertEqual(frontendBuildOutputBuilt(project, "DisplayObjects/web"), false, "another output");
	print("frontend-build-output-built OK");
} finally {
	FileUtils.deleteQuietly(project);
}
