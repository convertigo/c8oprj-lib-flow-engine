// http.request sends with the HTTP client of the engine only: a request reaches the server once, even when the call
// fails after the write or times out; cookies live in the HttpState of the Convertigo context of the call, never in the
// store the client shares; the redirections follow the policy of the JDK client used until 0.1.114; timeouts and the
// proxy settings of the engine apply. It needs the engine classes (HttpUtils, Engine, ProxyManager): run it with the
// complete engine runtime classpath in CONVERTIGO_DEPENDENCIES_JAR.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var source = String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var __flowEngineDir = engineDir;
var project = java.nio.file.Files.createTempDirectory("lib-flow-engine-http-engine-client", []).toFile();
var __flowProjectDir = String(project);
// the Convertigo context of the runs, read by the Engine as in a server
var context = null;
var checks = 0;

function assertTrue(condition, message) {
	checks++;
	if (!condition) {
		throw new Error(message);
	}
}

var HttpUtils = Packages.com.twinsoft.convertigo.engine.util.HttpUtils;
var EngineClass = Packages.com.twinsoft.convertigo.engine.Engine;
assertTrue(typeof HttpUtils === "function" && typeof EngineClass === "function",
	"http-engine-client needs the engine classes: set CONVERTIGO_DEPENDENCIES_JAR to the complete engine runtime classpath");

// a stand-in of the Convertigo Context: its public httpState field, as the HTTP connectors and the Redis store use it
var stubs = java.nio.file.Files.createTempDirectory("lib-flow-engine-http-context", []).toFile();
var stubSource = new java.io.File(stubs, "flowtest/ContextStandIn.java");
files.writeStringToFile(stubSource, "package flowtest; public class ContextStandIn { public org.apache.commons.httpclient.HttpState httpState; }", "UTF-8");
var javacArgs = java.lang.reflect.Array.newInstance(java.lang.String, 5);
["-d", stubs.getPath(), "-cp", String(java.lang.System.getProperty("java.class.path")), stubSource.getPath()].forEach(function (arg, i) { javacArgs[i] = arg; });
assertTrue(javax.tools.ToolProvider.getSystemJavaCompiler().run(null, null, null, javacArgs) === 0, "the context stand-in compiles");
var standIns = new java.net.URLClassLoader([stubs.toURI().toURL()], java.lang.Thread.currentThread().getContextClassLoader());
var ContextStandIn = standIns.loadClass("flowtest.ContextStandIn");
function newContext() {
	return ContextStandIn.getDeclaredConstructor().newInstance(java.lang.reflect.Array.newInstance(java.lang.Object, 0));
}

// counts each request on arrival, per "METHOD path"
var received = new java.util.concurrent.ConcurrentHashMap();
function receive(key) {
	received.merge(String(key), java.lang.Integer.valueOf(1), function (a, b) { return java.lang.Integer.valueOf(Number(a) + Number(b)); });
}
function count(key) {
	var value = received.get(String(key));
	return value === null ? 0 : Number(value);
}

function reply(exchange, status, headers, body) {
	var bytes = new java.lang.String(body || "").getBytes("UTF-8");
	Object.keys(headers || {}).forEach(function (name) {
		[].concat(headers[name]).forEach(function (value) { exchange.getResponseHeaders().add(name, value); });
	});
	exchange.sendResponseHeaders(status, bytes.length === 0 ? -1 : bytes.length);
	if (bytes.length > 0) exchange.getResponseBody().write(bytes);
	exchange.close();
}

