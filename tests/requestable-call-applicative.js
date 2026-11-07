// requestable.call raises the failure of a called Flow as the called Flow answered it: an application error (no status)
// stays an application error of the caller, through the regular requester or the direct path; an internal failure stays 500.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "blocks/requestable/call.block.js"), "UTF-8"));
var runtimeSource = source.substring(source.indexOf("\n(function ()"));
function HashMap() { this.values = {}; }
HashMap.prototype.put = function (key, value) { this.values[String(key)] = value; };
HashMap.prototype.remove = function (key) { delete this.values[String(key)]; };
var answer = null;
function NativeJsonRequester(request) { this.request = request; }
NativeJsonRequester.prototype.setRawResult = function () {};
NativeJsonRequester.prototype.processRequestAsObject = function () { return answer; };
function InternalRequester() {}
var project = { getName: function () { return "ChildProject"; }, getDirPath: function () { return "/projects/ChildProject"; },
	getFlowEngine: function () { return { getEngineQName: function () { return "lib_flow_engine.Engine"; } }; } };
var child = { getName: function () { return "Child"; }, getQName: function () { return "ChildProject.Child"; }, getProject: function () { return project; },
	getClass: function () { return { getName: function () { return "com.twinsoft.convertigo.beans.flow.Flow"; } }; },
	getFlowSource: function () { return "function Child({ input, result }) { return result }"; } };
var packages = { java: { lang: { String: {}, reflect: { Array: {} } }, util: { HashMap: HashMap, UUID: { randomUUID: function () { return "uuid"; } } } },
	com: { twinsoft: { convertigo: { engine: {
		Engine: { theApp: { databaseObjectsManager: { getDatabaseObjectByQName: function () { return child; } } } },
		flow: { FlowEngineBridge: { DEFAULT_ENGINE_QNAME: "lib_flow_engine.Engine" } },
		requesters: { InternalRequester: InternalRequester, NativeJsonRequester: NativeJsonRequester },
		tags: { TagManager: { get: function () { throw new Error("no tag domain"); } } },
		util: { XMLUtils: {} } } } } } };
function flowEngineClass(name) {
	return String(name).split(".").reduce(function (value, key) { return value === undefined ? undefined : value[key]; }, packages);
}
var implementation = (function (Packages) { return eval(runtimeSource); })(packages);
function context(direct) {
	return { request: { engineQName: "lib_flow_engine.Engine" }, props: function (node) { return node.props || {}; },
		template: function (value) { return value; }, convertigoContext: function () { return { httpServletRequest: {} }; },
		tryDirectRequestable: direct ? function () { return direct; } : undefined,
		raise: function (code, message) { var error = new Error(message); error.code = code; throw error; },
		throwFlow: function (options, node, flags) { var error = new Error(options.message); error.options = options; error.flags = flags; throw error; } };
}
function raised(ctx, props) {
	try { implementation.run(ctx, { props: props || { requestable: "ChildProject.Child", input: {} } }); }
	catch (error) { return { code: error.options && error.options.code, status: error.options && error.options.status, applicative: !!(error.flags && error.flags.applicative) }; }
	return null;
}
var failures = [];
function expect(label, actual, expected) {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push(label + ": " + JSON.stringify(actual) + " != " + JSON.stringify(expected));
}
function regular(error) { answer = { document: { error: error, attr: {} }, failed: true }; return raised(context()); }
// Through the regular requester: the envelope of the called Flow tells its kind (no status: application error).
expect("regular, child application error", regular({ code: "CHILD_REFUSED", operation: "run", path: "throw", message: "No", hint: "" }),
	{ code: "CHILD_REFUSED", applicative: true });
expect("regular, child application error with its status", regular({ code: "ENTITY_FORBIDDEN", operation: "run", path: "deny", message: "No", hint: "", status: 403 }),
	{ code: "ENTITY_FORBIDDEN", status: 403, applicative: true });
expect("regular, child internal failure", regular({ code: "FLOW_ENGINE_ERROR", operation: "run", path: "", message: "x", hint: "", status: 500 }),
	{ code: "FLOW_ENGINE_ERROR", status: 500, applicative: false });
expect("regular, error document of the engine", regular({ type: "c8o", code: "-1", message: "Unable to run" }),
	{ code: "-1", status: 500, applicative: false });
answer = { document: { error: { code: "CHILD_REFUSED", operation: "run", path: "throw", message: "No", hint: "" }, attr: {} }, failed: true };
var returned = implementation.run(context(), { props: { requestable: "ChildProject.Child", input: {}, onError: "return" } });
expect("onError return", returned && returned.error && [returned.error.code, returned.error.operation], ["CHILD_REFUSED", undefined]);
// The direct path carries the kind of the error of the called Flow.
expect("direct, child application error", raised(context({ handled: true, failed: true, applicative: true,
	value: { error: { code: "CHILD_REFUSED", operation: "run", message: "No", hint: "" } } })), { code: "CHILD_REFUSED", applicative: true });
expect("direct, child internal failure", raised(context({ handled: true, failed: true,
	value: { error: { code: "FLOW_ENGINE_ERROR", operation: "run", message: "x", hint: "" } } })), { code: "FLOW_ENGINE_ERROR", status: 500, applicative: false });
if (failures.length) throw new Error("requestable-call-applicative:\n" + failures.join("\n"));
print("requestable-call-applicative OK");
