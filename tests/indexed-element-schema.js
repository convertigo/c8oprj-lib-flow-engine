// The schema of an element read through an index is the schema of the element: local.first = local.page.rows[0]
// was typed as the list itself (the references of an expression stop at its first bracket), so passing local.first
// to a property declared object warned "declares object but local.first is array" although it ran with an object.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-indexed-element-schema-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(name, request) { return JSON.parse(engine[name](JSON.stringify(request))); }
	var find = 'const _meta = {\n  "sourceVersion": 2,\n  "properties": { "status": { "kind": "value", "type": "string" } },\n' +
		'  "outputs": { "out": { "type": "object", "properties": {\n' +
		'    "rows": { "type": "array", "items": { "type": "object", "properties": { "id": { "type": "integer" }, "email": { "type": "string" } } } },\n' +
		'    "byId": { "type": "object", "additionalProperties": { "type": "object", "properties": { "email": { "type": "string" } } } },\n' +
		'    "hasMore": { "type": "boolean" } } } }\n}\n\n' +
		'function customers_find({ input, config }) {\n  return { rows: [{ id: 1, email: "ada@example.com" }, { id: 2, email: "bob@example.com" }], byId: { "1": { email: "ada@example.com" } }, hasMore: false }\n}\n';
	var greet = 'const _meta = {\n  "sourceVersion": 2,\n  "properties": {\n    "customer": { "kind": "expression", "type": "object" },\n' +
		'    "email": { "kind": "expression", "type": "string" }\n  },\n  "outputs": { "out": { "type": "object" } }\n}\n\n' +
		'function customers_greet({ input, config }) {\n  return { text: "Hello " + input.customer.email }\n}\n';
	assert(api("blockCodeSet", { name: "customers.find", code: find }).ok && api("blockCodeSet", { name: "customers.greet", code: greet }).ok, "blocks");
	function flow(body) {
		return 'const _flow = {sourceVersion:2, inputs:{id:{type:"string",default:"1"}}}\nfunction Greetings({ input, config, result }) {\n' +
			'  local.page = customers.find({ $$id: "page", status: "OPEN" })\n' + body + '\n}\n';
	}
	function mismatches(body) {
		var out = api("flowSourceValidate", { name: "Greetings", code: flow(body) });
		assert(out.ok, "Validation: " + JSON.stringify(out));
		return { out: out, list: (out.diagnostics || []).filter(function (d) { return d.code === "FLOWSCRIPT_PROPERTY_TYPE_MISMATCH"; }) };
	}
	[
		"local.page.rows[0]",
		"local.page.rows[local.page.rows.length - 1]",
		"local.page.rows.at(-1)",
		"local.page.byId[input.id]",
		"local.page.byId[\"1\"]"
	].forEach(function (expression) {
		var checked = mismatches('  local.first = ' + expression + '\n  result.greeting = customers.greet({ customer: local.first, email: local.first.email })');
		assert(!checked.list.length, "local.first = " + expression + " is an object, its email a text: " + JSON.stringify(checked.list));
		assert(checked.out.analysis.paths.indexOf("local.first.email") !== -1, "The element's fields are offered for " + expression + ": " + JSON.stringify(checked.out.analysis.paths));
	});
	var count = mismatches('  local.count = local.page.rows[0].id\n  result.greeting = customers.greet({ customer: local.count })');
	assert(count.list.length === 1 && count.list[0].actual === "integer", "A real mismatch is still reported, with the element's field type: " + JSON.stringify(count.list));
	var list = mismatches('  local.all = local.page.rows\n  result.greeting = customers.greet({ customer: local.all })');
	assert(list.list.length === 1 && list.list[0].actual === "array", "The list itself is still a list: " + JSON.stringify(list.list));
	var ran = api("run", { flowSource: flow('  local.first = local.page.rows[local.page.rows.length - 1]\n  result.greeting = customers.greet({ customer: local.first })'), includeTrace: false, input: {} });
	assert(ran.ok && ran.result.greeting.text === "Hello bob@example.com", "And it runs with that element: " + JSON.stringify(ran));
	print("indexed-element-schema OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(project);
}
