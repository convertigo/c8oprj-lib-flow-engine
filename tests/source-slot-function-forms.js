// A slot takes a function body. The method shorthand of JavaScript, $$then() { ... },
// used to be dropped without a word: the check reported nothing and the run ended ok
// without running either branch. It is now the function it abbreviates, as is an arrow
// function with a block body; any other entry of a block argument object is refused.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-slot-function-forms-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(name, request) { return JSON.parse(engine[name](JSON.stringify(request))); }
	function flow(body) {
		return 'const _flow = {sourceVersion:2, inputs:{count:{type:"integer",default:2}}}\n' +
			'function Orders({ input, config, result }) {\n' + body + '\n}\n';
	}
	function run(body, count) {
		return api("run", { flowSource: flow(body), includeTrace: false, input: { count: count } });
	}
	function refused(body, code, hint) {
		var out = api("flowSourceValidate", { name: "Orders", code: flow(body) });
		var text = JSON.stringify(out);
		assert(!out.ok && text.indexOf(code) !== -1, "Expected " + code + ": " + text);
		assert(text.indexOf(hint) !== -1, "The refusal must give the fix " + hint + ": " + text);
		var executed = run(body, 2);
		assert(!executed.ok && executed.error.code === code, "The run must fail the same way: " + JSON.stringify(executed));
	}

	var methods = '  if({ $$id: "large", condition: input.count > 1, $$then() { result.size = "large" }, $$else() { result.size = "small" } })';
	var large = run(methods, 2), small = run(methods, 1);
	assert(large.ok && large.result.size === "large", "$$then() must run: " + JSON.stringify(large));
	assert(small.ok && small.result.size === "small", "$$else() must run: " + JSON.stringify(small));
	var validated = api("flowSourceValidate", { name: "Orders", code: flow(methods) });
	assert(validated.ok, "The method form is valid FlowScript: " + JSON.stringify(validated));

	var arrows = run('  if({ $$id: "large", condition: input.count > 1, $$then: () => { result.size = "large" } })', 2);
	assert(arrows.ok && arrows.result.size === "large", "An arrow block body must run: " + JSON.stringify(arrows));
	var loop = run('  forEach({ $$id: "lines", items: [1, 2, 3], $$nodes(line) { result.lines = (result.lines || 0) + 1 } })', 2);
	assert(loop.ok && loop.result.lines === 3, "forEach $$nodes() must run once per item: " + JSON.stringify(loop));
	var caught = run('  try({ $$id: "guard", $$try() { throw({ code: "ORDER_REFUSED", message: "Refused" }) }, $$catch: (error) => { result.caught = true } })', 2);
	assert(caught.ok && caught.result.caught === true, "$$try() and an arrow $$catch must run: " + JSON.stringify(caught));
	var config = run('  config.use({ http: { timeout: 30000 }, $$then() { result.timeout = config.http.timeout } })', 2);
	assert(config.ok && config.result.timeout === 30000, "A library block slot takes the method form too: " + JSON.stringify(config));
	var nested = run('  if({ $$id: "large", condition: true, $$then() { result.size = input.count > 1 ? "large" : "small" } })', 2);
	assert(nested.ok && nested.result.size === "large", "A colon inside the method body is not a key separator: " + JSON.stringify(nested));

	// Saved as written, the method form keeps running from the project.
	var saved = api("flowCodeSet", { name: "Orders", code: flow(methods), draft: false });
	assert(saved.ok, "code-set refused the method form: " + JSON.stringify(saved));
	var check = api("flowCodeCheck", { name: "Orders", draft: false });
	assert(check.ok && !(check.diagnostics || []).some(function (d) { return d.severity === "error" || d.level === "error"; }),
		"code-check of the method form: " + JSON.stringify(check));

	refused('  forEach({ $$id: "lines", items: [1, 2], $$each() { result.lines = 1 } })', "FLOW_SOURCE_ENGINE_ATTRIBUTE_UNKNOWN", "$$nodes: function () { ... }");
	refused('  if({ $$id: "large", condition: true, $$then: () => result.size })', "FLOWSCRIPT_INVALID_SLOT", "$$then: function () { ... }");
	refused('  if({ $$id: "large", condition: true, async $$then() { result.size = "large" } })', "FLOWSCRIPT_INVALID_SLOT", "$$then: function () { ... }");
	refused('  set({ path: "result.order", value: { id: 1, ...input } })', "FLOWSCRIPT_UNSUPPORTED_SYNTAX", "key: value");
	refused('  set({ path: "result.order", value() { return 1 } })', "FLOWSCRIPT_FUNCTION_IN_PROPERTY", "set has no slot");

	var trailing = run('  if({ $$id: "large", condition: true, $$then: function () { result.size = "large" }, })', 2);
	assert(trailing.ok && trailing.result.size === "large", "A trailing comma stays accepted: " + JSON.stringify(trailing));
	var shorthand = run('  local.total = 3\n  set({ path: "result.order", value: { total: local.total } })', 2);
	assert(shorthand.ok && shorthand.result.order.total === 3, "key: value entries are unchanged: " + JSON.stringify(shorthand));

	print("source-slot-function-forms OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(project);
}
