// FlowScript v3 regular expression literals. A pattern step (/p/f.test(s), s.match(/p/f), s.replace(/p/f, y),
// s.replaceAll(/p/g, y), s.split(/p/f)) is the text block that does the same (text.match, text.replace or text.split with
// regex: true), run before its statement in a hidden local, as the whole value of a declaration, an assignment or a
// return, in a branch of a whole ?:, or where a value or an if condition always evaluates it:
//   const ok = /^[0-9]+$/.test(v)    and    if (/^[0-9]{1,2}$/.test(v)) { … }
// were refused, while the diagnostic said such a literal is rewritten to text.match. Anywhere else the literal is refused
// (FLOWSCRIPT_V3_PATTERN) with the block to write, by both readers. The Flow gives what Node gives on the same source.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-v3-patterns-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var Reader = Packages.com.convertigo.libflowengine.FlowScriptV3Reader;
var checks = 0;
function check(ok, message) { checks++; if (!ok) throw new Error(message); }

try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	var bridge = eval(String(files.readFileToString(new java.io.File(engineDir, "modules/flowscript-v3-prototype.js"), "UTF-8")));
	var codeService = eval(String(files.readFileToString(new java.io.File(engineDir, "modules/flow-code-service.js"), "UTF-8")));
	function api(name, request) { return JSON.parse(String(engine[name](JSON.stringify(request)))); }
	function program(body) {
		return 'const _flow = { sourceVersion: 3, inputs: { v: { type: "string" }, csv: { type: "string" }, flag: { type: "boolean" } } }\n\n' +
			'function Example({ input, config, result }) {\n' + body + '\n}\n';
	}
	function node(code, input) {
		var script = code.replace(/^const _flow = [^\n]*\n/, "") +
			'\nconst args = { input: JSON.parse(process.argv[1]), config: {}, result: {} };\nconst value = Example(args);\n' +
			'process.stdout.write(JSON.stringify(value === undefined ? args.result : value));';
		var command = new java.util.ArrayList();
		["node", "-e", script, JSON.stringify(input)].forEach(function (part) { command.add(new java.lang.String(String(part))); });
		var process = new java.lang.ProcessBuilder(command).redirectErrorStream(true).start();
		var reader = new java.io.BufferedReader(new java.io.InputStreamReader(process.getInputStream(), "UTF-8"));
		var output = "", part;
		while ((part = reader.readLine()) !== null) output += String(part);
		check(process.waitFor() === 0, "Node: " + output);
		return output;
	}
	// Both readers lower the source alike, and the Flow gives what Node gives on each input.
	function same(label, body, inputs) {
		var code = program(body), direct = JSON.parse(String(Reader.read(code, null)));
		check(!direct.diagnostics.length, label + " Java reader: " + JSON.stringify(direct.diagnostics));
		var lowered = bridge.translate(code);
		check(!lowered.diagnostics.length, label + " bridge: " + JSON.stringify(lowered.diagnostics));
		var oracle = api("flowSourceValidate", { name: "Example", code: lowered.code, skipAnalysis: true });
		check(oracle.ok, label + " oracle: " + JSON.stringify(oracle).substring(0, 1200) + "\n" + lowered.code);
		oracle.definition.flow = Object.assign({}, oracle.definition.flow || {}, { sourceVersion: 3 });
		check(codeService.comparableDefinition(oracle.definition) === codeService.comparableDefinition(direct.definition),
			label + " same definition:\n" + codeService.comparableDefinition(oracle.definition) + "\n" + codeService.comparableDefinition(direct.definition));
		var validation = api("flowSourceValidate", { name: "Example", code: code });
		check(validation.ok, label + " validation: " + JSON.stringify(validation).substring(0, 1200));
		inputs.forEach(function (input) {
			var run = api("flowCodeRun", { name: "Example", code: code, input: input, includeTrace: false });
			check(run.ok, label + " run: " + JSON.stringify(run).substring(0, 1200));
			var javascript = node(code, input);
			check(JSON.stringify(run.result) === javascript, label + " " + JSON.stringify(input) + ": Flow " + JSON.stringify(run.result) + " but JavaScript " + javascript);
		});
		var rendered = api("flowCodeMigrateV3", { name: "Example", code: code, rerender: true });
		check(rendered.ok, label + " rendering: " + JSON.stringify(rendered).substring(0, 1200));
		return direct.definition;
	}
	var inputs = [{ v: "12", csv: "a, b,c", flag: true }, { v: "12a", csv: "", flag: false }, { v: "12\n", csv: "x" }, { v: " Big  apple ", csv: "1;2, 3" }];

	// The two forms of the bench.
	var declared = same("declaration", '  const ok = /^[0-9]+$/.test(input.v)\n  return { ok }', inputs);
	check(declared.nodes[0].block === "text.match" && declared.nodes[0].props.text === "${String(input.v)}" && declared.nodes[0].props.pattern === "^[0-9]+$" &&
		declared.nodes[1].props.value === "${local.__chain1.matched}", "the test is text.match: " + JSON.stringify(declared.nodes));
	same("if condition", '  if (/^[0-9]{1,2}$/.test(input.v)) {\n    result.short = true\n  } else if (/a/i.test(input.v)) {\n    result.short = false\n  }', inputs);
	// The other exact forms, as v2 reads them, and the places a value always evaluates.
	same("negated and in a return", '  return { invalid: !/^[0-9]+$/.test(input.v), count: input.csv.split(/[,;]\\s*/).length }', inputs);
	same("replace and chain", '  const clean = input.v.replace(/\\s+/g, " ").trim()\n  const first = input.v.replace(/[0-9]/, "#")\n' +
		'  const all = input.v.replaceAll(/[0-9]/g, "#")\n  const swapped = input.csv.replace(/(\\w+),\\s*(\\w+)/, "$2-$1")\n  return { clean, first, all, swapped }', inputs);
	same("receiver chain", '  const words = input.v.replace(/\\s+/g, " ").trim().split(/ /)\n  const pieces = input.csv.trim().split(/,/).length\n  return { words, pieces }', inputs);
	same("match", '  const digits = input.v.match(/[0-9]+/g)\n  const lead = input.v.match(/^[0-9]/)\n  return { digits, lead }', inputs);
	same("split loop", '  let count = 0\n  for (const part of input.csv.split(/\\s*[,;]\\s*/)) {\n    if (/^[a-z0-9]+$/.test(part)) {\n      count++\n    }\n  }\n  return { count }', inputs);
	same("ternary branch", '  const kept = input.flag ? input.v.replace(/[^0-9]/g, "") : input.v\n  const kind = /^[0-9]+$/.test(input.v) ? "number" : "text"\n  return { kept, kind }', inputs);
	same("multiline flag", '  let lines = 0\n  if (/^b/im.test(input.v) || input.flag) {\n    lines = 1\n  }\n  return { lines }', inputs);

	// Elsewhere the literal is refused by both readers, with the block to write for that case.
	function refuses(label, body, line, proposal) {
		var code = program(body), read = JSON.parse(String(Reader.read(code, null))).diagnostics[0] || {}, oracle = bridge.translate(code).diagnostics[0] || {};
		check(read.code === "FLOWSCRIPT_V3_PATTERN" && read.line === line && read.hint.indexOf(proposal) >= 0, label + ": " + JSON.stringify(read));
		check(oracle.code === read.code && oracle.line === read.line && oracle.message === read.message && oracle.hint === read.hint,
			label + " (bridge): " + JSON.stringify(oracle) + " instead of " + JSON.stringify(read));
		var validation = api("flowSourceValidate", { name: "Example", code: code });
		check(!validation.ok && JSON.stringify(validation).indexOf("FLOWSCRIPT_V3_PATTERN") >= 0, label + " validation: " + JSON.stringify(validation).substring(0, 800));
	}
	refuses("lazy operand", '  const ok = input.flag && /x/.test(input.v)\n  return { ok }', 4, 'const vMatch = text.match({ text: String(input.v), pattern: "x" }), then read vMatch.matched');
	refuses("lazy if operand", '  let n = 0\n  if (input.flag || /^[0-9]+$/.test(input.v)) {\n    n = 1\n  }\n  return { n }', 5, 'pattern: "^[0-9]+$" })');
	refuses("list arrow", '  const kept = input.csv.split(",").filter(item => /^a/.test(item))\n  return { kept }', 4, 'const itemMatch = text.match({ text: String(item), pattern: "^a" })');
	refuses("while condition", '  let s = input.v\n  while (/  /.test(s)) {\n    s = s.replace("  ", " ")\n  }\n  return { s }', 5, 'const sMatch = text.match({ text: String(s), pattern: "  " })');
	refuses("replace with a function", '  const r = input.v.replace(/a/g, x => x.toUpperCase())\n  return { r }', 4, 'const vReplaced = text.replace({ text: input.v, search: "a"');
	refuses("unsupported flag", '  const ok = /x/y.test(input.v)\n  return { ok }', 4, 'The flags of a pattern are g, i, m and s; "y" has others.');
	refuses("pattern property", '  const m = text.match({ text: input.v, pattern: /\\d+/ })\n  return { m }', 4, 'pattern: "\\\\d+"');

	print("flowscript-v3-patterns: " + checks + " checks passed");
} finally {
	files.deleteQuietly(project);
}
