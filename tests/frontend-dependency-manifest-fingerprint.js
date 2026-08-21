var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "libs/flow").getAbsolutePath());
var engineFile = new java.io.File(engineDir, "Engine.js");
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(engineFile, "UTF-8"));

function assertTrue(value, message) {
	if (!value) {
		throw new Error(message);
	}
}

function extract(name, nextName) {
	var start = source.indexOf("function " + name + "(");
	var end = source.indexOf("\n\tfunction " + nextName + "(", start);
	assertTrue(start >= 0 && end > start, name + " must remain extractable");
	return eval("(" + source.substring(start, end).trim() + ")");
}

var packageSource = "";
var File = function () {};
File.prototype.isFile = function () { return packageSource !== ""; };
var FileUtils = {
	readFileToString: function () { return packageSource; }
};
function sha256Hex(value) {
	return String(value);
}

var frontendDependencyManifestFingerprint = extract(
	"frontendDependencyManifestFingerprint",
	"frontendDevRestartRequired"
);
var frontendDevRestartRequired = extract(
	"frontendDevRestartRequired",
	"frontendDependencyInstallStamp"
);

packageSource = JSON.stringify({
	name: "first-name",
	scripts: { dev: "vite", build: "vite build" },
	dependencies: { svelte: "5.1.0", apexcharts: "4.0.0" },
	devDependencies: { vite: "6.0.0" }
});
var first = frontendDependencyManifestFingerprint({}, "/usr/bin/npm");

packageSource = '{\n  "version": "99.0.0",\n  "dependencies": {"apexcharts":"4.0.0","svelte":"5.1.0"},\n'
	+ '  "name": "renamed",\n  "devDependencies": {"vite":"6.0.0"},\n'
	+ '  "scripts": {"build":"vite build --emptyOutDir","dev":"vite"}\n}';
var regenerated = frontendDependencyManifestFingerprint({}, "/usr/bin/npm");
assertTrue(first === regenerated,
	"formatting, key order and unrelated package metadata must not restart Vite");

packageSource = JSON.stringify({
	scripts: { dev: "vite" },
	dependencies: { svelte: "5.1.0", apexcharts: "5.0.0" },
	devDependencies: { vite: "6.0.0" }
});
var upgraded = frontendDependencyManifestFingerprint({}, "/usr/bin/npm");
assertTrue(first !== upgraded, "dependency version changes must restart Vite");
assertTrue(!frontendDevRestartRequired(true, first, regenerated),
	"a non-semantic npm refresh must not restart Vite");
assertTrue(frontendDevRestartRequired(true, first, upgraded),
	"an installed dependency change must restart Vite");
assertTrue(!frontendDevRestartRequired(false, first, upgraded),
	"a skipped or failed install must not restart Vite");
assertTrue(frontendDevRestartRequired(true, "", upgraded),
	"an unknown previous manifest must use the safe restart fallback");

print("frontend-dependency-manifest-fingerprint OK");
