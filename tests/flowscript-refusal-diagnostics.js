// A refused source says what to fix: the line of the file, the construction and the fix. A regular expression
// literal was refused as "Unsupported expression character: ^", a computed index rows[rows.length - 1] as
// "Unexpected token in expression: [" or "Expected ":"", the error message itself was "FlowScript validation failed."
// for a client that shows the message alone, the lines were counted from the function (the lines of the block file
// minus its _meta header), and a local named after a scope (local.input = 3, const result = 3) silently hid it.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-refusal-diagnostics-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(name, request) { return JSON.parse(engine[name](JSON.stringify(request))); }
	// Lines 1 to 6 are the header: the body starts at line 7.
	function flow(body) {
		return 'const _flow = {\n  sourceVersion: 2,\n  inputs: { date: { type: "string", default: "2026-01-05" }, type: { type: "string", default: "OPEN" } }\n}\n\n' +
			'function Tickets({ input, config, result }) {\n' + body + '\n}\n';
	}
	function run(body) {
		var out = api("run", { flowSource: flow(body), includeTrace: false, input: {} });
		assert(out.ok, "The run failed: " + JSON.stringify(out.error) + "\n" + body);
		return out.result;
	}
	function refusedSet(body) {
		var out = api("flowCodeSet", { name: "Tickets", code: flow(body), draft: false });
		assert(!out.ok && out.error, "code-set must refuse:\n" + body + "\n" + JSON.stringify(out));
		return out.error;
	}

	// A regular expression literal: its own code, the line of the file and the block that tests a pattern.
	var regex = refusedSet('  local.code = String(input.type)\n  local.valid = /^[0-9]{1,18}$/.test(local.code)\n  result.valid = local.valid');
	var first = regex.details.diagnostics[0];
	assert(first.code === "FLOWSCRIPT_EXPRESSION_UNSUPPORTED" && first.line === 8, "The regular expression literal is reported at line 8: " + JSON.stringify(first));
	assert(first.expression === "/^[0-9]{1,18}$/.test(local.code)", "with the expression it is in: " + JSON.stringify(first));
	assert(first.message.indexOf("/^[0-9]{1,18}$/") !== -1 && first.hint.indexOf('text.match({ text: String(value), pattern: "^[0-9]{1,18}$" })') !== -1,
		"It names the literal and the text.match call to write: " + JSON.stringify(first));
	assert(regex.message.indexOf("at line 8: FLOWSCRIPT_EXPRESSION_UNSUPPORTED") !== -1 && regex.message.indexOf("text.match") !== -1,
		"The message alone names the line, the code and the fix: " + regex.message);
	var division = run('  local.total = 10\n  local.parts = 4\n  result.share = local.total / local.parts\n  result.half = (local.total) / 2');
	assert(division.share === 2.5 && division.half === 5, "A division stays a division: " + JSON.stringify(division));

	// A project block: the same refusal, at the line of the block file.
	var head = 'const _meta = {\n  "sourceVersion": 2,\n  "properties": { "code": { "kind": "value", "type": "string" } },\n' +
		'  "outputs": { "out": { "type": "object" } }\n}\n\nfunction tickets_check({ input, config }) {\n  local.code = String(input.code)\n';
	var block = api("blockCodeSet", { name: "tickets.check", code: head + '  local.valid = /^T-[0-9]+$/i.test(local.code)\n  return { valid: local.valid }\n}\n' });
	assert(!block.ok && block.error.code === "FLOWSCRIPT_BLOCK_VALIDATION_FAILED", "The block is refused: " + JSON.stringify(block));
	assert(block.error.details[0].line === 9 && block.error.details[0].code === "FLOWSCRIPT_EXPRESSION_UNSUPPORTED",
		"At line 9 of the block file: " + JSON.stringify(block.error.details[0]));
	assert(block.error.message.indexOf("at line 9: FLOWSCRIPT_EXPRESSION_UNSUPPORTED") !== -1 && block.error.message.indexOf("ignoreCase: true") !== -1,
		"The message names the line and keeps the i flag: " + block.error.message);
	var unknown = api("blockCodeSet", { name: "tickets.check", code: head + '  local.other = missing.block({ value: 1 })\n  return { valid: true }\n}\n' });
	assert(!unknown.ok && unknown.error.message.indexOf("at line 9") !== -1, "A parser refusal of a block names the line of the file: " + JSON.stringify(unknown.error));
	var valid = api("blockCodeSet", { name: "tickets.check", code: head + '  local.check = text.match({ text: local.code, pattern: "^T-[0-9]+$", ignoreCase: true })\n  return { valid: local.check.matched }\n}\n' });
	assert(valid.ok, "The fix the hint gives is accepted: " + JSON.stringify(valid));
	assert(run('  result.ticket = tickets.check({ code: "t-42" })').ticket.valid === true, "and runs");

	// A computed index, as in JavaScript.
	var indexed = run('  local.page = { rows: [{ id: "a" }, { id: "b" }, { id: "c" }], hasMore: true }\n' +
		'  local.byStatus = { OPEN: 3, CLOSED: 1 }\n  local.position = 1\n' +
		'  result.last = local.page.hasMore === true ? local.page.rows[local.page.rows.length - 1].id : null\n' +
		'  result.second = local.page.rows[local.position].id.toUpperCase()\n  result.count = local.byStatus[input.type]\n' +
		'  result.letter = input.type[0]\n  result.size = local.page.rows["length"]\n  result.outside = local.page.rows[9] ?? "none"\n' +
		'  local.method = "map"\n  local.proto = "__proto__"\n  result.method = local.page.rows[local.method] ?? "none"\n  result.proto = local.byStatus[local.proto] ?? "none"');
	assert(indexed.last === "c" && indexed.second === "B" && indexed.count === 3 && indexed.letter === "O" && indexed.size === 3,
		"Computed indexes read their element: " + JSON.stringify(indexed));
	assert(indexed.outside === "none" && indexed.method === "none" && indexed.proto === "none",
		"An index outside the list, a function or the prototype gives nothing: " + JSON.stringify(indexed));
	var stray = refusedSet('  local.a = 1\n  result.v = local.a local.a');
	assert(stray.details.diagnostics[0].line === 8 && /Unexpected local\.a in expression: local\.a local\.a/.test(stray.details.diagnostics[0].message),
		"A stray token is named with its expression: " + JSON.stringify(stray.details.diagnostics[0]));

	// Names: an input named date or type, a local named date or type are names like any other.
	var named = run('  local.date = String(input.date).trim()\n  local.type = String(input.type).trim()\n  local.valid = date.isValid({ $$id: "valid", value: local.date })\n' +
		'  result.date = local.date\n  result.type = local.type\n  result.valid = local.valid');
	assert(named.date === "2026-01-05" && named.type === "OPEN" && named.valid === true, "date and type are ordinary names: " + JSON.stringify(named));
	// A local named after a scope is refused, or left out of the scope it would hide.
	["input", "result", "config", "current"].forEach(function (scope) {
		var reserved = refusedSet('  local.a = 1\n  const ' + scope + ' = { date: "x" }\n  result.v = local.a');
		assert(reserved.code === "FLOWSCRIPT_RESERVED_NAME" && reserved.message.indexOf("at line 8") !== -1 &&
			reserved.hint.indexOf("const " + scope + "Value = ...") !== -1, "const " + scope + " is refused with a name to use: " + JSON.stringify(reserved));
	});
	var kept = run('  local.input = 3\n  local.config = { date: "x" }\n  result.date = input.date\n  result.local = local.input');
	assert(kept.date === "2026-01-05" && kept.local === 3, "local.input = 3 leaves input.date to the input scope: " + JSON.stringify(kept));

	// A refused working copy is kept with its diagnostics, for code-check and code-patch.
	var draft = api("flowCodeSet", { name: "Tickets", code: flow('  local.code = "1"\n  result.valid = /^[0-9]+$/.test(local.code)') });
	assert(!draft.ok && draft.written === true && draft.error.message.indexOf("at line 8") !== -1, "The working copy is written with its refusal: " + JSON.stringify(draft));
	var checked = api("flowCodeCheck", { name: "Tickets" });
	assert(!checked.ok && JSON.stringify(checked).indexOf("FLOWSCRIPT_EXPRESSION_UNSUPPORTED") !== -1, "code-check reports it: " + JSON.stringify(checked).substring(0, 600));

	print("flowscript-refusal-diagnostics OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(project);
}
