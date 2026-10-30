// A quoted string is text, on a property of kind expression too, as in JavaScript. A project block declaring
// day: { kind: "expression", type: "string" } called with day: "2025-12-14" received 1999: the quotes were dropped
// and the text read as the expression 2025 - 12 - 14, without a word. A quoted text that reads a scope
// (where: "current.active") is the former spelling of an expression: the check reports it with the fix.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-expression-quoted-text-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(name, request) { return JSON.parse(engine[name](JSON.stringify(request))); }
	var block = 'const _meta = {\n  "sourceVersion": 2,\n  "properties": {\n' +
		'    "day": { "kind": "expression", "type": "string" },\n' +
		'    "count": { "kind": "expression", "type": "integer" },\n' +
		'    "items": { "kind": "expression", "type": "array" }\n' +
		'  },\n  "outputs": { "out": { "type": "object" } }\n}\n\n' +
		'function booking_slot({ input, config }) {\n  return { day: input.day, count: input.count }\n}\n';
	var set = api("blockCodeSet", { name: "booking.slot", code: block });
	assert(set.ok, "blockCodeSet: " + JSON.stringify(set));
	function flow(body) {
		return 'const _flow = {sourceVersion:2, inputs:{day:{type:"string",default:"2026-01-05"}}}\n' +
			'function Bookings({ input, config, result }) {\n' + body + '\n}\n';
	}
	function run(body) {
		var out = api("run", { flowSource: flow(body), includeTrace: false, input: {} });
		assert(out.ok, "The run failed: " + JSON.stringify(out.error) + "\n" + body);
		return out.result;
	}
	function diagnostics(body) {
		var out = api("flowSourceValidate", { name: "Bookings", code: flow(body) });
		return { ok: out.ok, list: (out.diagnostics || []).filter(function (d) { return d.code === "FLOWSCRIPT_QUOTED_EXPRESSION"; }), out: out };
	}

	var texts = [
		['"2025-12-14"', "2025-12-14"],
		["'2025-12-14'", "2025-12-14"],
		['"1 + 1"', "1 + 1"],
		['"cost ${x}"', "cost ${x}"],
		['"a\\tb"', "a\tb"],
		['""', ""]
	];
	texts.forEach(function (fixture) {
		var out = run('  result.slot = booking.slot({ day: ' + fixture[0] + ', count: 2 })');
		assert(out.slot.day === fixture[1], "day: " + fixture[0] + " must be the text " + JSON.stringify(fixture[1]) + ": " + JSON.stringify(out));
		assert(out.slot.count === 2, "An expression stays an expression: " + JSON.stringify(out));
		var checked = diagnostics('  result.slot = booking.slot({ day: ' + fixture[0] + ' })');
		assert(checked.ok && !checked.list.length, "A quoted text is not reported: " + JSON.stringify(checked.out.diagnostics));
	});
	var values = run('  local.today = "2025-12-14"\n  result.local = booking.slot({ day: local.today })\n' +
		'  result.input = booking.slot({ day: input.day })\n' +
		'  result.sum = booking.slot({ day: "x", count: 2025 - 12 - 14 })');
	assert(values.local.day === "2025-12-14" && values.input.day === "2026-01-05", "Expressions keep their values: " + JSON.stringify(values));
	assert(values.sum.count === 1999, "An unquoted arithmetic stays arithmetic: " + JSON.stringify(values));

	// The core blocks follow the same rule: a quoted text of a scope was an expression, it is refused with the fix.
	var where = diagnostics('  result.active = list.filter({ items: [{ active: true }, { active: false }], where: "current.active" })');
	assert(!where.ok && where.list.length === 1 && where.list[0].severity === "error" && where.list[0].line === 3,
		"A quoted condition is refused: " + JSON.stringify(where.out.diagnostics));
	assert(where.list[0].hint.indexOf("where: current.active") !== -1, "The refusal gives the expression to write: " + JSON.stringify(where.list[0]));
	var refused = api("run", { flowSource: flow('  result.active = list.filter({ items: [{ active: true }], where: "current.active" })'), includeTrace: false, input: {} });
	assert(!refused.ok && JSON.stringify(refused.error).indexOf("FLOWSCRIPT_QUOTED_EXPRESSION") !== -1, "The run is refused too: " + JSON.stringify(refused));
	var condition = diagnostics('  if({ $$id: "many", condition: "input.day > 3", $$then: function () { result.many = true } })');
	assert(!condition.ok && condition.list.length === 1, "A quoted if condition is refused: " + JSON.stringify(condition.out.diagnostics));
	var list = diagnostics('  result.slot = booking.slot({ day: "x", items: "local.rows" })');
	assert(!list.ok && list.list.length === 1 && list.list[0].property === "items", "A quoted path on an array property is refused: " + JSON.stringify(list.out.diagnostics));
	var text = diagnostics('  result.slot = booking.slot({ day: "input.day" })');
	assert(text.ok && text.list.length === 1 && text.list[0].severity === "warning",
		"A quoted scope on a text property is a warning, the text is kept: " + JSON.stringify(text.out.diagnostics));
	assert(run('  result.slot = booking.slot({ day: "input.day" })').slot.day === "input.day", "The text is what the warning says");
	var plain = run('  result.active = list.filter({ items: [{ active: true }, { active: false }], where: current.active })');
	assert(plain.active.length === 1, "The unquoted condition filters: " + JSON.stringify(plain));

	// Saved, written back and run again: the quotes stay.
	var source = flow('  result.slot = booking.slot({ $$id: "slot", day: "2025-12-14", count: 3 })');
	var saved = api("flowCodeSet", { name: "Bookings", code: source, draft: false });
	assert(saved.ok, "code-set: " + JSON.stringify(saved));
	var parsed = api("flowSourceValidate", { name: "Bookings", code: source });
	var written = api("flowSourceValidate", { name: "Bookings", flowSource: parsed.source, includeHeader: false, includeImplicitReturn: false });
	assert(written.ok && written.code.indexOf('day: "2025-12-14"') !== -1, "The writer keeps the quoted text:\n" + written.code);
	var again = api("run", { flowSource: written.code, includeTrace: false, input: {} });
	assert(again.ok && again.result.slot.day === "2025-12-14", "The written source gives the text: " + JSON.stringify(again));
	var check = api("flowCodeCheck", { name: "Bookings", draft: false });
	assert(check.ok, "code-check: " + JSON.stringify(check));

	print("expression-property-quoted-text OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(project);
}
