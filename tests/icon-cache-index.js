var engineDir = new java.io.File(arguments.length > 0 ? arguments[0] : "libs/flow").getAbsoluteFile();
var serviceFile = new java.io.File(engineDir, "modules/icon-service.js");
var iconService = eval(String(Packages.org.apache.commons.io.FileUtils.readFileToString(serviceFile, "UTF-8")));

function assertTrue(value, message) {
	if (!value) throw new Error(message);
}

var env = {
	File: java.io.File,
	Arrays: java.util.Arrays,
	FileUtils: Packages.org.apache.commons.io.FileUtils,
	Base64: java.util.Base64,
	canonicalPath: function (file) { return String(file.getCanonicalPath()); },
	engineDir: function () { return engineDir; },
	projectDir: function () { return null; },
	sha256Hex: function (value) { return String(value); }
};
var block = { __flowFile: String(new java.io.File(engineDir, "virtual-icons.js").getAbsolutePath()) };
var first = iconService.resolveBlockIcon(block, { icon: "mdi:routes" }, env);
var second = iconService.resolveBlockIcon(block, { icon: "mdi:routes" }, env);

assertTrue(first.iconify === "mdi:routes", "Iconify identifier was not preserved");
assertTrue(String(first.iconFile16 || "").endsWith("/icons/iconify/mdi/routes_16x16.png"),
	"Indexed 16px icon path was not exposed");
assertTrue(String(first.iconFile32 || "").endsWith("/icons/iconify/mdi/routes_32x32.png"),
	"Indexed 32px icon path was not exposed");
assertTrue(first.iconFile16 === second.iconFile16 && first.iconFile32 === second.iconFile32,
	"Repeated indexed icon resolution changed the public descriptor");

print("icon-cache-index OK");
