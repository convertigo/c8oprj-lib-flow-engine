// In the shared runtime of the server (convertigo.javascript.stateless=true), each call gets the Java packages of the
// generation of the class path of its project (FlowPackages.bind): a new Packages object, which asks the class loader of
// the project again for every name it is given, and Rhino asks for each package of Packages.a.b.C as a class first ("a.b").
// Before the engine answered the known names without it, each lookup took the class loading lock of its name, and each
// class of the engine was searched in the libraries of the project first, with the stack of a ClassNotFoundException: the
// concurrent calls waited for each other on the same names.
//
// This runs Engine.run in the real FlowRuntimeApi of the engine, the way FlowEngineBridge does (shared scope, one frame
// and the packages of a generation per call), with a class loader of the generation counting the names it is asked for.
// The Flow uses http.request (a cookie of the Convertigo context of the call), crypto.hash, a Rhino block of no state
// (text.urlEncode, a factory per frame), an expression method call, while, set, rows.select (the rows library and its
// Java kernel, a class of the generation) and jwt.decode (the jwt-verify library). Once warm, a call asks the generation for no class at all, the six names bound
// by the engine itself apart; the Java kernel of the rows is looked up again, once, for another generation. It needs the
// engine classes: run it with the complete engine runtime classpath in CONVERTIGO_DEPENDENCIES_JAR.
var engineDir = new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getCanonicalFile();
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(condition, message) {
	checks++;
	if (!condition) {
		throw new Error(message);
	}
}

var Context = java.lang.Class.forName("org.mozilla.javascript.Context");
var Scriptable = java.lang.Class.forName("org.mozilla.javascript.Scriptable");
var FlowRuntimeApi = Packages.com.twinsoft.convertigo.engine.flow.FlowRuntimeApi;
assert(typeof FlowRuntimeApi === "function", "shared-runtime-class-lookups needs the engine classes: set CONVERTIGO_DEPENDENCIES_JAR to the complete engine runtime classpath");

// the class loader of a generation (libs/build of lib_flow_engine, as a project referencing it gets them), counting
// every name asked to it; and a stand-in of the Convertigo context, with its public httpState
var work = java.nio.file.Files.createTempDirectory("lib-flow-engine-class-lookups", []).toFile();
var sources = new java.io.File(work, "src");
files.writeStringToFile(new java.io.File(sources, "flowtest/CountingLoader.java"), [
	"package flowtest;",
	"public final class CountingLoader extends java.net.URLClassLoader {",
	"	static { ClassLoader.registerAsParallelCapable(); }",
	"	private final java.util.concurrent.ConcurrentHashMap<String, java.util.concurrent.atomic.AtomicInteger> names = new java.util.concurrent.ConcurrentHashMap<>();",
	"	public CountingLoader(java.net.URL[] urls, ClassLoader parent) { super(urls, parent); }",
	"	@Override protected Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {",
	"		names.computeIfAbsent(name, key -> new java.util.concurrent.atomic.AtomicInteger()).incrementAndGet();",
	"		return super.loadClass(name, resolve);",
	"	}",
	"	/** @return the names asked since the last call, with their counts, as JSON */",
	"	public synchronized String take() {",
	"		var json = new StringBuilder(\"{\");",
	"		for (var name : new java.util.TreeSet<>(names.keySet())) {",
	"			int count = names.remove(name).get();",
	"			json.append(json.length() > 1 ? \",\" : \"\").append('\"').append(name).append(\"\\\":\").append(count);",
	"		}",
	"		return json.append('}').toString();",
	"	}",
	"}"].join("\n"), "UTF-8");
files.writeStringToFile(new java.io.File(sources, "flowtest/ContextStandIn.java"),
	"package flowtest; public class ContextStandIn { public org.apache.commons.httpclient.HttpState httpState; }", "UTF-8");
var classes = new java.io.File(work, "classes");
var javacArgs = ["-d", String(classes.getPath()), "-cp", String(java.lang.System.getProperty("java.class.path")),
	String(new java.io.File(sources, "flowtest/CountingLoader.java").getPath()), String(new java.io.File(sources, "flowtest/ContextStandIn.java").getPath())];
