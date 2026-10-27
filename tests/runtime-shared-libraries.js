// A shared runtime evaluates a Flow library that declares stateless: true once and gives its frozen object to every run;
// another library is evaluated for each run, its module state owned by that run. jwt-verify is stateless: its shared
// evaluation decodes from concurrent threads, and an evaluation of its own still exposes its platform to a test.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var source = String(FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
function assert(value, message) { if (!value) throw new Error(message); }
function extract(name) {
	var start = source.indexOf("\n\tfunction " + name + "(") + 2;
	assert(start >= 2, name + " must remain extractable");
	var end = source.lastIndexOf("\n\t}", source.indexOf("\n\tfunction ", start + 1)) + 3;
	return source.substring(start, end);
}

var libraries = {
	pure: "(function () { evaluations.pure++; var table = { a: 1 }; return { stateless: true, read: function (k) { return table[k]; } }; }())",
	stateful: "(function () { evaluations.stateful++; var calls = 0; return { count: function () { return ++calls; } }; }())"
};
var evaluations = { pure: 0, stateful: 0 };
var globalScope = this;
var loadFlowLibrary = (function () {
	var prepared = {};
	var sharedRuntime = {
		prepare: function (key, build) { return prepared[key] || (prepared[key] = build()); }
	};
	function projectDir() { return "/workspace/projects/Lab"; }
	function flowLibraryFile(name) { return name; }
	function readSourceFile(file) { return libraries[file]; }
	function canonicalPath(file) { return "/lib/" + file + ".js"; }
	function fileFingerprint() { return "1"; }
	function compileScript(text, name) {
		return Packages.org.mozilla.javascript.Context.getCurrentContext().compileString(text, name, 1, null);
	}
	function compiledScriptScope(cx) { return globalScope; }
	function flowLibraryService() { throw new Error("the shared runtime does not use the per-realm loader"); }
	return eval("(" + extract("loadFlowLibrary") + ")");
})();

var first = loadFlowLibrary("pure"), second = loadFlowLibrary("pure");
assert(first === second && evaluations.pure === 1, "a stateless library is evaluated once for the runtime: " + evaluations.pure);
assert(Object.isFrozen(first) && first.read("a") === 1, "its shared object is frozen and works");

var one = loadFlowLibrary("stateful"), two = loadFlowLibrary("stateful");
assert(one !== two && one.count() === 1 && one.count() === 2 && two.count() === 1,
	"another library is evaluated for each run, its state owned by that run");
assert(evaluations.stateful === 3 && !Object.isFrozen(one), "evaluated once to read its declaration, then once per run: " + evaluations.stateful);

// jwt-verify through the same shared path
libraries["jwt-verify"] = String(FileUtils.readFileToString(new java.io.File(engineDir, "lib/jwt-verify.js"), "UTF-8"));
var jwt = loadFlowLibrary("jwt-verify");
assert(jwt === loadFlowLibrary("jwt-verify") && Object.isFrozen(jwt), "jwt-verify is shared and frozen");
function part(value) {
	return String(java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(new java.lang.String(JSON.stringify(value)).getBytes("UTF-8")));
}
var token = part({ alg: "RS256", typ: "JWT" }) + "." + part({ user_id: 7, exp: 4102444800, iat: 1 }) + ".c2ln";
var decoded = jwt.decode(token);
assert(decoded.ok === true && decoded.claims.user_id === 7 && decoded.header.alg === "RS256", "the shared jwt-verify decodes: " + JSON.stringify(decoded));
assert(jwt.platform === null && jwt.decode("not-a-jwt").ok === false, "its platform stays private once frozen, and garbage is refused");

var threads = [], failures = new java.util.concurrent.atomic.AtomicInteger(0), done = new java.util.concurrent.atomic.AtomicInteger(0);
for (var t = 0; t < 8; t++) {
	(function (index) {
		var claims = { user_id: index, exp: 4102444800, iat: 1 };
		var own = part({ alg: "RS256" }) + "." + part(claims) + ".c2ln";
		threads.push(new java.lang.Thread(new java.lang.Runnable({ run: function () {
			for (var i = 0; i < 500; i++) {
				var out = jwt.decode(own);
				if (!(out.ok === true && out.claims.user_id === index)) failures.incrementAndGet();
			}
			done.incrementAndGet();
		} })));
	})(t);
}
threads.forEach(function (thread) { thread.start(); });
threads.forEach(function (thread) { thread.join(60000); });
assert(done.get() === 8 && failures.get() === 0, "concurrent decodes give each thread its own claims: " + failures.get() + " failures, " + done.get() + " threads");

// an evaluation of its own (as jwt-blocks does) still exposes the platform it uses, which a test may replace
var own = eval(libraries["jwt-verify"]);
assert(own.decode(token).ok === true && own.platform !== null && typeof own.platform.now === "function",
	"an evaluation of its own exposes its platform");
print("runtime-shared-libraries OK");
