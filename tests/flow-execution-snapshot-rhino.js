(function () {
	var File = Packages.java.io.File;
	var FileUtils = Packages.org.apache.commons.io.FileUtils;
	var moduleFile = new File(String(arguments[0] || "libs/flow/modules/flow-execution-snapshot-service.js"));
	var service = eval(String(FileUtils.readFileToString(moduleFile, "UTF-8")));
	var snapshot = service.create({
		flowQName: "Sample.Counter",
		sourceHash: "source-1",
		compilerFingerprint: "compiler-1",
		definition: { version: 1, nodes: [{ block: "demo.counter" }] }
	});

	function catalog(label) {
		var count = 0;
		return {
			"demo.counter": {
				run: function () {
					count++;
					return label + ":" + count;
				}
			}
		};
	}

	var env = {
		blocksWithFlowHelpers: function (blocks) { return blocks; },
		materializeDefinitionBlocks: function () {},
		expandFlowDefinition: function (_blocks, definition) {
			return JSON.parse(JSON.stringify(definition));
		}
	};
	var first = service.hydrate(snapshot, catalog("first"), env);
	var second = service.hydrate(service.deserialize(service.serialize(snapshot)), catalog("second"), env);
	if (first.blocks["demo.counter"].run() !== "first:1" ||
		first.blocks["demo.counter"].run() !== "first:2" ||
		second.blocks["demo.counter"].run() !== "second:1") {
		throw new Error("hydrated Rhino runtimes shared closure state");
	}
	if (!Object.isFrozen(snapshot) || !Object.isFrozen(snapshot.definition)) {
		throw new Error("Flow execution snapshot is mutable");
	}
	print("flow execution snapshot Rhino tests passed");
}())
