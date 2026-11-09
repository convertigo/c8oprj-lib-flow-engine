// A local read that no node of the Flow assigns is null when the Flow runs, and the Flow goes on with it: code-check
// warns (FLOWSCRIPT_LOCAL_NOT_ASSIGNED) with the line of the read and the closest assigned name. Assignments, $$out,
// write paths, the paths blocks publish (the error of a try, a collection created by path) and parent.x of a chunk loop
// count wherever they are in the Flow, a loop reading a name before the step that assigns it included.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-unassigned-local-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function write(file, text) { files.writeStringToFile(file, String(text), "UTF-8"); }
function read(file) { return String(files.readFileToString(file, "UTF-8")); }
try {
	write(new java.io.File(project, "_flow/blocks/demo/page.block.js"), [
		'const _meta = {',
		'  description: "Takes the first rows of a list.",',
		'  properties: {',
		'    rows: { kind: "expression", type: "array" },',
		'    size: { kind: "expression", type: "integer" }',
		'  },',
		'  outputs: { out: { type: "object", properties: { rows: { type: "array" }, total: { type: "integer" } } } }',
		'}',
		'function page({ input, result }) {',
		'  local.taken = list.take({ items: input.rows, count: input.size })',
		'  result.rows = local.taken',
		'  result.total = input.rows.length',
		'  return result',
		'}',
		''
	].join("\n"));
	var engine = eval(read(new java.io.File(engineDir, "Engine.js")));
	function api(method, request) { return JSON.parse(engine[method](JSON.stringify(request))); }
	function unassigned(out) {
		return (out.diagnostics || []).filter(function (diagnostic) { return diagnostic.code === "FLOWSCRIPT_LOCAL_NOT_ASSIGNED"; });
	}
	function flow(name, body) {
		var code = ['const _flow = { sourceVersion: 2, inputs: { rows: { type: "array", default: [1, 2, 3] } } }']
			.concat(body.helpers || [])
			.concat(['function ' + name + '({ input, result }) {'], body.lines, ['}', '']).join("\n");
		write(new java.io.File(project, "_flow/flows/" + name + ".flow.js"), code);
		return code;
	}

	// the name read is close to the one assigned
	flow("Misread", { lines: [
		'  local.pageAll = demo.page({ rows: input.rows, size: 2 })',
		'  result.count = local.page.rows.length',
		'  result.total = local.pageAll.total'
	] });
	var checked = api("flowCodeCheck", { name: "Misread" });
	var found = unassigned(checked);
	assert(checked.ok === true && found.length === 1, "one unassigned local is reported: " + JSON.stringify(checked));
	assert(found[0].severity === "warning" && found[0].line === 4 && found[0].path === "local.page.rows.length" && found[0].message.indexOf("local.page is read") === 0,
		"as a warning on the line of the read: " + JSON.stringify(found[0]));
	assert(JSON.stringify(found[0].candidates) === '["local.pageAll"]' && found[0].message.indexOf("Did you mean local.pageAll?") !== -1 &&
		found[0].next.indexOf("local.pageAll") !== -1, "with the closest assigned name: " + JSON.stringify(found[0]));
	var run = api("flowCodeRun", { name: "Misread" });
	assert(run.ok === true && run.result.total === 3 && run.result.count == null, "the run confirms the read is empty: " + JSON.stringify(run.result));
	var set = api("flowCodeSet", { name: "Misread", code: read(new java.io.File(project, "_flow/flows/Misread.flow.js")).replace("local.page.rows", "local.pageAll.rows") });
	assert(set.ok === true && unassigned(set).length === 0, "the corrected read is not reported: " + JSON.stringify(set));

	// nothing close: the read in a loop body, in a template, in a catch, and a local a helper assigns in its own scope
	flow("Unrelated", {
		helpers: ['function remember(value) {', '  local.kept = value', '}'],
		lines: [
			'  forEach({ items: input.rows, $$nodes() {',
			'    local.sum = local.runningTotal + current',
			'  }})',
			'  result.label = `total ${local.missingLabel}`',
			'  try({',
			'    $$try() {',
			'      throw({ code: "DOWN", message: "down" })',
			'    },',
			'    $$catch() {',
			'      result.code = local.err.code',
			'    }',
			'  })',
			'  remember({ value: 3 })',
			'  result.kept = local.kept',
			'  result.sum = local.sum'
		] });
	found = unassigned(api("flowCodeCheck", { name: "Unrelated", maxDiagnostics: 25 }));
	var byLocal = {};
	found.forEach(function (diagnostic) { byLocal[/^local\.\w+/.exec(diagnostic.path)[0]] = diagnostic; });
	assert(found.length === 4 && byLocal["local.runningTotal"] && byLocal["local.missingLabel"] && byLocal["local.err"] && byLocal["local.kept"],
		"each read without assignment is reported: " + JSON.stringify(found));
	assert(byLocal["local.runningTotal"].line === 7 && byLocal["local.missingLabel"].line === 9 && byLocal["local.err"].line === 15 &&
		byLocal["local.kept"].line === 19, "on the line of its read, not of the slot or the helper: " + JSON.stringify(found));
	assert(!byLocal["local.runningTotal"].candidates && byLocal["local.err"].candidates[0] === "local.error",
		"a candidate only when a name is close (the error of the try): " + JSON.stringify(found));
	run = api("flowCodeRun", { name: "Unrelated" });
	assert(run.ok === true && run.result.kept == null && run.result.sum == null && run.result.code == null && run.result.label === "total ",
		"the run confirms each read is empty, a helper keeping its own local: " + JSON.stringify(run.result));

	// valid Flows: nothing reported
	flow("Valid", { lines: [
		'  try({',
		'    $$try() {',
		'      throw({ code: "DOWN", message: "down" })',
		'    },',
		'    $$catch() {',
		'      result.code = local.error.code',
		'    }',
		'  })',
		'  try({',
		'    error: "local.failure",',
		'    $$try() {',
		'      throw({ code: "AGAIN", message: "again" })',
		'    },',
		'    $$catch() {',
		'      result.failure = local.failure.code',
		'    }',
		'  })',
		'  local.sum = 0',
		'  forEach({ items: input.rows, $$nodes() {',
		'    local.pairs = local.previous + current',
		'    local.previous = current',
		'    local.sum = local.sum + current',
		'  }})',
		'  json.array({ path: "local.collected", itemType: { type: "integer" } })',
		'  forEach({ items: input.rows, $$nodes() {',
		'    json.push({ path: "local.collected", value: current })',
		'  }})',
		'  result.collected = local.collected',
		'  text.trim({ text: " x ", $$out: "local.trimmed" })',
		'  result.trimmed = local.trimmed',
		'  const parsed = json.parse({ text: "{\\"a\\":{\\"b\\":1}}" })',
		'  result.b = parsed.a.b',
		'  local.deep.child = 1',
		'  result.deep = local.deep.child',
		'  if (input.rows.length > 0) {',
		'    local.branch = "some"',
		'  } else {',
		'    local.branch = "none"',
		'  }',
		'  result.branch = `rows: ${local.branch}`',
		'  local.first = demo.page({ rows: input.rows, size: 1 })',
		'  result.first = local.first.rows',
		'  local.chunks = forEachChunk({ source: input.rows, size: 2, $$each: function ({ chunk }) {',
		'    parent.lastChunkSize = chunk.rows.length',
		'    return chunk.rows',
		'  } })',
		'  result.chunks = local.chunks.chunks',
		'  result.lastChunkSize = local.lastChunkSize',
		'  local.attempts = 0',
		'  local.poll = flow.poll({ until: local.attempts >= 2, intervalMs: 10, timeoutMs: 1000, maxAttempts: 3, $$nodes: function () {',
		'    local.attempts = local.attempts + 1',
		'  } })',
		'  result.polled = local.poll.completed',
		'  result.names = list.map({ items: input.rows, select: { n: current } })',
		'  result.sum = local.sum'
	] });
	checked = api("flowCodeCheck", { name: "Valid", maxDiagnostics: 25 });
	assert(checked.ok === true && unassigned(checked).length === 0, "a valid Flow is not reported: " + JSON.stringify(checked));
	run = api("flowCodeRun", { name: "Valid" });
	assert(run.ok === true, "the valid Flow runs: " + JSON.stringify(run).substring(0, 1500));
	var text = JSON.stringify(run.result);
	assert(['"code":"DOWN"', '"failure":"AGAIN"', '"collected":[1,2,3]', '"trimmed":"x"', '"b":1', '"deep":1', '"branch":"rows: some"',
		'"first":[1]', '"chunks":2', '"lastChunkSize":1', '"polled":true', '"sum":6'].every(function (part) { return text.indexOf(part) !== -1; }),
		"and runs with every local it reads: " + text);
	print("code-check-unassigned-local OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(project);
}