var slowMs = 1500;
var server = Packages.com.sun.net.httpserver.HttpServer.create(new java.net.InetSocketAddress("127.0.0.1", 0), 0);
var executor = java.util.concurrent.Executors.newCachedThreadPool();
server.setExecutor(executor);
var port = server.getAddress().getPort();
var base = "http://127.0.0.1:" + port;
server.createContext("/", function (exchange) {
	var method = String(exchange.getRequestMethod());
	var path = String(exchange.getRequestURI().getPath());
	var query = String(exchange.getRequestURI().getRawQuery() || "");
	var body = String(new java.lang.String(exchange.getRequestBody().readAllBytes(), "UTF-8"));
	var headers = exchange.getRequestHeaders();
	receive(method + " " + path);
	var echo = JSON.stringify({
		method: method, path: path, host: String(headers.getFirst("Host") || ""),
		cookie: String(headers.getFirst("Cookie") || ""), authorization: String(headers.getFirst("Authorization") || ""),
		contentLength: String(headers.getFirst("Content-Length") || ""), contentType: String(headers.getFirst("Content-Type") || ""),
		body: body
	});
	var json = { "Content-Type": "application/json" };
	if (path === "/slow") {
		java.lang.Thread.sleep(slowMs);
		reply(exchange, 200, json, echo);
	} else if (path === "/set") {
		// /set?name=value sets that cookie for the whole host (value URL encoded, attributes included)
		var eq = query.indexOf("=");
		reply(exchange, 200, { "Content-Type": "application/json",
			"Set-Cookie": query.substring(0, eq) + "=" + decodeURIComponent(query.substring(eq + 1)) + "; Path=/" }, echo);
	} else if (path === "/unset") {
		reply(exchange, 200, { "Content-Type": "application/json", "Set-Cookie": query + "=; Path=/; Max-Age=0" }, echo);
	} else if (/^\/redirect\/\d+$/.test(path)) {
		// /redirect/<status>?<location>, with a cookie for the next step
		reply(exchange, Number(path.split("/")[2]), { "Location": decodeURIComponent(query), "Set-Cookie": "hop=" + path.split("/")[2] + "; Path=/" }, "");
	} else if (/^\/chain\/\d+$/.test(path)) {
		var step = Number(path.split("/")[2]);
		reply(exchange, 302, { "Location": "/chain/" + (step + 1) }, "");
	} else if (path === "/nolocation") {
		reply(exchange, 302, {}, "");
	} else {
		reply(exchange, 200, json, echo);
	}
});
server.start();

// a server reading each request, counting it under name, then closing the connection without any answer
function silentServer(name) {
	var raw = new java.net.ServerSocket(0, 50, java.net.InetAddress.getByName("127.0.0.1"));
	var thread = new java.lang.Thread(function () {
		while (!raw.isClosed()) {
			try {
				var socket = raw.accept();
				var reader = new java.io.BufferedReader(new java.io.InputStreamReader(socket.getInputStream(), "ISO-8859-1"));
				var method = String(reader.readLine()).split(" ")[0];
				var length = 0;
				for (var line = reader.readLine(); line !== null && String(line) !== ""; line = reader.readLine()) {
					var header = /^content-length:\s*(\d+)/i.exec(String(line));
					if (header) length = Number(header[1]);
				}
				for (var i = 0; i < length; i++) reader.read();
				receive(method + " " + name);
				socket.close();
			} catch (e) {
				// closed at the end of the test
			}
		}
	});
	thread.setDaemon(true);
	thread.start();
	return raw;
}

// a proxy answering 407 to a request without the expected basic credentials, else its own JSON with the request line
function proxyServer(name, credentials) {
	var raw = new java.net.ServerSocket(0, 50, java.net.InetAddress.getByName("127.0.0.1"));
	var thread = new java.lang.Thread(function () {
		while (!raw.isClosed()) {
			try {
				var socket = raw.accept();
				var reader = new java.io.BufferedReader(new java.io.InputStreamReader(socket.getInputStream(), "ISO-8859-1"));
				var out = socket.getOutputStream();
				for (var requestLine = reader.readLine(); requestLine !== null; requestLine = reader.readLine()) {
					var length = 0, authorization = "";
					for (var line = reader.readLine(); line !== null && String(line) !== ""; line = reader.readLine()) {
						var header = /^([^:]+):\s*(.*)$/.exec(String(line));
						if (header && header[1].toLowerCase() === "content-length") length = Number(header[2]);
						if (header && header[1].toLowerCase() === "proxy-authorization") authorization = header[2];
					}
					for (var i = 0; i < length; i++) reader.read();
					receive(String(requestLine).split(" ")[0] + " " + name);
					var expected = credentials ? "Basic " + String(java.util.Base64.getEncoder().encodeToString(new java.lang.String(credentials).getBytes("UTF-8"))) : "";
					var text;
					if (expected && authorization !== expected) {
						text = "HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm=\"test\"\r\nContent-Length: 0\r\n\r\n";
					} else {
						var body = JSON.stringify({ proxied: String(requestLine) });
						text = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: " + body.length + "\r\n\r\n" + body;
					}
					out.write(new java.lang.String(text).getBytes("ISO-8859-1"));
					out.flush();
				}
				socket.close();
			} catch (e) {
				// closed at the end of the test
			}
		}
	});
	thread.setDaemon(true);
	thread.start();
	return raw;
}

