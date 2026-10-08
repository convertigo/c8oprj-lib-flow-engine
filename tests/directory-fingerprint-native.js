// The Java fingerprint of a directory (libs/src, com.convertigo.libflowengine.Fingerprints) is the same string as the
// JS walk of fingerprint-utils.js, which remains the fallback when the classes are not compiled: one file system call
// per entry instead of four calls from Rhino, each remote on a network file system.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var File = java.io.File;
var Files = java.nio.file.Files;

function assertTrue(value, message) {
	if (!value) {
		throw new Error(message);
	}
}

var fingerprintUtils = eval(String(FileUtils.readFileToString(new File(engineDir, "modules/fingerprint-utils.js"), "UTF-8")));
function canonicalPath(file) {
	try {
		return String(file.getCanonicalPath());
	} catch (e) {
		return String(file.getAbsolutePath());
	}
}
var jsEnv = { Arrays: java.util.Arrays, canonicalPath: canonicalPath };

var work = Files.createTempDirectory("flow-fingerprint-native").toFile();
try {
	// the helper compiled as a server compiles libs/src
	var classes = new File(work, "classes");
	classes.mkdirs();
	var sourceFile = new File(engineDir, "../libs/src/com/convertigo/libflowengine/Fingerprints.java");
	var compiler = javax.tools.ToolProvider.getSystemJavaCompiler();
	var compiled = compiler.run(null, null, null, ["-d", String(classes.getPath()), String(sourceFile.getCanonicalPath())]);
	assertTrue(compiled === 0, "Fingerprints.java compiles");
	var loader = new java.net.URLClassLoader([classes.toURI().toURL()], null);
	var nativeClass = loader.loadClass("com.convertigo.libflowengine.Fingerprints");
	var directory = nativeClass.getMethod("directory", java.lang.String);

	// a tree with folders, files, names collated as Rhino collates them, and a dangling link
	var tree = new File(work, "tree");
	["ui/Button.flow.svelte", "ui/button-group.flow.svelte", "ui/Écran.flow.svelte", "ui/zeta.flow.svelte",
		"components/a/b/deep.flow.svelte", "components/A.flow.svelte", "actions/run.js", "empty/"].forEach(function (path) {
		var file = new File(tree, path);
		if (path.charAt(path.length - 1) === "/") {
			file.mkdirs();
		} else {
			FileUtils.writeStringToFile(file, "content of " + path, "UTF-8");
		}
	});
	try {
		Files.createSymbolicLink(new File(tree, "ui/dangling").toPath(), new File(work, "nowhere").toPath());
	} catch (e) {
		// no symbolic links on this file system
	}

	function nativeFingerprint(dir) {
		return String(directory.invoke(null, String(dir.getPath())));
	}
	var js = fingerprintUtils.directoryFingerprint(tree, jsEnv);
	assertTrue(nativeFingerprint(tree) === js, "the Java fingerprint is the JS one:\n" + nativeFingerprint(tree) + "\n" + js);
	assertTrue(js.indexOf("Écran") > 0 && js.indexOf("d:components/a/b:") > 0 && js.indexOf("dangling") < 0,
		"the walk covers the tree: " + js);
	var missing = new File(work, "missing");
	assertTrue(nativeFingerprint(missing) === fingerprintUtils.directoryFingerprint(missing, jsEnv), "a missing directory too");

	// the walk uses the Java fingerprint when given, else walks
	var used = 0;
	var withNative = { Arrays: java.util.Arrays, canonicalPath: canonicalPath,
		nativeDirectoryFingerprint: function (dir) { used++; return nativeFingerprint(dir); } };
	assertTrue(fingerprintUtils.directoryFingerprint(tree, withNative) === js && used === 1, "the Java fingerprint is used");
	var withoutNative = { Arrays: java.util.Arrays, canonicalPath: canonicalPath,
		nativeDirectoryFingerprint: function () { return null; } };
	assertTrue(fingerprintUtils.directoryFingerprint(tree, withoutNative) === js, "else the JS walk computes it");

	// Engine.js looks the class up through the packages of the call, and remembers per generation when it is missing
	var source = String(FileUtils.readFileToString(new File(engineDir, "Engine.js"), "UTF-8"));
	function functionSource(name) {
		var start = source.indexOf("\n\tfunction " + name + "(") + 2;
		var end = source.lastIndexOf("\n\t}", source.indexOf("\n\tfunction ", start + 1)) + 3;
		return "(" + source.substring(start, end) + ")";
	}
	var nativeFingerprintsByGeneration = {};
	var nativeFingerprintsGenerations = 0;
	var rememberNativeFingerprints = eval(functionSource("rememberNativeFingerprints"));
	var lookups = 0;
	var Packages = { com: { convertigo: {} } };
	Object.defineProperty(Packages.com.convertigo, "libflowengine", { get: function () {
		lookups++;
		return __withClasses ? { Fingerprints: { directory: function (path) { return nativeFingerprint(new File(path)); } } } : {};
	} });
	var __withClasses = false;
	var __flowGenerationId = "ProjectA#1";
	var nativeDirectoryFingerprint = eval(functionSource("nativeDirectoryFingerprint"));
	assertTrue(nativeDirectoryFingerprint(tree) === null && nativeDirectoryFingerprint(tree) === null && lookups === 1,
		"without the classes: null, looked up once for the generation");
	__flowGenerationId = "ProjectA#2";
	__withClasses = true;
	assertTrue(nativeDirectoryFingerprint(tree) === js, "a generation with the classes computes in Java");
	assertTrue(nativeFingerprintsByGeneration["ProjectA#1"] === false && nativeFingerprintsByGeneration["ProjectA#2"] === true,
		"only booleans are remembered");
} finally {
	FileUtils.deleteQuietly(work);
}

print("directory-fingerprint-native: Java and JS fingerprints equal, fallback and lookup OK");
