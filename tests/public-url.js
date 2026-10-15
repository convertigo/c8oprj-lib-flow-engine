// The trusted public URL of the server (public-url library and endpoint.current): the
// configured URL first, then the environment, the engine endpoint, a non-local server URL,
// the request URL in the Studio only; never the host of a request on a server.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var __flowEngineDir = engineDir;
var __flowProjectDir = String(new java.io.File(java.lang.System.getProperty("java.io.tmpdir"),
	"lib-flow-engine-public-url-test").getAbsolutePath());
var engine = eval(source);
var library = eval(String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "lib/public-url.js"), "UTF-8")));

function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

function pick(settings) {
	return library.publicUrl(settings);
}

var configured = pick({ configured: "https://forms.example.com/convertigo", environment: "https://env.example.com/", endpoint: "https://endpoint.example.com" });
assertTrue(configured.url === "https://forms.example.com/convertigo/" && configured.source === "configuration", "the configured URL wins, with a trailing slash: " + JSON.stringify(configured));
var environment = pick({ configured: " ", environment: "https://env.example.com/", endpoint: "https://endpoint.example.com" });
assertTrue(environment.url === "https://env.example.com/" && environment.source === "CONVERTIGO_PUBLIC_URL", "then the environment: " + JSON.stringify(environment));
var unresolved = pick({ configured: "%CONVERTIGO_PUBLIC_URL%", environment: "", endpoint: "https://endpoint.example.com" });
assertTrue(unresolved.source === "Convertigo Server endpoint URL", "an unresolved %NAME% is not a value: " + JSON.stringify(unresolved));
var localUrl = pick({ localUrl: "https://tenant.c8ocloud.example/convertigo" });
assertTrue(localUrl.url === "https://tenant.c8ocloud.example/convertigo/" && localUrl.source === "Convertigo Server local URL", "a non-local server URL: " + JSON.stringify(localUrl));
assertTrue(pick({ localUrl: "http://localhost:28080/convertigo" }) === null, "a local server URL is not public");
assertTrue(pick({ localUrl: "http://127.0.0.1:28080/convertigo" }) === null, "a loopback server URL is not public");
assertTrue(pick({ localUrl: "http://[::1]:28080/convertigo" }) === null, "an IPv6 loopback server URL is not public");
assertTrue(pick({ localUrl: "http://studio.localhost/convertigo" }) === null, "a .localhost server URL is not public");
var studio = pick({ studio: true, requestUrl: "http://localhost:18080/convertigo" });
assertTrue(studio.url === "http://localhost:18080/convertigo/" && studio.source === "Studio request", "the request URL in the Studio: " + JSON.stringify(studio));
assertTrue(pick({ studio: false, requestUrl: "https://evil.example/convertigo" }) === null, "never the request URL on a server");
assertTrue(pick({}) === null, "nothing trusted gives null");
var invalid;
try {
	pick({ configured: "ftp://files.example.com" });
} catch (e) {
	invalid = e;
}
assertTrue(invalid && invalid.code === "PUBLIC_URL_INVALID", "an invalid configured URL is an error: " + JSON.stringify(invalid));
assertTrue(library.isLocal("http://localhost/x") && !library.isLocal("https://example.com/x"), "isLocal");

function run(nodes, input) {
	return JSON.parse(engine.run(JSON.stringify({ definition: { version: 1, nodes: nodes }, input: input || {}, includeTrace: false })));
}
var withConfiguration = run([{ id: "it", block: "endpoint.current", props: { publicUrl: "https://forms.example.com/convertigo" }, out: "result.it" }]);
assertTrue(withConfiguration.ok === true && withConfiguration.result.it.publicUrl === "https://forms.example.com/convertigo/" && withConfiguration.result.it.publicUrlSource === "configuration",
	"endpoint.current exposes the configured public URL: " + JSON.stringify(withConfiguration).substring(0, 600));
var without = run([{ id: "it", block: "endpoint.current", props: {}, out: "result.it" }]);
assertTrue(without.ok === true && typeof without.result.it.publicUrl === "string" && without.result.it.convertigoUrl, "endpoint.current keeps its URLs without a configured public URL: " + JSON.stringify(without).substring(0, 600));
var bad = run([{ id: "it", block: "endpoint.current", props: { publicUrl: "forms.example.com" }, out: "result.it" }]);
assertTrue(bad.ok === false && bad.error.code === "PUBLIC_URL_INVALID", "an invalid configured URL is a Flow error: " + JSON.stringify(bad).substring(0, 400));
print("public URL: ok");
