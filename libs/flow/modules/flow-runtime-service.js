(function () {
	function create(env) {
		env = env || {};
		var blockName = env.blockName;
		var nodeProps = env.nodeProps;
		var raise = env.raise;
		var nodePath = env.nodePath;
		var normalizeTree = env.normalizeTree;
		var parseYamlSource = env.parseYamlSource;
		var expandFlowDefinition = env.expandFlowDefinition;
		var blocksWithFlowHelpers = env.blocksWithFlowHelpers;
		var parseSource = env.parseSource;
		var sourceForFlowRequest = env.sourceForFlowRequest;
		var sha256Hex = env.sha256Hex;
		var readRuntimeBoundedCache = env.readRuntimeBoundedCache;
		var writeRuntimeBoundedCache = env.writeRuntimeBoundedCache;
		var flowPlanCache = env.flowPlanCache;
		var readRunPlanHead = env.readRunPlanHead || function () { return null; };
		var writeRunPlanHead = env.writeRunPlanHead || function () { return null; };
		var flowPlanCompilerFingerprint = env.flowPlanCompilerFingerprint;
		var flowSnapshotService = env.flowSnapshotService;
		var flowSnapshotStats = env.flowSnapshotStats || {};
		var isFlowScriptSource = env.isFlowScriptSource || function () { return false; };
		var flowSnapshotCatalogFingerprint = env.flowSnapshotCatalogFingerprint || function () { return ""; };
		var sharedFlowSnapshotKey = env.sharedFlowSnapshotKey || function () { return ""; };
		var sharedFlowSnapshotGet = env.sharedFlowSnapshotGet || function () { return null; };
		var sharedFlowSnapshotPut = env.sharedFlowSnapshotPut || function () { return false; };
		var sharedFlowSnapshotClaim = env.sharedFlowSnapshotClaim || function () { return false; };
		var sharedFlowSnapshotAwait = env.sharedFlowSnapshotAwait || function () { return null; };
		var sharedFlowSnapshotAbort = env.sharedFlowSnapshotAbort || function () {};
		var sharedFlowMachineImageGet = env.sharedFlowMachineImageGet || function () { return null; };
		var sharedFlowMachineImagePut = env.sharedFlowMachineImagePut || function () { return null; };
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
		var compileWriteScopePath = env.compileWriteScopePath;
		var evaluateExpression = env.evaluateExpression;
		var compileExpression = env.compileExpression;
		var compileTemplateTree = env.compileTemplateTree;
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
		var authoringTreeRequest = env.authoringTreeRequest || describeTreeRequest;
		var authoringContractRequest = env.authoringContractRequest || function () { return { ok: true, items: [] }; };
		var authoringPaletteRequest = env.authoringPaletteRequest || describeTreeRequest;
		var authoringMutateRequest = env.authoringMutateRequest || applyMutationRequest;
		var contextMenuRequest = env.contextMenuRequest || function () { return { ok: true, items: [] }; };
		var contextActionRequest = env.contextActionRequest || function () {
			return { ok: false, error: { code: "CONTEXT_ACTION_UNAVAILABLE", message: "Context actions are not available." } };
		};
		var outputSchemaRequest = env.outputSchemaRequest;
		var nodeOutputSchemaRequest = env.nodeOutputSchemaRequest;
		var readOutputSchema = env.readOutputSchema;
		var learnOutputSchema = env.learnOutputSchema;
		var flowNameFor = env.flowNameFor;
		var resetSchemaRequest = env.resetSchemaRequest;
		var resources = env.resources;
		var notifySourceMutation = env.notifySourceMutation || function () { return { ok: true }; };
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
		var currentConvertigoContext = env.currentConvertigoContext || function () { return env.context; };
		var nanoTime = env.nanoTime || function () { return 0; };
		var materializeFlowScriptBlock = env.materializeFlowScriptBlock || function (blocks, name) {
			return blocks && blocks[name];
		};
		var runContextPrototype = {};
		var coldContextMethodNames = [
			"cacheInfo", "cacheClear", "withProjectDir", "analyzeFlowSource", "contextFlowSource",
			"searchFlow", "describeTreeSource", "applyMutationSource", "authoringTreeSource",
			"authoringContractSource", "authoringPaletteSource", "authoringMutateSource",
			"contextMenuSource", "contextActionSource", "outputSchemaSource", "nodeOutputSchemaSource",
			"schemaForOutput", "learnOutputSchema", "schemaReset", "resourceSearch", "resourceList",
			"resourceGet", "resourcePatch", "resourceDelete", "notifySourceMutation", "runFlowSource",
			"blockList", "blockGet", "blockCreate", "blockDuplicate", "blockEdit", "blockCodeSet",
			"blockCodeCheck", "blockCodeGet", "blockCodePatch", "blockCodeRg", "typeList", "typeGet",
			"typeCreate", "blockTest", "flowList", "flowGet", "flowSet", "flowTest", "flowSourceGet",
			"flowSourceValidate", "flowSourcePatch", "flowCodeGet", "flowCodeStatus", "flowCodeDiscard",
			"flowCodeSet", "flowCodePatch", "flowCodeCheck", "flowCodeRg", "flowCodeRun",
			"flowCodeAnalyze", "flowCodePromote", "requestableList", "requestableSchema"
		];

		function defineColdContextMethod(name) {
			Object.defineProperty(runContextPrototype, name, {
				configurable: true,
				enumerable: false,
				get: function () {
					var installer = this.__installColdContextMethods;
					if (typeof installer === "function") {
						installer.call(this);
					}
					var descriptor = Object.getOwnPropertyDescriptor(this, name);
					return descriptor ? descriptor.value : undefined;
				},
				set: function (value) {
					Object.defineProperty(this, name, {
						value: value,
						writable: true,
						enumerable: true,
						configurable: true
					});
				}
			});
		}

		coldContextMethodNames.forEach(defineColdContextMethod);

		function profileDuration(started) {
			return Number(nanoTime() - started) / 1000000;
		}

		function profileEnabled(request) {
			return !!request && (request.profile === true || request.profile === "envelope");
		}

		function materializeLazyValue(target, name, value) {
			Object.defineProperty(target, name, {
				value: value,
				writable: true,
				configurable: true,
				enumerable: true
			});
			return value;
		}

		function frameStateForRequestScope(requestScope) {
			var descriptor = Object.getOwnPropertyDescriptor(requestScope, "__flowFrameState");
			return descriptor ? descriptor.value : null;
		}

		function resolveFrameProjectEngine(state) {
			if (!state.projectEngineResolved) {
				var started = state.profile ? nanoTime() : 0;
				var source = state.projectEngineSource;
				state.projectEngineValue = (typeof source === "function" ? source() : source) || {};
				state.projectEngineResolved = true;
				if (state.profile) {
					state.profile.loadConfigMs += profileDuration(started);
					state.profile.configLoaded = true;
				}
			}
			return state.projectEngineValue;
		}

		function requestEngineDirGet() {
			return materializeLazyValue(this, "engineDir", canonicalPath(engineDir()));
		}
		function requestEngineDirSet(value) {
			materializeLazyValue(this, "engineDir", value);
		}
		function requestEngineProjectDirGet() {
			return materializeLazyValue(this, "engineProjectDir", canonicalPath(new File(engineDir(), "../..")));
		}
		function requestEngineProjectDirSet(value) {
			materializeLazyValue(this, "engineProjectDir", value);
		}
		function requestProjectDirGet() {
			var state = frameStateForRequestScope(this);
			return materializeLazyValue(this, "projectDir",
				state && state.invocationProjectDir ? canonicalPath(state.invocationProjectDir) : "");
		}
		function requestProjectDirSet(value) {
			materializeLazyValue(this, "projectDir", value);
		}
		function scopesConfigGet() {
			var state = frameStateForRequestScope(this.request);
			return materializeLazyValue(this, "config",
				effectiveConfig(state.request, state.definition, resolveFrameProjectEngine(state)));
		}
		function scopesConfigSet(value) {
			materializeLazyValue(this, "config", value);
		}
		function contextEngineGet() {
			var state = frameStateForRequestScope(this.scopes.request);
			return materializeLazyValue(this, "engine", resolveFrameProjectEngine(state));
		}
		function contextEngineSet(value) {
			materializeLazyValue(this, "engine", value);
		}

		var requestEngineDirDescriptor = {
			configurable: true, enumerable: true, get: requestEngineDirGet, set: requestEngineDirSet
		};
		var requestEngineProjectDirDescriptor = {
			configurable: true, enumerable: true, get: requestEngineProjectDirGet, set: requestEngineProjectDirSet
		};
		var requestProjectDirDescriptor = {
			configurable: true, enumerable: true, get: requestProjectDirGet, set: requestProjectDirSet
		};
		var scopesConfigDescriptor = {
			configurable: true, enumerable: true, get: scopesConfigGet, set: scopesConfigSet
		};
		var contextEngineDescriptor = {
			configurable: true, enumerable: true, get: contextEngineGet, set: contextEngineSet
		};

		function contextFrameStats(ctx) {
			var ownFunctionCount = 0;
			Object.keys(ctx || {}).forEach(function (name) {
				var descriptor = Object.getOwnPropertyDescriptor(ctx, name);
				if (descriptor && typeof descriptor.value === "function") {
					ownFunctionCount += 1;
				}
			});
			var sharedMethodCount = 0;
			Object.getOwnPropertyNames(runContextPrototype).forEach(function (name) {
				var descriptor = Object.getOwnPropertyDescriptor(runContextPrototype, name);
				if (descriptor && typeof descriptor.value === "function") {
					sharedMethodCount += 1;
				}
			});
			return {
				ownFunctionCount: ownFunctionCount,
				sharedMethodCount: sharedMethodCount,
				lazyMethodCount: coldContextMethodNames.length,
				coldMethodsInstalled: !Object.prototype.hasOwnProperty.call(ctx, "__installColdContextMethods")
			};
		}

		function profileCount(ctx, name) {
			if (!ctx || !ctx.profile) {
				return;
			}
			var hotPath = ctx.profile.hotPath || (ctx.profile.hotPath = {});
			hotPath[name] = Number(hotPath[name] || 0) + 1;
		}

		function profileAdd(ctx, name, started) {
			if (!ctx || !ctx.profile) {
				return;
			}
			var hotPath = ctx.profile.hotPath || (ctx.profile.hotPath = {});
			hotPath[name] = Number(hotPath[name] || 0) + profileDuration(started);
		}

		function recordProfile(ctx, kind, name, started) {
			if (!ctx || !ctx.profile) {
				return;
			}
			ctx.profile.blocks.push({
				kind: kind,
				name: String(name || ""),
				durationMs: profileDuration(started)
			});
		}

		function runtimeBlock(blocks, name) {
			var block = blocks && blocks[name];
			return block && block.__flowScriptPlaceholder === true
				? materializeFlowScriptBlock(blocks, name)
				: block;
		}

		function nodeOut(node) {
			if (!node || typeof node !== "object") {
				return undefined;
			}
			if (node.out !== undefined) {
				return node.out;
			}
			return node.props && node.props.out !== undefined ? node.props.out : undefined;
		}

		function canReuseNodeProps(block) {
			return !!block && (String(block.__flowOrigin || "") === "core" ||
				String(block.__blockImplementationRuntime || "") === "flow");
		}

		function machineNodeIndex(node) {
			if (!node || node.__flowMachineNodeIndex === undefined || node.__flowMachineNodeIndex === null) {
				return -1;
			}
			var index = Number(node.__flowMachineNodeIndex);
			return isFinite(index) && index >= 0 ? Math.floor(index) : -1;
		}

		function preparedNodeFor(ctx, node) {
			var index = machineNodeIndex(node);
			if (index >= 0 && ctx && ctx.preparedNodes && ctx.preparedNodes[index]) {
				return ctx.preparedNodes[index];
			}
			return node && node.__flowRuntimeNode;
		}

		function preparationStats(ctx) {
			var stats = ctx && ctx.preparation || {};
			return {
				mode: String(stats.mode || ""),
				preparedNodes: Number(stats.preparedNodes || 0),
				preparedRunners: Number(stats.preparedRunners || 0),
				preparedWriters: Number(stats.preparedWriters || 0),
				materializedBlocks: Number(stats.materializedBlocks || 0)
			};
		}

		runContextPrototype.props = function (node) {
			var prepared = preparedNodeFor(this, node);
			if (prepared && prepared.catalog === this.blocks && prepared.props) {
				profileCount(this, "preparedPropsHits");
				return prepared.props;
			}
			profileCount(this, "preparedPropsMisses");
			return nodeProps(node);
		};
		runContextPrototype.read = function (path) {
			return readScopePath(this.scopes, path);
		};
		runContextPrototype.readObjectPath = readObjectPath;
		runContextPrototype.write = function (path, value) {
			return writeScopePath(this.scopes, path, value);
		};
		runContextPrototype.value = function (value) {
			return evaluateExpression(this, value);
		};
		runContextPrototype.expr = runContextPrototype.value;
		runContextPrototype.compileExpr = function (value) {
			var ctx = this;
			var compiled = compileExpression(value);
			return function () { return compiled(ctx); };
		};
		runContextPrototype.path = function (path) {
			return this.read(path);
		};
		runContextPrototype.literal = function (value) {
			return literalValue(value);
		};
		runContextPrototype.render = function (template) {
			return renderTemplate(template, this);
		};
		runContextPrototype.template = function (value) {
			return renderTemplateTree(this, value);
		};
		runContextPrototype.input = function (props, fallback) {
			return inputValue(this, props || {}, fallback);
		};
		runContextPrototype.parseYaml = function (text) {
			return parseYamlSource(text, "null\n");
		};
		runContextPrototype.isHandle = isRuntimeHandle;
		runContextPrototype.handleSummary = runtimeHandleSummary;
		runContextPrototype.createHandle = function (type, value, options) {
			return createRuntimeHandle(this, type, value, options);
		};
		runContextPrototype.handleValue = function (handle, expectedType) {
			return runtimeHandleValue(handle, expectedType);
		};
		runContextPrototype.closeHandle = function (handle) {
			return closeRuntimeHandle(this, handle);
		};
		runContextPrototype.convertigoContext = function () {
			var invocationContext = this.convertigoContextRef;
			if (invocationContext === null || invocationContext === undefined) {
				raise("CONVERTIGO_CONTEXT_UNAVAILABLE", "This block needs a live Convertigo context.");
			}
			return invocationContext;
		};
		runContextPrototype.runNodes = function (nodes) {
			return executeNodes(this, nodes);
		};
		runContextPrototype.callBlock = function (name, props, options) {
			return callBlock(this, name, props, options);
		};
		runContextPrototype.catalog = function () {
			return catalogDefinition(this.blocks);
		};
		runContextPrototype.lib = function (name) {
			name = safeFilePart(name);
			if (!this.libraries[name]) {
				this.libraries[name] = loadFlowLibrary(name);
			}
			return this.libraries[name];
		};
		runContextPrototype.returnValue = function (value) {
			if (this.request.__deferResultSerializationSafety !== true) {
				assertNoRuntimeHandle(value, "result");
			}
			this.returned = value;
			this.stopped = true;
			return value;
		};
		runContextPrototype.throwFlow = function (options, node) {
			return throwFlowError(options, node);
		};
		runContextPrototype.trace = function (node, name, result) {
			if (!this.traceEnabled) {
				return;
			}
			this.scopes.trace.nodes.push({
				id: nodePath(node),
				block: name,
				result: snapshot(result)
			});
		};
		runContextPrototype.raise = raise;

		function prepareNodeRunner(block, node, props) {
			var trustedRuntime = String(block && block.__flowOrigin || "") === "core" ||
				String(block && block.__blockImplementationRuntime || "") === "flow";
			if (!block || !trustedRuntime ||
					typeof block.prepareNode !== "function" || !props) {
				return null;
			}
			var runner = block.prepareNode(node, {
				props: props,
				compileExpression: compileExpression,
				compileWrite: compileWriteScopePath,
				compileValue: function (value) {
					return compileTemplateTree(literalValue(value));
				}
			});
			if (runner !== null && runner !== undefined && typeof runner !== "function") {
				raise("INVALID_BLOCK_PREPARATION", "Prepared Flow block must return a function: " + String(block.name || ""), node);
			}
			return runner || null;
		}

		function prepareNodeExecutor(node, block, name, out, writer, runner) {
			if (!block) {
				return null;
			}
			return function (ctx) {
				if (ctx.stopped || node.disabled) {
					return undefined;
				}
				var result = runner ? runner(ctx, node) : block.run(ctx, node);
				if (writer && result !== undefined) {
					writer(ctx, result);
				}
				if (ctx.traceEnabled !== false) {
					ctx.trace(node, name, result);
				}
				return result;
			};
		}

		function installPreparedNode(node, blocks, preparedNodes, preparation) {
			if (!node || typeof node !== "object") {
				return null;
			}
			var name = blockName(node);
			if (!name) {
				return null;
			}
			var candidate = preparedNodeFor({ preparedNodes: preparedNodes }, node);
			if (candidate && candidate.catalog === blocks) {
				return candidate;
			}
			var placeholder = blocks && blocks[name] && blocks[name].__flowScriptPlaceholder === true;
			var block = name ? runtimeBlock(blocks, name) : null;
			if (block) {
				var reusableProps = canReuseNodeProps(block) ? nodeProps(node) : null;
				if (reusableProps && typeof Object.freeze === "function") {
					Object.freeze(reusableProps);
				}
				var preparedRunner = prepareNodeRunner(block, node, reusableProps);
				var preparedOut = reusableProps ? reusableProps.out : nodeOut(node);
				var preparedWriter = preparedOut ? compileWriteScopePath(preparedOut) : null;
				var preparedNode = {
						catalog: blocks,
						name: name,
						block: block,
						out: preparedOut,
						write: preparedWriter,
						props: reusableProps,
						run: preparedRunner
					};
				preparedNode.execute = prepareNodeExecutor(node, block, name, preparedNode.out, preparedWriter, preparedRunner);
				var index = machineNodeIndex(node);
				if (index >= 0 && preparedNodes) {
					preparedNodes[index] = preparedNode;
				} else {
					Object.defineProperty(node, "__flowRuntimeNode", {
						value: preparedNode,
						enumerable: false,
						configurable: true
					});
				}
				if (preparation) {
					preparation.preparedNodes = Number(preparation.preparedNodes || 0) + 1;
					if (preparedRunner) {
						preparation.preparedRunners = Number(preparation.preparedRunners || 0) + 1;
					}
					if (preparedWriter) {
						preparation.preparedWriters = Number(preparation.preparedWriters || 0) + 1;
					}
					if (placeholder) {
						preparation.materializedBlocks = Number(preparation.materializedBlocks || 0) + 1;
					}
				}
				return preparedNode;
			}
			return null;
		}

		function prepareExecutionPlan(plan) {
			if (plan && plan.definition && plan.blocks) {
				plan.preparedNodes = plan.machineImage === true ? [] : null;
				plan.preparation = {
					mode: "lazy",
					preparedNodes: 0,
					preparedRunners: 0,
					preparedWriters: 0,
					materializedBlocks: 0
				};
			}
			return plan;
		}

		function ensurePreparedNode(ctx, node) {
			var prepared = preparedNodeFor(ctx, node);
			return prepared && prepared.catalog === ctx.blocks
				? prepared
				: installPreparedNode(node, ctx.blocks, ctx.preparedNodes, ctx.preparation);
		}

		function executeNode(ctx, node) {
			if (ctx.stopped || !node || node.disabled) {
				return undefined;
			}
			var prepareStarted = ctx.profile ? nanoTime() : 0;
			var direct = ensurePreparedNode(ctx, node);
			profileAdd(ctx, "executeNodePrepareMs", prepareStarted);
			if (!ctx.profile && direct && direct.catalog === ctx.blocks && direct.execute) {
				return direct.execute(ctx);
			}
			var profiled = !!ctx.profile;
			var totalStarted = profiled ? nanoTime() : 0;
			profileCount(ctx, "executeNodeCalls");
			try {
				var resolveStarted = profiled ? nanoTime() : 0;
				var prepared = preparedNodeFor(ctx, node);
				var preparedHit = prepared && prepared.catalog === ctx.blocks;
				var name = preparedHit ? prepared.name : blockName(node);
				var block = preparedHit ? prepared.block : runtimeBlock(ctx.blocks, name);
				profileCount(ctx, preparedHit ? "preparedNodeHits" : "preparedNodeMisses");
				profileAdd(ctx, "executeNodeResolveMs", resolveStarted);
				if (!block) {
					raise("UNKNOWN_BLOCK", "Unknown Flow block: " + name, node, "Use flow-catalog or blockList to list supported blocks.");
				}
				var propsStarted = profiled ? nanoTime() : 0;
				var out = preparedHit ? prepared.out : nodeProps(node).out;
				profileAdd(ctx, "executeNodePropsMs", propsStarted);
				var runStarted = profiled ? nanoTime() : 0;
				var result;
				try {
					if (preparedHit && prepared.run) {
						profileCount(ctx, "preparedRunnerHits");
						result = prepared.run(ctx, node);
					} else {
						profileCount(ctx, "preparedRunnerMisses");
						result = block.run(ctx, node);
					}
				} finally {
					recordProfile(ctx, "node", name, runStarted);
					profileAdd(ctx, "executeNodeRunMs", runStarted);
				}
				var commitStarted = profiled ? nanoTime() : 0;
				if (out && result !== undefined) {
					ctx.write(out, result);
				}
				ctx.trace(node, name, result);
				profileAdd(ctx, "executeNodeCommitMs", commitStarted);
				return result;
			} finally {
				profileAdd(ctx, "executeNodeTotalMs", totalStarted);
			}
		}

		function callBlock(ctx, name, props, options) {
			name = String(name || "");
			options = options || {};
			if (!name) {
				raise("MISSING_BLOCK_NAME", "ctx.callBlock requires a block name.");
			}
			var profiled = !!ctx.profile;
			var totalStarted = profiled ? nanoTime() : 0;
			profileCount(ctx, "callBlockCalls");
			var resolveStarted = profiled ? nanoTime() : 0;
			var block = runtimeBlock(ctx.blocks, name);
			profileAdd(ctx, "callBlockResolveMs", resolveStarted);
			if (!block) {
				raise("UNKNOWN_BLOCK", "Unknown Flow block: " + name, null, "Use flow-catalog or blockList to list supported blocks.");
			}
			if (typeof block.run !== "function") {
				raise("INVALID_BLOCK", "Flow block has no runnable implementation: " + name);
			}
			var normalizeStarted = profiled ? nanoTime() : 0;
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
			profileAdd(ctx, "callBlockNormalizeMs", normalizeStarted);
			var propsStarted = profiled ? nanoTime() : 0;
			var nodeProperties = nodeProps(node);
			profileAdd(ctx, "callBlockPropsMs", propsStarted);
			var frameStarted = profiled ? nanoTime() : 0;
			var previousInput = ctx.scopes.input;
			var previousProps = ctx.scopes.props;
			var previousLocal = ctx.scopes.local;
			var previousCurrent = ctx.scopes.current;
			var previousReturned = ctx.returned;
			var previousStopped = ctx.stopped;
			var previousTraceEnabled = ctx.traceEnabled;
			ctx.scopes.props = nodeProperties;
			ctx.scopes.input = ctx.scopes.props;
			ctx.scopes.local = {};
			ctx.returned = undefined;
			ctx.stopped = false;
			if (options.trace === false) {
				ctx.traceEnabled = false;
			}
			profileAdd(ctx, "callBlockFrameEnterMs", frameStarted);
			var started = profiled ? nanoTime() : 0;
			try {
				var runStarted = profiled ? nanoTime() : 0;
				var result;
				try {
					result = block.run(ctx, node);
				} finally {
					profileAdd(ctx, "callBlockRunMs", runStarted);
				}
				var commitStarted = profiled ? nanoTime() : 0;
				if (ctx.returned !== undefined) {
					result = ctx.returned;
				}
				if (nodeProperties.out && result !== undefined) {
					ctx.write(nodeProperties.out, result);
				}
				if (options.trace !== false) {
					ctx.trace(node, name, result);
				}
				profileAdd(ctx, "callBlockCommitMs", commitStarted);
				return result;
			} finally {
				recordProfile(ctx, "call", name, started);
				var restoreStarted = profiled ? nanoTime() : 0;
				ctx.scopes.input = previousInput;
				ctx.scopes.props = previousProps;
				ctx.scopes.local = previousLocal;
				ctx.scopes.current = previousCurrent;
				ctx.returned = previousReturned;
				ctx.stopped = previousStopped;
				ctx.traceEnabled = previousTraceEnabled;
				profileAdd(ctx, "callBlockFrameRestoreMs", restoreStarted);
				profileAdd(ctx, "callBlockTotalMs", totalStarted);
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

		function shouldLearnResultSchema(request) {
			return request && (request.learnResultSchema === true ||
				request.learnFlowResultSchema === true ||
				request.recordResultSchema === true ||
				request.recordOutputSchema === true ||
				request.recordSchema === true);
		}

		function flowPlanIdentity(request) {
			if (!request) {
				return "";
			}
			if (request.definition !== undefined && request.definition !== null) {
				return "definition\n" + JSON.stringify(request.definition);
			}
			if (request.flowSource !== undefined && request.flowSource !== null && String(request.flowSource).trim() !== "") {
				return "source\n" + String(request.flowSource);
			}
			return "";
		}

		function sharedFlowSnapshotIdentity(request, blocks) {
			if (!request) {
				return "";
			}
			if (request.definition !== undefined && request.definition !== null) {
				return "definition\n" + JSON.stringify(request.definition);
			}
			if (request.flowSource !== undefined && request.flowSource !== null && String(request.flowSource).trim() !== "") {
				if (!isFlowScriptSource(request.flowSource)) {
					return "source\n" + String(request.flowSource);
				}
				var catalogFingerprint = flowSnapshotCatalogFingerprint(blocks);
				return catalogFingerprint
					? "flowscript\n" + String(request.flowSource) + "\ncatalog\n" + catalogFingerprint
					: "";
			}
			return "";
		}

		function addSnapshotDuration(name, started) {
			flowSnapshotStats[name] = Number(flowSnapshotStats[name] || 0) + profileDuration(started);
		}

		function compileFlowSnapshot(request, blocks, identity, compilerFingerprint) {
			if (!flowSnapshotService) {
				raise("FLOW_SNAPSHOT_SERVICE_UNAVAILABLE", "Flow execution snapshot service is unavailable.");
			}
			var sourceStarted = nanoTime();
			var source = sourceForFlowRequest(request, blocks);
			addSnapshotDuration("sourceMs", sourceStarted);
			var parseStarted = nanoTime();
			var parsedDefinition = parseSource(source);
			addSnapshotDuration("parseMs", parseStarted);
			var createStarted = nanoTime();
			var compiled = flowSnapshotService.create({
				flowQName: request.flowQName || request.name || request.flowName || "Flow",
				sourceHash: sha256Hex(source),
				compilerFingerprint: compilerFingerprint,
				definition: parsedDefinition
			}, {
				blockName: blockName
			});
			addSnapshotDuration("createMs", createStarted);
			flowSnapshotStats.compiles = Number(flowSnapshotStats.compiles || 0) + 1;
			flowSnapshotStats.payloadBytes = Number(flowSnapshotStats.payloadBytes || 0) + Number(compiled.payloadBytes || 0);
			flowSnapshotStats.maxPayloadBytes = Math.max(Number(flowSnapshotStats.maxPayloadBytes || 0), Number(compiled.payloadBytes || 0));
			return compiled;
		}

		function hydrateFlowSnapshot(compiled, blocks) {
			var started = nanoTime();
			var plan = flowSnapshotService.hydrate(compiled, blocks, {
				blocksWithFlowHelpers: blocksWithFlowHelpers,
				expandFlowDefinition: expandFlowDefinition
			});
			addSnapshotDuration("hydrateMs", started);
			flowSnapshotStats.hydrations = Number(flowSnapshotStats.hydrations || 0) + 1;
			return plan;
		}

		function flowMachineImageKey(request, blocks, compilerFingerprint) {
			var identity = sharedFlowSnapshotIdentity(request, blocks);
			if (!identity) {
				return "";
			}
			var flowQName = request.flowQName || request.name || request.flowName || "Flow";
			var snapshotKey = sharedFlowSnapshotKey(sha256Hex(identity), compilerFingerprint, flowQName);
			return snapshotKey ? snapshotKey + "\nflow-machine-image-v1" : "";
		}

		function readSharedFlowSnapshot(request, blocks, compilerFingerprint) {
			var identity = sharedFlowSnapshotIdentity(request, blocks);
			if (!identity) {
				flowSnapshotStats.sharedSkips = Number(flowSnapshotStats.sharedSkips || 0) + 1;
				return { key: "", owner: false, snapshot: null };
			}
			var flowQName = request.flowQName || request.name || request.flowName || "Flow";
			var key = sharedFlowSnapshotKey(sha256Hex(identity), compilerFingerprint, flowQName);
			if (!key) {
				flowSnapshotStats.sharedSkips = Number(flowSnapshotStats.sharedSkips || 0) + 1;
				return { key: "", owner: false, snapshot: null };
			}
			var payload = sharedFlowSnapshotGet(key);
			if (!payload) {
				flowSnapshotStats.sharedMisses = Number(flowSnapshotStats.sharedMisses || 0) + 1;
				if (sharedFlowSnapshotClaim(key)) {
					return { key: key, owner: true, snapshot: null };
				}
				payload = sharedFlowSnapshotAwait(key);
				if (!payload && sharedFlowSnapshotClaim(key)) {
					return { key: key, owner: true, snapshot: null };
				}
				if (!payload) {
					flowSnapshotStats.sharedSkips = Number(flowSnapshotStats.sharedSkips || 0) + 1;
					return { key: "", owner: false, snapshot: null };
				}
			}
			var started = nanoTime();
			try {
				var compiled = flowSnapshotService.deserialize(payload);
				addSnapshotDuration("sharedDeserializeMs", started);
				flowSnapshotStats.sharedHits = Number(flowSnapshotStats.sharedHits || 0) + 1;
				return { key: key, owner: false, snapshot: compiled };
			} catch (e) {
				addSnapshotDuration("sharedDeserializeMs", started);
				flowSnapshotStats.sharedErrors = Number(flowSnapshotStats.sharedErrors || 0) + 1;
				sharedFlowSnapshotAbort(key);
				return { key: key, owner: sharedFlowSnapshotClaim(key), snapshot: null };
			}
		}

		function publishSharedFlowSnapshot(key, compiled, owner) {
			if (!key || !compiled || owner !== true) {
				return;
			}
			try {
				if (sharedFlowSnapshotPut(key, flowSnapshotService.serialize(compiled))) {
					flowSnapshotStats.sharedWrites = Number(flowSnapshotStats.sharedWrites || 0) + 1;
				} else {
					sharedFlowSnapshotAbort(key);
					flowSnapshotStats.sharedErrors = Number(flowSnapshotStats.sharedErrors || 0) + 1;
				}
			} catch (e) {
				sharedFlowSnapshotAbort(key);
				flowSnapshotStats.sharedErrors = Number(flowSnapshotStats.sharedErrors || 0) + 1;
			}
		}

		function compileFlowPlan(request, blocks) {
			var identity = flowPlanIdentity(request);
			var cacheKey = "";
			var compilerFingerprint = flowPlanCompilerFingerprint ? flowPlanCompilerFingerprint() : "";
			if (identity && flowPlanCache && readRuntimeBoundedCache && sha256Hex) {
				cacheKey = String(request.flowQName || request.name || request.flowName || "Flow") + "\n" + sha256Hex(identity);
				var cached = readRuntimeBoundedCache(flowPlanCache, cacheKey, compilerFingerprint);
				if (cached && cached.catalog === blocks) {
					return cached;
				}
			}
			var machineKey = flowMachineImageKey(request, blocks, compilerFingerprint);
			if (machineKey) {
				var sharedDefinition = sharedFlowMachineImageGet(machineKey);
				if (sharedDefinition) {
					flowSnapshotStats.machineHits = Number(flowSnapshotStats.machineHits || 0) + 1;
					var machineBlocks = blocksWithFlowHelpers(blocks, sharedDefinition);
					var machinePlan = prepareExecutionPlan({
						definition: sharedDefinition,
						blocks: machineBlocks,
						catalog: blocks,
						machineImage: true
					});
					if (cacheKey && writeRuntimeBoundedCache) {
						return writeRuntimeBoundedCache(flowPlanCache, cacheKey, compilerFingerprint,
							machinePlan, "compiled Flow plans");
					}
					return machinePlan;
				}
				flowSnapshotStats.machineMisses = Number(flowSnapshotStats.machineMisses || 0) + 1;
			}
			var shared = readSharedFlowSnapshot(request, blocks, compilerFingerprint);
			var compiled;
			try {
				compiled = shared.snapshot || compileFlowSnapshot(request, blocks, identity, compilerFingerprint);
				if (!shared.snapshot) {
					publishSharedFlowSnapshot(shared.key, compiled, shared.owner);
				}
			} catch (e) {
				if (shared.owner) {
					sharedFlowSnapshotAbort(shared.key);
				}
				throw e;
			}
			var plan = hydrateFlowSnapshot(compiled, blocks);
			if (machineKey) {
				try {
					var image = sharedFlowMachineImagePut(machineKey, JSON.stringify(plan.definition));
					if (image) {
						plan.definition = image;
						plan.machineImage = true;
						flowSnapshotStats.machineStores = Number(flowSnapshotStats.machineStores || 0) + 1;
					} else {
						flowSnapshotStats.machineErrors = Number(flowSnapshotStats.machineErrors || 0) + 1;
					}
				} catch (e) {
					flowSnapshotStats.machineErrors = Number(flowSnapshotStats.machineErrors || 0) + 1;
				}
			}
			plan = prepareExecutionPlan(plan);
			if (cacheKey && writeRuntimeBoundedCache) {
				return writeRuntimeBoundedCache(flowPlanCache, cacheKey, compilerFingerprint, plan, "compiled Flow plans");
			}
			return plan;
		}

		function resolveRunPlan(request, blocks) {
			var measure = profileEnabled(request);
			var headEligible = !blocks;
			if (headEligible) {
				var head = readRunPlanHead(request);
				if (head && head.blocks && head.plan) {
					return {
						blocks: head.blocks,
						plan: head.plan,
						headHit: true,
						loadBlocksMs: 0,
						compilePlanMs: 0
					};
				}
			}
			var loadStarted = measure && !blocks ? nanoTime() : 0;
			blocks = blocks || loadBlocks(true);
			var loadMs = measure && loadStarted ? profileDuration(loadStarted) : Number(request.loadBlocksMs || 0);
			var compileStarted = measure ? nanoTime() : 0;
			var plan = compileFlowPlan(request, blocks);
			var compileMs = measure ? profileDuration(compileStarted) : 0;
			if (headEligible) {
				writeRunPlanHead(request, blocks, plan);
			}
			return {
				blocks: blocks,
				plan: plan,
				headHit: false,
				loadBlocksMs: loadMs,
				compilePlanMs: compileMs
			};
		}

		function runFlowRequest(request, blocks) {
			var measure = profileEnabled(request);
			var deepProfile = request.profile === true;
			var runStarted = measure ? nanoTime() : 0;
			var resolveStarted = measure ? nanoTime() : 0;
			var resolved = resolveRunPlan(request, blocks);
			var profile = measure ? {
				mode: deepProfile ? "deep" : "envelope",
				runPlanHeadHit: resolved.headHit,
				loadBlocksMs: resolved.loadBlocksMs,
				compilePlanMs: resolved.compilePlanMs,
				resolveRunPlanMs: profileDuration(resolveStarted),
				loadConfigMs: 0,
				configLoaded: false,
				createContext: {},
				blocks: deepProfile ? [] : undefined,
				hotPath: deepProfile ? {} : undefined
			} : null;
			var plan = resolved.plan;
			var definition = plan.definition;
			var activeBlocks = plan.blocks;
			var contextStarted = measure ? nanoTime() : 0;
			var ctx = createRunContext(request, definition, activeBlocks, loadProjectEngineDefinition, plan,
				profile ? profile.createContext : null, profile);
			if (profile) {
				profile.createContextMs = profileDuration(contextStarted);
				profile.frameBefore = contextFrameStats(ctx);
				profile.preparationBefore = preparationStats(ctx);
				if (deepProfile) {
					ctx.profile = profile;
				}
			}
			try {
				var executeStarted = measure ? nanoTime() : 0;
				ctx.runNodes(definition.nodes || []);
				if (profile) {
					profile.executeNodesMs = profileDuration(executeStarted);
				}
				var selectStarted = measure ? nanoTime() : 0;
				var result = ctx.returned === undefined ? ctx.scopes.result : ctx.returned;
				if (profile) {
					profile.selectResultMs = profileDuration(selectStarted);
				}
				var safetyStarted = measure ? nanoTime() : 0;
				if (request.__deferResultSerializationSafety !== true) {
					assertNoRuntimeHandle(result, "result");
				}
				if (profile) {
					profile.resultSafetyMs = profileDuration(safetyStarted);
				}
				var schemaStarted = measure ? nanoTime() : 0;
				var resultSchema = shouldLearnResultSchema(request) ? learnResultSchema(request, definition, result) : null;
				if (resultSchema && resultSchema.learned === true) {
					ctx.schemaUpdates.push({
						scope: "result",
						node: "return",
						block: "return",
						property: "out",
						file: resultSchema.file,
						schema: schemaSummary(resultSchema.schema),
						message: "Recorded final result schema. Future output-schema calls can use this explicit learned override."
					});
				}
				if (profile) {
					profile.learnSchemaMs = profileDuration(schemaStarted);
				}
				var closeStarted = measure ? nanoTime() : 0;
				closeRuntimeHandles(ctx);
				if (profile) {
					profile.closeHandlesMs = profileDuration(closeStarted);
				}
				var responseStarted = measure ? nanoTime() : 0;
				var out = {
					ok: true,
					result: result
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
				if (profile) {
					profile.frameAfter = contextFrameStats(ctx);
					profile.preparationAfter = preparationStats(ctx);
					profile.assembleResponseMs = profileDuration(responseStarted);
					profile.runFlowRequestMs = profileDuration(runStarted);
					out.profile = profile;
				}
				return out;
			} finally {
				var finalCloseStarted = measure ? nanoTime() : 0;
				closeRuntimeHandles(ctx);
				if (profile) {
					profile.finalCloseHandlesMs = profileDuration(finalCloseStarted);
				}
			}
		}

		function frameScopeValue(request, name) {
			var value = request && request[name];
			if (value === undefined || value === null) {
				return {};
			}
			if (request.__deferResultSerializationSafety === true && value && typeof value === "object" &&
				Object.prototype.toString.call(value) === "[object Object]") {
				return Object.assign({}, value);
			}
			return normalizeTree(value);
		}

		function createRunContext(request, definition, blocks, projectEngine, plan, frameProfile, requestProfile) {
			var totalStarted = frameProfile ? nanoTime() : 0;
			var captureStarted = frameProfile ? nanoTime() : 0;
			var invocationContext = currentConvertigoContext();
			var invocationProjectDir = projectDir();
			if (frameProfile) {
				frameProfile.captureInvocationMs = profileDuration(captureStarted);
			}
			var requestStarted = frameProfile ? nanoTime() : 0;
			var requestScope = frameScopeValue(request, "context");
			var projectName = currentProjectName(request);
			if (projectName) {
				requestScope.project = projectName;
			}
			var frameState = {
				request: request,
				definition: definition,
				invocationProjectDir: invocationProjectDir,
				projectEngineSource: projectEngine,
				projectEngineValue: null,
				projectEngineResolved: false,
				profile: requestProfile || null
			};
			Object.defineProperty(requestScope, "__flowFrameState", {
				value: frameState,
				writable: false,
				configurable: false,
				enumerable: false
			});
			Object.defineProperty(requestScope, "engineDir", requestEngineDirDescriptor);
			Object.defineProperty(requestScope, "engineProjectDir", requestEngineProjectDirDescriptor);
			Object.defineProperty(requestScope, "projectDir", requestProjectDirDescriptor);
			if (frameProfile) {
				frameProfile.requestScopeMs = profileDuration(requestStarted);
			}
			var scopesStarted = frameProfile ? nanoTime() : 0;
			var scopes = {
				request: requestScope,
				input: frameScopeValue(request, "input"),
				local: {},
				result: {},
				trace: { nodes: [] },
				current: null,
				props: {}
			};
			Object.defineProperty(scopes, "config", scopesConfigDescriptor);
			if (frameProfile) {
				frameProfile.scopesMs = profileDuration(scopesStarted);
			}
			var frameStarted = frameProfile ? nanoTime() : 0;
			var ctx = Object.create(runContextPrototype);
			Object.assign(ctx, {
				request: request,
				convertigoContextRef: invocationContext,
				definition: definition,
				blocks: blocks,
				preparedNodes: plan && plan.preparedNodes || null,
				preparation: plan && plan.preparation || null,
				libraries: {},
				returned: undefined,
				stopped: false,
				handles: {},
				handleSeq: 0,
				schemaUpdates: [],
				graphBlockStack: [],
				maxGraphBlockDepth: intOption(request.maxGraphBlockDepth, 128, 1, 1000),
				traceEnabled: request.includeTrace !== false,
				scopes: scopes
			});
			Object.defineProperty(ctx, "engine", contextEngineDescriptor);
			if (frameProfile) {
				frameProfile.frameObjectMs = profileDuration(frameStarted);
			}
			var capabilitiesStarted = frameProfile ? nanoTime() : 0;
			ctx.__installColdContextMethods = installColdContextMethods;
			if (frameProfile) {
				frameProfile.lazyCapabilitiesMs = profileDuration(capabilitiesStarted);
				frameProfile.totalMs = profileDuration(totalStarted);
			}
			return ctx;
		}

		function installColdContextMethods() {
			var ctx = this;
			var request = ctx.request;
			var definition = ctx.definition;
			delete ctx.__installColdContextMethods;
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
			ctx.authoringTreeSource = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return authoringTreeRequest(args, loadBlocks());
				});
			};
			ctx.authoringContractSource = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return authoringContractRequest(args, loadBlocks());
				});
			};
			ctx.authoringPaletteSource = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return authoringPaletteRequest(args, loadBlocks());
				});
			};
			ctx.authoringMutateSource = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return authoringMutateRequest(args, loadBlocks());
				});
			};
			ctx.contextMenuSource = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return contextMenuRequest(args, loadBlocks());
				});
			};
			ctx.contextActionSource = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return contextActionRequest(args, loadBlocks());
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
			ctx.resourceDelete = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return resources.remove(args);
				});
			};
			ctx.notifySourceMutation = function (args) {
				args = args || {};
				return notifySourceMutation(args);
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
					args.name = name;
					return blockCode.set(loadBlocks(), args);
				});
			};
			ctx.blockCodeCheck = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return blockCode.check(loadBlocks(), args);
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
		}

		return {
			executeNode: executeNode,
			callBlock: callBlock,
			executeNodes: executeNodes,
			runFlowRequest: runFlowRequest,
			compileFlowPlan: compileFlowPlan,
			compileFlowSnapshot: compileFlowSnapshot,
			hydrateFlowSnapshot: hydrateFlowSnapshot,
			resolveRunPlan: resolveRunPlan,
			createRunContext: createRunContext,
			prepareExecutionPlan: prepareExecutionPlan
		};
	}

	var cachedEnv = null;
	var cachedService = null;

	function serviceFor(env) {
		if (cachedEnv !== env || !cachedService) {
			cachedEnv = env;
			cachedService = create(env);
		}
		return cachedService;
	}

	return {
		create: create,
		executeNode: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return serviceFor(env).executeNode.apply(null, args);
		},
		callBlock: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return serviceFor(env).callBlock.apply(null, args);
		},
		executeNodes: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return serviceFor(env).executeNodes.apply(null, args);
		},
		runFlowRequest: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return serviceFor(env).runFlowRequest.apply(null, args);
		},
		compileFlowPlan: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return serviceFor(env).compileFlowPlan.apply(null, args);
		},
		compileFlowSnapshot: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return serviceFor(env).compileFlowSnapshot.apply(null, args);
		},
		hydrateFlowSnapshot: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return serviceFor(env).hydrateFlowSnapshot.apply(null, args);
		},
		createRunContext: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return serviceFor(env).createRunContext.apply(null, args);
		},
		prepareExecutionPlan: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return serviceFor(env).prepareExecutionPlan.apply(null, args);
		}
	};
}())