var javac = java.lang.reflect.Array.newInstance(java.lang.String, javacArgs.length);
javacArgs.forEach(function (arg, i) { javac[i] = arg; });
assert(javax.tools.ToolProvider.getSystemJavaCompiler().run(null, null, null, javac) === 0, "the test classes compile");
var testClasses = new java.net.URLClassLoader([classes.toURI().toURL()], java.lang.Thread.currentThread().getContextClassLoader());
var CountingLoader = testClasses.loadClass("flowtest.CountingLoader");
var ContextStandIn = testClasses.loadClass("flowtest.ContextStandIn");
var libsBuild = new java.io.File(engineDir.getParentFile(), "libs/build/classes");
assert(libsBuild.isDirectory(), "libs/build/classes is there: " + libsBuild);
function generation(id) {
	var urls = java.lang.reflect.Array.newInstance(java.net.URL, 1);
	urls[0] = libsBuild.toURI().toURL();
	return { id: id, loader: CountingLoader.getConstructor(java.lang.Class.forName("[Ljava.net.URL;"), java.lang.Class.forName("java.lang.ClassLoader")).newInstance(urls, testClasses) };
}
function newContext() {
	return ContextStandIn.getDeclaredConstructor().newInstance(java.lang.reflect.Array.newInstance(java.lang.Object, 0));
}

// a server: /login?id=<id> sets the cookie sid=<id>, /whoami answers the cookies it receives
var server = Packages.com.sun.net.httpserver.HttpServer.create(new java.net.InetSocketAddress("127.0.0.1", 0), 0);
var executor = java.util.concurrent.Executors.newCachedThreadPool();
server.setExecutor(executor);
var base = "http://127.0.0.1:" + server.getAddress().getPort();
server.createContext("/", function (exchange) {
	var path = String(exchange.getRequestURI().getPath());
	var query = String(exchange.getRequestURI().getRawQuery() || "");
	exchange.getRequestBody().readAllBytes();
	var headers = exchange.getResponseHeaders();
	headers.add("Content-Type", "application/json");
	if (path === "/login") headers.add("Set-Cookie", "sid=" + query.split("=")[1] + "; Path=/");
	var bytes = new java.lang.String(JSON.stringify({ cookie: String(exchange.getRequestHeaders().getFirst("Cookie") || "") })).getBytes("UTF-8");
	exchange.sendResponseHeaders(200, bytes.length);
	exchange.getResponseBody().write(bytes);
	exchange.close();
});
server.start();

// the shared runtime, as FlowEngineBridge.sharedEngineRuntime builds it
var cx = Packages.org.mozilla.javascript.Context.getCurrentContext();
var api = new FlowRuntimeApi(cx);
var shared = api.sharedScope();
var layout = String(Packages.com.twinsoft.convertigo.engine.flow.FlowSourceLayout.current().key());
var project = java.nio.file.Files.createTempDirectory("lib-flow-engine-class-lookups-project", []).toFile();
shared.__flowEngineDir = String(engineDir.getPath());
shared.__flowSourceLayout = layout;
Object.defineProperty(shared, "__flowRuntimeApi", { value: api, writable: false, enumerable: false, configurable: false });
var engineFile = new java.io.File(engineDir, "Engine.js");
var engine = cx.evaluateString(shared, String(files.readFileToString(engineFile, "UTF-8")), String(engineFile.getPath()), 1, null);
java.lang.Class.forName("org.mozilla.javascript.ScriptableObject").getMethod("sealObject").invoke(shared);
assert(engine.supportsStatelessExecution === true, "the provider implements the shared runtime");

// a frame per call, its packages those of the generation, as FlowEngineBridge.invokePrepared and FlowPackages.bind
function accessible(member) { member.setAccessible(true); return member; }
var enter = accessible(java.lang.Class.forName("com.twinsoft.convertigo.engine.flow.FlowRuntimeApi").getDeclaredMethod("enter", Context));
var Frame = java.lang.Class.forName("com.twinsoft.convertigo.engine.flow.FlowRuntimeApi$Frame");
var frameScope = accessible(Frame.getDeclaredField("scope"));
var frameClose = accessible(Frame.getDeclaredMethod("close"));
var FlowPackages = java.lang.Class.forName("com.twinsoft.convertigo.engine.flow.FlowPackages");
var initializeChildScope = accessible(FlowPackages.getDeclaredMethod("initializeChildScope", Scriptable, Scriptable));
var bind = accessible(FlowPackages.getDeclaredMethod("bind", Context, Scriptable, java.lang.Class.forName("java.lang.ClassLoader")));

