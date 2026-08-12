var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "libs/flow").getAbsolutePath());
var engineFile = new java.io.File(engineDir, "Engine.js");
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(engineFile, "UTF-8"));
var projectDirFile = new java.io.File(java.lang.System.getProperty("java.io.tmpdir"),
	"lib-flow-engine-frontend-fullsync-live-catalog-test");
if (projectDirFile.isDirectory()) {
	Packages.org.apache.commons.io.FileUtils.deleteDirectory(projectDirFile);
}
projectDirFile.mkdirs();
var __flowEngineDir = engineDir;
var __flowProjectDir = String(projectDirFile.getAbsolutePath());
var engine = eval(source);

function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

function descriptor(contract, tag) {
	return (contract.items || []).filter(function (item) {
		return item.tag === tag;
	})[0];
}

var engineSource = [
	"version: 1",
	"config:",
	"  frontbuilder:",
	"    svelte:",
	"      target: svelte5",
	"      resourceRoot: libs/flow/frontbuilder/svelte",
	"      modelPath: libs/flow/frontbuilder/svelte/model/LiveFullSync.flow.svelte",
	""
].join("\n");
var contract = JSON.parse(engine.authoringContract(JSON.stringify({
	surface: "frontend",
	builder: "svelte",
	engineSource: engineSource,
	projectDir: __flowProjectDir
})));
var get = descriptor(contract, "FullSyncGet");
var view = descriptor(contract, "FullSyncView");
var sync = descriptor(contract, "FullSyncSync");

assertTrue(contract.ok === true && get && view && sync,
	"authoring contract did not expose the FullSync descriptors");
assertTrue(get.properties.live && view.properties.live,
	"FullSync live ids are missing from the engine authoring contract");
assertTrue(sync.properties.mode && sync.properties.mode["enum"] &&
	sync.properties.mode["enum"].indexOf("continuous") !== -1,
	"FullSync continuous mode is missing from the engine authoring contract");

print("frontend-fullsync-live-catalog OK");
