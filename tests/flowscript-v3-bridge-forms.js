// Readings of the prototype bridge that the v3 rendering relies on (section 14): the json.push and json.put of a local
// created by json.array or json.map, an explicit json.push call, an object selected by x => ({ … }), the @disabled
// directive and a flow.* block with a slot.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("flow-v3-bridge-forms-").toFile().getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var bridge = eval(String(files.readFileToString(new java.io.File(engineDir, "modules/flowscript-v3-prototype.js"), "UTF-8")));
var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
function api(name, request) { return JSON.parse(String(engine[name](JSON.stringify(request)))); }
function check(ok, message) { if (!ok) throw new Error(message); }
function source(body) { return "const _flow = { sourceVersion: 3, inputs: { items: { type: \"array\" } } }\n\nfunction Example({ input, config, result }) {\n" + body + "\n}\n"; }
function lowered(body) {
	var out = bridge.translate(source(body));
	check(!out.diagnostics.length, "bridge: " + JSON.stringify(out));
	return out.code;
}
function runs(label, body, expected) {
	var result = api("flowCodeRun", { name: "Example", code: source(body), input: { items: [1, 2, 3] }, includeTrace: false });
	check(result.ok && JSON.stringify(result.result) === JSON.stringify(expected), label + ": " + JSON.stringify(result).substring(0, 1200) + "\n" + lowered(body));
}

var typed = "  local.rows = json.array({ itemType: { type: \"number\" } })\n  local.byId = json.map({ valueType: { type: \"number\" } })\n" +
	"  for (const item of input.items) {\n    local.rows.push(item * 2)\n    local.byId[`k${item}`] = item\n  }\n  result.rows = local.rows\n  result.byId = local.byId";
var typedCode = lowered(typed);
check(typedCode.indexOf("json.push({ path: \"local.rows\", value: current * 2 })") >= 0 && typedCode.indexOf("json.put({ path: \"local.byId\", key: `k${current}`, value: current })") >= 0,
	"typed local paths: " + typedCode);
runs("typed local paths", typed, { rows: [2, 4, 6], byId: { k1: 1, k2: 2, k3: 3 } });
var untyped = bridge.translate(source("  local.rows = input.items\n  local.rows.push(4)"));
check(untyped.diagnostics.length && untyped.diagnostics[0].code === "FLOWSCRIPT_V3_UNTYPED_LIST", "an untyped local path is refused: " + JSON.stringify(untyped));
runs("explicit json.push", "  const rows = json.array({ itemType: { type: \"number\" } })\n  json.push({ path: \"local.rows\", value: 7 })\n  return { rows }", { rows: [7] });
check(lowered("  const ids = input.items.map(item => ({ id: item }))").indexOf("select: { id: current }") >= 0, "an object selected by an arrow is the object");
runs("selected object", "  result.ids = input.items.map(item => ({ id: item }))", { ids: [{ id: 1 }, { id: 2 }, { id: 3 }] });
var disabledCode = lowered("  local.rows = json.array({ itemType: { type: \"number\" } })\n  // keep\n  // @disabled\n  local.rows.push(1)\n  result.rows = local.rows");
check(/\/\/ keep\njson\.push\(\{ \$\$disabled: true,\s+path: "local\.rows"/.test(disabledCode) && disabledCode.indexOf("@disabled") < 0,
	"the directive disables the call and stays out of its comment: " + disabledCode);
runs("disabled push", "  local.rows = json.array({ itemType: { type: \"number\" } })\n  // @disabled\n  local.rows.push(1)\n  result.rows = local.rows", { rows: [] });
var pollCode = lowered("  local.n = 0\n  flow.poll({ $$out: \"local.poll\", until: local.n >= 2, intervalMs: 10, timeoutMs: 1000, maxAttempts: 5, $$nodes() { local.n = local.n + 1 } })");
check(/\nflow\.poll\(\{/.test(pollCode) && !/\npoll\(\{/.test(pollCode), "a flow.* block keeps its name: " + pollCode);
runs("flow.poll slot", "  local.n = 0\n  flow.poll({ $$out: \"local.poll\", until: local.n >= 2, intervalMs: 10, timeoutMs: 1000, maxAttempts: 5, $$nodes() { local.n = local.n + 1 } })\n  result.n = local.n", { n: 2 });
print("flowscript-v3-bridge-forms OK");
