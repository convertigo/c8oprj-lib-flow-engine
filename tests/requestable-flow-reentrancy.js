var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var blockFile = new java.io.File(engineDir, "blocks/requestable/call.block.js");
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(blockFile, "UTF-8"));
var runtimeSource = source.substring(source.indexOf("\n(function ()"));

function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

function HashMap() {
	this.values = {};
}
HashMap.prototype.put = function (key, value) {
	this.values[String(key)] = value;
};

var internalRequests = 0;
var lastInternalRequest = null;
function InternalRequester(request) {
	internalRequests++;
	lastInternalRequest = request;
}
InternalRequester.prototype.processRequest = function () {
	throw new Error("REGULAR_REQUEST_PATH");
};

var targetEngineQName = "lib_flow_engine.Engine";
var targetProject = {
	getName: function () { return "ChildProject"; },
	getDirPath: function () { return "/projects/ChildProject"; },
	getFlowEngine: function () {
		return { getEngineQName: function () { return targetEngineQName; } };
	}
};
var targetFlow = {
	getName: function () { return "Child"; },
	getQName: function () { return "ChildProject.Child"; },
	getProject: function () { return targetProject; },
	getClass: function () {
		return { getName: function () { return "com.twinsoft.convertigo.beans.flow.Flow"; } };
	},
	getFlowSource: function () { return "function Child({ input, result }) { return result }"; }
};
var targetDbo = targetFlow;
// The server-side tag domain: each project has its own context, as FlowEngineBridge captures it.
var tagDomainAvailable = true;
var tagContexts = [];
var tagManager = {
	runContext: function (project) {
		if (!tagDomainAvailable) {
			throw new Error("no tag domain");
		}
		tagContexts.push(String(project.getName()));
		return JSON.stringify({ project: String(project.getName()), tags: { t: { metadata: { flow: { configs: ["Lab"] } } } },
			assignments: { "ChildProject.sq:Child": ["t"] }, aliases: { "ChildProject.Child": "ChildProject.sq:Child" } });
	}
};
var packages = {
	java: {
		lang: {
			String: {},
			reflect: {
				Array: {
					newInstance: function (type, length) { return new Array(length); },
					set: function (array, index, value) { array[index] = value; },
					get: function (array, index) { return array[index]; },
					getLength: function (array) { return array.length; }
				}
			}
		},
		util: {
			HashMap: HashMap,
			UUID: { randomUUID: function () { return "uuid"; } }
		}
	},
	com: {
		twinsoft: {
			convertigo: {
				engine: {
					Engine: {
						theApp: {
							databaseObjectsManager: {
								getDatabaseObjectByQName: function () { return targetDbo; }
							}
						}
					},
					flow: { FlowEngineBridge: { DEFAULT_ENGINE_QNAME: "lib_flow_engine.Engine" } },
					requesters: { InternalRequester: InternalRequester },
					tags: { TagManager: { get: function () { return tagManager; } } },
					util: { XMLUtils: {} }
				}
			}
		}
	}
};

var implementation = (function (Packages) {
	return eval(runtimeSource);
})(packages);

function runContext(engineQName, execution) {
	var calls = [];
	return {
		calls: calls,
		request: { engineQName: engineQName },
		props: function (node) { return node.props || {}; },
		template: function (value) { return value; },
		convertigoContext: function () { return { httpServletRequest: {} }; },
		runFlowSource: function (flowSource, config, options) {
			calls.push({ flowSource: flowSource, config: config, options: options });
			return execution;
		},
		raise: function (code, message) {
			var error = new Error(message);
			error.code = code;
			throw error;
		}
	};
}

var directContext = runContext("lib_flow_engine.Engine", { ok: true, result: { value: "direct" } });
var direct = implementation.run(directContext, {
	props: { requestable: "ChildProject.Child", input: { name: "Nicolas" } }
});
assertTrue(direct.value === "direct", "same-engine Flow call did not return its direct result");
assertTrue(directContext.calls.length === 1, "same-engine Flow call did not use ctx.runFlowSource exactly once");
assertTrue(internalRequests === 0, "same-engine Flow call re-entered InternalRequester");
assertTrue(directContext.calls[0].options.project === "ChildProject" &&
	directContext.calls[0].options.projectDir === "/projects/ChildProject" &&
	directContext.calls[0].options.input.name === "Nicolas",
	"same-engine Flow call did not preserve target identity, project root or input");
// The called Flow keeps its own identity and the tag context of its own project, so its named
// configurations follow its tags exactly as through the regular requestable path.
var directOptions = directContext.calls[0].options;
assertTrue(directOptions.flowQName === "ChildProject.Child" && directOptions.flowName === "Child",
	"same-engine Flow call lost the identity of the called Flow: " + JSON.stringify(directOptions));
