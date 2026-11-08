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
	refuses('  local.items.filter(item => item.active)', 4, 'list.filter');
	refuses('  local.items.reduce(function (sum, item) { return sum + item.value }, 0)', 4, 'Function arguments are not supported');
	var literal = compile('  result.note = "function (x) => x"');
	assert(literal.ok, "Function syntax inside a string remains a string: " + JSON.stringify(literal));
	print("flowscript-function-argument-refusal OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(project);
}
