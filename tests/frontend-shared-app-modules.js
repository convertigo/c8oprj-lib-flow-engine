// Generated applications with the same dependencies share the packages npm installed for the first one: the next ones
// receive a copy from the store. Applications whose dependencies differ (package.json, lockfile, local tarballs,
// toolchain) never share; an entry is never replaced, concurrent writers leave one complete entry, and the store
// keeps the entries used last.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var File = java.io.File;
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var Files = java.nio.file.Files;
var JavaSystem = java.lang.System;
var JavaObject = java.lang.Object;
var JavaString = java.lang.String;
var MessageDigest = java.security.MessageDigest;

function extract(name) {
	var start = source.indexOf("function " + name + "(");
	if (start < 0) {
		throw new Error("missing function " + name);
	}
	// up to its closing brace: comments and variables of the next function follow
	var end = source.lastIndexOf("\n\t}", source.indexOf("\n\tfunction ", start + 1)) + 3;
	return eval("(" + source.substring(start, end) + ")");
}

function assertEqual(actual, expected, message) {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(message + ": " + JSON.stringify(actual) + " instead of " + JSON.stringify(expected));
	}
}

function assertTrue(value, message) {
	if (!value) {
		throw new Error(message);
	}
}

// the settings of the store, as the engine defines them
eval((source.match(/\n\tvar FRONTEND_(SHARED_APP_MODULES|APP_INSTALL_SCRIPTS)[^\n]*/g) || []).join("\n"));
assertTrue(typeof FRONTEND_SHARED_APP_MODULES === "string" && FRONTEND_SHARED_APP_MODULES_KEPT > 0,
	"the settings of the store are defined");

function engineClass(name) {
	return Packages[name];
}
function frontendStudioLog() {}
function frontendRunProcess(args) {
	var command = new java.util.ArrayList();
	args.forEach(function (arg) { command.add(String(arg)); });
	var pb = new java.lang.ProcessBuilder(command);
	pb.redirectErrorStream(true);
	var process = pb.start();
	var output = String(Packages.org.apache.commons.io.IOUtils.toString(process.getInputStream(), "UTF-8"));
	return { output: output, exitCode: process.waitFor() };
}
var available = null;
function localWorkDirectory() {
	return available;
}
var frontendCloneFileHandle = null;
var ConcurrentHashMap = java.util.concurrent.ConcurrentHashMap;
var frontendToolVersions = new ConcurrentHashMap();
var safeIconName = function (text) { return String(text); };
var javaStringList = extract("javaStringList");
var sha256Hex = extract("sha256Hex");
var sha256FileHex = extract("sha256FileHex");
var projectRootAbove = extract("projectRootAbove");
var frontendSharedAppModulesStore = extract("frontendSharedAppModulesStore");
var frontendToolIdentity = extract("frontendToolIdentity");
var frontendSharedAppModulesKey = extract("frontendSharedAppModulesKey");
var frontendSharedAppModules = extract("frontendSharedAppModules");
var frontendCloneFileCall = extract("frontendCloneFileCall");
var frontendCopyFolder = extract("frontendCopyFolder");
var frontendRestoreSharedAppModules = extract("frontendRestoreSharedAppModules");
var frontendKeepSharedAppModules = extract("frontendKeepSharedAppModules");
var frontendCleanSharedAppModules = extract("frontendCleanSharedAppModules");

function write(file, text) {
	file.getParentFile().mkdirs();
	FileUtils.writeStringToFile(file, text, "UTF-8");
}
function read(file) {
	return String(FileUtils.readFileToString(file, "UTF-8"));
}
function names(folder) {
	var list = folder.list();
	var out = [];
	for (var i = 0; list && i < list.length; i++) {
		out.push(String(list[i]));
	}
	return out.sort();
}

