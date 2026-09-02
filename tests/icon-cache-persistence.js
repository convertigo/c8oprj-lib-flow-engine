var engineDir = new java.io.File(arguments.length > 0 ? arguments[0] : "libs/flow").getAbsoluteFile();
var serviceFile = new java.io.File(engineDir, "modules/icon-service.js");
var service = eval(String(Packages.org.apache.commons.io.FileUtils.readFileToString(serviceFile, "UTF-8")));
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var root = Packages.java.nio.file.Files.createTempDirectory("flow-icon-cache-").toFile();

function assertTrue(value, message) {
	if (!value) throw new Error(message);
}

try {
	var flowDir = new java.io.File(root, "project/libs/flow");
	var blockFile = new java.io.File(flowDir, "virtual-icons.js");
	blockFile.getParentFile().mkdirs();
	FileUtils.writeStringToFile(blockFile, "", "UTF-8");
	var sharedRoot = new java.io.File(root, "workspace/cache/flow-icons-v1");
	var sharedBase = new java.io.File(sharedRoot, "iconify/mdi/test-icon");
	sharedBase.getParentFile().mkdirs();
	FileUtils.writeStringToFile(new java.io.File(sharedBase.getAbsolutePath() + ".svg"), "<svg/>", "UTF-8");
	FileUtils.writeStringToFile(new java.io.File(sharedBase.getAbsolutePath() + "_16x16.png"), "1", "UTF-8");
	FileUtils.writeStringToFile(new java.io.File(sharedBase.getAbsolutePath() + "_32x32.png"), "2", "UTF-8");

	var descriptor = { icon: "mdi:test-icon" };
	service.resolveBlockIcon({ __flowFile: blockFile.getAbsolutePath() }, descriptor, {
		File: java.io.File,
		FileUtils: FileUtils,
		sharedIconCacheRoot: sharedRoot,
		canonicalPath: function (file) { return String(file.getCanonicalPath()); },
		sha256Hex: function () { return "hash"; }
	});

	assertTrue(descriptor.iconify === "mdi:test-icon", "iconify id must be preserved");
	assertTrue(String(descriptor.iconFile).indexOf(String(flowDir.getAbsolutePath())) === 0,
		"published icon paths must remain project-local for compatibility");
	assertTrue(new java.io.File(flowDir, "icons/iconify/mdi/test-icon.svg").isFile(),
		"the project cache must be restored from the shared workspace cache");
	assertTrue(new java.io.File(flowDir, "icons/iconify/mdi/test-icon_16x16.png").isFile(),
		"the restored cache must include the Studio bitmap variant");

	var generatedBlockFile = new java.io.File(root, "second-project/libs/flow/virtual-icons.js");
	generatedBlockFile.getParentFile().mkdirs();
	FileUtils.writeStringToFile(generatedBlockFile, "", "UTF-8");
	var generatedDescriptor = { icon: "mdi:generated-icon" };
	var generatedFlowDir = generatedBlockFile.getParentFile();
	var generatedBase = new java.io.File(generatedFlowDir, "icons/iconify/mdi/generated-icon");
	generatedBase.getParentFile().mkdirs();
	FileUtils.writeStringToFile(new java.io.File(generatedBase.getAbsolutePath() + ".svg"), "<svg/>", "UTF-8");
	service.resolveBlockIcon({ __flowFile: generatedBlockFile.getAbsolutePath() }, generatedDescriptor, {
		File: java.io.File,
		FileUtils: FileUtils,
		sharedIconCacheRoot: sharedRoot,
		canonicalPath: function (file) { return String(file.getCanonicalPath()); },
		sha256Hex: function () { return "hash"; }
	});
	assertTrue(new java.io.File(sharedRoot, "iconify/mdi/generated-icon.svg").isFile(),
		"newly generated project icons must be persisted in the shared workspace cache");
	print("icon-cache-persistence OK");
} finally {
	FileUtils.deleteDirectory(root);
}