var engine = eval(source);

function call(props, options) {
	options = options || {};
	context = options.context === undefined ? null : options.context;
	try {
		return JSON.parse(engine.run(JSON.stringify({
			definition: { version: 1, nodes: [{ id: "call", block: "http.request", props: props, out: "result.call" }] },
			input: {},
			includeTrace: false
		})));
	} finally {
		context = null;
	}
}

function errorText(run) {
	return JSON.stringify(run.error || run).substring(0, 600);
}

// (a helper: Rhino 1.7 fails to compile a numeric local compared in a direct call of a nested function)
function timed(work) {
	var started = Number(java.lang.System.currentTimeMillis());
	var run = work();
	return { run: run, ms: Number(java.lang.System.currentTimeMillis()) - started };
}

function cookieNames(header) {
	return String(header || "").split(/;\s*/).filter(function (part) { return part; }).map(function (part) { return part.split("=")[0]; }).sort().join(",");
}

// Engine.theApp of a running engine, without starting it: its httpClient4 and its proxy manager
var previousApp = EngineClass.theApp;
function startEngine(proxy) {
	var manager = new Packages.com.twinsoft.convertigo.engine.ProxyManager();
	var Settings = Packages.com.twinsoft.convertigo.engine.EnginePropertiesManager;
	manager.proxyMode = proxy ? Settings.ProxyMode.manual : Settings.ProxyMode.off;
	if (proxy) {
		manager.proxyServer = "127.0.0.1";
		manager.setProxyPort(proxy.port);
		manager.bypassDomains = proxy.bypass || "bypass.invalid";
		manager.proxyMethod = proxy.user ? Settings.ProxyMethod.basic : Settings.ProxyMethod.anonymous;
		manager.proxyUser = proxy.user || "";
		manager.proxyPassword = proxy.password || "";
	}
	var factory = Packages.sun.reflect.ReflectionFactory.getReflectionFactory();
	var app = factory.newConstructorForSerialization(EngineClass, java.lang.Class.forName("java.lang.Object").getDeclaredConstructor(java.lang.reflect.Array.newInstance(java.lang.Class, 0))).newInstance(java.lang.reflect.Array.newInstance(java.lang.Object, 0));
	app.proxyManager = manager;
	EngineClass.theApp = app;
	app.httpClient4 = HttpUtils.makeHttpClient(false);
	return app;
}
function stopEngine() {
	var app = EngineClass.theApp;
	if (app && app.httpClient4) app.httpClient4.close();
	EngineClass.theApp = previousApp;
}

