// FlowScript v3 local functions (bench of 21/11: const blank = v => v === undefined || v === null || v === "" refused
// with FLOWSCRIPT_V3_FUNCTION in five runs, twelve times). A const arrow or function whose body is one expression, without
// block call, writes no node: each call is that expression, a parameter replaced by its argument, so it is read anywhere an
// expression is (a condition after &&, a list arrow, a template), and a local it reads is read when it is called, as
// JavaScript does. The Flow gives what Node gives on the same source. A function with statements, a let, a function passed
// as a value, a block call in its body or a call as a statement are refused with FLOWSCRIPT_V3_FUNCTION and the form to
// write (the arrow, or the top-level helper with its parameters), the same by the bridge and the Java reader.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("flow-v3-local-functions-").toFile().getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var bridge = eval(String(files.readFileToString(new java.io.File(engineDir, "modules/flowscript-v3-prototype.js"), "UTF-8")));
var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
var Reader = Packages.com.convertigo.libflowengine.FlowScriptV3Reader;
var checks = 0;
function check(ok, message) { checks++; if (!ok) throw new Error(message); }
function api(name, request) { return JSON.parse(String(engine[name](JSON.stringify(request)))); }
function program(body) {
	return "const _flow = { sourceVersion: 3, inputs: { rows: { type: \"array\" }, sort: { type: \"string\" } } }\n" +
		"function Example({ input, config, result }) {\n" + body + "\n}";
}
function node(code, input) {
	var script = code.replace(/^const _flow = [^\n]*\n/, "") + "\nconst args = { input: JSON.parse(process.argv[1]), config: {}, result: {} };\n" +
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
	var run = api("flowCodeRun", { name: "Example", code: code, input: input, includeTrace: false });
	check(run.ok, label + " run: " + JSON.stringify(run).substring(0, 1200) + "\n" + lowered.code);
	var flow = JSON.stringify(run.result), javascript = node(code, input);
	check(flow === javascript, label + ": Flow " + flow + " but JavaScript " + javascript + "\n" + lowered.code);
	check(flow === JSON.stringify(expected), label + ": " + flow + " instead of " + JSON.stringify(expected));
}
function refuses(label, body, line, hint) {
	var code = program(body), diagnostic = bridge.translate(code).diagnostics[0] || {};
	check(diagnostic.code === "FLOWSCRIPT_V3_FUNCTION" && diagnostic.line === line && diagnostic.hint.indexOf(hint) >= 0,
		label + " (bridge): " + JSON.stringify(diagnostic));
	var read = JSON.parse(String(Reader.read(code, null))).diagnostics[0] || {};
	check(read.code === diagnostic.code && read.line === line && read.hint === diagnostic.hint && read.message === diagnostic.message,
		label + " (Java reader): " + JSON.stringify(read) + " instead of " + JSON.stringify(diagnostic));
	var run = api("flowCodeRun", { name: "Example", code: code, input: {}, includeTrace: false });
	check(!run.ok && run.error.code === "FLOWSCRIPT_V3_FUNCTION", label + " (engine): " + JSON.stringify(run.error));
}

var rows = [{ name: "a", v: 1 }, { name: "", v: 2 }, { name: null, v: 3 }];
// The forms of the bench: a test of blank values, in conditions, list arrows and templates
same("expression functions", [
	"  const blank = v => v === undefined || v === null || v === \"\"",
	"  const label = (row, suffix) => `${row.name}${suffix}`",
	"  const twice = function (n) { return n * 2 }",
	"  let sort = \"code\"",
	"  if (!blank(input.sort) && input.sort !== \"none\") {",
	"    sort = input.sort",
	"  }",
	"  const named = input.rows.filter(row => !blank(row.name))",
	"  const labels = named.map(row => label(row, \"!\"))",
	"  const missing = blank(input.missing) ? twice(input.rows.length) : 0",
	"  return { sort, named: named.length, labels, missing }"
].join("\n"), { rows: rows, sort: "name" }, { sort: "name", named: 1, labels: ["a!"], missing: 6 });
// a loop item read by a local function called in a list arrow and in an inner loop; a local read when it is called
same("captured item and local", [
	"  let factor = 1",
	"  const scale = n => n * factor",
	"  factor = 10",
	"  let total = 0",
	"  for (const row of input.rows) {",
	"    const plus = n => n + row.v",
	"    const values = input.rows.map(other => plus(other.v))",
	"    for (const other of input.rows) {",
	"      total += plus(other.v) - other.v",
	"    }",
	"    total += values[0] + scale(row.v)",
	"  }",
	"  return { total }"
].join("\n"), { rows: rows }, { total: 87 });

// Refused with the form to write
refuses("statements", [
	"  const fail = message => {",
	"    throw { code: \"INVALID\", message }",
	"  }",
	"  return {}"
].join("\n"), 3, "function fail({ message }) { … }, called fail({ message: … }) in its own statement");
refuses("a let", "  let same = x => x\n  return { v: same(1) }", 3, "const same = (x) => …");
refuses("a nested function declaration", "  function check(text, size) { return text.length < size }\n  return {}", 3,
	"function check({ text, size }) { … }, called check({ text: …, size: … })");
refuses("a function passed as a value", "  const same = x => x\n  const all = [same]\n  return { all }", 4, "Call the local function same(…)");
refuses("a block call in its body", "  const trimmed = t => text.trim({ text: t })\n  return { v: trimmed(\" a \") }", 3, "call text.trim in its own statement");
refuses("a call as a statement", "  const same = x => x\n  same(1)\n  return {}", 4, "read it in an expression (const ok = same(…))");
refuses("a call of itself", "  const loop = n => n > 0 ? loop(n - 1) : 0\n  return { v: loop(2) }", 3, "does not call itself");
print("flowscript-v3-local-functions OK (" + checks + " checks)");
