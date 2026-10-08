// libs/build holds the classes of libs/src with the fingerprint of these sources (tools/LibsBuild.java): a server takes
// them instead of compiling the sources, once per project, and uses them even when it does not compile. A change of
// libs/src without running the tool would make every server compile again: this test tells it.
var engineDir = new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getCanonicalFile();
var project = engineDir.getParentFile();
var src = new java.io.File(project, "libs/src");
var build = new java.io.File(project, "libs/build");

function assertTrue(value, message) {
	if (!value) {
		throw new Error(message);
	}
}

// Convertigo ClasspathSnapshot.sourcesFingerprint
function sourcesFingerprint(sources) {
	var digest = java.security.MessageDigest.getInstance("SHA-256");
	function bytes(text) {
		return new java.lang.String(text).getBytes(java.nio.charset.StandardCharsets.UTF_8);
	}
	function append(file, relativePath) {
		digest.update(bytes(relativePath));
		digest.update(0);
		digest.update(file.isDirectory() ? 68 : 70);
		digest.update(0);
		if (file.isDirectory()) {
			var children = java.util.Arrays.asList(file.listFiles()).toArray();
			children.sort(function (left, right) {
				return Number(left.getName().compareTo(right.getName()));
			});
			children.forEach(function (child) {
				append(child, relativePath + "/" + child.getName());
			});
		} else {
			digest.update(bytes(String(file.length())));
			digest.update(0);
			digest.update(java.nio.file.Files.readAllBytes(file.toPath()));
		}
	}
	append(sources, "src");
	return String(java.util.HexFormat.of().formatHex(digest.digest()));
}

assertTrue(src.isDirectory(), "libs/src exists");
var written = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(build, "src.sha256"), "UTF-8")).trim();
assertTrue(written === sourcesFingerprint(src),
	"libs/build is compiled from the current libs/src: run java tools/LibsBuild.java (" + written + ")");
var missing = [];
java.nio.file.Files.walk(src.toPath()).forEach(function (path) {
	var relative = String(src.toPath().relativize(path));
	if (/\.java$/.test(relative) && !new java.io.File(build, "classes/" + relative.replace(/\.java$/, ".class")).isFile()) {
		missing.push(relative);
	}
});
assertTrue(missing.length === 0, "each source has its class: " + missing);

print("libs-build-in-sync: libs/build compiled from libs/src");
