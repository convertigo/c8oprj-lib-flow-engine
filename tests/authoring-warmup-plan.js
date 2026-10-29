// The warm-up plans the engine asks a project for (Convertigo 8.5 FlowAuthoringWarmup): their items are the requests
// the Studio sends, with the options it sends them with; nothing of the frontends of a project without frontend builder.
var engineDir = new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsoluteFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-authoring-warmup-plan-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var FileUtils = Packages.org.apache.commons.io.FileUtils;
FileUtils.writeStringToFile(new java.io.File(project, "_flow/flows/Hello.flow.js"),
	"const _flow = { sourceVersion: 2 }\nfunction Hello({ input, result }) {\n  result.ok = true\n}\n", "UTF-8");
FileUtils.writeStringToFile(new java.io.File(project, "_flow/engine.yaml"), "version: 1\n", "UTF-8");
var engine = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));

function assertTrue(value, message) {
	if (!value) throw new Error(message);
}

function assertSame(actual, expected, message) {
	var a = JSON.stringify(actual), e = JSON.stringify(expected);
	if (a !== e) throw new Error(message + ": " + a + " instead of " + e);
}

function plan(stage, engineSource, extra) {
	var answer = JSON.parse(engine.authoringWarmupPlan(JSON.stringify(Object.assign({
		target: "engine", projectDir: __flowProjectDir, engineSource: engineSource, stage: stage
	}, extra || {}))));
	assertTrue(answer.ok === true, "A plan is answered: " + JSON.stringify(answer));
	assertSame(answer.format, "flow.authoring.warmup.v1", "Format of the plan");
	return answer;
}

try {
	// stage studio: the tree as FlowEngineBridge.describeTree(FlowEngine) asks it, nothing computed
	var studio = plan("studio", "version: 1\n", { studioMode: false });
	assertSame(studio.items, [{ id: "tree", method: "describeTree", priority: 100, request: {
		includeFlowCatalog: true, flowCatalogOrigin: "project", includeCatalogLibraries: false, includeBindings: false,
		prewarmFrontendDocumentServer: false } }], "The stage studio of a backend project");
	assertTrue(studio.cacheable === false, "A plan computing nothing is not worth a cache entry");
	assertTrue(plan("studio", "version: 1\n", { studioMode: true }).items[0].request.prewarmFrontendDocumentServer === true,
		"In the Studio, the tree prewarms the document server as the Studio asks it");

	// stage project: the palette of each Flow, as FlowStudioSupport asks it for the root of a Flow
	var projectStage = plan("project", "version: 1\n");
	assertSame(projectStage.items, [{ id: "palette:flow:Hello", method: "authoringPalette", flow: "Hello", priority: 80,
		request: { surface: "virtual", focusPath: "", position: "inside", detail: "compact", applyFallback: false } }],
		"The stage project of a backend project");

	// a frontend builder: after the trees of every project, its stage project, which prepares its frontend runtime
	var frontendSource = "version: 1\nconfig:\n  frontbuilder:\n    svelte:\n      target: svelte5\n";
	var frontend = plan("studio", frontendSource);
	assertSame(frontend.items[1], { id: "frontend.runtime", method: "authoringWarmupPlan", priority: 10, after: ["tree"],
		request: { stage: "project", studioMode: false } }, "The frontend runtime of a project with a frontend builder");

	assertSame(plan("unknown", "version: 1\n").items, [], "An unknown stage plans nothing");
	print("authoring warm-up plans: ok");
} finally {
	FileUtils.deleteQuietly(project);
}
