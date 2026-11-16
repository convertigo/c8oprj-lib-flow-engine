// A business Flow that checks before it writes an entity holds rules the entity gateway does not run. In the scenario of
// 12/11 (passage 1) an RESPONSABLE wrote its own rows through the gateway, outside the rules of the business Flows. When the
// project has an EntityGateway and the model leaves the entity's writes open on it, code-check says it
// (ENTITY_GATEWAY_WRITES_OPEN); "gateway": {"writes": false} on the entity keeps its writes to its business Flows.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("gateway-writes-open-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function write(file, text) { FileUtils.writeStringToFile(new java.io.File(project, file), String(text), "UTF-8"); }
try {
	write("c8oProject.yaml", "↓Tracker [core.Project]: \n");
	["save", "delete", "applyGateway"].forEach(function (name) {
		write("_flow/blocks/entity/" + name + ".block.js",
			'const _meta = { runtime: "rhino", properties: { entity: { kind: "value", type: "string" }, checkAccess: { kind: "expression", type: "boolean" }, operation: { kind: "value", type: "string" }, payload: { kind: "expression", type: "object" }, key: { kind: "expression", type: "object" }, values: { kind: "expression", type: "object" } }, outputs: { out: { type: "object" } } }\n' +
			'(function () { return { run: function () { return {}; } }; }())');
	});
	function model(closed) {
		write("_flow/data/model.yaml", "version: 2\nentities:\n  Dossier:\n    display: { title: numero }\n" + (closed ? "    gateway: { writes: false }\n" : "") +
			"    fields:\n      numero: { type: string, maxLength: 40 }\n");
	}
	var engineSource = String(FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
	var engine = eval(engineSource);
	function api(method, request) { return JSON.parse(engine[method](JSON.stringify(request))); }
	function said(body) {
		var code = 'const _flow = { sourceVersion: 2, accessibility: "hidden", inputs: { numero: { type: "string" } } }\nfunction SaveDossier({ input, result }) {\n' + body + '\n}';
		var out = api("flowCodeCheck", { name: "SaveDossier", code: code });
		return (out.diagnostics || (out.error && out.error.diagnostics) || []).filter(function (d) { return d.code === "ENTITY_GATEWAY_WRITES_OPEN"; });
	}
	var checked = ['  if (!input.numero) {', '    throw { code: "VALIDATION_FAILED", message: "numero" }', '  }',
		'  result.x = entity.save({ entity: "Dossier", checkAccess: true, values: { numero: input.numero } })'].join("\n");
	model(false);
	assert(said(checked).length === 0, "without an EntityGateway nothing is said");
	// The same project with an EntityGateway, read by a fresh engine (the Flow list of a project is read once).
	write("_flow/flows/EntityGateway.flow.js", 'const _flow = { sourceVersion: 2, accessibility: "hidden" }\nfunction EntityGateway({ input, result }) {\n  result.out = entity.applyGateway({ entity: input.entity, operation: input.operation, payload: input.payload })\n}');
	engine = eval(engineSource);
	var found = said(checked);
	assert(found.length === 1 && found[0].severity === "warning" && found[0].line === 6, "a checked write next to an open gateway is said: " + JSON.stringify(found));
	assert(/EntityGateway/.test(found[0].message) && /"writes": false/.test(found[0].hint) && /beforeSave/.test(found[0].hint), "the hint closes the gateway writes or moves the checks: " + found[0].hint);
	assert(said('  result.x = entity.save({ entity: "Dossier", checkAccess: true, values: { numero: input.numero } })').length === 0,
		"a pass-through facade without checks is not said");
	assert(said(checked.replace("checkAccess: true", "checkAccess: false")).length === 0, "a trusted write is not said");
	// Wider checks (securite-cve, 13/11): a return, an error answer or a control call before the write is a check too,
	// in the same branch or not; a write returned at once by a facade is not.
	var save = '  result.x = entity.save({ entity: "Dossier", checkAccess: true, values: { numero: input.numero } })';
	assert(said(['  if (!input.numero) {', '    return { ok: false }', '  }', save].join("\n")).length === 1, "a return before the write is a check");
	assert(said(['  if (!input.numero) {', '    response.error({ code: "VALIDATION_FAILED", message: "numero" })', '  }', save].join("\n")).length === 1,
		"an error answer is a check");
	assert(said(['  local.allowed = flow.call({ flow: "CheckDossier", input: { numero: input.numero } })', save].join("\n")).length === 1,
		"a control Flow called before the write is a check");
	assert(said('  return entity.save({ entity: "Dossier", checkAccess: true, values: { numero: input.numero } })').length === 0,
		"a facade returning its write at once is not said");
	// A gateway is recognized by its block, whatever the name of its Flow.
	new java.io.File(project, "_flow/flows/EntityGateway.flow.js")["delete"]();
	write("_flow/flows/Passerelle.flow.js", 'const _flow = { sourceVersion: 2, accessibility: "hidden" }\nfunction Passerelle({ input, result }) {\n  result.out = entity.applyGateway({ entity: input.entity, operation: input.operation, payload: input.payload })\n}');
	engine = eval(engineSource);
	var renamed = said(checked);
	assert(renamed.length === 1 && /Passerelle/.test(renamed[0].message), "a gateway Flow under another name is recognized by its block: " + JSON.stringify(renamed));
	model(true);
	assert(said(checked).length === 0, "an entity whose writes are kept to its Flows is not said");
	print("gateway-writes-open: " + checks + " checks passed");
} finally {
	FileUtils.deleteQuietly(project);
}
