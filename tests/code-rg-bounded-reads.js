// A bounded search stops reading sources once it has enough extracts, while
// preserving order, working copies, revisions, literal/regex matching and errors.
var File = java.io.File, files = Packages.org.apache.commons.io.FileUtils;
var dir = new File(arguments.length ? arguments[0] : "_flow");
var service = eval(String(files.readFileToString(new File(dir, "modules/flow-code-service.js"), "UTF-8")));
var names = [], reads = [], checks = 0;
for (var i = 0; i < 40; i++) names.push({name:"Source" + i});
function assert(value, message) { checks++; if (!value) throw new Error(message); }
var env = {
 currentProjectName:function () { return "Test"; },
 listProjectFlows:function () { return {flows:names}; },
 readProjectFlowWorkingCode:function (name) { return name === "Source1" ? {code:"needle draft",revision:"draft"} : null; },
 flowScriptReadRequest:function (_, request) { reads.push(request.name); return {code:"needle saved\nneedle again",revision:request.name}; }
};
var out = service.flowCodeRgRequest({}, {pattern:"needle",limit:3}, env);
assert(out.extracts.length === 3, "Wrong limit");
assert(reads.join() === "Source0", "Read sources past the matching working copy: " + reads);
assert(out.extracts[2].qname === "Test.Source1" && out.extracts[2].revision === "draft", "Draft order/revision lost");
assert(out.revision === null, "Project search has no single revision");
reads = [];
out = service.flowCodeRgRequest({}, {qname:"Test.Source2",pattern:"NEEDLE",limit:1}, env);
assert(out.extracts.length === 1 && out.revision === "Source2", "Case-insensitive single-source read changed");
reads = [];
out = service.flowCodeRgRequest({}, {pattern:"absent",limit:1}, env);
assert(reads.length === 39 && out.extracts.length === 0, "No-match search must visit all sources including the draft");
var error = false;
try { service.flowCodeRgRequest({}, {pattern:"[",regex:true}, env); } catch (expected) { error = true; }
assert(error, "Invalid regex must still fail");
print("code-rg-bounded-reads: " + checks + " checks passed");
