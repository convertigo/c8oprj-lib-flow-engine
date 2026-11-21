// FlowScript v3 locals named current, parent or trace (bench of 21/11: const current = entity.read({ … }) refused with
// FLOWSCRIPT_V3_RESERVED_NAME in five runs). The reader writes every read of a local as local.<name>, so such a local is
// never read as the scope of the same name: the Flow gives what Node gives on the same source, the local next to a list
// arrow, a for…of item and a destructured field that the reader reads as current. current stays refused, with the call
// that reads it, where a list.* or flow.forEach call of the source reads current as its item; the bridge and the Java
// reader refuse it the same way.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("flow-v3-scope-locals-").toFile().getAbsolutePath());
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
	check(/local\.(?:current|parent|trace)\b/.test(lowered.code), label + " writes the local as local.<name>: " + lowered.code);
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
	check(diagnostic.code === "FLOWSCRIPT_V3_RESERVED_NAME" && diagnostic.line === line && diagnostic.hint.indexOf(hint) >= 0,
		label + " (bridge): " + JSON.stringify(diagnostic));
	var read = JSON.parse(String(Reader.read(code, null))).diagnostics[0] || {};
	check(read.code === diagnostic.code && read.line === line && read.hint === diagnostic.hint && read.message === diagnostic.message,
		label + " (Java reader): " + JSON.stringify(read) + " instead of " + JSON.stringify(diagnostic));
	var run = api("flowCodeRun", { name: "Example", code: code, input: {}, includeTrace: false });
	check(!run.ok && run.error.code === "FLOWSCRIPT_V3_RESERVED_NAME", label + " (engine): " + JSON.stringify(run.error));
}

var rows = [{ id: 1, v: 2, tag: "a" }, { id: 2, v: 3, tag: "b" }, { id: 3, v: 4, tag: "a" }];
// The forms of the bench: the record read first, then compared with the others
same("current next to a list arrow, an item and a destructured field", [
	"  const current = input.rows[0]",
	"  const others = input.rows.filter(row => row.id !== current.id)",
	"  let total = 0",
	"  for (const row of input.rows) {",
	"    if (row.id !== current.id) {",
	"      total += row.v",
	"    }",
	"  }",
	"  let same = 0",
	"  for (const { tag } of input.rows) {",
	"    if (tag === current.tag) {",
	"      same++",
	"    }",
	"  }",
	"  return { current, others: others.length, total, same }"
].join("\n"), { rows: rows }, { current: rows[0], others: 2, total: 7, same: 2 });
same("parent and trace", [
	"  const parent = { id: input.rows[1].id }",
	"  let trace = \"\"",
	"  for (const row of input.rows) {",
	"    trace += row.tag",
	"  }",
	"  const ids = input.rows.map(row => row.id + parent.id)",
	"  return { parent, trace, ids }"
].join("\n"), { rows: rows }, { parent: { id: 2 }, trace: "aba", ids: [3, 4, 5] });

// current stays refused where a list.* or flow.forEach call reads it as its item
refuses("current next to list.filter", [
	"  const current = input.rows[0]",
	"  const tagged = list.filter({ items: input.rows, where: current.tag === \"a\" })",
	"  return { tagged }"
].join("\n"), 3, "current is the item of the list.filter call at line 4");
refuses("current next to flow.forEach", [
	"  let total = 0",
	"  let current = 0",
	"  flow.forEach({ items: input.rows, $$nodes() {",
	"    total += current.v",
	"  } })",
	"  return { total }"
].join("\n"), 4, "current is the item of the forEach call at line 5");
// the other scope names stay refused
refuses("result", "  const result = 1", 3, "Choose another local name than result.");
print("flowscript-v3-scope-name-locals OK (" + checks + " checks)");
