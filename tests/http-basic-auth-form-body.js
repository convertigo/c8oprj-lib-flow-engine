// http.post / http.request with HTTP Basic authentication and an object body sent as form fields.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var __flowEngineDir = engineDir;
var __flowProjectDir = String(new java.io.File(java.lang.System.getProperty("java.io.tmpdir"),
	"lib-flow-engine-http-basic-auth-test").getAbsolutePath());
var engine = eval(source);

function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

// echoes the Authorization and Content-Type headers and the body of each request
var server = com.sun.net.httpserver.HttpServer.create(new java.net.InetSocketAddress("127.0.0.1", 0), 0);
var base = "http://127.0.0.1:" + server.getAddress().getPort();
server.createContext("/", new com.sun.net.httpserver.HttpHandler({
	handle: function (exchange) {
		var body = String(new java.lang.String(exchange.getRequestBody().readAllBytes(), "UTF-8"));
		var headers = exchange.getRequestHeaders();
		var reply = JSON.stringify({
			authorization: String(headers.getFirst("Authorization") || ""),
			contentType: String(headers.getFirst("Content-Type") || ""),
			body: body
		});
		var bytes = new java.lang.String(reply).getBytes("UTF-8");
		exchange.getResponseHeaders().add("Content-Type", "application/json");
		exchange.sendResponseHeaders(200, bytes.length);
		exchange.getResponseBody().write(bytes);
		exchange.close();
	}
}));
server.start();
try {
	var form = { "Content-Type": "application/x-www-form-urlencoded" };
	var run = JSON.parse(engine.run(JSON.stringify({
		definition: { version: 1, nodes: [
			{ id: "form", block: "http.post", props: { url: base + "/token", headers: form, username: "client id", password: "{{ input.secret }}",
				body: "input.form" }, out: "result.form" },
			{ id: "json", block: "http.post", props: { url: base + "/json", body: "input.json" }, out: "result.json" },
			{ id: "explicit", block: "http.request", props: { method: "PUT", url: base + "/explicit", headers: { Authorization: "Bearer kept" },
				username: "ignored", password: "ignored" }, out: "result.explicit" },
			{ id: "get", block: "http.get", props: { url: base + "/get", username: "user", password: "" }, out: "result.get" }
		] },
		input: { form: { code: "a b+c/é", redirect_uri: "https://app.example/cb?x=1&y=2", skipped: null }, json: { code: "a b+c/é" }, secret: "s3cr:et" },
		includeTrace: false
	})));
	assertTrue(run.ok === true, "Flow failed: " + JSON.stringify(run).substring(0, 2000));
	var basic = "Basic " + String(java.util.Base64.getEncoder().encodeToString(new java.lang.String("client id:s3cr:et").getBytes("UTF-8")));
	var formEcho = run.result.form.body;
	assertTrue(formEcho.authorization === basic, "Basic authorization: " + formEcho.authorization);
	assertTrue(formEcho.contentType === "application/x-www-form-urlencoded", "form content type: " + formEcho.contentType);
	assertTrue(formEcho.body === "code=a+b%2Bc%2F%C3%A9&redirect_uri=https%3A%2F%2Fapp.example%2Fcb%3Fx%3D1%26y%3D2",
		"form fields are url encoded and missing values skipped: " + formEcho.body);
	var jsonEcho = run.result.json.body;
	assertTrue(jsonEcho.contentType === "application/json" && JSON.parse(jsonEcho.body).code === "a b+c/é" && jsonEcho.authorization === "",
		"an object body stays JSON without a form content type: " + JSON.stringify(jsonEcho));
	assertTrue(run.result.explicit.body.authorization === "Bearer kept", "an explicit Authorization header wins: " + JSON.stringify(run.result.explicit.body));
	assertTrue(run.result.get.body.authorization === "Basic " + String(java.util.Base64.getEncoder().encodeToString(new java.lang.String("user:").getBytes("UTF-8"))),
		"http.get forwards the Basic authentication: " + JSON.stringify(run.result.get.body));
} finally {
	server.stop(0);
}
print("http-basic-auth-form-body OK");