var base = Files.createTempDirectory("flow-shared-app-modules-").toFile().getCanonicalFile();
var builder = new File(base, "projects/lib_builder");
var resourceRoot = new File(builder, "_flow/frontbuilder/svelte");
write(new File(builder, "c8oProject.yaml"), "↑convertigo: 8.5.0\n↓lib_builder [core.Project]: \n");
write(new File(resourceRoot, "package.json"), "{}");
write(new File(base, "projects/vendor/sdk.tgz"), "tarball 1");
// a Node.js distribution: bin/npm links to the npm package, node tells its version
var toolchain = new File(base, "node/bin");
write(new File(base, "node/lib/node_modules/npm/package.json"), "{\"name\":\"npm\",\"version\":\"11.0.0\"}");
write(new File(base, "node/lib/node_modules/npm/bin/npm-cli.js"), "// npm");
toolchain.mkdirs();
Files.createSymbolicLink(new File(toolchain, "npm").toPath(), java.nio.file.Paths.get("../lib/node_modules/npm/bin/npm-cli.js"));
function nodeVersion(version) {
	write(new File(toolchain, "node"), "#!/bin/sh\necho " + version + "\n");
	new File(toolchain, "node").setExecutable(true);
}
nodeVersion("v24.0.0");
var npm = String(new File(toolchain, "npm").getPath());

var manifest = {
	name: "svelte-frontend",
	private: true,
	type: "module",
	scripts: { check: "svelte-kit sync", build: "vite build" },
	dependencies: { sdk: "file:../../../vendor/sdk.tgz", rxjs: "~6.3.3" },
	devDependencies: { svelte: "5.57.2", vite: "8.3.4" }
};
// an application of a project, with its package.json and an optional lockfile
function application(name, change, lockfile) {
	var root = new File(base, "projects/" + name + "/_private/svelte");
	var value = JSON.parse(JSON.stringify(manifest));
	if (change) {
		change(value);
	}
	write(new File(root, "package.json"), JSON.stringify(value, null, 2));
	if (lockfile) {
		write(new File(root, "package-lock.json"), lockfile);
	}
	return root;
}
// what npm would have installed: a package, a bin link, and folders written later by the tools of the application
function install(root, owner) {
	var modules = new File(root, "node_modules");
	write(new File(modules, "pkg/index.js"), "module.exports = '" + owner + "';");
	write(new File(modules, "owner.txt"), owner);
	write(new File(modules, ".package-lock.json"), "{\"hidden\":\"" + owner + "\"}");
	new File(modules, ".bin").mkdirs();
	Files.createSymbolicLink(new File(modules, ".bin/pkg").toPath(), java.nio.file.Paths.get("../pkg/index.js"));
	write(new File(modules, "$app/tsconfig.json"), "{}");
	write(new File(modules, ".vite/deps/_metadata.json"), "{}");
	if (!new File(root, "package-lock.json").isFile()) {
		write(new File(root, "package-lock.json"), "{\"lockfileVersion\":3,\"owner\":\"" + owner + "\"}");
	}
}

