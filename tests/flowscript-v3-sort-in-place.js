// FlowScript v3 xs.sort(comparator) as a statement (bench of 21/11, L36F: lines.sort((a, b) => a.id < b.id ? -1 : …) was
// refused with FLOWSCRIPT_V3_FUNCTION, as if the comparator were a local function). On a list the Flow builds (const
// lines = [] or json.array), never assigned and never read whole before the sort or in a loop around it, the statement
// is list.sort into the local itself, with the comparators of toSorted: the Flow gives what Node gives. Elsewhere it is
// refused with FLOWSCRIPT_V3_LIST_METHOD and the toSorted to write, the same by the bridge and the Java reader.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("flow-v3-sort-in-place-").toFile().getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var bridge = eval(String(files.readFileToString(new java.io.File(engineDir, "modules/flowscript-v3-prototype.js"), "UTF-8")));
var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
var Reader = Packages.com.convertigo.libflowengine.FlowScriptV3Reader;
var checks = 0;
function check(ok, message) { checks++; if (!ok) throw new Error(message); }
function api(name, request) { return JSON.parse(String(engine[name](JSON.stringify(request)))); }
function program(body) {
	return "const _flow = { sourceVersion: 3, inputs: { rows: { type: \"array\" } } }\n" +
		"function Example({ input, config, result }) {\n" + body + "\n}";
}
function node(code, input) {
	var script = "const json = { array: () => [] };\n" + code.replace(/^const _flow = [^\n]*\n/, "") +
		"\nconst args = { input: JSON.parse(process.argv[1]), config: {}, result: {} };\n" +
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
	check(/local\.(\w+) = list\.sort\(\{ items: local\.\1,/.test(lowered.code), label + " sorts into the local: " + lowered.code);
	var read = JSON.parse(String(Reader.read(code, null)));
	check(!read.diagnostics.length, label + " Java reader: " + JSON.stringify(read.diagnostics));
	var run = api("flowCodeRun", { name: "Example", code: code, input: input, includeTrace: false });
	check(run.ok, label + " run: " + JSON.stringify(run).substring(0, 1200) + "\n" + lowered.code);
	var flow = JSON.stringify(run.result), javascript = node(code, input);
	check(flow === javascript, label + ": Flow " + flow + " but JavaScript " + javascript + "\n" + lowered.code);
	check(flow === JSON.stringify(expected), label + ": " + flow + " instead of " + JSON.stringify(expected));
}
function refuses(label, body, line, hint) {
	var code = program(body), diagnostic = bridge.translate(code).diagnostics[0] || {};
	check(diagnostic.code === "FLOWSCRIPT_V3_LIST_METHOD" && diagnostic.line === line && diagnostic.hint.indexOf(hint) >= 0,
		label + " (bridge): " + JSON.stringify(diagnostic));
	var read = JSON.parse(String(Reader.read(code, null))).diagnostics[0] || {};
	check(read.code === diagnostic.code && read.line === line && read.hint === diagnostic.hint && read.message === diagnostic.message,
		label + " (Java reader): " + JSON.stringify(read) + " instead of " + JSON.stringify(diagnostic));
	var run = api("flowCodeRun", { name: "Example", code: code, input: {}, includeTrace: false });
	check(!run.ok && run.error.code === "FLOWSCRIPT_V3_LIST_METHOD", label + " (engine): " + JSON.stringify(run.error));
}

var rows = [{ id: "c", n: 2, label: "b" }, { id: "a", n: 1, label: "a" }, { id: "b", n: 2, label: "a" }];
// The form of the bench: the lines built, sorted in place, then read
same("natural comparator on a built list", [
	"  const lines = json.array({ itemType: { type: \"object\" } })",
	"  for (const row of input.rows) {",
	"    lines.push({ id: row.id, n: row.n })",
	"  }",
	"  lines.sort((a, b) => (a.id < b.id ? -1 : (a.id > b.id ? 1 : 0)))",
	"  let text = \"\"",
	"  for (const line of lines) {",
	"    text += line.id",
	"  }",
	"  return { text, count: lines.length }"
].join("\n"), { rows: rows }, { text: "abc", count: 3 });
same("number, locale and several keys, in a loop", [
	"  const ids = json.array({ itemType: { type: \"integer\" } })",
	"  const byLabel = []",
	"  for (const row of input.rows) {",
	"    ids.push(row.n)",
	"    ids.sort((a, b) => b - a)",
	"    byLabel.push({ label: String(row.label), id: String(row.id) })",
	"  }",
	"  byLabel.sort((a, b) => a.label.localeCompare(b.label) || b.id.localeCompare(a.id))",
	"  return { ids, byLabel }"
].join("\n"), { rows: rows }, { ids: [2, 2, 1], byLabel: [{ label: "a", id: "b" }, { label: "a", id: "a" }, { label: "b", id: "c" }] });

// Refused with the toSorted to write
var hint = "write const sorted = lines.toSorted((a, b) => a.n - b.n) and read sorted";
refuses("a list of the input", "  const lines = input.rows\n  lines.sort((a, b) => a.n - b.n)\n  return { lines }", 4, hint);
refuses("a list read whole before", "  const lines = json.array({ itemType: { type: \"object\" } })\n  result.before = lines\n  lines.sort((a, b) => a.n - b.n)", 5, hint);
refuses("a list read whole in the loop", [
	"  const lines = json.array({ itemType: { type: \"object\" } })",
	"  for (const row of input.rows) {",
	"    lines.push(row)",
	"    lines.sort((a, b) => a.n - b.n)",
	"    result.last = lines",
	"  }"
].join("\n"), 6, hint);
refuses("an inexact comparator", "  const lines = json.array({ itemType: { type: \"object\" } })\n  lines.sort((a, b) => a.n < b.n ? -1 : 1)\n  return { lines }", 4,
	"Compare one key of the two items");
print("flowscript-v3-sort-in-place OK (" + checks + " checks)");
