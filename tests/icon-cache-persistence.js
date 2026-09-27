// Icon service contract, without the engine: a project carries the original SVG of
// the icons its saved sources use; the workspace cache holds downloaded originals
// and the Studio renderings (tinted SVG, bitmaps), never written into a project.
var engineDir = new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsoluteFile();
var serviceFile = new java.io.File(engineDir, "modules/icon-service.js");
var service = eval(String(Packages.org.apache.commons.io.FileUtils.readFileToString(serviceFile, "UTF-8")));
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var root = Packages.java.nio.file.Files.createTempDirectory("flow-icon-cache-").toFile();

function assertTrue(value, message) {
	if (!value) throw new Error(message);
}

function env(projectRoot, sharedRoot) {
	return {
		File: java.io.File,
		FileUtils: FileUtils,
		Arrays: java.util.Arrays,
		Base64: java.util.Base64,
		sharedIconCacheRoot: sharedRoot,
		sourcePaths: { root: "_flow", path: function (relative) { return "_flow/" + relative; } },
		engineDir: function () { return new java.io.File(root, "lib_flow_engine/_flow"); },
		projectDir: function () { return projectRoot; },
		canonicalPath: function (file) { return String(file.getCanonicalPath()); },
		sha256Hex: function () { return "hash"; }
	};
}

try {
	var sharedRoot = new java.io.File(root, "workspace/cache/flow-icons-v2");
	FileUtils.writeStringToFile(new java.io.File(sharedRoot, "iconify/mdi/test-icon.svg"),
		'<svg><path fill="currentColor"/></svg>', "UTF-8");
	var project = new java.io.File(root, "project");
	var blockFile = new java.io.File(project, "_flow/blocks/demo/test.block.js");
	FileUtils.writeStringToFile(blockFile, "", "UTF-8");

	var descriptor = { icon: "mdi:test-icon" };
	service.resolveBlockIcon({ __flowFile: blockFile.getAbsolutePath() }, descriptor, env(project, sharedRoot));
	assertTrue(descriptor.iconify === "mdi:test-icon", "iconify id must be preserved");
	assertTrue(String(descriptor.iconSvg).indexOf(String(new java.io.File(sharedRoot, "studio").getCanonicalPath())) === 0,
		"the Studio rendering is published from the workspace cache: " + descriptor.iconSvg);
	assertTrue(String(FileUtils.readFileToString(new java.io.File(descriptor.iconSvg), "UTF-8")).indexOf("#14a7cf") >= 0,
		"the Studio rendering is tinted");
	var carried = new java.io.File(project, "_flow/icons/iconify/mdi/test-icon.svg");
	assertTrue(carried.isFile() && String(FileUtils.readFileToString(carried, "UTF-8")).indexOf("currentColor") >= 0,
		"a saved source of the project carries the original SVG of its icon");
	assertTrue(!new java.io.File(project, "_flow/icons/iconify/mdi/test-icon_16x16.png").exists(),
		"no Studio bitmap is written into a project");

	var draft = new java.io.File(project, "_flow/blocks/demo/draft.block.js");
	service.resolveBlockIcon({ __flowFile: draft.getAbsolutePath() }, { icon: "mdi:draft-icon" }, env(project, sharedRoot));
	assertTrue(!new java.io.File(project, "_flow/icons/iconify/mdi/draft-icon.svg").exists(),
		"a working copy (not saved) does not write into its project");

	var other = new java.io.File(root, "other");
	var otherBlock = new java.io.File(other, "_flow/blocks/other.block.js");
	FileUtils.writeStringToFile(otherBlock, "", "UTF-8");
	FileUtils.writeStringToFile(new java.io.File(other, "_flow/icons/iconify/mdi/carried-icon.svg"),
		'<svg><path fill="currentColor"/></svg>', "UTF-8");
	var carriedDescriptor = { icon: "mdi:carried-icon" };
	service.resolveBlockIcon({ __flowFile: otherBlock.getAbsolutePath() }, carriedDescriptor, env(project, sharedRoot));
	assertTrue(new java.io.File(sharedRoot, "iconify/mdi/carried-icon.svg").isFile(),
		"an icon carried by a project is persisted in the workspace cache");
	assertTrue(!new java.io.File(project, "_flow/icons/iconify/mdi/carried-icon.svg").exists(),
		"a source of another project never writes into the current project");
	// A server without Batik nor raster command publishes the tinted SVG, without
	// retrying the rasterization on every resolution.
	var bare = new java.io.File(root, "bare-cache/flow-icons-v2");
	FileUtils.writeStringToFile(new java.io.File(bare, "iconify/mdi/test-icon.svg"), '<svg><path fill="currentColor"/></svg>', "UTF-8");
	FileUtils.writeStringToFile(new java.io.File(bare, "studio/.raster-unavailable"), "now", "UTF-8");
	var bareService = eval(String(Packages.org.apache.commons.io.FileUtils.readFileToString(serviceFile, "UTF-8")));
	var bareDescriptor = { icon: "mdi:test-icon" };
	bareService.resolveBlockIcon({ __flowFile: blockFile.getAbsolutePath() }, bareDescriptor, env(project, bare));
	assertTrue(/\.svg$/.test(String(bareDescriptor.iconFile)) && !new java.io.File(bare, "studio/iconify/mdi/test-icon_16x16.png").exists(),
		"without a rasterizer the tinted SVG is the Studio rendering: " + bareDescriptor.iconFile);
	var again = { icon: "mdi:test-icon" };
	bareService.resolveBlockIcon({ __flowFile: blockFile.getAbsolutePath() }, again, env(project, bare));
	assertTrue(again.iconFile === bareDescriptor.iconFile, "the SVG rendering is then served from the cache");
	print("icon-cache-persistence OK");
} finally {
	FileUtils.deleteDirectory(root);
}
