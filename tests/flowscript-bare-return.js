// A bare return leaves the Flow with the result written so far, as in JavaScript. It was lowered to a return block
// whose value was the empty template "${}", so the Flow answered the text "${}" instead of its result fields (code-run,
// the HTTP facade and the static output schema, typed string). An empty value is now refused rather than lowered to
// "${}". A bare return in the body of a loop is covered by flowscript-loop-return.js.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-bare-return-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(name, request) { return JSON.parse(String(engine[name](JSON.stringify(request)))); }
	function flow(body) {
		return 'const _flow = {\n  sourceVersion: 2,\n  inputs: {\n    user: { type: "string", default: "" },\n    flag: { type: "string", default: "false" },\n  },\n}\n\n' +
			'function SessionState({ input, config, result, local }) {\n' + body + '\n}\n';
	}
	function run(source, input) {
		var out = api("run", { flowSource: source, input: input || {}, includeTrace: false });
		assert(out.ok, "The run failed: " + JSON.stringify(out.error));
		return out.result;
	}

	// The early exit of a branch keeps the result fields; the code after the branch does not run.
	var early = flow([
		'  local.enabled = String(input.flag) === "true"',
		'  if (!input.user) {',
		'    result.authenticated = false',
		'    result.enabled = local.enabled',
		'    return',
		'  }',
		'  result.authenticated = true',
		'  result.enabled = local.enabled',
		'  result.user = input.user'
	].join("\n"));
	var anonymous = run(early, { flag: "true" });
	assert(JSON.stringify(anonymous) === '{"authenticated":false,"enabled":true}', "A bare return answers the result written so far, not \"${}\": " + JSON.stringify(anonymous));
	var signedIn = run(early, { user: "ada", flag: "false" });
	assert(JSON.stringify(signedIn) === '{"authenticated":true,"enabled":false,"user":"ada"}', "Without the early exit, the Flow runs to its end: " + JSON.stringify(signedIn));

	// The same with a semicolon, in an else branch, and as the last statement of the Flow.
	var semicolon = run(flow([
		'  if (input.user) {',
		'    result.state = "known"',
		'  } else {',
		'    result.state = "anonymous";',
		'    return;',
		'  }',
		'  result.after = true',
		'  return'
	].join("\n")), {});
	assert(JSON.stringify(semicolon) === '{"state":"anonymous"}', "return; in an else branch leaves with the result: " + JSON.stringify(semicolon));
	var trailing = run(flow('  result.state = "done"\n  return'), {});
	assert(JSON.stringify(trailing) === '{"state":"done"}', "A final bare return is the end of the Flow: " + JSON.stringify(trailing));

	// The compiled node is a return without value (the result), and the source renders back to a valid Flow.
	var validated = api("flowSourceValidate", { name: "SessionState", code: early });
	assert(validated.ok, "The Flow validates: " + JSON.stringify(validated.diagnostics));
	var branch = validated.definition.nodes.filter(function (node) { return node.block === "if"; })[0];
	var exit = branch.then[branch.then.length - 1];
	assert(exit.block === "return" && (!exit.props || exit.props.value === undefined), "The bare return has no value: " + JSON.stringify(exit));
	assert(JSON.stringify(validated).indexOf('"${}"') === -1, "No empty template is compiled: " + JSON.stringify(validated.definition));

	// The static output schema is the result object, no longer a string.
	var schema = api("outputSchema", { flowSource: early });
	assert(schema.ok, "The output schema is computed: " + JSON.stringify(schema));
	var properties = schema.schema && schema.schema.properties || {};
	assert(schema.schema.type !== "string" && properties.authenticated && properties.enabled,
		"The output schema describes the result fields: " + JSON.stringify(schema.schema));

	print("OK flowscript-bare-return (" + checks + " checks)");
} finally {
	files.deleteQuietly(project);
}
