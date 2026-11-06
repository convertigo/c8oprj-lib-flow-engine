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
HashMap.prototype.remove = function (key) {
	delete this.values[String(key)];
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

// the classes of the JDK and of the engine, by their full names, as the engine gives them to the scripts it evaluates
function flowEngineClass(name) {
	return String(name).split(".").reduce(function (value, key) { return value === undefined ? undefined : value[key]; }, packages);
}
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
		},
		throwFlow: function (options) {
			var error = new Error(options.message);
			error.code = options.code;
			error.status = options.status;
			error.details = options.details;
			error.hint = options.hint;
			throw error;
		}
	};
}


// Deterministic overlap at the requester handoff: its return value belongs to A,
// but the shared Studio Context has already been reinitialized by B before JS resumes.
var sharedContext={nativeJsonResponse:{}};
var requests=[];
packages.com.twinsoft.convertigo.engine.requesters.NativeJsonRequester=function(request,http){this.request=request;this.http=http;this.context=sharedContext;};
var Requester=packages.com.twinsoft.convertigo.engine.requesters.NativeJsonRequester;
Requester.prototype.setRawResult=function(raw){this.raw=raw;};
Requester.prototype.processRequestAsObject=function(){
 requests.push(this.request.values);
 var own={result:{user:{id:this.http.sessionId},records:[{owner:this.http.sessionId}]}};
 sharedContext.nativeJsonResponse=null; // B's initialization after A's response was captured
 return own;
};
implementation=(function(Packages){return eval(runtimeSource);})(packages);
function call(session){
 var ctx=runContext('lib_flow_engine.Engine',{});
 ctx.convertigoContext=function(){return{httpServletRequest:{sessionId:session}};};
 return implementation.run(ctx,{props:{requestable:'ChildProject.Child',input:{}}});
}
var a=call('session-A'),b=call('session-B');
assertTrue(a.user && a.user.id==='session-A','A must keep its own unwrapped result after B reinitializes the shared Context: '+JSON.stringify(a));
assertTrue(b.user && b.user.id==='session-B','B must get its own result');
b.records[0].owner='changed-B';
assertTrue(a.records[0].owner==='session-A','A must never expose B data or share nested caller results');
print('requestable-session-result-handoff OK (two identities; detached requester result, no mutable Context reread)');
Requester.prototype.processRequestAsObject=function(){return {result:{error:{operation:'run',code:'INVALID_DESTINATION',message:'Use a static named path.',hint:'Use local.value.'}}};};
var failure=null;try{call('session-A');}catch(e){failure=e;}
assertTrue(failure && failure.code==='INVALID_DESTINATION' && failure.status===500,'An uncaught child Flow failure without a status must propagate HTTP 500: '+JSON.stringify(failure));
print('requestable-missing-error-status OK');
