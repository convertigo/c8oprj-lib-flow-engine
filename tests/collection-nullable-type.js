// A field of a typed collection that may be null (the nullable column of a row) is one type with nullable: true. The
// spelling of JSON Schema, type: ["string", "null"], passed code-set and failed at the first run ("Unsupported type:
// string,null"), {} failed with "Unsupported type: undefined", and the contract of json.array did not say how to write
// it. The check now refuses the type of a typed collection the run would refuse, at its line, with what to write, and
// the contract of itemType says it.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-collection-nullable-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(name, request) { return JSON.parse(engine[name](JSON.stringify(request))); }
	function flow(noteType) {
		return ['const _flow = { sourceVersion: 2 }', 'function Orders({ input, result }) {',
			'  local.rows = json.array({ itemType: { type: "object", properties: { id: { type: "integer" }, note: ' + noteType + ' } } })',
			'  json.push({ path: "local.rows", value: { id: 1, note: null } })',
			'  json.push({ path: "local.rows", value: { id: 2, note: "late" } })',
			'  result.rows = local.rows', '}', ''].join("\n");
	}
	var nullable = api("flowCodeRun", { name: "Orders", code: flow('{ type: "string", nullable: true }'), includeTrace: false });
	assert(nullable.ok && JSON.stringify(nullable.result.rows) === '[{"id":1,"note":null},{"id":2,"note":"late"}]', "nullable: true takes null: " + JSON.stringify(nullable).substring(0, 500));

	function refused(noteType, pattern, label) {
		var checked = api("flowSourceValidate", { name: "Orders", code: flow(noteType) });
		var diagnostic = (checked.diagnostics || []).filter(function (d) { return d.code === "INVALID_SCHEMA"; })[0];
		assert(!checked.ok && diagnostic && diagnostic.severity === "error" && diagnostic.line === 3 && pattern.test(diagnostic.message),
			label + ": the check must refuse it at line 3 with what to write: " + JSON.stringify(checked.diagnostics || checked).substring(0, 700));
		var set = api("flowCodeSet", { name: "Orders", code: flow(noteType) });
		assert(set.ok === false, label + ": code-set accepted it: " + JSON.stringify(set).substring(0, 300));
	}
	refused('{ type: ["string", "null"] }', /\{ type: "string", nullable: true \}/, "a list of types with null");
	refused('{}', /Choose a type.*nullable: true.*"unknown"/, "no type");
	refused('{ anyOf: [{ type: "string" }, { type: "null" }] }', /anyOf.*nullable: true/, "anyOf");
	refused('{ type: ["string", "integer"] }', /Choose one type/, "a list of two types");

	var contract = api("blockGet", { name: "json.array" });
	assert(/nullable: true/.test(JSON.stringify(contract)), "the contract of json.array says how to declare a nullable field: " + JSON.stringify(contract).substring(0, 500));

	print("collection-nullable-type OK (" + checks + " checks)");
} finally {
	files.deleteQuietly(project);
}
