// A {{ expression }} may hold braces in its quoted strings: FlowScript compiles
// `config.authority + "{tenantid}/v2.0"` to such a template, which was left unrendered.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-template-braces-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(name, request) { return JSON.parse(engine[name](JSON.stringify(request))); }
	var input = { base: "https://login.example/", tid: "1234" };

	var run = api("run", { definition: { version: 1, nodes: [
		{ id: "exact", block: "set", props: { path: "result.exact", value: "{{ input.base + \"{tenantid}/v2.0\" }}" } },
		{ id: "mixed", block: "set", props: { path: "result.mixed", value: "[{{ input.base + '}' }}] and {{ input.tid }}" } },
		{ id: "empty", block: "set", props: { path: "result.empty", value: "{{}} stays" } }
	] }, input: input, includeTrace: false });
	assert(run.ok, "Flow failed: " + JSON.stringify(run));
	assert(run.result.exact === "https://login.example/{tenantid}/v2.0", "exact template with braces in a string: " + JSON.stringify(run.result.exact));
	assert(run.result.mixed === "[https://login.example/}] and 1234", "mixed template: " + JSON.stringify(run.result.mixed));
	assert(run.result.empty === "{{}} stays", "an empty template stays literal: " + JSON.stringify(run.result.empty));

	var code = 'const _flow = { sourceVersion: 2, inputs: { base: { type: "string" }, tid: { type: "string" } } }\n' +
		'function Braces({ input, config, result }) {\n' +
		'  local.issuer = input.base + "{tenantid}/v2.0"\n' +
		'  local.resolved = text.replace({ text: input.base + "{tenantid}/v2.0", search: "{tenantid}", replacement: input.tid })\n' +
		'  return { issuer: local.issuer, resolved: local.resolved }\n' +
		'}';
	var flow = api("run", { flowSource: code, input: input, includeTrace: false });
	assert(flow.ok, "FlowScript failed: " + JSON.stringify(flow));
	assert(flow.result.issuer === "https://login.example/{tenantid}/v2.0", "FlowScript concatenation with a braced string: " + JSON.stringify(flow.result));
	assert(flow.result.resolved === "https://login.example/1234/v2.0", "braced string in a block property: " + JSON.stringify(flow.result));

	var analysis = api("analyze", { definition: { version: 1, nodes: [
		{ id: "ref", block: "set", props: { path: "result.ref", value: "{{ input.base + \"{x}\" }}" } }
	] } });
	assert(JSON.stringify(analysis).indexOf("input.base") !== -1, "the reference inside a braced template is analyzed: " + JSON.stringify(analysis).substring(0, 400));

	print("template-braced-strings OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(project);
}
