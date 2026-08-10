(function () {
	var File = Packages.java.io.File;
	var FileUtils = Packages.org.apache.commons.io.FileUtils;
	var FlowEngineBridge = Packages.com.twinsoft.convertigo.engine.flow.FlowEngineBridge;
	var engineDir = String(new File(arguments.length > 0 ? arguments[0] : "libs/flow").getAbsolutePath());
	var runtime = eval(String(FileUtils.readFileToString(
		new File(engineDir, "modules/flow-runtime-service.js"), "UTF-8")));
	var snapshotService = eval(String(FileUtils.readFileToString(
		new File(engineDir, "modules/flow-execution-snapshot-service.js"), "UTF-8")));
	var clock = 0;

	function catalog(label) {
		var calls = 0;
		return {
			"demo.counter": {
				run: function () {
					calls++;
					return label + ":" + calls;
				}
			}
		};
	}

	function environment(stats) {
		return {
			blockName: function (node) { return node && node.block || ""; },
			raise: function (code, message) {
				var error = new Error(message);
				error.code = code;
				throw error;
			},
			parseSource: function (source) { return JSON.parse(source); },
			sourceForFlowRequest: function (request) { return request.flowSource; },
			sha256Hex: function (value) { return "hash:" + String(value).length; },
			flowPlanCompilerFingerprint: function () { return "compiler-1"; },
			flowSnapshotService: snapshotService,
			flowSnapshotStats: stats,
			runtimeHandles: {
				assertSerializable: function () {},
				closeAll: function () {},
				isHandle: function () { return false; },
				summary: function (value) { return value; },
				create: function () {},
				value: function () {},
				close: function () {}
			},
			isFlowScriptSource: function () { return false; },
			flowSnapshotCatalogFingerprint: function () { return "catalog-1"; },
			sharedFlowSnapshotKey: function (identityHash, compiler, qname) {
				return qname + ":" + identityHash + ":" + compiler;
			},
			sharedFlowSnapshotGet: function (key) {
				var value = FlowEngineBridge.getFlowExecutionSnapshot(String(key));
				return value === null ? null : String(value);
			},
			sharedFlowSnapshotClaim: function (key) {
				return FlowEngineBridge.claimFlowExecutionSnapshot(String(key)) === true;
			},
			sharedFlowSnapshotAwait: function (key) {
				var value = FlowEngineBridge.awaitFlowExecutionSnapshot(String(key), 5000);
				return value === null ? null : String(value);
			},
			sharedFlowSnapshotAbort: function (key) {
				FlowEngineBridge.abortFlowExecutionSnapshot(String(key));
			},
			sharedFlowSnapshotPut: function (key, payload) {
				return FlowEngineBridge.putFlowExecutionSnapshot(String(key), String(payload)) === true;
			},
			blocksWithFlowHelpers: function (blocks) { return blocks; },
			materializeFlowScriptBlock: function (blocks, name) { return blocks[name]; },
			expandFlowDefinition: function (_blocks, definition) {
				return JSON.parse(JSON.stringify(definition));
			},
			nanoTime: function () { return ++clock * 1000000; }
		};
	}

	FlowEngineBridge.clearCaches();
	var source = JSON.stringify({ version: 1, nodes: [{ block: "demo.counter" }] });
	var firstStats = {};
	var secondStats = {};
	var first = runtime.compileFlowPlan({ flowQName: "Sample.Counter", flowSource: source },
		catalog("first"), environment(firstStats));
	var second = runtime.compileFlowPlan({ flowQName: "Sample.Counter", flowSource: source },
		catalog("second"), environment(secondStats));
	var sharedInfo = JSON.parse(String(FlowEngineBridge.flowExecutionSnapshotCacheInfo()));

	if (firstStats.compiles !== 1 || firstStats.sharedWrites !== 1 || firstStats.hydrations !== 1) {
		throw new Error("first Rhino runtime did not publish one neutral snapshot: " + JSON.stringify(firstStats));
	}
	if (Number(secondStats.compiles || 0) !== 0 || secondStats.sharedHits !== 1 || secondStats.hydrations !== 1) {
		throw new Error("second Rhino runtime did not hydrate the shared snapshot: " + JSON.stringify(secondStats));
	}
	if (first.blocks["demo.counter"].run() !== "first:1" || second.blocks["demo.counter"].run() !== "second:1") {
		throw new Error("shared neutral snapshot leaked a runtime-local closure");
	}
	if (sharedInfo.size !== 1 || sharedInfo.loading !== 0 || sharedInfo.writes !== 1 || sharedInfo.hits < 1) {
		throw new Error("Java shared snapshot cache has an invalid final state: " + JSON.stringify(sharedInfo));
	}
	print("flow shared snapshot Rhino integration tests passed");
}())
