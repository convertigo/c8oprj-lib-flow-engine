var engineDir = String(new java.io.File(arguments[0]).getAbsolutePath());
var File = Packages.java.io.File;
var FileUtils = Packages.org.apache.commons.io.FileUtils;

function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

function write(file, value) {
	var parent = file.getParentFile();
	if (parent && !parent.isDirectory()) {
		parent.mkdirs();
	}
	FileUtils.writeStringToFile(file, String(value), "UTF-8");
}

function componentSource(label) {
	return [
		"<script module>",
		"  export const _meta = {",
		"    version: 1,",
		"    id: \"fixture.card\",",
		"    name: \"Card\",",
		"    label: \"" + label + "\",",
		"    category: \"Fixture\",",
		"    kind: \"widget\",",
		"    tag: \"Card\",",
		"    runtime: \"flow-svelte\",",
		"    description: \"Fixture card.\",",
		"    traits: [\"ui.block\"],",
		"    targetKinds: [\"frontendStructure\"],",
		"    acceptedPositions: [\"inside\"],",
		"    props: { text: { label: \"Text\", kind: \"binding\", type: \"string\", default: \"\", description: \"Visible text.\" } },",
		"    insert: { kind: \"card\", tag: \"Card\", text: \"\" },",
		"    implementation: { kind: \"flow-svelte\", file: \"./Card.flow.svelte\" }",
		"  };",
		"</script>",
		"<div>{text}</div>",
		""
	].join("\n");
}

function frontendBlock(result, id) {
	var blocks = result && result.frontendBlocks || [];
	for (var i = 0; i < blocks.length; i++) {
		if (String(blocks[i].id || "") === id) {
			return blocks[i];
		}
	}
	return null;
}

var root = new File(Packages.java.lang.System.getProperty("java.io.tmpdir"),
	"flow-catalog-static-engine-test-" + new Date().getTime());
var projectDirFile = new File(root, "project");
var providerRoot = new File(root, "provider");
var componentFile = new File(providerRoot, "components/Card.flow.svelte");
var cacheDir = new File(root, "workspace/cache/flow/catalog-meta-v1");
projectDirFile.mkdirs();
cacheDir.mkdirs();
write(componentFile, componentSource("Fixture card"));

var __flowEngineDir = engineDir;
var __flowProjectDir = String(projectDirFile.getAbsolutePath());
var engineSource = String(FileUtils.readFileToString(new File(engineDir, "Engine.js"), "UTF-8"));
var configSource = [
	"version: 1",
	"config:",
	"  frontbuilder:",
	"    svelte:",
	"      target: svelte5",
	"      resourceRoot: \"" + String(providerRoot.getAbsolutePath()).replace(/\\/g, "\\\\") + "\"",
	""
].join("\n");

function request(extra) {
	var value = Object.assign({ detail: "compact", engineSource: configSource }, extra || {});
	return JSON.stringify(value);
}

function result(engine, extra) {
	return JSON.parse(String(engine.catalog(request(extra))));
}

function cacheInfo(engine) {
	return JSON.parse(String(engine.cacheInfo())).caches.catalogSnapshots;
}

try {
	var __flowCatalogSnapshotDir;
	var freshEngine = eval(engineSource);
	var fresh = result(freshEngine);
	assertTrue(frontendBlock(fresh, "fixture.card") !== null, "fresh catalog did not discover the fixture component");
	assertTrue(cacheInfo(freshEngine).path === "", "standalone Engine invented a workspace cache path");

	__flowCatalogSnapshotDir = String(cacheDir.getAbsolutePath());
	var rebuildingEngine = eval(engineSource);
	var rebuilt = result(rebuildingEngine);
	assertTrue(JSON.stringify(rebuilt) === JSON.stringify(fresh), "fresh extraction and snapshot rebuild differ");
	assertTrue(Number(cacheInfo(rebuildingEngine).rebuilds || 0) > 0, "snapshot rebuild was not observable");

	var restoredEngine = eval(engineSource);
	var restored = result(restoredEngine);
	assertTrue(JSON.stringify(restored) === JSON.stringify(fresh), "restored snapshot differs from fresh extraction");
	var restoredInfo = cacheInfo(restoredEngine);
	assertTrue(Number(restoredInfo.hits || 0) > 0, "second Engine did not restore a workspace snapshot");
	assertTrue(Number(restoredInfo.hashedFiles || 0) === 0, "snapshot hit reread unchanged source contents");

	var draftSource = componentSource("Draft card");
	var drafts = {};
	drafts[String(componentFile.getCanonicalPath())] = draftSource;
	var draft = result(restoredEngine, { sourceDrafts: drafts });
	assertTrue(frontendBlock(draft, "fixture.card").label === "Draft card", "fresh draft overlay was not applied");
	var afterDraftEngine = eval(engineSource);
	var afterDraft = result(afterDraftEngine);
	assertTrue(frontendBlock(afterDraft, "fixture.card").label === "Fixture card",
		"draft content polluted the static workspace snapshot");

	write(componentFile, componentSource("External card update"));
	componentFile.setLastModified(componentFile.lastModified() + 2000);
	var changedEngine = eval(engineSource);
	var changed = result(changedEngine);
	assertTrue(frontendBlock(changed, "fixture.card").label === "External card update",
		"external source change kept stale frontend metadata");
	var changedInfo = cacheInfo(changedEngine);
	assertTrue(Number(changedInfo.stale || 0) > 0 && Number(changedInfo.rebuilds || 0) > 0,
		"external invalidation was not observable: " + JSON.stringify(changedInfo));

	print("catalog-static-engine OK " + JSON.stringify({
		rebuilt: cacheInfo(rebuildingEngine),
		restored: restoredInfo,
		changed: changedInfo
	}));
} finally {
	FileUtils.deleteDirectory(root);
}