var silent = silentServer("/silent");
var silentBase = "http://127.0.0.1:" + silent.getLocalPort();
var proxy = proxyServer("proxy", "proxy user:proxy secret");
try {
	// 1. one send only: an error after the write is the error of the call, for any method
	["POST", "PUT", "GET", "DELETE"].forEach(function (method) {
		var cut = call({ method: method, url: silentBase + "/silent", body: method === "GET" || method === "DELETE" ? undefined : "input" });
		java.lang.Thread.sleep(200);
		assertTrue(cut.ok === false, "a " + method + " cut after the write fails: " + errorText(cut));
		assertTrue(count(method + " /silent") === 1, "a " + method + " cut after the write is sent once, received " + count(method + " /silent"));
	});

	// and a timeout: the read timeout is honoured, and nothing is sent again
	["POST", "GET"].forEach(function (method) {
		var slow = timed(function () {
			return call({ method: method, url: base + "/slow", body: method === "POST" ? "input" : undefined, readTimeoutMs: 300 });
		});
		assertTrue(slow.run.ok === false && /timed out|timeout/i.test(errorText(slow.run)), "a " + method + " past its read timeout fails: " + errorText(slow.run));
		assertTrue(slow.ms < slowMs - 200, "the read timeout of 300 ms is honoured: " + slow.ms + " ms");
		java.lang.Thread.sleep(slowMs + 300);
		assertTrue(count(method + " /slow") === 1, "a timed out " + method + " is sent once, received " + count(method + " /slow"));
	});

	// a body, or Content-Length: 0 without one, as the JDK client sent it
	var posted = call({ method: "POST", url: base + "/echo", body: "\"plain text\"" });
	assertTrue(posted.ok && posted.result.call.body.body === "plain text" && posted.result.call.body.contentType === "",
		"a text body is sent as is, without an implicit Content-Type: " + errorText(posted));
	var empty = call({ method: "POST", url: base + "/echo" });
	assertTrue(empty.ok && empty.result.call.body.contentLength === "0", "a POST without body sends Content-Length: 0: " + errorText(empty));
	var badTimeout = call({ url: base + "/echo", connectTimeoutMs: 0 });
	assertTrue(!badTimeout.ok && /HTTP_TIMEOUT_INVALID/.test(errorText(badTimeout)), "a timeout of 0 is refused: " + errorText(badTimeout));

	// 2. cookies: kept in the HttpState of the Convertigo context, between the calls of the same (named) context
	var named = newContext(), other = newContext();
	var set = call({ url: base + "/set?sid=named" }, { context: named });
	assertTrue(set.ok && named.httpState !== null && named.httpState.getCookies().length === 1, "the cookie received is in the HttpState of the context: " + errorText(set));
	var again = call({ url: base + "/echo" }, { context: named });
	assertTrue(again.ok && again.result.call.body.cookie === "sid=named", "the next call of the same context sends it: " + errorText(again));
	var isolated = call({ url: base + "/echo" }, { context: other });
	assertTrue(isolated.ok && isolated.result.call.body.cookie === "", "another context does not: " + errorText(isolated));
	assertTrue(other.httpState !== null && other.httpState.getCookies().length === 0, "another context has its own HttpState");
	var standalone = call({ url: base + "/echo" });
	assertTrue(standalone.ok && standalone.result.call.body.cookie === "", "nor a call without Convertigo context: " + errorText(standalone));
	var requestOnly = call({ url: base + "/echo", cookies: "request" }, { context: named });
	assertTrue(requestOnly.ok && requestOnly.result.call.body.cookie === "", "nor a call with cookies request: " + errorText(requestOnly));
	var child = call({ url: base + "/echo" }, { context: new java.lang.Object() });
	assertTrue(child.ok && child.result.call.body.cookie === "", "nor a call whose context has no HttpState (a child invocation): " + errorText(child));
	// a cookie set by an HTTP connector (commons-httpclient 3) is sent; a deletion removes it
	named.httpState.addCookie(new Packages.org.apache.commons.httpclient.Cookie("127.0.0.1", "legacy", "v", "/", null, false));
	var legacy = call({ url: base + "/echo" }, { context: named });
	assertTrue(legacy.ok && cookieNames(legacy.result.call.body.cookie) === "legacy,sid", "the cookies of the HTTP connectors are shared: " + errorText(legacy));
	var unset = call({ url: base + "/unset?sid" }, { context: named });
	var afterUnset = call({ url: base + "/echo" }, { context: named });
	assertTrue(unset.ok && afterUnset.ok && afterUnset.result.call.body.cookie === "legacy=v", "Max-Age=0 deletes the cookie: " + errorText(afterUnset));
	// a domain cookie is kept with a leading dot, the only trace of its Domain attribute the Redis store of the contexts keeps
	var domainJar = newContext();
	var domainSet = call({ url: "http://localhost:" + port + "/set?d=1;%20Domain=localhost" }, { context: domainJar });
	var stored = domainSet.ok ? domainJar.httpState.getCookies() : [];
	assertTrue(stored.length === 1 && String(stored[0].getDomain()) === ".localhost" && stored[0].isDomainAttributeSpecified(),
		"a domain cookie is stored with a leading dot: " + errorText(domainSet) + " " + (stored.length ? stored[0].getDomain() : ""));
	var restored = newContext();
	restored.httpState = new Packages.org.apache.commons.httpclient.HttpState();
	restored.httpState.addCookie(new Packages.org.apache.commons.httpclient.Cookie(".localhost", "d", "1"));
	var domainSent = call({ url: "http://localhost:" + port + "/echo" }, { context: restored });
	assertTrue(domainSent.ok && domainSent.result.call.body.cookie === "d=1", "and sent again after a restore that kept only its domain: " + errorText(domainSent));
	var badCookies = call({ url: base + "/echo", cookies: "browser" });
	assertTrue(!badCookies.ok && /HTTP_COOKIES_INVALID/.test(errorText(badCookies)), "cookies takes context or request: " + errorText(badCookies));

	// never through the cookie store the client of the engine shares between all its requests
	var app = startEngine(null);
	try {
		var leak = call({ url: base + "/set?leak=1", cookies: "request" });
		var leakContext = call({ url: base + "/set?leak2=1" }, { context: newContext() });
		var otherUser = call({ url: base + "/echo" }, { context: newContext() });
		assertTrue(leak.ok && leakContext.ok && otherUser.ok && otherUser.result.call.body.cookie === "",
			"a cookie received by a call is never sent by another user's call through the shared client: " + errorText(otherUser));
		var direct = app.httpClient4.execute(new Packages.org.apache.http.client.methods.HttpGet(base + "/echo"));
		try {
			var directEcho = JSON.parse(String(Packages.org.apache.http.util.EntityUtils.toString(direct.getEntity(), "UTF-8")));
			assertTrue(directEcho.cookie === "", "the store of the client stays empty: " + JSON.stringify(directEcho));
		} finally {
			direct.close();
		}

		// a saturated pool fails at the connection timeout instead of waiting (2 connections per route by default here)
		var busy = [];
		for (var b = 0; b < 2; b++) {
			var busyThread = new java.lang.Thread(function () {
				var response = app.httpClient4.execute(new Packages.org.apache.http.client.methods.HttpGet(base + "/slow"));
				response.close();
			});
			busyThread.start();
			busy.push(busyThread);
		}
		java.lang.Thread.sleep(300);
		var saturated = timed(function () { return call({ url: base + "/pooled", connectTimeoutMs: 300 }); });
		assertTrue(!saturated.run.ok && /pool|timeout/i.test(errorText(saturated.run)), "a saturated pool fails: " + errorText(saturated.run));
		assertTrue(saturated.ms < slowMs - 500, "after the connection timeout: " + saturated.ms + " ms");
		assertTrue(count("GET /pooled") === 0, "and sends nothing");
		busy.forEach(function (thread) { thread.join(); });
	} finally {
		stopEngine();
	}

	// 3. redirections, as the JDK client: cookies of each step, POST to GET on 302, method and body kept on 307
	var jar = newContext();
	var r302 = call({ method: "POST", url: base + "/redirect/302?" + encodeURIComponent("/echo"), body: "\"payload\"" }, { context: jar });
	assertTrue(r302.ok && r302.result.call.status === 200 && r302.result.call.body.method === "GET" && r302.result.call.body.body === ""
		&& r302.result.call.body.cookie === "hop=302", "a POST redirected by 302 becomes a GET with the cookie of the redirection: " + errorText(r302));
	var r307 = call({ method: "POST", url: base + "/redirect/307?" + encodeURIComponent("/echo"), body: "\"payload\"", cookies: "request" });
	assertTrue(r307.ok && r307.result.call.body.method === "POST" && r307.result.call.body.body === "payload" && r307.result.call.body.cookie === "hop=307",
		"307 keeps the method and the body; cookies request keeps the cookie for the redirection: " + errorText(r307));
	var cross = call({ url: base + "/redirect/302?" + encodeURIComponent("http://localhost:" + port + "/echo"), username: "user", password: "secret" }, { context: newContext() });
	assertTrue(cross.ok && cross.result.call.body.host.indexOf("localhost") === 0 && cross.result.call.body.authorization === "" && cross.result.call.body.cookie === "",
		"another origin gets neither the Authorization nor the cookies of the first host: " + errorText(cross));
	var same = call({ url: base + "/redirect/301?" + encodeURIComponent("/echo"), username: "user", password: "secret" });
	assertTrue(same.ok && same.result.call.body.authorization.indexOf("Basic ") === 0, "the same origin keeps the Authorization: " + errorText(same));
	var chain = call({ url: base + "/chain/1" });
	assertTrue(chain.ok && chain.result.call.status === 302 && chain.result.call.headers.location === "/chain/6" && count("GET /chain/5") === 1 && count("GET /chain/6") === 0,
		"at most 5 responses, the fifth returned as is: " + errorText(chain));
	var noLocation = call({ url: base + "/nolocation" });
	assertTrue(noLocation.ok && noLocation.result.call.status === 302, "a redirection without Location is returned: " + errorText(noLocation));

	// 4. a parallel chunk uses the HttpState of its caller (the lanes of this standalone runtime run on the calling thread)
	var lanes = newContext();
	call({ url: base + "/set?lane=1" }, { context: lanes });
	context = lanes;
	try {
		var parsed = JSON.parse(engine.flowSourceValidate(JSON.stringify({ code: 'const _flow={sourceVersion:2,inputs:{url:{type:"string"},items:{type:"array"}}}\n'
			+ 'function Lanes({input,result}){\nlocal.url=input.url\n'
			+ 'result.cookies=forEachChunk({source:input.items,size:1,parallel:2,$$each:function({chunk}){\n'
			+ 'local.seen=http.get({url:parent.url})\nreturn local.seen.body.cookie\n'
			+ '},$$reduce:function({acc,value}){\nreturn acc===null?value:acc+"|"+value\n}})\n}' })));
		assertTrue(parsed.ok, "the parallel Flow parses: " + JSON.stringify(parsed.error || parsed.errors));
		var parallel = JSON.parse(engine.run(JSON.stringify({ flowSource: parsed.source, input: { url: base + "/echo", items: [1, 2, 3] }, includeTrace: false })));
		assertTrue(parallel.ok && parallel.result.cookies === "lane=1|lane=1|lane=1", "the chunks send the cookies of the context of the call: " + errorText(parallel));
	} finally {
		context = null;
	}

	// 5. an interrupted thread (a parallel chunk stopped after a failed one) sends nothing
	java.lang.Thread.currentThread().interrupt();
	var interrupted;
	try {
		interrupted = call({ method: "POST", url: base + "/interrupted", body: "input" });
	} finally {
		java.lang.Thread.interrupted();
	}
	assertTrue(!interrupted.ok && /FLOW_EXECUTION_CANCELLED/.test(errorText(interrupted)), "an interrupted call fails: " + errorText(interrupted));
	assertTrue(count("POST /interrupted") === 0, "and is not sent, received " + count("POST /interrupted"));

	// 6. the proxy settings of the engine: manual mode with basic authentication, bypassed hosts go direct
	startEngine({ port: proxy.getLocalPort(), user: "proxy user", password: "proxy secret", bypass: "127.0.0.1" });
	try {
		var proxied = call({ method: "POST", url: "http://upstream.invalid/api?x=1", body: "input" });
		assertTrue(proxied.ok && proxied.result.call.body.proxied === "POST http://upstream.invalid/api?x=1 HTTP/1.1",
			"a call goes through the proxy of the engine: " + errorText(proxied));
		assertTrue(count("POST proxy") === 2, "after the 407 challenge, with the proxy credentials of the engine: " + count("POST proxy"));
		var bypassed = call({ url: base + "/bypassed" });
		assertTrue(bypassed.ok && bypassed.result.call.body.path === "/bypassed" && count("GET /bypassed") === 1, "a bypassed host is called directly: " + errorText(bypassed));
	} finally {
		stopEngine();
	}
} finally {
	EngineClass.theApp = previousApp;
	server.stop(0);
	executor.shutdownNow();
	silent.close();
	proxy.close();
	standIns.close();
	files.deleteQuietly(stubs);
	files.deleteQuietly(project);
}
print("http-engine-client OK (" + checks + " checks)");
