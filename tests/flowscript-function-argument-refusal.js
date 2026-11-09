var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("function-argument-refusal-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function compile(body) {
		var code = body.indexOf('const _flow = ') === 0 ? body
			: 'const _flow = { sourceVersion: 2 }\n\nfunction Items({ input, config, result }) {\n' + body + '\n}\n';
		return JSON.parse(engine.flowCodeSet(JSON.stringify({ name: "Items", code: code, draft: false })));
	}
	function refuses(body, line, hint) {
		var out = compile(body);
		assert(!out.ok && out.error, "The source must be refused: " + JSON.stringify(out));
		var diagnostic = (out.error.details.diagnostics || [])[0];
		assert(diagnostic && diagnostic.code === "FLOWSCRIPT_FUNCTION_ARGUMENT_UNSUPPORTED" && diagnostic.line === line,
			"The function argument must have a specific diagnostic at its source line: " + JSON.stringify(out.error));
		assert(diagnostic.hint.indexOf(hint) !== -1 && out.error.hint.indexOf(hint) !== -1,
			"The diagnostic and error hint must suggest the supported form: " + JSON.stringify(out.error));
	}
	function run(body, input) {
		var source = 'const _flow = { sourceVersion: 2 }\nfunction Items({ input, config, result }) {\n' + body + '\n}\n';
		return JSON.parse(engine.run(JSON.stringify({ flowSource: source, input: input || {}, includeTrace: false })));
	}
	refuses('const _flow = { sourceVersion: 2, accessibility: "public" }\n\n' +
		'function equipment_list({ input, config, result }) {\n' +
		'  local.count = 0\n' +
		'  local.page = entity.list({ entity: "Equipment", checkAccess: true, options: { limit: 200, orderBy: "name", direction: "asc" } })\n' +
		'  local.items = list.map({ items: local.page.rows, select: { id: current.key.id, name: current.values.name, status: current.values.status, responsible: current.values.responsible, site: current.values.site } })\n' +
		'  local.items.sort(function (a, b) {\n' +
		'    if (a.name < b.name) return -1\n' +
		'    if (a.name > b.name) return 1\n' +
		'    return Number(a.id) - Number(b.id)\n' +
		'  })\n  return { items: local.items }\n}\n', 7, 'list.sort({ items: local.items, by: current.name, direction: "asc" })');
	refuses('  local.items.sort(function compare(a, b) { return a.name < b.name ? -1 : 1 })', 4, 'list.sort');
	refuses('  local.items.sort((a, b) => a.name.localeCompare(b.name))', 4, 'list.sort');
	refuses('  local.items.map(function (item) { return item.name })', 4, 'list.map');
	refuses('  local.page.rows.map(function (r) { return { id: String(r.key.id), name: r.values.name } })', 4,
		'list.map({ items: local.page.rows, select: { id: current.id, name: current.name } })');
	refuses('  local.page.rows.map(function (r) { return { id: String(r.key.id), name: r.values.name, status: r.values.status, responsible: r.values.responsible, site: r.values.site } })', 4,
		'list.map({ items: local.page.rows, select: { id: current.id, name: current.name } })');
	refuses('  local.people.rows.some(function (r) { return String(r.key.id) === input.responsible && r.values.site === local.actor.site })', 4,
		'list.filter({ items: local.people.rows, where: current.active })');
	refuses('  local.actor = { site: "west" }\n  local.people.rows.some(function (r) { return String(r.key.id) === input.responsible && r.values.site === local.actor.site })', 5,
		'list.filter({ items: local.people.rows, where: current.active })');
	refuses('  local.rows.every(function (r) { return r.active })', 4, 'list.count({ items: local.rows })');
	refuses('  local.rows.find(function (r) { return r.active })', 4, 'list.first({ items: local.matches })');
	refuses('  local.rows.findIndex(function (r) { return r.active })', 4, 'forEach({ items: local.rows');
	refuses('  local.items.filter(item => item.active)', 4, 'list.filter');
	refuses('  local.items.reduce(function (sum, item) { return sum + item.value }, 0)', 4, 'Function arguments are not supported');
	var mapped = run('  local.rows = input.rows\n  result.items = list.map({ items: local.rows, select: { id: current.id, name: current.name } })',
		{ rows: [{ id: 1, name: "Ada" }, { id: 2, name: "Bo" }] });
	assert(mapped.ok && JSON.stringify(mapped.result.items) === '[{"id":1,"name":"Ada"},{"id":2,"name":"Bo"}]',
		"Object projection must run: " + JSON.stringify(mapped));
	var tracedMap = run('  local.page = { rows: input.rows }\n' +
		'  result.items = list.map({ items: local.page.rows, select: { id: String(current.key.id), name: current.values.name, status: current.values.status, responsible: current.values.responsible, site: current.values.site } })',
		{ rows: [{ key: { id: 7 }, values: { name: "Ada", status: "ACTIVE", responsible: "Bo", site: "west" } }] });
	assert(tracedMap.ok && tracedMap.result.items[0].id === "7" && tracedMap.result.items[0].site === "west",
		"Traced object projection must run: " + JSON.stringify(tracedMap));
	var tracedSome = run('  local.actor = { site: "west" }\n  local.people = { rows: input.rows }\n' +
		'  local.matches = list.filter({ items: local.people.rows, where: String(current.key.id) === input.responsible && current.values.site === local.actor.site })\n' +
		'  local.count = list.count({ items: local.matches })\n  result.ok = local.count > 0',
		{ responsible: "7", rows: [{ key: { id: 7 }, values: { site: "west" } }, { key: { id: 8 }, values: { site: "east" } }] });
	assert(tracedSome.ok && tracedSome.result.ok === true,
		"Traced predicate must run: " + JSON.stringify(tracedSome));
	var filtered = run('  local.rows = input.rows\n  local.matches = list.filter({ items: local.rows, where: current.active })\n' +
		'  local.count = list.count({ items: local.matches })\n  result.some = local.count > 0\n' +
		'  local.total = list.count({ items: local.rows })\n  result.every = local.count == local.total\n' +
		'  result.first = list.first({ items: local.matches })',
		{ rows: [{ id: 1, active: false }, { id: 2, active: true }] });
	assert(filtered.ok && filtered.result.some === true && filtered.result.every === false && filtered.result.first.id === 2,
		"Filter, count and first examples must run: " + JSON.stringify(filtered));
	var empty = run('  local.rows = input.rows\n  local.matches = list.filter({ items: local.rows, where: current.active })\n' +
		'  local.count = list.count({ items: local.matches })\n  local.total = list.count({ items: local.rows })\n' +
		'  result.some = local.count > 0\n  result.every = local.count == local.total', { rows: [] });
	assert(empty.ok && empty.result.some === false && empty.result.every === true,
		"Quantifiers must handle an empty list: " + JSON.stringify(empty));
	var indexed = run('  local.rows = input.rows\n  local.index = -1\n  local.i = 0\n' +
		'  forEach({ items: local.rows, $$nodes: function () { if (local.index == -1 && current.active) { local.index = local.i }; local.i = local.i + 1 } })\n' +
		'  result.index = local.index', { rows: [{ active: false }, { active: true }, { active: true }] });
	assert(indexed.ok && indexed.result.index === 1, "Index example must run: " + JSON.stringify(indexed));
	var literal = compile('  result.note = "function (x) => x"');
	assert(literal.ok, "Function syntax inside a string remains a string: " + JSON.stringify(literal));
	print("flowscript-function-argument-refusal OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(project);
}
