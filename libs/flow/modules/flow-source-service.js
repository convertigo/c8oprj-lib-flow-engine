(function () {
	function create(env) {
		env = env || {};
		var sourceFromDefinition = env.sourceFromDefinition;
		var normalizeFlowScriptFunctionSyntax = env.normalizeFlowScriptFunctionSyntax;
		var sourceFromFlowScript = env.sourceFromFlowScript;
		var loadBlocks = env.loadBlocks;
		var projectDir = env.projectDir;
		var getProjectFlow = env.getProjectFlow;
		var parseSource = env.parseSource;
		var analyzeFlowSource = env.analyzeFlowSource;
		var writeProjectFlowCodeCanonical = env.writeProjectFlowCodeCanonical;

	function sourceForWriteRequest(args, fallback) {
		args = args || {};
		if (args.definition !== undefined && args.definition !== null) {
			return sourceFromDefinition(args.definition);
		}
		if (fallback !== undefined && fallback !== null && String(fallback).trim() !== "") {
			return String(fallback);
		}
		if (args.flowSource !== undefined && args.flowSource !== null && String(args.flowSource).trim() !== "") {
			return String(args.flowSource);
		}
		return "";
	}

	function isFlowScriptSource(source) {
		var text = normalizeFlowScriptFunctionSyntax(source).trim();
		return !!text.match(/^(?:\/\/[^\n]*\n\s*)*(?:import\s+|(?:const|let|var)\s+_(?:meta|flow|block)\s*=|flow\s+[A-Za-z_$][\w$]*\s*\(|function\s+[A-Za-z_$][\w$]*\s*\()/);
	}

	function sourceForMaybeFlowScript(blocks, args, source) {
		source = String(source || "");
		if (!isFlowScriptSource(source)) {
			return source;
		}
		return sourceFromFlowScript(blocks || loadBlocks(), args && (args.name || args.flowName) || "Flow", source).source;
	}

	function projectFlowSourceIfAvailable(blocks, args) {
		args = args || {};
		var name = String(args.name || args.flowName || "").trim();
		if (!name || !projectDir()) {
			return null;
		}
		try {
			return getProjectFlow(name, blocks || loadBlocks(), args).source;
		} catch (e) {
			if (String(e.code || "") === "UNKNOWN_FLOW") {
				return null;
			}
			throw e;
		}
	}

	function setProjectFlow(blocks, name, source, args) {
		source = sourceForMaybeFlowScript(blocks, args, sourceForWriteRequest(args, source));
		source = sourceFromDefinition(parseSource(source));
		var analysis = analyzeFlowSource(blocks, source);
		var codeFile = env.writeProjectFlowWorkingCopy
			? env.writeProjectFlowWorkingCopy(blocks, name, source, args)
			: null;
		if (!codeFile) {
			codeFile = writeProjectFlowCodeCanonical(blocks, name, source, args);
		}
		return {
			ok: true,
			name: String(name),
			format: "flowscript",
			file: codeFile.file,
			sourceFile: "",
			codeFile: codeFile.file,
			code: codeFile.code,
			codeRevision: codeFile.revision,
			source: String(source),
			definition: parseSource(source),
			analysis: analysis
		};
	}

	function sourceForFlowRequest(args, blocks) {
		args = args || {};
		blocks = blocks || loadBlocks();
		if (args.definition !== undefined && args.definition !== null) {
			return sourceFromDefinition(args.definition);
		}
		if (args.flowSource !== undefined && args.flowSource !== null && String(args.flowSource).trim() !== "") {
			return sourceForMaybeFlowScript(blocks, args, args.flowSource);
		}
		var projectSource = projectFlowSourceIfAvailable(blocks, args);
		if (projectSource !== null) {
			return projectSource;
		}
		return getProjectFlow(args.name || args.flowName, blocks, args).source;
	}

	function outputSchemaForFlowSource(flowSource) {
		var definition = parseSource(sourceForMaybeFlowScript(loadBlocks(), {}, flowSource));
		return definition.output || definition.outputs || {};
	}

		return {
			sourceForWriteRequest: sourceForWriteRequest,
			isFlowScriptSource: isFlowScriptSource,
			sourceForMaybeFlowScript: sourceForMaybeFlowScript,
			projectFlowSourceIfAvailable: projectFlowSourceIfAvailable,
			setProjectFlow: setProjectFlow,
			sourceForFlowRequest: sourceForFlowRequest,
			outputSchemaForFlowSource: outputSchemaForFlowSource
		};
	}

	return {
		sourceForWriteRequest: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).sourceForWriteRequest.apply(null, args);
		},
		isFlowScriptSource: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).isFlowScriptSource.apply(null, args);
		},
		sourceForMaybeFlowScript: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).sourceForMaybeFlowScript.apply(null, args);
		},
		projectFlowSourceIfAvailable: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).projectFlowSourceIfAvailable.apply(null, args);
		},
		setProjectFlow: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).setProjectFlow.apply(null, args);
		},
		sourceForFlowRequest: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).sourceForFlowRequest.apply(null, args);
		},
		outputSchemaForFlowSource: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).outputSchemaForFlowSource.apply(null, args);
		}
	};
}())
