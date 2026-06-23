(function () {
	function create(env) {
		env = env || {};
		var blockName = env.blockName;
		var nodeProps = env.nodeProps;
		var raise = env.raise;
		var nodePath = env.nodePath;
		var normalizeTree = env.normalizeTree;
		var expandFlowDefinition = env.expandFlowDefinition;
		var blocksWithFlowHelpers = env.blocksWithFlowHelpers;
		var parseSource = env.parseSource;
		var sourceForFlowRequest = env.sourceForFlowRequest;
		var sourceForWriteRequest = env.sourceForWriteRequest;
		var loadProjectEngineDefinition = env.loadProjectEngineDefinition;
		var runtimeHandles = env.runtimeHandles;
		var assertNoRuntimeHandle = runtimeHandles.assertSerializable;
		var learnResultSchema = env.learnResultSchema;
		var schemaSummary = env.schemaSummary;
		var closeRuntimeHandles = runtimeHandles.closeAll;
		var snapshot = env.snapshot;
		var File = env.File;
		var canonicalPath = env.canonicalPath;
		var engineDir = env.engineDir;
		var projectDir = env.projectDir;
		var currentProjectName = env.currentProjectName;
		var intOption = env.intOption;
		var effectiveConfig = env.effectiveConfig;
		var readScopePath = env.readScopePath;
		var readObjectPath = env.readObjectPath;
		var writeScopePath = env.writeScopePath;
		var evaluateExpression = env.evaluateExpression;
		var literalValue = env.literalValue;
		var renderTemplate = env.renderTemplate;
		var renderTemplateTree = env.renderTemplateTree;
		var inputValue = env.inputValue;
		var isRuntimeHandle = runtimeHandles.isHandle;
		var runtimeHandleSummary = runtimeHandles.summary;
		var createRuntimeHandle = runtimeHandles.create;
		var runtimeHandleValue = runtimeHandles.value;
		var closeRuntimeHandle = runtimeHandles.close;
		var safeFilePart = env.safeFilePart;
		var loadFlowLibrary = env.loadFlowLibrary;
		var cacheInfoRequest = env.cacheInfoRequest;
		var clearRuntimeCaches = env.clearRuntimeCaches;
		var withProjectDir = env.withProjectDir;
		var analyzeFlowSource = env.analyzeFlowSource;
		var loadBlocks = env.loadBlocks;
		var contextForFlowRequest = env.contextForFlowRequest;
		var searchFlowRequest = env.searchFlowRequest;
		var describeTreeRequest = env.describeTreeRequest;
		var applyMutationRequest = env.applyMutationRequest;
		var outputSchemaRequest = env.outputSchemaRequest;
		var nodeOutputSchemaRequest = env.nodeOutputSchemaRequest;
		var readOutputSchema = env.readOutputSchema;
		var learnOutputSchema = env.learnOutputSchema;
		var flowNameFor = env.flowNameFor;
		var resetSchemaRequest = env.resetSchemaRequest;
		var resources = env.resources;
		var mergedContext = env.mergedContext;
		var catalogDefinition = env.catalogDefinition;
		var getBlockSource = env.getBlockSource;
		var createProjectBlock = env.createProjectBlock;
		var duplicateProjectBlock = env.duplicateProjectBlock;
		var editProjectBlock = env.editProjectBlock;
		var setProjectBlockCode = env.setProjectBlockCode;
		var blockCode = env.blockCode;
		var typeList = env.typeList;
		var loadTypes = env.loadTypes;
		var getTypeSource = env.getTypeSource;
		var createProjectType = env.createProjectType;
		var listProjectFlows = env.listProjectFlows;
		var getProjectFlow = env.getProjectFlow;
		var setProjectFlow = env.setProjectFlow;
		var flowScriptGetRequest = env.flowScriptGetRequest;
		var flowScriptValidateRequest = env.flowScriptValidateRequest;
		var flowScriptPatchRequest = env.flowScriptPatchRequest;
		var flowCode = env.flowCode;
		var requestables = env.requestables;
		var throwFlowError = env.throwFlowError;
		var liveContext = env.context;

		function executeNode(ctx, node) {
			if (ctx.stopped || !node || node.disabled) {
				return undefined;
			}
			var name = blockName(node);
			var block = ctx.blocks[name];
			if (!block) {
				raise("UNKNOWN_BLOCK", "Unknown Flow block: " + name, node, "Use flow-catalog or blockList to list supported blocks.");
			}
			var props = nodeProps(node);
			var result = block.run(ctx, node);
			if (props.out && result !== undefined) {
				ctx.write(props.out, result);
			}
			ctx.trace(node, name, result);
			return result;
		}

		function callBlock(ctx, name, props, options) {
			name = String(name || "");
			options = options || {};
			if (!name) {
				raise("MISSING_BLOCK_NAME", "ctx.callBlock requires a block name.");
			}
			var block = ctx.blocks[name];
			if (!block) {
				raise("UNKNOWN_BLOCK", "Unknown Flow block: " + name, null, "Use flow-catalog or blockList to list supported blocks.");
			}
			if (typeof block.run !== "function") {
				raise("INVALID_BLOCK", "Flow block has no runnable implementation: " + name);
			}
			var node = {
				block: name,
				props: normalizeTree(props || {})
			};
			if (options.id) {
				node.id = String(options.id);
			}
			if (!node.id) {
				node.id = "call:" + name;
			}
			var previousInput = ctx.scopes.input;
			var previousProps = ctx.scopes.props;
			var previousLocal = ctx.scopes.local;
			var previousCurrent = ctx.scopes.current;
			var previousReturned = ctx.returned;
			var previousStopped = ctx.stopped;
			ctx.scopes.props = nodeProps(node);
			ctx.scopes.input = ctx.scopes.props;
			ctx.scopes.local = {};
			ctx.returned = undefined;
			ctx.stopped = false;
			try {
				var nodeProperties = nodeProps(node);
				var result = block.run(ctx, node);
				if (ctx.returned !== undefined) {
					result = ctx.returned;
				}
				if (nodeProperties.out && result !== undefined) {
					ctx.write(nodeProperties.out, result);
				}
				if (options.trace !== false) {
					ctx.trace(node, name, result);
				}
				return result;
			} finally {
				ctx.scopes.input = previousInput;
				ctx.scopes.props = previousProps;
				ctx.scopes.local = previousLocal;
				ctx.scopes.current = previousCurrent;
				ctx.returned = previousReturned;
				ctx.stopped = previousStopped;
			}
		}

		function executeNodes(ctx, nodes) {
			var result;
			nodes = nodes || [];
			for (var i = 0; i < nodes.length; i++) {
				if (ctx.stopped) {
					break;
				}
				var node = nodes[i];
				result = executeNode(ctx, node);
			}
			return result;
		}

		function runFlowRequest(request, blocks) {
			var parsedDefinition = parseSource(sourceForFlowRequest(request, blocks));
			var activeBlocks = blocksWithFlowHelpers ? blocksWithFlowHelpers(blocks, parsedDefinition) : blocks;
			var definition = expandFlowDefinition(activeBlocks, parsedDefinition);
			var projectEngine = loadProjectEngineDefinition();
			var ctx = createRunContext(request, definition, activeBlocks, projectEngine);
			try {
				ctx.runNodes(definition.nodes || []);
				var result = ctx.returned === undefined ? ctx.scopes.result : ctx.returned;
				assertNoRuntimeHandle(result, "result");
				var resultSchema = learnResultSchema(request, definition, result);
				if (resultSchema && resultSchema.learned === true) {
					ctx.schemaUpdates.push({
						scope: "result",
						node: "return",
						block: "return",
						property: "out",
						file: resultSchema.file,
						schema: schemaSummary(resultSchema.schema),
						message: "Learned final result schema. Future output-schema calls can use it."
					});
				}
				closeRuntimeHandles(ctx);
				var out = {
					ok: true,
					result: snapshot(result)
				};
				if (ctx.schemaUpdates.length > 0) {
					out.schemaUpdates = snapshot(ctx.schemaUpdates);
				}
				if (request.includeFlow === true || request.includeLocal === true) {
					out.local = snapshot(ctx.scopes.local);
				}
				if (request.includeTrace !== false) {
					out.trace = snapshot(ctx.scopes.trace);
				}
				return out;
			} finally {
				closeRuntimeHandles(ctx);
			}
		}

		function createRunContext(request, definition, blocks, projectEngine) {
			var requestScope = normalizeTree(request.context || {});
			var projectName = currentProjectName(request);
			if (projectName) {
				requestScope.project = projectName;
			}
			requestScope.engineDir = canonicalPath(engineDir());
			requestScope.engineProjectDir = canonicalPath(new File(engineDir(), "../.."));
			var currentProjectDir = projectDir();
			var libraries = {};
			requestScope.projectDir = currentProjectDir ? canonicalPath(currentProjectDir) : "";
			var ctx = {
				request: request,
				definition: definition,
				engine: projectEngine || {},
				blocks: blocks,
				returned: undefined,
				stopped: false,
				handles: {},
				handleSeq: 0,
				schemaUpdates: [],
				graphBlockStack: [],
				maxGraphBlockDepth: intOption(request.maxGraphBlockDepth, 128, 1, 1000),
				scopes: {
					request: requestScope,
					input: normalizeTree(request.input || {}),
					config: effectiveConfig(request, definition, projectEngine || {}),
					local: {},
					result: {},
					trace: { nodes: [] },
					current: null,
					props: {}
				}
			};
			ctx.props = nodeProps;
			ctx.read = function (path) {
				return readScopePath(ctx.scopes, path);
			};
			ctx.readObjectPath = readObjectPath;
			ctx.write = function (path, value) {
				return writeScopePath(ctx.scopes, path, value);
			};
			ctx.value = function (value) {
				return evaluateExpression(ctx, value);
			};
			ctx.expr = function (value) {
				return evaluateExpression(ctx, value);
			};
			ctx.path = function (path) {
				return ctx.read(path);
			};
			ctx.literal = function (value) {
				return literalValue(value);
			};
			ctx.render = function (template) {
				return renderTemplate(template, ctx);
			};
			ctx.template = function (value) {
				return renderTemplateTree(ctx, value);
			};
			ctx.input = function (props, fallback) {
				return inputValue(ctx, props || {}, fallback);
			};
			ctx.isHandle = isRuntimeHandle;
			ctx.handleSummary = runtimeHandleSummary;
			ctx.createHandle = function (type, value, options) {
				return createRuntimeHandle(ctx, type, value, options);
			};
			ctx.handleValue = function (handle, expectedType) {
				return runtimeHandleValue(handle, expectedType);
			};
			ctx.closeHandle = function (handle) {
				return closeRuntimeHandle(ctx, handle);
			};
			ctx.convertigoContext = function () {
				if (liveContext === null || liveContext === undefined) {
					raise("CONVERTIGO_CONTEXT_UNAVAILABLE", "This block needs a live Convertigo context.");
				}
				return liveContext;
			};
			ctx.runNodes = function (nodes) {
				return executeNodes(ctx, nodes);
			};
			ctx.callBlock = function (name, props, options) {
				return callBlock(ctx, name, props, options);
			};
			ctx.catalog = function () {
				return catalogDefinition(blocks);
			};
			ctx.lib = function (name) {
				name = safeFilePart(name);
				if (!libraries[name]) {
					libraries[name] = loadFlowLibrary(name);
				}
				return libraries[name];
			};
			ctx.cacheInfo = function () {
				return cacheInfoRequest();
			};
			ctx.cacheClear = function () {
				return clearRuntimeCaches();
			};
			ctx.withProjectDir = function (dir, callback) {
				return withProjectDir(dir, callback);
			};
			ctx.analyzeFlowSource = function (flowSource, options) {
				options = options || {};
				return withProjectDir(options.projectDir, function () {
					return analyzeFlowSource(loadBlocks(), sourceForWriteRequest(options, flowSource), options);
				});
			};
			ctx.contextFlowSource = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return contextForFlowRequest(loadBlocks(), args);
				});
			};
			ctx.searchFlow = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return searchFlowRequest(args, loadBlocks());
				});
			};
			ctx.describeTreeSource = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return describeTreeRequest(args, loadBlocks());
				});
			};
			ctx.applyMutationSource = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return applyMutationRequest(args, loadBlocks());
				});
			};
			ctx.outputSchemaSource = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return outputSchemaRequest(args, loadBlocks());
				});
			};
			ctx.nodeOutputSchemaSource = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return nodeOutputSchemaRequest(args, loadBlocks());
				});
			};
			ctx.schemaForOutput = function (node, property, outPath) {
				return readOutputSchema(request, definition, node, property || "out", outPath || "");
			};
			ctx.learnOutputSchema = function (node, property, outPath, value) {
				var learned = learnOutputSchema(request, definition, node, property || "out", outPath || "", value);
				if (learned && learned.learned === true) {
					ctx.schemaUpdates.push({
						scope: outPath || "",
						node: nodePath(node),
						block: blockName(node),
						property: property || "out",
						file: learned.file,
						schema: schemaSummary(learned.schema),
						message: "Learned output schema for " + (outPath || "out") + ". Use this path in later FlowScript expressions."
					});
				}
				return learned;
			};
			ctx.schemaReset = function (args) {
				args = args || {};
				if (!args.flowName && !args.name) {
					args.flowName = flowNameFor(request, definition);
				}
				return withProjectDir(args.projectDir, function () {
					return resetSchemaRequest(args);
				});
			};
			ctx.resourceSearch = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return resources.search(args);
				});
			};
			ctx.resourceList = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return resources.list(args);
				});
			};
			ctx.resourceGet = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return resources.get(args);
				});
			};
			ctx.resourcePatch = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return resources.patch(args);
				});
			};
			ctx.runFlowSource = function (flowSource, config, options) {
				options = options || {};
				return withProjectDir(options.projectDir, function () {
					var source = sourceForWriteRequest(options, flowSource);
					return runFlowRequest({
						project: options.project || currentProjectName(ctx.request),
						flowSource: source,
						config: config || {},
						input: options.input || {},
						context: mergedContext(ctx.scopes.request, options.context || {}),
						includeFlow: options.includeFlow === true || options.includeLocal === true,
						includeTrace: options.includeTrace === true
					}, loadBlocks());
				});
			};
			ctx.blockList = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return catalogDefinition(loadBlocks(), {
						detail: args.detail || args.mode || "summary",
						includePrivate: args.includePrivate === true,
						includeInternal: args.includeInternal === true,
						query: args.query || args.q || "",
						namespace: args.namespace || "",
						provider: args.provider || "",
						origin: args.origin || "",
						limit: args.limit,
						cursor: args.cursor,
						includeTypes: args.includeTypes === true || String(args.includeTypes || "") === "true",
						includeLibraries: args.includeLibraries === true || String(args.includeLibraries || "") === "true",
						doc: args.doc,
						hints: args.hints
					});
				});
			};
			ctx.blockGet = function (name, args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return getBlockSource(loadBlocks(), name, args);
				});
			};
			ctx.blockCreate = function (name, source, overwrite, args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					var targetBlocks = loadBlocks();
					var request = typeof source === "object" && source !== null ? source : args;
					request.overwrite = request.overwrite === true || overwrite === true;
					return createProjectBlock(targetBlocks, name, request, overwrite);
				});
			};
			ctx.blockDuplicate = function (fromName, toName, overwrite, args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					var targetBlocks = loadBlocks();
					return duplicateProjectBlock(targetBlocks, fromName, toName, overwrite);
				});
			};
			ctx.blockEdit = function (name, source, args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					var targetBlocks = loadBlocks();
					var request = typeof source === "object" && source !== null ? source : args;
					return editProjectBlock(targetBlocks, name, request);
				});
			};
			ctx.blockCodeSet = function (name, args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return setProjectBlockCode(loadBlocks(), name, args);
				});
			};
			ctx.blockCodeGet = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return blockCode.get(loadBlocks(), args);
				});
			};
			ctx.blockCodePatch = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return blockCode.patch(loadBlocks(), args);
				});
			};
			ctx.blockCodeRg = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return blockCode.rg(loadBlocks(), args);
				});
			};
			ctx.typeList = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return typeList(loadBlocks());
				});
			};
			ctx.typeGet = function (name, args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return getTypeSource(loadTypes(), name);
				});
			};
			ctx.typeCreate = function (name, source, overwrite, args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					var request = typeof source === "object" && source !== null ? source : args;
					if (typeof source !== "object" || source === null) {
						request.descriptorSource = source;
					}
					return createProjectType(loadTypes(), name, request, overwrite);
				});
			};
			ctx.blockTest = function (flowSource, config, options) {
				options = options || {};
				return withProjectDir(options.projectDir, function () {
					var source = sourceForWriteRequest(options, flowSource);
					return runFlowRequest({
						project: options.project || currentProjectName(ctx.request),
						flowSource: source,
						config: config || {},
						input: options.input || {},
						context: mergedContext(ctx.scopes.request, options.context || {}),
						includeFlow: options.includeFlow === true || options.includeLocal === true,
						includeTrace: options.includeTrace === true
					}, loadBlocks());
				});
			};
			ctx.flowList = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return listProjectFlows();
				});
			};
			ctx.flowGet = function (name, args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return getProjectFlow(name, loadBlocks());
				});
			};
			ctx.flowSet = function (name, source, args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return setProjectFlow(loadBlocks(), name, source, args);
				});
			};
			ctx.flowTest = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					var source = sourceForFlowRequest(args);
					return runFlowRequest({
						project: args.project || currentProjectName(ctx.request),
						flowSource: source,
						config: args.config || {},
						input: args.input || {},
						context: mergedContext(ctx.scopes.request, args.context || {}),
						includeFlow: args.includeFlow === true || args.includeLocal === true,
						includeTrace: args.includeTrace === true
					}, loadBlocks());
				});
			};
			ctx.flowSourceGet = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return flowScriptGetRequest(loadBlocks(), args);
				});
			};
			ctx.flowSourceValidate = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return flowScriptValidateRequest(loadBlocks(), args);
				});
			};
			ctx.flowSourcePatch = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return flowScriptPatchRequest(loadBlocks(), args);
				});
			};
			ctx.flowCodeGet = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return flowCode.get(loadBlocks(), args);
				});
			};
			ctx.flowCodeStatus = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return flowCode.status(loadBlocks(), args);
				});
			};
			ctx.flowCodeDiscard = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return flowCode.discard(loadBlocks(), args);
				});
			};
			ctx.flowCodeSet = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return flowCode.set(loadBlocks(), args);
				});
			};
			ctx.flowCodePatch = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return flowCode.patch(loadBlocks(), args);
				});
			};
			ctx.flowCodeCheck = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return flowCode.check(loadBlocks(), args);
				});
			};
			ctx.flowCodeRg = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return flowCode.rg(loadBlocks(), args);
				});
			};
			ctx.flowCodeRun = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return flowCode.run(loadBlocks(), args);
				});
			};
			ctx.flowCodeAnalyze = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return flowCode.analyze(loadBlocks(), args);
				});
			};
			ctx.flowCodePromote = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return flowCode.promote(loadBlocks(), args);
				});
			};
			ctx.requestableList = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return requestables.list(args);
				});
			};
			ctx.requestableSchema = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return requestables.schema(args);
				});
			};
			ctx.returnValue = function (value) {
				assertNoRuntimeHandle(value, "result");
				ctx.returned = value;
				ctx.stopped = true;
				return value;
			};
			ctx.throwFlow = function (options, node) {
				return throwFlowError(options, node);
			};
			ctx.trace = function (node, name, result) {
				ctx.scopes.trace.nodes.push({
					id: nodePath(node),
					block: name,
					result: snapshot(result)
				});
			};
			ctx.raise = raise;
			return ctx;
		}

		return {
			executeNode: executeNode,
			callBlock: callBlock,
			executeNodes: executeNodes,
			runFlowRequest: runFlowRequest,
			createRunContext: createRunContext
		};
	}

	return {
		executeNode: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).executeNode.apply(null, args);
		},
		callBlock: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).callBlock.apply(null, args);
		},
		executeNodes: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).executeNodes.apply(null, args);
		},
		runFlowRequest: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).runFlowRequest.apply(null, args);
		},
		createRunContext: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).createRunContext.apply(null, args);
		}
	};
}())
