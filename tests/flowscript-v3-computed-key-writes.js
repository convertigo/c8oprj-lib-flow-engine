// FlowScript v3 writes under a computed key (bench L3: groups[key] = value was refused, the agent grouped by sorting then
// looping). On a local object (const groups = {}) or map (json.map), groups[key] = v, groups[key] += v and groups[key]++
// are json.put, a number key being its text as in JavaScript: the Flow gives what Node gives on the same source, aliases
// and key order included. Any other computed key (result, a loop item, a list, a nested field, an input) and a push under
// a computed key are refused with FLOWSCRIPT_V3_COMPUTED_WRITE and the form to write, the same by the bridge and the Java
// reader, instead of the v2 INVALID_DESTINATION of the lowered path.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("flow-v3-computed-key-").toFile().getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var bridge = eval(String(files.readFileToString(new java.io.File(engineDir, "modules/flowscript-v3-prototype.js"), "UTF-8")));
var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
var Reader = Packages.com.convertigo.libflowengine.FlowScriptV3Reader;
var checks = 0;
function check(ok, message) { checks++; if (!ok) throw new Error(message); }
function api(name, request) { return JSON.parse(String(engine[name](JSON.stringify(request)))); }
function program(body) {
	return "const _flow = { sourceVersion: 3, inputs: { items: { type: \"array\" }, k: { type: \"string\" }, v: { type: \"number\" } } }\n" +
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
	check(/json\.put\(/.test(lowered.code), label + " is lowered to json.put: " + lowered.code);
	var run = api("flowCodeRun", { name: "Example", code: code, input: input, includeTrace: false });
	check(run.ok, label + " run: " + JSON.stringify(run).substring(0, 1200) + "\n" + lowered.code);
	var flow = JSON.stringify(run.result), javascript = node(code, input);
	check(flow === javascript, label + ": Flow " + flow + " but JavaScript " + javascript + "\n" + lowered.code);
	check(flow === JSON.stringify(expected), label + ": " + flow + " instead of " + JSON.stringify(expected));
}
function refuses(label, body, line, hint) {
	var code = program(body), diagnostic = bridge.translate(code).diagnostics[0] || {};
	check(diagnostic.code === "FLOWSCRIPT_V3_COMPUTED_WRITE" && diagnostic.line === line && diagnostic.hint.indexOf(hint) >= 0,
		label + " (bridge): " + JSON.stringify(diagnostic));
	var read = JSON.parse(String(Reader.read(code, null))).diagnostics[0] || {};
	check(read.code === diagnostic.code && read.line === line && read.hint === diagnostic.hint && read.message === diagnostic.message,
		label + " (Java reader): " + JSON.stringify(read) + " instead of " + JSON.stringify(diagnostic));
	var run = api("flowCodeRun", { name: "Example", code: code, input: {}, includeTrace: false });
	check(!run.ok && run.error.code === "FLOWSCRIPT_V3_COMPUTED_WRITE", label + " (engine): " + JSON.stringify(run.error));
}

var items = [{ id: 1, tag: "a", name: "x", v: 2 }, { id: 2, tag: "b", name: "y", v: 3 }, { id: 1, tag: "a", name: "z", v: 4 }];
// The grouping of the bench, without sorting first
same("group by a computed key", [
	"  const groups = {}",
	"  for (const item of input.items) {",
	"    const key = item.tag",
	"    if (groups[key] === undefined) {",
	"      groups[key] = []",
	"    }",
	"    groups[key] = groups[key].concat([item.name])",
	"  }",
	"  return { groups }"
].join("\n"), { items: items }, { groups: { a: ["x", "z"], b: ["y"] } });
// counts by a number key, totals with +=, ++ and -- under a key, a literal key
same("count, total and update under a key", [
	"  const counts = {}",
	"  const totals = { a: 0 }",
	"  for (const item of input.items) {",
	"    counts[item.id] = (counts[item.id] || 0) + 1",
	"    totals[item.tag] = totals[item.tag] || 0",
	"    totals[item.tag] += item.v",
	"    totals[item.tag] *= 1",
	"  }",
	"  totals[\"a\"]++",
	"  totals[\"b\"]--",
	"  return { counts, totals }"
].join("\n"), { items: items }, { counts: { 1: 2, 2: 1 }, totals: { a: 7, b: 2 } });
// the object is shared, as in JavaScript, and its keys keep the JavaScript order (integer keys first)
same("alias and key order", [
	"  const groups = {}",
	"  const alias = groups",
	"  groups[\"b\"] = 1",
	"  groups[2] = 2",
	"  groups[input.k] = 3",
	"  groups[1] = 4",
	"  const keys = Object.keys(groups)",
	"  return { alias, keys }"
].join("\n"), { k: "a" }, { alias: { 1: 4, 2: 2, b: 1, a: 3 }, keys: ["1", "2", "b", "a"] });

// Refused with the form to write: a key that is not on a local object or map, a push under a computed key
refuses("a key of result", "  result[input.k] = 1", 3, "const groups = {}");
refuses("a key of a loop item", "  for (const row of input.items) {\n    row[input.k] = 1\n  }", 4, "const groups = {}");
refuses("an item of a list", "  const rows = json.array({ itemType: { type: \"number\" } })\n  rows.push(1)\n  rows[0] = 2\n  return { rows }", 5, "building a new list");
refuses("a key of a nested field", "  const o = { a: {} }\n  o.a[input.k] = 1\n  return { o }", 4, "const groups = {}");
refuses("an update of an input key", "  input.counts[input.k]++", 3, "groups[key]++");
refuses("a push under a computed key", "  const groups = {}\n  groups[input.k] = []\n  groups[input.k].push(1)\n  return { groups }", 5,
	"groups[key] = groups[key].concat([value])");
print("flowscript-v3-computed-key-writes OK (" + checks + " checks)");
