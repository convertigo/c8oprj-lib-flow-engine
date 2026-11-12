// Several entity writes of one Flow commit one by one unless they share a sql.transaction: a failure in the middle keeps
// the writes already done. In the PCA of 11/11 a grouped declaration saved, for each selected item, its declaration and
// the item (two entity.save in a forEach), then a journal line: a refusal on the third item kept the first two. A Flow
// that writes more than once outside a transaction is now said by code-check, with the lines of its writes.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("entity-writes-transaction-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function write(file, text) { FileUtils.writeStringToFile(file, String(text), "UTF-8"); }
try {
	// Stand-ins of the blocks of lib_flow_entity and lib_flow_sql, with their names and slots.
	write(new java.io.File(project, "_flow/blocks/entity/save.block.js"),
		'const _meta = { runtime: "rhino", properties: { entity: { kind: "value", type: "string" }, values: { kind: "expression", type: "object" } }, outputs: { out: { type: "object" } } }\n' +
		'(function () { return { run: function () { return {}; } }; }())');
	write(new java.io.File(project, "_flow/blocks/entity/delete.block.js"),
		'const _meta = { runtime: "rhino", properties: { entity: { kind: "value", type: "string" }, key: { kind: "expression", type: "object" } }, outputs: { out: { type: "object" } } }\n' +
		'(function () { return { run: function () { return {}; } }; }())');
	write(new java.io.File(project, "_flow/blocks/sql/transaction.block.js"),
		'const _meta = { runtime: "rhino", properties: { connection: { kind: "value", type: "string" } }, children: ["nodes"], slots: [{ name: "nodes", label: "Nodes", inline: true }] }\n' +
		'(function () { return { run: function (ctx, node) { return ctx.runChildren ? ctx.runChildren(node.nodes || []) : null; } }; }())');
	var engine = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(method, request) { return JSON.parse(engine[method](JSON.stringify(request))); }
	var last = null;
	function check(body) {
		var code = 'const _flow = { sourceVersion: 2, inputs: { items: { type: "array", default: [] } } }\nfunction Declare({ input, result }) {\n' + body + '\n}';
		var out = api("flowCodeCheck", { name: "Declare", code: code });
		last = out;
		return (out.diagnostics || (out.error && out.error.diagnostics) || []).filter(function (d) { return d.code === "FLOWSCRIPT_WRITES_WITHOUT_TRANSACTION"; });
	}
	var save = function (entity) { return '  entity.save({ entity: "' + entity + '", values: {} })'; };

	var two = check([save("Declaration"), save("Item")].join("\n"));
	assert(two.length === 1 && two[0].severity === "warning", "two writes outside a transaction are said: " + JSON.stringify(two));
	assert(/sql\.transaction/.test(two[0].hint) && /\$\$nodes/.test(two[0].hint), "the hint gives sql.transaction and its $$nodes: " + two[0].hint);
	assert(/lines 3, 4 /.test(two[0].message), "the lines of the writes are given: " + two[0].message);

	var looped = check(['  forEach({', '    items: input.items,', '    $$nodes: function () {', '      entity.save({ entity: "Item", values: {} })', '    },', '  })'].join("\n"));
	assert(looped.length === 1 && /forEach/.test(looped[0].message), "one write in a loop writes many times: " + JSON.stringify(looped));

	var mixed = check([save("Item"), '  entity.delete({ entity: "Draft", key: {} })'].join("\n"));
	assert(mixed.length === 1, "a save and a delete are two writes: " + JSON.stringify(mixed));

	assert(check(['  sql.transaction({', '    connection: "app",', '    $$nodes: function () {', '  ' + save("Declaration"), '  ' + save("Item"), '    },', '  })'].join("\n")).length === 0,
		"writes that share a sql.transaction are not said");
	assert(last.ok === true, "the stand-in blocks are known and the transaction checks: " + JSON.stringify(last.diagnostics || last.error));
	assert(check(save("Item")).length === 0, "a single write is not said");
	print("entity-writes-transaction OK (" + checks + " checks)");
} finally {
	FileUtils.deleteQuietly(project);
}
