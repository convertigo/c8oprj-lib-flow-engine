// preload with flows resolves the run plan of each Flow as its first run would, without running it: the run that
// follows finds its plan prepared; a Flow that cannot be prepared is told in its entry, the others are prepared.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var engineFile = new java.io.File(engineDir, "Engine.js");
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(engineFile, "UTF-8"));
var projectRoot = java.nio.file.Files.createTempDirectory("lib-flow-engine-preload-run-plans");
var __flowEngineDir = engineDir;
var __flowProjectDir = String(projectRoot.toFile().getAbsolutePath());
// a project block counting its runs: preloading a plan must never run it
var blocksDir = projectRoot.resolve("_flow/blocks/probe");
java.nio.file.Files.createDirectories(blocksDir);
java.nio.file.Files.writeString(blocksDir.resolve("count.block.js"), [
	"const _meta = {",
	"  \"version\": 1,",
	"  \"description\": \"Counts its runs.\",",
	"  \"runtime\": \"rhino\",",
	"}",
	"",
	"(function () {",
	"\treturn {",
	"\t\trun: function (ctx, node) {",
	"\t\t\tvar runs = Number(java.lang.System.getProperty(\"preload.run.plans.runs\", \"0\")) + 1;",
	"\t\t\tjava.lang.System.setProperty(\"preload.run.plans.runs\", String(runs));",
	"\t\t\treturn { runs: runs };",
	"\t\t}",
	"\t};",
	"}())",
	""
].join("\n"));
var engine = eval(source);

function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

function runs() {
	return Number(java.lang.System.getProperty("preload.run.plans.runs", "0"));
}

var countingSource = [
	"function Counting({ input, result }) {",
	"  result.count = probe.count({})",
	"  return result",
	"}",
	""
].join("\n");
var brokenSource = "function Broken({ input, result }) {\n  result.value = (\n}\n";

// without flows: the catalog and the compiler, as before
var catalogOnly = JSON.parse(engine.preload(JSON.stringify({ project: "PreloadProject", projectDir: __flowProjectDir })));
assertTrue(catalogOnly.ok === true && catalogOnly.blockCount > 0 && catalogOnly.plans === undefined,
	"a preload without flows changed: " + JSON.stringify(catalogOnly));

var preload = JSON.parse(engine.preload(JSON.stringify({
	project: "PreloadProject",
	projectDir: __flowProjectDir,
	flows: [
		{ flowQName: "PreloadProject.Counting", flowName: "Counting", flowSource: countingSource },
		{ flowQName: "PreloadProject.Broken", flowName: "Broken", flowSource: brokenSource },
		{ flowQName: "PreloadProject.Empty", flowName: "Empty", flowSource: "" }
	]
})));
assertTrue(preload.ok === true && preload.plans && preload.plans.length === 3, "preload did not answer each Flow: " + JSON.stringify(preload));
var counting = preload.plans[0], broken = preload.plans[1], empty = preload.plans[2];
assertTrue(counting.ok === true && counting.flowQName === "PreloadProject.Counting" && counting.blockCount > 0
	&& typeof counting.durationMs === "number", "the plan of a valid Flow was not prepared: " + JSON.stringify(counting));
assertTrue(broken.ok === false && broken.flowQName === "PreloadProject.Broken" && broken.error && broken.error.message,
	"a Flow that cannot be prepared was not told: " + JSON.stringify(broken));
assertTrue(empty.ok === false && empty.error.code === "FLOW_PRELOAD_SOURCE_REQUIRED",
	"a Flow without source was not refused: " + JSON.stringify(empty));
assertTrue(preload.planCount === 1 && preload.failedPlanCount === 2, "preload counts are wrong: " + JSON.stringify(preload));
assertTrue(runs() === 0, "preloading a plan ran the Flow");

// the first run of the Flow finds the plan prepared by the preload
var run = JSON.parse(engine.run(JSON.stringify({
	flowQName: "PreloadProject.Counting",
	flowName: "Counting",
	flowSource: countingSource,
	projectDir: __flowProjectDir,
	input: {},
	includeTrace: false,
	profile: "envelope"
})));
assertTrue(run.ok === true && run.result && run.result.count && run.result.count.runs === 1, "the preloaded Flow did not run: " + JSON.stringify(run));
assertTrue(run.profile && run.profile.runPlanHeadHit === true && run.profile.compilePlanMs === 0,
	"the first run compiled the plan again: " + JSON.stringify(run.profile));

Packages.org.apache.commons.io.FileUtils.deleteDirectory(projectRoot.toFile());
print("preload-run-plans OK");
