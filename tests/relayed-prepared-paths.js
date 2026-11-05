// A call relayed by ctx.callBlock never reaches the paths that compile the properties of a node of a definition: the
// prepared runners (prepareNode, given compileExpression and compileValue) and the compiled properties of a composite
// block (compileGraphBlockProps). callBlock runs the block itself and the composite reads the relayed values first; both
// entries refuse a relayed node, so that an optimisation cannot route one there later. The relayed values reach blocks
// that have a prepared runner, and a composite block, as they are. relayed-values-lane-threads.js proves it with the
// prepared runners of a shared runtime.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-relayed-prepared-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function same(actual, expected, message) {
	assert(JSON.stringify(actual) === JSON.stringify(expected), message + ": " + JSON.stringify(actual) + " instead of " + JSON.stringify(expected));
}
function source(path) { return String(files.readFileToString(new java.io.File(engineDir, path), "UTF-8")); }
function entry(text, signature) {
	var start = text.indexOf(signature);
	assert(start >= 0, "Missing " + signature);
	return text.substring(start, start + 400);
}
try {
	// both entries refuse a relayed node before anything else
	assert(/function prepareNodeRunner\(block, node, props\) \{\s*(\/\/[^\n]*\n\s*)*if \(node && node\.__flowRelayedProps\) \{\s*raise\("RELAYED_CALL_PREPARED"/
		.test(entry(source("modules/flow-runtime-service.js"), "function prepareNodeRunner(")), "prepareNodeRunner refuses a relayed node on entry");
	assert(/function compileGraphBlockProps\(node, catalog, preparedProps\) \{\s*(\/\/[^\n]*\n\s*)*if \(node && node\.__flowRelayedProps\) \{\s*raise\("RELAYED_CALL_COMPILED"/
		.test(entry(source("modules/graph-block-runtime-service.js"), "function compileGraphBlockProps(")), "compileGraphBlockProps refuses a relayed node on entry");
	assert(/function resolveGraphBlockProps\(ctx, node, catalog\) \{\s*if \(node && node\.__flowRelayedProps\) \{\s*return relayedGraphBlockProps/
		.test(entry(source("modules/graph-block-runtime-service.js"), "function resolveGraphBlockProps(")), "A composite reads relayed values before any compiled path");

	var engine = eval(source("Engine.js"));
	function api(name, request) { return JSON.parse(engine[name](JSON.stringify(request))); }
	var set = api("blockCodeSet", { name: "proof.relayTo", code: 'const _meta = { sourceVersion: 2, runtime: "rhino", properties: {' +
		' target: { kind: "template", type: "string" }, props: { kind: "expression", type: "object" } } };\n' +
		'(function(){return {run:function(ctx,node){var p=ctx.props(node);return ctx.callBlock(String(ctx.template(p.target)),ctx.expr(p.props),{trace:false});}};}())' });
	assert(set.ok, "blockCodeSet: " + JSON.stringify(set));
	set = api("blockCodeSet", { name: "proof.composite", code: 'const _meta = {\n  "sourceVersion": 2,\n' +
		'  "properties": { "text": { "kind": "template", "type": "string" }, "value": { "kind": "expression", "type": "unknown" } },\n' +
		'  "outputs": { "out": { "type": "object" } }\n}\n\nfunction proof_composite({ input, config }) {\n  return { text: input.text, value: input.value }\n}\n' });
	assert(set.ok, "blockCodeSet: " + JSON.stringify(set));
	var marker = "CFG-7731-MARKER";
	function run(body, input) {
		var out = api("run", { flowSource: 'const _flow = { sourceVersion: 2, config: { demo: { marker: "' + marker + '" } } }\n' +
			'function Prepared({ input, config, result }) {\n' + body + '\n}\n', includeTrace: false, input: input || {} });
		assert(out.ok, "The run failed: " + JSON.stringify(out.error) + "\n" + body);
		assert(JSON.stringify(out.result).indexOf(marker) < 0, "Runtime text containing ${} stays literal: " + JSON.stringify(out.result));
		return out.result;
	}
	["x ${config.demo.marker} y", "${config.demo.marker}", "config.demo.marker"].forEach(function (t) {
		function relay(target, props) { return run('  result.v = proof.relayTo({ target: input.target, props: input.props })', { target: target, props: props }).v; }
		// blocks with a prepared runner (prepareNode), called with values
		same(relay("json.stringify", { value: { t: t } }), JSON.stringify({ t: t }), "json.stringify relayed " + JSON.stringify(t));
		same(relay("object.get", { source: { k: t }, key: "k" }), t, "object.get relayed " + JSON.stringify(t));
		same(relay("text.match", { text: t, pattern: "config" }).matched, t.indexOf("config") >= 0, "text.match relayed " + JSON.stringify(t));
		// a composite block, called with values
		same(relay("proof.composite", { text: t, value: t }), { text: t, value: t }, "A composite relayed " + JSON.stringify(t));
	});
	// the same blocks in a definition still use their prepared runners
	same(run('  result.v = json.stringify({ value: input.v })\n  result.k = object.get({ source: input.v, key: "a" })', { v: { a: 1 } }), { v: '{"a":1}', k: 1 },
		"Prepared runners of a definition");

	print("relayed-prepared-paths OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(project);
}
