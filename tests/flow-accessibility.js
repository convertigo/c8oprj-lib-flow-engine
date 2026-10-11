// _flow.accessibility declares who may call a Flow over HTTP: private, hidden or public. The validation refuses another
// value, and the synchronization of the Flow bean receives the Convertigo name, or null when the source declares none
// (the accessibility property of the Flow then applies).
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-accessibility-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var FileUtils = Packages.org.apache.commons.io.FileUtils;
function assert(value, message) { if (!value) throw new Error(message); }
try {
	var engine = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(method, request) { return JSON.parse(engine[method](JSON.stringify(request))); }
	function code(meta) {
		return "const _flow = " + JSON.stringify(meta) + "\nfunction Explore({input, result}) {\nresult.name = input.name\nreturn result\n}";
	}
	var inputs = { name: { type: "string", "default": "" } };

	var valid = api("flowSourceValidate", { name: "Explore", code: code({ sourceVersion: 2, accessibility: "private", inputs: inputs }) });
	assert(valid.ok && !(valid.diagnostics || []).some(function (d) { return d.code === "FLOW_ACCESSIBILITY_INVALID"; }), "private is accepted: " + JSON.stringify(valid.diagnostics));
	assert(String(valid.source).indexOf("accessibility") > 0, "the declaration stays in the source");
	var invalid = api("flowSourceValidate", { name: "Explore", code: code({ sourceVersion: 2, accessibility: "internal", inputs: inputs }) });
	var diagnostic = (invalid.diagnostics || []).filter(function (d) { return d.code === "FLOW_ACCESSIBILITY_INVALID"; })[0];
	assert(!invalid.ok && diagnostic && diagnostic.severity === "error", "another value is refused: " + JSON.stringify(invalid));

	function synced(meta) { return api("syncInputs", { name: "Explore", flowSource: code(meta) }).accessibility; }
	assert(synced({ sourceVersion: 2, accessibility: "private", inputs: inputs }) === "Private", "the bean receives the Convertigo name");
	assert(synced({ sourceVersion: 2, accessibility: "Hidden" }) === "Hidden", "without inputs, and whatever the case");
	assert(synced({ sourceVersion: 2, inputs: inputs }) === null, "without declaration, the property of the Flow applies");
	print("flow-accessibility OK");
} finally {
	FileUtils.deleteQuietly(project);
}
