// flow.call and use: in the input object of a FlowScript source, a quoted text is that text, even when it reads as a
// scope path ("input.name") or a number ("3"); only ${…} is evaluated there. A hand written tree follows the same
// notation (name: input.name is the text "input.name", name: "${input.name}" the value). Data of the caller, given as
// an input value or relayed by a block with ctx.callBlock, reaches the called Flow exactly as it is, whatever it holds
// (local.x, config.y, ${local.z}, {{ … }}): nothing in it is evaluated.
var engineDir = new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("nested-input-text").toFile().getAbsolutePath());
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function same(actual, expected, message) {
	assert(JSON.stringify(actual) === JSON.stringify(expected), message + ": " + JSON.stringify(actual) + " instead of " + JSON.stringify(expected));
}
function write(relative, text) {
	var file = new java.io.File(__flowProjectDir, relative);
	file.getParentFile().mkdirs();
	FileUtils.writeStringToFile(file, text, "UTF-8");
}
write("_flow/flows/Echo.flow.js", "const _flow = { sourceVersion: 2 }\nfunction Echo({ input, config, result }) {\n  result.got = input\n}\n");
var engine = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
function api(name, request) { return JSON.parse(engine[name](JSON.stringify(request))); }
function run(source, input) {
	var out = api("run", { flowSource: source, input: input || {}, includeTrace: false });
	assert(out.ok === true, "the run succeeds: " + JSON.stringify(out).substring(0, 700) + "\n" + source);
	return out.result;
}
// Every evaluation of the caller would show one of these markers.
function caller(body) {
	return "const _flow = { sourceVersion: 2, config: { y: \"LEAK-config-y\" } }\nfunction Caller({ input, config, result }) {\n" +
		"  local.x = \"LEAK-local-x\"\n  local.z = \"LEAK-local-z\"\n  local.id = 7\n" + body + "\n}\n";
}
// The same input written for flow.call and for use; each result is the input the called Flow received.
function both(input) {
	return caller([
		"  local.c = flow.call({ flow: \"Echo\", input: " + input + " })",
		"  result.call = local.c.got",
		"  local.u = use({ contract: \"echo@1\", implementation: \"Echo\", input: " + input + " })",
		"  result.use = local.u.got"
	].join("\n"));
}
function sameBoth(out, expected, message) {
	same(out.call, expected, "flow.call: " + message);
	same(out.use, expected, "use: " + message);
}

// 1. Quoted texts of the input object are texts, at every depth.
var out = run(both("{ path: \"input.name\", local: \"local.x\", cfg: 'config.y', tick: `local.z`, num: \"3\", empty: \"\"," +
	" list: [\"input.name\", \"3\", \"\", local.id], nested: { deep: [\"config.y\", { p: \"local.z\" }] } }"), { name: "Hello" });
sameBoth(out, { path: "input.name", local: "local.x", cfg: "config.y", tick: "local.z", num: "3", empty: "",
	list: ["input.name", "3", "", 7], nested: { deep: ["config.y", { p: "local.z" }] } }, "quoted texts stay texts");
assert(out.call.path.length === 10, "the quoted path is its ten characters: " + JSON.stringify(out.call.path));

// 2. Expressions of the input object are evaluated: a path, ${…} with braces inside, a number, a quoted ${ kept as text.
out = run(both("{ name: input.name, label: `id-${local.id}`, braces: `${ default(input.missing, \"{}\") }`," +
	" close: `${ \"}\" }`, count: 3, on: true, escaped: \"a ${local.x}\" }"), { name: "Hello" });
sameBoth(out, { name: "Hello", label: "id-7", braces: "{}", close: "}", count: 3, on: true, escaped: "a ${local.x}" },
	"expressions are evaluated once");

// 3. A hand written tree: a plain string of the input map is a text, ${…} the value; a whole input may be one ${…}.
["flow.call", "use"].forEach(function (block) {
	function tree(input) {
		return run(["version: 1", "nodes:", "  - id: child", "    block: " + block, "    props:",
			block === "flow.call" ? "      flow: Echo" : "      contract: echo@1\n      implementation: Echo",
			"      input:" + input, "    out: result.child", ""].join("\n"), { name: "Hello", payload: { k: "local.x" } }).child.got;
	}
	same(tree("\n        text: input.name\n        val: \"${input.name}\""), { text: "input.name", val: "Hello" },
		block + ": a tree input map follows the value notation");
	same(tree(" \"${input.payload}\""), { k: "local.x" }, block + ": a tree input given as one ${…}");
});

// 4. Data of the caller given as an input value is never evaluated, as a whole, nested or composed.
var data = { a: "local.x", b: "config.y", c: "${local.z}", d: "{{ local.z }}", e: "x ${config.y} y", f: "3", g: "" };
out = run(both("input"), data);
sameBoth(out, data, "input: input passes the data as it is");
out = run(both("{ data: input, list: [input.a, input.b, input.c, input.d], one: input.c, text: `p-${input.c}` }"), data);
sameBoth(out, { data: data, list: ["local.x", "config.y", "${local.z}", "{{ local.z }}"], one: "${local.z}", text: "p-${local.z}" },
	"data read by an expression of the input object is passed as it is");

// 5. Data relayed by a block with ctx.callBlock, as an object, inside lists and objects, or as JSON text (entity.hook):
// the JSON text is read as JSON even when the data holds ${ or {{.
var set = api("blockCodeSet", { name: "proof.relayInput", code: 'const _meta = { sourceVersion: 2, runtime: "rhino", properties: {' +
	' target: { kind: "text", type: "string" }, value: { kind: "expression", type: "unknown" } } };\n' +
	'(function(){return {run:function(ctx,node){var p=ctx.props(node),v=ctx.expr(p.value),input={text:v,list:[v],deep:{v:v}},' +
	'props=p.target==="use"?{contract:"echo@1",implementation:"Echo"}:{flow:"Echo"},json=Object.assign({},props);' +
	'props.input=input;json.input=JSON.stringify(input);' +
	'return {object:ctx.callBlock(p.target,props,{trace:false}).got,json:ctx.callBlock(p.target,json,{trace:false}).got};}};}())' });
assert(set.ok, "blockCodeSet proof.relayInput: " + JSON.stringify(set));
["local.x", "config.y", "${local.z}", "{{ local.z }}", "x ${config.y} y", "input.a", "3", ""].forEach(function (text) {
	["flow.call", "use"].forEach(function (target) {
		var relayed = run(caller("  result.r = proof.relayInput({ target: \"" + target + "\", value: input.t })"), { t: text, a: "LEAK-input-a" });
		var expected = { text: text, list: [text], deep: { v: text } };
		same(relayed.r.object, expected, target + " relayed as an object " + JSON.stringify(text));
		same(relayed.r.json, expected, target + " relayed as JSON text " + JSON.stringify(text));
	});
});

print("nested-input-text: " + checks + " checks passed");