// a compact JWT, decoded by jwt.decode (lib/jwt-verify.js, a library shared by the runs of a shared runtime)
function part(value) {
	return String(java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(new java.lang.String(JSON.stringify(value)).getBytes("UTF-8")));
}
var token = part({ alg: "RS256", typ: "JWT" }) + "." + part({ user_id: 7, exp: 4102444800, iat: 1 }) + ".c2ln";
var definition = { version: 1, nodes: [
	{ id: "login", block: "http.request", props: { url: base + "/login?id={{ input.id }}" }, out: "local.login" },
	{ id: "whoami", block: "http.request", props: { url: base + "/whoami" }, out: "local.whoami" },
	{ id: "cookie", block: "set", props: { path: "result.cookie", value: "{{ local.whoami.body.cookie }}" } },
	{ id: "upper", block: "set", props: { path: "result.upper", value: "{{ local.whoami.body.cookie.toUpperCase() }}" } },
	{ id: "hash", block: "crypto.hash", props: { text: "{{ input.id }}" }, out: "result.hash" },
	{ id: "encoded", block: "text.urlEncode", props: { text: "a b" }, out: "result.encoded" },
	{ id: "zero", block: "set", props: { path: "local.n", value: 0 } },
	{ id: "loop", block: "while", props: { condition: "local.n < 2" }, nodes: [
		{ id: "next", block: "set", props: { path: "local.n", value: "{{ local.n + 1 }}" } }
	] },
	{ id: "count", block: "set", props: { path: "result.n", value: "{{ local.n }}" } },
	{ id: "table", block: "set", props: { path: "local.rows", value: [{ a: 1, b: 2 }, { a: 3, b: 4 }] } },
	{ id: "select", block: "rows.select", props: { rows: "local.rows", columns: ["b"] }, out: "result.rows" },
	{ id: "jwt", block: "jwt.decode", props: { token: token }, out: "local.jwt" },
	{ id: "user", block: "set", props: { path: "result.user", value: "{{ local.jwt.claims.user_id }}" } }
] };

var BOUND = { "java": true, "javax": true, "org": true, "com": true, "edu": true, "net": true };
// one call on this thread: its result and the names its generation was asked for, the six bound by the engine apart
function call(gen, id) {
	var frame = enter.invoke(api, cx);
	try {
		var scope = frameScope.get(frame);
		initializeChildScope.invoke(null, scope, shared);
		scope.__flowEngineDir = String(engineDir.getPath());
		scope.__flowSourceLayout = layout;
		scope.__flowProjectDir = String(project.getPath());
		scope.context = newContext();
		bind.invoke(null, cx, scope, gen.loader);
		scope.__flowGenerationId = gen.id;
		var run = JSON.parse(String(engine.run(JSON.stringify({ definition: definition, input: { id: String(id) }, includeTrace: false }))));
		assert(run.ok === true, "the call runs: " + JSON.stringify(run.error || run).substring(0, 800));
		return run.result;
	} finally {
		frameClose.invoke(frame);
	}
}
function lookups(gen, calls) {
	var asked = JSON.parse(String(gen.loader.take())), others = {}, total = 0;
	Object.keys(BOUND).forEach(function (name) {
		assert((asked[name] || 0) === calls, "the engine binds the packages of the generation at each call (" + name + "): " + JSON.stringify(asked));
	});
	Object.keys(asked).forEach(function (name) {
		if (!BOUND[name]) { others[name] = asked[name]; total += asked[name]; }
	});
	return { total: total, names: others };
}
// the names of packages asked as classes, as Packages.a.b.C does for "a.b" ("a.b.c": lower case last part, no nested class)
function packageProbes(names) {
	return Object.keys(names).filter(function (name) { return name.indexOf(".") < 0 || /\.[a-z][A-Za-z0-9_]*$/.test(name); });
}
function expected(result, id) {
	return result.cookie === "sid=" + id && result.upper === "SID=" + id && result.encoded === "a%20b" && result.n === 2
		&& /^[0-9a-f]{64}$/.test(result.hash) && JSON.stringify(result.rows) === '[{"b":2},{"b":4}]' && result.user === 7;
}

