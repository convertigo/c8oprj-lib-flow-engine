var engineDir = String(new java.io.File(arguments[0]).getAbsolutePath());
var File = Packages.java.io.File;
var Arrays = Packages.java.util.Arrays;
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var MessageDigest = Packages.java.security.MessageDigest;
var JavaString = Packages.java.lang.String;

function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

function sha256Hex(text) {
	var digest = MessageDigest.getInstance("SHA-256").digest(new JavaString(String(text || "")).getBytes("UTF-8"));
	var out = "";
	for (var i = 0; i < digest.length; i++) {
		var value = digest[i] < 0 ? digest[i] + 256 : digest[i];
		var hex = value.toString(16);
		out += hex.length === 1 ? "0" + hex : hex;
	}
	return out;
}

var root = new File(Packages.java.lang.System.getProperty("java.io.tmpdir"),
	"flow-catalog-static-snapshot-test-" + new Date().getTime());
var sourceDir = new File(root, "provider");
var cacheDir = new File(root, "workspace/cache/flow/catalog-meta-v1");
sourceDir.mkdirs();
cacheDir.mkdirs();

function write(file, value) {
	FileUtils.writeStringToFile(file, String(value), "UTF-8");
}

var firstFile = new File(sourceDir, "first.meta");
var secondFile = new File(sourceDir, "second.meta");
write(firstFile, "alpha");
write(secondFile, "bravo");

var serviceSource = String(FileUtils.readFileToString(
	new File(engineDir, "modules/catalog-static-snapshot-service.js"), "UTF-8"));
var service = eval(serviceSource);
var stats = {};
var hashCalls = 0;
var extractCalls = 0;
var readTextCalls = 0;
var memory = { entries: {} };
var env = {
	File: File,
	Arrays: Arrays,
	FileUtils: FileUtils,
	stats: stats,
	memory: memory,
	cacheDir: function () { return cacheDir; },
	canonicalPath: function (file) { return String(file.getCanonicalPath()); },
	sha256Hex: sha256Hex,
	fileContentHash: function (file) {
		hashCalls++;
		return sha256Hex(String(FileUtils.readFileToString(file, "UTF-8")));
	},
	readText: function (file) {
		readTextCalls++;
		return String(FileUtils.readFileToString(file, "UTF-8"));
	},
	normalizeTree: function (value) { return JSON.parse(JSON.stringify(value)); },
	writeAtomic: function (file, text) {
		var temporary = File.createTempFile("catalog-snapshot-", ".json", file.getParentFile());
		try {
			FileUtils.writeStringToFile(temporary, String(text), "UTF-8");
			Packages.java.nio.file.Files.move(temporary.toPath(), file.toPath(),
				Packages.java.nio.file.StandardCopyOption.REPLACE_EXISTING,
				Packages.java.nio.file.StandardCopyOption.ATOMIC_MOVE);
		} finally {
			if (temporary.isFile()) temporary["delete"]();
		}
	},
	currentTimeMillis: function () { return new Date().getTime(); },
	maxEntries: 2,
	maxBytes: 1024 * 1024,
	memoryMaxEntries: 2,
	memoryMaxBytes: 1024 * 1024
};

function request(scope) {
	return {
		scope: scope || "provider",
		closure: { provider: "fixture", root: String(sourceDir.getCanonicalPath()) },
		extractor: "fixture-v1",
		roots: [String(sourceDir.getCanonicalPath())],
		files: [firstFile, secondFile],
		extract: function (files) {
			extractCalls++;
			return files.map(function (file) {
				return { path: String(file.getCanonicalPath()), value: String(FileUtils.readFileToString(file, "UTF-8")) };
			});
		},
		validate: function (payload) {
			return Object.prototype.toString.call(payload) === "[object Array]" && payload.length === 2;
		}
	};
}

try {
	var cold = service.load(request(), env);
	assertTrue(cold.hit === false && cold.payload.length === 2, "cold load did not rebuild the payload");
	assertTrue(extractCalls === 1 && hashCalls === 2, "cold load did not hash and extract exactly once");

	var warm = service.load(request(), env);
	assertTrue(warm.hit === true && service.stableStringify(warm.payload) === service.stableStringify(cold.payload),
		"warm snapshot differs from the fresh payload");
	assertTrue(extractCalls === 1 && hashCalls === 2, "unchanged inventory reread source contents");
	assertTrue(readTextCalls === 0 && Number(stats.memoryHits || 0) === 1,
		"same-runtime hit reread the disk envelope");

	memory.entries = {};
	var restored = service.load(request(), env);
	assertTrue(restored.hit === true && readTextCalls === 1 && Number(stats.diskHits || 0) === 1,
		"fresh-runtime restore did not validate the disk snapshot");

	firstFile.setLastModified(firstFile.lastModified() + 2000);
	var touched = service.load(request(), env);
	assertTrue(touched.hit === true && touched.reason === "metadata-refreshed", "mtime-only change was not refreshed");
	assertTrue(extractCalls === 1 && hashCalls === 3, "mtime-only change did not hash only the suspect file");

	write(secondFile, "BRAVO");
	secondFile.setLastModified(secondFile.lastModified() + 2000);
	var changed = service.load(request(), env);
	assertTrue(changed.hit === false && changed.reason === "content-changed", "content change did not rebuild");
	assertTrue(extractCalls === 2 && hashCalls === 4, "content change did not hash only the changed file before rebuild");
	assertTrue(changed.payload[1].value === "BRAVO", "rebuilt payload kept stale source content");

	var cacheFiles = Arrays.asList(cacheDir.listFiles()).toArray().filter(function (file) {
		return file.isFile() && String(file.getName()).endsWith(".json");
	});
	assertTrue(cacheFiles.length === 1, "unexpected cache file count before corruption");
	write(cacheFiles[0], "{broken");
	memory.entries = {};
	var recovered = service.load(request(), env);
	assertTrue(recovered.hit === false && recovered.reason === "corrupt-rebuild", "corrupt cache did not rebuild");
	assertTrue(Number(stats.corrupt || 0) === 1, "corrupt cache was not reported");

	service.load(request("provider-two"), env);
	service.load(request("provider-three"), env);
	var info = service.info(env);
	assertTrue(info.entries <= 2 && Number(stats.evictions || 0) >= 1, "quota did not evict old snapshots");

	var removed = service.invalidateRoot(String(sourceDir.getCanonicalPath()), env);
	assertTrue(removed === info.entries && service.info(env).entries === 0, "root invalidation did not remove snapshots");
	assertTrue(Number(stats.hits || 0) >= 2 && Number(stats.misses || 0) >= 1 &&
		Number(stats.stale || 0) >= 1 && Number(stats.rebuilds || 0) >= 5,
		"snapshot observability counters are incomplete: " + JSON.stringify(stats));
	print("catalog-static-snapshot OK " + JSON.stringify({ stats: stats, info: service.info(env) }));
} finally {
	FileUtils.deleteDirectory(root);
}
