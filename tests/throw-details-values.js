// The details of a throw are values: details: { orders: local.late, count: 2 } gave the caller the text
// "${local.late}" (the property was a literal, the notation of the value kept as it was), without a diagnostic at the
// check or at the run. They are now evaluated, as the message is: a path or an expression gives its value, its type
// kept, a template literal its text, a literal stays as written. The code stays a constant the callers test: a path
// there is refused with how to write one throw per code.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-throw-details-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(name, request) { return JSON.parse(engine[name](JSON.stringify(request))); }
	function flow(lines) {
		return ['const _flow = { sourceVersion: 2 }', 'function Orders({ input, result }) {', '  local.late = ["A-1", "A-2"]', '  local.code = "ORDER_LATE"']
			.concat(lines, ['}', '']).join("\n");
	}
	var out = api("flowCodeRun", { name: "Orders", includeTrace: false, code: flow([
		'  throw({ code: "ORDER_LATE", message: `${local.late.length} orders are late`, status: 409,',
		'    details: { orders: local.late, count: local.late.length, first: `order ${local.late[0]}`, kind: "late", fixed: 3, nested: { last: local.late[1], none: local.missing } } })']) });
	assert(out.ok === false && out.error && out.error.code === "ORDER_LATE" && out.error.status === 409, "the throw answers its error: " + JSON.stringify(out).substring(0, 600));
	assert(out.error.message === "2 orders are late", "the message is rendered: " + out.error.message);
	// an absent value is left out of the JSON answer, as an undefined field
	assert(JSON.stringify(out.error.details) === JSON.stringify({ orders: ["A-1", "A-2"], count: 2, first: "order A-1", kind: "late", fixed: 3, nested: { last: "A-2" } }),
		"the details are evaluated: " + JSON.stringify(out.error.details));
	assert(JSON.stringify(out).indexOf("${") === -1, "no notation is left in the answer: " + JSON.stringify(out.error));

	// a throw without details has none
	var bare = api("flowCodeRun", { name: "Orders", includeTrace: false, code: flow(['  throw({ code: "ORDER_LATE", message: "Late" })']) });
	assert(bare.ok === false && bare.error.details === undefined, "no details when none is given: " + JSON.stringify(bare.error));

	// the code stays a constant: a path is refused with one throw per code
	var refused = api("flowSourceValidate", { name: "Orders", code: flow(['  throw({ code: local.code, message: "Late" })']) });
	var text = JSON.stringify(refused);
	assert(!refused.ok && text.indexOf("FLOWSCRIPT_TEXT_PROPERTY_PATH") !== -1 && text.indexOf("one throw per code") !== -1 && text.indexOf("details") !== -1,
		"a computed code is refused with how to write one throw per code: " + text.substring(0, 600));

	print("throw-details-values OK (" + checks + " checks)");
} finally {
	files.deleteQuietly(project);
}