try {
	var first = generation("lookups#1");
	var cold = call(first, 1);
	assert(expected(cold, 1), "the cold call gives the result of the Flow: " + JSON.stringify(cold));
	var coldLookups = lookups(first, 1);
	assert(coldLookups.names["com.convertigo.libflowengine.Rows"] === 1,
		"the generation is asked for the Java kernel of the rows once, by its full name: " + JSON.stringify(coldLookups.names));
	// the other names are those the JVM links the classes of the kernels with (once for a class loader)
	assert(packageProbes(coldLookups.names).length === 0, "no package is asked as a class: " + packageProbes(coldLookups.names));
	call(first, 2);
	lookups(first, 1);

	// warm calls, one after the other
	for (var i = 3; i < 8; i++) {
		var result = call(first, i);
		assert(expected(result, i), "a warm call gives the result of the Flow: " + JSON.stringify(result));
		var warm = lookups(first, 1);
		assert(warm.total === 0, "a warm call asks its generation for no class: " + warm.total + " " + JSON.stringify(warm.names));
	}

	// warm calls on concurrent threads: each has its own cookies, none asks its generation for a class
	var THREADS = 4, CALLS = 5;
	var failures = new java.util.concurrent.ConcurrentLinkedQueue(), done = new java.util.concurrent.CountDownLatch(THREADS);
	var start = new java.util.concurrent.CountDownLatch(1);
	for (var t = 0; t < THREADS; t++) {
		(function (thread) {
			new java.lang.Thread(function () {
				var threadCx = Packages.org.mozilla.javascript.Context.enter();
				try {
					threadCx.setLanguageVersion(cx.getLanguageVersion());
					start.await();
					for (var c = 0; c < CALLS; c++) {
						var id = 100 + thread * CALLS + c;
						var frame = enter.invoke(api, threadCx);
						try {
							var scope = frameScope.get(frame);
							initializeChildScope.invoke(null, scope, shared);
							scope.__flowEngineDir = String(engineDir.getPath());
							scope.__flowSourceLayout = layout;
							scope.__flowProjectDir = String(project.getPath());
							scope.context = newContext();
							bind.invoke(null, threadCx, scope, first.loader);
							scope.__flowGenerationId = first.id;
							var run = JSON.parse(String(engine.run(JSON.stringify({ definition: definition, input: { id: String(id) }, includeTrace: false }))));
							if (run.ok !== true || !expected(run.result, id)) failures.add(id + ": " + JSON.stringify(run).substring(0, 400));
						} finally {
							frameClose.invoke(frame);
						}
					}
				} catch (e) {
					failures.add(String(e));
				} finally {
					Packages.org.mozilla.javascript.Context.exit();
					done.countDown();
				}
			}).start();
		})(t);
	}
	start.countDown();
	assert(done.await(120, java.util.concurrent.TimeUnit.SECONDS), "the concurrent calls end");
	assert(failures.isEmpty(), "each concurrent call gives its own result: " + failures);
	var concurrent = lookups(first, THREADS * CALLS);
	assert(concurrent.total === 0, "concurrent warm calls ask their generation for no class: " + concurrent.total + " " + JSON.stringify(concurrent.names));

	// another generation of the class path: its own Java kernel, looked up once, never the class of the first one
	var second = generation("lookups#2");
	assert(expected(call(second, 200), 200), "a call of another generation gives the result of the Flow");
	var switched = lookups(second, 1);
	assert(switched.names["com.convertigo.libflowengine.Rows"] === 1, "the other generation is asked for its own Java kernel: " + JSON.stringify(switched.names));
	assert(packageProbes(switched.names).length === 0, "and for no package as a class: " + packageProbes(switched.names));
	call(second, 201);
	assert(lookups(second, 1).total === 0, "then for nothing");
	assert(lookups(first, 0).total === 0, "the first generation is not asked by the calls of the other");

	print("shared-runtime-class-lookups OK (" + checks + " assertions; the cold call asked " + coldLookups.total
		+ " names, the JVM linking the kernels; the warm calls none)");
} finally {
	server.stop(0);
	executor.shutdownNow();
	files.deleteQuietly(work);
	files.deleteQuietly(project);
}
