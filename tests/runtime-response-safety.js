var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var engineFile = new java.io.File(engineDir, "Engine.js");
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(engineFile, "UTF-8"));
var __flowEngineDir = engineDir;
var projectDir = new java.io.File(java.lang.System.getProperty("java.io.tmpdir"), "lib-flow-engine-response-safety");
if (projectDir.isDirectory()) {
	Packages.org.apache.commons.io.FileUtils.deleteDirectory(projectDir);
}
projectDir.mkdirs();
var __flowProjectDir = String(projectDir.getAbsolutePath());
var engine = eval(source);

function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

var safe = JSON.parse(engine.run(JSON.stringify({
	definition: {
		version: 1,
		nodes: [{
			id: "payload",
			block: "set",
			props: { path: "result.payload", value: { rows: [{ id: 1 }, { id: 2 }], complete: true } }
		}]
	},
	includeTrace: false
})));
assertTrue(safe.ok === true && safe.result.payload.rows.length === 2 && safe.result.payload.complete === true,
	"Combined response safety changed a regular JSON result: " + JSON.stringify(safe));

var leakFile = new java.io.File(projectDir, "handle-leak.txt");
var forbidden = JSON.parse(engine.run(JSON.stringify({
	definition: {
		version: 1,
		nodes: [{
			id: "openFile",
			block: "file.withWriter",
			props: { path: String(leakFile.getAbsolutePath()), as: "local.writer" },
			nodes: [{
				id: "leakHandle",
				block: "set",
				props: { path: "result.writer", value: "{{ local.writer }}" }
			}]
		}]
	},
	includeTrace: false
})));
assertTrue(forbidden.ok === false && forbidden.error.code === "RUNTIME_HANDLE_IN_RESULT",
	"Combined response safety did not reject a runtime handle: " + JSON.stringify(forbidden));

var objectRequest = JSON.stringify({ definition: { version: 1, nodes: [{
	id: "value", block: "set", props: { path: "result.value", value: { rows: [1, null, true], text: "é<&" } }
}] }, includeTrace: false });
var objectResponse = engine.runObject(objectRequest);
assertTrue(typeof objectResponse === "object" && objectResponse.ok === true,
	"Object protocol did not return an object.");
assertTrue(JSON.stringify(objectResponse.result) === JSON.stringify(JSON.parse(engine.run(objectRequest)).result),
	"Object and text result protocols differ.");
var callbacks = 0;
var objectFailure = engine.runObject(objectRequest, function (payload) {
	callbacks++;
	if (payload.ok) {
		var error = new Error("synthetic detach failure"); error.code = "DETACH_TEST"; error.status = 409; throw error;
	}
	return payload;
});
assertTrue(callbacks === 2 && objectFailure.ok === false && objectFailure.error.code === "DETACH_TEST" &&
	objectFailure.error.status === 409 && objectFailure.error.operation === "run",
	"Detachment failure escaped the structured execution boundary.");
var objectForbidden = engine.runObject(JSON.stringify({ definition: { version: 1, nodes: [{
	id: "openFile", block: "file.withWriter", props: { path: String(leakFile.getAbsolutePath()), as: "local.writer" },
	nodes: [{ id: "leak", block: "set", props: { path: "result.nested", value: { handle: "{{ local.writer }}" } } }]
}] }, includeTrace: false }));
assertTrue(objectForbidden.ok === false && objectForbidden.error.code === "RUNTIME_HANDLE_IN_RESULT",
	"Object protocol allowed a nested runtime handle.");
var profiled = engine.runObject(JSON.stringify({ definition: { version: 1, nodes: [] }, profile: true, includeTrace: false }));
assertTrue(profiled.ok && profiled.profile.functionCall.responseMode === "object" &&
	profiled.profile.functionCall.responseStringifyMs === undefined, "Object profile claimed text serialization.");
Packages.org.apache.commons.io.FileUtils.deleteDirectory(projectDir);

print("runtime-response-safety OK");

var opened = [], closed = [], pending = [];
var allocationTrace = { open: function (kind, id, type) {
    var token = kind + ":" + id + ":" + type;
    opened.push(token); pending.push(token);
    return { close: function () { assertTrue(pending.pop() === token, "Allocation spans closed out of order."); closed.push(token); } };
} };
var attributed = engine.runObject(objectRequest, function (v) { return v; }, allocationTrace);
assertTrue(attributed.ok && JSON.stringify(attributed.result) === JSON.stringify(objectResponse.result), "Attribution changed execution results.");
assertTrue(opened.length === closed.length && pending.length === 0 && opened.some(function (name) { return name.indexOf("node:") === 0; }), "Node attribution was not balanced.");
assertTrue(opened.some(function (name) { return name.indexOf("boundary:input-parse:") === 0; }), "Input parsing was not attributed.");
var countBefore = opened.length;
engine.runObject(objectRequest);
assertTrue(opened.length === countBefore, "Disabled execution retained a prior allocation collector.");
engine.runObject(JSON.stringify({ definition: { version: 1, nodes: [{ block: "unknown.test" }] }, includeTrace: false }), function (v) { return v; }, allocationTrace);
assertTrue(pending.length === 0 && opened.length === closed.length, "Failed node retained an allocation span.");
