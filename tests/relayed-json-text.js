// A JSON object sent where a text is expected. A Flow input declared as text receives the JSON text of an object (the
// input conversion of the engine); that text stays a text in a template property and inside the values a block
// relays. Compatibility, kept for the callers that pass data as literal notation: a JSON text given whole to an
// expression property of a relayed call, or a template made of one ${...} holding a JSON literal, is read as its value,
// never evaluated; the typed checks of the block that receives it decide whether that value is accepted.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-relayed-json-text-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function same(actual, expected, message) {
	assert(JSON.stringify(actual) === JSON.stringify(expected), message + ": " + JSON.stringify(actual) + " instead of " + JSON.stringify(expected));
}
try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(name, request) { return JSON.parse(engine[name](JSON.stringify(request))); }
	function block(name, code) {
		var set = api("blockCodeSet", { name: name, code: code });
		assert(set.ok, "blockCodeSet " + name + ": " + JSON.stringify(set));
	}
	var properties = '{ text: { kind: "template", type: "string" }, expr: { kind: "expression", type: "string" }, obj: { kind: "expression", type: "object" } }';
	block("proof.textSource", 'const _meta = {\n  "sourceVersion": 2,\n  "properties": ' + properties + ',\n' +
		'  "outputs": { "out": { "type": "object" } }\n}\n\n' +
		'function proof_textSource({ input, config }) {\n  return { text: input.text, expr: input.expr, obj: input.obj }\n}\n');
	block("proof.textRhino", 'const _meta = { sourceVersion: 2, runtime: "rhino", properties: ' + properties + ' };\n' +
		'(function(){return {run:function(ctx,node){var p=ctx.props(node);' +
		'return {text:ctx.template(p.text),expr:ctx.expr(p.expr),obj:ctx.expr(p.obj),render:ctx.render(p.text),input:ctx.input({value:p.text})};}};}())');
	block("proof.textRelay", 'const _meta = { sourceVersion: 2, runtime: "rhino", properties: { target: { kind: "template", type: "string" },' +
		' value: { kind: "expression", type: "unknown" } } };\n' +
		'(function(){return {run:function(ctx,node){var p=ctx.props(node),v=ctx.expr(p.value);' +
		'return ctx.callBlock(String(ctx.template(p.target)),{text:v,expr:v,obj:{title:v,list:[v]}},{trace:false});}};}())');
	function run(body, input) {
		return api("run", { flowSource: 'const _flow = { sourceVersion: 2, inputs: { title: { type: "string" } } }\n' +
			'function JsonText({ input, config, result }) {\n' + body + '\n}\n', includeTrace: false, input: input || {} });
	}
	var body = '  result.source = proof.textRelay({ target: "proof.textSource", value: input.title })\n' +
		'  result.rhino = proof.textRelay({ target: "proof.textRhino", value: input.title })';

	// an object sent for an input declared as text arrives as its JSON text
	[[{ a: 1 }, '{"a":1}'], [[1, 2], "[1,2]"], [{ op: "in", value: ["x"] }, '{"op":"in","value":["x"]}']].forEach(function (pair) {
		var out = run(body, { title: pair[0] });
		assert(out.ok, "The run failed: " + JSON.stringify(out));
		same([out.result.source.text, out.result.source.obj, out.result.rhino.text, out.result.rhino.render],
			[pair[1], { title: pair[1], list: [pair[1]] }, pair[1], pair[1]], "An object sent for a text input is its JSON text " + JSON.stringify(pair[0]));
	});

	// a JSON text stays the text in a template property and inside relayed values
	['{"a":1}', '[1,2]', '{"op":"in","value":["x"]}', '"quoted"', "123", "${{\"a\":1}}"].forEach(function (text) {
		var out = run(body, { title: text });
		assert(out.ok, "The run failed: " + JSON.stringify(out));
		same([out.result.source.text, out.result.source.obj, out.result.rhino.text, out.result.rhino.obj, out.result.rhino.input],
			[text === "${{\"a\":1}}" ? { a: 1 } : text, { title: text, list: [text] }, text === "${{\"a\":1}}" ? { a: 1 } : text, { title: text, list: [text] },
				text === "${{\"a\":1}}" ? { a: 1 } : text], "A JSON text given as data " + JSON.stringify(text));
	});

	// compatibility: a JSON text given whole to an expression property of a relayed call is read as its value
	var read = run(body, { title: '{"a":1}' }).result;
	same([read.source.expr, read.rhino.expr], [{ a: 1 }, { a: 1 }], "An expression property reads a relayed JSON text as its value");
	same([run(body, { title: "123" }).result.source.expr, run(body, { title: "plain" }).result.source.expr], [123, "plain"],
		"Only a JSON text is read; any other text stays the text");

	print("relayed-json-text OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(project);
}
