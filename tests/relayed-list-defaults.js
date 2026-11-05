// list.map, list.sort and list.filter called with values (ctx.callBlock). Without select, list.map gives the items
// themselves; without by, list.sort sorts the items themselves: their default, current, is read for each item, never
// evaluated once for the call. The where of a relayed list.filter is data: a value gives the same answer for every
// item, a text is refused (LIST_FILTER_WHERE_NOT_SOURCE) instead of being read as a comparison of scope paths. Called
// from a definition, the three blocks keep their behaviour.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-relayed-list-defaults-").toFile();
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
	var set = api("blockCodeSet", { name: "proof.listRelay", code: 'const _meta = { sourceVersion: 2, runtime: "rhino", properties: {' +
		' target: { kind: "template", type: "string" }, items: { kind: "expression", type: "array" }, extra: { kind: "expression", type: "object" } } };\n' +
		'(function(){return {run:function(ctx,node){var p=ctx.props(node),args={items:ctx.expr(p.items)},extra=ctx.expr(p.extra)||{};' +
		'Object.keys(extra).forEach(function(k){args[k]=extra[k];});return ctx.callBlock(String(ctx.template(p.target)),args,{trace:false});}};}())' });
	assert(set.ok, "blockCodeSet: " + JSON.stringify(set));

	var marker = "CFG-7731-MARKER";
	function attempt(body, input) {
		var out = api("run", { flowSource: 'const _flow = { sourceVersion: 2, config: { demo: { marker: "' + marker + '" } } }\n' +
			'function ListDefaults({ input, config, result }) {\n' + body + '\n}\n', includeTrace: false, input: input || {} });
		assert(JSON.stringify(out).indexOf(marker) < 0, "Runtime text containing ${} stays literal: " + JSON.stringify(out));
		return out;
	}
	function run(body, input) {
		var out = attempt(body, input);
		assert(out.ok, "The run failed: " + JSON.stringify(out.error) + "\n" + body);
		return out.result;
	}
	function relay(target, items, extra) {
		return run('  result.v = proof.listRelay({ target: input.target, items: input.items, extra: input.extra })',
			{ target: target, items: items, extra: extra || {} }).v;
	}

	// list.map without select: the items themselves
	var items = [{ a: "x ${config.demo.marker} y" }, 2, "${config.demo.marker}", null];
	same(relay("list.map", items), items, "A relayed list.map without select gives the items");
	same(relay("list.map", []), [], "A relayed list.map of no item");
	// list.sort without by: the items themselves are the keys
	same(relay("list.sort", [3, 1, 2]), [1, 2, 3], "A relayed list.sort without by sorts the items");
	same(relay("list.sort", ["b", "${config.demo.marker}", "a"]), ["${config.demo.marker}", "a", "b"], "A relayed list.sort sorts texts as they are");
	same(relay("list.sort", [1, 3, 2], { direction: "desc" }), [3, 2, 1], "A relayed list.sort keeps its direction");
	// list.filter: a relayed where is data
	var rows = [{ v: 1 }, { v: 2 }];
	same(relay("list.filter", rows), rows, "A relayed list.filter without where keeps every item");
	same(relay("list.filter", rows, { where: true }), rows, "A relayed where true keeps every item");
	same(relay("list.filter", rows, { where: false }), [], "A relayed where false keeps no item");
	["config.demo.marker == '" + marker + "'", "current.v > 1", "true"].forEach(function (where) {
		var out = attempt('  result.v = proof.listRelay({ target: "list.filter", items: input.items, extra: input.extra })', { items: rows, extra: { where: where } });
		assert(where === "true" ? out.ok && JSON.stringify(out.result.v) === JSON.stringify(rows) : !out.ok && out.error.code === "LIST_FILTER_WHERE_NOT_SOURCE",
			"A relayed text where is refused, a JSON text is its value " + JSON.stringify(where) + ": " + JSON.stringify(out));
	});

	// called from a definition, the three blocks keep their behaviour
	var authored = run('  result.map = list.map({ items: input.n })\n  result.sort = list.sort({ items: input.n })\n' +
		'  result.filter = list.filter({ items: input.rows, where: current.v > 1 })\n  result.all = list.filter({ items: input.rows })\n' +
		'  result.config = list.filter({ items: input.rows, where: config.demo.marker == "' + marker + '" })',
		{ n: [3, 1, 2], rows: rows });
	same([authored.map, authored.sort, authored.filter, authored.all, authored.config], [[3, 1, 2], [1, 2, 3], [{ v: 2 }], rows, rows],
		"list.map, list.sort and list.filter of a definition");

	print("relayed-list-defaults OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(project);
}
