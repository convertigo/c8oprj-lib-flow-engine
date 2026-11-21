// FlowScript v3 object spread and Object.assign (bench of 21/11, L34F: an options object built from the input was refused
// three times, as an untyped list, then Object.assign, then { ...a }). { ...a, k: v, ...b } and Object.assign({}, a, { k: v })
// are object.merge steps in hidden locals, as the whole value of a declaration, an assignment, a return, a push or a write
// under a key, and in a branch of such a ?:. The Flow gives what Node gives on the same source, key order included.
// Elsewhere (in an argument, inside an expression) the object is refused with FLOWSCRIPT_V3_SPREAD and the statement to
// write; Object.assign on another first argument, which it changes, with FLOWSCRIPT_V3_GLOBAL_CALL; a push into a list
// of no declared type names the list to declare. The bridge and the Java reader refuse alike.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("flow-v3-object-merge-").toFile().getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var bridge = eval(String(files.readFileToString(new java.io.File(engineDir, "modules/flowscript-v3-prototype.js"), "UTF-8")));
var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
var Reader = Packages.com.convertigo.libflowengine.FlowScriptV3Reader;
var checks = 0;
function check(ok, message) { checks++; if (!ok) throw new Error(message); }
function api(name, request) { return JSON.parse(String(engine[name](JSON.stringify(request)))); }
function program(body) {
	return "const _flow = { sourceVersion: 3, inputs: { rows: { type: \"array\" }, options: { type: \"object\" }, flag: { type: \"boolean\" } } }\n" +
		"function Example({ input, config, result }) {\n" + body + "\n}";
}
function node(code, input) {
	var script = "const local = {};\n" + code.replace(/^const _flow = [^\n]*\n/, "") + "\nconst args = { input: JSON.parse(process.argv[1]), config: {}, result: {} };\n" +
		"const value = Example(args);\nprocess.stdout.write(JSON.stringify(value === undefined ? args.result : value));";
	var command = new java.util.ArrayList();
	["node", "-e", script, JSON.stringify(input)].forEach(function (part) { command.add(new java.lang.String(String(part))); });
	var process = new java.lang.ProcessBuilder(command).redirectErrorStream(true).start();
	var reader = new java.io.BufferedReader(new java.io.InputStreamReader(process.getInputStream(), "UTF-8"));
	var output = "", part;
	while ((part = reader.readLine()) !== null) output += String(part);
	check(process.waitFor() === 0, "Node: " + output);
	return output;
}
function same(label, body, input, expected) {
	var code = program(body), lowered = bridge.translate(code);
	check(!lowered.diagnostics.length, label + " bridge: " + JSON.stringify(lowered.diagnostics));
	var read = JSON.parse(String(Reader.read(code, null)));
	check(!read.diagnostics.length, label + " Java reader: " + JSON.stringify(read.diagnostics));
	check(/object\.merge\(/.test(lowered.code), label + " is lowered to object.merge: " + lowered.code);
	var run = api("flowCodeRun", { name: "Example", code: code, input: input, includeTrace: false });
	check(run.ok, label + " run: " + JSON.stringify(run).substring(0, 1200) + "\n" + lowered.code);
	var flow = JSON.stringify(run.result), javascript = node(code, input);
	check(flow === javascript, label + ": Flow " + flow + " but JavaScript " + javascript + "\n" + lowered.code);
	check(flow === JSON.stringify(expected), label + ": " + flow + " instead of " + JSON.stringify(expected));
}
function refuses(label, body, expected, line, hint) {
	var code = program(body), diagnostic = bridge.translate(code).diagnostics[0] || {};
	check(diagnostic.code === expected && diagnostic.line === line && diagnostic.hint.indexOf(hint) >= 0,
		label + " (bridge): " + JSON.stringify(diagnostic));
	var read = JSON.parse(String(Reader.read(code, null))).diagnostics[0] || {};
	check(read.code === diagnostic.code && read.line === line && read.hint === diagnostic.hint && read.message === diagnostic.message,
		label + " (Java reader): " + JSON.stringify(read) + " instead of " + JSON.stringify(diagnostic));
	var run = api("flowCodeRun", { name: "Example", code: code, input: {}, includeTrace: false });
	check(!run.ok && run.error.code === expected, label + " (engine): " + JSON.stringify(run.error));
}

var options = { search: "abc", limit: 5, filter: { a: 1 } };
// The form of the bench: the options of the input, two fields replaced
same("options object", [
	"  local.opts = input.options || {}",
	"  local.filter = local.opts.filter || null",
	"  local.next = Object.assign({}, local.opts, { search: null, filter: local.filter })",
	"  const spread = { ...local.opts, search: null, extra: 1 }",
	"  const copy = { ...input.options }",
	"  const late = { first: 0, ...input.options, second: 2, ...input.missing }",
	"  return { next: local.next, spread, copy, late }"
].join("\n"), { options: options }, {
	next: { search: null, limit: 5, filter: { a: 1 } }, spread: { search: null, limit: 5, filter: { a: 1 }, extra: 1 },
	copy: options, late: { first: 0, search: "abc", limit: 5, filter: { a: 1 }, second: 2 }
});
var rows = [{ id: 1, a: 2, b: 3 }, { id: 2, a: 4, b: 5 }];
same("push, put, a branch and a return", [
	"  const rows = []",
	"  for (const row of input.rows) {",
	"    rows.push({ ...row, total: row.a + row.b })",
	"  }",
	"  const byId = {}",
	"  for (const row of input.rows) {",
	"    byId[row.id] = { ...row, seen: true }",
	"  }",
	"  const flagged = input.flag ? { ...input.rows[0], flag: true } : null",
	"  const empty = { ...input.missing }",
	"  return { ...input.options, rows, byId, flagged, empty }"
].join("\n"), { rows: rows, flag: true }, {
	rows: [{ id: 1, a: 2, b: 3, total: 5 }, { id: 2, a: 4, b: 5, total: 9 }],
	byId: { 1: { id: 1, a: 2, b: 3, seen: true }, 2: { id: 2, a: 4, b: 5, seen: true } },
	flagged: { id: 1, a: 2, b: 3, flag: true }, empty: {}
});

// Refused with the statement to write
refuses("a spread in a block call", "  const t = text.trim({ text: \"a\", ...input.options })\n  return { t }", "FLOWSCRIPT_V3_SPREAD", 3, "const merged = { ...a, k: v }");
refuses("a spread inside an expression", "  const n = [{ ...input.options }].length\n  return { n }", "FLOWSCRIPT_V3_SPREAD", 3, "const merged = { ...a, k: v }");
refuses("Object.assign on an input", "  const merged = Object.assign(input.options, { a: 1 })\n  return { merged }", "FLOWSCRIPT_V3_GLOBAL_CALL", 3, "Object.assign changes its first argument");
refuses("Object.assign as a statement", "  const o = {}\n  Object.assign(o, { a: 1 })\n  return { o }", "FLOWSCRIPT_V3_GLOBAL_CALL", 4, "Object.assign changes its first argument");
refuses("a push into a local path of no type", "  local.parts = []\n  local.parts.push(input.options)\n  return { parts: local.parts }", "FLOWSCRIPT_V3_UNTYPED_LIST", 4,
	"Initialize local.parts with the type of its items: local.parts = json.array({ itemType: { type: \"CHOOSE_TYPE\" } }), or declare const parts = []");
print("flowscript-v3-object-merge OK (" + checks + " checks)");
