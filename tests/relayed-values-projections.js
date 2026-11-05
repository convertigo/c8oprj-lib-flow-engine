// A list.map called with values (ctx.callBlock) reads its select as data: a select shaped like a projection block, given
// as an object, as a JSON text or as a ${JSON} template, is refused (LIST_MAP_SELECT_NOT_SOURCE), never run. A block
// running on relayed values cannot relay source (CALL_BLOCK_SOURCE_REFUSED). Projection blocks written in the
// definition of a Flow still run, nested ones included.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-relayed-projections-").toFile();
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
	function rhino(name, properties, body) {
		var set = api("blockCodeSet", { name: name, code: 'const _meta = { sourceVersion: 2, runtime: "rhino", properties: ' + properties + ' };\n' +
			'(function(){return {run:function(ctx,node){var p=ctx.props(node);' + body + '}};}())' });
		assert(set.ok, "blockCodeSet " + name + ": " + JSON.stringify(set));
	}
	rhino("proof.relayTo", '{ target: { kind: "template", type: "string" }, value: { kind: "expression", type: "unknown" }, json: { kind: "expression", type: "boolean" } }',
		'var v=ctx.expr(p.value);return ctx.callBlock(String(ctx.template(p.target)),{value:ctx.expr(p.json)===true?JSON.stringify(v):v},{trace:false});');
	rhino("proof.mapValue", '{ value: { kind: "expression", type: "unknown" } }', 'return ctx.callBlock("list.map",{items:[1,2],select:ctx.expr(p.value)},{trace:false});');
	rhino("proof.echo", '{ text: { kind: "template", type: "string" } }', 'return ctx.template(p.text);');
	rhino("proof.sourceRelay", '{ value: { kind: "expression", type: "unknown" } }', 'return ctx.callBlock("proof.echo",{text:ctx.expr(p.value)},{source:true,trace:false});');
	rhino("proof.mapText", '{ value: { kind: "template", type: "string" } }', 'return ctx.callBlock("list.map",{items:[1,2],select:ctx.template(p.value)},{trace:false});');

	var marker = "CFG-7731-MARKER";
	function attempt(body, input) {
		var out = api("run", { flowSource: 'const _flow = { sourceVersion: 2, config: { demo: { marker: "' + marker + '" } } }\n' +
			'function Projections({ input, config, result }) {\n' + body + '\n}\n', includeTrace: false, input: input || {} });
		assert(JSON.stringify(out).indexOf(marker) < 0, "Runtime text containing ${} stays literal: " + JSON.stringify(out));
		return out;
	}
	function run(body, input) {
		var out = attempt(body, input);
		assert(out.ok, "The run failed: " + JSON.stringify(out.error) + "\n" + body);
		return out.result;
	}
	function refused(body, input, code, message) {
		var out = attempt(body, input);
		assert(!out.ok && out.error && out.error.code === code, message + ": " + JSON.stringify(out));
	}

	// 1. a select shaped like a projection block, relayed to list.map, is refused
	var shaped = { __flowBlock: "text.lines", properties: { text: "x ${config.demo.marker} y" } };
	var nested = { a: [{ __flowBlock: "text.lines", properties: { text: "${config.demo.marker}" } }] };
	[shaped, nested].forEach(function (select) {
		refused('  result.v = proof.relayTo({ target: "proof.mapValue", value: input.s })', { s: select }, "LIST_MAP_SELECT_NOT_SOURCE",
			"A relayed object is refused " + JSON.stringify(select));
		refused('  result.v = proof.relayTo({ target: "proof.mapValue", value: input.s, json: true })', { s: select }, "LIST_MAP_SELECT_NOT_SOURCE",
			"A relayed JSON text is refused " + JSON.stringify(select));
		refused('  result.v = proof.relayTo({ target: "proof.mapText", value: input.s })', { s: "${" + JSON.stringify(select) + "}" }, "LIST_MAP_SELECT_NOT_SOURCE",
			"A relayed ${JSON} template is refused " + JSON.stringify(select));
	});
	// a relayed select that is not shaped like a projection block stays a value
	same(run('  result.v = proof.relayTo({ target: "proof.mapValue", value: input.s })', { s: { a: "x ${config.demo.marker} y" } }).v,
		[{ a: "x ${config.demo.marker} y" }, { a: "x ${config.demo.marker} y" }], "A relayed select stays data");

	// 2. a block running on relayed values cannot relay source
	["x ${config.demo.marker} y", "${config.demo.marker}"].forEach(function (t) {
		refused('  result.v = proof.relayTo({ target: "proof.sourceRelay", value: input.t })', { t: t }, "CALL_BLOCK_SOURCE_REFUSED",
			"A relayed block relaying source is refused " + JSON.stringify(t));
	});

	// 3. projection blocks written in the definition still run, reading the item as data, nested ones included
	same(run('  result.v = list.map({ items: input.rows, select: text.lines({ text: current.t }) })', { rows: [{ t: "a\nb" }, { t: "x ${config.demo.marker} y" }] }).v,
		[["a", "b"], ["x ${config.demo.marker} y"]], "A projection block of the definition runs");
	same(run('  result.v = list.map({ items: input.groups, select: list.map({ items: current.rows, select: text.lines({ text: current.t }) }) })',
		{ groups: [{ rows: [{ t: "a\nb" }] }, { rows: [{ t: "${config.demo.marker}" }, { t: "c" }] }] }).v,
		[[["a", "b"]], [["${config.demo.marker}"], ["c"]]], "A nested projection of the definition runs");
	// a block running on its source still relays a source node (the projection blocks of list.map)
	same(run('  result.v = proof.sourceRelay({ value: "plain" })').v, "plain", "A block running on its source relays source");

	print("relayed-values-projections OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(project);
}
