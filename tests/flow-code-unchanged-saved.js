// A live Flow clears its draft for code identical to the official source. Its reply must describe that state.
var root = new java.io.File(arguments[0]);
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(root, "modules/flow-code-service.js"), "UTF-8"));
var module = eval(source), saved = "function Hello({result}) { result.ok = true }\n", working = null;
function assert(ok, message) { if (!ok) throw new Error(message); }
var env = {
  currentProjectName: function () { return "orders"; },
  normalizeFlowScriptCode: function (code) { return code; }, stripFlowScriptMirrorHeader: function (code) { return code; }, sha256Hex: function (code) { return code; },
  projectFlowBean: function () { return {}; },
  readProjectFlowWorkingCode: function (_, draftOnly) { return working ? { code: working, revision: working } : draftOnly ? null : { code: saved, revision: saved }; },
  writeProjectFlowWorkingCode: function (_, code) { working = code === saved ? null : code; return { code: code, revision: code, draft: working !== null }; },
  flowScriptReadRequest: function () { return { code: saved, revision: saved, canonical: true, format: "flowscript" }; },
  flowScriptValidateRequest: function () { return { ok: true, definition: { flow: {} }, diagnostics: [], source: "" }; }
};
var same = module.flowCodeDraftSetRequest({}, { project: "orders" }, "Hello", saved, env);
assert(same.ok && !same.draft && !same.written && same.canonical, "Identical source is already saved");
assert(module.flowCodeDraftRead("Hello", { project: "orders" }, env) === null, "No stale memory draft remains");
var changed = module.flowCodeDraftSetRequest({}, { project: "orders" }, "Hello", saved + "// change\n", env);
assert(changed.ok && changed.draft && changed.written && !changed.canonical, "An edit still creates a working copy");
var reverted = module.flowCodeDraftSetRequest({}, { project: "orders" }, "Hello", saved, env);
assert(reverted.ok && !reverted.draft && module.flowCodeDraftRead("Hello", { project: "orders" }, env) === null, "Reverting to saved source clears the draft too");
print("flow-code-unchanged-saved OK");
