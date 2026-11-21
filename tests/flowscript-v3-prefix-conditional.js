// A conditional expression whose test starts with a prefix operator keeps that operator in FlowScript v3:
// const name = typeof input.name === "string" ? input.name.trim() : "" gave "" for a non-empty text, because Rhino 1.9.2
// places the conditional at the operand of its test (input.name), so both readers cut "typeof" (and "!", "-") from the
// expression they lowered. The Flow gives what Node gives on the same source, run directly, through flow.call from
// another v3 Flow, and with a Java text as input (as a requestable or a Rhino block hands it).
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-v3-prefix-conditional-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var Reader = Packages.com.convertigo.libflowengine.FlowScriptV3Reader;
var checks = 0;
function check(ok, message) { checks++; if (!ok) throw new Error(message); }
function write(relative, text) { files.writeStringToFile(new java.io.File(project, relative), text, "UTF-8"); }

var trimBody = [
	'  const name = typeof input.name === "string" ? input.name.trim() : ""',
	'  const kind = typeof input.name == "string" && input.name != "" ? "text" : "other"',
	'  const off = !input.flag ? "off" : "on"',
	'  const sign = -input.n ? "nonzero" : "zero"',
	'  const nested = !input.flag ? !input.name ? 1 : 2 : 3',
	'  const trimmed = text.trim({ text: typeof input.name === "string" ? input.name : "" })',
	'  let branch = "no"',
	'  if (typeof input.name === "string" ? input.name != "" : false) {',
	'    branch = "yes"',
	'  }',
	'  return { name, kind, off, sign, nested, trimmed, branch, typed: typeof input.name === "string" ? "string" : typeof input.name }'
].join("\n");
var trimSource = 'const _flow = { sourceVersion: 3, inputs: { name: { type: "string" }, flag: { type: "boolean" }, n: { type: "number" } } }\n\n' +
	'function Trim({ input, config, result }) {\n' + trimBody + '\n}\n';
write("_flow/flows/Trim.flow.js", trimSource);
// A Rhino block that hands a java.lang.String, as an HTTP variable or a Java helper does.
write("_flow/blocks/probe/javaText.block.js", [
	'const _meta = {',
	'  "version": 1,',
	'  "description": "Returns a Java text.",',
	'  "runtime": "rhino",',
	'  "outputs": { "out": { "type": "string" } },',
	'}',
	'',
	'(function () {',
	'\treturn { run: function (ctx, node) { return new java.lang.String(" Ada "); } };',
	'}())',
	''
].join("\n"));

try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	var bridge = eval(String(files.readFileToString(new java.io.File(engineDir, "modules/flowscript-v3-prototype.js"), "UTF-8")));
	function api(name, request) { return JSON.parse(String(engine[name](JSON.stringify(request)))); }

	// Both readers keep the operators in the lowered expressions.
	var direct = JSON.parse(String(Reader.read(trimSource, null)));
	check(!direct.diagnostics.length, "Java reader: " + JSON.stringify(direct.diagnostics));
	var values = JSON.stringify(direct.definition.nodes);
	["typeof input.name === \\\"string\\\" ? input.name.trim()", "!input.flag ? \\\"off\\\"", "-input.n ? \\\"nonzero\\\"",
		"!input.flag ? !input.name ? 1 : 2 : 3", "typeof input.name === \\\"string\\\" ? input.name != \\\"\\\" : false"].forEach(function (kept) {
		check(values.indexOf(kept) >= 0, "the Java reader keeps " + kept + ": " + values);
	});
	var lowered = bridge.translate(trimSource);
	check(!lowered.diagnostics.length && lowered.code.indexOf('typeof input.name === "string" ? input.name.trim()') >= 0 &&
		lowered.code.indexOf('!input.flag ? "off"') >= 0 && lowered.code.indexOf('-input.n ? "nonzero"') >= 0,
		"the bridge keeps the operators: " + JSON.stringify(lowered));

	// Node runs the same source.
	function node(input) {
		var script = 'const text = { trim: ({ text }) => String(text).trim() };\n' + trimSource.replace(/^const _flow = [^\n]*\n/, '') +
			'\nprocess.stdout.write(JSON.stringify(Trim({ input: JSON.parse(process.argv[1]), config: {}, result: {} })));';
		var command = new java.util.ArrayList();
		['node', '-e', script, JSON.stringify(input)].forEach(function (part) { command.add(new java.lang.String(String(part))); });
		var process = new java.lang.ProcessBuilder(command).redirectErrorStream(true).start();
		var reader = new java.io.BufferedReader(new java.io.InputStreamReader(process.getInputStream(), "UTF-8"));
		var output = "", part;
		while ((part = reader.readLine()) !== null) output += String(part);
		check(process.waitFor() === 0, "Node: " + output);
		return output;
	}
	function run(source, input) {
		var response = api("run", { flowSource: source, input: input, includeTrace: false });
		check(response.ok === true, "run: " + JSON.stringify(response).substring(0, 1200));
		return response.result;
	}
	var expected = { name: "Ada", kind: "text", off: "off", sign: "nonzero", nested: 2, trimmed: "Ada", branch: "yes", typed: "string" };
	var input = { name: " Ada ", flag: false, n: 2 };
	check(node(input) === JSON.stringify(expected), "Node: " + node(input));
	check(JSON.stringify(run(trimSource, input)) === JSON.stringify(expected), "the Flow gives what Node gives: " + JSON.stringify(run(trimSource, input)));
	var other = { flag: true, n: 0 };
	check(JSON.stringify(run(trimSource, other)) === node(other), "without a name: " + JSON.stringify(run(trimSource, other)) + " but Node " + node(other));

	// Through flow.call from a v3 Flow, with a text of its input and with a Java text.
	var caller = 'const _flow = { sourceVersion: 3, inputs: { name: { type: "string" } } }\n\n' +
		'function Caller({ input, config, result }) {\n' +
		'  const fromInput = flow.call({ flow: "Trim", input: { name: input.name, flag: false, n: 2 } })\n' +
		'  const java = probe.javaText({})\n' +
		'  const fromJava = flow.call({ flow: "Trim", input: { name: java, flag: false, n: 2 } })\n' +
		'  return { fromInput, fromJava }\n}\n';
	var called = run(caller, { name: " Ada " });
	check(JSON.stringify(called.fromInput) === JSON.stringify(expected), "flow.call with a text: " + JSON.stringify(called));
	check(JSON.stringify(called.fromJava) === JSON.stringify(expected), "flow.call with a Java text: " + JSON.stringify(called));

	print("flowscript-v3-prefix-conditional: " + checks + " checks passed");
} finally {
	files.deleteQuietly(project);
}