assertTrue(directOptions.tagContext && directOptions.tagContext.project === "ChildProject" &&
	directOptions.tagContext.assignments["ChildProject.sq:Child"][0] === "t",
	"same-engine Flow call did not carry the tag context of the called Flow's project");
var parentTagged = runContext("lib_flow_engine.Engine", { ok: true, result: {} });
parentTagged.request.tagContext = { project: "ParentProject", tags: {}, assignments: {}, aliases: {} };
implementation.run(parentTagged, { props: { requestable: "ChildProject.Child", input: {} } });
assertTrue(parentTagged.calls[0].options.tagContext.project === "ChildProject",
	"a called Flow inherited the tag context of its caller's project");
tagDomainAvailable = false;
var sameProject = runContext("lib_flow_engine.Engine", { ok: true, result: {} });
sameProject.request.tagContext = { project: "ChildProject", tags: {}, assignments: {}, aliases: {} };
implementation.run(sameProject, { props: { requestable: "ChildProject.Child", input: {} } });
assertTrue(sameProject.calls[0].options.tagContext === sameProject.request.tagContext,
	"without the tag domain, a call inside the caller's project did not reuse its tag context");
implementation.run(parentTagged, { props: { requestable: "ChildProject.Child", input: {} } });
assertTrue(parentTagged.calls[1].options.tagContext === undefined,
	"without the tag domain, a call into another project reused the caller's tag context");
tagDomainAvailable = true;

var failedContext = runContext("lib_flow_engine.Engine", {
	ok: false,
	error: { code: "CHILD_FAILED", message: "Child failed" }
});
var failed = implementation.run(failedContext, {
	props: { requestable: "ChildProject.Child", input: {} }
});
assertTrue(failed.error.code === "CHILD_FAILED" && internalRequests === 0,
	"same-engine Flow failure did not remain a regular requestable error envelope");

function assertCacheControlUsesRegularPath(input, controlName) {
	var before = internalRequests;
	var controlContext = runContext("lib_flow_engine.Engine", { ok: true, result: {} });
	var regularPath = false;
	try {
		implementation.run(controlContext, {
			props: { requestable: "ChildProject.Child", input: input }
		});
	} catch (e) {
		regularPath = String(e && e.message || e).indexOf("REGULAR_REQUEST_PATH") !== -1;
	}
	assertTrue(regularPath && internalRequests === before + 1 && controlContext.calls.length === 0,
		controlName + " did not preserve the regular Convertigo requestable boundary");
}

assertCacheControlUsesRegularPath({
	__responseExpiryDate: "absolute,86400"
}, "__responseExpiryDate");
assertCacheControlUsesRegularPath({
	__nocache: true
}, "__nocache");

targetEngineQName = "another_engine.Engine";
var externalContext = runContext("lib_flow_engine.Engine", { ok: true, result: {} });
var beforeExternal = internalRequests;
var regularPath = false;
var regularError = "";
try {
	implementation.run(externalContext, { props: { requestable: "ChildProject.Child", input: {} } });
} catch (e) {
	regularError = String(e && e.message || e);
	regularPath = regularError.indexOf("REGULAR_REQUEST_PATH") !== -1;
}
assertTrue(regularPath && internalRequests === beforeExternal + 1 && externalContext.calls.length === 0,
	"different-engine Flow call did not preserve the regular Convertigo requestable path: " +
	regularError + " / requests=" + internalRequests + " / direct=" + externalContext.calls.length);

var connector = { getName: function () { return "Connector"; } };
targetDbo = {
	getProject: function () { return targetProject; },
	getClass: function () {
		return { getName: function () { return "com.twinsoft.convertigo.beans.transactions.couchdb.PostDocumentTransaction"; } };
	},
	getConnector: function () { return connector; },
	getVariable: function (name) {
		return {
			isMultiValued: function () { return String(name) === "users"; }
		};
	}
};
var transactionContext = runContext("lib_flow_engine.Engine", { ok: true, result: {} });
var transactionFailedAtRequester = false;
try {
	implementation.run(transactionContext, {
		props: {
			requestable: "ChildProject.Connector.UserListSet",
			input: {
				users: ["aaaa", "bbbb"],
				metadata: ["one", "two"]
			}
		}
	});
} catch (e) {
	transactionFailedAtRequester = String(e && e.message || e).indexOf("REGULAR_REQUEST_PATH") !== -1;
}
assertTrue(transactionFailedAtRequester, "transaction input did not reach InternalRequester");
assertTrue(lastInternalRequest.values.users instanceof Array &&
	lastInternalRequest.values.users.length === 2 &&
	lastInternalRequest.values.users[0] === "aaaa" &&
	lastInternalRequest.values.users[1] === "bbbb",
	"multi-valued requestable input was flattened instead of becoming a String array");
assertTrue(lastInternalRequest.values.metadata === '["one","two"]',
	"scalar requestable input no longer preserves JSON array serialization");

print("requestable-flow-reentrancy OK");
