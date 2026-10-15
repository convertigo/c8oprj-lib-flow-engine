// text.urlEncode (values placed in links) and the HTML templates under _flow/resources that
// asset.read may serve (the emails a Flow sends).
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var __flowEngineDir = engineDir;
var projectDir = new java.io.File(java.lang.System.getProperty("java.io.tmpdir"), "lib-flow-engine-urlencode-test");
var __flowProjectDir = String(projectDir.getAbsolutePath());
var engine = eval(source);

function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

function run(nodes, input) {
	return JSON.parse(engine.run(JSON.stringify({ definition: { version: 1, nodes: nodes }, input: input || {}, includeTrace: false })));
}

function one(block, props) {
	var out = run([{ id: "it", block: block, props: props, out: "result.it" }]);
	assertTrue(out.ok === true, block + " failed: " + JSON.stringify(out).substring(0, 1000));
	return out.result.it;
}

assertTrue(one("text.urlEncode", { text: "a b&c=d/é?" }) === "a%20b%26c%3Dd%2F%C3%A9%3F", "percent-encoding of a query value");
assertTrue(one("text.urlEncode", { text: "safe-._~!*'()" }) === "safe-._~!*'()", "unreserved characters are kept");
assertTrue(one("text.urlEncode", { text: "" }) === "", "empty text");

// an HTML template under _flow/resources is a backend asset
var emails = new java.io.File(projectDir, "_flow/resources/emails");
emails.mkdirs();
Packages.org.apache.commons.io.FileUtils.writeStringToFile(new java.io.File(emails, "welcome.html"), "<p>Hello {name}</p>", "UTF-8");
var html = one("asset.read", { path: "_flow/resources/emails/welcome.html" });
assertTrue(html === "<p>Hello {name}</p>", "asset.read serves an HTML template: " + JSON.stringify(html));
var refused = run([{ id: "it", block: "asset.read", props: { path: "_flow/resources/emails/welcome.exe" }, out: "result.it" }]);
assertTrue(refused.ok === false && refused.error.code === "RESOURCE_PATH_NOT_ALLOWED", "other extensions stay refused: " + JSON.stringify(refused).substring(0, 300));
print("text.urlEncode and HTML resources: ok");
