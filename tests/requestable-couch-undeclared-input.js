// A CouchDB or FullSync transaction builds its document and its query from its declared variables only: requestable.call
// refuses an input key the transaction does not declare (REQUESTABLE_UNDECLARED_INPUT, 400) instead of letting
// Convertigo drop it (a postDocument given _use_json_base without declaring it wrote an empty document; a view given key
// instead of _use_key returned every row). The refusal names the declared variables and the spelling to write; declared
// keys, the controls and the other transactions are unchanged. Checked on the real runtime, with the classes of the
// Convertigo engine the block reads replaced by fixtures in this test only. Names are fixtures.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath()), files = Packages.org.apache.commons.io.FileUtils;
var project = java.nio.file.Files.createTempDirectory("flow-couch-undeclared-").toFile(), __flowProjectDir = String(project.getAbsolutePath());
var context = { httpServletRequest: { fixture: true } };
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }

function transaction(className, name, variables, connector) {
	var list = new java.util.ArrayList();
	variables.forEach(function (variable) { list.add({ getName: function () { return variable; } }); });
	return {
		getName: function () { return name; },
		getProject: function () { return { getName: function () { return "Fixture"; } }; },
		getConnector: function () { return { getName: function () { return connector || "couch"; } }; },
		getClass: function () { return { getName: function () { return className; } }; },
		getVariable: function (key) { return variables.indexOf(String(key)) >= 0 ? { isMultiValued: function () { return false; } } : null; },
		getVariablesList: function () { return list; }
	};
}
var couch = "com.twinsoft.convertigo.beans.transactions.couchdb.";
var requestables = {
	"Fixture.couch.PostTicket": transaction(couch + "PostDocumentTransaction", "PostTicket", ["title", "tag"]),
	"Fixture.couch.PostWhole": transaction(couch + "PostDocumentTransaction", "PostWhole", ["_use_json_base"]),
	"Fixture.couch.ByTag": transaction(couch + "GetViewTransaction", "ByTag", ["_use_include_docs", "_use_key"]),
	"Fixture.http.Get": transaction("com.twinsoft.convertigo.beans.transactions.HttpTransaction", "Get", ["q"], "http")
};
var requests = [];
function Requester(request) { this.request = request; }
Requester.prototype.setRawResult = function () {};
Requester.prototype.processRequestAsObject = function () {
	var seen = {}, keys = this.request.keySet().iterator();
	while (keys.hasNext()) {
		var key = String(keys.next());
		seen[key] = String(this.request.get(key));
	}
	requests.push(seen);
	return { document: { couchdb_output: { ok: true } } };
};
var fixtureClasses = {
	"com.twinsoft.convertigo.engine.Engine": { theApp: { databaseObjectsManager: { getDatabaseObjectByQName: function (qname) { return requestables[String(qname)] || null; } } } },
	"com.twinsoft.convertigo.engine.requesters.NativeJsonRequester": Requester
};
function fixtureClass(name, engineClass) {
	return Object.prototype.hasOwnProperty.call(fixtureClasses, String(name)) ? fixtureClasses[String(name)] : engineClass(name);
}
var original = String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var anchor = "scope.flowEngineClass = engineClass;";
assert(original.split(anchor).length === 2, "Engine.js gives the classes of the engine to the scripts it evaluates in one place");
try {
	var engine = eval(original.replace(anchor, "scope.flowEngineClass = function (name) { return fixtureClass(name, engineClass); };"));
	function call(target, input) {
		var before = requests.length;
		var source = "const _flow = { sourceVersion: 3, inputs: { doc: { type: \"object\" } } }\nfunction Example({ input, config, result }) {\n" +
			"  const saved = requestable.call({ requestable: \"" + target + "\", input: " + input + " })\n  return { saved }\n}\n";
		var out = JSON.parse(String(engine.run(JSON.stringify({ flowSource: source, input: { doc: { title: "T", tag: "a" } }, includeTrace: false }))));
		return { out: out, requests: requests.slice(before) };
	}
	function refused(target, input, keys) {
		var answer = call(target, input), error = answer.out.error || {};
		assert(answer.requests.length === 0, target + " " + input + " reached CouchDB: " + JSON.stringify(answer.requests));
		assert(answer.out.ok === false && error.code === "REQUESTABLE_UNDECLARED_INPUT" && error.status === 400,
			target + " " + input + " was not refused: " + JSON.stringify(answer.out).substring(0, 800));
		assert(JSON.stringify(error.details.keys) === JSON.stringify(keys), "the refusal names the undeclared keys only: " + JSON.stringify(error.details));
		return error;
	}

	// postDocument given the whole document as _use_json_base without declaring it: the empty document of the bench
	var whole = refused("Fixture.couch.PostTicket", "{ _use_json_base: input.doc }", ["_use_json_base"]);
	assert(JSON.stringify(whole.details.declared) === "[\"title\",\"tag\"]" && /Declared: title, tag/.test(whole.message),
		"the refusal lists the declared variables: " + JSON.stringify(whole));
	assert(/_use_json_base/.test(whole.hint) && /flow-fullsync-scaffold/.test(whole.hint), "the hint gives the forms to write: " + whole.hint);
	// an undeclared document field beside declared ones
	refused("Fixture.couch.PostTicket", "{ title: \"T\", tag: \"a\", status: \"OPEN\" }", ["status"]);
	// a view given key instead of _use_key: the hint names the spelling to write
	var view = refused("Fixture.couch.ByTag", "{ key: \"a\", include_docs: true }", ["key", "include_docs"]);
	assert(view.hint.indexOf("key as _use_key") >= 0 && view.hint.indexOf("include_docs as _use_include_docs") >= 0,
		"the hint gives the _use_ names: " + view.hint);

	// Declared variables, controls and other transactions are unchanged
	var declared = call("Fixture.couch.PostTicket", "{ title: \"T\", tag: \"a\", __nocache: \"true\" }");
	assert(declared.out.ok === true && declared.requests.length === 1 && declared.requests[0].title === "T" && declared.requests[0].tag === "a",
		"declared variables are sent: " + JSON.stringify(declared).substring(0, 600));
	var json = call("Fixture.couch.PostWhole", "{ _use_json_base: input.doc }");
	assert(json.out.ok === true && json.requests.length === 1 && json.requests[0]._use_json_base === "{\"title\":\"T\",\"tag\":\"a\"}",
		"a declared _use_json_base receives the document as JSON: " + JSON.stringify(json).substring(0, 600));
	var keyed = call("Fixture.couch.ByTag", "{ _use_key: \"a\" }");
	assert(keyed.out.ok === true && keyed.requests.length === 1 && keyed.requests[0]._use_key === "a", "a declared view variable is sent: " + JSON.stringify(keyed));
	var other = call("Fixture.http.Get", "{ q: 1, extra: 2 }");
	assert(other.out.ok === true && other.requests.length === 1 && other.requests[0].extra === "2",
		"another kind of transaction is unchanged: " + JSON.stringify(other).substring(0, 600));
} finally {
	files.deleteDirectory(project);
}
print("requestable-couch-undeclared-input OK (" + checks + " checks)");
