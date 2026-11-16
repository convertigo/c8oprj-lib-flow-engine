var File = java.io.File;
var Files = java.nio.file.Files;
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var source = String(FileUtils.readFileToString(new File(arguments[0], "Engine.js"), "UTF-8"));
var root = Files.createTempDirectory("flow-generation-output-").toFile();
var hostEnabled = true;
function localWorkDirectory() {
	return {isEnabled:function () { return hostEnabled; },
		getProjectDirectory:function () { return new File(root, "local/projects/App"); }};
}
var start = source.indexOf("\n\tfunction frontendGenerationOutputEnv(");
var end = source.indexOf("\n\tfunction frontendProductionLifecycle(", start);
if (start < 0 || end < 0) throw new Error("Generation output configuration is missing");
var frontendGenerationOutputEnv = eval("(" + source.substring(start + 2, end).trim() + ")");
var logStart = source.indexOf("\n\tfunction frontendWriteStepOutputLog(");
var logEnd = source.lastIndexOf("\n\t}", source.indexOf("\n\tfunction frontendFailedStepOutput(", logStart)) + 3;
var frontendWriteStepOutputLog = eval("(" + source.substring(logStart + 2, logEnd).trim() + ")");
function assert(value, message) { if (!value) throw new Error(message); }
try {
	var project = new File(root, "workspace/projects/App");
	var local = new File(root, "local/projects/App/_private/svelte");
	var output = new File(project, "DisplayObjects/mobile");
	local.mkdirs();
	output.mkdirs();
	var privateDir = new File(project, "_private");
	privateDir.mkdirs();
	Files.createSymbolicLink(new File(privateDir, "svelte").toPath(), local.toPath());
	var staging = new File(output.getParentFile(), ".mobile.flow-build-1");
	var env = frontendGenerationOutputEnv(project, "App", new File(project, "_private/svelte").getCanonicalFile(),
		"_private/svelte", "DisplayObjects/mobile");
	assert(env.FRONTBUILDER_SOURCE_ROOT === "_private/svelte", "The approved source stays project-relative");
	assert(env.FRONTBUILDER_REAL_SOURCE_ROOT === String(local.getCanonicalPath()), "The host names the exact real source root");
	assert(env.FRONTBUILDER_BUILD_OUTPUT === "DisplayObjects/mobile", "Generation approves the declared production root");
	assert(env.FRONTBUILDER_BUILD_OUTPUT !== String(staging), "The temporary build destination is not a model output root");
	assert(frontendWriteStepOutputLog(project, {action:"generate",exitCode:1,stdout:"example"})
		=== "_private/logs/frontbuilder-generate.log", "Step logs keep their project-relative path");
	assert(new File(project, "_private/logs/frontbuilder-generate.log").isFile(),
		"Step logs stay under the project's private log directory");
	assert(source.indexOf('envValues.FLOW_SVELTE_BUILD_OUTPUT = String(atomicOutput.staging.getAbsolutePath())') >= 0,
		"The build command still receives the staging destination");
	hostEnabled = false;
	var rejected = false;
	try { frontendGenerationOutputEnv(project, "App", local, "_private/svelte", "DisplayObjects/mobile"); }
	catch (error) { rejected = String(error).indexOf("FLOW_OUTPUT_PATH") >= 0; }
	assert(rejected, "A link without a host working directory is refused");
	var plain = frontendGenerationOutputEnv(project, "App", new File(project, "_private/svelte").getAbsoluteFile(),
		"_private/svelte", "DisplayObjects/mobile");
	assert(plain.FRONTBUILDER_REAL_SOURCE_ROOT === "", "No relocation is declared for a normal output path");
	print("frontend-generation-output-env OK");
} finally {
	FileUtils.deleteDirectory(root);
}
