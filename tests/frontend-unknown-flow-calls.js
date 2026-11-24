// A page calling a Flow that does not exist (".deals_lisst"): the write was accepted, dev.sync too, and the page showed
// nothing, without a word (scripted scenario of the plan, 24/11). The page now says it (warning
// FRONTEND_CALLS_UNKNOWN_FLOW), without refusing the write: the Flow may be written after its Page, as a link to a Page
// not written yet (decision of 23/11). Only a target whose projects are all loaded is said unknown.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var checks = 0;
function assertTrue(condition, message) { checks++; if (!condition) throw new Error(message); }
function loadService(name) {
	return eval(String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "modules/" + name), "UTF-8")));
}
var requestables = loadService("requestable-service.js");
var deals = {
	getClass: function () { return { getName: function () { return "com.twinsoft.convertigo.beans.flow.Flow"; } }; },
	getProject: function () { return { getName: function () { return "Crm"; } }; },
	getVariables: function () { return []; }
};
var loaded = { Crm: true };
var env = {
	currentProjectName: function (request) { return request.project; },
	requestableByQName: function (qname) { return qname === "Crm.deals_list" ? deals : null; },
	projectLoaded: function (name) { return loaded[name] === true; }
};
var request = { project: "Crm" };
assertTrue(requestables.targetUnknown(request, ".deals_list", env) === false, "a Flow that exists is not unknown");
assertTrue(requestables.targetUnknown(request, ".deals_lisst", env) === true, "a Flow missing from a loaded project is unknown");
assertTrue(requestables.targetUnknown(request, "Crm.deals_lisst", env) === true, "the same with its project named");
assertTrue(requestables.targetUnknown(request, "Billing.invoices", env) === false, "a project not loaded here cannot tell");
assertTrue(["fs://crm.deals", "/api/deals", "", "  "].every(function (target) { return requestables.targetUnknown(request, target, env) === false; }),
	"FullSync, URL Mapper and empty targets are not looked up");
assertTrue(requestables.targetUnknown(request, ".x", { currentProjectName: env.currentProjectName,
	requestableByQName: function () { throw new Error("no engine"); }, projectLoaded: function () { throw new Error("no engine"); } }) === false,
	"an engine without its objects cannot tell");

var tree = loadService("flow-tree-service.js");
function call(id, requestable) {
	return { sourceKind: "callSequence", props: { requestable: requestable }, sourceMutationPath: "structure.children[" + id + "]",
		sourcePath: "/p/Crm/_flow/frontbuilder/svelte/model/Crm/src/routes/deals/+page.flow.svelte", sourceLine: 7, sourceColumn: 7, children: [] };
}
var root = { sourceKind: "page", props: {}, children: [call(0, ".deals_list"), call(1, ".deals_lisst")] };
var treeEnv = {
	requestableInputContract: function (requestable) { return requestable === ".deals_list" ? { accessibility: "Public", target: { kind: "flow", qname: "Crm.deals_list" } } : null; },
	requestableTargetUnknown: function (requestable, req) { return requestables.targetUnknown(req, requestable, env); }
};
var diagnostics = tree.frontendCallContractDiagnostics(root, request, treeEnv);
assertTrue(diagnostics.length === 1, "one diagnostic, for the unknown Flow only: " + JSON.stringify(diagnostics));
var warning = diagnostics[0];
assertTrue(warning.code === "FRONTEND_CALLS_UNKNOWN_FLOW" && warning.severity === "warning" && warning.level === "warning",
	"a warning, not an error: the write goes on");
assertTrue(warning.path === "structure.children[1].props.requestable" && warning.line === 7 && warning.requestable === ".deals_lisst",
	"it names the CallSequence and its target");
assertTrue(/\.deals_lisst, which does not exist/.test(warning.message) && /shows nothing/.test(warning.message) &&
	/flow-list/.test(warning.hint), "it says the consequence and how to fix it: " + JSON.stringify(warning));
assertTrue(tree.frontendCallContractDiagnostics(root, request, { requestableInputContract: treeEnv.requestableInputContract }).length === 0,
	"without the engine lookup (headless), nothing is said");
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
assertTrue(/requestableTargetUnknown: requestableTargetUnknown,/.test(source) && /function requestableTargetUnknown\(target, request\)/.test(source),
	"the engine gives the lookup to the tree service");
print("frontend-unknown-flow-calls OK (" + checks + " checks)");
