// Counting the rows of an entity.list page in memory gives a wrong number beyond its limit. In the scenario of 12/11 the
// dashboards listed 200 rows, filtered them by status and took .length: the counts were silently cut beyond 200 rows (or
// the Flow failed), and one count, read through a nested current, stayed at 0. entity.count counts in SQL with the same
// filter and policy. code-check now says a count of listed rows (FLOWSCRIPT_COUNT_BY_LIST), and adds that the count stops
// at the limit when the Flow never reads hasMore or nextOffset of that page.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("count-by-list-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function write(file, text) { FileUtils.writeStringToFile(file, String(text), "UTF-8"); }
try {
	// Stand-ins of the blocks of lib_flow_entity, with their names and properties.
	["list", "count"].forEach(function (name) {
		write(new java.io.File(project, "_flow/blocks/entity/" + name + ".block.js"),
			'const _meta = { runtime: "rhino", properties: { entity: { kind: "value", type: "string" }, checkAccess: { kind: "expression", type: "boolean" }, options: { kind: "expression", type: "object" } }, outputs: { out: { type: "object" } } }\n' +
			'(function () { return { run: function () { return {}; } }; }())');
	});
	var engine = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(method, request) { return JSON.parse(engine[method](JSON.stringify(request))); }
	function check(body) {
		var code = 'const _flow = { sourceVersion: 2, accessibility: "hidden", inputs: { items: { type: "array", default: [] } } }\nfunction Dashboard({ input, result }) {\n' + body + '\n}';
		var out = api("flowCodeCheck", { name: "Dashboard", code: code });
		return (out.diagnostics || (out.error && out.error.diagnostics) || []).filter(function (d) { return /^FLOWSCRIPT_COUNT_/.test(d.code); });
	}
	function codes(found) { return found.map(function (d) { return d.code; }).sort().join(","); }
	var list = '  local.page = entity.list({ entity: "Dossier", checkAccess: true, options: { limit: 200, active: "active" } })';

	// The dashboard of 12/11: a page of 200 rows, filtered in memory, counted with .length, no hasMore read.
	var filtered = check([list, '  local.actifs = list.filter({ items: local.page.rows, where: current.values.actif === true })',
		'  result.dossiersActifs = local.actifs.length'].join("\n"));
	assert(codes(filtered) === "FLOWSCRIPT_COUNT_BY_LIST", "a filtered count of a listed page is said once: " + JSON.stringify(filtered));
	var byList = filtered[0];
	assert(byList.severity === "warning" && byList.line === 3, "the count is a warning on the line of entity.list: " + JSON.stringify(byList));
	assert(/entity\.count/.test(byList.hint) && /filter/.test(byList.hint), "the hint gives entity.count with the filter: " + byList.hint);
	assert(/200/.test(byList.message) && /hasMore is never read/.test(byList.message), "the message names the limit and the unread hasMore: " + byList.message);

	// list.count of the rows themselves is the same count.
	var counted = check([list, '  result.total = list.count({ items: local.page.rows })'].join("\n"));
	assert(codes(counted) === "FLOWSCRIPT_COUNT_BY_LIST", "list.count of listed rows is said: " + JSON.stringify(counted));

	// A Flow that reads hasMore knows when the page is incomplete: the count is still said, the truncation is not.
	var guarded = check([list, '  if (local.page.hasMore) {', '    throw { code: "TOO_MANY_ROWS", message: "Narrow the filter" }', '  }',
		'  result.total = local.page.rows.length'].join("\n"));
	assert(codes(guarded) === "FLOWSCRIPT_COUNT_BY_LIST" && !/hasMore is never read/.test(guarded[0].message), "with hasMore read, the count is said without the cut page: " + JSON.stringify(guarded));

	// A processing that goes through the rows needs them: it is not said (the MCP says an unchecked page itself).
	var loop = ['  forEach({', '    items: local.page.rows,', '    $$nodes: function () {', '      log.info({ message: "row" })', '    },', '  })'];
	var processed = check([list].concat(loop).concat(['  result.analysed = local.page.rows.length']).join("\n"));
	assert(processed.length === 0, "a processing over the rows is not said: " + JSON.stringify(processed));

	// A lookup is not a count: an emptiness test of the rows, or a page of one row (it93, L18: room_set_active).
	assert(check([list, '  if (local.page.rows.length === 0) {', '    throw { code: "NOT_FOUND", message: "none" }', '  }', '  result.first = local.page.rows[0]'].join("\n")).length === 0,
		"an emptiness test is not a count");
	assert(check([list, '  if (0 < local.page.rows.length) {', '    result.any = true', '  }'].join("\n")).length === 0, "a reversed emptiness test is not a count");
	assert(check(['  local.found = entity.list({ entity: "Room", checkAccess: true, options: { limit: 1, filter: { code: "A" } } })', '  result.n = local.found.rows.length'].join("\n")).length === 0,
		"a lookup of one row is not a count");
	assert(check([list, '  result.n = local.page.rows.length > 10'].join("\n")).length === 1, "a comparison with another number still counts");

	// What stays silent: entity.count, the total of the page, the listed rows returned, a count of another list.
	assert(check('  local.n = entity.count({ entity: "Dossier", checkAccess: true, options: { filter: { statut: "A_SUIVRE" } } })\n  result.n = local.n.total').length === 0,
		"entity.count is not said");
	assert(check([list, '  result.total = local.page.total'].join("\n")).length === 0, "the total of the page is not said");
	assert(check([list, '  result.rows = local.page.rows'].join("\n")).length === 0, "returning the listed rows is not said");
	assert(check('  result.n = input.items.length\n  result.m = list.count({ items: input.items })').length === 0, "a count of another list is not said");
	print("count-by-list: " + checks + " checks passed");
} finally {
	FileUtils.deleteQuietly(project);
}
