// number.format (14/11): the server (Java NumberFormat) writes the same text as the page (Intl.NumberFormat, checked by
// number-format-browser.cjs) for the cases of fixtures/number-format-cases.json; the names agents guessed for it
// (currency.format, text.format...) and number.sum lead to the existing blocks.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var source = String(FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var __flowEngineDir = engineDir;
var __flowProjectDir = String(new java.io.File(java.lang.System.getProperty("java.io.tmpdir"), "lib-flow-engine-number-format-test-" + java.util.UUID.randomUUID()).getAbsolutePath());
var engine = eval(source);
function assert(condition, message) { if (!condition) throw new Error(message); }
var fixture = JSON.parse(String(FileUtils.readFileToString(new java.io.File(engineDir, "../tests/fixtures/number-format-cases.json"), "UTF-8")));
function run(input, context) {
	var request = { definition: { version: 1, nodes: [{ id: "f", block: "number.format", props: input, out: "result.text" }] }, includeTrace: false };
	if (context && context.configDateLocale) {
		FileUtils.writeStringToFile(new java.io.File(__flowProjectDir, "_flow/engine.yaml"), JSON.stringify({ version: 1, config: { date: { locale: context.configDateLocale } } }), "UTF-8");
		request.projectDir = __flowProjectDir;
	}
	try { return JSON.parse(engine.run(JSON.stringify(request))); }
	finally { if (context && context.configDateLocale) FileUtils.deleteQuietly(new java.io.File(__flowProjectDir, "_flow/engine.yaml")); }
}
fixture.cases.forEach(function (item) {
	var r = run(item.input, item.context);
	assert(r.ok === true && r.result.text === item.expected,
		"number.format " + JSON.stringify(item.input) + " gives " + JSON.stringify(r.ok ? r.result.text : r.error) + ", expected " + JSON.stringify(item.expected));
});
fixture.errors.forEach(function (item) {
	var r = run(item.input);
	assert(r.ok === false && r.error && r.error.code === item.error, "number.format " + JSON.stringify(item.input) + " refuses with " + item.error + ": " + JSON.stringify(r.error));
});
FileUtils.deleteQuietly(new java.io.File(__flowProjectDir));
// In FlowScript
var script = JSON.parse(engine.run(JSON.stringify({ project: "App", includeTrace: false, input: {}, flowSource:
	"const _flow = { sourceVersion: 2 }\n\nfunction F({ input, result }) {\n  local.text = number.format({ value: 12500, style: \"currency\", currency: \"USD\", locale: \"en-US\", maximumFractionDigits: 0 })\n  return { amount: local.text }\n}\n" })));
assert(script.ok && script.result.amount === "$12,500", "number.format in FlowScript: " + JSON.stringify(script));
// The catalog: dual target, its search words
var catalog = JSON.parse(engine.catalog(JSON.stringify({ q: "format number currency locale amount", detail: "full" })));
var block = catalog.blocks.filter(function (b) { return b.blockId === "number.format"; })[0];
assert(block && block.targets.join(",") === "backend,frontend" && block.implementations.frontend.file === "format.browser.js" && block.outputs.out.type === "string",
	"the catalog finds number.format with its two targets: " + JSON.stringify(catalog.blocks.map(function (b) { return b.blockId; }).slice(0, 5)));
// The guessed names lead to the existing block
[["currency.format", "number.format"], ["text.format", "number.format"], ["number.sum", "list.sum"]].forEach(function (pair) {
	var r = JSON.parse(engine.run(JSON.stringify({ project: "App", includeTrace: false, input: {}, flowSource:
		"const _flow = { sourceVersion: 2 }\n\nfunction F({ input, result }) {\n  local.x = " + pair[0] + "({ value: 1 })\n  return local.x\n}\n" })));
	var text = JSON.stringify(r), best = /"bestBlock":"([^"]*)","bestScore":(\d+)/.exec(text) || /"bestBlock":"([^"]*)"/.exec(text);
	assert(!r.ok && text.indexOf("UNKNOWN_BLOCK") >= 0 && best && best[1] === pair[1] && text.indexOf('"recommendation":"existing"') >= 0,
		pair[0] + " points to " + pair[1] + " as the existing block to use: " + text.substring(0, 700));
});
print("number-format-block OK");
