(function () {
	// resolved once with the module: a lookup through the Packages of a call costs class loader misses at each loop
	var Synchronizer = typeof Packages !== "undefined" ? Packages.org.mozilla.javascript.Synchronizer : null;

	function create(env) {
		env = env || {};
		var blockName = env.blockName;
		var nodeProps = env.nodeProps;
		var nodeOut = env.nodeOutputPath;
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
		var destinations = env.destinationContract;
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
		var withActiveRequest = env.withActiveRequest || function (_request, callback) { return callback(); };
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
		var blockCatalog = env.blockCatalog || function (block) {
			return block && typeof block.catalog === "function" ? block.catalog() : {};
		};
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
		// ctx.java: the Java packages of the class path of the project of the call (its libs, then the engine)
		Object.defineProperty(runContextPrototype, "java", { get: function () {
			return typeof env.projectPackages === "function" ? env.projectPackages() : Packages;
		} });
		Object.defineProperty(runContextPrototype, "collections", { get: function () {
			var ctx = this;
			var api = env.typedScopeContract.create({
				schemas: env.schemaContract, destinations: destinations, raise: raise,
				scopes: function () { return ctx.scopes; },
				preflight: function (path, value) {
					if (path.indexOf("result.") === 0) assertNoRuntimeHandle(value, "result");
					// json.push and json.put change their collection in place, before writing it back: in a parallel
					// lane, never a collection shared with the caller
					var guard = ctx.scopes.__flowSharedGuard;
					if (guard && guard.refuses(ctx.read(path), ctx.scopes)) {
						raise("PARALLEL_SCOPE_READ_ONLY", path + " cannot be changed in a parallel chunk: it is shared by the chunks there, "
							+ "read-only. Build the collection in local, or return a value and combine it in reduce.");
					}
				},
				read: function (path) { return ctx.read(path); },
				write: function (path, value) { return ctx.write(path, value); }
			});
			Object.defineProperty(ctx, "collections", {value: api, enumerable: false});
			return api;
		} });
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

		// The Convertigo context of a run context, or null, without raising. A lane has none of its own (its thread has no
		// Convertigo context): it reads the one its caller resolved on the calling thread.
		function invocationContextOf(ctx) {
			if (ctx.__flowLane === true) {
				var template = ctx.__flowTemplate;
				return template && template.invocationContext || null;
			}
			var state = frameStateForRequestScope(ctx.scopes.request);
			if (!state) {
				return null;
			}
			if (!Object.prototype.hasOwnProperty.call(state, "invocationContext")) {
				state.invocationContext = currentConvertigoContext();
			}
			return state.invocationContext || null;
		}

		function invocationHttpState(invocation) {
			// a Flow called directly by another one runs in a child invocation, without HttpState: no cookie is kept for it
			if (invocation === null || invocation === undefined || !("httpState" in invocation)) {
				return null;
			}
			var state = invocation.httpState;
			if (state === null || state === undefined) {
				state = new Packages.org.mozilla.javascript.Synchronizer(function () {
					if (invocation.httpState === null || invocation.httpState === undefined) {
						invocation.httpState = new Packages.org.apache.commons.httpclient.HttpState();
					}
					return invocation.httpState;
				}, invocation)();
			}
			return state;
		}

		function resolveFrameProjectEngine(state) {
			if (!Object.prototype.hasOwnProperty.call(state, "projectEngineValue")) {
				var started = state.profile ? nanoTime() : 0;
				var source = state.projectEngineSource;
				state.projectEngineValue = (typeof source === "function" ? source() : source) || {};
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
			if (state && !Object.prototype.hasOwnProperty.call(state, "invocationProjectDir")) {
				state.invocationProjectDir = projectDir();
			}
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
		Object.defineProperty(runContextPrototype, "engine", contextEngineDescriptor);
		Object.defineProperty(runContextPrototype, "__installColdContextMethods", {
			value: installColdContextMethods,
			writable: false,
			configurable: false,
			enumerable: false
		});

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
			var scopes = ctx && ctx.scopes;
			var requestScope = scopes && scopes.request;
			var frameState = requestScope && requestScope.__flowFrameState;
			var ownSlotCount = Object.getOwnPropertyNames(ctx || {}).length;
			var frameStateOwnSlotCount = Object.getOwnPropertyNames(frameState || {}).length;
			return {
				ownSlotCount: ownSlotCount,
				scopesOwnSlotCount: Object.getOwnPropertyNames(scopes || {}).length,
				requestScopeOwnSlotCount: Object.getOwnPropertyNames(requestScope || {}).length,
				frameStateOwnSlotCount: frameStateOwnSlotCount,
				frameStateIsContext: frameState === ctx,
				retainedFrameSlotCount: ownSlotCount + (frameState === ctx ? 0 : frameStateOwnSlotCount),
				ownFunctionCount: ownFunctionCount,
				sharedMethodCount: sharedMethodCount,
				lazyMethodCount: coldContextMethodNames.length,
				coldMethodsInstalled: Object.prototype.hasOwnProperty.call(ctx, coldContextMethodNames[0])
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

		function allocatedBytes() {
			return typeof env.threadAllocatedBytes === "function" ? env.threadAllocatedBytes() : null;
		}
		function recordProfile(ctx, kind, name, started, allocatedStart) {
			if (!ctx || !ctx.profile) {
				return;
			}
			var record = {
				kind: kind,
				name: String(name || ""),
				durationMs: profileDuration(started)
			};
			if (allocatedStart !== null && allocatedStart !== undefined) {
				var end = allocatedBytes();
				if (end !== null) record.allocatedBytes = Math.max(0, Number(end - allocatedStart));
			}
			ctx.profile.blocks.push(record);
		}

		function runtimeBlock(blocks, name) {
			var block = blocks && blocks[name];
			return block && block.__flowScriptPlaceholder === true
				? materializeFlowScriptBlock(blocks, name)
				: block;
		}

		function canReuseNodeProps(block) {
			return !!block && (String(block.__flowOrigin || "") === "core" ||
				String(block.__blockImplementationRuntime || "") === "flow" ||
				env.sharedRuntime && block.__graphRhino && block.__graphRhino.script.stateless === true);
		}

		function machineNodeIndex(node) {
			if (!node || node.__flowMachineNodeIndex === undefined || node.__flowMachineNodeIndex === null) {
				return -1;
			}
			var index = Number(node.__flowMachineNodeIndex);
			return isFinite(index) && index >= 0 ? Math.floor(index) : -1;
		}

		function preparedNodeFor(ctx, node) {
			if (ctx && ctx.preparedNodes && typeof ctx.preparedNodes.get === "function") return ctx.preparedNodes.get(node);
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

		// The defaults a project reads are those of the definer version it recorded
		// (_flow/dependencies.json): the catalog carries the historical ones, if any.
		function declaredWithHistory(declared, blocks, name) {
			var history = blocks && blocks.__flowDefaultsHistory && blocks.__flowDefaultsHistory[name];
			if (!history) {
				return declared;
			}
			var out = Object.assign({}, declared);
			Object.keys(history).forEach(function (key) {
				if (out[key]) out[key] = Object.assign({}, out[key], { "default": history[key] });
			});
			return out;
		}

		// Unshrink: a canonical source omits a property equal to its declared default
		// (as Convertigo project YAML does); the block receives the default back.
		function nodePropsWithDefaults(node, block, blocks) {
			var props = nodeProps(node);
			if (!block) {
				return props;
			}
			var declared = declaredWithHistory((blockCatalog(block) || {}).props || {}, blocks, blockName(node));
			Object.keys(declared).forEach(function (key) {
				var descriptor = declared[key];
				if (props[key] === undefined && descriptor && descriptor["default"] !== undefined) {
					props[key] = normalizeTree(descriptor["default"]);
				}
			});
			return props;
		}

		runContextPrototype.props = function (node) {
			var prepared = preparedNodeFor(this, node);
			if (prepared && prepared.catalog === this.blocks && prepared.props) {
				profileCount(this, "preparedPropsHits");
				return prepared.props;
			}
			profileCount(this, "preparedPropsMisses");
			var name = blockName(node);
			return nodePropsWithDefaults(node, name ? runtimeBlock(this.blocks, name) : null, this.blocks);
		};
		runContextPrototype.outputPath = function (node) {
			return nodeOut(node);
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
		// A value converted to a declared type, as the inputs of a Flow: { ok, value } or { ok: false, message }.
		runContextPrototype.nativePropertyContract = function () { return env.nativePropertyContract(); };
		runContextPrototype.convert = function (value, schema) {
			return env.typeConversion.convert(value, schema);
		};
		runContextPrototype.input = function (props, fallback) {
			return inputValue(this, props || {}, fallback);
		};
		runContextPrototype.parseYaml = function (text) {
			return parseYamlSource(text, "null\n");
		};
		runContextPrototype.isHandle = isRuntimeHandle;
		runContextPrototype.handleSummary = runtimeHandleSummary;
		runContextPrototype.createRowsPlan = function (plan) { return env.createRowsPlan(this, plan); };
		runContextPrototype.resultWithRows = function (handle, field, fields) { return env.resultWithRows(this, handle, field, fields); };
		runContextPrototype.createRowsCursor = function (spec) { return env.createRowsCursor(this, spec); };
		runContextPrototype.rowsCursorNext = function (handle, size) { return env.rowsCursorNext(this, handle, size); };
		runContextPrototype.closeRowsCursor = function (handle) { return env.closeRuntimeHandle(this, handle); };
		runContextPrototype.openEmitSink = function (field, node) { return env.openEmitSink(this, field, node); };
		runContextPrototype.createHandle = function (type, value, options) {
			return createRuntimeHandle(this, type, value, options);
		};
		runContextPrototype.handleValue = function (handle, expectedType) {
			return runtimeHandleValue(handle, expectedType);
		};
		runContextPrototype.closeHandle = function (handle) {
			return closeRuntimeHandle(this, handle);
		};
		// Cooperative cancellation, as bContinue in Convertigo sequences: read before each
		// block and before a result is published. Blocks with internal loops read it too.
		runContextPrototype.canContinue = function () {
			if (this.cancelled) {
				return false;
			}
			if (this.parentRun && !this.parentRun.canContinue()) {
				this.cancelled = this.parentRun.cancelled || "cancelled";
				return false;
			}
			var host = this.hostRequestable;
			if (host === undefined) {
				host = this.hostRequestable = hostRequestable();
			}
			if (host && !host.isRunning()) {
				this.cancelled = "cancelled";
				return false;
			}
			return true;
		};
		runContextPrototype.cancel = function (reason) {
			this.cancelled = String(reason || "cancelled");
		};
		runContextPrototype.convertigoContext = function () {
			var state = frameStateForRequestScope(this.scopes.request);
			if (!Object.prototype.hasOwnProperty.call(state, "invocationContext")) {
				state.invocationContext = currentConvertigoContext();
			}
			var invocationContext = state.invocationContext;
			if (invocationContext === null || invocationContext === undefined) {
				raise("CONVERTIGO_CONTEXT_UNAVAILABLE", "This block needs a live Convertigo context.");
			}
			return invocationContext;
		};
		// The HttpState of the Convertigo context of the call, where the legacy HTTP connectors keep its cookies: created
		// when missing, null without such a context (standalone run, Flow called directly by another one). A parallel chunk
		// gets the one of its caller (invocationContextOf): HttpState methods are synchronized.
		runContextPrototype.convertigoHttpState = function () {
			return invocationHttpState(invocationContextOf(this));
		};
		runContextPrototype.tryDirectRequestable = function (target, input) {
			return env.tryDirectRequestable ? env.tryDirectRequestable(this, target, input) : null;
		};
		// The protected authoring primitives check the principal of the root request (authoring-primitive-service)
		runContextPrototype.configMutate = function (args) {
			var invocation = null;
			try {
				invocation = this.convertigoContext();
			} catch (standalone) {
				invocation = null;
			}
			return env.configMutate(args || {}, invocation);
		};
		runContextPrototype.schemaAdopt = function (args) {
			var invocation = null;
			try {
				invocation = this.convertigoContext();
			} catch (standalone) {
				invocation = null;
			}
			return env.schemaAdopt(args || {}, invocation);
		};
		runContextPrototype.runNodes = function (nodes) {
			return executeNodes(this, nodes);
		};
		runContextPrototype.callBlock = function (name, props, options) {
			return this.allocationTrace ? callAttributedBlock(this, name, props, options) : callBlock(this, name, props, options);
		};
		runContextPrototype.catalog = function () {
			return catalogDefinition(this.blocks);
		};
		runContextPrototype.blockNames = function () {
			return Object.keys(this.blocks || {}).sort();
		};
		runContextPrototype.blockContract = function (name) {
			var blockId = String(name || "");
			var block = blockId && this.blocks && this.blocks[blockId];
			if (!block) {
				return null;
			}
			var contract = Object.assign({}, normalizeTree(blockCatalog(block) || {}));
			contract.blockId = blockId;
			contract.block = contract.block || blockId;
			contract.name = contract.name || blockId;
			return contract;
		};
		runContextPrototype.lib = function (name) {
			name = safeFilePart(name);
			var libraries = this.libraries || (this.libraries = {});
			if (!libraries[name]) {
				libraries[name] = loadFlowLibrary(name);
			}
			return libraries[name];
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
			var phase = this.allocationTrace ? this.allocationTrace.open("runtime", "trace", name) : null;
			try {
			var trace = this.scopes.trace || (this.scopes.trace = { nodes: [] });
			trace.nodes.push({
				id: nodePath(node),
				block: name,
				result: snapshot(result)
			});
			} finally { if (phase) phase.close(); }
		};
		runContextPrototype.raise = raise;

		// Parallel lanes (flow-json-native/PARALLEL-DESIGN.md). options.work(lane, task) runs every task on up to
		// options.lanes threads of the server, each lane with its own run context; options.pull() gives the tasks
		// ({index} from 0, or null at the end) and options.settle(outcome, lane) takes their outcomes ({index, task,
		// value} or {index, task, failed, error}) in task order, both on the calling thread, settle in a run context of
		// the calling thread. options.check() runs between them and throws to cancel. With failFast, a failed task stops
		// the tasks after it, and its settle must throw. Without the shared runtime or a free thread, inside a lane, or for
		// one lane, the tasks run one by one on the calling thread with the same contract.
		// What a task records for its caller (trace, profile, learned output schemas) is given to the caller before its
		// settle, in task order. When a settle throws, the tasks after it that had started are stopped at once (their
		// blocking calls interrupted) and their indexes are given in details.discardedChunks of the error: their outcomes
		// are dropped, but their external effects (an HTTP call) may have happened.
		runContextPrototype.runLanes = function (options) {
			return runLanes(this, options || {});
		};

		var LANE_UNSUPPORTED = ["convertigoContext", "tryDirectRequestable", "runFlowSource", "configMutate", "schemaAdopt",
			"createRowsPlan", "resultWithRows", "openEmitSink"];
		var LANE_HANDLE_METHODS = ["handleValue", "closeHandle", "rowsCursorNext", "closeRowsCursor"];

		// What every run context of a lane does differently, set once: a lane context is created per lane and per loop
		var laneContextPrototype = Object.create(runContextPrototype);
		Object.defineProperty(laneContextPrototype, "__flowLane", { value: true, enumerable: false });
		Object.defineProperty(laneContextPrototype, "canContinue", { enumerable: false, value: function () {
			if (this.cancelled) return false;
			var lanes = this.__flowLanes;
			if (lanes) {
				var index = this.__flowTaskIndex;
				if (!lanes.canContinue(index === undefined ? -1 : index)) {
					var reason = lanes.cancelled();
					this.cancelled = reason === null || reason === undefined ? "cancelled" : String(reason);
					return false;
				}
				return true;
			}
			var caller = this.__flowTemplate.caller;
			if (!caller.canContinue()) {
				this.cancelled = caller.cancelled || "cancelled";
				return false;
			}
			return true;
		} });
		LANE_UNSUPPORTED.forEach(function (name) {
			var refused = function () {
				raise("FOR_EACH_CHUNK_PARALLEL_UNSUPPORTED", "This block cannot run in a parallel chunk (" + name + "): it needs the "
					+ "Convertigo context, or writes the state of the call.", null,
					"Run it before or after the chunk loop, or set parallel to 1.");
			};
			// the installer of the cold methods assigns them all: an inherited setter keeps the refusal
			Object.defineProperty(laneContextPrototype, name, { enumerable: false, get: function () { return refused; }, set: function () {} });
		});
		// a learned output schema is written by the caller, in task order (a project file, and its schema updates)
		var laneLearn = function (node, property, outPath, value) {
			var records = this.__flowTaskRecords;
			if (records) {
				(records.learned || (records.learned = [])).push([node, property, outPath, value]);
				return { learned: false, deferred: true };
			}
			return this.__flowTemplate.caller.learnOutputSchema(node, property, outPath, value);
		};
		Object.defineProperty(laneContextPrototype, "learnOutputSchema", { enumerable: false, get: function () { return laneLearn; }, set: function () {} });
		LANE_HANDLE_METHODS.forEach(function (name) {
			var shared = runContextPrototype[name];
			Object.defineProperty(laneContextPrototype, name, { enumerable: false, value: function (handle) {
				var handles = this.handles;
				if (!handle || !handles || handles[handle.__flowHandleId] !== handle) {
					raise("FOR_EACH_CHUNK_PARALLEL_HANDLE", "A parallel chunk can only use the handles it opened: the handles of the caller "
						+ "(the source of the loop for instance) belong to its thread.", null);
				}
				return shared.apply(this, arguments);
			} });
		});

		function runLanes(ctx, options) {
			var template = laneTemplate(ctx, options);
			var callerLane = createLaneContext(template, null);
			var requested = Math.floor(Number(options.lanes) || 1);
			var check = typeof options.check === "function" ? options.check : function () {};
			var pending = [], pullFailed = false, pullError, exhausted = false;
			var threaded = requested > 1 && ctx.__flowLane !== true && typeof env.openLanes === "function";
			if (threaded) {
				// the lanes are opened once a second task is there: a source of one chunk runs it here, without their cost
				check();
				var first = options.pull();
				if (first === null || first === undefined) return { lanes: 0 };
				pending.push(first);
				try {
					var second = options.pull();
					if (second !== null && second !== undefined) pending.push(second);
					else exhausted = true;
				} catch (error) {
					pullFailed = true;
					pullError = error;
				}
			}
			var lanes = null;
			if (threaded && pending.length > 1) {
				shareLazyValues(template);
				lanes = env.openLanes(requested, laneBody(template, options.work));
			}
			if (!lanes) {
				for (;;) {
					check();
					var task = pending.length ? pending.shift() : pullFailed || exhausted ? null : options.pull();
					if (task === null || task === undefined) {
						if (pullFailed) throw pullError;
						return { lanes: 0 };
					}
					var done = runLaneTask(callerLane, task, options.work);
					giveRecords(template, done);
					options.settle(done, callerLane);
				}
			}
			var window, submitted = 0, settled = 0, ready = {};
			var pulling = !pullFailed, stopIndex = -1, completed = false, settleFailed = -1, thrown;
			try {
				window = Number(lanes.window());
				pending.forEach(function (task) { lanes.submit(task, task.index); });
				submitted = pending.length;
				pending = null;
				if (!pulling) lanes.finish();
				for (;;) {
					check();
					while (pulling && submitted - settled < window) {
						var next;
						try {
							next = options.pull();
						} catch (error) {
							pullFailed = true;
							pullError = error;
							next = null;
						}
						if (next === null || next === undefined) {
							pulling = false;
							lanes.finish();
							break;
						}
						lanes.submit(next, next.index);
						submitted++;
					}
					if (!pulling && (settled === submitted || stopIndex >= 0 && settled > stopIndex)) break;
					var outcome = lanes.poll(50);
					if (outcome === null || outcome === undefined) continue;
					if (outcome.failed && options.failFast && (stopIndex < 0 || outcome.index < stopIndex)) {
						// the tasks after a failed one are useless: none is pulled, the running ones stop at once
						stopIndex = outcome.index;
						lanes.stopAfter(stopIndex);
						if (pulling) {
							pulling = false;
							lanes.finish();
						}
					}
					ready[outcome.index] = outcome;
					while (ready[settled] !== undefined && (stopIndex < 0 || settled <= stopIndex)) {
						var settling = ready[settled];
						delete ready[settled];
						settled++;
						giveRecords(template, settling);
						settleFailed = settling.index;
						options.settle(settling, callerLane);
						settleFailed = -1;
					}
				}
				if (pullFailed) throw pullError;
				completed = true;
				return { lanes: Number(lanes.count()) };
			} catch (error) {
				thrown = error;
				throw error;
			} finally {
				if (!completed) {
					// the tasks after a failed settle are stopped at once (their blocking calls interrupted)
					if (settleFailed >= 0) lanes.stopAfter(settleFailed);
					lanes.cancel("stopped");
				}
				lanes.close();
				// once the lanes are closed: which of the tasks after the failed one had started
				if (thrown !== undefined && settleFailed >= 0) discardedChunks(thrown, lanes, settleFailed);
			}
		}

		function discardedChunks(error, lanes, index) {
			if (typeof lanes.startedAfter !== "function" || !error || typeof error !== "object") return;
			var started = lanes.startedAfter(index), indexes = [];
			for (var i = 0; started && i < started.length; i++) indexes.push(Number(started[i]));
			if (!indexes.length) return;
			try {
				var details = error.details;
				if (details !== undefined && details !== null && (typeof details !== "object" || Array.isArray(details))) return;
				error.details = Object.assign({}, details || {}, { discardedChunks: indexes });
			} catch (frozen) {
				// an error the lane cannot annotate keeps its details
			}
		}

		// What the lanes share with their caller, taken on the calling thread. The lazy values of the caller (its
		// configuration, engine, request directories) are read by shareLazyValues only when lanes are opened, so that no
		// lane ever writes them into the objects of the caller; the calling thread reads them when it needs them.
		function laneTemplate(ctx, options) {
			var scopes = ctx.scopes;
			var parent = options.parent === undefined ? scopes.local : options.parent;
			var shared = [];
			[scopes.request, scopes.input, scopes.result, scopes.current, scopes.props, scopes.local, parent].forEach(function (value) {
				if (value && typeof value === "object" && shared.indexOf(value) < 0) shared.push(value);
			});
			return {
				caller: ctx,
				request: ctx.request,
				definition: ctx.definition,
				blocks: ctx.blocks,
				preparedNodes: ctx.preparedNodes,
				executionChains: ctx.executionChains,
				preparation: ctx.preparation,
				maxGraphBlockDepth: ctx.maxGraphBlockDepth,
				graphBlockStack: Object.freeze((ctx.graphBlockStack || []).slice()),
				scopes: Object.freeze({
					request: scopes.request, input: scopes.input, result: scopes.result,
					current: scopes.current, props: scopes.props, parent: parent
				}),
				// a lane inside a lane also keeps the objects its caller shares
				guard: sharedGuard(shared, scopes.__flowSharedGuard || null),
				// resolved here, on the calling thread: the HTTP calls of the lanes keep the cookies of the call
				invocationContext: invocationContextOf(ctx),
				traceEnabled: ctx.traceEnabled !== false,
				traced: !!scopes.trace && typeof scopes.trace === "object",
				profiled: !!ctx.profile,
				config: undefined,
				engine: undefined
			};
		}

		function shareLazyValues(template) {
			var caller = template.caller, request = template.scopes.request;
			if (request && typeof request === "object") {
				void request.projectDir;
				void request.engineDir;
				void request.engineProjectDir;
			}
			template.config = caller.scopes.config;
			template.engine = caller.engine;
			template.guard.share(template.config);
		}

		// The objects a lane shares with its caller and the other lanes, read-only there: the scope roots of the caller,
		// and every object reachable from them, aliases included (local.o = parent.o, then a write of local.o.k; a row
		// of an array source). The roots are compared at once; an object below them is looked up in the identity set
		// of the shared objects, built once per loop at the first write that needs it, under a lock for the lanes. The
		// shared objects are not written during the loop (the caller only reads the source and settles), so the set
		// stays exact. The roots only change on the calling thread (its configuration, read late), never once lanes run.
		// A Rhino block writing ctx.scopes or an object it read directly is not seen: its author keeps it to local, as
		// the blocks of the core do.
		function sharedGuard(roots, outer) {
			roots = roots.slice();
			var objects = null;
			var locked = function (sharing, value) {
				if (sharing) {
					roots.push(value);
					if (objects !== null) reachable(objects, [value]);
					return true;
				}
				if (objects === null) objects = reachable(new Set(), roots);
				return objects.has(value);
			};
			// the lanes look up under a lock of their own (any object is a Java monitor)
			if (typeof Synchronizer === "function") locked = new Synchronizer(locked, {});
			return Object.freeze({
				share: function (value) {
					if (value !== null && typeof value === "object" && roots.indexOf(value) < 0) locked(true, value);
				},
				// whether a write may not go into container. Past the roots, the scopes the lane writes most are its own:
				// the fresh local and chunk of a slot, the fresh result of a composite block
				refuses: function (container, scopes) {
					if (container === null || typeof container !== "object") return false;
					if (roots.indexOf(container) >= 0) return true;
					if (outer && outer.refuses(container, scopes)) return true;
					if (container === scopes.local || container === scopes.chunk || container === scopes.result) return false;
					return locked(false, container) === true;
				}
			});
		}

		function reachable(seen, roots) {
			var stack = roots.slice();
			while (stack.length) {
				var value = stack.pop();
				if (seen.has(value)) continue;
				seen.add(value);
				// arrays (a row chunk too: its row views are script objects) and plain objects; not the Java objects
				if (Array.isArray(value)) {
					for (var i = 0; i < value.length; i++) {
						var item = value[i];
						if (item !== null && typeof item === "object" && !seen.has(item)) stack.push(item);
					}
				} else if (Object.prototype.toString.call(value) === "[object Object]") {
					var keys = Object.keys(value);
					for (var k = 0; k < keys.length; k++) {
						var entry = value[keys[k]];
						if (entry !== null && typeof entry === "object" && !seen.has(entry)) stack.push(entry);
					}
				}
			}
			return seen;
		}

		// The run context of a lane: the plan and the read-only scopes of the caller; the scopes, handles, block
		// instances, prepared runners and libraries it writes are its own. lanes is null for the calling thread.
		function createLaneContext(template, lanes) {
			var lane = Object.create(laneContextPrototype);
			lane.request = template.request;
			lane.definition = template.definition;
			lane.blocks = template.blocks;
			lane.preparedNodes = template.preparedNodes;
			if (template.executionChains) lane.executionChains = template.executionChains;
			lane.preparation = template.preparation;
			if (template.maxGraphBlockDepth !== undefined) lane.maxGraphBlockDepth = template.maxGraphBlockDepth;
			lane.returned = undefined;
			lane.stopped = false;
			lane.traceEnabled = template.traceEnabled;
			lane.graphBlockStack = template.graphBlockStack.slice();
			var shared = template.scopes;
			var caller = template.caller;
			// outside a task, only the calling thread runs (reduce): it records into the caller directly
			var scopes = {
				request: shared.request, input: shared.input, local: {}, result: shared.result,
				trace: lanes ? null : caller.scopes.trace, current: shared.current, props: shared.props, parent: shared.parent
			};
			Object.defineProperty(scopes, "__flowSharedGuard", { value: template.guard, enumerable: false });
			lane.scopes = scopes;
			if (lanes) {
				scopes.config = template.config;
				if (template.engine !== undefined) lane.engine = template.engine;
			} else {
				// the calling thread reads the configuration and the engine of its caller when a block needs them; a
				// composite block with defaults sets its own configuration
				Object.defineProperty(scopes, "config", { enumerable: true, configurable: true, get: function () {
					var config = caller.scopes.config;
					template.guard.share(config);
					return config;
				}, set: function (value) {
					Object.defineProperty(this, "config", { value: value, writable: true, enumerable: true, configurable: true });
				} });
				Object.defineProperty(lane, "engine", { enumerable: true, configurable: true, get: function () {
					return caller.engine;
				}, set: function (value) {
					Object.defineProperty(this, "engine", { value: value, writable: true, enumerable: true, configurable: true });
				} });
				if (template.profiled) lane.profile = caller.profile;
				// the calling thread keeps the block instances, prepared runners and libraries of its caller: one thread,
				// one of them running at a time, as in sequence (a lane has its own: they are not thread-safe)
				lane.implementationInstances = caller.implementationInstances || (caller.implementationInstances = new Map());
				lane.implementationRunners = caller.implementationRunners || (caller.implementationRunners = new Map());
				lane.dynamicPreparedNodes = caller.dynamicPreparedNodes || (caller.dynamicPreparedNodes = new Map());
				lane.libraries = caller.libraries || (caller.libraries = {});
			}
			Object.defineProperty(lane, "__flowLanes", { value: lanes, enumerable: false });
			Object.defineProperty(lane, "__flowTemplate", { value: template, enumerable: false });
			return lane;
		}

		function laneBody(template, work) {
			return function (lanes) {
				var lane = createLaneContext(template, lanes);
				for (var task = lanes.next(); task !== null && task !== undefined; task = lanes.next()) {
					lanes.complete(runLaneTask(lane, task, work));
				}
			};
		}

		// One task in a lane: its handles are closed at its end, its error is given with its outcome, and what it
		// records for the caller (trace, profile, learned schemas) is kept in the outcome, given before its settle.
		function runLaneTask(lane, task, work) {
			var outcome = { index: task.index, task: task };
			var template = lane.__flowTemplate;
			var records = {};
			var baseTrace = lane.scopes.trace, baseProfile = lane.profile;
			lane.__flowTaskIndex = task.index;
			lane.__flowTaskRecords = records;
			lane.returned = undefined;
			lane.stopped = false;
			if (template.traced) lane.scopes.trace = records.trace = { nodes: [] };
			if (template.profiled) lane.profile = records.profile = { blocks: [], hotPath: {} };
			try {
				outcome.value = work(lane, task);
			} catch (error) {
				outcome.failed = true;
				outcome.error = error;
			} finally {
				try {
					closeRuntimeHandles(lane);
				} catch (closing) {
					if (!outcome.failed) {
						outcome.failed = true;
						outcome.error = closing;
					}
				}
				lane.handles = {};
				lane.scopes.trace = baseTrace;
				lane.profile = baseProfile;
				lane.__flowTaskRecords = null;
				outcome.records = records;
			}
			return outcome;
		}

		// On the calling thread, before the settle of a task: the trace nodes and probes, the profile and the learned
		// output schemas of the task, as they would come in sequence.
		function giveRecords(template, outcome) {
			var records = outcome.records;
			outcome.records = null;
			if (!records) return;
			var caller = template.caller;
			var trace = records.trace, target = caller.scopes.trace;
			if (trace && target && typeof target === "object") {
				Object.keys(trace).forEach(function (key) {
					var entries = trace[key];
					if (!Array.isArray(entries) || !entries.length) return;
					var into = Array.isArray(target[key]) ? target[key] : (target[key] = []);
					for (var i = 0; i < entries.length; i++) into.push(entries[i]);
				});
			}
			var profile = records.profile;
			if (profile && caller.profile) {
				var blocks = caller.profile.blocks || (caller.profile.blocks = []);
				for (var b = 0; b < profile.blocks.length; b++) blocks.push(profile.blocks[b]);
				// the durations of the lanes add up: their sum can pass the time of the loop
				var hotPath = caller.profile.hotPath || (caller.profile.hotPath = {});
				Object.keys(profile.hotPath).forEach(function (name) {
					hotPath[name] = Number(hotPath[name] || 0) + Number(profile.hotPath[name] || 0);
				});
			}
			(records.learned || []).forEach(function (args) {
				caller.learnOutputSchema(args[0], args[1], args[2], args[3]);
			});
		}

		function validateNodeDestinations(block, node, props) {
			destinations.entries(blockCatalog(block), props || nodePropsWithDefaults(node, block), nodeOut(node))
				.forEach(function (entry) {
					var checked = destinations.validate(entry.value);
					if (!checked.valid) raise(checked.code, entry.property + ": " + checked.message, node);
				});
		}

		function prepareNodeRunner(block, node, props) {
			var trustedRuntime = String(block && block.__flowOrigin || "") === "core" ||
				String(block && block.__blockImplementationRuntime || "") === "flow" ||
				env.sharedRuntime && block && block.__graphRhino && block.__graphRhino.script.stateless === true;
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

		// The requestable running this Flow (a Convertigo Sequence): isRunning() is false once
		// the Studio cancels it or its timeout expires (bContinue).
		function hostRequestable() {
			try {
				var convertigoContext = currentConvertigoContext();
				if (convertigoContext && typeof convertigoContext.isRunning === "function") return convertigoContext;
				var requested = convertigoContext && convertigoContext.requestedObject;
				return requested && typeof requested.isRunning === "function" ? requested : null;
			} catch (e) {
				return null;
			}
		}

		// A Flow run from another one stops when its caller is cancelled.
		function childRunRequest(parent, request, options) {
			request = Object.assign({}, options || {}, request);
			Object.defineProperty(request, "__parentRun", { value: parent, enumerable: false });
			return request;
		}

		function ensureCanContinue(ctx, node) {
			if (!ctx.canContinue()) {
				raise("FLOW_CANCELLED", "The Flow execution was cancelled (" + ctx.cancelled + ").", node);
			}
		}

		function prepareNodeExecutor(node, block, name, out, writer, runner) {
			if (!block) {
				return null;
			}
			return function (ctx) {
				if (ctx.stopped || node.disabled) {
					return undefined;
				}
				ensureCanContinue(ctx, node);
				var result = runner ? runner(ctx, node) : block.run(ctx, node);
				ensureCanContinue(ctx, node);
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
				var properties = nodePropsWithDefaults(node, block, blocks);
				validateNodeDestinations(block, node, properties);
				var reusableProps = canReuseNodeProps(block) ? properties : null;
				if (reusableProps && typeof Object.freeze === "function") {
					if (env.sharedRuntime) flowSnapshotService.freeze(reusableProps);
					else Object.freeze(reusableProps);
				}
				var preparedRunner = prepareNodeRunner(block, node, reusableProps);
				var preparedOut = nodeOut(node);
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
				if (preparedNodes && typeof preparedNodes.set === "function") {
					preparedNodes.set(node, preparedNode);
				} else if (index >= 0 && preparedNodes) {
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
				// Immutable (frozen) definitions keep prepared runners beside the plan.
				plan.preparedNodes = plan.machineImage === true ? [] : null;
				plan.inputContract = compileInputContract(plan.definition);
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
			var profiler = ctx.allocationTrace;
			var phase = profiler ? profiler.open("runtime", "node-prepare", "") : null;
			try {
			var prepared = preparedNodeFor(ctx, node);
			if (env.sharedRuntime && !prepared) {
				var local = ctx.dynamicPreparedNodes || (ctx.dynamicPreparedNodes = new Map());
				return local.get(node) || installPreparedNode(node, ctx.blocks, local, null);
			}
			return prepared && prepared.catalog === ctx.blocks
				? prepared
				: installPreparedNode(node, ctx.blocks, ctx.preparedNodes, ctx.preparation);
			} finally { if (phase) phase.close(); }
		}

		function executeAttributedNode(ctx, node) {
			if (ctx.stopped || !node || node.disabled) return undefined;
			var ordinal = ctx.allocationNodeIds.get(node);
			if (ordinal === undefined) { ordinal = ctx.allocationNodeCount++; ctx.allocationNodeIds.set(node, ordinal); }
			var allocation = ctx.allocationTrace.open("node", String(ctx.request.flowQName || ctx.request.flowName || "") + ":" + ordinal + ":" + String(node.id || nodePath(node) || ""), blockName(node));
			try { return executeNode(ctx, node); } finally { if (allocation) allocation.close(); }
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
				var out = preparedHit ? prepared.out : ctx.outputPath(node);
				if (!preparedHit) validateNodeDestinations(block, node);
				profileAdd(ctx, "executeNodePropsMs", propsStarted);
				var runStarted = profiled ? nanoTime() : 0;
				var runAllocated = profiled ? allocatedBytes() : null;
				var result;
				ensureCanContinue(ctx, node);
				try {
					if (preparedHit && prepared.run) {
						profileCount(ctx, "preparedRunnerHits");
						result = prepared.run(ctx, node);
					} else {
						profileCount(ctx, "preparedRunnerMisses");
						result = block.run(ctx, node);
					}
				} finally {
					recordProfile(ctx, "node", name, runStarted, runAllocated);
					profileAdd(ctx, "executeNodeRunMs", runStarted);
				}
				var commitStarted = profiled ? nanoTime() : 0;
				ensureCanContinue(ctx, node);
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

		function callAttributedBlock(ctx, name, props, options) {
			var allocation = ctx.allocationTrace.open("call", String(options && options.id || "call:" + name), String(name));
			try { return callBlock(ctx, name, props, options); } finally { if (allocation) allocation.close(); }
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
			if (options.out !== undefined) node.out = options.out;
			if (!node.id) {
				node.id = "call:" + name;
			}
			profileAdd(ctx, "callBlockNormalizeMs", normalizeStarted);
			var propsStarted = profiled ? nanoTime() : 0;
			var nodeProperties = ctx.props(node);
			validateNodeDestinations(block, node, nodeProperties);
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
			var callAllocated = profiled ? allocatedBytes() : null;
			try {
				var runStarted = profiled ? nanoTime() : 0;
				var result;
				ensureCanContinue(ctx, node);
				try {
					result = block.run(ctx, node);
				} finally {
					profileAdd(ctx, "callBlockRunMs", runStarted);
				}
				var commitStarted = profiled ? nanoTime() : 0;
				ensureCanContinue(ctx, node);
				if (ctx.returned !== undefined) {
					result = ctx.returned;
				}
				var outputPath = ctx.outputPath(node);
				if (outputPath && result !== undefined) {
					ctx.write(outputPath, result);
				}
				if (options.trace !== false) {
					ctx.trace(node, name, result);
				}
				profileAdd(ctx, "callBlockCommitMs", commitStarted);
				return result;
			} finally {
				recordProfile(ctx, "call", name, started, callAllocated);
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
			var chain = !ctx.profile && !ctx.allocationTrace && ctx.executionChains && ctx.executionChains.get(nodes);
			if (chain) {
				for (var step = 0; step < chain.length && !ctx.stopped; step++) result = chain[step](ctx);
				return result;
			}
			for (var i = 0; i < nodes.length; i++) {
				if (ctx.stopped) {
					break;
				}
				var node = nodes[i];
				result = ctx.allocationTrace ? executeAttributedNode(ctx, node) : executeNode(ctx, node);
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

		function appendSchemaUpdate(ctx, update) {
			var updates = ctx.schemaUpdates || (ctx.schemaUpdates = []);
			updates.push(update);
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

		function addSnapshotDuration(name, started) {
			flowSnapshotStats[name] = Number(flowSnapshotStats[name] || 0) + profileDuration(started);
		}

		function compileFlowSnapshot(request, blocks, identity, compilerFingerprint) {
			var revision = blocks && blocks.__flowCatalogFingerprint;
			if (!identity || !revision || typeof env.sharedMetadataSnapshot !== "function") {
				return buildFlowSnapshot(request, blocks, identity, compilerFingerprint);
			}
			var snapshot = env.sharedMetadataSnapshot("execution-snapshot\n" + String(projectDir() || "") + "\n"
				+ String(request.flowQName || request.name || request.flowName || "Flow"),
				identity + "\n" + compilerFingerprint + "\n" + revision, function () {
					return buildFlowSnapshot(request, blocks, identity, compilerFingerprint);
				});
			return flowSnapshotService.freeze(snapshot);
		}

		function buildFlowSnapshot(request, blocks, identity, compilerFingerprint) {
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

		function compileFlowPlan(request, blocks) {
			var profiler = (env.allocationTrace && env.allocationTrace());
			var phase = profiler ? profiler.open("runtime", "plan-compile", "") : null;
			try {
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
			var plan = hydrateFlowSnapshot(compileFlowSnapshot(request, blocks, identity, compilerFingerprint), blocks);
			plan = prepareExecutionPlan(plan);
			if (cacheKey && writeRuntimeBoundedCache) {
				return writeRuntimeBoundedCache(flowPlanCache, cacheKey, compilerFingerprint, plan, "compiled Flow plans");
			}
			return plan;
			} finally { if (phase) phase.close(); }
		}

		function resolveRunPlan(request, blocks) {
			if (env.sharedRuntime) {
				var identity = flowPlanIdentity(request);
				// Requests resolved by name or authoring helpers may supply another catalog.
				// Never alias these requests under an empty source identity.
				if (!identity || blocks) {
					var uncached = resolveRunPlanUnshared(request, blocks);
					if (!Object.isFrozen(uncached.plan)) preparePublishedPlan(uncached.plan);
					return uncached;
				}
				return env.sharedRuntime.prepare("plan:" + String(projectDir() || "") + ":" + String(request.flowQName || request.name || request.flowName || "") + "\n" + identity, function () {
					var resolved = resolveRunPlanUnshared(request, blocks);
					preparePublishedPlan(resolved.plan);
					// Cold construction is attributed by the allocation profiler. Stored
					// plans must not report the first caller's timings on every hot call.
					resolved.headHit = true; resolved.loadBlocksMs = 0; resolved.compilePlanMs = 0;
					return Object.freeze(resolved);
				});
			}
			return resolveRunPlanUnshared(request, blocks);
		}

		function preparePublishedPlan(plan) {
			if (Object.isFrozen(plan)) return plan;
			plan.preparedNodes = new Map();
			plan.executionChains = new Map();
			plan.inputContract = compileInputContract(plan.definition);
			plan.preparation = { mode: "eager", preparedNodes: 0, preparedRunners: 0, preparedWriters: 0, materializedBlocks: 0 };
			var seen = new Set();
			function visit(value) {
				if (!value || typeof value !== "object" || seen.has(value)) return;
				seen.add(value);
				if (Array.isArray(value)) {
					value.forEach(visit);
					var chain = value.map(function (node) { var entry = plan.preparedNodes.get(node); return entry && entry.execute; });
					if (chain.every(function (run) { return typeof run === "function"; })) plan.executionChains.set(value, Object.freeze(chain));
					Object.freeze(value); return;
				}
				if (blockName(value)) {
					var prepared = installPreparedNode(value, plan.blocks, plan.preparedNodes, plan.preparation);
					if (prepared) {
						if (prepared.block.__graphDefinition) visit(prepared.block.__graphDefinition.nodes);
						Object.freeze(prepared);
					}
				}
				Object.keys(value).forEach(function (key) { if (key !== "props") visit(value[key]); });
				Object.freeze(value);
			}
			visit(plan.definition.nodes);
			flowSnapshotService.freeze(plan.definition);
			Object.keys(plan.blocks).forEach(function (name) { Object.freeze(plan.blocks[name]); });
			Object.freeze(plan.blocks);
			Object.freeze(plan.preparation);
			var prepared = plan.preparedNodes, chains = plan.executionChains;
			plan.preparedNodes = Object.freeze({ get: function (node) { return prepared.get(node); } });
			plan.executionChains = Object.freeze({ get: function (nodes) { return chains.get(nodes); } });
			return Object.freeze(plan);
		}

		function resolveRunPlanUnshared(request, blocks) {
			var profiler = (env.allocationTrace && env.allocationTrace());
			var phase = profiler ? profiler.open("runtime", "plan-resolve", "") : null;
			try {
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
			var metadata = profiler ? profiler.open("runtime", "metadata", "") : null;
			try { blocks = blocks || loadBlocks(true); } finally { if (metadata) metadata.close(); }
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
			} finally { if (phase) phase.close(); }
		}

		function runFlowRequest(request, blocks) {
			var measure = profileEnabled(request);
			var deepProfile = request.profile === true;
			var runStarted = measure ? nanoTime() : 0;
			var resolveStarted = measure ? nanoTime() : 0;
			var resolved = !blocks && request.__resolvedPlan && request.__resolvedPlan.plan ? request.__resolvedPlan : resolveRunPlan(request, blocks);
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
					appendSchemaUpdate(ctx, {
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
				// A Flow replacing a sequence keeps the XML its XPath consumers read: _flow.xml.arrayItem names
				// the elements of arrays in the XML response (Convertigo writes "item" by default).
				var xmlMeta = definition && (definition.flow || definition._flow) || {};
				if (xmlMeta.xml && typeof xmlMeta.xml.arrayItem === "string" && /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(xmlMeta.xml.arrayItem)) {
					out.xml = { arrayItem: xmlMeta.xml.arrayItem };
				}
				if (ctx.schemaUpdates && ctx.schemaUpdates.length > 0) {
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

		// The declared inputs of a Flow receive their values converted to their types (type-conversion.js), whatever the
		// caller (HTTP text, the MCP, a Flow call), so that === compares the same values. An absent input takes its
		// default (its ${symbols} compiled); for an input that is not a text, "" (an empty form field) and the text "null"
		// (a null sent as a form parameter) are absent and null; null is kept with nullable: true, else it is absent; a
		// required input must be given; a value that does not convert is a 400 error.
		function compileInputContract(definition) {
			var meta = definition && (definition.flow || definition._flow) || {};
			var declared = meta.inputs || meta.input || definition && (definition.inputs || definition.input);
			return Object.freeze(Object.keys(declared || {}).map(function (name) {
				var declaration = declared[name] && typeof declared[name] === "object" ? declared[name] : {};
				var types = env.typeConversion.types(declaration);
				var conversion = env.typeConversion;
				return Object.freeze({ name: name, declaration: declaration, types: Object.freeze(types),
					textual: !types.length || types.indexOf("string") !== -1 || types.indexOf("any") !== -1 || types.indexOf("unknown") !== -1,
					// prepared once with the plan: the conversions of this declaration
					convert: typeof conversion.compile === "function" ? conversion.compile(declaration) : null,
					convertReference: typeof conversion.compileReference === "function" ? conversion.compileReference(declaration) : null });
			}));
		}

		function typedInputs(input, definition, contract, byReference) {
			var profiler = env.allocationTrace && env.allocationTrace();
			var phase = profiler ? profiler.open("runtime", "input-contract", "") : null;
			try {
			var meta = definition && (definition.flow || definition._flow) || {};
			var declared = meta.inputs || meta.input || definition && (definition.inputs || definition.input);
			if (!declared || typeof declared !== "object" || !input || typeof input !== "object") {
				return input;
			}
			var conversion = env.typeConversion;
			(contract || compileInputContract(definition)).forEach(function (entry) {
				var name = entry.name, declaration = entry.declaration, declaredTypes = entry.types;
				var value = input[name];
				var textual = entry.textual;
				if (!textual && value === "") {
					value = undefined;
				}
				if (!textual && value === "null") {
					value = null;
				}
				if (value === null && declaration.nullable !== true) {
					value = undefined;
				}
				if (value === undefined) {
					if (declaration["default"] === undefined) {
						if (declaration.required === true) {
							inputError("FLOW_INPUT_REQUIRED", name, "Input " + name + " is required.", "");
						}
						delete input[name];
						return;
					}
					value = defaultValue(declaration["default"]);
				}
				if (value === null) {
					input[name] = null;
					return;
				}
				var converted = byReference && conversion.convertReference
					? (entry.convertReference ? entry.convertReference(value) : conversion.convertReference(value, declaration))
					: (entry.convert ? entry.convert(value) : conversion.convert(value, declaration));
				if (!converted.ok) {
					inputError("FLOW_INPUT_TYPE_INVALID", name, "Input " + name + ": " + converted.message,
						"Send a value of type " + declaredTypes.join(" or ") + ".");
				}
				input[name] = converted.value;
			});
			return input;
			} finally { if (phase) phase.close(); }
		}

		function defaultValue(value) {
			value = normalizeTree(value);
			if (typeof value === "string" && value.indexOf("${") !== -1 && typeof env.compileSymbols === "function") {
				return env.compileSymbols(value);
			}
			return value;
		}

		function inputError(code, name, message, hint) {
			return throwFlowError({ code: code, message: message, hint: hint, status: 400, details: { input: name } });
		}

		function createRunContext(request, definition, blocks, projectEngine, plan, frameProfile, requestProfile) {
			var profiler = (env.allocationTrace && env.allocationTrace());
			var phase = profiler ? profiler.open("runtime", "context-create", "") : null;
			try {
			var totalStarted = frameProfile ? nanoTime() : 0;
			var captureStarted = frameProfile ? nanoTime() : 0;
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
				projectEngineSource: projectEngine
			};
			if (requestProfile) {
				frameState.profile = requestProfile;
			}
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
				input: typedInputs(frameScopeValue(request, "input"), definition, plan && plan.inputContract, request.__directInvocation === true),
				local: {},
				result: {},
				trace: request.includeTrace === false ? null : { nodes: [] },
				current: null,
				props: {}
			};
			Object.defineProperty(scopes, "config", scopesConfigDescriptor);
			if (frameProfile) {
				frameProfile.scopesMs = profileDuration(scopesStarted);
			}
			var frameStarted = frameProfile ? nanoTime() : 0;
			var ctx = Object.create(runContextPrototype);
			ctx.request = request;
			var allocationTrace = env.allocationTrace && env.allocationTrace();
			if (allocationTrace) { ctx.allocationTrace = allocationTrace; ctx.allocationNodeIds = new WeakMap(); ctx.allocationNodeCount = 0; }
			ctx.definition = definition;
			ctx.blocks = blocks;
			ctx.preparedNodes = plan && plan.preparedNodes || null;
			if (plan && plan.executionChains) ctx.executionChains = plan.executionChains;
			ctx.preparation = plan && plan.preparation || null;
			ctx.returned = undefined;
			ctx.stopped = false;
			if (request.__parentRun) {
				// Only a called Flow carries its caller: a top-level frame keeps its slot budget.
				ctx.parentRun = request.__parentRun;
			}
			ctx.traceEnabled = request.includeTrace !== false;
			ctx.scopes = scopes;
			if (request.maxGraphBlockDepth !== undefined && request.maxGraphBlockDepth !== null) {
				ctx.maxGraphBlockDepth = intOption(request.maxGraphBlockDepth, 128, 1, 1000);
			}
			if (frameProfile) {
				frameProfile.frameObjectMs = profileDuration(frameStarted);
			}
			var capabilitiesStarted = frameProfile ? nanoTime() : 0;
			if (frameProfile) {
				frameProfile.lazyCapabilitiesMs = profileDuration(capabilitiesStarted);
				frameProfile.totalMs = profileDuration(totalStarted);
			}
			return ctx;
			} finally { if (phase) phase.close(); }
		}

		function installColdContextMethods() {
			var ctx = this;
			var request = ctx.request;
			var definition = ctx.definition;
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
					return withActiveRequest(args, function () {
						return authoringTreeRequest(args, loadBlocks());
					});
				});
			};
			ctx.authoringContractSource = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return withActiveRequest(args, function () {
						return authoringContractRequest(args, loadBlocks());
					});
				});
			};
			ctx.authoringPaletteSource = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return withActiveRequest(args, function () {
						return authoringPaletteRequest(args, loadBlocks());
					});
				});
			};
			ctx.authoringMutateSource = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return withActiveRequest(args, function () {
						return authoringMutateRequest(args, loadBlocks());
					});
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
					appendSchemaUpdate(ctx, {
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
					return runFlowRequest(childRunRequest(ctx, {
						project: options.project || currentProjectName(ctx.request),
						flowSource: source,
						config: config || {},
						input: options.input || {},
						context: mergedContext(ctx.scopes.request, options.context || {}),
						includeFlow: options.includeFlow === true || options.includeLocal === true,
						includeTrace: options.includeTrace === true
					}, options), loadBlocks());
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
					return runFlowRequest(childRunRequest(ctx, {
						project: options.project || currentProjectName(ctx.request),
						flowSource: source,
						config: config || {},
						input: options.input || {},
						context: mergedContext(ctx.scopes.request, options.context || {}),
						includeFlow: options.includeFlow === true || options.includeLocal === true,
						includeTrace: options.includeTrace === true
					}, options), loadBlocks());
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
					return runFlowRequest(childRunRequest(ctx, {
						project: args.project || currentProjectName(ctx.request),
						flowSource: source,
						config: args.config || {},
						input: args.input || {},
						context: mergedContext(ctx.scopes.request, args.context || {}),
						includeFlow: args.includeFlow === true || args.includeLocal === true,
						includeTrace: args.includeTrace === true
					}, args), loadBlocks());
				});
			};
			// A request prepared for a target project (an MCP tool) carries that project's working copies and tags:
			// its sources, not those of the Flow running the tool, back what the operation reads meanwhile (engine.yaml,
			// Flow and block sources), as for the authoring operations. Plain arguments keep the current request.
			function withPreparedRequest(args, callback) {
				return args.frontendSourceDrafts !== undefined || args.sourceDrafts !== undefined || args.sourceRemovals !== undefined
					? withActiveRequest(args, callback) : callback();
			}
			ctx.flowSourceGet = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return withPreparedRequest(args, function () {
						return flowScriptGetRequest(loadBlocks(), args);
					});
				});
			};
			ctx.flowSourceValidate = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return withPreparedRequest(args, function () {
						return flowScriptValidateRequest(loadBlocks(), args);
					});
				});
			};
			ctx.flowSourcePatch = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return withPreparedRequest(args, function () {
						return flowScriptPatchRequest(loadBlocks(), args);
					});
				});
			};
			ctx.flowCodeGet = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return withPreparedRequest(args, function () {
						return flowCode.get(loadBlocks(), args);
					});
				});
			};
			ctx.flowCodeStatus = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return withPreparedRequest(args, function () {
						return flowCode.status(loadBlocks(), args);
					});
				});
			};
			ctx.flowCodeDiscard = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return withPreparedRequest(args, function () {
						return flowCode.discard(loadBlocks(), args);
					});
				});
			};
			ctx.flowCodeSet = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return withPreparedRequest(args, function () {
						return flowCode.set(loadBlocks(), args);
					});
				});
			};
			ctx.flowCodePatch = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return withPreparedRequest(args, function () {
						return flowCode.patch(loadBlocks(), args);
					});
				});
			};
			ctx.flowCodeCheck = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return withPreparedRequest(args, function () {
						return flowCode.check(loadBlocks(), args);
					});
				});
			};
			ctx.flowCodeRg = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return withPreparedRequest(args, function () {
						return flowCode.rg(loadBlocks(), args);
					});
				});
			};
			ctx.flowCodeRun = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return withPreparedRequest(args, function () {
						return flowCode.run(loadBlocks(), args);
					});
				});
			};
			ctx.flowCodeAnalyze = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return withPreparedRequest(args, function () {
						return flowCode.analyze(loadBlocks(), args);
					});
				});
			};
			ctx.flowCodePromote = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return withPreparedRequest(args, function () {
						return flowCode.promote(loadBlocks(), args);
					});
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

		if (env.sharedRuntime) Object.freeze(runContextPrototype);
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
		if (env.sharedRuntime) return env.sharedRuntime.prepare("env:execution-service", function () { return Object.freeze(create(env)); });
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
		resolveRunPlan: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return serviceFor(env).resolveRunPlan.apply(null, args);
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
