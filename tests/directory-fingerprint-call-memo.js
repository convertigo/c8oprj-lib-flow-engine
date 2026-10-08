// A read-only call (a tree, a palette, a property editor, a menu) computes the fingerprint of a directory once: a
// refresh walks the same catalogs several times, each entry a remote call on a network file system. The calls that
// write always walk, and the memo is per thread and ends with the call.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));

function functionSource(name) {
	var start = source.indexOf("\n\tfunction " + name + "(") + 2;
	if (start < 2) {
		throw new Error("missing function " + name);
	}
	var end = source.lastIndexOf("\n\t}", source.indexOf("\n\tfunction ", start + 1)) + 3;
	return "(" + source.substring(start, end) + ")";
}

function assertTrue(value, message) {
	if (!value) {
		throw new Error(message);
	}
}

var walks = 0;
function fingerprintUtils() {
	return { directoryFingerprint: function (dir) { walks++; return "fingerprint of " + dir.getName() + " #" + walks; } };
}
function fingerprintEnv() { return {}; }
eval(source.substring(source.indexOf("\tvar MEMOIZED_FINGERPRINT_OPERATIONS"), source.indexOf("\tvar callFingerprints")));
var callFingerprints = new Packages.java.lang.ThreadLocal();
var directoryFingerprint = eval(functionSource("directoryFingerprint"));
function parseRequest(json) { return JSON.parse(json); }
function withActiveRequest(request, callback) { return callback(); }
function response(value) { return value; }
function failure(operation, e) { return { ok: false, error: String(e) }; }
var engineCall = eval(functionSource("engineCall"));

var dir = new java.io.File("/tmp/catalog/ui");
var other = new java.io.File("/tmp/catalog/components");

var seen = engineCall("describeTree", "{}", function () {
	return [directoryFingerprint(dir), directoryFingerprint(dir), directoryFingerprint(other), directoryFingerprint(dir)];
});
assertTrue(walks === 2, "a read-only call walks each directory once: " + walks);
assertTrue(seen[0] === seen[1] && seen[1] === seen[3] && seen[2] !== seen[0], "and gets the same fingerprint: " + seen);

walks = 0;
engineCall("applySourceMutation", "{}", function () {
	directoryFingerprint(dir);
	directoryFingerprint(dir);
});
assertTrue(walks === 2, "a call that writes walks each time: " + walks);

walks = 0;
directoryFingerprint(dir);
directoryFingerprint(dir);
assertTrue(walks === 2, "outside a call, each time");
assertTrue(callFingerprints.get() == null, "the memo ends with the call");

walks = 0;
engineCall("describeTree", "{}", function () {
	directoryFingerprint(dir);
	var thread = new java.lang.Thread(function () { directoryFingerprint(dir); });
	thread.start();
	thread.join();
	directoryFingerprint(dir);
});
assertTrue(walks === 2, "another thread, as a background build, does not share it: " + walks);

["applySourceMutation", "authoringMutate", "applyMutation", "contextAction", "syncInputs", "run"].forEach(function (operation) {
	assertTrue(MEMOIZED_FINGERPRINT_OPERATIONS[operation] !== true, operation + " always walks");
});

print("directory-fingerprint-call-memo: once per read-only call, per thread");
