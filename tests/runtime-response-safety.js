var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "libs/flow").getAbsolutePath());
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
			path: "result.payload",
			value: { rows: [{ id: 1 }, { id: 2 }], complete: true }
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
			path: String(leakFile.getAbsolutePath()),
			as: "local.writer",
			nodes: [{
				id: "leakHandle",
				block: "set",
				path: "result.writer",
				value: "{{ local.writer }}"
			}]
		}]
	},
	includeTrace: false
})));
assertTrue(forbidden.ok === false && forbidden.error.code === "RUNTIME_HANDLE_IN_RESULT",
	"Combined response safety did not reject a runtime handle: " + JSON.stringify(forbidden));

print("runtime-response-safety OK");
