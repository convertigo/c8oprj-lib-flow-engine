var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "libs/flow").getAbsolutePath());
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(
	new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var File = Packages.java.io.File;
var FileUtils = Packages.org.apache.commons.io.FileUtils;

function assertTrue(value, message) {
	if (!value) throw new Error(message);
}

function extract(name, nextName) {
	var start = source.indexOf("function " + name + "(");
	var end = source.indexOf("\n\tfunction " + nextName + "(", start);
	assertTrue(start >= 0 && end > start, name + " must remain extractable");
	return eval("(" + source.substring(start, end).trim() + ")");
}

var frontendPromoteBuildOutput = extract("frontendPromoteBuildOutput", "frontendDevStateFile");
var root = Packages.java.nio.file.Files.createTempDirectory("flow-production-publish-").toFile();
try {
	var target = new File(root, "mobile");
	var staging = new File(root, ".mobile.staging");
	var backup = new File(root, ".mobile.backup");
	target.mkdirs();
	staging.mkdirs();
	FileUtils.writeStringToFile(new File(target, "version.txt"), "old", "UTF-8");
	FileUtils.writeStringToFile(new File(staging, "version.txt"), "new", "UTF-8");
	frontendPromoteBuildOutput({ target: target, staging: staging, backup: backup });
	assertTrue(String(FileUtils.readFileToString(new File(target, "version.txt"), "UTF-8")) === "new",
		"published output must replace the old output");
	assertTrue(!backup.exists() && !staging.exists(), "temporary output directories must be removed");

	var missing = new File(root, ".mobile.missing");
	var failed = false;
	try {
		frontendPromoteBuildOutput({ target: target, staging: missing, backup: new File(root, ".mobile.failed") });
	} catch (expected) {
		failed = true;
	}
	assertTrue(failed, "missing staged output must reject publication");
	assertTrue(String(FileUtils.readFileToString(new File(target, "version.txt"), "UTF-8")) === "new",
		"failed publication must preserve the last good output");
} finally {
	FileUtils.deleteDirectory(root);
}

print("frontend-production-atomic-publish OK");
