// Real Engine: no mocked parser, descriptors, analysis or execution service.
var engineDir = new java.io.File(arguments[0] || "_flow").getAbsoluteFile();
var __flowEngineDir = String(engineDir);
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("flow-destination-contract-"));
var engine = eval(String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
function assert(value, message) { if (!value) throw new Error(message); }
function invoke(method, request) { return JSON.parse(engine[method](JSON.stringify(request))); }
function source(line) { return 'const _flow={sourceVersion:2};\nfunction Proof(){\n' + line + '\n}'; }
function run(nodes, extra) {
	return invoke("run", Object.assign({ definition: { flow: { sourceVersion: 2 }, nodes: nodes }, includeTrace: false }, extra || {}));
}
var set = function (path, value) { return { block: "set", props: { path: path, value: value } }; };
var good = run([set("local.answer", 42), set("result.answer", "{{ local.answer }}")]);
assert(good.ok && good.result.answer === 42, "Valid named destinations: " + JSON.stringify(good));
var invalid = ["input.value", "config.value", "request.value", "current.value", "trace.probes", "local", "local..x",
	"local.items[0]", "local.dict[{{ input.key }}].value", "{{ input.target }}", "{{ local.target }}", "local.__proto__.polluted", false, 1, {}];
invalid.forEach(function (path) {
	[false, true].forEach(function (profile) {
		var result = run([set(path, "bad")], { profile: profile, input: { target: "result.bad" } });
		assert(!result.ok && result.error.code === "INVALID_DESTINATION", "Runtime rejects " + JSON.stringify(path) + ": " + JSON.stringify(result));
	});
	var analysis = invoke("analyze", { flowSource: source('set({$$id:"invalid",path:' + JSON.stringify(path) + ',value:1});') });
	assert(!analysis.ok && analysis.error.code === "INVALID_DESTINATION" || analysis.ok && analysis.errors.some(function (error) { return error.code === "INVALID_DESTINATION" && error.property === "path"; }),
		"Analysis identifies destination property: " + JSON.stringify(analysis));
});
// The guard must run before an effectful block, and before the prepared hook.
var marker = new java.io.File(__flowProjectDir, "must-not-be-written.txt");
var code = 'const _meta={sourceVersion:2,runtime:"rhino",properties:{target:{kind:"path",mode:"write"}}};\n'
	+ '(function(){return {run:function(ctx,node){Packages.org.apache.commons.io.FileUtils.writeStringToFile(new java.io.File('
	+ JSON.stringify(String(marker)) + '),"bad","UTF-8");return "ran";}};}())';
assert(invoke("blockCodeSet", { name: "proof.effect", code: code }).ok, "Create private effect fixture");
[{ props: { target: "input.value" } }, { props: {}, out: "config.value" }].forEach(function (attributes) {
	var result = run([Object.assign({ block: "proof.effect" }, attributes)]);
	assert(!result.ok && result.error.code === "INVALID_DESTINATION" && !marker.exists(), "Reject before side effect: " + JSON.stringify(result));
});
var caller = 'const _meta={sourceVersion:2,runtime:"rhino"};\n'
	+ '(function(){return {run:function(ctx){return ctx.callBlock("proof.effect",{}, {out:"input.value"});}};}())';
assert(invoke("blockCodeSet", { name: "proof.caller", code: caller }).ok, "Create private call fixture");
var called = run([{ block: "proof.caller", props: {} }]);
assert(!called.ok && called.error.code === "INVALID_DESTINATION" && !marker.exists(), "ctx.callBlock validates before side effect: " + JSON.stringify(called));
// Internal trace writes must continue working despite read-only public trace.
var probe = run([{ block: "debug.probe", props: { value: 7 } }], { includeTrace: true });
assert(probe.ok && probe.trace.probes[0].value === 7, "Internal trace: " + JSON.stringify(probe));
// Dialect 2 business out is not confused with the engine destination.
assert(invoke("blockCodeSet", { name: "proof.business", code: 'const _meta={sourceVersion:2,runtime:"rhino",properties:{out:{kind:"value",type:"string"}}};\n'
	+ '(function(){return {run:function(ctx,node){return ctx.props(node).out;}};}())' }).ok, "Create business out fixture");
var business = run([{ block: "proof.business", props: { out: "ordinary text" }, out: "result.value" }]);
assert(business.ok && business.result.value === "ordinary text", "Business out stays independent: " + JSON.stringify(business));
var legacy = invoke("run", { definition: { nodes: [{ block: "set", path: "result.legacy", value: 3 }] }, includeTrace: false });
assert(legacy.ok && legacy.result.legacy === 3, "Legacy dialect supported");
var flow = source('set({path:"local.answer",value:1});\nnumber.add({$$id:"target",left:1,right:2,$$out:"result.sum"});');
var context = invoke("context", { flowSource: flow, node: "target", property: "$$out" });
assert(context.ok && context.mode === "write" && JSON.stringify(context.include) === '["local","result"]', "Backend context filters destination scopes: " + JSON.stringify(context));
assert(context.destinationPolicy.syntax === "named-path" && context.scopes.local.paths.some(function (entry) { return entry.path === "local.answer"; }), "Destination metadata and known names");
var read = invoke("context", { flowSource: flow, node: "target", property: "left" });
assert(read.ok && read.include.indexOf("input") >= 0 && !read.destinationPolicy, "Value picker remains readable");
print("destination-runtime-contract OK: interpreter, prepared writes, analysis, context, callBlock, effects and v1/v2");
