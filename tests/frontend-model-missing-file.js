// A project with a backend and no frontend, whose config.frontbuilder.svelte was written by hand (as an agent did
// with frontend-svelte-mutate): modelPath names a page that was never created. generate, build and dev.start answered
// 'Java class "[Ljava.lang.reflect.Constructor;" has no public instance field or method named "__flowHandle"': the
// FRONTBUILDER_MODEL_REQUIRED details carried the java.io.File of modelPath. They answer that diagnostic, with the
// path as text and the call that creates the frontend.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var projectDirFile = java.nio.file.Files.createTempDirectory("lib-flow-engine-model-missing-").toFile();
var __flowEngineDir = engineDir;
var __flowProjectDir = String(projectDirFile.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(condition, message) { checks++; if (!condition) throw new Error(message); }
try {
	var engine = eval(source);
	var modelPath = "_flow/frontbuilder/svelte/model/Orders/src/routes/+page.flow.svelte";
	var engineSource = ["version: 1", "config:", "  frontbuilder:", "    svelte:",
		"      modelPath: \"" + modelPath + "\"", "      target: \"svelte5\"", "      buildOutput: \"DisplayObjects/mobile\"",
		"      privateDir: \"_private/svelte\"",
		"      resourceRoot: \"" + String(java.lang.System.getenv("FLOW_FRONTBUILDER_RESOURCE_ROOT")) + "\"", ""].join("\n");
	["generate", "build", "dev.start"].forEach(function (action) {
		var response = JSON.parse(engine.contextAction(JSON.stringify({
			project: "Orders", projectDir: __flowProjectDir, actionId: action, builder: "svelte", wait: true,
			action: { id: "frontbuilder.svelte." + action },
			targetObject: { kind: "frontendBuilder", type: "svelte", path: "frontends.svelte", summary: "svelte builder" },
			engineSource: engineSource
		})));
		var error = response.error || (response.details && response.details.error) || {};
		assert(response.ok === false && error.code === "FRONTBUILDER_MODEL_REQUIRED",
			action + " must answer the missing model, not an internal error: " + JSON.stringify(response).substring(0, 600));
		assert(String(error.message).indexOf("__flowHandle") < 0 && String(error.message).indexOf(modelPath) >= 0 &&
			String(error.message).indexOf("config.frontbuilder.svelte.modelPath") >= 0, action + " names the missing file and its property: " + error.message);
		assert(error.details && error.details.modelPath === modelPath, action + " details carry the project path as text: " + JSON.stringify(error.details));
		assert(String(error.hint).indexOf('flow-project-bootstrap({project:"Orders", ui:true})') >= 0 && String(error.hint).indexOf("keeps the backend") > 0,
			action + " hint gives the call that creates the frontend: " + error.hint);
	});
	assert(!new java.io.File(projectDirFile, modelPath).exists(), "the diagnostic creates no page");
	print("frontend-model-missing-file OK (" + checks + " checks)");
} finally {
	files.deleteQuietly(projectDirFile);
}