try {
	// the store: in the private folder of the builder project, or in the local working directory
	var store = frontendSharedAppModulesStore(resourceRoot);
	assertEqual(String(store.getPath()), String(new File(builder, "_private/svelte-app-modules").getPath()),
		"without local working directory, the store is in the private folder of the builder project");
	var localStore = new File(base, "local/svelte-app-modules");
	available = {
		isEnabled: function () { return true; },
		getDirectory: function (name) { var folder = new File(base, "local/" + name); folder.mkdirs(); return folder; },
		beginWork: function (folder) { return folder; },
		endWork: function () {}
	};
	assertEqual(String(frontendSharedAppModulesStore(resourceRoot).getPath()), String(localStore.getPath()),
		"with a local working directory, the store is there");
	available = null;

	// the key: same dependencies, same key; anything npm installs from that differs, another key
	var first = application("First");
	var second = application("Second");
	var firstKey = frontendSharedAppModulesKey(first, npm);
	assertTrue(/^[0-9a-f]{64}$/.test(firstKey), "an application with registry and tarball dependencies is shared");
	assertEqual(frontendSharedAppModulesKey(second, npm), firstKey, "the same dependencies give the same key");
	var locked = application("Locked", null, "{\"lockfileVersion\":3,\"packages\":{\"node_modules/rxjs\":{\"version\":\"6.3.3\"}}}");
	var relocked = application("Relocked", null, "{\"lockfileVersion\":3,\"packages\":{\"node_modules/rxjs\":{\"version\":\"6.3.4\"}}}");
	var lockedKey = frontendSharedAppModulesKey(locked, npm);
	assertTrue(lockedKey && lockedKey !== firstKey, "a lockfile gives another key");
	assertTrue(frontendSharedAppModulesKey(relocked, npm) !== lockedKey, "another lockfile gives another key");
	var upgraded = application("Upgraded", function (value) { value.devDependencies.vite = "8.3.5"; });
	assertTrue(frontendSharedAppModulesKey(upgraded, npm) !== firstKey, "another package.json gives another key");
	nodeVersion("v24.10.0");
	assertTrue(frontendSharedAppModulesKey(first, npm) !== firstKey, "another Node.js gives another key");
	write(new File(base, "node/lib/node_modules/npm/package.json"), "{\"name\":\"npm\",\"version\":\"11.0.1\"}");
	new File(base, "node/lib/node_modules/npm/bin/npm-cli.js").setLastModified(JavaSystem.currentTimeMillis() - 1000);
	var upgradedNpmKey = frontendSharedAppModulesKey(first, npm);
	nodeVersion("v24.0.0");
	assertTrue(frontendSharedAppModulesKey(first, npm) !== firstKey, "another npm version gives another key");
	assertTrue(upgradedNpmKey !== firstKey, "even with the same Node.js");
	write(new File(base, "node/lib/node_modules/npm/package.json"), "{\"name\":\"npm\",\"version\":\"11.0.0\"}");
	new File(base, "node/lib/node_modules/npm/bin/npm-cli.js").setLastModified(JavaSystem.currentTimeMillis() - 2000);
	assertEqual(frontendSharedAppModulesKey(first, npm), firstKey, "the same versions give the same key, whatever the dates");
	new File(toolchain, "node").setLastModified(JavaSystem.currentTimeMillis() - 86400000);
	assertEqual(frontendSharedAppModulesKey(second, npm), firstKey, "a copied Node.js keeps the key");
	write(new File(base, "bare/npm"), "npm");
	assertEqual(frontendSharedAppModulesKey(first, String(new File(base, "bare/npm").getPath())), "",
		"an npm without known version and node is not shared");
	write(new File(base, "projects/vendor/sdk.tgz"), "tarball 2");
	assertTrue(frontendSharedAppModulesKey(first, npm) !== firstKey, "another content of a local tarball gives another key");
	write(new File(base, "projects/vendor/sdk.tgz"), "tarball 1");
	assertEqual(frontendSharedAppModulesKey(first, npm), firstKey, "the content of the tarball counts, not its date");
	write(new File(second, ".npmrc"), "registry=https://example.invalid/\n");
	assertTrue(frontendSharedAppModulesKey(second, npm) !== firstKey, "an .npmrc gives another key");
	new File(second, ".npmrc")["delete"]();
	[
		["a git dependency", function (value) { value.dependencies.git = "git+https://example.invalid/repo.git"; }],
		["a GitHub shorthand", function (value) { value.dependencies.gh = "owner/repo"; }],
		["a linked package", function (value) { value.dependencies.near = "link:../near"; }],
		["a local folder", function (value) { value.dependencies.near = "file:../../../vendor"; }],
		["a missing tarball", function (value) { value.dependencies.sdk = "file:../../../vendor/missing.tgz"; }],
		["an alias", function (value) { value.dependencies.alias = "npm:svelte@5"; }],
		["a URL", function (value) { value.dependencies.remote = "https://example.invalid/pkg.tgz"; }],
		["an override from git", function (value) { value.overrides = { rxjs: { tslib: "github:owner/tslib" } }; }],
		["an installation script", function (value) { value.scripts.postinstall = "node setup.js"; }],
		["workspaces", function (value) { value.workspaces = ["packages/*"]; }]
	].forEach(function (pair, index) {
		assertEqual(frontendSharedAppModulesKey(application("Unshared" + index, pair[1]), npm), "",
			pair[0] + " is not shared");
	});
	assertEqual(frontendSharedAppModulesKey(new File(base, "none"), npm), "", "a folder without package.json is not shared");

	// the first application installs, and its packages are kept
	var firstShared = frontendSharedAppModules(resourceRoot, first, npm);
	assertEqual([String(firstShared.store.getPath()), firstShared.key], [String(store.getPath()), firstKey],
		"an application without node_modules looks for shared packages in the store");
	assertTrue(!frontendRestoreSharedAppModules(first, store, firstKey), "the store has nothing yet");
	assertTrue(!new File(first, "node_modules").exists(), "nothing is given then");
	install(first, "First");
	frontendKeepSharedAppModules(first, store, firstKey);
	var entry = new File(store, firstKey);
	assertTrue(new File(entry, "entry.json").isFile(), "the packages are kept under their key");
	assertEqual(read(new File(entry, "node_modules/owner.txt")), "First", "with their content");
	assertTrue(!new File(entry, "node_modules/$app").exists() && !new File(entry, "node_modules/.vite").exists(),
		"without what the tools of the application write in node_modules");
	assertTrue(Files.isSymbolicLink(new File(entry, "node_modules/.bin/pkg").toPath()), "links stay links");
	assertEqual(read(new File(entry, "package-lock.json")), read(new File(first, "package-lock.json")),
		"with the lockfile npm wrote");
	assertEqual(names(store).filter(function (name) { return name.charAt(0) === "."; }), [], "no temporary folder is left");

	// the second application with the same dependencies receives a copy
	assertEqual(frontendSharedAppModules(resourceRoot, second, npm).key, firstKey, "the second application has the same key");
	assertTrue(frontendRestoreSharedAppModules(second, store, firstKey), "the second application receives the packages");
	assertEqual(read(new File(second, "node_modules/owner.txt")), "First", "the packages of the first application");
	assertEqual(read(new File(second, "node_modules/pkg/index.js")), "module.exports = 'First';", "complete");
	assertTrue(Files.isSymbolicLink(new File(second, "node_modules/.bin/pkg").toPath())
		&& read(new File(second, "node_modules/.bin/pkg")) === "module.exports = 'First';", "with working bin links");
	assertEqual(read(new File(second, "package-lock.json")), read(new File(first, "package-lock.json")), "and their lockfile");
	assertEqual(names(second).filter(function (name) { return name.indexOf("shared-") >= 0; }), [], "no temporary copy is left");
	write(new File(second, "node_modules/owner.txt"), "Second");
	assertEqual(read(new File(entry, "node_modules/owner.txt")), "First", "a copy written by its application leaves the store as is");
	assertEqual(read(new File(first, "node_modules/owner.txt")), "First", "and the other applications");
	assertEqual(frontendSharedAppModules(resourceRoot, second, npm), null, "an application with node_modules is left to npm");

	// different lockfiles never share
	var lockedShared = frontendSharedAppModules(resourceRoot, locked, npm);
	assertTrue(lockedShared.key !== firstKey, "an application with a lockfile has its own key");
	assertTrue(!frontendRestoreSharedAppModules(locked, lockedShared.store, lockedShared.key),
		"it does not receive the packages installed without that lockfile");
	assertTrue(!new File(locked, "node_modules").exists(), "npm installs them");
	install(locked, "Locked");
	frontendKeepSharedAppModules(locked, store, lockedShared.key);
	var relockedShared = frontendSharedAppModules(resourceRoot, relocked, npm);
	assertTrue(relockedShared.key !== lockedShared.key && relockedShared.key !== firstKey, "another lockfile, another key");
	assertTrue(!frontendRestoreSharedAppModules(relocked, store, relockedShared.key),
		"an application with another lockfile does not receive the packages of the first two");
	assertTrue(!new File(relocked, "node_modules").exists(), "its node_modules stays to install");
	assertEqual(read(new File(relocked, "package-lock.json")).indexOf("6.3.4") > 0, true, "and its lockfile is left as is");

	// an entry is never replaced
	var other = application("Other");
	install(other, "Other");
	frontendKeepSharedAppModules(other, store, firstKey);
	assertEqual(read(new File(entry, "node_modules/owner.txt")), "First", "an entry is never replaced");
	assertEqual(names(store).filter(function (name) { return name.charAt(0) === "."; }), [], "the other copy goes");

	// concurrent installations keep one complete entry, and concurrent copies are complete
	var concurrentKey = "c" + firstKey.substring(1);
	var roots = [];
	for (var i = 0; i < 6; i++) {
		var root = application("Writer" + i);
		install(root, "Writer" + i);
		for (var j = 0; j < 200; j++) {
			write(new File(root, "node_modules/many/" + j + ".js"), "Writer" + i);
		}
		roots.push(root);
	}
	function inParallel(count, action) {
		var errors = new java.util.concurrent.ConcurrentLinkedQueue();
		var start = new java.util.concurrent.CountDownLatch(1);
		var threads = [];
		for (var t = 0; t < count; t++) {
			(function (index) {
				var thread = new java.lang.Thread(function () {
					try {
						start.await();
						action(index);
					} catch (e) {
						errors.add(String(e));
					}
				});
				thread.start();
				threads.push(thread);
			})(t);
		}
		start.countDown();
		threads.forEach(function (thread) { thread.join(); });
		assertEqual(String(errors), "[]", "no concurrent operation fails");
	}
	inParallel(roots.length, function (index) {
		frontendKeepSharedAppModules(roots[index], store, concurrentKey);
	});
	var kept = new File(store, concurrentKey);
	var owner = read(new File(kept, "node_modules/owner.txt"));
	assertTrue(/^Writer\d$/.test(owner), "one installation is kept");
	for (var k = 0; k < 200; k++) {
		assertEqual(read(new File(kept, "node_modules/many/" + k + ".js")), owner, "entirely, never mixed with another one");
	}
	assertEqual(names(store).filter(function (name) { return name.charAt(0) === "."; }), [], "the other copies go");
	var readers = [];
	for (var r = 0; r < 4; r++) {
		readers.push(application("Reader" + r));
	}
	inParallel(readers.length, function (index) {
		if (!frontendRestoreSharedAppModules(readers[index], store, concurrentKey)) {
			throw new Error("Reader" + index + " received nothing");
		}
	});
	readers.forEach(function (reader) {
		assertEqual(names(new File(reader, "node_modules/many")).length, 200, "each concurrent copy is complete");
		assertEqual(read(new File(reader, "node_modules/owner.txt")), owner, "and comes from the kept entry");
	});

	// the cleanup keeps the entries used last, and those used within the hour
	var now = JavaSystem.currentTimeMillis();
	var cleaned = new File(base, "cleaned");
	function entryUsed(name, ageMs) {
		write(new File(cleaned, name + "/node_modules/owner.txt"), name);
		write(new File(cleaned, name + "/entry.json"), "{}");
		new File(cleaned, name + "/entry.json").setLastModified(now - ageMs);
	}
	entryUsed("a", 10000);
	entryUsed("b", 20000);
	entryUsed("c", 30000);
	entryUsed("d", 600000);
	entryUsed("e", 2 * 3600000);
	entryUsed("f", 3 * 3600000);
	write(new File(cleaned, ".tmp-old/node_modules/x"), "x");
	new File(cleaned, ".tmp-old").setLastModified(now - 2 * 3600000);
	write(new File(cleaned, ".tmp-busy/node_modules/x"), "x");
	frontendCleanSharedAppModules(cleaned);
	assertEqual(names(cleaned), [".tmp-busy", "a", "b", "c", "d"],
		"the entries used last stay, as do those used within the hour and an installation being kept");

	// a restored application keeps its entry in use
	var touched = new File(entry, "entry.json");
	touched.setLastModified(now - 5 * 3600000);
	var third = application("Third");
	assertTrue(frontendRestoreSharedAppModules(third, store, firstKey), "a third application receives the packages");
	assertTrue(JavaSystem.currentTimeMillis() - touched.lastModified() < 60000, "its entry is marked in use");

	// without clonefile (another system, a Java without the foreign function interface), cp copies
	frontendCloneFileHandle = false;
	var fourth = application("Fourth");
	assertTrue(frontendRestoreSharedAppModules(fourth, store, firstKey), "cp gives the packages too");
	assertEqual(read(new File(fourth, "node_modules/pkg/index.js")), "module.exports = 'First';", "complete");
	assertTrue(Files.isSymbolicLink(new File(fourth, "node_modules/.bin/pkg").toPath()), "with its links");
	assertEqual(names(fourth).filter(function (name) { return name.indexOf("shared-") >= 0; }), [], "and no temporary copy");
} finally {
	FileUtils.deleteQuietly(base);
}
print("frontend shared app modules: ok");
