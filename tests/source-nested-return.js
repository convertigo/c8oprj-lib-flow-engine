// A return inside a branch or a loop leaves the Flow, as in JavaScript: the statements
// after it do not run and the other branches' results are not merged.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-nested-return-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(name, request) { return JSON.parse(engine[name](JSON.stringify(request))); }
	function flow(body) { return 'const _flow = { sourceVersion: 2, inputs: { token: { type: "string" } } }\nfunction Returns({ input, config, result }) {\n' + body + '\n}'; }
	function run(body, input) { return api("run", { flowSource: flow(body), input: input || {}, includeTrace: false }); }

	var early = '  if (input.token) {\n    return { token: input.token }\n  }\n  return { notoken: "true" }';
	var withToken = run(early, { token: "abc" });
	assert(withToken.ok && JSON.stringify(withToken.result) === '{"token":"abc"}', "An early return must leave the Flow: " + JSON.stringify(withToken));
	var withoutToken = run(early, {});
	assert(withoutToken.ok && JSON.stringify(withoutToken.result) === '{"notoken":"true"}', "Without the branch, the final return applies: " + JSON.stringify(withoutToken));

	var after = run('  local.count = 1\n  if (local.count == 1) {\n    return { stage: "early" }\n  }\n  local.count = 2\n  result.late = true', {});
	assert(after.ok && JSON.stringify(after.result) === '{"stage":"early"}', "Statements after an early return must not run: " + JSON.stringify(after));

	var inLoop = run('  local.items = ["a", "b", "c"]\n  forEach({ items: local.items, $$nodes: function () {\n    result.last = current\n    if (current == "b") {\n      return { found: current }\n    }\n  } })\n  result.done = true', {});
	assert(inLoop.ok && inLoop.result.found === "b" && inLoop.result.last === "b" && inLoop.result.done === undefined,
		"A return inside a loop must stop the loop and the Flow: " + JSON.stringify(inLoop));

	var branches = run('  if (input.token) {\n    return { login: "ok" }\n  } else {\n    return { login: "ko" }\n  }', { token: "x" });
	assert(branches.ok && JSON.stringify(branches.result) === '{"login":"ok"}', "if/else returns: " + JSON.stringify(branches));

	var plain = api("flowSourceValidate", { name: "Returns", code: flow('  return { notoken: "true" }') });
	assert(plain.ok && plain.definition.nodes.length === 1 && plain.definition.nodes[0].block === "set",
		"The final return stays a result destination: " + JSON.stringify(plain.definition.nodes));
	var nested = api("flowSourceValidate", { name: "Returns", code: flow(early) });
	var thenNodes = nested.definition.nodes[0].then || nested.definition.nodes[0].nodes || [];
	assert(nested.ok && thenNodes.length === 2 && thenNodes[0].block === "set" && thenNodes[1].block === "return",
		"A nested return keeps its result destination then stops: " + JSON.stringify(nested.definition.nodes[0]));

	print("source-nested-return OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(project);
}
