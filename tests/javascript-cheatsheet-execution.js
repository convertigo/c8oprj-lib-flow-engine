// Compile and execute the seven source forms shown in the JavaScript to FlowScript guide.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("javascript-cheatsheet-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
function source(body) {
  return 'const _flow = { sourceVersion: 2 }\nfunction Cheat({ input, config, result }) {\n' + body + '\n}\n';
}
function check(name, body, input, expected, errorCode) {
  var code = source(body);
  var compiled = JSON.parse(engine.flowCodeSet(JSON.stringify({ name: "Cheat", code: code, draft: false })));
  assert(compiled.ok === true, name + " must compile: " + JSON.stringify(compiled));
  var executed = JSON.parse(engine.run(JSON.stringify({ flowSource: code, input: input, includeTrace: false })));
  if (errorCode) {
    assert(executed.ok === false && executed.error.code === errorCode,
      name + " must report " + errorCode + ": " + JSON.stringify(executed));
  } else {
    assert(executed.ok === true && JSON.stringify(executed.result) === JSON.stringify(expected),
      name + " must execute: " + JSON.stringify(executed));
  }
}
try {
  check("forEach", '  local.ids = []\n  forEach({ items: input.items, $$nodes() {\n    json.push({ path: "local.ids", value: current.id })\n  } })\n  result.ids = local.ids',
    { items: [{ id: 1 }, { id: 2 }] }, { ids: [1, 2] });
  check("safeParse", '  local.parsed = json.safeParse({ text: input.text })\n  result.ok = local.parsed.ok\n  result.value = local.parsed.value',
    { text: '{"a":1}' }, { ok: true, value: { a: 1 } });
  check("match", '  local.match = text.match({ text: input.code, pattern: "re" })\n  result.matched = local.match.matched',
    { code: "prefix-re-suffix" }, { matched: true });
  var arrayBody = '  json.array({ path: "local.arr", itemType: { type: "unknown" } })\n' +
    '  json.push({ path: "local.arr", value: input.value })\n  result.arr = local.arr';
  check("arrayPushGuide", arrayBody, { value: 7 }, null, "UNKNOWN_VALUE_TYPE");
  check("arrayPushTyped", arrayBody.replace('type: "unknown"', 'type: "number"'),
    { value: 7 }, { arr: [7] });
  check("mapFilter", '  result.mapped = list.map({ items: input.items, select: { id: current.id } })\n  local.filtered = list.filter({ items: input.items, where: current.ok })\n  result.count = local.filtered.length',
    { items: [{ id: 1, ok: true }, { id: 2, ok: false }] }, { mapped: [{ id: 1 }, { id: 2 }], count: 1 });
  check("stringify", '  result.text = json.stringify({ value: input.value })',
    { value: { a: 1 } }, { text: '{"a":1}' });
  var condition = '  local.value = text.trim({ text: input.text })\n  result.hit = false\n' +
    '  if (local.value) { result.hit = true }';
  check("assignedConditionTrue", condition, { text: " yes " }, { hit: true });
  check("assignedConditionFalse", condition, { text: " " }, { hit: false });
  print("javascript-cheatsheet-execution OK (" + checks + " checks)");
} finally {
  files.deleteDirectory(project);
}
