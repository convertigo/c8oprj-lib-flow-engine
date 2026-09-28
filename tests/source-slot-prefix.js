// Slots are engine attributes written $$<slot>. A plain key is a business
// property: `config.use({ then: function () {...} })` used to store the body as
// text and never run it. A function given to a plain key is now an error.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-slot-prefix-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(name, request) { return JSON.parse(engine[name](JSON.stringify(request))); }
	function flow(body) { return 'const _flow = {sourceVersion:2}\nfunction Slots({ input, config, result }) {\n' + body + '\n}'; }

	var prefixed = api("run", { flowSource: flow('  config.use({ http: { timeout: 30000 }, $$then: function () { result.t = config.http.timeout } })'), includeTrace: false });
	assert(prefixed.ok && prefixed.result.t === 30000, "$$then must run: " + JSON.stringify(prefixed));

	var plain = api("run", { flowSource: flow('  config.use({ http: { timeout: 30000 }, then: function () { result.t = config.http.timeout } })'), includeTrace: false });
	assert(!plain.ok && plain.error.code === "FLOWSCRIPT_SLOT_WITHOUT_ENGINE_PREFIX", "A plain slot key must fail: " + JSON.stringify(plain));
	assert(plain.error.hint.indexOf("$$then: function") !== -1, "The hint must show the $$ spelling: " + JSON.stringify(plain.error));
	var validated = api("flowSourceValidate", { name: "Slots", code: flow('  if({ condition: true, then: function () { result.a = 1 } })') });
	assert(!validated.ok && JSON.stringify(validated).indexOf("FLOWSCRIPT_SLOT_WITHOUT_ENGINE_PREFIX") !== -1, "if then: must fail too: " + JSON.stringify(validated));

	var business = api("flowSourceValidate", { name: "Slots", code: flow('  set({ path: "result.a", value: function () { return 1 } })') });
	assert(!business.ok && JSON.stringify(business).indexOf("FLOWSCRIPT_FUNCTION_IN_PROPERTY") !== -1, "A function business value must fail: " + JSON.stringify(business));
	var arrow = api("flowSourceValidate", { name: "Slots", code: flow('  forEach({ items: input.items, nodes: () => { result.a = 1 } })') });
	assert(!arrow.ok && JSON.stringify(arrow).indexOf("FLOWSCRIPT_SLOT_WITHOUT_ENGINE_PREFIX") !== -1, "An arrow body on a plain slot key must fail: " + JSON.stringify(arrow));

	// A business property that shares a slot name keeps working with a value.
	var holderCode = 'const _meta = {sourceVersion:2, runtime:"rhino", properties:{then:{kind:"value",type:"array"}}, slots:{then:{}}}\n' +
		'(function(){return {run:function(ctx,node){ctx.write("result.business",ctx.props(node).then);ctx.runNodes(node.then);}};}())';
	assert(api("blockCodeSet", { name: "proof.holder", code: holderCode }).ok, "Holder fixture failed");
	var both = api("run", { flowSource: flow('  proof.holder({ then: [1, 2], $$then: function () { result.ran = true } })'), includeTrace: false });
	assert(both.ok && both.result.ran === true && both.result.business.length === 2, "Business then plus $$then: " + JSON.stringify(both));
	var holderPlain = api("run", { flowSource: flow('  proof.holder({ then: function () { result.ran = true } })'), includeTrace: false });
	assert(!holderPlain.ok && holderPlain.error.code === "FLOWSCRIPT_SLOT_WITHOUT_ENGINE_PREFIX", "Business-named slot given a function: " + JSON.stringify(holderPlain));

	var text = api("run", { flowSource: flow('  result.s = "function () { not code }"'), includeTrace: false });
	assert(text.ok && text.result.s === "function () { not code }", "A quoted string starting with function stays a value: " + JSON.stringify(text));

	print("source-slot-prefix OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(project);
}
