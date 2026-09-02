(function () {
	var globalScope = this;
	var File = Packages.java.io.File;
	var Arrays = Packages.java.util.Arrays;
	var JavaBoolean = Packages.java.lang.Boolean;
	var JavaNumber = Packages.java.lang.Number;
	var JavaString = Packages.java.lang.String;
	var NativeJavaObject = Packages.org.mozilla.javascript.NativeJavaObject;
	var ObjectMapper = Packages.com.fasterxml.jackson.databind.ObjectMapper;
	var YAMLFactory = Packages.com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
	var FileUtils = Packages.org.apache.commons.io.FileUtils;
	var Base64 = Packages.java.util.Base64;
	var JavaSystem = Packages.java.lang.System;
	var ConcurrentHashMap = Packages.java.util.concurrent.ConcurrentHashMap;
	var ReentrantLock = Packages.java.util.concurrent.locks.ReentrantLock;
	var FlowEngineBridge = Packages.com.twinsoft.convertigo.engine.flow.FlowEngineBridge;

	var yamlMapper = new ObjectMapper(new YAMLFactory());
	var jsonMapper = new ObjectMapper();
	var scopeNames = ["request", "input", "config", "local", "result", "trace", "current"];
	var projectDirOverride = null;
	var activeRequestFallback = null;
	var compiledScriptCache = {};
	var compiledScriptCacheSizeValue = 0;
	var compiledScriptCacheClock = 0;
	var compiledScriptCacheLimit = 1024;
	var compiledScriptStats = {
		hits: 0,
		misses: 0,
		evictions: 0,
		sharedHits: 0,
		sharedFallbacks: 0
	};
	var cacheUtilsModule = null;
	var fingerprintUtilsModule = null;
	var flowNodeUtilsModule = null;
	var expressionUtilsModule = null;
	var runtimeHandleUtilsModule = null;
	var iconServiceModule = null;
	var flowRuntimeServiceModule = null;
	var runPlanHeadServiceModule = null;
	var frontendProviderServiceModule = null;
	var flowRuntimeServiceEnvInstance = null;
	var runPlanHeadEnvInstance = null;
	var graphBlockRuntimeEnvInstance = null;
	// Only modules with immutable top-level closures are eligible for the JVM-wide machine image.
	// flow-code-service.js keeps in-memory drafts and flow-runtime-service.js caches its active env/service,
	// so both deliberately remain local to an Engine runtime.
	var sharedEngineModuleNames = "|block-authoring-service.js|block-code-compiler-service.js|block-code-source-service.js|block-file-loader-service.js|block-policy-service.js|block-source-service.js|cache-utils.js|catalog-loader-service.js|catalog-service.js|expression-utils.js|fingerprint-utils.js|flow-analysis-service.js|flow-execution-snapshot-service.js|flow-library-service.js|flow-node-utils.js|flow-repository-service.js|flow-script-parser-service.js|flow-script-renderer-service.js|flow-script-validation-service.js|flow-source-service.js|flow-storage-service.js|flow-summary-service.js|flow-tree-service.js|flowscript-intent-utils.js|frontend-catalog-service.js|frontend-dev-lifecycle.js|frontend-dev-proxy.js|frontend-production-lifecycle.js|frontend-provider-service.js|graph-block-descriptor-service.js|graph-block-runtime-service.js|icon-service.js|naming-utils.js|patch-utils.js|project-config-service.js|property-editor-builder.js|requestable-service.js|resource-service.js|resource-utils.js|response-budget-service.js|run-plan-head-service.js|runtime-cache-service.js|runtime-handle-utils.js|schema-store-service.js|schema-utils.js|scope-path-utils.js|scope-reference-utils.js|type-descriptor-service.js|";
	var frontendBuilderDependencyLock = new Packages.java.util.concurrent.locks.ReentrantLock();
	var frontendDocumentServerStartLock = new Packages.java.util.concurrent.locks.ReentrantLock();
	var frontendProductionBuildLock = new Packages.java.util.concurrent.locks.ReentrantLock();
	// Catalog construction is single-flight only on a cold generation. Hot reads never take these locks.
	var blockCatalogBuildLocks = new ConcurrentHashMap();
	var runtimeState = {
		id: String(new Date().getTime()) + "-" + Math.floor(Math.random() * 1000000),
		startedAt: new Date().toISOString(),
		frontendDevServers: {},
		frontendProductionBuilds: {},
		frontendDocumentServers: {},
		frontendDocumentServerStats: {
			starts: 0,
			reuses: 0,
			fallbacks: 0,
			errors: 0,
			lastError: ""
		},
		frontendProviders: {
			cache: {},
			rejected: {},
			stats: {}
		},
		blockArtifactCompilerFingerprint: null,
		flowPlanCompilerFingerprint: null,
		flowSnapshotStats: {
			compiles: 0,
			hydrations: 0,
			sourceMs: 0,
			parseMs: 0,
			createMs: 0,
			hydrateMs: 0,
			payloadBytes: 0,
			maxPayloadBytes: 0,
			sharedHits: 0,
			sharedMisses: 0,
			sharedWrites: 0,
			sharedErrors: 0,
			sharedSkips: 0,
			sharedDeserializeMs: 0
		},
		persistentFrontendDocuments: {
			hits: 0,
			misses: 0,
			writes: 0,
			errors: 0,
			pruned: false
		},
		frontendDependencyFingerprints: {},
		caches: {
			blocks: createRuntimeMapCacheState(),
			coreBlocks: createRuntimeMapCacheState(),
			blockArtifacts: createRuntimeMapCacheState(),
			blockCatalogHeads: createRuntimeMapCacheState(),
			types: createRuntimeMapCacheState(),
			flowPlans: createRuntimeBoundedMapCacheState(256),
			runPlanHeads: createRuntimeBoundedMapCacheState(256),
			configDefinitions: createRuntimeMapCacheState(),
			libraries: createRuntimeMapCacheState(),
			engineModules: createRuntimeMapCacheState(),
			propertyEditor: createRuntimeCacheState(),
			treeSnapshots: createRuntimeBoundedMapCacheState(8),
			frontendDocuments: createRuntimeBoundedMapCacheState(128),
			expressionTokens: createRuntimeBoundedMapCacheState(4096),
			expressionPrograms: createRuntimeBoundedMapCacheState(4096)
		}
	};

	function engineDir() {
		if (typeof __flowEngineDir !== "undefined" && String(__flowEngineDir).trim() !== "") {
			return new File(String(__flowEngineDir));
		}
		return new File("libs/flow").getAbsoluteFile();
	}

	function projectDir() {
		try {
			var invocationProjectDir = String(FlowEngineBridge.currentFlowProjectDir() || "");
			if (invocationProjectDir.trim() !== "") {
				return new File(invocationProjectDir);
			}
		} catch (e) {
			// Older bridges do not expose per-invocation Flow frames.
		}
		if (projectDirOverride) {
			return new File(String(projectDirOverride));
		}
		if (typeof __flowProjectDir !== "undefined" && String(__flowProjectDir).trim() !== "") {
			return new File(String(__flowProjectDir));
		}
		return null;
	}

	function withProjectDir(dir, callback) {
		var invocationFrame = false;
		var invocationPrevious = null;
		try {
			if (Number(FlowEngineBridge.currentFlowInvocationDepth()) > 0) {
				invocationPrevious = FlowEngineBridge.setCurrentFlowProjectDir(
					dir === undefined || dir === null ? "" : String(dir));
				invocationFrame = true;
			}
		} catch (e) {
			// Older bridges keep the project override in this Engine closure.
		}
		if (invocationFrame) {
			try {
				return callback();
			} finally {
				FlowEngineBridge.restoreCurrentFlowProjectDir(invocationPrevious);
			}
		}
		var previous = projectDirOverride;
		if (dir !== undefined && dir !== null && String(dir).trim() !== "") {
			projectDirOverride = String(dir);
		}
		try {
			return callback();
		} finally {
			projectDirOverride = previous;
		}
	}

	function currentActiveRequest() {
		try {
			if (Number(FlowEngineBridge.currentFlowInvocationDepth()) > 0) {
				var invocationRequest = FlowEngineBridge.currentFlowRequestState();
				if (invocationRequest !== null && invocationRequest !== undefined) {
					return invocationRequest;
				}
			}
		} catch (e) {
			// Older bridges keep the active request in this Engine closure.
		}
		return activeRequestFallback;
	}

	function withActiveRequest(request, callback) {
		var invocationFrame = false;
		var invocationPrevious = null;
		try {
			if (Number(FlowEngineBridge.currentFlowInvocationDepth()) > 0) {
				invocationPrevious = FlowEngineBridge.setCurrentFlowRequestState(request);
				invocationFrame = true;
			}
		} catch (e) {
			// Older bridges keep the active request in this Engine closure.
		}
		if (invocationFrame) {
			try {
				return callback();
			} finally {
				FlowEngineBridge.restoreCurrentFlowRequestState(invocationPrevious);
			}
		}
		var previous = activeRequestFallback;
		activeRequestFallback = request;
		try {
			return callback();
		} finally {
			activeRequestFallback = previous;
		}
	}

	function projectBlocksDir() {
		var dir = projectDir();
		return dir ? new File(dir, "libs/flow/blocks") : null;
	}

	function projectTypesDir() {
		var dir = projectDir();
		return dir ? new File(dir, "libs/flow/types") : null;
	}

	function projectFlowsDir() {
		var dir = projectDir();
		return dir ? new File(dir, "libs/flows") : null;
	}

	function projectFragmentsDir() {
		var dir = projectDir();
		return dir ? new File(dir, "libs/flow/fragments") : null;
	}

	function projectLibDir() {
		var dir = projectDir();
		return dir ? new File(dir, "libs/flow/lib") : null;
	}

	function engineLibDir() {
		return new File(engineDir(), "lib");
	}

	function projectSchemasDir() {
		var dir = projectDir();
		return dir ? new File(dir, "libs/flow/schemas") : null;
	}

	function parseRequest(requestJson) {
		return JSON.parse(String(requestJson || "{}"));
	}

	function compiledScriptCacheSize() {
		return compiledScriptCacheSizeValue;
	}

	function compiledScriptCacheInfo() {
		return {
			name: "compiledScripts",
			size: compiledScriptCacheSize(),
			limit: compiledScriptCacheLimit,
			hits: compiledScriptStats.hits,
			misses: compiledScriptStats.misses,
			evictions: compiledScriptStats.evictions,
			sharedHits: compiledScriptStats.sharedHits,
			sharedFallbacks: compiledScriptStats.sharedFallbacks
		};
	}

	function clearCompiledScriptCache() {
		compiledScriptCache = {};
		compiledScriptCacheSizeValue = 0;
		compiledScriptCacheClock = 0;
		compiledScriptStats.evictions++;
	}

	function evictOldestCompiledScript() {
		var oldestKey = null;
		var oldestUsedAt = Number.MAX_VALUE;
		Object.keys(compiledScriptCache).forEach(function (key) {
			var usedAt = Number(compiledScriptCache[key].usedAt || 0);
			if (oldestKey === null || usedAt < oldestUsedAt) {
				oldestKey = key;
				oldestUsedAt = usedAt;
			}
		});
		if (oldestKey !== null) {
			delete compiledScriptCache[oldestKey];
			compiledScriptCacheSizeValue = Math.max(0, compiledScriptCacheSizeValue - 1);
			compiledScriptStats.evictions++;
			return true;
		}
		return false;
	}

	function compiledScriptKey(source, sourceName, fingerprint) {
		sourceName = String(sourceName || "flow-script");
		fingerprint = fingerprint === undefined || fingerprint === null || String(fingerprint) === ""
			? sha256Hex(source)
			: String(fingerprint);
		return sourceName + "\n" + fingerprint;
	}

	function compileScript(source, sourceName, fingerprint) {
		source = String(source || "");
		var cx = Packages.org.mozilla.javascript.Context.getCurrentContext();
		if (!cx || typeof cx.compileString !== "function") {
			return null;
		}
		var key = compiledScriptKey(source, sourceName, fingerprint);
		var cached = compiledScriptCache[key];
		if (cached) {
			compiledScriptStats.hits++;
			cached.usedAt = ++compiledScriptCacheClock;
			return cached.script;
		}
		compiledScriptStats.misses++;
		while (compiledScriptCacheSizeValue >= compiledScriptCacheLimit) {
			if (!evictOldestCompiledScript()) {
				break;
			}
		}
		try {
			cached = Packages.com.twinsoft.convertigo.engine.flow.FlowEngineBridge.compileFlowScript(
				String(source), String(sourceName || "flow-script"), String(fingerprint || ""));
			compiledScriptStats.sharedHits++;
		} catch (e) {
			compiledScriptStats.sharedFallbacks++;
			cached = cx.compileString(source, String(sourceName || "flow-script"), 1, null);
		}
		compiledScriptCache[key] = {
			script: cached,
			usedAt: ++compiledScriptCacheClock
		};
		compiledScriptCacheSizeValue++;
		return cached;
	}

	function compiledScriptScope(cx) {
		var scope = cx.newObject(globalScope);
		if (typeof flowSummary !== "undefined") {
			scope.flowSummary = flowSummary;
		}
		return scope;
	}

	function evalCompiledSource(source, sourceName, fingerprint) {
		source = String(source || "");
		var cx = Packages.org.mozilla.javascript.Context.getCurrentContext();
		var script = compileScript(source, sourceName, fingerprint);
		if (!cx || !script) {
			return eval(source);
		}
		return script.exec(cx, compiledScriptScope(cx));
	}

	function sharedEngineModule(name, source, sourceName, fingerprint) {
		if (sharedEngineModuleNames.indexOf("|" + String(name || "") + "|") === -1) {
			return null;
		}
		try {
			return Packages.com.twinsoft.convertigo.engine.flow.FlowEngineBridge.sharedFlowModule(
				String(source || ""), String(sourceName || "flow-module"), String(fingerprint || ""));
		} catch (e) {
			// A previous bridge or a rejected module must retain the proven runtime-local path.
			return null;
		}
	}

	function parseYamlSource(source, fallback) {
		source = String(source || "");
		if (source.trim() === "") {
			source = fallback;
		}
		var root = yamlMapper.readTree(source);
		return JSON.parse(String(jsonMapper.writeValueAsString(root)));
	}

	function parseSource(flowSource) {
		var source = String(flowSource || "");
		if (source.trim() === "") {
			source = "version: 1\nnodes: []\n";
		}
		return canonicalFlowDefinition(parseYamlSource(source, "version: 1\nnodes: []\n"));
	}

	function response(value, rejectRuntimeHandlesAt, functionProfile) {
		var sanitizeStarted = functionProfile ? JavaSystem.nanoTime() : 0;
		var payload = value || {};
		var internalProfile = functionProfile && payload.profile ? payload.profile : null;
		if (internalProfile) {
			delete payload.profile;
		}
		payload = rejectRuntimeHandlesAt
			? sanitizeSerializableRuntimeValue(payload, rejectRuntimeHandlesAt)
			: sanitizeRuntimeValue(payload);
		if (internalProfile) {
			functionProfile.responseSanitizeMs = Number(JavaSystem.nanoTime() - sanitizeStarted) / 1000000;
			var stringifyMarkerName = "__flowProfileStringifyPlaceholder_4072209";
			var stringifyMarkerValue = "pending";
			functionProfile[stringifyMarkerName] = stringifyMarkerValue;
			internalProfile.functionCall = functionProfile;
			payload.profile = internalProfile;
			var stringifyStarted = JavaSystem.nanoTime();
			var encoded = JSON.stringify(payload);
			var stringifyMs = Number(JavaSystem.nanoTime() - stringifyStarted) / 1000000;
			return encoded.replace('"' + stringifyMarkerName + '":"' + stringifyMarkerValue + '"',
				'"responseStringifyMs":' + String(stringifyMs));
		}
		return JSON.stringify(payload);
	}

	function failure(operation, error) {
		var out = {
			ok: false,
			error: {
				code: String(error.code || "FLOW_ENGINE_ERROR"),
				operation: operation,
				path: String(error.path || ""),
				message: String(error.message || error),
				hint: error.hint ? String(error.hint) : ""
			}
		};
		if (error.status !== undefined && error.status !== null && error.status !== "") {
			out.error.status = Number(error.status);
		}
		if (error.details !== undefined && error.details !== null) {
			out.error.details = normalizeTree(error.details);
		}
		return out;
	}

	function raise(code, message, node, hint) {
		var error = new Error(message);
		error.code = code;
		error.path = node ? nodePath(node) : "";
		error.hint = hint || "";
		throw error;
	}

	function throwFlowError(options, node) {
		options = options || {};
		var error = new Error(String(options.message || "Flow error"));
		error.code = String(options.code || "FLOW_THROW");
		error.path = node ? nodePath(node) : "";
		error.hint = options.hint ? String(options.hint) : "";
		error.status = options.status;
		error.details = options.details;
		throw error;
	}

	function nodePath(node) {
		return flowNodeUtils().nodePath(node);
	}

	function nodeProps(node) {
		return flowNodeUtils().nodeProps(node);
	}

	function isFlowNodeLike(value) {
		return flowNodeUtils().isFlowNodeLike(value);
	}

	function canonicalFlowNode(node) {
		return flowNodeUtils().canonicalFlowNode(node, flowNodeEnv());
	}

	function canonicalFlowDefinition(definition) {
		return flowNodeUtils().canonicalFlowDefinition(definition, flowNodeEnv());
	}

	function flowNodeUtils() {
		if (flowNodeUtilsModule) {
			return flowNodeUtilsModule;
		}
		flowNodeUtilsModule = loadEngineModule("flow-node-utils.js");
		return flowNodeUtilsModule;
	}

	function flowNodeEnv() {
		return {
			normalizeTree: normalizeTree
		};
	}

	function scopePathUtils() {
		return loadEngineModule("scope-path-utils.js");
	}

	function scopePathEnv() {
		return {
			scopeNames: scopeNames,
			raise: raise,
			assertNoRuntimeHandle: assertNoRuntimeHandle
		};
	}

	function isScopePath(value) {
		return scopePathUtils().isScopePath(value, scopePathEnv());
	}

	function readObjectPath(root, path) {
		return scopePathUtils().readObjectPath(root, path);
	}

	function objectPathParts(path) {
		return scopePathUtils().objectPathParts(path);
	}

	function readScopePath(scopes, path) {
		return scopePathUtils().readScopePath(scopes, path, scopePathEnv());
	}

	function jsValue(value) {
		return runtimeHandleUtils().jsValue(value, runtimeHandleEnv());
	}

	function isRuntimeHandle(value) {
		return runtimeHandleUtils().isHandle(value);
	}

	function runtimeHandleType(value) {
		return runtimeHandleUtils().type(value);
	}

	function runtimeHandleSummary(value) {
		return runtimeHandleUtils().summary(value);
	}

	function sanitizeRuntimeValue(value, seen) {
		return runtimeHandleUtils().sanitize(value, runtimeHandleEnv(), seen);
	}

	function sanitizeSerializableRuntimeValue(value, where, seen) {
		return runtimeHandleUtils().sanitizeSerializable(value, where, runtimeHandleEnv(), seen);
	}

	function containsRuntimeHandle(value, seen) {
		return runtimeHandleUtils().contains(value, runtimeHandleEnv(), seen);
	}

	function assertNoRuntimeHandle(value, where) {
		runtimeHandleUtils().assertSerializable(value, where, runtimeHandleEnv());
	}

	function normalizeTree(value) {
		return runtimeHandleUtils().normalize(value, runtimeHandleEnv());
	}

	function mergedContext(base, override) {
		return runtimeHandleUtils().mergedContext(base, override);
	}

	function joinPath(base, leaf) {
		return scopePathUtils().joinPath(base, leaf);
	}

	function schemaValueType(value) {
		return schemaUtils().valueType(value);
	}

	function mergeSchema(left, right) {
		return schemaUtils().merge(left, right);
	}

	function inferSchema(value, depth) {
		return schemaUtils().infer(value, depth || 0, schemaUtilsEnv());
	}

	function isSchemaMetaKey(key) {
		return schemaUtils().isMetaKey(key);
	}

	function isLeafSchema(value) {
		return schemaUtils().isLeaf(value);
	}

	function schemaPaths(schema, prefix) {
		return schemaUtils().paths(schema, prefix, schemaUtilsEnv());
	}

	function schemaSimpleType(schema) {
		return schemaUtils().simpleType(schema, schemaUtilsEnv());
	}

	function schemaArrayPaths(schema, prefix) {
		return schemaUtils().arrayPaths(schema, prefix, schemaUtilsEnv());
	}

	function schemaLeafEntries(schema, prefix) {
		return schemaUtils().leafEntries(schema, prefix, schemaUtilsEnv());
	}

	function schemaAtPath(schema, path) {
		return schemaUtils().atPath(schema, path, schemaUtilsEnv());
	}

	function unwrapDocumentSchema(schema) {
		return schemaUtils().unwrapDocument(schema, schemaUtilsEnv());
	}

	function hasSchemaContent(schema) {
		return schemaUtils().hasContent(schema);
	}

	function schemaScore(schema) {
		return schemaUtils().score(schema, schemaUtilsEnv());
	}

	function assignSchemaAtPath(root, path, schema) {
		return schemaUtils().assignAtPath(root, path, schema);
	}

	function itemSchema(schema) {
		return schemaUtils().item(schema);
	}

	function writeScopePath(scopes, path, value) {
		return scopePathUtils().writeScopePath(scopes, path, value, scopePathEnv());
	}

	function compileWriteScopePath(path) {
		var write = scopePathUtils().compileWriteScopePath(path, scopePathEnv());
		return function (ctx, value) {
			return write(ctx.scopes, value);
		};
	}

	function isStructuredValue(value) {
		return expressionUtils().isStructuredValue(value);
	}

	function renderTemplate(template, ctx) {
		return expressionUtils().renderTemplate(template, ctx, expressionUtilsEnv());
	}

	function renderValue(value, ctx) {
		return expressionUtils().renderValue(value, ctx, expressionUtilsEnv());
	}

	function renderTemplateTree(ctx, value) {
		return expressionUtils().renderTree(ctx, value, expressionUtilsEnv());
	}

	function literalValue(value) {
		return expressionUtils().literalValue(value, expressionUtilsEnv());
	}

	function expressionFunctions() {
		return expressionUtils().expressionFunctions(expressionUtilsEnv());
	}

	function tokenizeExpression(source) {
		return expressionUtils().tokenize(source, expressionUtilsEnv());
	}

	function evaluateExpression(ctx, source) {
		return expressionUtils().evaluate(ctx, source, expressionUtilsEnv());
	}

	function compileExpression(source) {
		return expressionUtils().compile(source, expressionUtilsEnv());
	}

	function compileTemplateTree(value) {
		return expressionUtils().compileTemplate(value, expressionUtilsEnv());
	}

	function inputValue(ctx, props, fallback) {
		if (props.value !== undefined) {
			return renderTemplateTree(ctx, literalValue(props.value));
		}
		return fallback;
	}

	function scopeReferenceUtils() {
		return loadEngineModule("scope-reference-utils.js");
	}

	function scopeReferenceEnv() {
		return {
			isScopePath: isScopePath,
			scopeNames: scopeNames
		};
	}

	function addUnique(items, value) {
		return scopeReferenceUtils().addUnique(items, value);
	}

	function collectScopeRefs(value, refs) {
		return scopeReferenceUtils().collectScopeRefs(value, refs, scopeReferenceEnv());
	}

	function collectExpressionRefs(value, refs) {
		return scopeReferenceUtils().collectExpressionRefs(value, refs, scopeReferenceEnv());
	}

	function collectTemplateRefs(value, refs) {
		return scopeReferenceUtils().collectTemplateRefs(value, refs, scopeReferenceEnv());
	}

	function exactTemplateExpression(value) {
		return scopeReferenceUtils().exactTemplateExpression(value);
	}

	function collectConfigKeys(value, keys) {
		return scopeReferenceUtils().collectConfigKeys(value, keys);
	}

	function projectConfigService() {
		return loadEngineModule("project-config-service.js");
	}

	function projectConfigEnv() {
		return {
			File: File,
			FileUtils: FileUtils,
			globalScope: globalScope,
			engineDir: engineDir,
			projectDir: projectDir,
			parseYamlSource: parseYamlSource,
			jsValue: jsValue,
			normalizeTree: normalizeTree,
			collectConfigKeys: collectConfigKeys,
			canonicalPath: canonicalPath,
			fileFingerprint: fileFingerprint,
			readRuntimeCache: readRuntimeMapCache,
			writeRuntimeCache: writeRuntimeMapCache,
			configDefinitionCache: runtimeState.caches.configDefinitions
		};
	}

	function readGlobalValue(name) {
		return projectConfigService().readGlobalValue(name, projectConfigEnv());
	}

	function projectEngineFile() {
		return projectConfigService().projectEngineFile(projectConfigEnv());
	}

	function loadProjectEngineDefinition() {
		return projectConfigService().loadProjectEngineDefinition(projectConfigEnv());
	}

	function authoringSettings() {
		return projectConfigService().authoringSettings(projectConfigEnv());
	}

	function effectiveConfig(request, definition, projectEngine) {
		return projectConfigService().effectiveConfig(request, definition, projectEngine, projectConfigEnv());
	}

	function snapshot(value) {
		return runtimeHandleUtils().snapshot(value, runtimeHandleEnv());
	}

	function createRuntimeHandle(ctx, type, value, options) {
		return runtimeHandleUtils().create(ctx, type, value, options);
	}

	function closeRuntimeHandle(ctx, handle) {
		return runtimeHandleUtils().close(ctx, handle, runtimeHandleEnv());
	}

	function closeRuntimeHandles(ctx) {
		runtimeHandleUtils().closeAll(ctx, runtimeHandleEnv());
	}

	function runtimeHandleValue(handle, expectedType) {
		return runtimeHandleUtils().value(handle, expectedType, runtimeHandleEnv());
	}

	function runtimeHandleApi() {
		return {
			assertSerializable: assertNoRuntimeHandle,
			closeAll: closeRuntimeHandles,
			isHandle: isRuntimeHandle,
			summary: runtimeHandleSummary,
			create: createRuntimeHandle,
			value: runtimeHandleValue,
			close: closeRuntimeHandle
		};
	}

	function canonicalPath(file) {
		try {
			return String(file.getCanonicalPath());
		} catch (e) {
			return String(file.getAbsolutePath());
		}
	}

	function createRuntimeCacheState() {
		return cacheUtils().createValueState();
	}

	function createRuntimeMapCacheState() {
		return cacheUtils().createMapState();
	}

	function createRuntimeBoundedMapCacheState(limit) {
		return cacheUtils().createBoundedMapState(limit);
	}

	function loadBootstrapModule(name) {
		var file = engineModuleFile(name);
		if (!file.isFile()) {
			raise("MISSING_ENGINE_MODULE", "Flow engine module not found: " + file.getAbsolutePath());
		}
		var source = String(FileUtils.readFileToString(file, "UTF-8"));
		var sourceName = canonicalPath(file);
		var fingerprint = file.lastModified() + ":" + file.length();
		var module = sharedEngineModule(name, source, sourceName, fingerprint);
		var shared = !!module;
		if (!module) {
			module = evalCompiledSource(source, sourceName, fingerprint);
		}
		if (!module || typeof module !== "object") {
			raise("INVALID_ENGINE_MODULE", "Invalid Flow engine module: " + file.getAbsolutePath(),
				null, "A Flow engine module must evaluate to an object.");
		}
		if (!shared) {
			module.__flowFile = String(file.getAbsolutePath());
		}
		return module;
	}

	function cacheUtils() {
		if (cacheUtilsModule) {
			return cacheUtilsModule;
		}
		cacheUtilsModule = loadBootstrapModule("cache-utils.js");
		return cacheUtilsModule;
	}

	function fingerprintUtils() {
		if (fingerprintUtilsModule) {
			return fingerprintUtilsModule;
		}
		fingerprintUtilsModule = loadBootstrapModule("fingerprint-utils.js");
		return fingerprintUtilsModule;
	}

	function fingerprintEnv() {
		return {
			Arrays: Arrays,
			canonicalPath: canonicalPath
		};
	}

	function readRuntimeCache(cache, key) {
		return cacheUtils().readValue(cache, key);
	}

	function writeRuntimeCache(cache, key, value, label) {
		return cacheUtils().writeValue(cache, key, value, label);
	}

	function readRuntimeMapCache(cache, key, fingerprint) {
		return cache && cache.limit
			? cacheUtils().readBoundedMap(cache, key, fingerprint)
			: cacheUtils().readMap(cache, key, fingerprint);
	}

	function writeRuntimeMapCache(cache, key, fingerprint, value, label) {
		return cache && cache.limit
			? cacheUtils().writeBoundedMap(cache, key, fingerprint, value, label)
			: cacheUtils().writeMap(cache, key, fingerprint, value, label);
	}

	function readRuntimeBoundedMapCache(cache, key, fingerprint) {
		return cacheUtils().readBoundedMap(cache, key, fingerprint);
	}

	function writeRuntimeBoundedMapCache(cache, key, fingerprint, value, label) {
		return cacheUtils().writeBoundedMap(cache, key, fingerprint, value, label);
	}

	function resetRuntimeModuleCaches() {
		cacheUtilsModule = null;
		fingerprintUtilsModule = null;
		flowNodeUtilsModule = null;
		expressionUtilsModule = null;
		runtimeHandleUtilsModule = null;
		iconServiceModule = null;
		flowRuntimeServiceModule = null;
		runPlanHeadServiceModule = null;
		frontendProviderServiceModule = null;
		flowRuntimeServiceEnvInstance = null;
		runPlanHeadEnvInstance = null;
		clearCompiledScriptCache();
	}

	function runtimeCacheService() {
		return loadEngineModule("runtime-cache-service.js");
	}

	function runtimeCacheEnv() {
		return {
			runtimeState: runtimeState,
			cacheUtils: cacheUtils(),
			projectDir: projectDir,
			canonicalPath: canonicalPath,
			engineDir: engineDir,
			Thread: Packages.java.lang.Thread,
			globalScope: globalScope,
			bridgeInfo: function () {
				var qname = typeof globalScope.__flowBridgeEngineQName !== "undefined"
					? String(globalScope.__flowBridgeEngineQName || "")
					: "lib_flow_engine.Engine";
				return Packages.com.twinsoft.convertigo.engine.flow.FlowEngineBridge.flowBridgeCacheInfo(qname);
			},
			resetModuleCaches: resetRuntimeModuleCaches,
			compiledScriptCacheInfo: compiledScriptCacheInfo,
			flowSnapshotStats: runtimeState.flowSnapshotStats,
			sharedFlowSnapshotInfo: sharedFlowSnapshotInfo,
			clearCompiledScriptCache: clearCompiledScriptCache,
			clearPersistentFrontendDocuments: clearPersistentFrontendDocuments,
			clearFrontendDocumentServers: clearFrontendDocumentServers,
			clearFrontendProviderState: clearFrontendProviderState
		};
	}

	function clearRuntimeCaches() {
		var result = runtimeCacheService().clear(runtimeCacheEnv());
		runtimeState.blockArtifactCompilerFingerprint = null;
		runtimeState.flowPlanCompilerFingerprint = null;
		return result;
	}

	function invalidateBlockCatalogCaches() {
		cacheUtils().clearMap(runtimeState.caches.blocks);
		cacheUtils().clearMap(runtimeState.caches.blockCatalogHeads);
		cacheUtils().clearBoundedMap(runtimeState.caches.flowPlans);
		clearRunPlanHeads();
	}

	function runPlanHeadService() {
		if (!runPlanHeadServiceModule) {
			runPlanHeadServiceModule = loadEngineModule("run-plan-head-service.js");
		}
		return runPlanHeadServiceModule;
	}

	function runPlanHeadEnv() {
		if (runPlanHeadEnvInstance) {
			return runPlanHeadEnvInstance;
		}
		runPlanHeadEnvInstance = {
			cache: runtimeState.caches.runPlanHeads,
			projectDir: projectDir,
			currentTimeMillis: function () { return new Date().getTime(); },
			probeIntervalMs: 60000,
			writeRuntimeBoundedCache: writeRuntimeBoundedMapCache,
			clearRuntimeBoundedCache: function (cache) { cacheUtils().clearBoundedMap(cache); }
		};
		return runPlanHeadEnvInstance;
	}

	function readRunPlanHead(request) {
		return runPlanHeadService().read(request, runPlanHeadEnv());
	}

	function writeRunPlanHead(request, blocks, plan) {
		return runPlanHeadService().write(request, blocks, plan, runPlanHeadEnv());
	}

	function clearRunPlanHeads() {
		runPlanHeadService().clear(runPlanHeadEnv());
	}

	function cacheInfoRequest() {
		return runtimeCacheService().info(runtimeCacheEnv());
	}

	function fileFingerprint(file) {
		return fingerprintUtils().fileFingerprint(file, fingerprintEnv());
	}

	function directoryFingerprint(dir) {
		return fingerprintUtils().directoryFingerprint(dir, fingerprintEnv());
	}

	function engineResourceFile(name) {
		return new File(engineDir(), "resources/" + name);
	}

	function engineModuleFile(name) {
		return new File(engineDir(), "modules/" + name);
	}

	function flowPlanCompilerFingerprint() {
		if (runtimeState.flowPlanCompilerFingerprint !== null) {
			return runtimeState.flowPlanCompilerFingerprint;
		}
		runtimeState.flowPlanCompilerFingerprint = [
			"flow-execution-snapshot-service.js",
			"flow-runtime-service.js",
			"flow-script-parser-service.js",
			"flow-repository-service.js",
			"flow-source-service.js"
		].map(function (name) { return fileFingerprint(engineModuleFile(name)); }).join("\n");
		return runtimeState.flowPlanCompilerFingerprint;
	}

	function blockArtifactCompilerFingerprint() {
		if (runtimeState.blockArtifactCompilerFingerprint !== null) {
			return runtimeState.blockArtifactCompilerFingerprint;
		}
		runtimeState.blockArtifactCompilerFingerprint = [
			"block-code-compiler-service.js",
			"block-file-loader-service.js",
			"block-policy-service.js",
			"flow-script-parser-service.js",
			"graph-block-runtime-service.js"
		].map(function (name) { return fileFingerprint(engineModuleFile(name)); }).join("\n");
		return runtimeState.blockArtifactCompilerFingerprint;
	}

	function loadEngineModule(name) {
		var file = engineModuleFile(name);
		if (!file.isFile()) {
			raise("MISSING_ENGINE_MODULE", "Flow engine module not found: " + file.getAbsolutePath());
		}
		var cache = runtimeState.caches.engineModules;
		var key = canonicalPath(file);
		var fingerprint = fileFingerprint(file);
		var cached = readRuntimeMapCache(cache, key, fingerprint);
		if (cached) {
			return cached;
		}
		var source = String(FileUtils.readFileToString(file, "UTF-8"));
		var module = sharedEngineModule(name, source, key, fingerprint);
		var shared = !!module;
		if (!module) {
			module = evalCompiledSource(source, key, fingerprint);
		}
		if (!module || typeof module !== "object") {
			raise("INVALID_ENGINE_MODULE", "Invalid Flow engine module: " + file.getAbsolutePath(),
				null, "A Flow engine module must evaluate to an object.");
		}
		if (!shared) {
			module.__flowFile = String(file.getAbsolutePath());
		}
		return writeRuntimeMapCache(cache, key, fingerprint, module, "Flow engine modules");
	}

	function schemaUtils() {
		return loadEngineModule("schema-utils.js");
	}

	function schemaUtilsEnv() {
		return {
			normalizeTree: normalizeTree,
			objectPathParts: objectPathParts,
			isRuntimeHandle: isRuntimeHandle,
			runtimeHandleType: runtimeHandleType
		};
	}

	function expressionUtils() {
		if (!expressionUtilsModule) {
			expressionUtilsModule = loadEngineModule("expression-utils.js");
		}
		return expressionUtilsModule;
	}

	function expressionUtilsEnv() {
		return {
			raise: raise,
			normalizeTree: normalizeTree,
			isScopePath: isScopePath,
			isRuntimeHandle: isRuntimeHandle,
			runtimeHandleSummary: runtimeHandleSummary,
			cacheUtils: cacheUtils(),
			expressionTokenCache: runtimeState.caches.expressionTokens,
			expressionProgramCache: runtimeState.caches.expressionPrograms,
			sanitizeRuntimeValue: sanitizeRuntimeValue
		};
	}

	function runtimeHandleUtils() {
		if (!runtimeHandleUtilsModule) {
			runtimeHandleUtilsModule = loadEngineModule("runtime-handle-utils.js");
		}
		return runtimeHandleUtilsModule;
	}

	function runtimeHandleEnv() {
		return {
			raise: raise,
			NativeJavaObject: NativeJavaObject,
			JavaString: JavaString,
			JavaBoolean: JavaBoolean,
			JavaNumber: JavaNumber
		};
	}

	function namingUtils() {
		return loadEngineModule("naming-utils.js");
	}

	function namingEnv() {
		return {
			File: File,
			canonicalPath: canonicalPath,
			raise: raise
		};
	}

	function resourcePath(baseDir, path) {
		return namingUtils().resourcePath(baseDir, path, namingEnv());
	}

	function blockFileName(name) {
		return namingUtils().blockFileName(name, namingEnv());
	}

	function blockDescriptorFileName(name) {
		return namingUtils().blockDescriptorFileName(name, namingEnv());
	}

	function blockCodeDescriptorFileName(name) {
		return namingUtils().blockCodeDescriptorFileName(name, namingEnv());
	}

	function blockFlowFileName(name) {
		return namingUtils().blockFlowFileName(name, namingEnv());
	}

	function blockHooksFileName(name) {
		return namingUtils().blockHooksFileName(name, namingEnv());
	}

	function typeDescriptorFileName(name) {
		return namingUtils().typeDescriptorFileName(name, namingEnv());
	}

	function flowFileName(name) {
		return namingUtils().flowFileName(name, namingEnv());
	}

	function flowCodeFileName(name) {
		return namingUtils().flowCodeFileName(name, namingEnv());
	}

	function flowCodeFileFromYamlFile(file, name) {
		return namingUtils().flowCodeFileFromYamlFile(file, name, namingEnv());
	}

	function fragmentFileName(name) {
		return namingUtils().fragmentFileName(name, namingEnv());
	}

	function safeFilePart(value) {
		return namingUtils().safeFilePart(value);
	}

	function safeIdentifier(value) {
		return namingUtils().safeIdentifier(value);
	}

	function blockIdParts(name) {
		return namingUtils().blockIdParts(name);
	}

	function blockLocalName(name) {
		return namingUtils().blockLocalName(name);
	}

	function blockNamespace(name) {
		return namingUtils().blockNamespace(name);
	}

	function flowNameFor(request, definition) {
		return namingUtils().flowNameFor(request, definition);
	}

	function schemaStoreService() {
		return loadEngineModule("schema-store-service.js");
	}

	function schemaStoreEnv() {
		return {
			File: File,
			FileUtils: FileUtils,
			safeFilePart: safeFilePart,
			nodePath: nodePath,
			blockName: blockName,
			projectSchemasDir: projectSchemasDir,
			flowNameFor: flowNameFor,
			inferSchema: inferSchema,
			normalizeTree: normalizeTree,
			schemaSimpleType: schemaSimpleType,
			schemaPaths: schemaPaths,
			schemaArrayPaths: schemaArrayPaths,
			schemaLeafEntries: schemaLeafEntries,
			currentProjectName: currentProjectName,
			loadBlocks: loadBlocks,
			parseSource: parseSource,
			sourceForFlowRequest: sourceForFlowRequest,
			raise: raise
		};
	}

	function schemaNodeKey(node, outPath) {
		return schemaStoreService().schemaNodeKey(node, outPath, schemaStoreEnv());
	}

	function outputSchemaFile(request, definition, node, property, outPath) {
		return schemaStoreService().outputSchemaFile(request, definition, node, property, outPath, schemaStoreEnv());
	}

	function resultSchemaFile(request, definition) {
		return schemaStoreService().resultSchemaFile(request, definition, schemaStoreEnv());
	}

	function readOutputSchema(request, definition, node, property, outPath) {
		return schemaStoreService().readOutputSchema(request, definition, node, property, outPath, schemaStoreEnv());
	}

	function readResultSchema(request, definition) {
		return schemaStoreService().readResultSchema(request, definition, schemaStoreEnv());
	}

	function learnOutputSchema(request, definition, node, property, outPath, value) {
		return schemaStoreService().learnOutputSchema(request, definition, node, property, outPath, value, schemaStoreEnv());
	}

	function writeOutputSchema(request, definition, node, property, outPath, schema) {
		return schemaStoreService().writeOutputSchema(request, definition, node, property, outPath, schema, schemaStoreEnv());
	}

	function deleteOutputSchema(request, definition, node, property, outPath) {
		return schemaStoreService().deleteOutputSchema(request, definition, node, property, outPath, schemaStoreEnv());
	}

	function clearConvertigoSchemaCache(request) {
		return schemaStoreService().clearConvertigoSchemaCache(request, schemaStoreEnv());
	}

	function declaredOutputSchema(definition) {
		return schemaStoreService().declaredOutputSchema(definition, schemaStoreEnv());
	}

	function declaredPropertyOutputSchema(catalog, property) {
		return schemaStoreService().declaredPropertyOutputSchema(catalog, property, schemaStoreEnv());
	}

	function schemaSummary(schema) {
		return schemaStoreService().summary(schema, schemaStoreEnv());
	}

	function learnResultSchema(request, definition, value) {
		return schemaStoreService().learnResultSchema(request, definition, value, schemaStoreEnv());
	}

	function resetSchemaRequest(request) {
		return schemaStoreService().reset(request, schemaStoreEnv());
	}

	function normalizeResourcePath(path) {
		return loadEngineModule("resource-utils.js").normalizePath(path, { raise: raise });
	}

	function resourceExtension(path) {
		return loadEngineModule("resource-utils.js").extension(path);
	}

	function isAllowedResourcePath(path) {
		return loadEngineModule("resource-utils.js").isAllowedPath(path);
	}

	function resourceKind(path) {
		return loadEngineModule("resource-utils.js").kind(path);
	}

	function resourceName(path) {
		return loadEngineModule("resource-utils.js").name(path);
	}

	function resourceMimeType(path) {
		return loadEngineModule("resource-utils.js").mimeType(path);
	}

	function resourceUri(path) {
		return loadEngineModule("resource-utils.js").uri(path);
	}

	function firstMarkdownHeading(content, fallback) {
		return loadEngineModule("resource-utils.js").firstMarkdownHeading(content, fallback);
	}

	function firstMarkdownParagraph(content) {
		return loadEngineModule("resource-utils.js").firstMarkdownParagraph(content);
	}

	function blockIdFromResourcePath(path) {
		return loadEngineModule("resource-utils.js").blockIdFromPath(path);
	}

	function projectBlockDescriptorFileForResource(path) {
		return projectBlocksDir() ? new File(projectBlocksDir(), blockDescriptorFileName(blockIdFromResourcePath(path))) : null;
	}

	function projectBlockCodeFileForResource(path) {
		return projectBlocksDir() ? new File(projectBlocksDir(), blockCodeDescriptorFileName(blockIdFromResourcePath(path))) : null;
	}

	function projectBlockContractFileForResource(path) {
		var codeFile = projectBlockCodeFileForResource(path);
		if (codeFile && codeFile.isFile()) {
			return codeFile;
		}
		return projectBlockDescriptorFileForResource(path);
	}

	function resourceService() {
		return loadEngineModule("resource-service.js");
	}

	function responseBudget(request, options) {
		return loadEngineModule("response-budget-service.js").create(request, options, {
			nowMillis: function () { return Packages.java.lang.System.currentTimeMillis(); },
			utf8Length: function (text) { return new Packages.java.lang.String(String(text || "")).getBytes("UTF-8").length; },
			base64UrlEncode: function (text) {
				return String(Base64.getUrlEncoder().withoutPadding().encodeToString(
					new Packages.java.lang.String(String(text || "")).getBytes("UTF-8")));
			},
			base64UrlDecode: function (text) {
				return String(new Packages.java.lang.String(Base64.getUrlDecoder().decode(String(text || "")), "UTF-8"));
			},
			raise: raise
		});
	}

	function resourceServiceEnv() {
		return {
			File: File,
			Arrays: Arrays,
			FileUtils: FileUtils,
			raise: raise,
			projectDir: projectDir,
			canonicalPath: canonicalPath,
			normalizeResourcePath: normalizeResourcePath,
			isAllowedResourcePath: isAllowedResourcePath,
			resourceKind: resourceKind,
			resourceName: resourceName,
			resourceMimeType: resourceMimeType,
			resourceUri: resourceUri,
			firstMarkdownHeading: firstMarkdownHeading,
			firstMarkdownParagraph: firstMarkdownParagraph,
			globPatterns: globPatterns,
			globMatches: globMatches,
			intOption: intOption,
			searchNeedle: searchNeedle,
			searchMatches: searchMatches,
			searchSnippet: searchSnippet,
			sha256Hex: sha256Hex,
			responseBudget: responseBudget,
			applyUnifiedPatchText: applyUnifiedPatchText,
			projectBlockDescriptorFileForResource: projectBlockDescriptorFileForResource,
			projectBlockContractFileForResource: projectBlockContractFileForResource,
			blockDescriptorFileName: blockDescriptorFileName,
			blockCodeDescriptorFileName: blockCodeDescriptorFileName,
			blockIdFromResourcePath: blockIdFromResourcePath,
			evalCompiledSource: evalCompiledSource,
			validateBlockImplementationSource: validateBlockImplementationSource,
			validateBlockFlowImplementationSource: validateBlockFlowImplementationSource,
			validateBlockHooksSource: validateBlockHooksSource,
			validateGraphBlockSource: validateGraphBlockSource,
			compileProjectBlockCode: compileProjectBlockCode,
			loadBlocks: loadBlocks,
			parseYamlSource: parseYamlSource,
			validateTypeDescriptorSource: validateTypeDescriptorSource
		};
	}

	function resourceRelativePath(base, file) {
		var basePath = canonicalPath(base);
		var filePath = canonicalPath(file);
		if (filePath.indexOf(basePath + File.separator) !== 0) {
			return "";
		}
		return filePath.substring(basePath.length + 1).replace(/\\/g, "/");
	}

	function projectResourceFile(path, mustExist) {
		return resourceService().projectResourceFile(path, mustExist, resourceServiceEnv());
	}

	function projectResourceEntries() {
		return resourceService().projectResourceEntries(resourceServiceEnv());
	}

	function projectResourceEntryForUri(uri) {
		return resourceService().projectResourceEntryForUri(uri, resourceServiceEnv());
	}

	function resourceSummary(entry, content) {
		return resourceService().resourceSummary(entry, content, resourceServiceEnv());
	}

	function resourceListSummary(entry, includeHash) {
		return resourceService().resourceListSummary(entry, includeHash, resourceServiceEnv());
	}

	function globPatterns(value, fallback) {
		return loadEngineModule("resource-utils.js").globPatterns(value, fallback);
	}

	function globMatches(path, patterns) {
		return loadEngineModule("resource-utils.js").globMatches(path, patterns);
	}

	function resourceListRequest(request) {
		return resourceService().list(request, resourceServiceEnv());
	}

	function resourceSearchRequest(request) {
		return resourceService().search(request, resourceServiceEnv());
	}

	function resourceGetRequest(request) {
		return resourceService().get(request, resourceServiceEnv());
	}

	function applyUnifiedPatchText(content, patch) {
		return loadEngineModule("patch-utils.js").applyUnifiedPatchText(content, patch, { raise: raise });
	}

	function validateResourceContent(path, content) {
		return resourceService().validateResourceContent(path, content, resourceServiceEnv());
	}

	function resourcePatchRequest(request) {
		return resourceService().patch(request, resourceServiceEnv());
	}

	function resourceDeleteRequest(request) {
		return resourceService().remove(request, resourceServiceEnv());
	}

	function notifySourceMutation(request) {
		request = request || {};
		var Bridge = Packages.com.twinsoft.convertigo.engine.flow.FlowEngineBridge;
		var notified = false;
		try {
			if (typeof Bridge.notifySourceMutationWithReveal === "function") {
				Bridge.notifySourceMutationWithReveal(
					String(request.projectDir || ""),
					String(request.path || request.sourcePath || ""),
					request.reveal === true || String(request.reveal || "").toLowerCase() === "true"
				);
				notified = true;
			} else if (typeof Bridge.notifySourceMutation === "function") {
				try {
					Bridge.notifySourceMutation(
						String(request.projectDir || ""),
						String(request.path || request.sourcePath || ""),
						request.reveal === true || String(request.reveal || "").toLowerCase() === "true"
					);
				} catch (_legacySourceMutationBridge) {
					Bridge.notifySourceMutation(
						String(request.projectDir || ""),
						String(request.path || request.sourcePath || "")
					);
				}
				notified = true;
			}
		} catch (ignored) {
			// Older runtimes still accept the source write; Studio refresh becomes available after rebuild.
		}
		return {
			ok: true,
			notified: notified,
			projectDir: String(request.projectDir || ""),
			sourcePath: String(request.path || request.sourcePath || "")
		};
	}

	function resourceApi() {
		return {
			search: resourceSearchRequest,
			list: resourceListRequest,
			get: resourceGetRequest,
			patch: resourcePatchRequest,
			remove: resourceDeleteRequest
		};
	}

	function flowLibraryService() {
		return loadEngineModule("flow-library-service.js");
	}

	function flowLibraryServiceEnv() {
		return {
			File: File,
			Arrays: Arrays,
			FileUtils: FileUtils,
			engineDir: engineDir,
			projectDir: projectDir,
			projectNameForRoot: projectNameForRoot,
			projectLibDir: projectLibDir,
			engineLibDir: engineLibDir,
			canonicalPath: canonicalPath,
			fileFingerprint: fileFingerprint,
			readRuntimeMapCache: readRuntimeMapCache,
			writeRuntimeMapCache: writeRuntimeMapCache,
			evalCompiledSource: evalCompiledSource,
			safeFilePart: safeFilePart,
			raise: raise,
			cache: runtimeState.caches.libraries
		};
	}

	function flowProviderName(flowDir, fallback) {
		return flowLibraryService().providerName(flowDir, fallback, flowLibraryServiceEnv());
	}

	function flowProjectRootFromFlowDir(flowDir) {
		return flowLibraryService().projectRootFromFlowDir(flowDir, flowLibraryServiceEnv());
	}

	function loadedProjectRootForName(name) {
		try {
			if (typeof Packages === "undefined" || !name) {
				return null;
			}
			var engine = Packages.com.twinsoft.convertigo.engine.Engine;
			if (!engine.theApp || !engine.theApp.databaseObjectsManager) {
				return null;
			}
			var project = engine.theApp.databaseObjectsManager.getOriginalProjectByName(String(name), false);
			if (!project) {
				return null;
			}
			return new File(String(project.getDirPath()));
		} catch (e) {
			return null;
		}
	}

	function catalogLoaderService() {
		return loadEngineModule("catalog-loader-service.js");
	}

	function catalogLoaderEnv() {
		return {
			File: File,
			Arrays: Arrays,
			FileUtils: FileUtils,
			engineDir: engineDir,
			projectDir: projectDir,
			projectBlocksDir: projectBlocksDir,
			projectTypesDir: projectTypesDir,
			resourceRelativePath: resourceRelativePath,
			resourceName: resourceName,
			canonicalPath: canonicalPath,
			directoryFingerprint: directoryFingerprint,
			sourceDraftsFingerprint: sourceDraftsFingerprint,
			readRuntimeCache: readRuntimeMapCache,
			writeRuntimeCache: writeRuntimeMapCache,
			flowProviderName: flowProviderName,
			projectNameForRoot: projectNameForRoot,
			projectRootForName: loadedProjectRootForName,
			loadFlowScriptBlockFile: loadFlowScriptBlockFile,
			loadGraphBlockFile: loadGraphBlockFile,
			reserveFlowScriptBlockFile: reserveFlowScriptBlockFile,
			reserveGraphBlockFile: reserveGraphBlockFile,
			validateTypeDescriptorSource: validateTypeDescriptorSource,
			raise: raise,
			blockCache: runtimeState.caches.blocks,
			coreBlockCache: runtimeState.caches.coreBlocks,
			blockCatalogHeadCache: runtimeState.caches.blockCatalogHeads,
			withBlockCatalogBuild: function (key, callback) {
				key = String(key || "");
				var candidate = new ReentrantLock();
				var existing = blockCatalogBuildLocks.putIfAbsent(key, candidate);
				var lock = existing || candidate;
				lock.lock();
				try {
					return callback();
				} finally {
					lock.unlock();
				}
			},
			currentTimeMillis: function () { return new Date().getTime(); },
			typeCache: runtimeState.caches.types
		};
	}

	function blockIdFromDescriptorFile(file, blocksDir) {
		return catalogLoaderService().blockIdFromDescriptorFile(file, blocksDir, catalogLoaderEnv());
	}

	function loadBlockDir(blocks, blocksDir, origin, provider) {
		return catalogLoaderService().loadBlockDir(blocks, blocksDir, origin, provider, catalogLoaderEnv());
	}

	function reserveBlockDir(blocks, blocksDir, origin, provider) {
		return catalogLoaderService().reserveBlockDir(blocks, blocksDir, origin, provider, catalogLoaderEnv());
	}

	function blocksCacheKey() {
		return catalogLoaderService().blocksCacheKey(catalogLoaderEnv());
	}

	function loadBlocksUncached() {
		return catalogLoaderService().loadBlocksUncached(catalogLoaderEnv());
	}

	function loadBlocks(allowHot) {
		return catalogLoaderService().loadBlocks(catalogLoaderEnv(), allowHot === true);
	}

	function preloadProjectRequest(request) {
		var started = new Date().getTime();
		var blocks = loadBlocks(false);
		var compilerStarted = new Date().getTime();
		compileFlowPlan({
			flowQName: "lib_flow_engine.__compiler_preload__",
			flowName: "__compiler_preload__",
			flowSource: "function __compiler_preload__({ result }) {\n  return result\n}\n"
		}, blocks);
		return {
			ok: true,
			project: String(request.project || ""),
			projectDir: String(projectDir() || ""),
			blockCount: Object.keys(blocks).length,
			durationMs: new Date().getTime() - started,
			compilerDurationMs: new Date().getTime() - compilerStarted,
			blockArtifacts: cacheUtils().summary("blockArtifacts", runtimeState.caches.blockArtifacts)
		};
	}

	function loadTypeDescriptorFile(types, file, origin) {
		return catalogLoaderService().loadTypeDescriptorFile(types, file, origin, catalogLoaderEnv());
	}

	function loadTypeDir(types, typesDir, origin) {
		return catalogLoaderService().loadTypeDir(types, typesDir, origin, catalogLoaderEnv());
	}

	function typesCacheKey() {
		return catalogLoaderService().typesCacheKey(catalogLoaderEnv());
	}

	function loadTypesUncached() {
		return catalogLoaderService().loadTypesUncached(catalogLoaderEnv());
	}

	function loadTypes() {
		return catalogLoaderService().loadTypes(catalogLoaderEnv());
	}

	function referencedProjectRoots(relativePath, explicitProjectRoot) {
		return catalogLoaderService().referencedProjectRoots(
			catalogLoaderEnv(),
			relativePath,
			explicitProjectRoot || projectDir()
		);
	}

	function projectBlockDescriptorFile(name) {
		var dir = projectBlocksDir();
		if (!dir) {
			raise("PROJECT_BLOCKS_UNAVAILABLE", "Project blocks are unavailable.",
				null, "Run through a Flow requestable or set __flowProjectDir in standalone tests.");
		}
		return new File(dir, blockDescriptorFileName(name));
	}

	function projectBlockCodeFile(name) {
		var dir = projectBlocksDir();
		if (!dir) {
			raise("PROJECT_BLOCKS_UNAVAILABLE", "Project blocks are unavailable.",
				null, "Run through a Flow requestable or set __flowProjectDir in standalone tests.");
		}
		return new File(dir, blockCodeDescriptorFileName(name));
	}

	function flowLibraryFile(name) {
		return flowLibraryService().libraryFile(name, flowLibraryServiceEnv());
	}

	function listFlowLibraries() {
		return flowLibraryService().list(flowLibraryServiceEnv());
	}

	function loadFlowLibrary(name) {
		return flowLibraryService().load(name, flowLibraryServiceEnv());
	}

	function blockPolicyService() {
		return loadEngineModule("block-policy-service.js");
	}

	function blockPolicyEnv() {
		return {
			sha256Hex: sha256Hex,
			evalCompiledSource: evalCompiledSource,
			raise: raise
		};
	}

	function validateBlockImplementationSource(name, source) {
		return blockPolicyService().validateImplementationSource(name, source, blockPolicyEnv());
	}

	function rhinoImplementationWarnings(name, source) {
		return blockPolicyService().rhinoImplementationWarnings(name, source, blockPolicyEnv());
	}

	function enforceRhinoImplementationPolicy(name, source) {
		return blockPolicyService().enforceRhinoImplementationPolicy(name, source, blockPolicyEnv());
	}

	function validateBlockHooksSource(name, source) {
		return blockPolicyService().validateHooksSource(name, source, blockPolicyEnv());
	}

	function graphBlockDescriptorService() {
		return loadEngineModule("graph-block-descriptor-service.js");
	}

	function graphBlockDescriptorEnv() {
		return {
			normalizeTree: normalizeTree,
			safeFilePart: safeFilePart,
			blockNamespace: blockNamespace,
			blockLocalName: blockLocalName,
			parseYamlSource: parseYamlSource,
			raise: raise
		};
	}

	function normalizeGraphBlockProps(definition) {
		return graphBlockDescriptorService().normalizeProps(definition, graphBlockDescriptorEnv());
	}

	function normalizeGraphBlockSlots(definition) {
		return graphBlockDescriptorService().normalizeSlots(definition, graphBlockDescriptorEnv());
	}

	function normalizeGraphBlockUses(definition) {
		return graphBlockDescriptorService().normalizeUses(definition, graphBlockDescriptorEnv());
	}

	function blockImplementation(definition) {
		return graphBlockDescriptorService().implementation(definition, graphBlockDescriptorEnv());
	}


	function graphBlockCatalog(definition) {
		return graphBlockDescriptorService().catalog(definition, graphBlockDescriptorEnv());
	}

	function validateGraphBlockDefinition(name, definition) {
		return graphBlockDescriptorService().validateDefinition(name, definition, graphBlockDescriptorEnv());
	}

	function validateGraphBlockSource(name, source) {
		return graphBlockDescriptorService().validateSource(name, source, graphBlockDescriptorEnv());
	}

	function graphBlockDefinitionForWrite(definition) {
		return graphBlockDescriptorService().definitionForWrite(definition, graphBlockDescriptorEnv());
	}

	function blockCodeSourceService() {
		return loadEngineModule("block-code-source-service.js");
	}

	function blockCodeSourceEnv() {
		return {
			normalizeTree: normalizeTree,
			parseFlowScriptObjectLiteral: parseFlowScriptObjectLiteral,
			normalizeFlowScriptCode: normalizeFlowScriptCode,
			safeIdentifier: safeIdentifier,
			blockLocalName: blockLocalName,
			blockHooksFileName: blockHooksFileName,
			raise: raise
		};
	}

	function graphBlockRuntimeService() {
		return loadEngineModule("graph-block-runtime-service.js");
	}

	function graphBlockRuntimeEnv() {
		if (graphBlockRuntimeEnvInstance) {
			return graphBlockRuntimeEnvInstance;
		}
		graphBlockRuntimeEnvInstance = {
			File: File,
			FileUtils: FileUtils,
			canonicalPath: canonicalPath,
			fileFingerprint: fileFingerprint,
			evalCompiledSource: evalCompiledSource,
			normalizeTree: normalizeTree,
			raise: raise,
			blockImplementation: blockImplementation,
			validateBlockImplementationSource: validateBlockImplementationSource,
			validateBlockHooksSource: validateBlockHooksSource,
			parseYamlSource: parseYamlSource,
			graphBlockCatalog: graphBlockCatalog,
			validateGraphBlockSource: validateGraphBlockSource,
			blockIdFromDescriptorFile: blockIdFromDescriptorFile,
			blockName: blockName,
			blockCatalog: blockCatalog,
			nodeProps: nodeProps,
			summaryText: summaryText,
			renderTemplateTree: renderTemplateTree,
			readScopePath: readScopePath,
			graphBlockStackLabel: graphBlockStackLabel,
			compileTemplateTree: compileTemplateTree,
			nanoTime: function () { return JavaSystem.nanoTime(); }
		};
		return graphBlockRuntimeEnvInstance;
	}

	function validateBlockFlowImplementationSource(name, source) {
		return graphBlockRuntimeService().validateBlockFlowImplementationSource(name, source, graphBlockRuntimeEnv());
	}

	function graphBlockFromDefinition(definition, file, origin, provider) {
		return graphBlockRuntimeService().graphBlockFromDefinition(definition, file, origin, provider, graphBlockRuntimeEnv());
	}

	function flowHelperBlockDefinition(helper) {
		helper = normalizeTree(helper || {});
		var name = safeIdentifier(helper.name || "helper");
		return {
			version: 1,
			name: name,
			__flowBlockId: name,
			"private": false,
			visibility: "public",
			icon: "mdi:function-variant",
			description: "Private FlowScript helper.",
			tags: ["helper", "private"],
			props: normalizeTree(helper.props || {}),
			outputs: {
				value: {
					type: "unknown"
				}
			},
			implementation: {
				runtime: "flow"
			},
			__flowHelper: true,
			__graphDefinition: {
				version: 1,
				nodes: normalizeTree(helper.nodes || [])
			}
		};
	}

	function blocksWithFlowHelpers(blocks, definition) {
		definition = normalizeTree(definition || {});
		var helpers = definition.helpers || [];
		if (Object.prototype.toString.call(helpers) !== "[object Array]" || helpers.length === 0) {
			return blocks;
		}
		var out = Object.assign({}, blocks || {});
		helpers.forEach(function (helper) {
			var name = safeIdentifier(helper && helper.name || "");
			if (!name) {
				return;
			}
			var helperFile = new File(engineDir(), "helpers/" + safeIconName(name) + ".flow.js");
			out[name] = graphBlockFromDefinition(flowHelperBlockDefinition(helper), helperFile, "helper", "Current Flow");
		});
		return out;
	}

	function loadGraphBlockFile(blocks, file, origin, provider, blocksDir) {
		return graphBlockRuntimeService().loadGraphBlockFile(blocks, file, origin, provider, blocksDir, graphBlockRuntimeEnv());
	}

	function balancedObjectEnd(text, open) {
		return blockCodeSourceService().balancedObjectEnd(text, open);
	}

	function extractFlowScriptBlockMeta(code) {
		return blockCodeSourceService().extractMeta(code, blockCodeSourceEnv());
	}

	function unwrapFlowScriptBlockEnvelope(code) {
		return blockCodeSourceService().unwrapFlowScriptBlockEnvelope(code);
	}

	function flowScriptBlockFunctionName(name) {
		return blockCodeSourceService().flowScriptBlockFunctionName(name, blockCodeSourceEnv());
	}

	function normalizeFlowScriptFunctionSyntax(code) {
		return blockCodeSourceService().normalizeFlowScriptFunctionSyntax(code);
	}

	function blockCodeRuntimeFromMeta(meta) {
		return blockCodeSourceService().blockCodeRuntimeFromMeta(meta, blockCodeSourceEnv());
	}

	function ensureFlowScriptBlockFunction(name, code) {
		return blockCodeSourceService().ensureFlowScriptBlockFunction(name, code, blockCodeSourceEnv());
	}

	function flowScriptBlockCodeSource(name, functionCode, meta) {
		return blockCodeSourceService().flowScriptBlockCodeSource(name, functionCode, meta, blockCodeSourceEnv());
	}

	function rhinoBlockCodeSource(name, source, meta) {
		return blockCodeSourceService().rhinoBlockCodeSource(name, source, meta, blockCodeSourceEnv());
	}

	function blockCodeCompilerService() {
		return loadEngineModule("block-code-compiler-service.js");
	}

	function blockCodeCompilerEnv() {
		return {
			normalizeTree: normalizeTree,
			parseYamlSource: parseYamlSource,
			raise: raise,
			blockLocalName: blockLocalName,
			blockCodeRuntimeFromMeta: blockCodeRuntimeFromMeta,
			validateGraphBlockDefinition: validateGraphBlockDefinition,
			extractFlowScriptBlockMeta: extractFlowScriptBlockMeta,
			ensureFlowScriptBlockFunction: ensureFlowScriptBlockFunction,
			graphBlockCatalog: graphBlockCatalog,
			flowScriptValidateRequest: flowScriptValidateRequest,
			flowScriptBlockCodeSource: flowScriptBlockCodeSource,
			rhinoBlockCodeSource: rhinoBlockCodeSource,
			sha256Hex: sha256Hex,
			validateBlockImplementationSource: validateBlockImplementationSource,
			rhinoImplementationWarnings: rhinoImplementationWarnings,
			enforceRhinoImplementationPolicy: enforceRhinoImplementationPolicy
		};
	}

	function flowScriptBlockDescriptorFromMeta(name, meta, graphDefinition, code) {
		return blockCodeCompilerService().flowScriptBlockDescriptorFromMeta(name, meta, graphDefinition, code, blockCodeCompilerEnv());
	}

	function flowScriptBlockMetaFromRequest(name, request) {
		return blockCodeCompilerService().flowScriptBlockMetaFromRequest(name, request, blockCodeCompilerEnv());
	}

	function compileFlowScriptBlockCode(blocks, name, code, request) {
		return blockCodeCompilerService().compileFlowScriptBlockCode(blocks, name, code, request, blockCodeCompilerEnv());
	}

	function compileRhinoBlockCode(name, code, request) {
		return blockCodeCompilerService().compileRhinoBlockCode(name, code, request, blockCodeCompilerEnv());
	}

	function compileProjectBlockCode(blocks, name, code, request) {
		return blockCodeCompilerService().compileProjectBlockCode(blocks, name, code, request, blockCodeCompilerEnv());
	}

	function blockFileLoaderService() {
		return loadEngineModule("block-file-loader-service.js");
	}

	function blockFileLoaderEnv() {
		return {
			FileUtils: FileUtils,
			sourceForFile: sourceForFile,
			sha256Hex: sha256Hex,
			blockCompilerFingerprint: blockArtifactCompilerFingerprint(),
			blockSourceFingerprint: function (file) {
				var draft = frontendDraftForFile(currentActiveRequest(), file);
				return draft === null ? fileFingerprint(file) : "draft:" + sha256Hex(draft);
			},
			readBlockArtifact: function (key, fingerprint) {
				return readRuntimeMapCache(runtimeState.caches.blockArtifacts, key, fingerprint);
			},
			writeBlockArtifact: function (key, fingerprint, value) {
				return writeRuntimeMapCache(runtimeState.caches.blockArtifacts, key, fingerprint, value,
					"compiled Flow block artifacts");
			},
			createBlockMaterializationLock: function () { return new ReentrantLock(); },
			normalizeTree: normalizeTree,
			raise: raise,
			blockIdFromDescriptorFile: blockIdFromDescriptorFile,
			compileProjectBlockCode: compileProjectBlockCode,
			graphBlockFromDefinition: graphBlockFromDefinition,
			extractFlowScriptBlockMeta: extractFlowScriptBlockMeta,
			flowScriptBlockMetaFromRequest: flowScriptBlockMetaFromRequest,
			blockCodeRuntimeFromMeta: blockCodeRuntimeFromMeta,
			flowScriptBlockDescriptorFromMeta: flowScriptBlockDescriptorFromMeta,
			graphBlockCatalog: graphBlockCatalog,
			validateGraphBlockSource: validateGraphBlockSource
		};
	}

	function loadFlowScriptBlockFile(blocks, file, origin, provider, blocksDir) {
		return blockFileLoaderService().loadFlowScriptBlockFile(blocks, file, origin, provider, blocksDir, blockFileLoaderEnv());
	}

	function reserveFlowScriptBlockFile(blocks, file, origin, provider, blocksDir) {
		return blockFileLoaderService().reserveFlowScriptBlockFile(blocks, file, origin, provider, blocksDir, blockFileLoaderEnv());
	}

	function materializeFlowScriptBlock(blocks, name, runtime) {
		return blockFileLoaderService().materializeFlowScriptBlock(blocks, name, runtime);
	}

	function reserveGraphBlockFile(blocks, file, origin, provider, blocksDir) {
		return blockFileLoaderService().reserveGraphBlockFile(blocks, file, origin, provider, blocksDir, blockFileLoaderEnv());
	}

	function escapeRegExp(text) {
		return blockCodeSourceService().escapeRegExp(text);
	}

	function renameBlockImplementationSource(source, fromName, toName) {
		return blockCodeSourceService().renameBlockImplementationSource(source, fromName, toName);
	}

	function renameFlowScriptFunctionSource(source, fromName, toName) {
		return blockCodeSourceService().renameFlowScriptFunctionSource(source, fromName, toName, blockCodeSourceEnv());
	}

	function duplicateBlockCodeSource(source, fromName, toName, hasHooks) {
		return blockCodeSourceService().duplicateBlockCodeSource(source, fromName, toName, hasHooks, blockCodeSourceEnv());
	}

	function blockAuthoringService() {
		return loadEngineModule("block-authoring-service.js");
	}

	function blockAuthoringEnv() {
		return {
			File: File,
			FileUtils: FileUtils,
			normalizeTree: normalizeTree,
			parseYamlSource: parseYamlSource,
			raise: raise,
			blockImplementation: blockImplementation,
			blockFlowFileName: blockFlowFileName,
			blockFileName: blockFileName,
			blockHooksFileName: blockHooksFileName,
			blockLocalName: blockLocalName,
			projectBlockDescriptorFile: projectBlockDescriptorFile,
			projectBlockCodeFile: projectBlockCodeFile,
			projectBlocksDir: projectBlocksDir,
			projectDir: projectDir,
			validateGraphBlockDefinition: validateGraphBlockDefinition,
			graphBlockDefinitionForWrite: graphBlockDefinitionForWrite,
			validateBlockFlowImplementationSource: validateBlockFlowImplementationSource,
			flowScriptBlockCodeSource: flowScriptBlockCodeSource,
			sourceFromDefinition: sourceFromDefinition,
			validateBlockImplementationSource: validateBlockImplementationSource,
			enforceRhinoImplementationPolicy: enforceRhinoImplementationPolicy,
			rhinoBlockCodeSource: rhinoBlockCodeSource,
			validateBlockHooksSource: validateBlockHooksSource,
			compileProjectBlockCode: compileProjectBlockCode,
			publicBlockDescriptor: publicBlockDescriptor,
			blockDescriptor: blockDescriptor,
			loadFlowScriptBlockFile: loadFlowScriptBlockFile,
			flowProviderName: flowProviderName,
			getBlockSource: getBlockSource,
			duplicateBlockCodeSource: duplicateBlockCodeSource
		};
	}

	function canonicalBlockDefinition(name, request) {
		return blockAuthoringService().canonicalBlockDefinition(name, request, blockAuthoringEnv());
	}

	function blockCodeMetaFromDefinition(definition) {
		return blockAuthoringService().blockCodeMetaFromDefinition(definition, blockAuthoringEnv());
	}

	function canonicalBlockCodeFromDefinitionSource(blocks, name, definition, implementationSource, request) {
		return blockAuthoringService().canonicalBlockCodeFromDefinitionSource(blocks, name, definition, implementationSource, request, blockAuthoringEnv());
	}

	function implementationTargetFile(descriptorFile, definition) {
		return blockAuthoringService().implementationTargetFile(descriptorFile, definition, blockAuthoringEnv());
	}

	function hooksTargetFile(descriptorFile, definition) {
		return blockAuthoringService().hooksTargetFile(descriptorFile, definition, blockAuthoringEnv());
	}

	function cleanupProjectBlockYamlFallback(name, descriptor) {
		return blockAuthoringService().cleanupProjectBlockYamlFallback(name, descriptor, blockAuthoringEnv());
	}

	function setProjectBlockCode(blocks, name, request) {
		var result = blockAuthoringService().setProjectBlockCode(blocks, name, request, blockAuthoringEnv());
		invalidateBlockCatalogCaches();
		return result;
	}

	function createProjectBlock(blocks, name, request, overwrite) {
		return blockAuthoringService().createProjectBlock(blocks, name, request, overwrite, blockAuthoringEnv());
	}

	function editProjectBlock(blocks, name, request) {
		return blockAuthoringService().editProjectBlock(blocks, name, request, blockAuthoringEnv());
	}

	function duplicateProjectBlock(blocks, fromName, toName, overwrite) {
		return blockAuthoringService().duplicateProjectBlock(blocks, fromName, toName, overwrite, blockAuthoringEnv());
	}

	function blockSourceService() {
		return loadEngineModule("block-source-service.js");
	}

	function blockSourceEnv() {
		return {
			File: File,
			FileUtils: FileUtils,
			normalizeTree: normalizeTree,
			validateGraphBlockSource: validateGraphBlockSource,
			blockDescriptor: blockDescriptor,
			blockImplementation: blockImplementation,
			summaryBlockDescriptor: summaryBlockDescriptor,
			compactBlockDescriptor: compactBlockDescriptor,
			sourceFromDefinition: sourceFromDefinition,
			sha256Hex: sha256Hex,
			raise: raise
		};
	}

	function publicBlockDescriptor(descriptor) {
		return blockSourceService().publicDescriptor(descriptor, blockSourceEnv());
	}

	function sourceLength(path) {
		return blockSourceService().sourceLength(path, blockSourceEnv());
	}

	function getBlockSource(blocks, name, args) {
		// Source inspection is an explicit request for one block. Keep catalog loading
		// descriptor-only, but materialize this block so canonical code and runtime
		// sources remain available to block-get/code-get authoring calls.
		materializeFlowScriptBlock(blocks, String(name || ""));
		return blockSourceService().getSource(blocks, name, args, blockSourceEnv());
	}

	function typeDescriptorService() {
		return loadEngineModule("type-descriptor-service.js");
	}

	function typeDescriptorEnv() {
		return {
			File: File,
			FileUtils: FileUtils,
			projectTypesDir: projectTypesDir,
			typeDescriptorFileName: typeDescriptorFileName,
			normalizeTree: normalizeTree,
			parseYamlSource: parseYamlSource,
			toYamlSource: toYamlSource,
			loadTypeDescriptorFile: loadTypeDescriptorFile,
			typeDescriptor: typeDescriptor,
			catalogTypes: catalogTypes,
			blockDescriptor: blockDescriptor,
			loadTypes: loadTypes,
			raise: raise
		};
	}

	function projectTypeDescriptorFile(name) {
		return typeDescriptorService().projectTypeDescriptorFile(name, typeDescriptorEnv());
	}

	function validateTypeDescriptorDefinition(name, definition) {
		return typeDescriptorService().validateDefinition(name, definition, typeDescriptorEnv());
	}

	function validateTypeDescriptorSource(name, source) {
		return typeDescriptorService().validateSource(name, source, typeDescriptorEnv());
	}

	function typeDescriptorSourceForWriteRequest(name, request) {
		return typeDescriptorService().sourceForWriteRequest(name, request, typeDescriptorEnv());
	}

	function createProjectType(types, name, request, overwrite) {
		return typeDescriptorService().createProjectType(types, name, request, overwrite, typeDescriptorEnv());
	}

	function getTypeSource(types, name) {
		return typeDescriptorService().getTypeSource(types, name, typeDescriptorEnv());
	}

	function typeList(blocks) {
		return typeDescriptorService().typeList(blocks, typeDescriptorEnv());
	}

	function flowStorageService() {
		return loadEngineModule("flow-storage-service.js");
	}

	function flowStorageEnv() {
		return {
			File: File,
			Arrays: Arrays,
			FileUtils: FileUtils,
			engineDir: engineDir,
			projectFlowsDir: projectFlowsDir,
			projectFragmentsDir: projectFragmentsDir,
			flowFileName: flowFileName,
			flowCodeFileName: flowCodeFileName,
			fragmentFileName: fragmentFileName,
			parseYamlSource: parseYamlSource,
			raise: raise
		};
	}

	function projectFlowFile(name) {
		return flowStorageService().projectFlowCodeFile(name, flowStorageEnv());
	}

	function projectFlowCodeFile(name) {
		return flowStorageService().projectFlowCodeFile(name, flowStorageEnv());
	}

	function flowNameFromFile(file) {
		return flowStorageService().flowNameFromFile(file);
	}

	function projectFlowStorage(name) {
		return flowStorageService().projectFlowStorage(name, flowStorageEnv());
	}

	function projectFragmentFile(name) {
		return flowStorageService().projectFragmentFile(name, flowStorageEnv());
	}

	function fragmentCandidates(name) {
		return flowStorageService().fragmentCandidates(name, flowStorageEnv());
	}

	function fragmentFile(name) {
		return flowStorageService().fragmentFile(name, flowStorageEnv());
	}

	function readFragment(name) {
		return flowStorageService().readFragment(name, flowStorageEnv());
	}

	function listProjectFlows() {
		return flowStorageService().listProjectFlows(flowStorageEnv());
	}

	function listProjectFragments() {
		return flowStorageService().listProjectFragments(flowStorageEnv());
	}

	function flowRepositoryService() {
		return loadEngineModule("flow-repository-service.js");
	}

	function flowRepositoryEnv() {
		return {
			File: File,
			Arrays: Arrays,
			FileUtils: FileUtils,
			normalizeFlowScriptFunctionSyntax: normalizeFlowScriptFunctionSyntax,
			parseFlowScript: parseFlowScript,
			validateFlowScriptDefinition: validateFlowScriptDefinition,
			stripFlowScriptMetadata: stripFlowScriptMetadata,
			sourceFromDefinition: sourceFromDefinition,
			projectFlowStorage: projectFlowStorage,
			readProjectFlowWorkingCopy: readProjectFlowWorkingCopy,
			parseSource: parseSource,
			raise: raise,
			sha256Hex: sha256Hex,
			flowNameFromFile: flowNameFromFile,
			isSampleFlowName: isSampleFlowName,
			loadBlocks: loadBlocks,
			listProjectFlows: listProjectFlows,
			projectDir: projectDir,
			currentProjectName: currentProjectName,
			projectNameForRoot: projectNameForRoot,
			canonicalPath: canonicalPath,
			flowProjectRootFromFlowDir: flowProjectRootFromFlowDir,
			engineDir: engineDir,
			flowProviderName: flowProviderName,
			flowCodeFileName: flowCodeFileName,
			syncProjectFlowInputs: syncProjectFlowInputs
		};
	}

	function sourceFromFlowScript(blocks, name, code) {
		return flowRepositoryService().sourceFromFlowScript(blocks, name, code, flowRepositoryEnv());
	}

	function getProjectFlow(name) {
		var blocks = arguments.length > 1 ? arguments[1] : null;
		var request = arguments.length > 2 ? arguments[2] : null;
		return flowRepositoryService().getProjectFlow(name, blocks, request, flowRepositoryEnv());
	}

	function projectFlowBeanLookup(name, request) {
		var dir = projectDir();
		request = request || {};
		var projectName = currentProjectName(request);
		if (!projectName && dir) {
			projectName = projectNameForRoot(dir);
		}
		if (!projectName || !name) {
			return {
				flow: null,
				projectName: projectName || "",
				flowName: String(name || ""),
				reason: !projectName ? "missing-project-name" : "missing-flow-name"
			};
		}
		try {
			var engine = Packages.com.twinsoft.convertigo.engine.Engine;
			if (!engine.theApp || !engine.theApp.databaseObjectsManager) {
				return {
					flow: null,
					projectName: projectName,
					flowName: String(name),
					reason: "database-objects-manager-unavailable"
				};
			}
			var project = engine.theApp.databaseObjectsManager.getOriginalProjectByName(projectName, false);
			if (!project) {
				return {
					flow: null,
					projectName: projectName,
					flowName: String(name),
					reason: "project-not-found"
				};
			}
			var sequence = project.getSequenceByName(String(name));
			if (!sequence) {
				return {
					flow: null,
					projectName: projectName,
					flowName: String(name),
					reason: "sequence-not-found"
				};
			}
			var flowClass = Packages.java.lang.Class.forName("com.twinsoft.convertigo.beans.flow.Flow");
			if (!flowClass.isAssignableFrom(sequence.getClass())) {
				return {
					flow: null,
					projectName: projectName,
					flowName: String(name),
					reason: "sequence-is-not-flow"
				};
			}
			return {
				flow: sequence,
				projectName: projectName,
				flowName: String(name),
				reason: ""
			};
		} catch (e) {
			return {
				flow: null,
				projectName: projectName,
				flowName: String(name),
				reason: String(e && e.message || e)
			};
		}
	}

	function projectFlowBean(name, request) {
		return projectFlowBeanLookup(name, request).flow;
	}

	function syncProjectFlowInputs(name, inputDefinitions, args) {
		var lookup = projectFlowBeanLookup(name, args);
		var flow = lookup.flow;
		if (!flow || !inputDefinitions || typeof inputDefinitions !== "object") {
			return {
				synced: false,
				created: [],
				updated: [],
				projectName: lookup.projectName || "",
				flowName: lookup.flowName || String(name || ""),
				reason: lookup.reason || "invalid-input-definitions"
			};
		}
		var RequestableVariable = Packages.com.twinsoft.convertigo.beans.variables.RequestableVariable;
		var RequestableMultiValuedVariable = Packages.com.twinsoft.convertigo.beans.variables.RequestableMultiValuedVariable;
		var created = [];
		var updated = [];
		function sameValue(left, right) {
			if (left === right) {
				return true;
			}
			if (left === null || left === undefined || right === null || right === undefined) {
				return left === right;
			}
			return String(left) === String(right);
		}
		function setStringIfChanged(variable, getter, setter, value) {
			if (value === undefined || value === null) {
				return false;
			}
			var next = String(value);
			var current = variable[getter] ? variable[getter]() : "";
			if (sameValue(current, next)) {
				return false;
			}
			variable[setter](next);
			return true;
		}
		function setBooleanIfChanged(variable, getter, setter, value) {
			if (value === undefined || value === null) {
				return false;
			}
			var next = Boolean(value);
			var current = variable[getter] ? Boolean(variable[getter]()) : false;
			if (current === next) {
				return false;
			}
			variable[setter](next);
			return true;
		}
		function setDefaultIfChanged(variable, value) {
			if (value === undefined) {
				return false;
			}
			var next = value === null ? null : value;
			var current = variable.getValueOrNull ? variable.getValueOrNull() : undefined;
			if (sameValue(current, next)) {
				return false;
			}
			variable.setValueOrNull(next);
			return true;
		}
		var keys = Object.keys(inputDefinitions).filter(function (key) {
			return !!String(key || "").match(/^[A-Za-z_$][\w$]*$/) && String(key).indexOf("__") !== 0;
		}).sort();
		keys.forEach(function (key) {
			var definition = normalizeTree(inputDefinitions[key] || {});
			var type = String(definition.type || definition.kind || "string").toLowerCase();
			var existing = flow.getVariable(key);
			var variable = existing;
			var changed = false;
			if (!variable) {
				variable = type === "array" || definition.multi === true || definition.multiValued === true
					? new RequestableMultiValuedVariable()
					: new RequestableVariable();
				variable.setName(key);
				changed = true;
			}
			if (definition.description !== undefined && definition.description !== null && String(definition.description) !== "") {
				changed = setStringIfChanged(variable, "getDescription", "setDescription", definition.description) || changed;
			} else if (!existing) {
				variable.setDescription("Flow input " + key);
			}
			changed = setDefaultIfChanged(variable, definition.default) || changed;
			changed = setBooleanIfChanged(variable, "isRequired", "setRequired", definition.required) || changed;
			if (variable.setSchemaType) {
				changed = setStringIfChanged(variable, "getSchemaType", "setSchemaType", flowInputSchemaType(type)) || changed;
			}
			if (!existing) {
				flow.addVariable(variable);
				created.push(key);
			} else if (changed) {
				updated.push(key);
			}
		});
		if (created.length || updated.length) {
			flow.changed();
		}
		return {
			synced: true,
			created: created,
			updated: updated,
			projectName: lookup.projectName || "",
			flowName: lookup.flowName || String(name || "")
		};
	}

	function flowInputSchemaType(type) {
		switch (String(type || "").toLowerCase()) {
		case "boolean":
		case "bool":
			return "xsd:boolean";
		case "integer":
		case "int":
			return "xsd:integer";
		case "number":
		case "double":
		case "float":
			return "xsd:double";
		default:
			return "xsd:string";
		}
	}

	function flowInputDefinitionsFromDefinition(definition) {
		definition = definition || {};
		var meta = definition.flow || definition._flow || {};
		var inputs = meta.inputs || meta.input || definition.inputs || definition.input || {};
		return inputs && typeof inputs === "object" ? normalizeTree(inputs) : {};
	}

	function flowInputDefinitionsFromFlowScriptMetadata(meta) {
		meta = meta || {};
		var inputs = meta.inputs || meta.input || {};
		return inputs && typeof inputs === "object" ? normalizeTree(inputs) : {};
	}

	function syncProjectFlowInputsRequest(request, blocks) {
		request = request || {};
		var name = String(request.name || request.flowName || "");
		if (!name && request.flowQName) {
			var parts = String(request.flowQName).split(".");
			name = parts[parts.length - 1];
		}
		var flowSource = String(request.flowSource || "");
		var flowMetadata = isFlowScriptSource(flowSource)
			? parseFlowScriptTopLevelObjectFromCode(flowSource, "flow")
			: null;
		var declaredMetadata = flowMetadata !== null;
		var inputDefinitions = flowInputDefinitionsFromFlowScriptMetadata(flowMetadata);
		if (!declaredMetadata && !Object.keys(inputDefinitions).length) {
			var definition = parseSource(sourceForFlowRequest(request, blocks || loadBlocks()));
			inputDefinitions = flowInputDefinitionsFromDefinition(definition);
		}
		var inputSync = Object.keys(inputDefinitions).length
			? syncProjectFlowInputs(name, inputDefinitions, request)
			: { synced: false, created: [], updated: [] };
		return {
			ok: true,
			flowName: name,
			projectName: currentProjectName(request),
			projectDir: String(projectDir() || ""),
			metadataOnly: declaredMetadata,
			inputDefinitions: inputDefinitions,
			inputSync: inputSync
		};
	}

	function readProjectFlowWorkingCode(name, draftOnly) {
		var flow = projectFlowBean(name);
		if (!flow || (draftOnly === true && !flow.isFlowSourceDirty())) {
			return null;
		}
		var file = flow.getFlowSourceFile();
		var code = String(flow.getFlowSource());
		return {
			name: String(name),
			format: "flowscript",
			file: file ? String(file.getAbsolutePath()) : "",
			codeFile: file ? String(file.getAbsolutePath()) : "",
			code: code,
			revision: sha256Hex(code),
			dirty: Boolean(flow.isFlowSourceDirty()),
			draft: Boolean(flow.isFlowSourceDirty())
		};
	}

	function readProjectFlowWorkingCopy(name, blocks, draftOnly) {
		var working = readProjectFlowWorkingCode(name, draftOnly);
		if (!working) {
			return null;
		}
		var compiled = sourceFromFlowScript(blocks || loadBlocks(), name, working.code);
		return Object.assign({}, working, {
			sourceFile: "",
			source: compiled.source,
			definition: compiled.definition,
			diagnostics: compiled.diagnostics
		});
	}

	function writeProjectFlowWorkingCode(name, code, args) {
		var flow = projectFlowBean(name);
		if (!flow) {
			return null;
		}
		code = normalizeFlowScriptCode(stripFlowScriptMirrorHeader(String(code || "")));
		flow.setFlowSource(code);
		if (args && (args.official === true || args.promote === true || args.save === true)) {
			flow.saveFlowSourceFile();
		}
		return readProjectFlowWorkingCode(name, false);
	}

	function writeProjectFlowWorkingCopy(blocks, name, source, args) {
		var flow = projectFlowBean(name);
		if (!flow) {
			return null;
		}
		var code = flowScriptMirrorCode(blocks || loadBlocks(), name, source, args || {});
		return writeProjectFlowWorkingCode(name, code, args);
	}

	function discardProjectFlowWorkingCopy(name) {
		var flow = projectFlowBean(name);
		if (!flow || !flow.isFlowSourceDirty()) {
			return false;
		}
		flow.discardFlowSource();
		return true;
	}

	function listFlowsFromRoot(root, projectName, origin, samplesOnly) {
		return flowRepositoryService().listFlowsFromRoot(root, projectName, origin, samplesOnly, flowRepositoryEnv());
	}

	function visibleSearchFlows(request) {
		return flowRepositoryService().visibleSearchFlows(request, flowRepositoryEnv());
	}

	function sourceFromDefinition(definition) {
		var normalized = canonicalFlowDefinition(definition || {});
		if (normalized.version === undefined || normalized.version === null) {
			normalized.version = 1;
		}
		if (!normalized.nodes && !normalized.contracts && !normalized.bindings && !normalized.input && !normalized.output && !normalized.outputs) {
			normalized.nodes = [];
		}
		return toYamlSource(normalized);
	}

	function flowScriptRendererService() {
		return loadEngineModule("flow-script-renderer-service.js");
	}

	function flowScriptRendererEnv() {
		return {
			File: File,
			FileUtils: FileUtils,
			normalizeTree: normalizeTree,
			flowScriptPropKind: flowScriptPropKind,
			blockName: blockName,
			childSlotNamesForMutation: childSlotNamesForMutation,
			parseSource: parseSource,
			analyzeFlowDefinition: analyzeFlowDefinition,
			safeIdentifier: safeIdentifier,
			normalizeFlowScriptFunctionSyntax: normalizeFlowScriptFunctionSyntax,
			projectFlowCodeFile: projectFlowCodeFile,
			flowCodeFileFromYamlFile: flowCodeFileFromYamlFile,
			sourceForWriteRequest: sourceForWriteRequest,
			sha256Hex: sha256Hex,
			sourceFromDefinition: sourceFromDefinition,
			flowScriptValidateRequest: flowScriptValidateRequest,
			blocksWithFlowHelpers: blocksWithFlowHelpers
		};
	}

	function flowScriptString(value) {
		return flowScriptRendererService().flowScriptString(value, flowScriptRendererEnv());
	}

	function flowScriptInlineValue(value) {
		return flowScriptRendererService().flowScriptInlineValue(value, flowScriptRendererEnv());
	}

	function flowScriptLocalName(path) {
		return flowScriptRendererService().flowScriptLocalName(path);
	}

	function flowScriptScopeAssignmentPath(path) {
		return flowScriptRendererService().flowScriptScopeAssignmentPath(path);
	}

	function renderFlowScriptExpression(expr, locals) {
		return flowScriptRendererService().renderFlowScriptExpression(expr, locals, flowScriptRendererEnv());
	}

	function renderFlowScriptTemplate(text, locals) {
		return flowScriptRendererService().renderFlowScriptTemplate(text, locals, flowScriptRendererEnv());
	}

	function flowScriptTemplateLiteralPart(text) {
		return flowScriptRendererService().flowScriptTemplateLiteralPart(text);
	}

	function renderFlowScriptTemplateLiteral(text, locals) {
		return flowScriptRendererService().renderFlowScriptTemplateLiteral(text, locals, flowScriptRendererEnv());
	}

	function renderFlowScriptValue(blocks, node, key, value, locals) {
		return flowScriptRendererService().renderFlowScriptValue(blocks, node, key, value, locals, flowScriptRendererEnv());
	}

	function flowScriptArgKeys(node, slotNames) {
		return flowScriptRendererService().flowScriptArgKeys(node, slotNames);
	}

	function flowScriptSlotNames(blocks, node) {
		return flowScriptRendererService().flowScriptSlotNames(blocks, node, flowScriptRendererEnv());
	}

	function defaultFlowScriptSlot(blocks, node) {
		return flowScriptRendererService().defaultFlowScriptSlot(blocks, node, flowScriptRendererEnv());
	}

	function flowScriptCallLine(blocks, node, indent, locals) {
		return flowScriptRendererService().flowScriptCallLine(blocks, node, indent, locals, flowScriptRendererEnv());
	}

	function flowScriptHasTopLevelReturn(nodes) {
		return flowScriptRendererService().flowScriptHasTopLevelReturn(nodes, flowScriptRendererEnv());
	}

	function renderFlowScriptNodes(blocks, nodes, depth, lines, locals) {
		return flowScriptRendererService().renderFlowScriptNodes(blocks, nodes, depth, lines, locals, flowScriptRendererEnv());
	}

	function renderFlowScript(blocks, name, flowSource, request) {
		return flowScriptRendererService().renderFlowScript(blocks, name, flowSource, request, flowScriptRendererEnv());
	}

	function normalizeFlowScriptCode(code) {
		return flowScriptRendererService().normalizeFlowScriptCode(code, flowScriptRendererEnv());
	}

	function stripFlowScriptMirrorHeader(code) {
		return flowScriptRendererService().stripFlowScriptMirrorHeader(code);
	}

	function flowScriptMirrorCode(blocks, name, source, args) {
		return flowScriptRendererService().flowScriptMirrorCode(blocks, name, source, args, flowScriptRendererEnv());
	}

	function writeProjectFlowCodeMirror(blocks, name, source, args) {
		return flowScriptRendererService().writeProjectFlowCodeMirror(blocks, name, source, args, flowScriptRendererEnv());
	}

	function writeProjectFlowCodeCanonical(blocks, name, source, args) {
		return flowScriptRendererService().writeProjectFlowCodeCanonical(blocks, name, source, args, flowScriptRendererEnv());
	}

	function writeFlowCodeMirrorFile(blocks, name, source, file, args) {
		return flowScriptRendererService().writeFlowCodeMirrorFile(blocks, name, source, file, args, flowScriptRendererEnv());
	}

	function writeFlowCodeMirrorRequest(request, blocks) {
		return flowScriptRendererService().writeFlowCodeMirrorRequest(request, blocks, flowScriptRendererEnv());
	}

	function flowScriptCodeFromMirror(blocks, name, source, request) {
		return flowScriptRendererService().flowScriptCodeFromMirror(blocks, name, source, request, flowScriptRendererEnv());
	}

	function flowScriptParserService() {
		return loadEngineModule("flow-script-parser-service.js");
	}

	function flowScriptParserEnv() {
		return {
			parseYamlSource: parseYamlSource,
			normalizeTree: normalizeTree,
			raise: raise,
			isScopePath: isScopePath,
			objectPathParts: objectPathParts,
			blockCatalog: blockCatalog,
			safeIdentifier: safeIdentifier,
			blockLocalName: blockLocalName,
			balancedObjectEnd: balancedObjectEnd,
			canonicalFlowDefinition: canonicalFlowDefinition,
			normalizeFlowScriptFunctionSyntax: normalizeFlowScriptFunctionSyntax
		};
	}

	function parseFlowScriptArgs(text, lineNumber) {
		return flowScriptParserService().parseFlowScriptArgs(text, lineNumber, flowScriptParserEnv());
	}

	function stripFlowScriptComment(line) {
		return flowScriptParserService().stripFlowScriptComment(line, flowScriptParserEnv());
	}

	function addFlowScriptNode(target, node) {
		return flowScriptParserService().addFlowScriptNode(target, node, flowScriptParserEnv());
	}

	function flowScriptBalance(text) {
		return flowScriptParserService().flowScriptBalance(text, flowScriptParserEnv());
	}

	function flowScriptStatementComplete(text) {
		return flowScriptParserService().flowScriptStatementComplete(text, flowScriptParserEnv());
	}

	function flowScriptBalanceProblem(balance) {
		return flowScriptParserService().flowScriptBalanceProblem(balance, flowScriptParserEnv());
	}

	function flowScriptMissingClosers(balance) {
		return flowScriptParserService().flowScriptMissingClosers(balance, flowScriptParserEnv());
	}

	function flowScriptMissingGroupClosers(balance) {
		return flowScriptParserService().flowScriptMissingGroupClosers(balance, flowScriptParserEnv());
	}

	function flowScriptStatements(code) {
		return flowScriptParserService().flowScriptStatements(code, flowScriptParserEnv());
	}

	function stripFlowScriptSemicolon(text) {
		return flowScriptParserService().stripFlowScriptSemicolon(text, flowScriptParserEnv());
	}

	function splitFlowScriptTopLevel(text, separator) {
		return flowScriptParserService().splitFlowScriptTopLevel(text, separator, flowScriptParserEnv());
	}

	function isFlowScriptQuoted(text) {
		return flowScriptParserService().isFlowScriptQuoted(text, flowScriptParserEnv());
	}

	function isFlowScriptTemplateLiteral(text) {
		return flowScriptParserService().isFlowScriptTemplateLiteral(text, flowScriptParserEnv());
	}

	function unquoteFlowScriptString(text) {
		return flowScriptParserService().unquoteFlowScriptString(text, flowScriptParserEnv());
	}

	function isFlowScriptObjectLiteral(text) {
		return flowScriptParserService().isFlowScriptObjectLiteral(text, flowScriptParserEnv());
	}

	function isFlowScriptArrayLiteral(text) {
		return flowScriptParserService().isFlowScriptArrayLiteral(text, flowScriptParserEnv());
	}

	function parseFlowScriptObjectLiteral(text, lineNumber) {
		return flowScriptParserService().parseFlowScriptObjectLiteral(text, lineNumber, flowScriptParserEnv());
	}

	function flowScriptPropKind(blocks, block, key) {
		return flowScriptParserService().flowScriptPropKind(blocks, block, key, flowScriptParserEnv());
	}

	function flowScriptRewriteExpression(expr, locals) {
		return flowScriptParserService().flowScriptRewriteExpression(expr, locals, flowScriptParserEnv());
	}

	function flowScriptExpressionFromToken(token, locals) {
		return flowScriptParserService().flowScriptExpressionFromToken(token, locals, flowScriptParserEnv());
	}

	function flowScriptPathFromToken(token, locals) {
		return flowScriptParserService().flowScriptPathFromToken(token, locals, flowScriptParserEnv());
	}

	function flowScriptLiteralTokenValue(token, lineNumber) {
		return flowScriptParserService().flowScriptLiteralTokenValue(token, lineNumber, flowScriptParserEnv());
	}

	function flowScriptValueObjectFromToken(token, locals, lineNumber) {
		return flowScriptParserService().flowScriptValueObjectFromToken(token, locals, lineNumber, flowScriptParserEnv());
	}

	function flowScriptValueArrayFromToken(token, locals, lineNumber) {
		return flowScriptParserService().flowScriptValueArrayFromToken(token, locals, lineNumber, flowScriptParserEnv());
	}

	function flowScriptTemplateLiteralToTemplate(token, locals, lineNumber) {
		return flowScriptParserService().flowScriptTemplateLiteralToTemplate(token, locals, lineNumber, flowScriptParserEnv());
	}

	function flowScriptRewriteTemplateText(text, locals) {
		return flowScriptParserService().flowScriptRewriteTemplateText(text, locals, flowScriptParserEnv());
	}

	function flowScriptValueFromToken(token, locals, lineNumber) {
		return flowScriptParserService().flowScriptValueFromToken(token, locals, lineNumber, flowScriptParserEnv());
	}

	function normalizeNaturalFlowScriptProps(blocks, block, parsed, locals, lineNumber) {
		return flowScriptParserService().normalizeNaturalFlowScriptProps(blocks, block, parsed, locals, lineNumber, flowScriptParserEnv());
	}

	function parseNaturalFlowScriptCall(text) {
		return flowScriptParserService().parseNaturalFlowScriptCall(text, flowScriptParserEnv());
	}

	function parseNaturalFlowScriptCallWithBody(text) {
		return flowScriptParserService().parseNaturalFlowScriptCallWithBody(text, flowScriptParserEnv());
	}

	function capitalizedIdentifier(value) {
		return flowScriptParserService().capitalizedIdentifier(value, flowScriptParserEnv());
	}

	function naturalFlowScriptObjectFields(text) {
		return flowScriptParserService().naturalFlowScriptObjectFields(text, flowScriptParserEnv());
	}

	function naturalFlowScriptJsonObjectNode(id, outPath, fields, locals, lineNumber) {
		return flowScriptParserService().naturalFlowScriptJsonObjectNode(id, outPath, fields, locals, lineNumber, flowScriptParserEnv());
	}

	function buildNaturalListMapBlockCallNodes(blocks, imports, varName, itemToken, callToken, locals, lineNumber) {
		return flowScriptParserService().buildNaturalListMapBlockCallNodes(blocks, imports, varName, itemToken, callToken, locals, lineNumber, flowScriptParserEnv());
	}

	function buildNaturalListMapObjectArgNodes(blocks, imports, varName, arg, locals, lineNumber) {
		return flowScriptParserService().buildNaturalListMapObjectArgNodes(blocks, imports, varName, arg, locals, lineNumber, flowScriptParserEnv());
	}

	function buildNaturalListMapNodes(blocks, imports, varName, args, locals, lineNumber) {
		return flowScriptParserService().buildNaturalListMapNodes(blocks, imports, varName, args, locals, lineNumber, flowScriptParserEnv());
	}

	function buildNaturalFlowScriptCall(blocks, imports, locals, varName, rhs, lineNumber) {
		return flowScriptParserService().buildNaturalFlowScriptCall(blocks, imports, locals, varName, rhs, lineNumber, flowScriptParserEnv());
	}

	function buildNaturalFlowScriptAssignment(blocks, imports, locals, varName, rhs, lineNumber) {
		return flowScriptParserService().buildNaturalFlowScriptAssignment(blocks, imports, locals, varName, rhs, lineNumber, flowScriptParserEnv());
	}

	function buildNaturalScopeAssignment(blocks, imports, locals, scopePath, rhs, lineNumber) {
		return flowScriptParserService().buildNaturalScopeAssignment(blocks, imports, locals, scopePath, rhs, lineNumber, flowScriptParserEnv());
	}

	function buildNaturalFlowScriptReturn(expr, locals, lineNumber) {
		return flowScriptParserService().buildNaturalFlowScriptReturn(expr, locals, lineNumber, flowScriptParserEnv());
	}

	function resolveFlowScriptName(name, imports) {
		return flowScriptParserService().resolveFlowScriptName(name, imports, flowScriptParserEnv());
	}

	function parseFlowScriptImport(line, lineNumber, imports) {
		return flowScriptParserService().parseFlowScriptImport(line, lineNumber, imports, flowScriptParserEnv());
	}

	function parseFlowScriptBodyNodes(blocks, imports, locals, body) {
		return flowScriptParserService().parseFlowScriptBodyNodes(blocks, imports, locals, body, flowScriptParserEnv());
	}

	function trackFlowScriptLocalWrite(locals, path) {
		return flowScriptParserService().trackFlowScriptLocalWrite(locals, path, flowScriptParserEnv());
	}

	function trackFlowScriptNodeWrites(locals, node) {
		return flowScriptParserService().trackFlowScriptNodeWrites(locals, node, flowScriptParserEnv());
	}

	function parseFlowScriptStatementsInto(blocks, imports, locals, root, statements) {
		return flowScriptParserService().parseFlowScriptStatementsInto(blocks, imports, locals, root, statements, flowScriptParserEnv());
	}

	function parseFlowScript(blocks, code) {
		return flowScriptParserService().parseFlowScript(blocks, code, flowScriptParserEnv());
	}

	function parseFlowScriptTopLevelObjectFromCode(code, name) {
		return flowScriptParserService().parseFlowScriptTopLevelObjectFromCode(code, name, flowScriptParserEnv());
	}

	function flowScriptIntentUtils() {
		return loadEngineModule("flowscript-intent-utils.js");
	}

	function flowScriptIntentEnv() {
		return {
			addUnique: addUnique,
			blockDescriptor: blockDescriptor,
			blockSignature: blockSignature,
			summaryPropertyDescriptor: summaryPropertyDescriptor
		};
	}

	function stripFlowScriptMetadata(value) {
		return flowScriptIntentUtils().stripMetadata(value);
	}

	function flowScriptBlockCandidates(blocks, wanted, limit) {
		return flowScriptIntentUtils().blockCandidates(blocks, wanted, limit, flowScriptIntentEnv());
	}

	function flowScriptBlockCandidateDecision(candidates) {
		return flowScriptIntentUtils().blockCandidateDecision(candidates, authoringSettings(), flowScriptIntentEnv());
	}

	function flowScriptPropertyCandidates(props, wanted, limit) {
		return flowScriptIntentUtils().propertyCandidates(props, wanted, limit, flowScriptIntentEnv());
	}

	function flowScriptValidationService() {
		return loadEngineModule("flow-script-validation-service.js");
	}

	function flowScriptValidationEnv() {
		return {
			normalizeTree: normalizeTree,
			addUnique: addUnique,
			joinPath: joinPath,
			isSchemaMetaKey: isSchemaMetaKey,
			schemaSimpleType: schemaSimpleType,
			schemaForSchemasPath: schemaForSchemasPath,
			blockName: blockName,
			blockCatalog: blockCatalog,
			flowScriptSlotNames: flowScriptSlotNames,
			flowScriptArgKeys: flowScriptArgKeys,
			flowScriptBlockCandidates: flowScriptBlockCandidates,
			flowScriptBlockCandidateDecision: flowScriptBlockCandidateDecision,
			flowScriptPropertyCandidates: flowScriptPropertyCandidates,
			tokenizeExpression: tokenizeExpression,
			exactTemplateExpression: exactTemplateExpression,
			sourceForFlowRequest: sourceForFlowRequest,
			renderFlowScript: renderFlowScript,
			parseFlowScript: parseFlowScript,
			blocksWithFlowHelpers: blocksWithFlowHelpers,
			stripFlowScriptMetadata: stripFlowScriptMetadata,
			sourceFromDefinition: sourceFromDefinition,
			analyzeFlowSource: analyzeFlowSource,
			sha256Hex: sha256Hex
		};
	}

	function validateFlowScriptDefinition(blocks, definition) {
		return flowScriptValidationService().validateDefinition(blocks, definition, flowScriptValidationEnv());
	}

	function flowScriptValidateRequest(blocks, request) {
		return flowScriptValidationService().validateRequest(blocks, request, flowScriptValidationEnv());
	}

	function flowScriptGetRequest(blocks, request) {
		request = request || {};
		var flow = getProjectFlow(request.name || request.flowName, blocks, request);
		var codeInfo = flow.format === "flowscript" ? {
			code: flow.code,
			file: flow.codeFile || flow.file,
			fromMirror: false,
			stale: false,
			canonical: true
		} : flowScriptCodeFromMirror(blocks, request.name || request.flowName || flow.name, flow.source, request);
		var code = codeInfo.code;
		var validation = flowScriptValidateRequest(blocks, Object.assign({}, request, { code: code }));
		return {
			ok: true,
			name: flow.name,
			format: flow.format || "yaml",
			canonical: codeInfo.canonical === true,
			file: flow.file,
			codeFile: codeInfo.file,
			codeFromMirror: codeInfo.fromMirror,
			codeMirrorStale: codeInfo.stale,
			revision: sha256Hex(code),
			code: code,
			sourceHash: sha256Hex(flow.source),
			diagnostics: validation.diagnostics,
			next: "Patch with flow-source-patch using revision=" + sha256Hex(code) + "."
		};
	}

	function flowScriptPatchRequest(blocks, request) {
		request = request || {};
		var name = request.name || request.flowName;
		if (!name) {
			raise("MISSING_FLOW_NAME", "flow-source-patch requires name.");
		}
		var current = flowScriptGetRequest(blocks, request);
		var expectedRevision = request.revision || request.baseRevision || request.baseHash;
		if (expectedRevision && String(expectedRevision) !== current.revision) {
			raise("FLOWSCRIPT_REVISION_MISMATCH", "FlowScript changed since it was read: " + name,
				null, "Call flow-source-get again and regenerate the patch from the new revision.");
		}
		var newCode = request.code !== undefined && request.code !== null
			? String(request.code)
			: applyUnifiedPatchText(current.code, request.patch || request.unifiedDiff || request.diff || "").content;
		var validation = flowScriptValidateRequest(blocks, Object.assign({}, request, { code: newCode }));
		if (!validation.ok) {
			var error = new Error("FlowScript validation failed.");
			error.code = "FLOWSCRIPT_VALIDATION_FAILED";
			error.details = validation.diagnostics;
			error.hint = "Fix the reported line diagnostics and retry with the same latest revision.";
			throw error;
		}
		var saved = request.dryRun === true
			? { ok: true, dryRun: true, source: validation.source, definition: validation.definition }
			: setProjectFlow(blocks, name, validation.source, Object.assign({}, request, { code: newCode }));
		return {
			ok: true,
			name: String(name),
			dryRun: request.dryRun === true,
			oldRevision: current.revision,
			newRevision: saved && saved.codeRevision ? saved.codeRevision : sha256Hex(newCode),
			codeFile: saved && saved.codeFile ? saved.codeFile : current.codeFile,
			code: newCode,
			source: validation.source,
			definition: validation.definition,
			diagnostics: validation.diagnostics,
			saved: saved
		};
	}

	function flowCodeService() {
		return loadEngineModule("flow-code-service.js");
	}

	function flowCodeServiceEnv() {
		return {
			FileUtils: FileUtils,
			raise: raise,
			normalizeFlowScriptFunctionSyntax: normalizeFlowScriptFunctionSyntax,
			currentProjectName: currentProjectName,
			renderFlowScript: renderFlowScript,
			sha256Hex: sha256Hex,
			flowScriptValidateRequest: flowScriptValidateRequest,
			readProjectFlowWorkingCode: readProjectFlowWorkingCode,
			writeProjectFlowWorkingCode: writeProjectFlowWorkingCode,
			discardProjectFlowWorkingCopy: discardProjectFlowWorkingCopy,
			projectFlowBean: projectFlowBean,
			projectFlowBeanLookup: projectFlowBeanLookup,
			flowScriptGetRequest: flowScriptGetRequest,
			normalizeFlowScriptCode: normalizeFlowScriptCode,
			stripFlowScriptMirrorHeader: stripFlowScriptMirrorHeader,
			setProjectFlow: setProjectFlow,
			syncProjectFlowInputs: syncProjectFlowInputs,
			applyUnifiedPatchText: applyUnifiedPatchText,
			getBlockSource: getBlockSource,
			setProjectBlockCode: setProjectBlockCode,
			flowScriptBlockMetaFromRequest: flowScriptBlockMetaFromRequest,
			flowScriptBlockCodeSource: flowScriptBlockCodeSource,
			flowScriptBlockCandidates: flowScriptBlockCandidates,
			flowScriptBlockCandidateDecision: flowScriptBlockCandidateDecision,
			listProjectFlows: listProjectFlows,
			runFlowRequest: runFlowRequest,
			analyzeFlowSource: analyzeFlowSource,
			normalizeTree: normalizeTree
		};
	}

	function flowCodeName(request) {
		return flowCodeService().flowCodeName(request, flowCodeServiceEnv());
	}

	function flowCodeNameFromCode(code) {
		return flowCodeService().flowCodeNameFromCode(code, flowCodeServiceEnv());
	}

	function flowCodeNameOptional(request, code, fallback) {
		return flowCodeService().flowCodeNameOptional(request, code, fallback, flowCodeServiceEnv());
	}

	function flowCodeQName(request, name) {
		return flowCodeService().flowCodeQName(request, name, flowCodeServiceEnv());
	}

	function flowCodeDryRun(request) {
		return flowCodeService().flowCodeDryRun(request, flowCodeServiceEnv());
	}

	function flowCodeDraftMode(request) {
		return flowCodeService().flowCodeDraftMode(request, flowCodeServiceEnv());
	}

	function flowCodeOfficialMode(request) {
		return flowCodeService().flowCodeOfficialMode(request, flowCodeServiceEnv());
	}

	function flowCodeMaxDiagnostics(request) {
		return flowCodeService().flowCodeMaxDiagnostics(request, flowCodeServiceEnv());
	}

	function flowCodeDiagnostics(diagnostics, severity) {
		return flowCodeService().flowCodeDiagnostics(diagnostics, severity, flowCodeServiceEnv());
	}

	function flowCodeDiagnosticReport(diagnostics, request, severity) {
		return flowCodeService().flowCodeDiagnosticReport(diagnostics, request, severity, flowCodeServiceEnv());
	}

	function flowCodeAddDiagnosticReport(out, diagnostics, request, severity) {
		return flowCodeService().flowCodeAddDiagnosticReport(out, diagnostics, request, severity, flowCodeServiceEnv());
	}

	function flowCodeParseDiagnostics(error) {
		return flowCodeService().flowCodeParseDiagnostics(error, flowCodeServiceEnv());
	}

	function flowCodeExceptionDetails(error, request) {
		return flowCodeService().flowCodeExceptionDetails(error, request, flowCodeServiceEnv());
	}

	function flowCodeError(code, message, hint, details) {
		return flowCodeService().flowCodeError(code, message, hint, details, flowCodeServiceEnv());
	}

	function flowCodeRevisionForSource(blocks, name, source, request) {
		return flowCodeService().flowCodeRevisionForSource(blocks, name, source, request, flowCodeServiceEnv());
	}

	function flowCodeValidate(blocks, request, name, code) {
		return flowCodeService().flowCodeValidate(blocks, request, name, code, flowCodeServiceEnv());
	}

	function flowCodeDraftRead(name) {
		return flowCodeService().flowCodeDraftRead(name, flowCodeServiceEnv());
	}

	function flowCodeCurrentForEdit(blocks, request, name, preferDraft) {
		return flowCodeService().flowCodeCurrentForEdit(blocks, request, name, preferDraft, flowCodeServiceEnv());
	}

	function flowCodeGetRequest(blocks, request) {
		return flowCodeService().flowCodeGetRequest(blocks, request, flowCodeServiceEnv());
	}

	function flowCodeOfficialRead(blocks, request, name) {
		return flowCodeService().flowCodeOfficialRead(blocks, request, name, flowCodeServiceEnv());
	}

	function flowCodeStatusRequest(blocks, request) {
		return flowCodeService().flowCodeStatusRequest(blocks, request, flowCodeServiceEnv());
	}

	function flowCodeDiscardRequest(blocks, request) {
		return flowCodeService().flowCodeDiscardRequest(blocks, request, flowCodeServiceEnv());
	}

	function flowCodeDraftSetRequest(blocks, request, name, code) {
		return flowCodeService().flowCodeDraftSetRequest(blocks, request, name, code, flowCodeServiceEnv());
	}

	function flowCodeSetRequest(blocks, request) {
		return flowCodeService().flowCodeSetRequest(blocks, request, flowCodeServiceEnv());
	}

	function flowCodePatchRequest(blocks, request) {
		return flowCodeService().flowCodePatchRequest(blocks, request, flowCodeServiceEnv());
	}

	function blockCodePatchRequest(blocks, request) {
		if (blockCodeTarget(request) === "frontend") {
			return frontendBlockCodePatchRequest(blocks, request);
		}
		return flowCodeService().blockCodePatchRequest(blocks, request, flowCodeServiceEnv());
	}

	function blockCodeGetRequest(blocks, request) {
		if (blockCodeTarget(request) === "frontend") {
			return frontendBlockCodeGetRequest(blocks, request);
		}
		return flowCodeService().blockCodeGetRequest(blocks, request, flowCodeServiceEnv());
	}

	function blockCodeTarget(request) {
		request = request || {};
		var target = String(request.target || request.implementationTarget || request.runtimeTarget || "backend").toLowerCase();
		return target === "browser" ? "frontend" : target;
	}

	function frontendBlockCodeError(code, message, hint) {
		return { code: code, message: message, hint: hint || "" };
	}

	function frontendBlockCodeInfo(blocks, request) {
		request = request || {};
		var name = String(request.name || request.block || "").trim();
		if (!name) {
			raise("MISSING_BLOCK_NAME", "Frontend block code requires name.");
		}
		// The canonical project source is authoritative for authoring. A catalog
		// snapshot may remain hot until the outer Rhino request completes.
		var descriptorFile = projectBlockCodeFile(name);
		var block;
		if (descriptorFile.isFile()) {
			var extracted = extractFlowScriptBlockMeta(String(FileUtils.readFileToString(descriptorFile, "UTF-8")));
			block = { origin: "project", codeFile: String(descriptorFile.getAbsolutePath()), descriptor: extracted.meta || {} };
		} else {
			block = getBlockSource(blocks, name, { detail: "full", includeMeta: true });
		}
		if (block.origin !== "project") {
			raise("BLOCK_NOT_PROJECT_EDITABLE", "Block " + name + " is not project-local.", null,
				"Duplicate the block into the target project before editing its browser implementation.");
		}
		var descriptor = normalizeTree(block.descriptor || {});
		var targets = descriptor.targets || ["backend"];
		var frontend = descriptor.implementations && descriptor.implementations.frontend || {};
		if (targets.indexOf("frontend") === -1 || !frontend.file) {
			raise("BLOCK_NOT_AVAILABLE_ON_TARGET", "Block " + name + " has no frontend implementation.", null,
				"Create it with flow-block-mock targets:[\"frontend\"] or add a declared frontend implementation first.");
		}
		descriptorFile = block.codeFile ? new File(String(block.codeFile)) : descriptorFile;
		var directory = descriptorFile.getParentFile().getCanonicalFile();
		var file = new File(directory, String(frontend.file)).getCanonicalFile();
		var directoryPath = String(directory.getCanonicalPath());
		var filePath = String(file.getCanonicalPath());
		if (filePath !== directoryPath && filePath.indexOf(directoryPath + File.separator) !== 0) {
			raise("FRONTEND_BLOCK_FILE_OUTSIDE_PROJECT", "Frontend implementation escapes its block directory: " + frontend.file);
		}
		return { name: name, block: block, descriptor: descriptor, targets: targets, frontend: frontend, file: file };
	}

	function frontendBlockCodeDiagnostics(info, source) {
		var diagnostics = [];
		if (info.descriptor.mock === true || (info.descriptor.tags || []).indexOf("mock") !== -1) {
			diagnostics.push({
				severity: "warning",
				code: "FRONTEND_BLOCK_MOCK_ACTIVE",
				message: "Frontend block " + info.name + " is still marked as a mock.",
				hint: "After replacing the placeholder, call code-set with target:\"frontend\", finalize:true."
			});
		}
		if (/TODO:\s*replace this explicit frontend mock/i.test(String(source || ""))) {
			diagnostics.push({
				severity: "warning",
				code: "FRONTEND_BLOCK_PLACEHOLDER_CODE",
				message: "Frontend block " + info.name + " still contains generated placeholder code.",
				hint: "Replace the TODO function before finalizing the block."
			});
		}
		return diagnostics;
	}

	function validateFrontendBlockCode(info, code) {
		code = String(code || "").trim();
		if (!code) {
			return { ok: false, diagnostics: [{ severity: "error", code: "MISSING_FRONTEND_BLOCK_CODE", message: "Frontend implementation code is required." }] };
		}
		if (/\b(?:Packages|java\.|javax\.|require\s*\(|process\.|Buffer\b)/.test(code)) {
			return { ok: false, diagnostics: [{
				severity: "error",
				code: "FRONTEND_BLOCK_RUNTIME_FORBIDDEN",
				message: "Frontend block code cannot use JVM or Node.js APIs.",
				hint: "Use a browser-compatible function of one JSON input object."
			}] };
		}
		try {
			var implementation = evalCompiledSource("(" + code + "\n)", "frontend-block:" + info.name, sha256Hex(code));
			if (typeof implementation !== "function") {
				return { ok: false, diagnostics: [{ severity: "error", code: "FRONTEND_BLOCK_FUNCTION_REQUIRED", message: "Frontend implementation must evaluate to one function." }] };
			}
		} catch (e) {
			return { ok: false, diagnostics: [{ severity: "error", code: "FRONTEND_BLOCK_SYNTAX_ERROR", message: String(e && e.message || e) }] };
		}
		return { ok: true, diagnostics: frontendBlockCodeDiagnostics(info, code) };
	}

	function finalizeFrontendBlockCode(info) {
		if (info.targets.length !== 1 || info.targets[0] !== "frontend") {
			return false;
		}
		var descriptorFile = info.block.codeFile ? new File(String(info.block.codeFile)) : projectBlockCodeFile(info.name);
		var source = String(FileUtils.readFileToString(descriptorFile, "UTF-8"));
		var extracted = extractFlowScriptBlockMeta(source);
		var meta = normalizeTree(extracted.meta || {});
		delete meta.mock;
		delete meta.todo;
		if (/^Generated Flow mock\./i.test(String(meta.longDescription || ""))) {
			delete meta.longDescription;
		}
		meta.tags = (meta.tags || []).filter(function (tag) {
			return String(tag).toLowerCase() !== "mock" && String(tag).toLowerCase() !== "todo";
		});
		FileUtils.writeStringToFile(descriptorFile,
			"const _meta = " + JSON.stringify(meta, null, 2) + "\n\n" + String(extracted.code || "").trim() + "\n", "UTF-8");
		return true;
	}

	function frontendBlockCodeGetRequest(blocks, request) {
		try {
			var info = frontendBlockCodeInfo(blocks, request);
			if (!info.file.isFile()) {
				return { ok: false, name: info.name, target: "frontend", error: frontendBlockCodeError("FRONTEND_BLOCK_FILE_MISSING",
					"Missing frontend implementation: " + info.frontend.file,
					"Create it with code-set target:\"frontend\"."), warnings: [] };
			}
			var code = String(FileUtils.readFileToString(info.file, "UTF-8"));
			var diagnostics = frontendBlockCodeDiagnostics(info, code);
			return { ok: true, name: info.name, block: info.name, target: "frontend", runtime: "browser", format: "browser-function",
				code: code, revision: sha256Hex(code), codeFile: String(info.file.getAbsolutePath()), descriptor: info.descriptor,
				diagnostics: diagnostics, warnings: diagnostics };
		} catch (e) {
			return { ok: false, name: String(request && (request.name || request.block) || ""), target: "frontend",
				error: frontendBlockCodeError(e.code || "FRONTEND_BLOCK_CODE_GET_FAILED", e.message || String(e), e.hint), warnings: [] };
		}
	}

	function frontendBlockCodeCheckRequest(blocks, request) {
		try {
			var info = frontendBlockCodeInfo(blocks, request);
			var code = request && request.code;
			if ((code === undefined || code === null) && info.file.isFile()) code = FileUtils.readFileToString(info.file, "UTF-8");
			var validation = validateFrontendBlockCode(info, code);
			return { ok: validation.ok, name: info.name, block: info.name, target: "frontend", runtime: "browser",
				revision: validation.ok ? sha256Hex(String(code)) : "", diagnostics: validation.diagnostics,
				warnings: validation.diagnostics.filter(function (item) { return item.severity === "warning"; }) };
		} catch (e) {
			return { ok: false, target: "frontend", error: frontendBlockCodeError(e.code || "FRONTEND_BLOCK_CODE_CHECK_FAILED", e.message || String(e), e.hint), warnings: [] };
		}
	}

	function frontendBlockCodeSetRequest(blocks, request) {
		request = request || {};
		try {
			var info = frontendBlockCodeInfo(blocks, request);
			var code = String(request.code || "");
			var validation = validateFrontendBlockCode(info, code);
			if (!validation.ok) return { ok: false, name: info.name, target: "frontend", diagnostics: validation.diagnostics, warnings: [] };
			var expected = request.revision || request.baseRevision || request.baseHash;
			var previous = info.file.isFile() ? String(FileUtils.readFileToString(info.file, "UTF-8")) : "";
			var oldRevision = previous ? sha256Hex(previous) : "";
			if (expected && String(expected) !== oldRevision) {
				return { ok: false, name: info.name, target: "frontend", revision: oldRevision,
					error: frontendBlockCodeError("BLOCK_CODE_REVISION_MISMATCH", "Frontend block changed since it was read.", "Call code-get again and retry with its revision."), warnings: [] };
			}
			var dry = request.dry === true || request.dryRun === true;
			var finalizeRequested = request.finalize === true || String(request.finalize || "") === "true";
			var finalized = false;
			if (!dry) {
				info.file.getParentFile().mkdirs();
				FileUtils.writeStringToFile(info.file, code.replace(/\s+$/g, "") + "\n", "UTF-8");
				if (finalizeRequested) finalized = finalizeFrontendBlockCode(info);
				invalidateBlockCatalogCaches();
			}
			var warnings = validation.diagnostics.filter(function (item) { return item.severity === "warning"; });
			var diagnostics = validation.diagnostics;
			if (finalized) {
				diagnostics = diagnostics.filter(function (item) {
					return item.code !== "FRONTEND_BLOCK_MOCK_ACTIVE" && item.code !== "FRONTEND_BLOCK_PLACEHOLDER_CODE";
				});
				warnings = diagnostics.filter(function (item) { return item.severity === "warning"; });
			}
			if (finalizeRequested && !dry && !finalized) {
				warnings.push({ severity: "warning", code: "FRONTEND_BLOCK_PARTIAL_FINALIZE",
					message: "The block also targets another runtime, so its shared mock marker was preserved.",
					hint: "Implement every target before removing mock:true from the canonical block contract." });
			}
			return { ok: true, name: info.name, block: info.name, target: "frontend", runtime: "browser", written: !dry,
				dry: dry, finalized: finalized, oldRevision: oldRevision,
				revision: sha256Hex(code.replace(/\s+$/g, "") + "\n"), codeFile: String(info.file.getAbsolutePath()), diagnostics: diagnostics, warnings: warnings };
		} catch (e) {
			return { ok: false, target: "frontend", error: frontendBlockCodeError(e.code || "FRONTEND_BLOCK_CODE_SET_FAILED", e.message || String(e), e.hint), warnings: [] };
		}
	}

	function frontendBlockCodePatchRequest(blocks, request) {
		var current = frontendBlockCodeGetRequest(blocks, request);
		if (!current.ok) return current;
		var expected = request.revision || request.baseRevision || request.baseHash;
		if (expected && String(expected) !== current.revision) {
			return { ok: false, name: current.name, target: "frontend", revision: current.revision,
				error: frontendBlockCodeError("BLOCK_CODE_REVISION_MISMATCH", "Frontend block changed since it was read.", "Call code-get again and regenerate the patch."), warnings: [] };
		}
		var code = request.code !== undefined && request.code !== null ? String(request.code)
			: applyUnifiedPatchText(current.code, request.codepatch || request.patch || request.unifiedDiff || request.diff || "").content;
		return frontendBlockCodeSetRequest(blocks, Object.assign({}, request, { code: code, revision: current.revision }));
	}

	function blockCodeSetRequest(blocks, request) {
		if (blockCodeTarget(request) === "frontend") return frontendBlockCodeSetRequest(blocks, request);
		return setProjectBlockCode(blocks, request.name || request.block, request);
	}

	function blockCodeCheckRequest(blocks, request) {
		if (blockCodeTarget(request) === "frontend") return frontendBlockCodeCheckRequest(blocks, request);
		return { ok: false, error: frontendBlockCodeError("BLOCK_CHECK_TARGET_REQUIRED", "Block code-check currently requires target:\"frontend\".",
			"Backend FlowScript blocks are validated by code-set dry:true or by an executable Flow."), warnings: [] };
	}

	function flowCodeRgExtract(code, matcher, context, limit) {
		return flowCodeService().flowCodeRgExtract(code, matcher, context, limit, flowCodeServiceEnv());
	}

	function codeRgMatcher(request, toolName) {
		return flowCodeService().codeRgMatcher(request, toolName, flowCodeServiceEnv());
	}

	function flowCodeRgMatcher(request) {
		return flowCodeService().flowCodeRgMatcher(request, flowCodeServiceEnv());
	}

	function flowCodeRgRequest(blocks, request) {
		return flowCodeService().flowCodeRgRequest(blocks, request, flowCodeServiceEnv());
	}

	function blockCodeRgTargets(blocks, request) {
		return flowCodeService().blockCodeRgTargets(blocks, request, flowCodeServiceEnv());
	}

	function blockCodeRgRequest(blocks, request) {
		return flowCodeService().blockCodeRgRequest(blocks, request, flowCodeServiceEnv());
	}

	function flowCodeCompileRequest(blocks, request, fallbackName) {
		return flowCodeService().flowCodeCompileRequest(blocks, request, fallbackName, flowCodeServiceEnv());
	}

	function flowCodeCheckRequest(blocks, request) {
		return flowCodeService().flowCodeCheckRequest(blocks, request, flowCodeServiceEnv());
	}

	function flowCodeRunRequest(blocks, request) {
		return flowCodeService().flowCodeRunRequest(blocks, request, flowCodeServiceEnv());
	}

	function flowCodeAnalyzeRequest(blocks, request) {
		return flowCodeService().flowCodeAnalyzeRequest(blocks, request, flowCodeServiceEnv());
	}

	function flowCodePromoteRequest(blocks, request) {
		return flowCodeService().flowCodePromoteRequest(blocks, request, flowCodeServiceEnv());
	}

	function blockCodeApi() {
		return {
			get: blockCodeGetRequest,
			set: blockCodeSetRequest,
			check: blockCodeCheckRequest,
			patch: blockCodePatchRequest,
			rg: blockCodeRgRequest
		};
	}

	function flowCodeApi() {
		return {
			get: flowCodeGetRequest,
			status: flowCodeStatusRequest,
			discard: flowCodeDiscardRequest,
			set: flowCodeSetRequest,
			patch: flowCodePatchRequest,
			check: flowCodeCheckRequest,
			rg: flowCodeRgRequest,
			run: flowCodeRunRequest,
			analyze: flowCodeAnalyzeRequest,
			promote: flowCodePromoteRequest
		};
	}

	function flowSourceService() {
		return loadEngineModule("flow-source-service.js");
	}

	function flowSourceServiceEnv() {
		return {
			FileUtils: FileUtils,
			sourceFromDefinition: sourceFromDefinition,
			normalizeFlowScriptFunctionSyntax: normalizeFlowScriptFunctionSyntax,
			sourceFromFlowScript: sourceFromFlowScript,
			loadBlocks: loadBlocks,
			projectDir: projectDir,
			getProjectFlow: getProjectFlow,
			parseSource: parseSource,
			analyzeFlowSource: analyzeFlowSource,
			projectFlowStorage: projectFlowStorage,
			writeProjectFlowCodeCanonical: writeProjectFlowCodeCanonical,
			writeProjectFlowWorkingCopy: writeProjectFlowWorkingCopy
		};
	}

	function sourceForWriteRequest(args, fallback) {
		return flowSourceService().sourceForWriteRequest(args, fallback, flowSourceServiceEnv());
	}

	function isFlowScriptSource(source) {
		return flowSourceService().isFlowScriptSource(source, flowSourceServiceEnv());
	}

	function sourceForMaybeFlowScript(blocks, args, source) {
		return flowSourceService().sourceForMaybeFlowScript(blocks, args, source, flowSourceServiceEnv());
	}

	function projectFlowSourceIfAvailable(blocks, args) {
		return flowSourceService().projectFlowSourceIfAvailable(blocks, args, flowSourceServiceEnv());
	}

	function setProjectFlow(blocks, name, source, args) {
		return flowSourceService().setProjectFlow(blocks, name, source, args, flowSourceServiceEnv());
	}

	function sourceForFlowRequest(args, blocks) {
		return flowSourceService().sourceForFlowRequest(args, blocks, flowSourceServiceEnv());
	}

	function outputSchemaForFlowSource(flowSource) {
		return flowSourceService().outputSchemaForFlowSource(flowSource, flowSourceServiceEnv());
	}

	function objectSchema(schema) {
		return schemaUtils().object(schema, schemaUtilsEnv());
	}

	function flowOutputSchema(name) {
		var flow = getProjectFlow(name, loadBlocks());
		var definition = parseSource(flow.source);
		return objectSchema(declaredOutputSchema(definition) || readResultSchema({ flowName: name }, definition) || {});
	}

	function outputPathsForFlow(name) {
		return schemaPaths(flowOutputSchema(name), "");
	}

	function currentProjectName(request) {
		request = request || {};
		if (request.project) {
			return String(request.project);
		}
		if (request.context && request.context.project) {
			return String(request.context.project);
		}
		if (request.flowQName) {
			return String(request.flowQName).split(".")[0];
		}
		return "";
	}

	function projectNameForRoot(root) {
		if (!root) {
			return "";
		}
		root = new File(root);
		try {
			var descriptor = new File(root, "c8oProject.yaml");
			if (descriptor.isFile()) {
				var source = String(FileUtils.readFileToString(descriptor, "UTF-8"));
				var match = source.match(/^\s*\u2193([A-Za-z0-9_.-]+)\s+\[core\.Project\]\s*:/m);
				if (match) {
					return String(match[1]);
				}
			}
		} catch (e) {
		}
		var current = projectDir();
		var requested = currentProjectName(currentActiveRequest());
		if (requested && current && canonicalPath(root) === canonicalPath(current)) {
			return requested;
		}
		return String(root.getName() || "");
	}

	function requestableService() {
		return loadEngineModule("requestable-service.js");
	}

	function requestableServiceEnv() {
		return {
			File: File,
			mergeSchema: mergeSchema,
			projectDir: projectDir,
			withProjectDir: withProjectDir,
			loadBlocks: loadBlocks,
			parseSource: parseSource,
			sourceForFlowRequest: sourceForFlowRequest,
			declaredOutputSchema: declaredOutputSchema,
			readResultSchema: readResultSchema,
			objectSchema: objectSchema,
			readObjectPath: readObjectPath,
			unwrapDocumentSchema: unwrapDocumentSchema,
			inferSchema: inferSchema,
			schemaPaths: schemaPaths,
			schemaArrayPaths: schemaArrayPaths,
			schemaLeafEntries: schemaLeafEntries,
			objectPathParts: objectPathParts,
			flowScriptPath: scopePathUtils().flowScriptPath,
			currentProjectName: currentProjectName,
			projectNameForRoot: projectNameForRoot,
			flowCodeError: flowCodeError,
			raise: raise,
			context: typeof context === "undefined" ? null : context
		};
	}

	function requestableOutputSchema(target) {
		return requestableService().outputSchema(target, requestableServiceEnv());
	}

	function requestableInputContract(target, request) {
		request = Object.assign({}, request || currentActiveRequest() || {});
		if (!currentProjectName(request)) {
			request.project = projectNameForRoot(projectDir());
		}
		return requestableService().inputContract(request, target, requestableServiceEnv());
	}

	function requestableTargetQName(target) {
		return requestableService().targetQName(target);
	}

	function requestableTargetPublic(target, currentProject) {
		return requestableService().targetPublic(target, currentProject);
	}

	function requestableListRequest(request) {
		return requestableService().list(request, requestableServiceEnv());
	}

	function requestableSchemaRequest(request) {
		return requestableService().schema(request, requestableServiceEnv());
	}

	function requestableApi() {
		return {
			list: requestableListRequest,
			schema: requestableSchemaRequest
		};
	}

	function requestableSampleOutput(target, input) {
		return requestableService().sampleOutput(target, input, requestableServiceEnv());
	}

	function blockName(node) {
		return node.block || node.type || "";
	}

	function blockCatalog(block) {
		return block && typeof block.catalog === "function" ? block.catalog() : {};
	}

	function graphBlockStackLabel(stack) {
		return (stack || []).map(function (name) {
			return String(name || "");
		}).filter(function (name) {
			return name !== "";
		}).join(" -> ");
	}

	function fragmentNameForNode(node) {
		var props = nodeProps(node);
		return String(props.fragment || props.name || props.ref || "").trim();
	}

	function expandNodeSlotNames(blocks, node) {
		var names = [];
		var catalog = blockCatalog(blocks && blocks[blockName(node)]);
		slotDefinitions(catalog).forEach(function (definition) {
			addUnique(names, definition.name);
			(definition.aliases || []).forEach(function (alias) {
				addUnique(names, alias);
			});
		});
		["nodes", "do", "then", "else", "catch", "finally"].forEach(function (name) {
			addUnique(names, name);
		});
		return names;
	}

	function expandFragmentNodes(blocks, nodes, stack, options) {
		stack = stack || [];
		options = options || {};
		return (nodes || []).map(function (sourceNode) {
			var node = normalizeTree(sourceNode || {});
			if (blockName(node) === "fragment.use") {
				var fragmentName = fragmentNameForNode(node);
				if (!fragmentName) {
					raise("MISSING_FRAGMENT_NAME", "fragment.use requires a fragment name.", node);
				}
				var fragmentKey = "fragment:" + fragmentName;
				if (stack.indexOf(fragmentKey) !== -1) {
					raise("RECURSIVE_FRAGMENT", "Recursive Flow fragment: " + stack.concat([fragmentKey]).join(" -> "), node);
				}
				var fragment = readFragment(fragmentName);
				node.__fragment = {
					name: fragment.name,
					file: fragment.file
				};
				node.nodes = expandFragmentNodes(blocks, fragment.definition.nodes || [], stack.concat([fragmentKey]), options);
				return node;
			}
			var block = blocks && blocks[blockName(node)];
			if (options.expandGraphBlocks === true && block && block.__graphDefinition) {
				var blockKey = "block:" + block.name;
				if (stack.indexOf(blockKey) !== -1) {
					raise("RECURSIVE_GRAPH_BLOCK", "Recursive composite Flow block: " + stack.concat([blockKey]).join(" -> "), node);
				}
				node.__graphBlock = {
					name: block.name,
					file: String(block.__flowImplementationFile || block.__flowFile || "")
				};
				node.nodes = expandFragmentNodes(blocks, block.__graphDefinition.nodes || [], stack.concat([blockKey]), options);
				return node;
			}
			expandNodeSlotNames(blocks, node).forEach(function (slotName) {
				if (node[slotName] && Object.prototype.toString.call(node[slotName]) === "[object Array]") {
					node[slotName] = expandFragmentNodes(blocks, node[slotName], stack, options);
				}
			});
			return node;
		});
	}

	function expandFlowDefinition(blocks, definition) {
		var out = normalizeTree(definition || {});
		out.nodes = expandFragmentNodes(blocks, out.nodes || [], []);
		return out;
	}

	function safeIconName(name) {
		return String(name || "").replace(/[^A-Za-z0-9_.-]/g, "_");
	}

	function sha256Hex(text) {
		try {
			var digest = Packages.java.security.MessageDigest.getInstance("SHA-256")
				.digest(new JavaString(String(text || "")).getBytes("UTF-8"));
			var out = "";
			for (var i = 0; i < digest.length; i++) {
				var value = digest[i];
				if (value < 0) {
					value += 256;
				}
				var hex = value.toString(16);
				out += hex.length === 1 ? "0" + hex : hex;
			}
			return out;
		} catch (e) {
			return safeIconName(text).substring(0, 64) || "icon";
		}
	}

	function sha256FileHex(file) {
		var digest = Packages.java.security.MessageDigest.getInstance("SHA-256")
			.digest(FileUtils.readFileToByteArray(file));
		var out = "";
		for (var i = 0; i < digest.length; i++) {
			var value = digest[i];
			if (value < 0) {
				value += 256;
			}
			var hex = value.toString(16);
			out += hex.length === 1 ? "0" + hex : hex;
		}
		return out;
	}

	function iconService() {
		if (!iconServiceModule) {
			iconServiceModule = loadEngineModule("icon-service.js");
		}
		return iconServiceModule;
	}

	function iconServiceEnv() {
		return {
			File: File,
			Arrays: Arrays,
			FileUtils: FileUtils,
			Base64: Base64,
			canonicalPath: canonicalPath,
			engineDir: engineDir,
			projectDir: projectDir,
			sha256Hex: sha256Hex
		};
	}

	function resolveBlockIcon(block, descriptor) {
		return iconService().resolveBlockIcon(block, descriptor, iconServiceEnv());
	}

	function iconCatalogRequest(request) {
		return iconService().iconCatalogRequest(request, iconServiceEnv());
	}

	function flowRuntimeService() {
		if (!flowRuntimeServiceModule) {
			flowRuntimeServiceModule = loadEngineModule("flow-runtime-service.js");
		}
		return flowRuntimeServiceModule;
	}

	function flowExecutionSnapshotService() {
		return loadEngineModule("flow-execution-snapshot-service.js");
	}

	function flowSnapshotBridge() {
		try {
			return Packages.com.twinsoft.convertigo.engine.flow.FlowEngineBridge;
		} catch (e) {
			return null;
		}
	}

	function sharedFlowSnapshotKey(identityHash, compilerFingerprint, flowQName) {
		var bridge = flowSnapshotBridge();
		if (!bridge || !identityHash) {
			return "";
		}
		try {
			return [
				"flow-execution-snapshot-v1",
				String(bridge.cacheGeneration()),
				canonicalPath(engineDir()),
				projectDir() ? canonicalPath(projectDir()) : "",
				String(flowQName || "Flow"),
				String(identityHash),
				String(compilerFingerprint || "")
			].join("\n");
		} catch (e) {
			return "";
		}
	}

	function flowSnapshotCatalogFingerprint(blocks) {
		return blocks && blocks.__flowCatalogFingerprint
			? String(blocks.__flowCatalogFingerprint)
			: "";
	}

	function sharedFlowSnapshotGet(key) {
		var bridge = flowSnapshotBridge();
		if (!bridge || !key) {
			return null;
		}
		try {
			var value = bridge.getFlowExecutionSnapshot(String(key));
			return value === null || value === undefined ? null : String(value);
		} catch (e) {
			return null;
		}
	}

	function sharedFlowSnapshotPut(key, payload) {
		var bridge = flowSnapshotBridge();
		if (!bridge || !key || !payload) {
			return false;
		}
		try {
			return bridge.putFlowExecutionSnapshot(String(key), String(payload)) === true;
		} catch (e) {
			return false;
		}
	}

	function sharedFlowSnapshotClaim(key) {
		var bridge = flowSnapshotBridge();
		if (!bridge || !key) {
			return false;
		}
		try {
			return bridge.claimFlowExecutionSnapshot(String(key)) === true;
		} catch (e) {
			return false;
		}
	}

	function sharedFlowSnapshotAwait(key) {
		var bridge = flowSnapshotBridge();
		if (!bridge || !key) {
			return null;
		}
		try {
			var value = bridge.awaitFlowExecutionSnapshot(String(key), 30000);
			return value === null || value === undefined ? null : String(value);
		} catch (e) {
			return null;
		}
	}

	function sharedFlowSnapshotAbort(key) {
		var bridge = flowSnapshotBridge();
		if (!bridge || !key) {
			return;
		}
		try {
			bridge.abortFlowExecutionSnapshot(String(key));
		} catch (e) {
			// Older bridges do not expose shared execution snapshots.
		}
	}

	function sharedFlowSnapshotInfo() {
		var bridge = flowSnapshotBridge();
		if (!bridge) {
			return { available: false };
		}
		try {
			return JSON.parse(String(bridge.flowExecutionSnapshotCacheInfo()));
		} catch (e) {
			return { available: false };
		}
	}

	function sharedFlowMachineImageGet(key) {
		var bridge = flowSnapshotBridge();
		if (!bridge || !key) {
			return null;
		}
		try {
			var image = bridge.getFlowMachineImage(String(key));
			return image === null || image === undefined ? null : image;
		} catch (e) {
			return null;
		}
	}

	function sharedFlowMachineImagePut(key, payload) {
		var bridge = flowSnapshotBridge();
		if (!bridge || !key || !payload) {
			return null;
		}
		try {
			var image = bridge.putFlowMachineImage(String(key), String(payload));
			return image === null || image === undefined ? null : image;
		} catch (e) {
			return null;
		}
	}

	function flowRuntimeServiceEnv() {
		if (flowRuntimeServiceEnvInstance) {
			return flowRuntimeServiceEnvInstance;
		}
		flowRuntimeServiceEnvInstance = {
			File: File,
			blockName: blockName,
			nodeProps: nodeProps,
			raise: raise,
			nodePath: nodePath,
			normalizeTree: normalizeTree,
			parseYamlSource: parseYamlSource,
			expandFlowDefinition: expandFlowDefinition,
			blocksWithFlowHelpers: blocksWithFlowHelpers,
			materializeFlowScriptBlock: materializeFlowScriptBlock,
			renderFlowScript: renderFlowScript,
			parseSource: parseSource,
			sourceForFlowRequest: sourceForFlowRequest,
			sha256Hex: sha256Hex,
			readRuntimeBoundedCache: readRuntimeBoundedMapCache,
			writeRuntimeBoundedCache: writeRuntimeBoundedMapCache,
			flowPlanCache: runtimeState.caches.flowPlans,
			readRunPlanHead: readRunPlanHead,
			writeRunPlanHead: writeRunPlanHead,
			flowPlanCompilerFingerprint: flowPlanCompilerFingerprint,
			flowSnapshotService: flowExecutionSnapshotService(),
			flowSnapshotStats: runtimeState.flowSnapshotStats,
			isFlowScriptSource: isFlowScriptSource,
			flowSnapshotCatalogFingerprint: flowSnapshotCatalogFingerprint,
			sharedFlowSnapshotKey: sharedFlowSnapshotKey,
			sharedFlowSnapshotGet: sharedFlowSnapshotGet,
			sharedFlowSnapshotPut: sharedFlowSnapshotPut,
			sharedFlowSnapshotClaim: sharedFlowSnapshotClaim,
			sharedFlowSnapshotAwait: sharedFlowSnapshotAwait,
			sharedFlowSnapshotAbort: sharedFlowSnapshotAbort,
			sharedFlowMachineImageGet: sharedFlowMachineImageGet,
			sharedFlowMachineImagePut: sharedFlowMachineImagePut,
			sourceForWriteRequest: sourceForWriteRequest,
			loadProjectEngineDefinition: loadProjectEngineDefinition,
			runtimeHandles: runtimeHandleApi(),
			learnResultSchema: learnResultSchema,
			schemaSummary: schemaSummary,
			snapshot: snapshot,
			canonicalPath: canonicalPath,
			engineDir: engineDir,
			projectDir: projectDir,
			currentProjectName: currentProjectName,
			intOption: intOption,
			effectiveConfig: effectiveConfig,
			readScopePath: readScopePath,
			readObjectPath: readObjectPath,
			writeScopePath: writeScopePath,
			compileWriteScopePath: compileWriteScopePath,
			evaluateExpression: evaluateExpression,
			compileExpression: compileExpression,
			compileTemplateTree: compileTemplateTree,
			literalValue: literalValue,
			renderTemplate: renderTemplate,
			renderTemplateTree: renderTemplateTree,
			inputValue: inputValue,
			safeFilePart: safeFilePart,
			loadFlowLibrary: loadFlowLibrary,
			cacheInfoRequest: cacheInfoRequest,
			clearRuntimeCaches: clearRuntimeCaches,
			withProjectDir: withProjectDir,
			withActiveRequest: withActiveRequest,
			analyzeFlowSource: analyzeFlowSource,
			loadBlocks: loadBlocks,
			contextForFlowRequest: contextForFlowRequest,
			searchFlowRequest: searchFlowRequest,
			describeTreeRequest: describeTreeRequest,
			applyMutationRequest: applyMutationRequest,
			authoringTreeRequest: authoringTreeRequest,
			authoringContractRequest: authoringContractRequest,
			authoringPaletteRequest: authoringPaletteRequest,
			authoringMutateRequest: authoringMutateRequest,
			contextMenuRequest: contextMenuRequest,
			contextActionRequest: contextActionRequest,
			outputSchemaRequest: outputSchemaRequest,
			nodeOutputSchemaRequest: nodeOutputSchemaRequest,
			readOutputSchema: readOutputSchema,
			learnOutputSchema: learnOutputSchema,
			flowNameFor: flowNameFor,
			resetSchemaRequest: resetSchemaRequest,
			resources: resourceApi(),
			notifySourceMutation: notifySourceMutation,
			mergedContext: mergedContext,
			catalogDefinition: catalogDefinition,
			blockCatalog: blockCatalog,
			getBlockSource: getBlockSource,
			createProjectBlock: createProjectBlock,
			duplicateProjectBlock: duplicateProjectBlock,
			editProjectBlock: editProjectBlock,
			setProjectBlockCode: setProjectBlockCode,
			blockCode: blockCodeApi(),
			typeList: typeList,
			loadTypes: loadTypes,
			getTypeSource: getTypeSource,
			createProjectType: createProjectType,
			listProjectFlows: listProjectFlows,
			getProjectFlow: getProjectFlow,
			setProjectFlow: setProjectFlow,
			flowScriptGetRequest: flowScriptGetRequest,
			flowScriptValidateRequest: flowScriptValidateRequest,
			flowScriptPatchRequest: flowScriptPatchRequest,
			flowCode: flowCodeApi(),
			requestables: requestableApi(),
			throwFlowError: throwFlowError,
			currentConvertigoContext: function () {
				try {
					if (Number(FlowEngineBridge.currentFlowInvocationDepth()) > 0) {
						return FlowEngineBridge.currentFlowConvertigoContext();
					}
				} catch (e) {
					// Older bridges expose the Convertigo context on the Engine scope.
				}
				return typeof context === "undefined" ? null : context;
			},
			nanoTime: function () { return Number(JavaSystem.nanoTime()); }
		};
		return flowRuntimeServiceEnvInstance;
	}

	function executeNode(ctx, node) {
		return flowRuntimeService().executeNode(ctx, node, flowRuntimeServiceEnv());
	}

	function callBlock(ctx, name, props, options) {
		return flowRuntimeService().callBlock(ctx, name, props, options, flowRuntimeServiceEnv());
	}

	function executeNodes(ctx, nodes) {
		return flowRuntimeService().executeNodes(ctx, nodes, flowRuntimeServiceEnv());
	}

	function runFlowRequest(request, blocks) {
		return flowRuntimeService().runFlowRequest(request, blocks, flowRuntimeServiceEnv());
	}

	function compileFlowPlan(request, blocks) {
		return flowRuntimeService().compileFlowPlan(request, blocks, flowRuntimeServiceEnv());
	}

	function createRunContext(request, definition, blocks, projectEngine, plan) {
		return flowRuntimeService().createRunContext(request, definition, blocks, projectEngine, plan, flowRuntimeServiceEnv());
	}

	function flowAnalysisService() {
		return loadEngineModule("flow-analysis-service.js");
	}

	function flowAnalysisServiceEnv() {
		return {
			scopeNames: scopeNames,
			intOption: intOption,
			nodeProps: nodeProps,
			addUnique: addUnique,
			schemaPaths: schemaPaths,
			joinPath: joinPath,
			readOutputSchema: readOutputSchema,
			normalizeTree: normalizeTree,
			exactTemplateExpression: exactTemplateExpression,
			collectExpressionRefs: collectExpressionRefs,
			inferSchema: inferSchema,
			itemSchema: itemSchema,
			blockCatalog: blockCatalog,
			blockName: blockName,
			nodePath: nodePath,
			raise: raise,
			outputPathsForFlow: outputPathsForFlow,
			flowOutputSchema: flowOutputSchema,
			currentProjectName: currentProjectName,
			mergeSchema: mergeSchema,
			requestableOutputSchema: requestableOutputSchema,
			schemaAtPath: schemaAtPath,
			collectScopeRefs: collectScopeRefs,
			collectTemplateRefs: collectTemplateRefs,
			declaredPropertyOutputSchema: declaredPropertyOutputSchema,
			declaredOutputSchema: declaredOutputSchema,
			schemaSummary: schemaSummary,
			expandFlowDefinition: expandFlowDefinition,
			blocksWithFlowHelpers: blocksWithFlowHelpers,
			parseSource: parseSource,
			sourceForFlowRequest: sourceForFlowRequest,
			objectSchema: objectSchema,
			assignSchemaAtPath: assignSchemaAtPath,
			loadProjectEngineDefinition: loadProjectEngineDefinition,
			effectiveConfig: effectiveConfig,
			hasSchemaContent: hasSchemaContent,
			activeSlots: activeSlots,
			canonicalFlowDefinition: canonicalFlowDefinition
		};
	}

	function createAnalysisContext(blocks, request, definition) {
		return flowAnalysisService().createAnalysisContext(blocks, request, definition, flowAnalysisServiceEnv());
	}

	function schemaForSchemasPath(schemas, path) {
		return flowAnalysisService().schemaForSchemasPath(schemas, path, flowAnalysisServiceEnv());
	}

	function analyzeFlowSource(blocks, flowSource, request) {
		return flowAnalysisService().analyzeFlowSource(blocks, flowSource, request, flowAnalysisServiceEnv());
	}

	function analyzeFlowDefinition(blocks, definition, request) {
		return flowAnalysisService().analyzeFlowDefinition(blocks, definition, request, flowAnalysisServiceEnv());
	}

	function resultSchemaFromAnalysis(analysis) {
		return flowAnalysisService().resultSchemaFromAnalysis(analysis, flowAnalysisServiceEnv());
	}

	function contextForFlowRequest(blocks, request) {
		return flowAnalysisService().contextForFlowRequest(blocks, request, flowAnalysisServiceEnv());
	}

	function analysisByNodeId(analysis) {
		var map = {};
		(analysis && analysis.nodes || []).forEach(function (node) {
			if (node && node.id) {
				map[String(node.id)] = node;
			}
		});
		return map;
	}

	function flowTreeService() {
		return loadEngineModule("flow-tree-service.js");
	}

	function frontendCatalogService() {
		return loadEngineModule("frontend-catalog-service.js");
	}

	function frontendCatalogServiceEnv() {
		return {
			File: File,
			FileUtils: FileUtils,
			Arrays: Arrays,
			engineDir: engineDir,
			projectDir: projectDir,
			projectNameForRoot: projectNameForRoot,
			canonicalPath: canonicalPath,
			directoryFingerprint: directoryFingerprint,
			resourceRelativePath: resourceRelativePath,
			resolveBlockIcon: resolveBlockIcon,
			normalizeTree: normalizeTree,
			projectRootForName: loadedProjectRootForName,
			referencedProjectRoots: referencedProjectRoots,
			sourceForFile: sourceForFile,
			draftFilesUnder: function (baseDir) {
				return frontendDraftEntriesUnder(currentActiveRequest(), baseDir).map(function (entry) {
					return entry.file;
				});
			},
			sourceDraftsFingerprint: sourceDraftsFingerprint,
			raise: raise
		};
	}

	function frontendBlocksForSettings(name, settings) {
		var result = frontendCatalogService().frontendBlocksForSettings(name, settings, frontendCatalogServiceEnv());
		frontendPerformanceMark("frontend.catalog.blocks");
		return result;
	}

	function frontendCreateDescriptorsForSettings(name, settings) {
		var result = frontendCatalogService().frontendCreateDescriptorsForSettings(name, settings, frontendCatalogServiceEnv());
		frontendPerformanceMark("frontend.catalog.createDescriptors");
		return result;
	}

	function frontendBlocksForConfig(config) {
		return frontendCatalogService().frontendBlocksForConfig(config, frontendCatalogServiceEnv());
	}

	function frontendCreateDescriptorsForConfig(config) {
		return frontendCatalogService().frontendCreateDescriptorsForConfig(config, frontendCatalogServiceEnv());
	}

	function projectEngineDefinitionForRequest(request) {
		request = request || {};
		if (request.engineSource !== undefined && request.engineSource !== null && String(request.engineSource).trim() !== "") {
			return parseYamlSource(request.engineSource, "version: 1\n");
		}
		try {
			return loadProjectEngineDefinition();
		} catch (e) {
			return {};
		}
	}

	function frontendCatalogFingerprintForRequest(request) {
		try {
			var engine = projectEngineDefinitionForRequest(request);
			var fingerprint = frontendCatalogService().fingerprintForConfig(engine.config || {}, frontendCatalogServiceEnv());
			frontendPerformanceMark("frontend.catalog.fingerprint");
			return fingerprint;
		} catch (e) {
			frontendPerformanceMark("frontend.catalog.fingerprintError");
			return "";
		}
	}

	function frontendModelFingerprintForRequest(request) {
		try {
			var engine = projectEngineDefinitionForRequest(request);
			var root = projectDir();
			if (!root) {
				return "";
			}
			return frontendCatalogService().frontbuilderSettings(engine.config || {}).map(function (entry) {
				var settings = entry.settings || {};
				var modelPath = String(settings.modelPath || "");
				if (!modelPath) {
					return entry.name + ":";
				}
				var file = new File(modelPath);
				if (!file.isAbsolute()) {
					file = new File(root, modelPath);
				}
				var draft = frontendDraftForFile(request, file);
				var componentDir = new File(file.getParentFile(), "components");
				var sourceRoot = file.getParentFile();
				while (sourceRoot && String(sourceRoot.getName()) !== "src") {
					sourceRoot = sourceRoot.getParentFile();
				}
				var drafts = frontendSourceDrafts(request);
				var basePath = String((sourceRoot || file.getParentFile()).getCanonicalPath());
				var draftParts = [];
				Object.keys(drafts).sort().forEach(function (key) {
					try {
						var draftFile = new File(String(key)).getCanonicalFile();
						var draftPath = String(draftFile.getCanonicalPath());
						if (draftPath === basePath || draftPath.indexOf(basePath + File.separator) === 0) {
							draftParts.push(draftPath + ":" + sha256Hex(String(drafts[key])));
						}
					} catch (e1) {
					}
				});
				return [
					entry.name,
					canonicalPath(file),
					draft !== null ? "draft:" + sha256Hex(draft) : file.isFile() ? fileFingerprint(file) : "missing",
					sourceRoot && sourceRoot.isDirectory() ? directoryFingerprint(sourceRoot) : "",
					componentDir.isDirectory() ? directoryFingerprint(componentDir) : "",
					draftParts.join("|")
				].join(":");
			}).join("\n");
		} catch (e) {
			return "";
		}
	}

	function flowTreeServiceEnv() {
		return {
			File: File,
			FileUtils: FileUtils,
			Arrays: Arrays,
			jsonMapper: jsonMapper,
			yamlMapper: yamlMapper,
			engineDir: engineDir,
			projectDir: projectDir,
			projectNameForRoot: projectNameForRoot,
			resourceRelativePath: resourceRelativePath,
			resolveBlockIcon: resolveBlockIcon,
			normalizeTree: normalizeTree,
			compact: compact,
			compactPlain: compactPlain,
			summaryText: summaryText,
			blockCatalog: blockCatalog,
			blockDescriptor: blockDescriptor,
			typeDescriptor: typeDescriptor,
			loadTypes: loadTypes,
			catalogDefinition: catalogDefinition,
			listFlowLibraries: listFlowLibraries,
			normalizeGraphBlockUses: normalizeGraphBlockUses,
			listProjectFragments: listProjectFragments,
			readFragment: readFragment,
			expandFragmentNodes: expandFragmentNodes,
			blockName: blockName,
			nodePath: nodePath,
			sourceFromDefinition: sourceFromDefinition,
			renderFlowScript: renderFlowScript,
			parseYamlSource: parseYamlSource,
			canonicalFlowDefinition: canonicalFlowDefinition,
			parseSource: parseSource,
			sourceForFlowRequest: sourceForFlowRequest,
			expandFlowDefinition: expandFlowDefinition,
			blocksWithFlowHelpers: blocksWithFlowHelpers,
			analyzeFlowSource: analyzeFlowSource,
			analyzeFlowDefinition: analyzeFlowDefinition,
			analysisByNodeId: analysisByNodeId,
			currentProjectName: currentProjectName,
				visibleSearchFlows: visibleSearchFlows,
				projectEngineDefinitionForRequest: projectEngineDefinitionForRequest,
				projectSchemasDir: projectSchemasDir,
				readResultSchema: readResultSchema,
				readOutputSchema: readOutputSchema,
				writeOutputSchema: writeOutputSchema,
				deleteOutputSchema: deleteOutputSchema,
				declaredOutputSchema: declaredOutputSchema,
			declaredPropertyOutputSchema: declaredPropertyOutputSchema,
			resultSchemaFromAnalysis: resultSchemaFromAnalysis,
			schemaScore: schemaScore,
			schemaPaths: schemaPaths,
			schemaAtPath: schemaAtPath,
			schemaSimpleType: schemaSimpleType,
			schemaSummary: schemaSummary,
				objectSchema: objectSchema,
				requestableInputContract: requestableInputContract,
				frontendBlocksForSettings: frontendBlocksForSettings,
				frontendCreateDescriptorsForSettings: frontendCreateDescriptorsForSettings,
				frontendCreateDescriptorsForConfig: frontendCreateDescriptorsForConfig,
				sha256Hex: sha256Hex,
				responseBudget: responseBudget,
				describeFrontendDocument: describeFrontendDocument,
				raise: raise,
				intOption: intOption
		};
	}

	function activeSlots(node, catalog) {
		return flowTreeService().activeSlots(node, catalog, flowTreeServiceEnv());
	}

	function slotDefinitions(catalog) {
		return flowTreeService().slotDefinitions(catalog, flowTreeServiceEnv());
	}

	function toYamlSource(value) {
		return flowTreeService().toYamlSource(value, flowTreeServiceEnv());
	}

	function intOption(value, fallback, min, max) {
		var number = Number(value);
		if (isNaN(number)) {
			number = fallback;
		}
		number = Math.floor(number);
		if (min !== undefined && number < min) {
			number = min;
		}
		if (max !== undefined && number > max) {
			number = max;
		}
		return number;
	}

	function describeTreeRequest(request, blocks) {
		request = request || {};
		if (String(request.target || "flow") === "engine" && String(request.projectDir || "")) {
			request = Object.assign({}, request);
			if (request.includeFrontendCatalog === undefined || request.includeFrontendCatalog === null) {
				request.includeFrontendCatalog = false;
			}
			if (request.includeFlowCatalog === undefined || request.includeFlowCatalog === null) {
				request.includeFlowCatalog = false;
			}
		}
		var cache = runtimeState.caches.treeSnapshots;
		var key = describeTreeCacheKey(request);
		var fingerprint = describeTreeFingerprint(request);
		var cached = readRuntimeMapCache(cache, key, fingerprint);
		if (cached) {
			return normalizeTree(cached);
		}
		pruneDescribeTreeCacheFamily(cache, request);
		var tree = flowTreeService().describeTreeRequest(request, blocks, flowTreeServiceEnv());
		return normalizeTree(writeRuntimeMapCache(cache, key, fingerprint, tree, "Flow virtual tree snapshots"));
	}

	function cachedAuthoringTreeBase(request, blocks) {
		request = request || {};
		var cache = runtimeState.caches.treeSnapshots;
		var includeBindings = request.includeBindings === true
			|| (request.includeBindings === undefined && !!request.property
				&& !!(request.focusPath || request.rootPath || request.path));
		var baseRequest = Object.assign({}, request, {
			focusPath: "",
			rootPath: "",
			path: "",
			detail: "full",
			includeChildren: true,
			includeBindings: includeBindings
		});
		delete baseRequest.mode;
		delete baseRequest.maxDepth;
		var fingerprintRequest = Object.assign({}, baseRequest, { target: "engine" });
		var key = "authoring-base\n" + JSON.stringify({
			project: projectDir() ? canonicalPath(projectDir()) : "",
			surface: String(request.surface || "frontend"),
			builder: String(request.builder || ""),
			property: String(request.property || ""),
			sourceId: String(request.sourceId || ""),
			bindingTargetPath: String(request.bindingTargetPath || ""),
			bindingTargetSource: String(request.bindingTargetSource || ""),
			internalDeep: request.internalDeep === true,
			includeDefinition: request.includeDefinition === true,
			includeProperties: request.includeProperties === true,
			includeBindings: includeBindings,
			includeSource: request.includeSource === true,
			includeAnalysis: request.includeAnalysis === true,
			includeSchema: request.includeSchema === true || request.schema === true,
			includePrivate: request.includePrivate !== false,
			includeFrontendCatalog: request.includeFrontendCatalog !== false,
			includeFlowCatalog: request.includeFlowCatalog !== false
		});
		var fingerprint = describeTreeFingerprint(fingerprintRequest);
		var cached = readRuntimeMapCache(cache, key, fingerprint);
		if (!cached) {
			cached = writeRuntimeMapCache(cache, key, fingerprint,
				flowTreeService().authoringTreeBaseRequest(baseRequest, blocks, flowTreeServiceEnv()),
				"Flow authoring tree snapshots");
		}
		return cached;
	}

	function authoringTreeRequest(request, blocks) {
		request = request || {};
		if (targetedFrontendBindingRequest(request)) {
			var baseRequest = Object.assign({}, request, {
				property: "",
				sourceId: "",
				bindingTargetPath: "",
				bindingTargetSource: "",
				includeBindings: false
			});
			var targeted = flowTreeService().projectAuthoringTreeResponse(
				cachedAuthoringTreeBase(baseRequest, blocks), request, flowTreeServiceEnv());
			return enrichTargetedFrontendBindingTree(targeted, request);
		}
		var cached = cachedAuthoringTreeBase(request, blocks);
		return normalizeTree(flowTreeService().projectAuthoringTreeResponse(cached, request, flowTreeServiceEnv()));
	}

	function targetedFrontendBindingRequest(request) {
		return String(request && request.surface || "frontend") === "frontend"
			&& request && request.includeBindings !== false
			&& !!String(request.property || "")
			&& !!String(request.focusPath || request.rootPath || request.path || "")
			&& String(request.detail || request.mode || "full") === "full";
	}

	function frontendBindingTreeNode(value, predicate) {
		if (!value || typeof value !== "object") {
			return null;
		}
		if (predicate(value)) {
			return value;
		}
		var children = value.children || [];
		for (var i = 0; i < children.length; i++) {
			var found = frontendBindingTreeNode(children[i], predicate);
			if (found) {
				return found;
			}
		}
		return null;
	}

	function frontendBindingNodeInfo(node) {
		var info = node && node.info;
		if (info && typeof info === "object") {
			return normalizeTree(info);
		}
		if (typeof info === "string" && info) {
			try {
				return JSON.parse(info);
			} catch (e) {
			}
		}
		return {};
	}

	function enrichTargetedFrontendBindingTree(tree, request) {
		tree = normalizeTree(tree || {});
		var focusPath = String(request.focusPath || request.rootPath || request.path || "");
		var focused = frontendBindingTreeNode(tree, function (node) {
			return String(node.path || "") === focusPath;
		});
		var info = frontendBindingNodeInfo(focused);
		var sourcePath = String(info.sourcePath || info.sourceRelativePath || "");
		var mutationPath = String(info.sourceMutationPath || info.frontendModelPath || "");
		var property = String(request.property || "");
		if (!focused || !sourcePath || !mutationPath || !property) {
			return tree;
		}
		var described = describeFrontendDocument(Object.assign({}, request, {
			sourceFile: sourcePath,
			sourcePath: sourcePath,
			__trustedSourceFile: frontendProjectedSourceFile(sourcePath),
			property: property,
			bindingTargetPath: mutationPath,
			bindingTargetSource: "",
			includeBindings: true
		}));
		var projected = frontendBindingTreeNode(described && described.tree || {}, function (node) {
			return String(node.sourceMutationPath || "") === mutationPath
				&& !!(node.propertyDefinitions && node.propertyDefinitions[property]);
		});
		var definition = projected && projected.propertyDefinitions
			&& projected.propertyDefinitions[property];
		if (!definition) {
			return tree;
		}
		info.propertyDefinitions = info.propertyDefinitions || {};
		info.propertyDefinitions[property] = normalizeTree(definition);
		focused.info = typeof focused.info === "string" ? JSON.stringify(info) : info;
		return tree;
	}

	function authoringContractRequest(request, blocks) {
		return flowTreeService().authoringContractRequest(request || {}, blocks, flowTreeServiceEnv());
	}

	function authoringPaletteRequest(request, blocks) {
		request = request || {};
		var treeRequest = flowTreeService().authoringPaletteTreeRequest(request, flowTreeServiceEnv());
		return flowTreeService().authoringPaletteFromTreeRequest(request, blocks,
			cachedAuthoringTreeBase(treeRequest, blocks), flowTreeServiceEnv());
	}

	function authoringMutateRequest(request, blocks) {
		request = request || {};
		if (request.sourceFile || request.sourcePath) {
			return applySourceMutationRequest(request, blocks);
		}
		return flowTreeService().authoringMutateRequest(request, blocks, flowTreeServiceEnv());
	}

	function describeTreeCacheKey(request) {
		return describeTreeCacheFamilyKey(request) + "\n" + sha256Hex(describeTreeSourceFingerprintInput(request));
	}

	function describeTreeCacheFamilyKey(request) {
		var target = String(request.target || "flow");
		var project = projectDir() ? canonicalPath(projectDir()) : "";
		var sourceFile = String(request.sourceFile || request.sourcePath || "");
		var options = [
			String(request.detail || request.mode || "full"),
			String(request.path || ""),
			String(request.maxDepth || ""),
			String(request.includeChildren === false ? "no-children" : "children"),
			String(request.includeDefinition === true),
			String(request.includeProperties === true),
			String(request.includeBindings === false ? "no-bindings" : "bindings"),
			String(request.includeSource === true),
			String(request.includeAnalysis === true),
			String(request.includeSchema === true || request.schema === true),
			String(request.includePrivate === false ? "no-private" : "private"),
			String(request.includeFrontendCatalog === false ? "no-frontend-catalog" : "frontend-catalog"),
			String(request.includeFlowCatalog === false ? "no-flow-catalog" : "flow-catalog"),
			String(request.flowCatalogOrigin || ""),
			String(request.includeCatalogLibraries === false ? "no-catalog-libraries" : "catalog-libraries")
		].join("|");
		return [
			target,
			project,
			String(request.flowQName || ""),
			String(request.flowName || request.name || ""),
			sourceFile,
			options
		].join("\n");
	}

	function pruneDescribeTreeCacheFamily(cache, request) {
		if (!cache || !cacheUtils().clearMapWhere) {
			return 0;
		}
		var prefix = describeTreeCacheFamilyKey(request) + "\n";
		return cacheUtils().clearMapWhere(cache, function (key) {
			return String(key || "").indexOf(prefix) === 0;
		});
	}

	function describeTreeFingerprint(request) {
		var sourceFile = String(request.sourceFile || request.sourcePath || "");
		var sourceFileFingerprint = "";
		if (sourceFile) {
			try {
				sourceFileFingerprint = fileFingerprint(new File(sourceFile));
			} catch (e) {
				sourceFileFingerprint = "";
			}
		}
		return [
				blocksCacheKey(),
				typesCacheKey(),
				request.target === "engine" ? frontendCatalogFingerprintForRequest(request) : "",
				request.target === "engine" ? frontendModelFingerprintForRequest(request) : "",
				sourceFileFingerprint,
				describeTreeSourceFingerprintInput(request)
			].join("\n");
	}

	function describeTreeSourceFingerprintInput(request) {
		if (request.target === "engine") {
			return String(request.engineSource || "");
		}
		if (request.definition !== undefined && request.definition !== null) {
			return JSON.stringify(normalizeTree(request.definition));
		}
		return String(request.flowSource || "");
	}

	function searchFlowRequest(request, blocks) {
		return flowTreeService().searchFlowRequest(request, blocks, flowTreeServiceEnv());
	}

	function applyMutationRequest(request, blocks) {
		return flowTreeService().applyMutationRequest(request, blocks, flowTreeServiceEnv());
	}

	function blockCodeSourceMutationName(request, sourcePath, source) {
		var explicit = String(request.sourceBlockName || request.blockName || request.name || request.flowName || "").trim();
		if (explicit) {
			return explicit;
		}
		try {
			var meta = extractFlowScriptBlockMeta(source).meta || {};
			var metaName = String(meta.name || meta.blockId || meta.id || "").trim();
			if (metaName) {
				return metaName;
			}
		} catch (_ignoreMetaName) {
		}
		var sourceFile = new File(String(sourcePath || ""));
		var suffix = ".block.js";
		var fileName = String(sourceFile.getName());
		var fallback = fileName.endsWith(suffix) ? fileName.substring(0, fileName.length - suffix.length) : fileName;
		try {
			var projectRoot = request.projectDir ? new File(String(request.projectDir)) : projectDir();
			if (projectRoot) {
				var blocksDir = new File(projectRoot, "libs/flow/blocks");
				var blocksPath = String(blocksDir.getCanonicalPath()) + String(File.separator);
				var filePath = String(sourceFile.getCanonicalPath());
				if (filePath.indexOf(blocksPath) === 0 && filePath.endsWith(suffix)) {
					return filePath.substring(blocksPath.length, filePath.length - suffix.length).replace(/[\\\/]+/g, ".");
				}
			}
		} catch (_ignorePathName) {
		}
		return fallback;
	}

	function applyBlockCodeSourceMutationRequest(request, blocks) {
		request = request || {};
		var sourcePath = String(request.sourceFile || request.sourcePath || "");
		var source = request.source !== undefined && request.source !== null
			? String(request.source)
			: request.flowSource !== undefined && request.flowSource !== null
				? String(request.flowSource)
				: String(FileUtils.readFileToString(new File(sourcePath), "UTF-8"));
		var extracted = extractFlowScriptBlockMeta(source);
		var meta = normalizeTree(extracted.meta || {});
		var runtime = String(blockCodeRuntimeFromMeta(meta) || "flow");
		if (runtime !== "flow") {
			raise("UNSUPPORTED_BLOCK_SOURCE_MUTATION", "Only FlowScript block implementations can be edited as Flow nodes: " + sourcePath);
		}
		var name = blockCodeSourceMutationName(request, sourcePath, source);
		var flowName = blockLocalName(name) || name || "Block";
		var response = applyMutationRequest(Object.assign({}, request, {
			target: "flow",
			name: flowName,
			flowName: flowName,
			flowSource: source,
			sourceFile: sourcePath,
			sourcePath: sourcePath
		}), blocks);
		if (response && response.ok && response.source !== undefined && response.source !== null) {
			var code = flowScriptBlockCodeSource(name, String(response.source), meta);
			response.source = code;
			response.code = code;
			response.name = name;
			response.format = "blockjs";
		}
		return response;
	}

	function applySourceMutationRequest(request, blocks) {
		request = request || {};
		var sourcePath = String(request.sourceFile || request.sourcePath || "");
		if (sourcePath.endsWith(".block.js")) {
			return applyBlockCodeSourceMutationRequest(request, blocks);
		}
		if (!sourcePath.endsWith(".flow.svelte") && !sourcePath.endsWith(".flow.css")) {
			return applyMutationRequest(request, blocks);
		}
		return applyFlowSvelteSourceMutationRequest(request);
	}

	function frontendRequestSourceFile(request, mustExist) {
		var trusted = request && request.__trustedSourceFile;
		if (trusted && typeof trusted.getAbsolutePath === "function") {
			return trusted;
		}
		var sourcePath = String(request && (request.sourceFile || request.sourcePath) || "");
		if (!sourcePath) {
			raise("MISSING_FRONTEND_SOURCE", "A Flow Svelte or Flow CSS source path is required.");
		}
		var sourceFile = new File(sourcePath);
		if (sourceFile.isAbsolute()) {
			return sourceFile.getCanonicalFile();
		}
		return projectResourceFile(sourcePath, mustExist).file.getCanonicalFile();
	}

	function frontendProjectedSourceFile(sourcePath) {
		var base = projectDir();
		if (!base) {
			return frontendRequestSourceFile({ sourcePath: sourcePath }, true);
		}
		base = base.getAbsoluteFile();
		var sourceFile = new File(String(sourcePath || ""));
		var basePath = String(base.toPath().normalize());
		var sourceText = String(sourcePath || "");
		if (sourceFile.isAbsolute()) {
			var absolutePath = String(sourceFile.toPath().normalize());
			if (absolutePath !== basePath && absolutePath.indexOf(basePath + File.separator) !== 0) {
				raise("RESOURCE_PATH_NOT_ALLOWED", "Flow frontend source path escapes the project: " + sourceText);
			}
			sourceText = absolutePath.substring(basePath.length + 1).replace(/\\/g, "/");
		}
		var normalized = normalizeResourcePath(sourceText);
		if (!isAllowedResourcePath(normalized)) {
			raise("RESOURCE_PATH_NOT_ALLOWED", "Flow frontend source path is not allowed: " + normalized);
		}
		// This path comes from the focused node in the provider-produced authoring
		// tree, not from the caller. It has already been constrained to the project
		// and to an allowed frontend resource. Avoid canonical/stat calls here: on
		// NFS they can block for seconds. The subsequent read remains authoritative
		// and fails if the projected source disappeared.
		return new File(base, normalized).getAbsoluteFile();
	}

	function frontendBindingActionSchemas(document, request, projectRoot) {
		var model = document && document.model || {};
		var calls = {};
		(model.backendCalls || []).forEach(function (call) {
			if (call && call.id && call.requestable) {
				calls[String(call.id)] = call;
			}
		});
		var projectName = projectNameForRoot(projectRoot) || currentProjectName(request);
		var schemas = {};
		function setActionSchema(action, schema) {
			var normalized = normalizeTree(schema);
			schemas[String(action.id)] = normalized;
			if (action.target) {
				schemas[String(action.target)] = normalized;
			}
		}
		(model.clientActions || []).forEach(function (action) {
			var call = action && calls[String(action.backendCall || "")];
			if (!action || !action.id || !call) {
				return;
			}
			if (call.outputSchema && typeof call.outputSchema === "object") {
				setActionSchema(action, call.outputSchema);
				return;
			}
			var requestable = String(call.requestable || "");
			if (action.kind === "fullSync" || requestable.indexOf("fs://") === 0) {
				return;
			}
			try {
				var response = requestableSchemaRequest({
					requestable: requestable,
					project: projectName,
					projectDir: projectRoot ? String(projectRoot.getAbsolutePath()) : ""
				});
				if (response && response.ok === true && response.schema) {
					setActionSchema(action, response.schema);
				}
			} catch (e) {
			}
		});
		return schemas;
	}

	function enrichFrontendBindingSources(document, request, projectRoot) {
		if (request && request.includeBindings === false) {
			return document;
		}
		return frontendCatalogService().enrichBindingSources(document,
			frontendBindingActionSchemas(document, request, projectRoot), {
				normalizeTree: normalizeTree,
				schemaPaths: schemaPaths,
				schemaArrayPaths: schemaArrayPaths,
				schemaLeafEntries: schemaLeafEntries,
				schemaSimpleType: schemaSimpleType,
				schemaAtPath: schemaAtPath
			}, {
				property: request && request.property || "",
				sourceId: request && request.sourceId || ""
			});
	}

	function describeFrontendDocument(request) {
		request = request || {};
		var sourcePath = String(request.sourceFile || request.sourcePath || "");
		var sourceFile = frontendRequestSourceFile(request, request.source === undefined || request.source === null);
		frontendPerformanceMark("frontend.document.sourceFile");
		var source = request.source !== undefined && request.source !== null
			? String(request.source)
			: String(FileUtils.readFileToString(sourceFile, "UTF-8"));
		frontendPerformanceMark("frontend.document.sourceRead");
		var resourceRoot = frontendSvelteResourceRoot(request);
		var projectRoot = fileForProjectPath(new File("."), request.projectDir || "") || projectDir() || new File(".");
		var projectName = projectNameForRoot(projectRoot) || currentProjectName(request);
		var drafts = frontendSourceDrafts(request);
		var cache = runtimeState.caches.frontendDocuments;
		var persistentCacheEligible = request.includeBindings === false;
		var key = [
			String(sourceFile.getAbsolutePath()),
			String(resourceRoot.getAbsolutePath()),
			String(projectRoot.getAbsolutePath()),
			projectName,
			String(request.property || ""),
			String(request.sourceId || ""),
			String(request.bindingTargetPath || ""),
			String(request.bindingTargetSource || ""),
			String(request.includeBindings !== false),
			String(request.sourceTree === true)
		].join("\n");
		var fingerprint = frontendDocumentFingerprint(source, drafts, sourceFile, resourceRoot, projectRoot);
		frontendPerformanceMark("frontend.document.fingerprint");
		var cached = readRuntimeMapCache(cache, key, fingerprint);
		frontendPerformanceMark("frontend.document.memoryCache");
		if (cached) {
			prewarmFrontendDocumentServer(request, resourceRoot, sourceFile);
			var enrichedCached = enrichFrontendBindingSources(cached, request, projectRoot);
			frontendPerformanceMark("frontend.document.enrich");
			return enrichedCached;
		}
		var persistent = persistentCacheEligible ? readPersistentFrontendDocument(key, fingerprint) : null;
		frontendPerformanceMark("frontend.document.persistentCache");
		if (persistent) {
			prewarmFrontendDocumentServer(request, resourceRoot, sourceFile);
			var cachedPersistent = writeRuntimeMapCache(cache, key, fingerprint, persistent, "Svelte front documents");
			var enrichedPersistent = enrichFrontendBindingSources(cachedPersistent, request, projectRoot);
			frontendPerformanceMark("frontend.document.enrich");
			return enrichedPersistent;
		}
		var normalizedSourcePath = String(sourceFile.getCanonicalPath()).replace(/\\/g, "/");
		var local = request.sourceTree === true || normalizedSourcePath.indexOf("/src/routes/") >= 0
			? null
			: describeFrontAstDocument(source, request, sourceFile, projectRoot);
		frontendPerformanceMark("frontend.document.localProjection");
		if (local) {
			var cachedLocal = writeRuntimeMapCache(cache, key, fingerprint, local, "Svelte front documents");
			var enrichedLocal = enrichFrontendBindingSources(cachedLocal, request, projectRoot);
			frontendPerformanceMark("frontend.document.enrich");
			return enrichedLocal;
		}
		var sourceTemp = File.createTempFile("c8o-front-document-source-", ".flow.svelte");
		var draftsTemp = File.createTempFile("c8o-front-document-drafts-", ".json");
		try {
			FileUtils.writeStringToFile(sourceTemp, source, "UTF-8");
			FileUtils.writeStringToFile(draftsTemp, JSON.stringify(drafts), "UTF-8");
			var cliArgs = [
				"--source-file", String(sourceFile.getAbsolutePath()),
				"--source-input", String(sourceTemp.getAbsolutePath()),
				"--drafts", String(draftsTemp.getAbsolutePath()),
				"--cache-key", fingerprint,
				"--resource-root", String(resourceRoot.getAbsolutePath()),
				"--project-root", String(projectRoot.getAbsolutePath()),
				"--project-name", projectName,
				"--engine-model"
			];
			frontendReferenceCliArgs(projectRoot, resourceRoot).forEach(function (arg) {
				cliArgs.push(arg);
			});
			if (request.property) {
				cliArgs.push("--property", String(request.property));
			}
			if (request.sourceId) {
				cliArgs.push("--source-id", String(request.sourceId));
			}
			if (request.bindingTargetPath) {
				cliArgs.push("--binding-target-path", String(request.bindingTargetPath));
			}
			if (request.bindingTargetSource) {
				cliArgs.push("--binding-target-source", String(request.bindingTargetSource));
			}
			if (request.includeBindings === false) {
				cliArgs.push("--without-bindings");
			}
			if (request.sourceTree === true) {
				cliArgs.push("--source-tree");
			}
			frontendPerformanceMark("frontend.document.providerPrepare");
			var result = frontendDescribeDocument(resourceRoot, cliArgs);
			frontendPerformanceMark("frontend.document.provider");
			if (!result || !result.model) {
				var error = new Error("Svelte front document did not return a valid model.");
				error.code = "FRONTEND_DOCUMENT_INVALID_RESULT";
				error.hint = "Check src-builder/frontDocumentCli.ts output for " + sourcePath + ".";
				throw error;
			}
			if (persistentCacheEligible) {
				// The first provider request may install the frontbuilder and update package metadata.
				// Store the document under the post-install fingerprint so the next Engine runtime can reuse it.
				fingerprint = frontendDocumentFingerprint(source, drafts, sourceFile, resourceRoot, projectRoot);
				frontendPerformanceMark("frontend.document.postInstallFingerprint");
			}
			var cachedResult = writeRuntimeMapCache(cache, key, fingerprint, result, "Svelte front documents");
			if (persistentCacheEligible) {
				writePersistentFrontendDocument(key, fingerprint, cachedResult);
			}
			frontendPerformanceMark("frontend.document.cacheStore");
			var enrichedResult = enrichFrontendBindingSources(cachedResult, request, projectRoot);
			frontendPerformanceMark("frontend.document.enrich");
			return enrichedResult;
		} finally {
			try {
				sourceTemp["delete"]();
			} catch (e1) {
			}
			try {
				draftsTemp["delete"]();
			} catch (e2) {
			}
		}
	}

	function prewarmFrontendDocumentServer(request, resourceRoot, sourceFile) {
		if (!request || request.prewarmFrontendDocumentServer !== true || !sourceFile) {
			return;
		}
		var normalizedSourcePath = String(sourceFile.getAbsolutePath()).replace(/\\/g, "/");
		if (normalizedSourcePath.indexOf("/src/routes/") < 0) {
			return;
		}
		try {
			startFrontendDocumentServer(resourceRoot);
		} catch (e) {
			runtimeState.frontendDocumentServerStats.errors++;
			frontendStudioLog("[Svelte front document server] Unable to prewarm: "
				+ String(e && e.message || e), true);
		}
	}

	function frontendDocumentCacheDir() {
		return new File(Packages.java.lang.System.getProperty("java.io.tmpdir"),
			"convertigo-flow-cache/frontend-documents-v1");
	}

	function secureFrontendDocumentCacheDir(directory) {
		if (!directory.isDirectory()) {
			directory.mkdirs();
		}
		try {
			directory.setReadable(false, false);
			directory.setWritable(false, false);
			directory.setExecutable(false, false);
			directory.setReadable(true, true);
			directory.setWritable(true, true);
			directory.setExecutable(true, true);
		} catch (e) {
		}
		return directory;
	}

	function persistentFrontendDocumentFile(key, fingerprint) {
		return new File(secureFrontendDocumentCacheDir(frontendDocumentCacheDir()),
			sha256Hex(String(key) + "\n" + String(fingerprint)) + ".json");
	}

	function readPersistentFrontendDocument(key, fingerprint) {
		var stats = runtimeState.persistentFrontendDocuments;
		var file = persistentFrontendDocumentFile(key, fingerprint);
		if (!file.isFile()) {
			stats.misses++;
			return null;
		}
		try {
			var envelope = JSON.parse(String(FileUtils.readFileToString(file, "UTF-8")));
			if (!envelope || envelope.version !== 1 || envelope.fingerprint !== fingerprint || !envelope.result) {
				throw new Error("Invalid persistent frontend document cache entry.");
			}
			stats.hits++;
			file.setLastModified(new Date().getTime());
			return envelope.result;
		} catch (e) {
			stats.errors++;
			stats.misses++;
			try {
				file["delete"]();
			} catch (ignored) {
			}
			return null;
		}
	}

	function prunePersistentFrontendDocuments() {
		var stats = runtimeState.persistentFrontendDocuments;
		if (stats.pruned) {
			return;
		}
		stats.pruned = true;
		var directory = frontendDocumentCacheDir();
		var files = directory.isDirectory() ? directory.listFiles() : null;
		if (!files || files.length <= 256) {
			return;
		}
		var entries = Arrays.asList(files).toArray().filter(function (file) {
			return file.isFile() && String(file.getName()).endsWith(".json");
		}).sort(function (left, right) {
			return Number(left.lastModified()) - Number(right.lastModified());
		});
		for (var i = 0; i < entries.length - 256; i++) {
			try {
				entries[i]["delete"]();
			} catch (ignored) {
			}
		}
	}

	function writePersistentFrontendDocument(key, fingerprint, result) {
		var stats = runtimeState.persistentFrontendDocuments;
		var file = persistentFrontendDocumentFile(key, fingerprint);
		var temporary = null;
		try {
			prunePersistentFrontendDocuments();
			temporary = File.createTempFile("frontend-document-", ".json", file.getParentFile());
			FileUtils.writeStringToFile(temporary, JSON.stringify({
				version: 1,
				fingerprint: fingerprint,
				result: result
			}), "UTF-8");
			temporary.setReadable(false, false);
			temporary.setWritable(false, false);
			temporary.setReadable(true, true);
			temporary.setWritable(true, true);
			if (!temporary.renameTo(file)) {
				FileUtils.copyFile(temporary, file);
				temporary["delete"]();
			}
			file.setReadable(false, false);
			file.setWritable(false, false);
			file.setReadable(true, true);
			file.setWritable(true, true);
			stats.writes++;
		} catch (e) {
			stats.errors++;
			if (temporary) {
				try {
					temporary["delete"]();
				} catch (ignored) {
				}
			}
		}
	}

	function frontendFingerprintFiles(root, suffixes, entries, visited) {
		if (!root || !root.exists()) {
			return;
		}
		var canonical = canonicalPath(root);
		var visitKey = canonical + "|" + suffixes.join(",");
		if (visited[visitKey]) {
			return;
		}
		visited[visitKey] = true;
		if (root.isFile()) {
			var name = String(root.getName());
			if (suffixes.some(function (suffix) { return name.endsWith(suffix); })) {
				entries.push(canonical + "\n" + root.lastModified() + "\n" + root.length());
			}
			return;
		}
		var files = root.listFiles();
		if (!files) {
			return;
		}
		Arrays.asList(files).toArray().sort(function (left, right) {
			return String(left.getName()).localeCompare(String(right.getName()));
		}).forEach(function (file) {
			frontendFingerprintFiles(file, suffixes, entries, visited);
		});
	}

	function frontendResourceProjectRoot(resourceRoot) {
		if (!resourceRoot) {
			return null;
		}
		var root = resourceRoot;
		while (root && String(root.getName()) !== "libs") {
			root = root.getParentFile();
		}
		return root && root.getParentFile();
	}

	function frontendReferenceRoots(projectRoot, resourceRoot) {
		var resourceProjectRoot = frontendResourceProjectRoot(resourceRoot);
		var resourceProjectName = resourceProjectRoot
			? String(projectNameForRoot(resourceProjectRoot) || "")
			: "";
		return referencedProjectRoots("libs/flow/frontbuilder/svelte", projectRoot || projectDir())
			.filter(function (root) {
				return !resourceProjectName || String(projectNameForRoot(root) || "") !== resourceProjectName;
			});
	}

	function frontendReferenceCliArgs(projectRoot, resourceRoot) {
		var args = [];
		frontendReferenceRoots(projectRoot, resourceRoot).forEach(function (root) {
			args.push("--reference-root", String(root.getAbsolutePath()));
			args.push("--reference-project", String(projectNameForRoot(root)) + "=" + String(root.getAbsolutePath()));
		});
		return args;
	}

	function frontendDocumentDependenciesFingerprint(sourceFile, resourceRoot, projectRoot) {
		var referenceRoots = frontendReferenceRoots(projectRoot, resourceRoot);
		var stableCacheKey = [
			canonicalPath(resourceRoot),
			canonicalPath(projectRoot),
			referenceRoots.map(canonicalPath).sort().join("\n")
		].join("\n");
		var stableFingerprint = runtimeState.frontendDependencyFingerprints[stableCacheKey];
		var toolRoot = frontendSvelteToolRoot(resourceRoot, "src-builder/frontDocumentCli.ts");
		var sourceRoot = sourceFile && sourceFile.getParentFile();
		while (sourceRoot && String(sourceRoot.getName()) !== "src") {
			sourceRoot = sourceRoot.getParentFile();
		}
		if (!stableFingerprint) {
			var stableEntries = [];
			var stableVisited = {};
			[
				{ root: new File(resourceRoot, "components"), suffixes: [".svelte"] },
				{ root: new File(resourceRoot, "ui"), suffixes: [".uiblock.json"] },
				{ root: new File(toolRoot, "components"), suffixes: [".svelte"] },
				{ root: new File(toolRoot, "ui"), suffixes: [".uiblock.json"] },
				{ root: new File(toolRoot, "src-builder"), suffixes: [".ts"] },
				{ root: new File(toolRoot, "package.json"), suffixes: ["package.json"] },
				{ root: new File(toolRoot, "package-lock.json"), suffixes: ["package-lock.json"] },
				{ root: new File(engineDir(), "blocks"), suffixes: [".block.js", ".browser.js"] }
			].forEach(function (target) {
				frontendFingerprintFiles(target.root, target.suffixes, stableEntries, stableVisited);
			});
			referenceRoots.forEach(function (root) {
				frontendFingerprintFiles(new File(root, "libs/flow/blocks"),
					[".block.js", ".browser.js"], stableEntries, stableVisited);
				frontendFingerprintFiles(new File(root, "libs/flow/frontbuilder/svelte/components"),
					[".flow.svelte", ".svelte"], stableEntries, stableVisited);
			});
			stableEntries.sort();
			stableFingerprint = sha256Hex(stableEntries.join("\n"));
			runtimeState.frontendDependencyFingerprints[stableCacheKey] = stableFingerprint;
		}
		// Project authoring sources may also be changed by Studio reloads or a
		// filesystem watcher. Keep this small part live so persistent cache keys
		// remain valid across Flow runtime generations.
		var mutableEntries = [];
		var mutableVisited = {};
		[
			{ root: sourceRoot, suffixes: [".flow.svelte", ".flow.css", ".flow-route.json"] },
			{ root: new File(projectRoot, "libs/flow/blocks"), suffixes: [".block.js", ".browser.js"] },
			{ root: new File(projectRoot, "libs/flow/frontbuilder/svelte/components"), suffixes: [".svelte"] }
		].forEach(function (target) {
			frontendFingerprintFiles(target.root, target.suffixes, mutableEntries, mutableVisited);
		});
		mutableEntries.sort();
		return sha256Hex(stableFingerprint + "\n" + mutableEntries.join("\n"));
	}

	function frontendDocumentFingerprint(source, drafts, sourceFile, resourceRoot, projectRoot) {
		return sha256Hex([
			source,
			JSON.stringify(drafts || {}),
			frontendDocumentDependenciesFingerprint(sourceFile, resourceRoot, projectRoot)
		].join("\n"));
	}

	function invalidateFrontendDocumentCaches() {
		runtimeState.frontendDependencyFingerprints = {};
		cacheUtils().clearBoundedMap(runtimeState.caches.frontendDocuments);
	}

	function clearPersistentFrontendDocuments() {
		invalidateFrontendDocumentCaches();
		var directory = frontendDocumentCacheDir();
		try {
			if (directory.isDirectory()) {
				FileUtils.deleteDirectory(directory);
			}
		} catch (e) {
			runtimeState.persistentFrontendDocuments.errors++;
		}
		runtimeState.persistentFrontendDocuments.hits = 0;
		runtimeState.persistentFrontendDocuments.misses = 0;
		runtimeState.persistentFrontendDocuments.writes = 0;
		runtimeState.persistentFrontendDocuments.pruned = false;
	}

	function applyFlowSvelteSourceMutationRequest(request) {
		invalidateFrontendDocumentCaches();
		var sourcePath = String(request.sourceFile || request.sourcePath || "");
		var sourceFile = frontendRequestSourceFile(request, request.source === undefined || request.source === null);
		var source = request.source !== undefined && request.source !== null
			? String(request.source)
			: String(FileUtils.readFileToString(sourceFile, "UTF-8"));
		var mutations = request.mutations || (request.mutation ? [request.mutation] : []);
		if (mutations.length === 0) {
			raise("MISSING_FRONTEND_MUTATION", "Frontend source mutation requires mutation or mutations.");
		}
		var results = [];
		for (var i = 0; i < mutations.length; i++) {
			var result = applyOneFlowSvelteSourceMutation(request, source, mutations[i], sourceFile, sourcePath);
			source = String(result.source || "");
			results.push({
				ok: result.ok === true,
				target: result.target || "flowSvelte",
				mutation: result.mutation || mutations[i],
				debug: result.debug || null
			});
		}
		var out = {
			ok: true,
			source: source,
			sourceFile: String(sourceFile.getAbsolutePath()),
			mutationCount: mutations.length,
			mutations: mutations,
			results: results
		};
		if (mutations.length === 1) {
			out.mutation = mutations[0];
			out.target = results[0] && results[0].target || "flowSvelte";
			if (results[0] && results[0].debug) {
				out.debug = results[0].debug;
			}
		}
		if (request.authoringRootPath) {
			try {
				var projectionDrafts = Object.assign({}, frontendSourceDrafts(request));
				projectionDrafts[String(sourceFile.getCanonicalPath())] = source;
				var projectionSourceFile = sourceFile;
				if (String(sourceFile.getName()).endsWith(".flow.css")) {
					var projectionInfo = frontbuilderSettingsForRequest(request);
					var configuredModel = frontendModelPath(request, projectionInfo);
					if (configuredModel && configuredModel.isFile()) {
						projectionSourceFile = configuredModel.getCanonicalFile();
					}
				}
				var projectionRequest = Object.assign({}, request, {
					sourceFile: String(projectionSourceFile.getAbsolutePath()),
					sourcePath: String(projectionSourceFile.getAbsolutePath()),
					sourceDrafts: projectionDrafts,
					frontendSourceDrafts: projectionDrafts,
					includeBindings: false
				});
				if (projectionSourceFile !== sourceFile) {
					delete projectionRequest.source;
				} else {
					projectionRequest.source = source;
				}
				var projectedDocument = describeFrontendDocument(projectionRequest);
				out.authoringTree = flowTreeService().authoringSourceTreeRequest({
					sourceFile: String(sourceFile.getAbsolutePath()),
					sourcePath: String(sourceFile.getAbsolutePath()),
					authoringRootPath: String(request.authoringRootPath),
					document: projectedDocument,
					documentTree: projectedDocument && projectedDocument.tree
				}, flowTreeServiceEnv());
			} catch (projectionError) {
				out.authoringTree = {
					ok: false,
					target: "authoringSource",
					children: [],
					error: {
						code: "AUTHORING_SOURCE_PROJECTION_FAILED",
						message: String(projectionError && projectionError.message || projectionError)
					}
				};
			}
		}
		return out;
	}

	function applyOneFlowSvelteSourceMutation(request, source, mutation, sourceFile, sourcePath) {
		mutation = mutation || {};
		var frontAstResult = null;
		try {
			frontAstResult = applyFrontAstSourceMutation(source, mutation, sourceFile);
		} catch (frontAstError) {
			// An unexpected fast-path failure is a mutation bug, not a signal to
			// rewrite the whole document through the slower Svelte serializer.
			// That rewrite can alter unrelated binding syntax before the caller
			// notices the original problem.
			if (!frontAstError.code) {
				frontAstError.code = "FRONTEND_FAST_MUTATION_FAILED";
			}
			throw frontAstError;
		}
		if (frontAstResult) {
			return frontAstResult;
		}
		var resourceRoot = frontendSvelteResourceRoot(request);
		var sourceTemp = File.createTempFile("c8o-flow-svelte-source-", ".flow.svelte");
		var mutationTemp = File.createTempFile("c8o-flow-svelte-mutation-", ".json");
		try {
			FileUtils.writeStringToFile(sourceTemp, source, "UTF-8");
			FileUtils.writeStringToFile(mutationTemp, JSON.stringify(mutation), "UTF-8");
			var output = frontendRunProviderOneShot(resourceRoot, "src-builder/sourceMutateCli.ts", [
				"--source-file", String(sourceFile.getAbsolutePath()),
				"--source-input", String(sourceTemp.getAbsolutePath()),
				"--mutation", String(mutationTemp.getAbsolutePath())
			], "Svelte source mutate", "__C8O_FLOW_SOURCE_MUTATION__");
			var result = frontendMarkedJson(output, "__C8O_FLOW_SOURCE_MUTATION__");
			if (!result || result.ok !== true || typeof result.source !== "string") {
				var error = new Error("Svelte source mutation did not return a valid source.");
				error.code = "FRONTEND_SOURCE_MUTATION_INVALID_RESULT";
				error.hint = "Check src-builder/sourceMutateCli.ts output for " + sourcePath + ".";
				throw error;
			}
			return {
				ok: true,
				source: result.source,
				sourceFile: String(sourceFile.getAbsolutePath()),
				mutation: mutation
			};
		} finally {
			try {
				sourceTemp["delete"]();
			} catch (e1) {
			}
			try {
				mutationTemp["delete"]();
			} catch (e2) {
			}
		}
	}

	function applyFrontAstSourceMutation(source, mutation, sourceFile) {
		mutation = mutation || {};
		var requestedPath = String(mutation.path || "");
		var path = requestedPath;
		if (path.indexOf("frontAst") !== 0) {
			return null;
		}
		var sourceText = String(source || "");
		if (sourceText.indexOf("<FlowComponent") < 0) {
			var nonCanonical = new Error("Svelte Flow source is not canonical: missing <FlowComponent>.");
			nonCanonical.code = "FRONTAST_SOURCE_NOT_CANONICAL";
			nonCanonical.hint = "Migrate the page/component to the FlowComponent source format before editing it from the tree.";
			throw nonCanonical;
		}
		var root = frontAstParseSource(sourceText);
		if (!root) {
			var invalid = new Error("Svelte Flow source is not canonical: unable to parse the root <FlowComponent>.");
			invalid.code = "FRONTAST_SOURCE_INVALID";
			invalid.hint = "Check that the source contains a single valid FlowComponent root before editing it from the tree.";
			throw invalid;
		}
		var op = frontAstNormalizeOp(String(mutation.op || "replace"));
		if ((op === "replace" || op === "merge") && frontAstPropertyPayload(mutation.value)) {
			var target = frontAstValueAtPath(root, path, false);
			if (frontAstIsNode(target) && path.indexOf(".props") < 0) {
				path += ".props";
			}
		} else if (op === "replace" || op === "merge") {
			path = frontAstNormalizePropertyPath(root, path);
		}
		var debug = {
			op: op,
			path: path,
			requestedPath: requestedPath,
			propertyPathNormalized: path !== requestedPath,
			from: String(mutation.from || mutation.source || ""),
			fromId: String(mutation.fromId || ""),
			sourceFile: String(sourceFile.getAbsolutePath())
		};
		if (op === "setEnabled") {
			var enabledTarget = frontAstValueAtPath(root, path, false);
			if (!frontAstIsNode(enabledTarget)) {
				throw new Error("Unknown FrontAst enable/disable target: " + path);
			}
			debug.targetTag = String(enabledTarget.tag || "");
			debug.enabled = mutation.enabled !== false;
			if (mutation.enabled === false) {
				enabledTarget.attrs.enabled = false;
				enabledTarget.attrSyntax.enabled = "expression";
			} else {
				delete enabledTarget.attrs.enabled;
				delete enabledTarget.attrSyntax.enabled;
			}
		} else if (op === "append" || op === "insert") {
			var array = frontAstArrayAtPath(root, path, true);
			var value = frontAstTemplateNode(mutation.value || {});
			var index = op === "insert" && mutation.index !== undefined && mutation.index !== null
				? frontAstClamp(Number(mutation.index), 0, array.length)
				: array.length;
			debug.beforeLength = array.length;
			debug.index = index;
			debug.insertTag = value.tag;
			debug.insertId = String(value.attrs && value.attrs.id || "");
			array.splice(index, 0, value);
			debug.afterLength = array.length;
		} else if (op === "delete") {
			var location = frontAstNodeLocation(root, path);
			if (!location) {
				throw new Error("Unknown FrontAst mutation path: " + path);
			}
			debug.sourceIndex = location.index;
			debug.sourceTag = String(location.array[location.index] && location.array[location.index].tag || "");
			debug.sourceId = String(location.array[location.index] && location.array[location.index].attrs
				&& location.array[location.index].attrs.id || "");
			location.array.splice(location.index, 1);
		} else if (op === "move") {
			var from = String(mutation.from || mutation.source || "");
			var sourceLocation = String(mutation.fromId || "")
				? frontAstNodeLocationById(root, path, String(mutation.fromId || ""))
				: null;
			debug.foundById = !!sourceLocation;
			if (!sourceLocation) {
				sourceLocation = frontAstNodeLocation(root, from);
			}
			if (!sourceLocation) {
				throw new Error("Unknown FrontAst move source: " + from);
			}
			var targetArray = frontAstArrayAtPath(root, path, true);
			var targetIndex = mutation.index !== undefined && mutation.index !== null
				? frontAstClamp(Number(mutation.index), 0, targetArray.length)
				: targetArray.length;
			debug.sourceIndex = sourceLocation.index;
			var moved = sourceLocation.array.splice(sourceLocation.index, 1)[0];
			debug.sourceTag = String(moved && moved.tag || "");
			debug.sourceId = String(moved && moved.attrs && moved.attrs.id || "");
			debug.targetIndex = targetIndex;
			debug.sameArray = sourceLocation.array === targetArray;
			debug.targetLengthBeforeInsert = targetArray.length;
			targetArray.splice(targetIndex, 0, moved);
			debug.targetLengthAfterInsert = targetArray.length;
		} else if (op === "replace" || op === "merge") {
			var mutationValue = frontAstValidateBindingMutation(root, path, mutation.value);
			frontAstSetValueAtPath(root, path, mutationValue, op === "merge");
		} else {
			throw new Error("Unsupported FrontAst mutation op: " + String(mutation.op || ""));
		}
		var nextSource = frontAstRenderSource(sourceText, root);
		debug.changed = nextSource !== sourceText;
		frontendStudioLog("[Flow frontend DnD] frontAst mutation " + JSON.stringify(debug), !debug.changed);
		return {
			ok: true,
			target: "frontAst",
			source: nextSource,
			sourceFile: String(sourceFile.getAbsolutePath()),
			mutation: mutation,
			debug: debug
		};
	}

	function frontAstIsNode(value) {
		return !!(value && typeof value === "object" && typeof value.tag === "string" && value.attrs && typeof value.attrs === "object");
	}

	function frontAstPropertyPayload(value) {
		if (!frontAstIsObject(value)) {
			return false;
		}
		var structural = { tag: true, attrs: true, children: true, slots: true, selfClosing: true };
		return Object.keys(value).every(function (key) {
			return structural[key] !== true;
		});
	}

	function frontAstNormalizePropertyPath(root, path) {
		path = String(path || "");
		if (path.indexOf(".props.") >= 0) {
			return path;
		}
		var match = /^(.*)\.([^.[\]]+)$/.exec(path);
		if (!match) {
			return path;
		}
		var node = frontAstValueAtPath(root, match[1], false);
		if (!frontAstIsNode(node)) {
			return path;
		}
		var name = match[2];
		var definitions = frontAstPropertyDefinitions(frontAstCanonicalKind(node.tag));
		if (!Object.prototype.hasOwnProperty.call(node.attrs || {}, name)
				&& !Object.prototype.hasOwnProperty.call(definitions || {}, name)) {
			return path;
		}
		return match[1] + ".props." + name;
	}

	function frontAstValidateBindingMutation(root, path, value) {
		var propsMatch = /^(.*)\.props$/.exec(String(path || ""));
		if (propsMatch && frontAstIsObject(value)) {
			var propsNode = frontAstValueAtPath(root, propsMatch[1], false);
			var normalized = {};
			for (var key in value) {
				if (Object.prototype.hasOwnProperty.call(value, key)) {
					normalized[key] = frontAstValidateBindingProperty(propsNode, key, value[key]);
				}
			}
			return normalized;
		}
		var propertyMatch = /^(.*)\.props\.([^.[\]]+)$/.exec(String(path || ""));
		if (!propertyMatch) {
			return value;
		}
		return frontAstValidateBindingProperty(
			frontAstValueAtPath(root, propertyMatch[1], false), propertyMatch[2], value);
	}

	function frontAstValidateBindingProperty(node, name, value) {
		if (!node || !node.tag) {
			return value;
		}
		var definitions = frontAstPropertyDefinitions(frontAstCanonicalKind(node.tag));
		var definition = definitions[String(name || "")] || {};
		if (definition.kind !== "binding" && definition.type !== "binding") {
			return value;
		}
		var normalized = frontAstBindingValue(value);
		if (normalized === "" || normalized === null || normalized === undefined) {
			return normalized;
		}
			if (definition.allowLiteral === true && typeof normalized === "string" && !frontAstIsBindingReference(normalized)) {
				return normalized;
			}
			if (!frontAstIsFlowValueBinding(normalized) && !frontAstIsBindingReference(normalized)) {
			var error = new Error("Property " + name + " requires an intuitive @reference or structured FlowValueBinding. Use @action.path, @item.path, or the binding returned by the picker.");
			error.code = "FRONTEND_BINDING_REQUIRED";
			error.hint = "Select a schema-backed picker candidate and pass its mutation unchanged.";
			throw error;
		}
		return normalized;
	}

	function frontAstIsBindingReference(value) {
		return typeof value === "string" && /^@[A-Za-z_$][A-Za-z0-9_$]*(?:(?:\.[A-Za-z_$][A-Za-z0-9_$]*)|(?:\[\d+\]))*$/.test(value.trim());
	}

	function frontAstBindingValue(value) {
		if (typeof value !== "string") {
			return value;
		}
		var text = value.trim();
		if (text.charAt(0) !== "{") {
			return value;
		}
		try {
			return JSON.parse(text);
		} catch (e) {
			return value;
		}
	}

	function frontAstIsFlowValueBinding(value) {
		if (!frontAstIsObject(value)) {
			return false;
		}
		if (value.mode === "literal") {
			return Object.prototype.hasOwnProperty.call(value, "value");
		}
		if (value.mode === "expression") {
			if (typeof value.expression === "string") {
				return true;
			}
			return Object.prototype.toString.call(value.parts) === "[object Array]" && value.parts.length > 0
				&& value.parts.every(frontAstIsFlowExpressionPart);
		}
		if (value.mode !== "source" || !frontAstIsObject(value.source) || !frontAstBindingPath(value.path)) {
			return false;
		}
		var source = value.source;
		if (source.category === "requestable" || source.category === "action") {
			return typeof source.actionId === "string" && source.actionId !== "";
		}
			if (source.category === "fullsync") {
				return typeof source.actionId === "string" && source.actionId !== ""
					&& typeof source.operation === "string" && source.operation !== "";
			}
			if (source.category === "local") {
				return typeof source.name === "string" && source.name !== ""
					&& typeof source.scopeId === "string" && source.scopeId !== "";
			}
			if (source.category === "iteration") {
				return typeof source.scopeId === "string" && source.scopeId !== ""
					&& (source.value === "item" || source.value === "index" || source.value === "iterable");
			}
			if (source.category === "event") {
				return source.value === "event";
			}
			return source.category === "route" && source.value === "route";
	}

	function frontAstIsFlowExpressionPart(part) {
		if (!frontAstIsObject(part)) {
			return false;
		}
		if (part.kind === "literal") {
			return Object.prototype.hasOwnProperty.call(part, "value");
		}
		if (part.kind === "expression") {
			return typeof part.expression === "string";
		}
		if (part.kind === "source") {
			return frontAstIsFlowValueBinding({ mode: "source", source: part.source, path: part.path });
		}
		return false;
	}

	function frontAstBindingPath(path) {
		if (path === undefined || path === null) {
			return true;
		}
		if (Object.prototype.toString.call(path) !== "[object Array]") {
			return false;
		}
		for (var i = 0; i < path.length; i++) {
			var segment = path[i];
			if (!frontAstIsObject(segment) || !(
				(segment.kind === "property" && typeof segment.name === "string")
				|| (segment.kind === "index" && typeof segment.index === "number" && isFinite(segment.index)))) {
				return false;
			}
		}
		return true;
	}

	function frontAstParseSource(source) {
		var holder = { tag: "__root__", attrs: {}, children: [] };
		var stack = [holder];
		var text = String(source || "");
		var index = 0;
		while (index < text.length) {
			var start = text.indexOf("<", index);
			if (start < 0) {
				break;
			}
			if (text.substring(start, start + 4) === "<!--") {
				var commentEnd = text.indexOf("-->", start + 4);
				index = commentEnd < 0 ? text.length : commentEnd + 3;
				continue;
			}
			if (text.charAt(start + 1) === "/") {
				var closeEnd = text.indexOf(">", start + 2);
				if (closeEnd < 0) {
					break;
				}
				if (stack.length > 1) {
					stack.pop();
				}
				index = closeEnd + 1;
				continue;
			}
			if (text.charAt(start + 1) === "!" || text.charAt(start + 1) === "?") {
				var declarationEnd = text.indexOf(">", start + 2);
				index = declarationEnd < 0 ? text.length : declarationEnd + 1;
				continue;
			}
			var end = frontAstTagEnd(text, start + 1);
			if (end < 0) {
				break;
			}
			var raw = text.substring(start + 1, end);
			var parsed = frontAstParseTag(raw);
			if (parsed && parsed.tag) {
				stack[stack.length - 1].children.push(parsed);
				if (!parsed.selfClosing) {
					stack.push(parsed);
				}
			}
			index = end + 1;
		}
		for (var i = 0; i < holder.children.length; i++) {
			if (holder.children[i].tag === "FlowComponent") {
				return holder.children[i];
			}
		}
		return null;
	}

	function frontAstTagEnd(text, start) {
		var quote = "";
		var braces = 0;
		for (var i = start; i < text.length; i++) {
			var ch = text.charAt(i);
			if (quote) {
				if (ch === quote && text.charAt(i - 1) !== "\\") {
					quote = "";
				}
				continue;
			}
			if (ch === "\"" || ch === "'") {
				quote = ch;
				continue;
			}
			if (ch === "{") {
				braces++;
				continue;
			}
			if (ch === "}" && braces > 0) {
				braces--;
				continue;
			}
			if (ch === ">" && braces === 0) {
				return i;
			}
		}
		return -1;
	}

	function frontAstParseTag(raw) {
		raw = String(raw || "");
		var trimmed = raw.replace(/^\s+|\s+$/g, "");
		if (!trimmed) {
			return null;
		}
		var selfClosing = /\/\s*$/.test(trimmed);
		if (selfClosing) {
			trimmed = trimmed.replace(/\/\s*$/, "");
		}
		var match = /^([A-Za-z_$][A-Za-z0-9_$.-]*)/.exec(trimmed);
		if (!match) {
			return null;
		}
		var tag = match[1];
		var parsedAttributes = frontAstParseAttributes(trimmed.substring(match[0].length));
		return {
			tag: tag,
			attrs: parsedAttributes.values,
			attrSyntax: parsedAttributes.syntax,
			children: [],
			selfClosing: selfClosing
		};
	}

	function frontAstParseAttributes(text) {
		var attrs = {};
		var syntax = {};
		var i = 0;
		text = String(text || "");
		while (i < text.length) {
			while (i < text.length && /\s/.test(text.charAt(i))) {
				i++;
			}
			if (i >= text.length) {
				break;
			}
			var nameStart = i;
			while (i < text.length && !/[\s=]/.test(text.charAt(i))) {
				i++;
			}
			var name = text.substring(nameStart, i);
			while (i < text.length && /\s/.test(text.charAt(i))) {
				i++;
			}
			if (text.charAt(i) !== "=") {
				attrs[name] = true;
				syntax[name] = "boolean";
				continue;
			}
			i++;
			while (i < text.length && /\s/.test(text.charAt(i))) {
				i++;
			}
			var ch = text.charAt(i);
			if (ch === "\"" || ch === "'") {
				var quote = ch;
				i++;
				var valueStart = i;
				while (i < text.length && !(text.charAt(i) === quote && text.charAt(i - 1) !== "\\")) {
					i++;
				}
				attrs[name] = text.substring(valueStart, i).replace(/\\"/g, "\"").replace(/\\'/g, "'");
				syntax[name] = "quoted";
				i++;
			} else if (ch === "{") {
				var end = frontAstExpressionEnd(text, i);
				attrs[name] = frontAstParseAttributeExpression(text.substring(i + 1, end));
				syntax[name] = "expression";
				i = end + 1;
			} else {
				var bareStart = i;
				while (i < text.length && !/\s/.test(text.charAt(i))) {
					i++;
				}
				attrs[name] = text.substring(bareStart, i);
				syntax[name] = "bare";
			}
		}
		return { values: attrs, syntax: syntax };
	}

	function frontAstParseAttributeExpression(value) {
		value = String(value || "");
		var trimmed = value.replace(/^\s+|\s+$/g, "");
		var first = trimmed.charAt(0);
		var last = trimmed.charAt(trimmed.length - 1);
		if ((first === "{" && last === "}") || (first === "[" && last === "]")) {
			try {
				return JSON.parse(trimmed);
			} catch (e) {
				try {
					return parseYamlSource(trimmed, "{}");
				} catch (ignored) {
					// Preserve non-literal Svelte expressions for the renderer.
				}
			}
		}
		return value;
	}

	function frontAstExpressionEnd(text, start) {
		var quote = "";
		var braces = 0;
		for (var i = start; i < text.length; i++) {
			var ch = text.charAt(i);
			if (quote) {
				if (ch === quote && text.charAt(i - 1) !== "\\") {
					quote = "";
				}
				continue;
			}
			if (ch === "\"" || ch === "'") {
				quote = ch;
				continue;
			}
			if (ch === "{") {
				braces++;
				continue;
			}
			if (ch === "}") {
				braces--;
				if (braces === 0) {
					return i;
				}
			}
		}
		return text.length;
	}

	function frontAstArrayAtPath(root, path, create) {
		var value = frontAstValueAtPath(root, path, create);
		if (!value || !value.splice) {
			throw new Error("FrontAst path is not an array: " + path);
		}
		return value;
	}

	function frontAstNodeLocation(root, path) {
		var match = /^(.*)\[(\d+)\]$/.exec(String(path || ""));
		if (!match) {
			return null;
		}
		var array = frontAstArrayAtPath(root, match[1], false);
		var index = Number(match[2]);
		return index >= 0 && index < array.length ? { array: array, index: index } : null;
	}

	function frontAstNodeLocationById(root, arrayPath, id) {
		try {
			var array = frontAstArrayAtPath(root, arrayPath, false);
			for (var i = 0; i < array.length; i++) {
				if (String(array[i] && array[i].attrs && array[i].attrs.id || "") === id) {
					return { array: array, index: i };
				}
			}
		} catch (e) {
		}
		return null;
	}

	function frontAstValueAtPath(root, path, create) {
		var tokens = frontAstPathTokens(path);
		var current = root;
		for (var i = 0; i < tokens.length; i++) {
			var token = tokens[i];
			if (token === "frontAst") {
				continue;
			}
			if (current === undefined || current === null) {
				throw frontAstPathError(path, tokens, i);
			}
			if (token === "slots" && typeof tokens[i + 1] === "string") {
				current = frontAstSlotNode(current, String(tokens[i + 1]), create);
				i++;
				continue;
			}
			if (token === "children") {
				if (!current.children && create) {
					current.children = [];
				}
				current = current.children;
				continue;
			}
			if (token === "props") {
				if (!current.attrs && create) {
					current.attrs = {};
				}
				current = current.attrs;
				continue;
			}
			if (typeof token === "number") {
				current = current[token];
				continue;
			}
			current = current ? current[token] : undefined;
		}
		return current;
	}

	function frontAstPathError(path, tokens, index) {
		var traversed = tokens.slice(0, index).map(function (token) {
			return typeof token === "number" ? "[" + token + "]" : String(token);
		}).join(".").replace(/\.\[/g, "[");
		var error = new Error("Unknown FrontAst mutation path after " + traversed + ": " + path);
		error.code = "FRONTAST_PATH_NOT_FOUND";
		error.hint = "Refresh the authoring tree and retry with the mutation path returned by the selected node.";
		return error;
	}

	function frontAstSetValueAtPath(root, path, value, merge) {
		var tokens = frontAstPathTokens(path);
		var current = root;
		for (var i = 0; i < tokens.length - 1; i++) {
			var token = tokens[i];
			if (token === "frontAst") {
				continue;
			}
			if (token === "slots" && typeof tokens[i + 1] === "string") {
				current = frontAstSlotNode(current, String(tokens[i + 1]), false);
				i++;
				continue;
			}
			if (token === "children") {
				current = current.children;
				continue;
			}
			if (token === "props") {
				current = current.attrs;
				continue;
			}
			current = current[token];
		}
		var last = tokens[tokens.length - 1];
		if (last === "props") {
			if (!current.attrs) {
				current.attrs = {};
			}
			if (merge && frontAstIsObject(value)) {
				for (var propKey in value) {
					if (Object.prototype.hasOwnProperty.call(value, propKey)) {
						current.attrs[propKey] = value[propKey];
					}
				}
			} else {
				current.attrs = frontAstIsObject(value) ? value : {};
			}
			return;
		}
		if (merge && frontAstIsObject(current[last]) && frontAstIsObject(value)) {
			for (var key in value) {
				if (Object.prototype.hasOwnProperty.call(value, key)) {
					current[last][key] = value[key];
				}
			}
		} else if (typeof last === "number" && current && current.splice && frontAstIsObject(value)
				&& (value.tag || value.kind || value.children || value.slots)) {
			current[last] = frontAstTemplateNode(value);
		} else {
			current[last] = value;
		}
	}

	function frontAstPathTokens(path) {
		var tokens = [];
		var parts = String(path || "").split(".");
		for (var i = 0; i < parts.length; i++) {
			var match = /^([^\[]+)(?:\[(\d+)\])?$/.exec(parts[i]);
			if (!match) {
				throw new Error("Unsupported FrontAst path segment: " + parts[i]);
			}
			tokens.push(match[1]);
			if (match[2] !== undefined) {
				tokens.push(Number(match[2]));
			}
		}
		return tokens;
	}

	function frontAstSlotNode(node, name, create) {
		if (!node) {
			var error = new Error("Cannot resolve FrontAst slot '" + name + "' without a parent node.");
			error.code = "FRONTAST_SLOT_PARENT_MISSING";
			throw error;
		}
		var tag = name === "children" && node && node.tag === "ForEach"
			? "Each"
			: frontAstSlotTag(name);
		var children = node.children || [];
		for (var i = 0; i < children.length; i++) {
			if (children[i].tag === tag) {
				return children[i];
			}
		}
		// Both tags are canonical for a ForEach body. New sources use Each,
		// while older Flow Svelte projects still use Children.
		if (name === "children" && node && node.tag === "ForEach") {
			for (var j = 0; j < children.length; j++) {
				if (children[j].tag === "Children") {
					return children[j];
				}
			}
		}
		if (!create) {
			return undefined;
		}
		var slot = { tag: tag, attrs: {}, children: [], selfClosing: false };
		if (!node.children) {
			node.children = [];
		}
		node.children.push(slot);
		return slot;
	}

	function frontAstTemplateNode(value) {
		var record = frontAstIsObject(value) ? frontAstClone(value) : {};
		var explicitProps = frontAstIsObject(record.props) ? frontAstClone(record.props) : {};
		var rawSlots = record.slots;
		var rawChildren = record.children;
		var tag = String(record.tag || frontAstTagForKind(String(record.kind || record.label || "Node")));
		var kind = String(record.kind || frontAstCanonicalKind(tag));
		if (kind === "event") {
			kind = frontAstEventKindFromName(String(record.event || "click"));
			tag = frontAstEventTagForKind(kind);
		}
		var id = String(record.id || frontAstDefaultId(kind));
		delete record.children;
		delete record.props;
		delete record.slots;
		delete record.tag;
		for (var propKey in explicitProps) {
			if (Object.prototype.hasOwnProperty.call(explicitProps, propKey)) {
				record[propKey] = explicitProps[propKey];
			}
		}
		record.id = id;
		record.kind = kind;
		var node = { tag: tag, attrs: record, children: [], selfClosing: false };
		var slots = frontAstDefaultSlots(kind);
		for (var i = 0; i < slots.length; i++) {
			node.children.push({ tag: frontAstSlotTag(slots[i]), attrs: {}, children: [], selfClosing: false });
		}
		frontAstApplyTemplateSlots(node, kind, rawSlots, rawChildren);
		return node;
	}

	function frontAstApplyTemplateSlots(node, kind, rawSlots, rawChildren) {
		if (rawChildren !== undefined) {
			frontAstSetTemplateSlot(node, frontAstDirectChildrenSlot(kind), rawChildren);
		}
		if (!frontAstIsObject(rawSlots)) {
			return;
		}
		for (var name in rawSlots) {
			if (Object.prototype.hasOwnProperty.call(rawSlots, name)) {
				frontAstSetTemplateSlot(node, frontAstCanonicalSlotName(kind, name), rawSlots[name]);
			}
		}
	}

	function frontAstSetTemplateSlot(node, name, rawChildren) {
		var slot = frontAstTemplateSlotNode(node, name);
		slot.children = frontAstTemplateChildren(rawChildren);
		slot.selfClosing = false;
	}

	function frontAstTemplateSlotNode(node, name) {
		var tag = frontAstSlotTag(name);
		var children = node.children || (node.children = []);
		for (var i = 0; i < children.length; i++) {
			if (children[i].tag === tag) {
				return children[i];
			}
		}
		var slot = { tag: tag, attrs: {}, children: [], selfClosing: false };
		children.push(slot);
		return slot;
	}

	function frontAstTemplateChildren(value) {
		var raw = [];
		if (value && value.splice) {
			raw = value;
		} else if (frontAstIsObject(value) && value.children && value.children.splice) {
			raw = value.children;
		} else if (frontAstIsObject(value) && value.nodes && value.nodes.splice) {
			raw = value.nodes;
		}
		var out = [];
		for (var i = 0; i < raw.length; i++) {
			out.push(frontAstTemplateNode(raw[i]));
		}
		return out;
	}

	function frontAstDefaultSlots(kind) {
		if (kind === "button") {
			return ["events"];
		}
		if (frontAstEventKind(kind)) {
			return ["actions"];
		}
		if (kind === "callSequence") {
			return ["variables"];
		}
		if (kind === "if") {
			return ["then", "else"];
		}
		if (kind === "each") {
			return ["children", "else"];
		}
		if (kind === "await") {
			return ["pending", "then", "catch"];
		}
		if (kind === "table") {
			return ["data", "columns"];
		}
		if (frontAstSimpleChildrenKind(kind)) {
			return ["children"];
		}
		return [];
	}

	function frontAstSimpleChildrenKind(kind) {
		return kind === "pageShell"
			|| kind === "rowLayout"
			|| kind === "columnLayout"
			|| kind === "gridLayout"
			|| kind === "card";
	}

	function frontAstDirectChildrenSlot(kind) {
		return frontAstSimpleChildrenKind(kind) || kind === "each" ? "children" : "children";
	}

	function frontAstCanonicalSlotName(kind, name) {
		name = String(name || "");
		if (name === "default" && (kind === "each" || frontAstSimpleChildrenKind(kind))) {
			return "children";
		}
		return name;
	}

	function frontAstRenderComponent(root) {
		return frontAstRenderNode(root, 0) + "\n";
	}

	function frontAstRenderSource(originalSource, root) {
		var moduleScript = frontAstModuleScript(originalSource);
		return (moduleScript ? moduleScript.replace(/\s+$/g, "") + "\n\n" : "")
			+ frontAstRenderComponent(root).replace(/\s+$/g, "") + "\n";
	}

	function frontAstModuleScript(source) {
		var match = /<script\s+module(?:\s[^>]*)?>[\s\S]*?<\/script>/.exec(String(source || ""));
		return match ? match[0] : "";
	}

	function frontAstRenderNode(node, level) {
		var pad = new Array(level + 1).join("  ");
		var attrs = frontAstRenderAttributes(node.tag, node.attrs || {}, node.attrSyntax || {});
		var children = node.children || [];
		if (!children.length) {
			return pad + "<" + node.tag + (attrs ? " " + attrs : "") + " />";
		}
		var rendered = [];
		for (var i = 0; i < children.length; i++) {
			rendered.push(frontAstRenderNode(children[i], level + 1));
		}
		return pad + "<" + node.tag + (attrs ? " " + attrs : "") + ">\n"
			+ rendered.join("\n")
			+ "\n" + pad + "</" + node.tag + ">";
	}

	function frontAstRenderAttributes(tag, attrs, syntax) {
		var names = [];
		var order = frontAstPropOrder(tag, attrs);
		for (var i = 0; i < order.length; i++) {
			if (attrs[order[i]] !== undefined && attrs[order[i]] !== null && attrs[order[i]] !== "") {
				names.push(order[i]);
			}
		}
		for (var name in attrs) {
			if (!Object.prototype.hasOwnProperty.call(attrs, name)) {
				continue;
			}
			if (name === "kind" || name === "tag") {
				continue;
			}
			if (names.indexOf(name) < 0 && attrs[name] !== undefined && attrs[name] !== null && attrs[name] !== "") {
				names.push(name);
			}
		}
		var rendered = [];
		for (var j = 0; j < names.length; j++) {
			rendered.push(names[j] + "=" + frontAstRenderAttributeValue(names[j], attrs[names[j]], syntax[names[j]]));
		}
		return rendered.join(" ");
	}

	function frontAstRenderAttributeValue(name, value, syntax) {
		if (value && typeof value === "object") {
			return "{" + JSON.stringify(value) + "}";
		}
		if (typeof value === "number" || typeof value === "boolean") {
			return "{" + JSON.stringify(value) + "}";
		}
		var text = String(value);
		// Intuitive source bindings are always authored as strings, even when replacing
		// a property that previously held a Svelte expression.
		if (syntax === "quoted" || /^@[A-Za-z_$][A-Za-z0-9_$.-]*(?:\[[^\]]+\])?$/.test(text)) {
			return JSON.stringify(text);
		}
		if (syntax === "expression") {
			return "{" + text + "}";
		}
		var trimmed = text.replace(/^\s+|\s+$/g, "");
		if ((name === "test" || name === "condition" || name === "expression" || name === "value")
				&& /^-?\d+(?:\.\d+)?$|^true$|^false$/.test(trimmed)) {
			return "{" + trimmed + "}";
		}
		if ((name === "test" || name === "condition" || name === "expression" || name === "value")
				&& frontAstLooksLikeExpression(text)) {
			return "{" + text + "}";
		}
		return JSON.stringify(text);
	}

	function frontAstPropOrder(tag, attrs) {
		var kind = String((attrs || {}).kind || frontAstCanonicalKind(tag));
		if (tag === "FlowComponent") {
			return ["id", "label"];
		}
		if (kind === "if") {
			return ["id", "test"];
		}
		if (kind === "each") {
			return ["id", "source", "context", "index", "key"];
		}
		if (kind === "await") {
			return ["id", "expression"];
		}
		if (kind === "button") {
			return ["id", "label"];
		}
		if (frontAstEventKind(kind)) {
			return ["id", "event"];
		}
		if (kind === "callSequence") {
			return ["id", "requestable"];
		}
		if (kind === "setValue") {
			return ["id", "target", "value"];
		}
		if (kind === "navigate") {
			return ["id", "to", "replace"];
		}
		if (kind === "goBack") {
			return ["id", "fallback"];
		}
		if (kind === "table") {
			return ["id", "source"];
		}
		if (kind === "text") {
			return ["id", "text", "source"];
		}
		if (kind === "image") {
			return ["id", "src", "source", "alt"];
		}
		if (kind === "card") {
			return ["id", "padding", "radius", "variant"];
		}
		if (kind === "status" || kind === "json") {
			return ["id", "source"];
		}
		if (kind === "variable") {
			return ["name", "value"];
		}
		if (kind === "column") {
			return ["label", "path", "value"];
		}
		if (kind === "dataBinding") {
			return ["source", "value"];
		}
		return ["id", "label"];
	}

	function frontAstSlotTag(name) {
		var tags = {
			structure: "Structure",
			events: "Events",
			actions: "Actions",
			variables: "Variables",
			children: "Children",
			"default": "Default",
			then: "Then",
			"else": "Else",
			pending: "Pending",
			"catch": "Catch",
			columns: "Columns",
			data: "Data"
		};
		return tags[name] || frontAstTitle(name);
	}

	function frontAstTagForKind(kind) {
		if (kind === "json") {
			return "Json";
		}
		if (kind === "each") {
			return "ForEach";
		}
		if (frontAstEventKind(kind)) {
			return frontAstEventTagForKind(kind);
		}
		return frontAstTitle(kind);
	}

	function frontAstCanonicalKind(value) {
		value = String(value || "");
		if (value === "JSON") {
			return "json";
		}
		if (value === "ForEach") {
			return "each";
		}
		return value ? value.charAt(0).toLowerCase() + value.substring(1) : "";
	}

	function frontAstNormalizeOp(op) {
		if (op === "set") {
			return "replace";
		}
		if (op === "remove") {
			return "delete";
		}
		return op;
	}

	function frontAstLooksLikeExpression(value) {
		return /[.$()[\]?:]|=>|\|\||&&|\s/.test(value) && !/^[-A-Za-z0-9_ ]+$/.test(value);
	}

	function frontAstEventKind(kind) {
		return /^on[A-Z]/.test(String(kind || ""));
	}

	function frontAstEventTagForKind(kind) {
		kind = String(kind || "");
		return kind ? kind.charAt(0).toUpperCase() + kind.substring(1) : "OnClick";
	}

	function frontAstEventKindFromName(name) {
		return "on" + frontAstTitle(name).replace(/[^A-Za-z0-9_$]/g, "");
	}

	function frontAstDefaultId(kind) {
		return String(kind || "node");
	}

	function frontAstTitle(value) {
		value = String(value || "Node").replace(/[_-]+/g, " ");
		return value ? value.charAt(0).toUpperCase() + value.substring(1) : "Node";
	}

	function frontAstClamp(value, min, max) {
		if (!isFinite(value)) {
			return max;
		}
		return Math.min(max, Math.max(min, Math.floor(value)));
	}

	function frontAstClone(value) {
		return JSON.parse(JSON.stringify(value || {}));
	}

	function frontAstIsObject(value) {
		return value && typeof value === "object" && !value.splice;
	}

	function describeFrontAstDocument(source, request, sourceFile, projectRoot) {
		var root = frontAstParseSource(source);
		var meta = frontAstFlowMeta(source);
		var isPage = String(sourceFile.getName()) === "+page.flow.svelte" || !!meta.page || !!meta.app;
		if (!root && !isPage) {
			return null;
		}
		var sourceRoot = sourceFile.getParentFile();
		var components = [];
		var componentByTag = {};
		var componentById = {};
		if (root) {
			var ownComponent = frontAstComponentModel(root, sourceFile, projectRoot);
			components.push(ownComponent);
			componentByTag[frontAstComponentTag(sourceFile)] = ownComponent;
			componentById[String(ownComponent.id || "")] = ownComponent;
		}
		if (isPage) {
			var componentDir = new File(sourceRoot, "components");
			var files = [];
			if (componentDir.isDirectory()) {
				Arrays.asList(componentDir.listFiles()).toArray().forEach(function (file) {
					files.push(file);
				});
			}
			files.sort(function (a, b) {
				return String(a.getName()).localeCompare(String(b.getName()));
			});
			for (var i = 0; i < files.length; i++) {
				var file = files[i];
				if (!file.isFile() || !String(file.getName()).endsWith(".flow.svelte")) {
					continue;
				}
				var componentSource = frontAstSourceForFile(request, file);
				var componentRoot = frontAstParseSource(componentSource);
				if (!componentRoot) {
					continue;
				}
				var component = frontAstComponentModel(componentRoot, file, projectRoot);
				components.push(component);
				componentByTag[frontAstComponentTag(file)] = component;
				componentById[String(component.id || "")] = component;
			}
		}
		var componentRefs = isPage ? frontAstPageComponentRefs(source, componentByTag) : [];
		var app = frontAstClone(meta.app || {});
		var pageMeta = frontAstClone(meta.page || {});
		if (!app.id && pageMeta.id) {
			app.id = pageMeta.id;
		}
		if (!app.title && pageMeta.title) {
			app.title = pageMeta.title;
		}
		var model = {
			version: 1,
			builder: frontAstClone(meta.builder || {}),
			styling: frontAstClone(meta.styling || {}),
			layouts: frontAstClone(meta.layouts || []),
			app: app,
			components: components,
			clientActions: frontAstMergeById([].concat(
				frontAstArray(meta.clientActions),
				frontAstFlatten(components.map(function (component) { return component.clientActions || []; }))
			)),
			backendCalls: frontAstMergeById([].concat(
				frontAstArray(meta.backendCalls),
				frontAstFlatten(components.map(function (component) { return component.backendCalls || []; }))
			))
		};
		var pageRootNode = root ? components[0].nodes[0] : null;
		var routePageNodes = frontAstRoutePageNodes(sourceFile, sourceRoot, projectRoot, pageMeta, componentRefs, componentByTag, pageRootNode);
		var pageNodes = isPage
			? routePageNodes
			: root ? [components[0].nodes[0]] : routePageNodes;
		var children = isPage
			? frontAstAuthoringChildren(sourceFile, sourceRoot, projectRoot, pageMeta, componentRefs, componentByTag, components, pageRootNode)
			: [frontAstComponentSourceNode(sourceFile, sourceRoot, projectRoot, components[0])];
		return {
			ok: true,
			sourcePath: String(sourceFile.getAbsolutePath()),
			sourceRoot: String(sourceRoot.getAbsolutePath()),
			diagnostics: [],
			descriptors: [],
			tree: {
				sourcePath: String(sourceFile.getAbsolutePath()),
				sourceRoot: String(sourceRoot.getAbsolutePath()),
				children: children,
				app: app,
				pageNodes: pageNodes,
				components: components
			},
			pageNodes: pageNodes,
			componentRefs: componentRefs.map(function (ref) { return ref.tag; }),
			model: model
		};
	}

	function frontAstFlowMeta(source) {
		var start = String(source || "").indexOf("export const _flow");
		if (start < 0) {
			return {};
		}
		var equals = String(source).indexOf("=", start);
		var brace = String(source).indexOf("{", equals);
		if (brace < 0) {
			return {};
		}
		var end = frontAstMatchingBrace(source, brace);
		if (end < 0) {
			return {};
		}
		try {
			return eval("(" + String(source).substring(brace, end + 1) + ")") || {};
		} catch (e) {
			return {};
		}
	}

	function frontAstMatchingBrace(source, start) {
		var quote = "";
		var braces = 0;
		var text = String(source || "");
		for (var i = start; i < text.length; i++) {
			var ch = text.charAt(i);
			if (quote) {
				if (ch === quote && text.charAt(i - 1) !== "\\") {
					quote = "";
				}
				continue;
			}
			if (ch === "\"" || ch === "'" || ch === "`") {
				quote = ch;
				continue;
			}
			if (ch === "{") {
				braces++;
				continue;
			}
			if (ch === "}") {
				braces--;
				if (braces === 0) {
					return i;
				}
			}
		}
		return -1;
	}

	function frontAstComponentModel(root, sourceFile, projectRoot) {
		var rootNode = frontAstRootNodeModel(root, sourceFile, projectRoot);
		var actions = frontAstCompatibilityActions(rootNode);
		return {
			id: rootNode.id,
			name: rootNode.label,
			sourceFile: String(sourceFile.getAbsolutePath()),
			__sourceFile: String(sourceFile.getAbsolutePath()),
			nodes: [rootNode],
			widgets: [],
			clientActions: actions.clientActions,
			backendCalls: actions.backendCalls
		};
	}

	function frontAstRootNodeModel(root, sourceFile, projectRoot) {
		var id = String(root.attrs && root.attrs.id || "component");
		var label = String(root.attrs && (root.attrs.label || root.attrs.title) || frontAstTitle(id));
		var variablesPath = "frontAst.slots.variables.children";
		var eventsPath = "frontAst.slots.events.children";
		var variables = frontAstSlotModel(root, "variables", "frontAst", sourceFile, projectRoot);
		var events = frontAstSlotModel(root, "events", "frontAst", sourceFile, projectRoot);
		variables.slots.variables.accepts = ["ui.local.variable"];
		events.slots.events.accepts = ["ui.lifecycle"];
		return {
			id: id,
			kind: "frontendComponent",
			type: "component",
			tag: "FlowComponent",
			label: label,
			sourcePath: String(sourceFile.getAbsolutePath()),
			sourceRelativePath: frontAstRelativePath(sourceFile, projectRoot),
			sourceMutationPath: "frontAst",
			sourceWritable: true,
			traits: ["definition.uiBlock", "ui.container"],
			props: { id: id, label: label },
			propertyDefinitions: {
				id: { label: "Id", category: "Base properties", type: "string", readOnly: true },
				label: { label: "Label", category: "Base properties", kind: "text", type: "string" }
			},
			slots: {
				variables: frontAstRootSlotDefinition("variables", variablesPath, ["ui.local.variable"]),
				events: frontAstRootSlotDefinition("events", eventsPath, ["ui.lifecycle"]),
				structure: frontAstSlotDefinition("structure", "frontAst.slots.structure.children", true)
			},
			children: [
				variables,
				events,
				frontAstSlotModel(root, "structure", "frontAst", sourceFile, projectRoot)
			]
		};
	}

	function frontAstRootSlotDefinition(name, path, accepts) {
		var definition = frontAstSlotDefinition(name, path, true);
		definition.accepts = accepts;
		return definition;
	}

	function frontAstSlotModel(parent, slotName, parentPath, sourceFile, projectRoot) {
		var slot = frontAstSlotNode(parent, slotName, true);
		var path = parentPath + ".slots." + slotName + ".children";
		var children = [];
		var rawChildren = slot && slot.children || [];
		for (var i = 0; i < rawChildren.length; i++) {
			children.push(frontAstNodeModel(rawChildren[i], path + "[" + i + "]", sourceFile, projectRoot));
		}
		var spec = frontAstSlotSpec(slotName);
		return {
			id: slotName,
			kind: spec.kind,
			type: slotName,
			label: spec.label,
			sourcePath: String(sourceFile.getAbsolutePath()),
			sourceRelativePath: frontAstRelativePath(sourceFile, projectRoot),
			sourceMutationPath: path,
			sourceWritable: true,
			props: { count: children.length },
			traits: ["ui.container"],
			slots: frontAstSlotMap(slotName, path, true),
			children: children
		};
	}

	function frontAstNodeModel(node, path, sourceFile, projectRoot) {
		var tag = String(node.tag || "");
		var kind = frontAstCanonicalKind(tag);
		if (tag === "ForEach") {
			kind = "each";
		}
		if (frontAstEventTag(tag)) {
			kind = frontAstCanonicalKind(tag);
		}
		if (tag === "CallSequence") {
			kind = "callSequence";
		}
		if (tag === "SetValue") {
			kind = "setValue";
		}
		if (tag === "Variable") {
			kind = "variable";
		}
		if (tag === "Column") {
			kind = "column";
		}
		if (tag === "DataBinding") {
			kind = "dataBinding";
		}
		var props = frontAstClone(node.attrs || {});
		props.kind = kind;
		var id = String(props.id || (kind === "variable" ? "variable" : kind || tag || "node"));
		var label = frontAstNodeLabel(kind, tag, props);
		var slots = frontAstNodeSlots(kind);
		var children = [];
		for (var i = 0; i < slots.length; i++) {
			children.push(frontAstSlotModel(node, slots[i], path, sourceFile, projectRoot));
		}
		return {
			id: id,
			kind: frontAstVirtualKind(kind),
			type: tag,
			tag: tag,
			label: label,
			sourcePath: String(sourceFile.getAbsolutePath()),
			sourceRelativePath: frontAstRelativePath(sourceFile, projectRoot),
			sourceMutationPath: path,
			sourceWritable: true,
			props: props,
			descriptorId: frontAstDescriptorId(kind),
			icon: frontAstIcon(kind),
			propertyDefinitions: frontAstPropertyDefinitions(kind),
			traits: frontAstTraits(kind),
			slots: frontAstSlotDefinitionsForKinds(slots, path, true),
			children: children,
			sourcePropertyMutationPaths: frontAstPropertyMutationPaths(props, path, kind)
		};
	}

	function frontAstRoutePageNodes(sourceFile, sourceRoot, projectRoot, pageMeta, componentRefs, componentByTag, pageRootNode) {
		var page = frontAstPageNode(sourceFile, sourceRoot, projectRoot, pageMeta, componentRefs, componentByTag, pageRootNode);
		return page ? [page] : [];
	}

	function frontAstAuthoringChildren(sourceFile, sourceRoot, projectRoot, pageMeta, componentRefs, componentByTag, components, pageRootNode) {
		return [
			frontAstRoutesNode(sourceFile, sourceRoot, projectRoot, pageMeta, componentRefs, componentByTag, pageRootNode),
			frontAstLibraryNode(sourceRoot, projectRoot, components)
		];
	}

	function frontAstRoutesNode(sourceFile, sourceRoot, projectRoot, pageMeta, componentRefs, componentByTag, pageRootNode) {
		return {
			id: "routes",
			kind: "frontendRoutes",
			type: "routes",
			label: "Routes",
			sourcePath: String(sourceRoot.getAbsolutePath()),
			sourceRelativePath: frontAstRelativePath(sourceRoot, projectRoot),
			sourceWritable: true,
			props: { root: true, pathless: false },
			children: frontAstRoutePageNodes(sourceFile, sourceRoot, projectRoot, pageMeta, componentRefs, componentByTag, pageRootNode)
		};
	}

	function frontAstPageNode(sourceFile, sourceRoot, projectRoot, pageMeta, componentRefs, componentByTag, pageRootNode) {
		var pageId = String(pageMeta.id || "page");
		var title = String(pageMeta.title || pageId || "Page");
		var route = String(pageMeta.route || "/");
		var structureChildren = [];
		var structureSourcePath = String(sourceFile.getAbsolutePath());
		var structureMutationPath = "frontAst.slots.structure.children";
		if (pageRootNode) {
			var rootStructure = pageRootNode.children && pageRootNode.children[0];
			structureChildren = rootStructure && rootStructure.children || [];
		} else {
			for (var i = 0; i < componentRefs.length; i++) {
				structureChildren.push(frontAstComponentInstanceNode(componentRefs[i], i, sourceFile, projectRoot, componentByTag));
			}
			var defaultInsert = frontAstComponentInsertTarget(componentRefs.length ? componentRefs[0] : null, componentByTag);
			structureSourcePath = defaultInsert.sourcePath;
			structureMutationPath = defaultInsert.mutationPath;
		}
		return {
			id: "page_" + frontAstSafeName("page", String(sourceFile.getName()).replace(/\.flow\.svelte$/, "")),
			kind: "frontendPage",
			type: "page",
			label: title,
			sourcePath: String(sourceFile.getAbsolutePath()),
			sourceRelativePath: frontAstRelativePath(sourceFile, projectRoot),
			sourceWritable: true,
			frontendInsertSourcePath: structureSourcePath,
			frontendInsertMutationPath: structureMutationPath,
			props: { role: "page", id: pageId, title: title, route: route, kind: String(pageMeta.kind || "") },
			children: [{
				id: "structure",
				kind: "frontendStructure",
				type: "structure",
				label: "Structure",
				sourcePath: String(sourceFile.getAbsolutePath()),
				sourceRelativePath: frontAstRelativePath(sourceFile, projectRoot),
				sourceMutationPath: structureMutationPath,
				sourceWritable: true,
				frontendInsertSourcePath: structureSourcePath,
				frontendInsertMutationPath: structureMutationPath,
				props: { count: structureChildren.length },
				traits: ["ui.container"],
				slots: {
					structure: frontAstSlotDefinition("structure", structureMutationPath, true)
				},
				children: structureChildren
			}]
		};
	}

	function frontAstComponentInstanceNode(ref, index, sourceFile, projectRoot, componentByTag) {
		var component = componentByTag[ref.tag] || {};
		var componentSource = String(component.sourceFile || "");
		var componentId = String(component.id || frontAstCanonicalKind(ref.tag));
		var id = String(ref.attrs.id || componentId + (index + 1));
		var node = {
			id: id,
			kind: componentId,
			type: "Component",
			tag: ref.tag,
			label: id,
			sourcePath: String(sourceFile.getAbsolutePath()),
			sourceRelativePath: frontAstRelativePath(sourceFile, projectRoot),
			sourceMutationPath: "widgets[" + index + "]",
			props: {
				id: id,
				componentId: componentId,
				componentSourcePath: componentSource,
				componentSourceRelativePath: componentSource ? frontAstRelativePath(new File(componentSource), projectRoot) : undefined
			},
			frontendInsertSourcePath: componentSource,
			frontendInsertMutationPath: componentSource ? "frontAst.slots.structure.children" : "",
			traits: ["ui.container"],
			slots: componentSource ? {
				structure: frontAstSlotDefinition("structure", "frontAst.slots.structure.children", true)
			} : {},
			children: []
		};
		return node;
	}

	function frontAstComponentInsertTarget(ref, componentByTag) {
		var component = ref && componentByTag ? componentByTag[ref.tag] : null;
		var sourcePath = String(component && component.sourceFile || "");
		return {
			sourcePath: sourcePath,
			mutationPath: sourcePath ? "frontAst.slots.structure.children" : ""
		};
	}

	function frontAstLibraryNode(sourceRoot, projectRoot, components) {
		return {
			id: "library",
			kind: "frontendLibrary",
			type: "library",
			label: "Library",
			sourcePath: String(sourceRoot.getAbsolutePath()),
			sourceRelativePath: frontAstRelativePath(sourceRoot, projectRoot),
			children: [{
				id: "uiBlocks",
				kind: "frontendSharedComponents",
				type: "uiBlocks",
				label: "UI block sources",
				props: { count: components.length },
				children: components.map(function (component) {
					return frontAstComponentSourceNode(new File(String(component.sourceFile)), sourceRoot, projectRoot, component);
				})
			}]
		};
	}

	function frontAstComponentSourceNode(file, sourceRoot, projectRoot, component) {
		return {
			id: "flow_svelte_ui_block_" + frontAstSafeName("component", frontAstRelativePath(file, sourceRoot)),
			kind: "frontendComponent",
			type: "flow-svelte-ui-block",
			label: frontAstComponentTag(file),
			sourcePath: String(file.getAbsolutePath()),
			sourceRelativePath: frontAstRelativePath(file, projectRoot),
			props: {
				role: "component",
				libraryRoot: frontAstRelativePath(file.getParentFile(), projectRoot),
				componentName: frontAstComponentTag(file)
			},
			children: component && component.nodes || []
		};
	}

	function frontAstPageComponentRefs(source, componentByTag) {
		var body = String(source || "").replace(/<script[\s\S]*?<\/script>/g, "");
		var refs = [];
		var seen = {};
		var re = /<([A-Z][A-Za-z0-9_$]*)(\s[^>]*)?\/?>/g;
		var match;
		while ((match = re.exec(body)) !== null) {
			var tag = match[1];
			if (!componentByTag[tag] || seen[tag + ":" + match.index]) {
				continue;
			}
			seen[tag + ":" + match.index] = true;
			refs.push({ tag: tag, attrs: frontAstParseAttributes(String(match[2] || "").replace(/\/\s*$/, "")) });
		}
		return refs;
	}

	function frontAstSourceForFile(request, file) {
		var draft = frontendDraftForFile(request, file);
		return draft === null ? String(FileUtils.readFileToString(file, "UTF-8")) : draft;
	}

	function frontAstCompatibilityActions(rootNode) {
		var clientActions = [];
		var backendCalls = [];
		frontAstWalkNode(rootNode, function (node) {
			var kind = String(node.props && node.props.kind || "");
			if (kind === "setValue") {
				clientActions.push({
					id: String(node.props.id || "setValue"),
					kind: "setValue",
					target: String(node.props.target || node.props.id || "setValue"),
					value: node.props.value
				});
				return;
			}
			if (kind === "navigate") {
				clientActions.push({
					id: String(node.props.id || "navigate"),
					kind: "navigate",
					to: node.props.to,
					replace: node.props.replace === true
				});
				return;
			}
			if (kind === "goBack") {
				clientActions.push({
					id: String(node.props.id || "goBack"),
					kind: "goBack",
					fallback: node.props.fallback
				});
				return;
			}
			if (kind !== "callSequence") {
				return;
			}
			var requestable = String(node.props.requestable || "");
			var id = String(node.props.id || frontAstActionIdFromRequestable(requestable));
			var backendCall = frontAstActionIdFromRequestable(requestable) || id;
			clientActions.push({ id: id, kind: "backendCall", backendCall: backendCall });
			backendCalls.push({
				id: backendCall,
				requestable: requestable,
				parameters: frontAstVariablesFromNode(node)
			});
		});
		return {
			clientActions: frontAstMergeById(clientActions),
			backendCalls: frontAstMergeById(backendCalls)
		};
	}

	function frontAstVariablesFromNode(node) {
		var variables = {};
		var slot = frontAstChildSlot(node, "variables");
		(slot && slot.children || []).forEach(function (variable) {
			var name = String(variable.props && variable.props.name || "");
			if (name) {
				variables[name] = variable.props ? variable.props.value : "";
			}
		});
		return variables;
	}

	function frontAstWalkNode(node, visitor) {
		visitor(node);
		(node.children || []).forEach(function (child) {
			frontAstWalkNode(child, visitor);
		});
	}

	function frontAstChildSlot(node, name) {
		var children = node && node.children || [];
		for (var i = 0; i < children.length; i++) {
			if (children[i].type === name || children[i].id === name) {
				return children[i];
			}
		}
		return null;
	}

	function frontAstMergeById(items) {
		var out = [];
		var seen = {};
		(items || []).forEach(function (item) {
			var id = item && item.id || JSON.stringify(item);
			if (!seen[id]) {
				seen[id] = true;
				out.push(item);
			}
		});
		return out;
	}

	function frontAstFlatten(lists) {
		var out = [];
		(lists || []).forEach(function (list) {
			(list || []).forEach(function (item) {
				out.push(item);
			});
		});
		return out;
	}

	function frontAstArray(value) {
		return Object.prototype.toString.call(value) === "[object Array]" ? value : [];
	}

	function frontAstComponentTag(file) {
		return String(file.getName()).replace(/\.flow\.svelte$|\.svelte$/g, "");
	}

	function frontAstRelativePath(file, root) {
		try {
			if (!file || !root) {
				return "";
			}
			var filePath = String(file.getCanonicalPath());
			var rootPath = String(root.getCanonicalPath());
			return filePath === rootPath ? "" : filePath.indexOf(rootPath + File.separator) === 0
				? filePath.substring(rootPath.length + 1)
				: filePath;
		} catch (e) {
			return file ? String(file.getAbsolutePath()) : "";
		}
	}

	function frontAstNodeLabel(kind, tag, props) {
		if (kind === "text") {
			return String(props.text || "Text");
		}
		if (kind === "button") {
			return String(props.label || "Button");
		}
		if (kind === "callSequence") {
			return String(props.requestable || "CallSequence");
		}
		if (kind === "setValue") {
			return String(props.target || props.id || "Set value");
		}
		if (kind === "variable") {
			return String(props.name || "Variable");
		}
		if (kind === "column") {
			return String(props.label || props.path || "Column");
		}
		if (kind === "if") {
			return "If";
		}
		if (kind === "each") {
			return "ForEach";
		}
		if (kind === "await") {
			return "Await";
		}
		if (frontAstEventKind(kind)) {
			return frontAstEventTagForKind(kind);
		}
		return String(props.label || props.title || props.id || tag || frontAstTitle(kind));
	}

	function frontAstVirtualKind(kind) {
		if (frontAstEventKind(kind)) {
			return "frontendEventBlock";
		}
		if (kind === "callSequence" || kind === "setValue" || kind === "navigate" || kind === "goBack") {
			return "frontendActionBlock";
		}
		if (kind === "variable") {
			return "frontendActionVariable";
		}
		if (kind === "column" || kind === "dataBinding") {
			return "frontendDataBlock";
		}
		if (kind === "if" || kind === "each" || kind === "await") {
			return "frontendDirectiveBlock";
		}
		return kind;
	}

	function frontAstNodeSlots(kind) {
		if (kind === "button") {
			return ["events"];
		}
		if (frontAstEventKind(kind)) {
			return ["actions"];
		}
		if (kind === "callSequence") {
			return ["variables"];
		}
		if (kind === "if") {
			return ["then", "else"];
		}
		if (kind === "each") {
			return ["default", "else"];
		}
		if (kind === "await") {
			return ["pending", "then", "catch"];
		}
		if (kind === "table") {
			return ["columns", "data"];
		}
		return [];
	}

	function frontAstSlotSpec(name) {
		var specs = {
			structure: { label: "Structure", kind: "frontendStructure", accepts: ["ui.block", "ui.directive"] },
			events: { label: "Events", kind: "frontendEvents", accepts: ["ui.event"] },
			actions: { label: "Actions", kind: "frontendSlot", accepts: ["ui.action"] },
			variables: { label: "Variables", kind: "frontendActionVariables", accepts: ["ui.action.variable"] },
			"default": { label: "Each", kind: "frontendSlot", accepts: ["ui.block", "ui.directive"] },
			then: { label: "Then", kind: "frontendSlot", accepts: ["ui.block", "ui.directive"] },
			"else": { label: "Else", kind: "frontendSlot", accepts: ["ui.block", "ui.directive"] },
			pending: { label: "Pending", kind: "frontendSlot", accepts: ["ui.block", "ui.directive"] },
			"catch": { label: "Catch", kind: "frontendSlot", accepts: ["ui.block", "ui.directive"] },
			columns: { label: "Columns", kind: "frontendColumns", accepts: ["ui.table.column"] },
			data: { label: "Data", kind: "frontendDataBindings", accepts: ["ui.data.binding"] }
		};
		return specs[name] || { label: frontAstTitle(name), kind: "frontendSlot", accepts: ["ui.block"] };
	}

	function frontAstSlotDefinition(name, path, writable) {
		var spec = frontAstSlotSpec(name);
		return {
			id: name,
			label: spec.label,
			accepts: spec.accepts,
			sourceMutationPath: path,
			sourceWritable: writable !== false,
			ordered: true
		};
	}

	function frontAstSlotMap(name, path, writable) {
		var out = {};
		out[name] = frontAstSlotDefinition(name, path, writable);
		return out;
	}

	function frontAstSlotDefinitionsForKinds(slots, path, writable) {
		var out = {};
		(slots || []).forEach(function (name) {
			out[name] = frontAstSlotDefinition(name, path + ".slots." + name + ".children", writable);
		});
		return out;
	}

	function frontAstPropertyMutationPaths(props, path, kind) {
		var out = {};
		Object.keys(props || {}).forEach(function (key) {
			out[key] = path + ".props." + key;
		});
		Object.keys(frontAstPropertyDefinitions(kind) || {}).forEach(function (key) {
			out[key] = path + ".props." + key;
		});
		return out;
	}

	function frontAstPropertyDefinitions(kind) {
		var definitions = {
			text: {
				id: { label: "Id", kind: "text", type: "string" },
				text: { label: "Text", kind: "binding", type: "binding", allowLiteral: true },
				source: { label: "Source", kind: "binding", type: "binding", hidden: true }
			},
			image: {
				id: { label: "Id", kind: "text", type: "string" },
				src: { label: "Source", kind: "binding", type: "binding", allowLiteral: true },
				source: { label: "Source", kind: "binding", type: "binding", hidden: true }
			},
			button: {
				id: { label: "Id", kind: "text", type: "string" },
				label: { label: "Label", kind: "binding", type: "binding", allowLiteral: true },
				source: { label: "Source", kind: "binding", type: "binding", hidden: true }
			},
			status: {
				id: { label: "Id", kind: "text", type: "string" },
				text: { label: "Text", kind: "text", type: "string" },
				source: { label: "Source", kind: "path", type: "string" }
			},
			table: {
				id: { label: "Id", kind: "text", type: "string" },
				source: { label: "Source", kind: "binding", type: "object" }
			},
			json: {
				id: { label: "Id", kind: "text", type: "string" },
				source: { label: "Source", kind: "binding", type: "object" }
			},
			each: {
				id: { label: "Id", kind: "text", type: "string" },
				source: { label: "Source", kind: "binding", type: "object" },
				context: { label: "Context", kind: "text", type: "string" }
			},
			if: {
				test: { label: "Condition", category: "Logic", kind: "binding", type: "object" }
			},
			callSequence: {
				id: { label: "Id", category: "Base properties", type: "string" },
				target: { label: "Result target", category: "Action", type: "string" },
				requestable: { label: "Requestable", category: "Action", kind: "requestable", type: "requestable" },
				marker: { label: "Marker", category: "Action", kind: "text", type: "string", description: "Optional stable source marker appended to the requestable, as in NGX." }
			},
			setValue: {
				id: { label: "Id", category: "Base properties", type: "string" },
				target: { label: "Target", category: "Action", type: "string" },
				value: { label: "Value", category: "Action", kind: "binding", type: "object" }
			},
			navigate: {
				id: { label: "Id", category: "Base properties", type: "string" },
				to: { label: "Route", category: "Navigation", kind: "text", type: "string" },
				replace: { label: "Replace history", category: "Navigation", kind: "boolean", type: "boolean" }
			},
			goBack: {
				id: { label: "Id", category: "Base properties", type: "string" },
				fallback: { label: "Fallback route", category: "Navigation", kind: "text", type: "string" }
			},
			variable: {
				name: { label: "Name", category: "Variable", type: "string" },
				value: { label: "Value", category: "Variable", kind: "expression", type: "string" }
			},
			column: {
				label: { label: "Label", kind: "text", type: "string" },
				path: { label: "Path", kind: "path", type: "string" },
				value: { label: "Value", kind: "path", type: "string" }
			}
		};
		return definitions[kind] || {};
	}

	function frontAstTraits(kind) {
		if (frontAstEventKind(kind)) {
			return ["ui.event", "ui.container"];
		}
		if (kind === "if" || kind === "each" || kind === "await") {
			return ["ui.directive", "ui.container"];
		}
		if (kind === "callSequence" || kind === "setValue" || kind === "navigate" || kind === "goBack") {
			return ["ui.action"];
		}
		if (kind === "variable") {
			return ["ui.action.variable"];
		}
		if (kind === "column") {
			return ["ui.table.column"];
		}
		if (kind === "button") {
			return ["ui.block", "ui.interactive", "ui.events.owner"];
		}
		return ["ui.block"];
	}

	function frontAstDescriptorId(kind) {
		if (kind === "text" || kind === "button" || kind === "status" || kind === "table" || kind === "json") {
			return "svelte." + kind;
		}
		if (kind === "if" || kind === "each" || kind === "await" || kind === "callSequence" || kind === "setValue" || kind === "navigate" || kind === "goBack" || kind === "variable" || kind === "column") {
			return "frontbuilder.svelte." + (kind === "each" ? "forEach" : kind);
		}
		if (frontAstEventKind(kind)) {
			return "frontbuilder.svelte." + kind;
		}
		return "";
	}

	function frontAstIcon(kind) {
		var icons = {
			text: "mdi:text-box-outline",
			button: "mdi:gesture-tap-button",
			status: "mdi:information-outline",
			table: "mdi:table",
			json: "mdi:code-json",
			if: "mdi:source-branch",
			each: "mdi:repeat",
			await: "mdi:timer-sand",
			callSequence: "mdi:play-box-outline",
			setValue: "mdi:variable-box-outline",
			navigate: "mdi:arrow-right-circle-outline",
			goBack: "mdi:arrow-left-circle-outline",
			variable: "mdi:variable",
			column: "mdi:table-column",
			dataBinding: "mdi:database-arrow-right-outline"
		};
		if (frontAstEventKind(kind)) {
			return "mdi:flash";
		}
		return icons[kind] || "mdi:view-module-outline";
	}

	function frontAstActionIdFromRequestable(value) {
		var parts = String(value || "").replace(/^\./, "").split(/[./]/).filter(Boolean);
		return parts.length ? frontAstCanonicalKind(parts[parts.length - 1]) : "";
	}

	function frontAstEventTag(tag) {
		return /^On[A-Z]/.test(String(tag || ""));
	}

	function frontAstSafeName(prefix, value) {
		var name = String(value === undefined || value === null || value === "" ? prefix : value)
			.replace(/[^A-Za-z0-9_]/g, "_")
			.replace(/_+/g, "_");
		if (!name) {
			name = prefix || "item";
		}
		if (!name.charAt(0).match(/[A-Za-z_]/)) {
			name = "_" + name;
		}
		return name;
	}

	function frontendSvelteResourceRoot(request) {
		var config = projectEngineDefinitionForRequest(request).config || {};
		var entries = frontendCatalogService().frontbuilderSettings(config) || [];
		var projectRoot = fileForProjectPath(new File("."), request.projectDir || "") || projectDir() || new File(".");
		var fallback = null;
		for (var i = 0; i < entries.length; i++) {
			var entry = entries[i] || {};
			var settings = entry.settings || {};
			var target = String(settings.target || "");
			var name = String(entry.name || "");
			if (target && target !== "svelte5" && name !== "svelte") {
				continue;
			}
			var root = fileForProjectPath(projectRoot, settings.resourceRoot || "libs/flow/frontbuilder/svelte");
			if (!fallback) {
				fallback = root;
			}
			if (root && root.isDirectory() &&
				new File(root, "src-builder/frontDocumentCli.ts").isFile()) {
				return root;
			}
		}
		if (fallback) {
			return frontendSvelteToolRoot(fallback, "src-builder/frontDocumentCli.ts");
		}
		return frontendSvelteToolRoot(
			fileForProjectPath(projectRoot, "libs/flow/frontbuilder/svelte"),
			"src-builder/frontDocumentCli.ts"
		);
	}

	function frontendProcessBuilder(args, cwd) {
		var pb = new Packages.java.lang.ProcessBuilder(javaStringList(args));
		pb.directory(cwd);
		pb.redirectErrorStream(true);
		var env = pb.environment();
		env.remove("npm_config_prefix");
		env.remove("NPM_CONFIG_PREFIX");
		var executableFile = new File(args[0]);
		var executableParent = executableFile.getParentFile();
		if (executableParent) {
			env.put("PATH", String(executableParent.getAbsolutePath()) + File.pathSeparator + String(Packages.java.lang.System.getenv("PATH") || ""));
		}
		return pb;
	}

	function frontendRunOneShot(args, cwd, label) {
		var pb = frontendProcessBuilder(args, cwd);
		frontendStudioLog("[" + label + "] > " + args.join(" "));
		var process = pb.start();
		var output = frontendReadProcessOutput(process.getInputStream(), label);
		var exitCode = process.waitFor();
		if (exitCode !== 0) {
			var error = new Error(label + " failed with exit code " + exitCode + ".\n" + output);
			error.code = "FRONTEND_SOURCE_MUTATION_FAILED";
			error.hint = "Check the Studio log for the Svelte source mutation command.";
			throw error;
		}
		return output;
	}

	function frontendRunProviderOneShot(resourceRoot, script, args, label, marker) {
		var selection = frontendProviderCommand(resourceRoot, script, args);
		try {
			var output = frontendRunOneShot(selection.command, selection.toolRoot, label);
			if (marker) {
				var marked = null;
				try {
					marked = frontendMarkedJson(output, marker);
				} catch (parseError) {
					parseError.code = "FRONTEND_PROVIDER_PROTOCOL_INVALID";
					throw parseError;
				}
				if (!marked) {
					var protocolError = new Error(label + " did not emit " + marker + ".");
					protocolError.code = "FRONTEND_PROVIDER_PROTOCOL_INVALID";
					throw protocolError;
				}
			}
			return output;
		} catch (error) {
			if (selection.kind !== "compiled") {
				throw error;
			}
			frontendRejectProvider(selection, error);
			frontendStudioLog("[" + label + "] Precompiled provider failed; retrying with tsx: "
				+ String(error && error.message || error), true);
			return frontendRunOneShot(
				frontendTsxCommandForToolRoot(selection.toolRoot, script, args),
				selection.toolRoot,
				label + " tsx fallback"
			);
		}
	}

	function stopFrontendDocumentServer(server) {
		if (!server) {
			return;
		}
		try {
			server.writer.close();
		} catch (ignored1) {
		}
		try {
			server.reader.close();
		} catch (ignored2) {
		}
		try {
			var descendants = server.process.descendants().iterator();
			while (descendants.hasNext()) {
				descendants.next().destroyForcibly();
			}
			server.process.destroyForcibly();
		} catch (ignored3) {
		}
	}

	function clearFrontendDocumentServers() {
		frontendDocumentServerStartLock.lock();
		try {
			Object.keys(runtimeState.frontendDocumentServers).forEach(function (key) {
				stopFrontendDocumentServer(runtimeState.frontendDocumentServers[key]);
			});
			runtimeState.frontendDocumentServers = {};
		} finally {
			frontendDocumentServerStartLock.unlock();
		}
	}

	function startFrontendDocumentServer(resourceRoot) {
		frontendDocumentServerStartLock.lock();
		try {
			var toolRoot = frontendSvelteToolRoot(resourceRoot, "src-builder/frontDocumentCli.ts");
			var key = canonicalPath(toolRoot);
			var selection = frontendProviderCommand(resourceRoot, "src-builder/frontDocumentCli.ts", ["--server"]);
			var existing = runtimeState.frontendDocumentServers[key];
			if (existing && existing.process.isAlive() && existing.providerKey === selection.key) {
				runtimeState.frontendDocumentServerStats.reuses++;
				return existing;
			}
			if (existing) {
				stopFrontendDocumentServer(existing);
			}
			ensureFrontendDocumentDependencies(toolRoot);
			selection = frontendProviderCommand(resourceRoot, "src-builder/frontDocumentCli.ts", ["--server"]);
			var args = selection.command;
			frontendStudioLog("[Svelte front document server] > " + args.join(" "));
			var process;
			try {
				process = frontendProcessBuilder(args, toolRoot).start();
			} catch (launchError) {
				launchError.frontendProviderSelection = selection;
				throw launchError;
			}
			var server = {
				process: process,
				writer: new Packages.java.io.BufferedWriter(new Packages.java.io.OutputStreamWriter(process.getOutputStream(), "UTF-8")),
				reader: new Packages.java.io.BufferedReader(new Packages.java.io.InputStreamReader(process.getInputStream(), "UTF-8")),
				lock: new Packages.java.util.concurrent.locks.ReentrantLock(),
				sequence: 0,
				providerKey: selection.key,
				providerSelection: selection
			};
			runtimeState.frontendDocumentServers[key] = server;
			runtimeState.frontendDocumentServerStats.starts++;
			runtimeState.frontendDocumentServerStats.lastError = "";
			return server;
		} finally {
			frontendDocumentServerStartLock.unlock();
		}
	}

	function frontendRunDocumentServer(resourceRoot, cliArgs) {
		var server = startFrontendDocumentServer(resourceRoot);
		server.lock.lock();
		try {
			var id = runtimeState.id + "-" + (++server.sequence);
			server.writer.write(JSON.stringify({ id: id, args: cliArgs }));
			server.writer.newLine();
			server.writer.flush();
			var deadline = new Date().getTime() + 30000;
			while (new Date().getTime() < deadline) {
				if (server.reader.ready()) {
					var line = server.reader.readLine();
					if (line === null) {
						break;
					}
					line = String(line);
					if (line.indexOf("__C8O_FRONT_DOCUMENT__") !== 0) {
						frontendStudioLog("[Svelte front document server] " + line);
						continue;
					}
					var response = JSON.parse(line.substring("__C8O_FRONT_DOCUMENT__".length));
					if (String(response.id || "") !== id) {
						continue;
					}
					if (response.error) {
						var responseError = new Error(String(response.error));
						responseError.frontendDocumentResponse = true;
						throw responseError;
					}
					if (!response.result || !response.result.model) {
						throw new Error("Svelte front document server returned an invalid model.");
					}
					return response.result;
				}
				if (!server.process.isAlive()) {
					break;
				}
				Packages.java.lang.Thread.sleep(20);
			}
			throw new Error("Svelte front document server did not answer within 30 seconds.");
		} catch (error) {
			error.frontendProviderSelection = server.providerSelection;
			throw error;
		} finally {
			server.lock.unlock();
		}
	}

	function frontendDescribeDocument(resourceRoot, cliArgs) {
		try {
			return frontendRunDocumentServer(resourceRoot, cliArgs);
		} catch (e) {
			runtimeState.frontendDocumentServerStats.errors++;
			runtimeState.frontendDocumentServerStats.lastError = String(e && e.message || e);
			if (e && e.frontendDocumentResponse === true) {
				throw e;
			}
			var failedSelection = e && e.frontendProviderSelection;
			if (failedSelection && failedSelection.kind === "compiled") {
				frontendRejectProvider(failedSelection, e);
				frontendStudioLog("[Svelte front document server] Precompiled provider failed; retrying with tsx: "
					+ String(e && e.message || e), true);
			}
			clearFrontendDocumentServers();
			runtimeState.frontendDocumentServerStats.fallbacks++;
			var toolRoot = failedSelection && failedSelection.toolRoot
				? failedSelection.toolRoot
				: frontendSvelteToolRoot(resourceRoot, "src-builder/frontDocumentCli.ts");
			var args = frontendTsxCommandForToolRoot(toolRoot, "src-builder/frontDocumentCli.ts", cliArgs);
			var output = frontendRunOneShot(args, toolRoot, "Svelte front document tsx fallback");
			return frontendMarkedJson(output, "__C8O_FRONT_DOCUMENT__");
		}
	}

	function frontendReadProcessOutput(stream, label) {
		var BufferedReader = Packages.java.io.BufferedReader;
		var InputStreamReader = Packages.java.io.InputStreamReader;
		var reader = new BufferedReader(new InputStreamReader(stream, "UTF-8"));
		var lines = [];
		try {
			var line;
			while ((line = reader.readLine()) !== null) {
				line = String(line);
				lines.push(line);
				if (line.indexOf("__C8O_") !== 0) {
					frontendStudioLog("[" + label + "] " + line);
				}
			}
		} finally {
			reader.close();
		}
		return lines.join("\n");
	}

	function frontendMarkedJson(output, marker) {
		var lines = String(output || "").split(/\r?\n/);
		for (var i = lines.length - 1; i >= 0; i--) {
			var index = lines[i].indexOf(marker);
			if (index >= 0) {
				return JSON.parse(lines[i].substring(index + marker.length));
			}
		}
		return null;
	}

	function outputSchemaRequest(request, blocks) {
		return flowTreeService().outputSchemaRequest(request, blocks, flowTreeServiceEnv());
	}

	function nodeOutputSchemaRequest(request, blocks) {
		return flowTreeService().nodeOutputSchemaRequest(request, blocks, flowTreeServiceEnv());
	}

	function isFrontendTarget(request) {
		var target = request.targetObject || {};
		var kind = String(target.kind || "");
		var path = String(target.path || "");
		return kind.indexOf("frontend") === 0 || path === "frontends" || path.indexOf("frontends.") === 0;
	}

	function frontbuilderNameForTarget(request) {
		var payload = request.action && request.action.payload || {};
		var explicit = String(payload.builder || payload.builderName || request.builder || request.builderName || "").trim();
		if (explicit) {
			return explicit;
		}
		var target = request.targetObject || {};
		var path = String(target.path || "");
		var match = path.match(/^frontends\.([A-Za-z0-9_]+)/);
		if (match) {
			return match[1];
		}
		var sourcePath = String(payload.sourcePath || request.sourcePath || request.sourceFile || "");
		match = sourcePath.replace(/\\/g, "/").match(/\/libs\/flow\/frontbuilder\/([^/]+)\//);
		if (match) {
			return match[1];
		}
		var definition = target.definition || {};
		if (definition.id) {
			return String(definition.id);
		}
		var config = projectEngineDefinitionForRequest(request).config || {};
		var builders = frontendCatalogService().frontbuilderSettings(config);
		return builders.length === 1 ? builders[0].name : "";
	}

	function frontbuilderSettingsForRequest(request) {
		var config = projectEngineDefinitionForRequest(request).config || {};
		var name = frontbuilderNameForTarget(request);
		var root = config.frontbuilder || {};
		var settings = name && root[name] && typeof root[name] === "object" ? root[name] : {};
		return {
			name: name,
			settings: settings
		};
	}

	function fileForProjectPath(projectRoot, value) {
		var raw = String(value || "").trim();
		if (!raw) {
			return null;
		}
		var file = new File(raw);
		if (!file.isAbsolute()) {
			file = new File(projectRoot, raw);
		}
		return file.getCanonicalFile();
	}

	function frontendModelPath(request, info) {
		var payload = request.action && request.action.payload || {};
		var target = request.targetObject || {};
		var targetInfo = target.info || {};
		var projectRoot = fileForProjectPath(new File("."), request.projectDir || target.projectDir || "");
		var explicit = payload.modelPath || "";
		if (explicit) {
			return fileForProjectPath(projectRoot || new File("."), explicit);
		}
		var sources = [
			payload.sourcePath,
			request.sourcePath,
			request.sourceFile,
			targetInfo.sourcePath
		];
		for (var i = 0; i < sources.length; i++) {
			var source = String(sources[i] || "");
			var normalized = source.replace(/\\/g, "/");
			if (normalized.endsWith(".front.json") || normalized.endsWith("/+page.flow.svelte")) {
				return fileForProjectPath(projectRoot || new File("."), source);
			}
		}
		return fileForProjectPath(projectRoot || new File("."), info.settings.modelPath || "");
	}

	function frontendSourceDrafts(request) {
		var drafts = request && (request.sourceDrafts || request.frontendSourceDrafts || request.drafts) || {};
		return drafts && typeof drafts === "object" ? drafts : {};
	}

	function frontendDraftCount(request) {
		return Object.keys(frontendSourceDrafts(request)).length;
	}

	function sourceDraftsFingerprint() {
		var drafts = frontendSourceDrafts(currentActiveRequest());
		var parts = [];
		Object.keys(drafts).sort().forEach(function (key) {
			parts.push(canonicalPath(new File(String(key))) + ":" + sha256Hex(String(drafts[key])));
		});
		return parts.join("|");
	}

	function frontendDraftForFile(request, file) {
		if (!file) {
			return null;
		}
		var drafts = frontendSourceDrafts(request);
		var key = String(file.getCanonicalPath());
		if (Object.prototype.hasOwnProperty.call(drafts, key)) {
			return String(drafts[key]);
		}
		var absolute = String(file.getAbsolutePath());
		if (Object.prototype.hasOwnProperty.call(drafts, absolute)) {
			return String(drafts[absolute]);
		}
		var normalized = key.replace(/\\/g, "/");
		var keys = Object.keys(drafts);
		for (var i = 0; i < keys.length; i++) {
			var draftKey = String(keys[i]);
			var draftPath = draftKey.replace(/\\/g, "/");
			if (draftPath === normalized) {
				return String(drafts[draftKey]);
			}
		}
		return null;
	}

	function sourceForFile(file) {
		var draft = frontendDraftForFile(currentActiveRequest(), file);
		return draft === null ? String(FileUtils.readFileToString(file, "UTF-8")) : draft;
	}

	function frontendDraftEntriesUnder(request, baseDir) {
		var drafts = frontendSourceDrafts(request);
		var basePath = canonicalPath(baseDir);
		var entries = [];
		Object.keys(drafts).forEach(function (key) {
			var file = new File(String(key));
			var path = canonicalPath(file);
			if (path === basePath || path.indexOf(basePath + File.separator) !== 0) {
				return;
			}
			entries.push({
				file: file,
				relativePath: path.substring(basePath.length + 1),
				content: String(drafts[key])
			});
		});
		return entries;
	}

	function frontendWriteFile(file, content) {
		var parent = file.getParentFile();
		if (parent) {
			parent.mkdirs();
		}
		FileUtils.writeStringToFile(file, String(content || ""), "UTF-8");
	}

	function frontendCopyFlowSvelteOverlay(sourceDir, overlayDir, request) {
		var listed = sourceDir && sourceDir.listFiles();
		if (listed) {
			Arrays.asList(listed).toArray().forEach(function (file) {
				if (file.isDirectory()) {
					frontendCopyFlowSvelteOverlay(file, new File(overlayDir, file.getName()), request);
				} else if (file.isFile()) {
					var draft = frontendDraftForFile(request, file);
					var target = new File(overlayDir, file.getName());
					if (draft === null) {
						var parent = target.getParentFile();
						if (parent) {
							parent.mkdirs();
						}
						FileUtils.copyFile(file, target);
					} else {
						frontendWriteFile(target, draft);
					}
				}
			});
		}
	}

	function frontendWriteExtraDraftEntries(entries, baseDir, overlayDir) {
		entries.forEach(function (entry) {
			var target = new File(overlayDir, String(entry.relativePath));
			if (!target.isFile()) {
				frontendWriteFile(target, entry.content);
			}
		});
	}

	function frontendFlowSvelteSourceRoot(modelPath) {
		var filePath = String(modelPath.getCanonicalPath());
		var marker = File.separator + "src" + File.separator + "routes" + File.separator;
		var index = filePath.indexOf(marker);
		if (index >= 0) {
			return new File(filePath.substring(0, index)).getCanonicalFile();
		}
		return modelPath.getParentFile().getCanonicalFile();
	}

	function frontendRelativePath(baseDir, file) {
		var basePath = canonicalPath(baseDir);
		var filePath = canonicalPath(file);
		if (filePath === basePath) {
			return "";
		}
		if (filePath.indexOf(basePath + File.separator) === 0) {
			return filePath.substring(basePath.length + 1);
		}
		return file.getName();
	}

	function frontendEffectiveModelPath(request, info, modelPath) {
		var draft = frontendDraftForFile(request, modelPath);
		var isFlowSvelte = String(modelPath.getName()).endsWith(".flow.svelte");
		var sourceBaseDir = isFlowSvelte ? frontendFlowSvelteSourceRoot(modelPath) : null;
		var draftEntries = isFlowSvelte ? frontendDraftEntriesUnder(request, sourceBaseDir) : [];
		if (draft === null) {
			if (!isFlowSvelte || draftEntries.length === 0) {
				return {
					file: modelPath,
					cleanup: null,
					effectiveSourceRoot: null,
					sourceIdentityRoot: null
				};
			}
		}
		var settings = info.settings || {};
		var projectRoot = fileForProjectPath(new File("."), request.projectDir || "");
		var sourceRoot = String(settings.privateDir || "_private/svelte").replace(/^\/+/, "");
		var draftDir = new File(projectRoot || new File("."), sourceRoot + "/.flow-drafts");
		draftDir.mkdirs();
		if (isFlowSvelte) {
			var overlayDir = new File(draftDir, sha256Hex(String(modelPath.getCanonicalPath())).substring(0, 16));
			if (overlayDir.exists()) {
				FileUtils.deleteDirectory(overlayDir);
			}
			overlayDir.mkdirs();
			frontendCopyFlowSvelteOverlay(sourceBaseDir, overlayDir, request);
			frontendWriteExtraDraftEntries(draftEntries, sourceBaseDir, overlayDir);
			return {
				file: new File(overlayDir, frontendRelativePath(sourceBaseDir, modelPath)).getCanonicalFile(),
				cleanup: overlayDir,
				effectiveSourceRoot: overlayDir,
				sourceIdentityRoot: sourceBaseDir
			};
		}
		var draftFile = new File(draftDir, sha256Hex(String(modelPath.getCanonicalPath())).substring(0, 16) + ".front.json");
		frontendWriteFile(draftFile, draft);
		return {
			file: draftFile.getCanonicalFile(),
			cleanup: draftFile,
			effectiveSourceRoot: null,
			sourceIdentityRoot: null
		};
	}

	function frontendRunCommandFor(action, npm, resourceRoot, projectRoot, projectName, modelPath, generatedRoot, generationMode) {
		if (action === "installBuilder") {
			return [npm, "--prefix", String(resourceRoot.getAbsolutePath()), "install"];
		}
		if (action === "generate") {
			var generateArgs = [
				"--project-root", String(projectRoot.getAbsolutePath()),
				"--project-name", String(projectName || ""),
				"--model", String(modelPath.getAbsolutePath()),
				"--mode", generationMode
			];
			frontendReferenceCliArgs(projectRoot, resourceRoot).forEach(function (arg) {
				generateArgs.push(arg);
			});
			return frontendTsxCommand(resourceRoot, "src-builder/cli.ts", generateArgs);
		}
		if (action === "installApp") {
			return [npm, "--prefix", String(generatedRoot.getAbsolutePath()), "install"];
		}
		if (action === "check") {
			return [npm, "--prefix", String(generatedRoot.getAbsolutePath()), "run", "check"];
		}
		if (action === "build") {
			return [npm, "--prefix", String(generatedRoot.getAbsolutePath()), "run", "build"];
		}
		var error = new Error("Unsupported frontbuilder action: " + action + ". Use install, generate, check or build.");
		error.code = "FRONTBUILDER_UNSUPPORTED_ACTION";
		throw error;
	}

	function frontendDependencyFingerprint(root, npm) {
		var entries = ["npm\n" + String(npm || "")];
		["package.json", "package-lock.json"].forEach(function (name) {
			var file = new File(root, name);
			if (file.isFile()) {
				entries.push(name + "\n" + sha256Hex(String(FileUtils.readFileToString(file, "UTF-8"))));
			}
		});
		return entries.length > 1 ? sha256Hex(entries.join("\n")) : "";
	}

	function frontendDependencyManifestFingerprint(root, npm) {
		var file = new File(root, "package.json");
		if (!file.isFile()) {
			return "";
		}
		try {
			var manifest = JSON.parse(String(FileUtils.readFileToString(file, "UTF-8")));
			function stable(value) {
				if (Array.isArray(value)) {
					return "[" + value.map(stable).join(",") + "]";
				}
				if (value && typeof value === "object") {
					return "{" + Object.keys(value).sort().map(function (key) {
						return JSON.stringify(key) + ":" + stable(value[key]);
					}).join(",") + "}";
				}
				return JSON.stringify(value);
			}
			var runtimeManifest = {
				type: manifest.type || "",
				packageManager: manifest.packageManager || "",
				dependencies: manifest.dependencies || {},
				devDependencies: manifest.devDependencies || {},
				optionalDependencies: manifest.optionalDependencies || {},
				peerDependencies: manifest.peerDependencies || {},
				overrides: manifest.overrides || {},
				resolutions: manifest.resolutions || {},
				devScript: manifest.scripts && manifest.scripts.dev || ""
			};
			return sha256Hex("npm\n" + String(npm || "") + "\n" + stable(runtimeManifest));
		} catch (ignored) {
			return "";
		}
	}

	function frontendDevRestartRequired(dependenciesInstalled, previousFingerprint, currentFingerprint) {
		return dependenciesInstalled === true
			&& (!previousFingerprint || !currentFingerprint || previousFingerprint !== currentFingerprint);
	}

	function frontendDependencyInstallStamp(root, kind) {
		if (kind === "builder") {
			return new File(new File(root, "node_modules"), ".flow-svelte-builder-install.json");
		}
		return new File(root, ".flow-svelte-install.json");
	}

	function frontendDependencyInstallReusable(root, fingerprint, kind) {
		if (!fingerprint || !new File(root, "node_modules").isDirectory()) {
			return false;
		}
		var stamp = frontendDependencyInstallStamp(root, kind);
		if (!stamp.isFile()) {
			return false;
		}
		try {
			var value = JSON.parse(String(FileUtils.readFileToString(stamp, "UTF-8")));
			return value && value.version === 1 && value.fingerprint === fingerprint;
		} catch (ignored) {
			return false;
		}
	}

	function ensureFrontendDocumentDependencies(resourceRoot) {
		var npm = frontendExecutable("npm");
		var fingerprint = frontendDependencyFingerprint(resourceRoot, npm);
		if (frontendDependencyInstallReusable(resourceRoot, fingerprint, "builder")) {
			return;
		}
		frontendBuilderDependencyLock.lock();
		try {
			fingerprint = frontendDependencyFingerprint(resourceRoot, npm);
			if (frontendDependencyInstallReusable(resourceRoot, fingerprint, "builder")) {
				return;
			}
			var result = frontendRunStep(
				"installBuilder",
				npm,
				resourceRoot,
				resourceRoot,
				"",
				resourceRoot,
				resourceRoot,
				"authoring",
				{
					PATH: frontendExecutablePathPrefix(npm) + String(Packages.java.lang.System.getenv("PATH") || "")
				}
			);
			if (!result.ok) {
				var error = new Error("Unable to install Svelte authoring dependencies.\n" + String(result.stdout || ""));
				error.code = "FRONTEND_BUILDER_INSTALL_FAILED";
				error.hint = "Check npm access and workspace permissions, then retry the authoring operation.";
				throw error;
			}
		} finally {
			frontendBuilderDependencyLock.unlock();
		}
	}

	function writeFrontendDependencyInstallStamp(root, fingerprint, kind) {
		if (!fingerprint) {
			return;
		}
		var stamp = frontendDependencyInstallStamp(root, kind);
		stamp.getParentFile().mkdirs();
		FileUtils.writeStringToFile(stamp, JSON.stringify({
			version: 1,
			fingerprint: fingerprint
		}), "UTF-8");
	}

	function frontendDurationMs(startedAt) {
		return Math.max(0, Math.round(Number(JavaSystem.nanoTime() - startedAt) / 1000000));
	}

	function frontendPerformanceMark(phase) {
		try {
			Packages.com.twinsoft.convertigo.engine.flow.FlowStudioSupport.performanceProfileMark(String(phase || ""));
		} catch (ignored) {
		}
	}

	function frontendRunStep(stepAction, npm, resourceRoot, projectRoot, projectName, modelPath, generatedRoot, generationMode, envValues) {
		var startedAt = JavaSystem.nanoTime();
		var installRoot = stepAction === "installBuilder"
			? resourceRoot
			: stepAction === "installApp" ? generatedRoot : null;
		var installKind = stepAction === "installBuilder" ? "builder" : "app";
		var dependencyFingerprint = installRoot ? frontendDependencyFingerprint(installRoot, npm) : "";
		if (installRoot && frontendDependencyInstallReusable(installRoot, dependencyFingerprint, installKind)) {
			frontendStudioLog("[Svelte frontbuilder] Reusing installed " + installKind + " dependencies.");
			return {
				action: stepAction,
				command: "",
				cwd: String(installRoot.getAbsolutePath()),
				exitCode: 0,
				stdout: "",
				stderr: "",
				ok: true,
				skipped: true,
				durationMs: frontendDurationMs(startedAt)
			};
		}
		var cwd = stepAction === "installApp" || stepAction === "check" || stepAction === "build"
			? generatedRoot
			: resourceRoot;
		var args = frontendRunCommandFor(stepAction, npm, resourceRoot, projectRoot, projectName, modelPath, generatedRoot, generationMode);
		var pb = new Packages.java.lang.ProcessBuilder(javaStringList(args));
		pb.directory(cwd);
		pb.redirectErrorStream(true);
		var env = pb.environment();
		env.remove("npm_config_prefix");
		env.remove("NPM_CONFIG_PREFIX");
		Object.keys(envValues || {}).forEach(function (key) {
			env.put(String(key), String(envValues[key]));
		});
		frontendStudioLog("[Svelte frontbuilder] > " + args.join(" "));
		var process = pb.start();
		var output = frontendReadProcessOutput(process.getInputStream(), "Svelte frontbuilder");
		var exitCode = process.waitFor();
		frontendStudioLog("[Svelte frontbuilder] exit " + exitCode + ": " + args[0]);
		if (installRoot && exitCode === 0) {
			writeFrontendDependencyInstallStamp(
				installRoot,
				frontendDependencyFingerprint(installRoot, npm),
				installKind
			);
			if (stepAction === "installBuilder") {
				runtimeState.frontendDependencyFingerprints = {};
			}
		}
		return {
			action: stepAction,
			command: args.join(" "),
			cwd: String(cwd.getAbsolutePath()),
			exitCode: exitCode,
			stdout: output,
			stderr: "",
			ok: exitCode === 0,
			skipped: false,
			durationMs: frontendDurationMs(startedAt)
		};
	}

	function frontendAcceptanceProbe() {
		return [
			"async () => {",
			"  const startedAt = Date.now();",
			"  const deadline = startedAt + 15000;",
			"  const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay));",
			"  const visible = (element) => {",
			"    const rect = element.getBoundingClientRect();",
			"    const style = getComputedStyle(element);",
			"    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';",
			"  };",
			"  const pending = () => {",
			"    const text = document.body.innerText;",
			"    return /initializ|synchron|\\bsync(?:ing)?\\b|optimis|loading|chargement/i.test(text) || /\\b(?:active|change|changed|pending)\\s+\\d+\\/\\d+\\b/i.test(text);",
			"  };",
			"  let previousState = '';",
			"  let stableSince = startedAt;",
			"  let pendingText = true;",
			"  while (Date.now() < deadline) {",
			"    const state = [",
			"      document.readyState,",
			"      location.href,",
			"      document.querySelectorAll('*').length,",
			"      document.querySelectorAll('button').length,",
			"      document.images.length,",
			"      [...document.images].filter((image) => image.complete).length,",
			"      document.documentElement.scrollWidth,",
			"      document.documentElement.scrollHeight",
			"    ].join('|');",
			"    if (state !== previousState) {",
			"      previousState = state;",
			"      stableSince = Date.now();",
			"    }",
			"    pendingText = pending();",
			"    if (!pendingText && Date.now() - startedAt >= 750 && Date.now() - stableSince >= 500) break;",
			"    await sleep(200);",
			"  }",
			"  const buttons = [...document.querySelectorAll('button')].filter(visible);",
			"  const images = [...document.querySelectorAll('img')].filter(visible);",
			"  const waitedMs = Date.now() - startedAt;",
			"  return {",
			"    url: location.href,",
			"    title: document.title,",
			"    viewport: [innerWidth, innerHeight],",
			"    waitedMs,",
			"    timedOut: Date.now() >= deadline,",
			"    terminalReached: !pendingText,",
			"    visibleButtons: buttons.length,",
			"    buttonLabels: buttons.slice(0, 30).map((button) => (button.textContent || '').trim()),",
			"    visibleImages: images.length,",
			"    brokenImages: images.filter((image) => image.naturalWidth === 0).slice(0, 20).map((image) => ({ alt: image.alt, src: image.currentSrc || image.src })),",
			"    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,",
			"    pendingText,",
			"    bodyText: document.body.innerText.slice(0, 500)",
			"  };",
			"}"
		].join("\n");
	}

	function frontendAcceptancePlan(url) {
		var probe = frontendAcceptanceProbe();
		return {
			strategy: "safe-playwright-plan",
			path: url ? String(new Packages.java.net.URI(url).getPath()) : "",
			calls: [
				{ tool: "browser_navigate", arguments: { url: url } },
				{ tool: "browser_resize", arguments: { width: 1280, height: 720 } },
				{ tool: "browser_evaluate", arguments: { function: probe } },
				{ tool: "browser_resize", arguments: { width: 390, height: 844 } },
				{ tool: "browser_evaluate", arguments: { function: probe } },
				{ tool: "browser_console_messages", arguments: { level: "error", all: true } },
				{ tool: "browser_close", arguments: {} }
			],
			checks: ["expected visible content", "broken images", "pending startup state", "console and page errors", "desktop and mobile overflow"],
			selectorRule: "Flow ids are authoring identities, not guaranteed DOM ids. Prefer roles, visible text, images and rendered semantic selectors.",
			next: "Execute calls unchanged and in order. Add one focused interaction only when a required business workflow is not covered by these probes."
		};
	}

	function frontendRunAction(request, blocks, action) {
		var actionStartedAt = JavaSystem.nanoTime();
		var info = frontbuilderSettingsForRequest(request);
		var modelPath = frontendModelPath(request, info);
		if (!modelPath || !modelPath.isFile()) {
			return failure("frontbuilder", {
				code: "FRONTBUILDER_MODEL_REQUIRED",
				message: "No frontend model file is available for this action."
			});
		}
		var effective = frontendEffectiveModelPath(request, info, modelPath);
		var sourcePath = String((request.action && request.action.payload && request.action.payload.sourcePath) || request.sourcePath || request.sourceFile || "");
		var draftCount = frontendDraftCount(request);
		var settings = info.settings || {};
		var projectRoot = frontendProjectRootFile(request);
		var projectName = frontendProjectName(request);
		var resourceRoot = frontendSvelteResourceRoot(request);
		var generatedRoot = frontendGeneratedRootFile(request, info);
		if (!resourceRoot || !resourceRoot.isDirectory() || !new File(resourceRoot, "package.json").isFile()) {
			return failure("frontbuilder", {
				code: "FRONTBUILDER_RESOURCE_ROOT_NOT_FOUND",
				message: "The Svelte frontbuilder resources are unavailable.",
				hint: "Load the lib_flow_frontbuilder_svelte project or fix the private frontbuilder resourceRoot configuration.",
				resourceRoot: resourceRoot ? String(resourceRoot.getAbsolutePath()) : ""
			});
		}
		var generationMode = "incremental";
		var sourceRoot = String(settings.privateDir || "_private/svelte");
		var buildOutput = String(settings.buildOutput || "DisplayObjects/mobile");
		var atomicOutput = action === "build" ? frontendAtomicBuildOutput(projectRoot, buildOutput) : null;
		var npm = frontendExecutable("npm");
		var envValues = {
			FRONTBUILDER_PROJECT_ROOT: projectRoot ? String(projectRoot.getAbsolutePath()) : String(request.projectDir || ""),
			FRONTBUILDER_PROJECT_NAME: projectName,
			FRONTBUILDER_SOURCE_ROOT: sourceRoot,
			FRONTBUILDER_BUILD_OUTPUT: atomicOutput
				? String(atomicOutput.staging.getAbsolutePath())
				: buildOutput,
			PATH: frontendExecutablePathPrefix(npm) + String(Packages.java.lang.System.getenv("PATH") || "")
		};
		var draftsTemp = null;
		var atomicConfig = null;
		if (draftCount > 0) {
			draftsTemp = File.createTempFile("c8o-frontbuilder-drafts-", ".json");
			FileUtils.writeStringToFile(draftsTemp, JSON.stringify(frontendSourceDrafts(request)), "UTF-8");
			envValues.FRONTBUILDER_DRAFTS_FILE = String(draftsTemp.getAbsolutePath());
		}
		if (effective.effectiveSourceRoot && effective.sourceIdentityRoot) {
			envValues.FRONTBUILDER_EFFECTIVE_SOURCE_ROOT = String(effective.effectiveSourceRoot.getAbsolutePath());
			envValues.FRONTBUILDER_SOURCE_IDENTITY_ROOT = String(effective.sourceIdentityRoot.getAbsolutePath());
		}
		var actions = frontendActionSteps(action);
		var steps = [];
		var ok = true;
		var currentStepAction = "";
		var currentStepStartedAt = 0;
		try {
			for (var i = 0; i < actions.length; i++) {
				currentStepAction = actions[i];
				currentStepStartedAt = JavaSystem.nanoTime();
				var step = frontendRunStep(currentStepAction, npm, resourceRoot, projectRoot, projectName, effective.file, generatedRoot, generationMode, envValues);
				steps.push(step);
				if (step.ok === false) {
					ok = false;
					break;
				}
				if (atomicOutput && currentStepAction === "generate") {
					atomicConfig = frontendPrepareAtomicGeneratedOutput(generatedRoot, atomicOutput);
				}
			}
			if (ok && atomicOutput) {
				currentStepAction = "publish";
				currentStepStartedAt = JavaSystem.nanoTime();
				frontendPromoteBuildOutput(atomicOutput);
				steps.push({
					action: "publish",
					ok: true,
					exitCode: 0,
					skipped: false,
					durationMs: frontendDurationMs(currentStepStartedAt)
				});
			}
		} catch (e) {
			ok = false;
			steps.push({
				action: currentStepAction || action,
				ok: false,
				exitCode: -1,
				stdout: String(e && (e.message || e) || ""),
				durationMs: frontendDurationMs(currentStepStartedAt || actionStartedAt)
			});
		} finally {
			try {
				frontendRestoreGeneratedOutput(atomicConfig);
				if (atomicOutput && atomicOutput.staging.exists()) {
					FileUtils.deleteDirectory(atomicOutput.staging);
				}
				if (draftsTemp) {
					draftsTemp["delete"]();
				}
				if (effective.cleanup) {
					if (effective.cleanup.isDirectory()) {
						FileUtils.deleteDirectory(effective.cleanup);
					} else {
						effective.cleanup["delete"]();
					}
				}
			} catch (e) {
			}
		}
		var compactSteps = steps.map(function (step) {
			var out = {
				action: step.action || "",
				ok: step.ok !== false,
				exitCode: step.exitCode,
				skipped: step.skipped === true,
				durationMs: Number(step.durationMs || 0)
			};
			if (step.ok === false && step.stdout) {
				out.stdout = String(step.stdout).substring(0, 4000);
			}
			return out;
		});
		var response = {
			ok: ok,
			title: "Svelte frontbuilder",
			message: ok ? "Svelte frontbuilder action completed: " + action + "." : "Svelte frontbuilder action failed: " + action + ".",
			refresh: action === "generate" || action === "build",
			details: {
				action: action,
				projectRoot: projectRoot ? String(projectRoot.getAbsolutePath()) : String(request.projectDir || ""),
				projectName: projectName,
				resourceRoot: resourceRoot ? String(resourceRoot.getAbsolutePath()) : "",
				modelPath: modelPath ? String(modelPath.getAbsolutePath()) : "",
				effectiveModelPath: effective.file ? String(effective.file.getAbsolutePath()) : "",
				sourcePath: sourcePath,
				draftCount: draftCount,
				sourceRoot: sourceRoot,
				buildOutput: buildOutput,
				steps: compactSteps,
				durationMs: frontendDurationMs(actionStartedAt)
			}
		};
		if (ok && action === "build") {
			var productionInfo = frontbuilderSettingsForRequest(request);
			var currentProductionFingerprint = frontendProductionFingerprint(request, productionInfo);
			var builtProductionFingerprint = String(request.productionBuildFingerprint
				|| currentProductionFingerprint);
			var productionState = frontendProductionLifecycle().completed(
				frontendReadProductionState(request, productionInfo),
				builtProductionFingerprint,
				new Date().toISOString(),
				frontendDurationMs(actionStartedAt)
			);
			productionState = frontendProductionLifecycle().observe(
				productionState,
				currentProductionFingerprint
			);
			frontendWriteProductionState(request, productionInfo, productionState);
			response.details.production = productionState;
			var builtUrl = frontendBuiltUrl(request);
			response.openUrl = builtUrl;
			response.acceptance = builtUrl ? frontendAcceptancePlan(builtUrl) : null;
		}
		if (ok && (action === "install" || action === "generate")) {
			response.details.production = frontendObserveProductionState(request, frontbuilderSettingsForRequest(request));
		}
		return response;
	}

	function frontendActionSteps(action) {
		if (action === "install") {
			return ["installBuilder", "generate", "installApp"];
		}
		if (action === "generate") {
			return ["installBuilder", "generate"];
		}
		if (action === "check" || action === "build") {
			return ["installBuilder", "generate", "installApp", action];
		}
		return [action];
	}

	function frontendActionStepPerformed(response, action) {
		var steps = response && response.details && response.details.steps || [];
		for (var i = 0; i < steps.length; i++) {
			if (String(steps[i].action || "") === String(action || "")
					&& steps[i].ok !== false && steps[i].skipped !== true) {
				return true;
			}
		}
		return false;
	}

	function frontendProjectName(request) {
		var target = request.targetObject || {};
		var root = request.root || {};
		return String(target.project || root.project
			|| projectNameForRoot(frontendProjectRootFile(request))
			|| currentProjectName(request) || "");
	}

	function frontendBuiltUrl(request) {
		var info = frontbuilderSettingsForRequest(request);
		var project = frontendProjectName(request);
		var buildOutput = String(info.settings.buildOutput || "DisplayObjects/mobile").replace(/^\/+/, "");
		if (!project) {
			return "";
		}
		var EnginePropertiesManager = Packages.com.twinsoft.convertigo.engine.EnginePropertiesManager;
		var PropertyName = Packages.com.twinsoft.convertigo.engine.EnginePropertiesManager.PropertyName;
		var baseUrl = typeof EnginePropertiesManager.getProperty === "function"
			? String(EnginePropertiesManager.getProperty(PropertyName.APPLICATION_SERVER_CONVERTIGO_URL) || "")
			: "";
		baseUrl = baseUrl.replace(/\/+$/, "");
		return baseUrl + "/projects/" + encodeURIComponent(project) + "/" + buildOutput + "/index.html";
	}

	function frontendDevProxyService() {
		return loadEngineModule("frontend-dev-proxy.js");
	}

	function frontendPublicBaseUrl(request) {
		var baseUrl = String(request && request.publicBaseUrl || "").trim();
		if (baseUrl) {
			return baseUrl;
		}
		try {
			var EnginePropertiesManager = Packages.com.twinsoft.convertigo.engine.EnginePropertiesManager;
			var PropertyName = Packages.com.twinsoft.convertigo.engine.EnginePropertiesManager.PropertyName;
			return String(EnginePropertiesManager.getProperty(PropertyName.APPLICATION_SERVER_CONVERTIGO_URL) || "");
		} catch (e) {
			return "";
		}
	}

	function frontendRegisterDevProxy(request, port) {
		var manager = Packages.com.twinsoft.convertigo.engine.Engine.theApp.reverseProxyManager;
		var ticket = String(manager.registerLoopbackHttp(Number(port)));
		var plan = frontendDevProxyService().plan(frontendPublicBaseUrl(request), ticket, Number(port));
		if (!plan) {
			manager.removeReverseProxyHttp(ticket);
			return null;
		}
		return plan;
	}

	function frontendEnsureDevProxy(request, entry) {
		if (!entry || !entry.port || !entry.proxyKey) {
			return false;
		}
		try {
			var manager = Packages.com.twinsoft.convertigo.engine.Engine.theApp.reverseProxyManager;
			if (manager.getHttpHost(String(entry.proxyKey)) === null
					&& !manager.restoreLoopbackHttp(String(entry.proxyKey), Number(entry.port))) {
				return false;
			}
			var plan = frontendDevProxyService().plan(
				frontendPublicBaseUrl(request) || entry.publicBaseUrl, entry.proxyKey, Number(entry.port));
			if (!plan) {
				return false;
			}
			entry.url = plan.publicUrl;
			entry.localUrl = plan.localUrl;
			entry.publicBaseUrl = plan.publicBaseUrl;
			entry.proxyPath = plan.viteBase;
			entry.proxyActive = true;
			return true;
		} catch (e) {
			frontendStudioLog("[Svelte dev] Unable to restore the public dev route: " + String(e), true);
			return false;
		}
	}

	function frontendUnregisterDevProxy(entry) {
		if (!entry || !entry.proxyKey || entry.proxyActive === false) {
			return;
		}
		try {
			Packages.com.twinsoft.convertigo.engine.Engine.theApp.reverseProxyManager
				.removeReverseProxyHttp(String(entry.proxyKey));
		} catch (e) {
			frontendStudioLog("[Svelte dev] Unable to remove the public dev route: " + String(e), true);
		}
		entry.proxyActive = false;
	}

	function frontendDevKey(request, info) {
		return String(request.projectDir || "") + "|" + String(info.name || "svelte");
	}

	function frontendProjectRootFile(request) {
		return fileForProjectPath(new File("."), request.projectDir || "");
	}

	function frontendGeneratedRootFile(request, info) {
		var settings = info && info.settings || {};
		var projectRoot = frontendProjectRootFile(request);
		return fileForProjectPath(projectRoot || new File("."), settings.privateDir || "_private/svelte");
	}

	function frontendProductionLifecycle() {
		return loadEngineModule("frontend-production-lifecycle.js");
	}

	function frontendProductionStateFile(request, info) {
		var generatedRoot = frontendGeneratedRootFile(request, info);
		return generatedRoot ? new File(generatedRoot, ".flow-svelte-production.json") : null;
	}

	function frontendReadProductionState(request, info) {
		var file = frontendProductionStateFile(request, info);
		try {
			if (file && file.isFile()) {
				return frontendProductionLifecycle().normalize(JSON.parse(String(FileUtils.readFileToString(file, "UTF-8"))));
			}
		} catch (ignored) {
		}
		return frontendProductionLifecycle().normalize(null);
	}

	function frontendWriteProductionState(request, info, state) {
		var file = frontendProductionStateFile(request, info);
		if (!file) {
			return;
		}
		file.getParentFile().mkdirs();
		var temporary = File.createTempFile("flow-svelte-production-", ".json", file.getParentFile());
		try {
			FileUtils.writeStringToFile(temporary, JSON.stringify(state, null, 2) + "\n", "UTF-8");
			if (!temporary.renameTo(file)) {
				FileUtils.copyFile(temporary, file);
			}
		} finally {
			temporary["delete"]();
		}
	}

	function frontendProductionFingerprint(request, info) {
		var model = frontendModelPath(request, info);
		if (!model || !model.isFile()) {
			return "";
		}
		var projectRoot = frontendProjectRootFile(request);
		var resourceRoot = frontendSvelteResourceRoot(request);
		var sourceRoot = model.getParentFile();
		while (sourceRoot && String(sourceRoot.getName()) !== "src") {
			sourceRoot = sourceRoot.getParentFile();
		}
		return sha256Hex([
			"flow-svelte-production-v1",
			fileFingerprint(model),
			sourceRoot && sourceRoot.isDirectory() ? directoryFingerprint(sourceRoot) : "",
			frontendDocumentDependenciesFingerprint(model, resourceRoot, projectRoot)
		].join("\n"));
	}

	function frontendObserveProductionState(request, info) {
		var state = frontendProductionLifecycle().observe(
			frontendReadProductionState(request, info),
			frontendProductionFingerprint(request, info)
		);
		frontendWriteProductionState(request, info, state);
		return state;
	}

	function frontendAtomicBuildOutput(projectRoot, buildOutput) {
		var target = fileForProjectPath(projectRoot, buildOutput);
		var parent = target.getParentFile();
		parent.mkdirs();
		var suffix = String(new Date().getTime()) + "-" + Math.floor(Math.random() * 1000000);
		return {
			target: target,
			staging: new File(parent, "." + target.getName() + ".flow-build-" + suffix),
			backup: new File(parent, "." + target.getName() + ".flow-previous-" + suffix)
		};
	}

	function frontendPromoteBuildOutput(output) {
		if (!output || !output.staging.isDirectory()) {
			throw new Error("The staged Svelte production output is missing.");
		}
		var backedUp = false;
		try {
			if (output.target.exists()) {
				if (!output.target.renameTo(output.backup)) {
					throw new Error("Unable to preserve the previous Svelte production output.");
				}
				backedUp = true;
			}
			if (!output.staging.renameTo(output.target)) {
				throw new Error("Unable to atomically publish the staged Svelte production output.");
			}
			if (backedUp && output.backup.exists()) {
				try {
					FileUtils.deleteDirectory(output.backup);
				} catch (ignoredCleanup) {
					frontendStudioLog("[Svelte production] The previous output backup could not be removed: " + output.backup, true);
				}
			}
		} catch (e) {
			if (!output.target.exists() && backedUp && output.backup.exists()) {
				output.backup.renameTo(output.target);
			}
			throw e;
		} finally {
			if (output.staging.exists()) {
				FileUtils.deleteDirectory(output.staging);
			}
		}
	}

	function frontendPrepareAtomicGeneratedOutput(generatedRoot, output) {
		var file = new File(generatedRoot, "svelte.config.js");
		if (!file.isFile()) {
			throw new Error("The generated Svelte configuration is missing.");
		}
		var original = String(FileUtils.readFileToString(file, "UTF-8"));
		var replacement = JSON.stringify(String(output.staging.getAbsolutePath()));
		var patched = original
			.replace(/(\bpages\s*:\s*)["'][^"']*["']/, "$1" + replacement)
			.replace(/(\bassets\s*:\s*)["'][^"']*["']/, "$1" + replacement);
		if (patched === original || patched.indexOf(replacement) < 0) {
			throw new Error("The generated Svelte output settings could not be staged.");
		}
		FileUtils.writeStringToFile(file, patched, "UTF-8");
		return { file: file, original: original };
	}

	function frontendRestoreGeneratedOutput(config) {
		if (config && config.file) {
			FileUtils.writeStringToFile(config.file, config.original, "UTF-8");
		}
	}

	function frontendDevStateFile(request, info) {
		var generatedRoot = frontendGeneratedRootFile(request, info);
		return generatedRoot ? new File(generatedRoot, ".flow-svelte-dev.json") : null;
	}

	function frontendDevViewersFile(request, info) {
		var generatedRoot = frontendGeneratedRootFile(request, info);
		return generatedRoot ? new File(generatedRoot, ".flow-svelte-viewers.json") : null;
	}

	function frontendPositiveEnvironmentNumber(name, fallback) {
		var value = Number(String(JavaSystem.getenv(String(name)) || ""));
		return isFinite(value) && value > 0 ? value : Number(fallback);
	}

	function frontendDevIdlePolicy() {
		return {
			firstViewerTimeoutMs: frontendPositiveEnvironmentNumber(
				"FLOW_SVELTE_DEV_FIRST_CLIENT_TIMEOUT_MS", 15 * 60 * 1000),
			noViewerTimeoutMs: frontendPositiveEnvironmentNumber(
				"FLOW_SVELTE_DEV_IDLE_TIMEOUT_MS", 2 * 60 * 1000),
			viewerStaleMs: frontendPositiveEnvironmentNumber(
				"FLOW_SVELTE_DEV_VIEWER_STALE_MS", 90 * 1000),
			pollMs: frontendPositiveEnvironmentNumber(
				"FLOW_SVELTE_DEV_IDLE_POLL_MS", 1000)
		};
	}

	function frontendDevLifecycle() {
		return loadEngineModule("frontend-dev-lifecycle.js");
	}

	function frontendDevTerminal(entry) {
		return entry && /^(?:stopped|exited)$/.test(String(entry.status || ""));
	}

	function frontendConnects(host, port, timeoutMs) {
		if (!port) {
			return false;
		}
		var InetSocketAddress = Packages.java.net.InetSocketAddress;
		var Socket = Packages.java.net.Socket;
		var socket = null;
		try {
			socket = new Socket();
			socket.connect(new InetSocketAddress(String(host || "127.0.0.1"), Number(port)), Number(timeoutMs || 300));
			return true;
		} catch (e) {
			return false;
		} finally {
			try {
				if (socket) {
					socket.close();
				}
			} catch (ignored) {
			}
		}
	}

	function frontendDevHealthUrl(entry) {
		if (!entry || !entry.port) {
			return "";
		}
		var path = String(entry.proxyPath || "/").trim();
		if (!path) {
			path = "/";
		} else if (path.charAt(0) !== "/") {
			path = "/" + path;
		}
		return "http://127.0.0.1:" + Number(entry.port) + path;
	}

	function frontendDevHttpReady(entry, timeoutMs) {
		var url = frontendDevHealthUrl(entry);
		if (!url) {
			return false;
		}
		var connection = null;
		try {
			connection = new Packages.java.net.URL(url).openConnection();
			var timeout = Math.max(100, Number(timeoutMs || 500));
			connection.setConnectTimeout(timeout);
			connection.setReadTimeout(timeout);
			connection.setUseCaches(false);
			if (typeof connection.setInstanceFollowRedirects === "function") {
				connection.setInstanceFollowRedirects(false);
			}
			var status = Number(connection.getResponseCode());
			return status >= 200 && status < 400;
		} catch (e) {
			return false;
		} finally {
			try {
				if (connection && typeof connection.disconnect === "function") {
					connection.disconnect();
				}
			} catch (_ignoreDevHealthDisconnect) {
			}
		}
	}

	function frontendWaitForDevHttp(entry, process, waitMs) {
		var deadline = JavaSystem.currentTimeMillis() + Math.max(1, Number(waitMs || 1));
		do {
			if (frontendDevHttpReady(entry, 500)) {
				return true;
			}
			if (process && typeof process.isAlive === "function" && !process.isAlive()) {
				return false;
			}
			try {
				Packages.java.lang.Thread.sleep(50);
			} catch (_ignoreDevHealthWait) {
				return false;
			}
		} while (JavaSystem.currentTimeMillis() < deadline);
		return frontendDevHttpReady(entry, 500);
	}

	function frontendProcessAlive(pid) {
		if (!pid) {
			return false;
		}
		try {
			var optional = Packages.java.lang.ProcessHandle.of(Packages.java.lang.Long.valueOf(String(pid)));
			return optional && optional.isPresent() && optional.get().isAlive();
		} catch (e) {
			return false;
		}
	}

	function frontendDevAlive(entry) {
		if (!entry) {
			return false;
		}
		if (frontendDevTerminal(entry)) {
			return false;
		}
		if (entry.status === "prepared") {
			return true;
		}
		if (entry.status === "starting" && entry.setupProcess
				&& typeof entry.setupProcess.isAlive === "function" && entry.setupProcess.isAlive()) {
			return true;
		}
		if (entry.process && typeof entry.process.isAlive === "function" && entry.process.isAlive()) {
			return true;
		}
		if (frontendProcessAlive(entry.pid)) {
			return true;
		}
		return frontendConnects("127.0.0.1", entry.port, 300);
	}

	function frontendReadDevState(request, info) {
		var file = frontendDevStateFile(request, info);
		if (!file || !file.isFile()) {
			return null;
		}
		try {
			var entry = JSON.parse(String(FileUtils.readFileToString(file, "UTF-8")));
			if (!entry.status && (entry.url || entry.port)) {
				entry.status = "running";
			}
			entry.stateFile = String(file.getAbsolutePath());
			entry._stateModifiedAt = Number(file.lastModified());
			entry.detected = "stateFile";
			return entry;
		} catch (e) {
			try {
				file["delete"]();
			} catch (_ignoreDeleteState) {
			}
			return null;
		}
	}

	function frontendDevStateTimestamp(entry) {
		if (!entry) {
			return 0;
		}
		var timestamp = Number(entry._stateModifiedAt || 0);
		["lastTransitionAt", "stoppedAt", "startedAt"].forEach(function (name) {
			var parsed = Date.parse(String(entry[name] || ""));
			if (isFinite(parsed)) {
				timestamp = Math.max(timestamp, parsed);
			}
		});
		return timestamp;
	}

	function frontendPersistedDevStateWins(cached, persisted, cachedAlive, persistedAlive) {
		if (!persisted) {
			return false;
		}
		if (!cached) {
			return true;
		}
		var cachedTime = frontendDevStateTimestamp(cached);
		var persistedTime = frontendDevStateTimestamp(persisted);
		var cachedPid = Number(cached.pid || 0);
		var persistedPid = Number(persisted.pid || 0);
		if (persistedAlive && !cachedAlive) {
			return true;
		}
		if (persistedTime <= cachedTime) {
			return false;
		}
		if (frontendDevTerminal(persisted)) {
			return true;
		}
		if (persistedAlive && cachedPid !== persistedPid) {
			return true;
		}
		return persistedAlive && String(persisted.status || "") !== String(cached.status || "");
	}

	function frontendReconcileDevEntry(cached, persisted) {
		if (!cached) {
			return persisted;
		}
		if (!persisted) {
			return cached;
		}
		var cachedPid = Number(cached.pid || 0);
		var persistedPid = Number(persisted.pid || 0);
		if (cachedPid > 0 && cachedPid === persistedPid) {
			var runtimeFields = {
				process: cached.process,
				setupProcess: cached.setupProcess,
				logPump: cached.logPump,
				idleThread: cached.idleThread,
				activationThread: cached.activationThread
			};
			Object.assign(cached, persisted);
			Object.keys(runtimeFields).forEach(function (name) {
				if (runtimeFields[name]) {
					cached[name] = runtimeFields[name];
				}
			});
			return cached;
		}
		return frontendPersistedDevStateWins(cached, persisted,
			frontendDevAlive(cached), frontendDevAlive(persisted)) ? persisted : cached;
	}

	function frontendReadDevLogState(request, info) {
		var generatedRoot = frontendGeneratedRootFile(request, info);
		var logFile = generatedRoot ? new File(generatedRoot, "vite-dev.log") : null;
		if (!logFile || !logFile.isFile()) {
			return null;
		}
		try {
			var text = String(FileUtils.readFileToString(logFile, "UTF-8"));
			var match = /https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)/.exec(text);
			if (!match) {
				return null;
			}
			var port = Number(match[1]);
			if (!frontendConnects("127.0.0.1", port, 300)) {
				return null;
			}
			var projectRoot = frontendProjectRootFile(request);
			return {
				url: "http://localhost:" + port + "/",
				port: port,
				pid: frontendPidForPort(port),
				projectRoot: projectRoot ? String(projectRoot.getAbsolutePath()) : "",
				generatedRoot: String(generatedRoot.getAbsolutePath()),
				logFile: String(logFile.getAbsolutePath()),
				startedAt: new Date(logFile.lastModified()).toISOString(),
				detected: "viteLog"
			};
		} catch (e) {
			return null;
		}
	}

	function frontendWriteDevState(request, info, entry) {
		var file = frontendDevStateFile(request, info);
		if (!file || !entry) {
			return;
		}
		var proxyState = frontendDevProxyService().stateFields(entry);
		var state = {
			url: entry.url || "",
			localUrl: proxyState.localUrl,
			publicBaseUrl: proxyState.publicBaseUrl,
			proxyKey: proxyState.proxyKey,
			proxyPath: proxyState.proxyPath,
			proxyActive: proxyState.proxyActive,
			port: entry.port || 0,
			pid: entry.pid || 0,
			projectRoot: entry.projectRoot || "",
			generatedRoot: entry.generatedRoot || "",
			logFile: entry.logFile || "",
			previousLogFile: entry.previousLogFile || "",
			startedAt: entry.startedAt || new Date().toISOString(),
			status: entry.status || "running",
			setupLogFile: entry.setupLogFile || "",
			setupRoot: entry.setupRoot
				? String(entry.setupRoot.getAbsolutePath ? entry.setupRoot.getAbsolutePath() : entry.setupRoot)
				: "",
			setupFingerprint: entry.setupFingerprint || "",
			setupKind: entry.setupKind || "",
			idlePolicy: entry.idlePolicy || null,
			dependencyFingerprint: entry.dependencyFingerprint || "",
			dependencyManifestFingerprint: entry.dependencyManifestFingerprint || "",
			restartCount: Number(entry.restartCount || 0),
			previousPid: Number(entry.previousPid || 0),
			viewerCount: Number(entry.viewerCount || 0),
			viewerIds: entry.viewerIds || [],
			firstViewerAt: entry.firstViewerAt || "",
			lastViewerAt: entry.lastViewerAt || "",
			lastViewerGoneAt: entry.lastViewerGoneAt || "",
			lastViewerTransitionAt: entry.lastViewerTransitionAt || "",
			lastTransitionAt: entry.lastTransitionAt || entry.startedAt || "",
			stoppedAt: entry.stoppedAt || "",
			stopReason: entry.stopReason || "",
			exitCode: entry.exitCode === null || entry.exitCode === undefined
				? null
				: Number(entry.exitCode),
			exitLogTail: entry.exitLogTail || ""
		};
		frontendWriteFile(file, JSON.stringify(state, null, 2) + "\n");
		entry.stateFile = String(file.getAbsolutePath());
	}

	function frontendDeleteDevState(request, info) {
		var file = frontendDevStateFile(request, info);
		if (file && file.isFile()) {
			try {
				file["delete"]();
			} catch (e) {
			}
		}
	}

	function frontendDeleteDevViewers(request, info) {
		var file = frontendDevViewersFile(request, info);
		if (file && file.isFile()) {
			try {
				file["delete"]();
			} catch (e) {
			}
		}
	}

	function frontendReadDevViewers(request, info) {
		var file = frontendDevViewersFile(request, info);
		if (!file || !file.isFile()) {
			return { viewers: [] };
		}
		try {
			var state = JSON.parse(String(FileUtils.readFileToString(file, "UTF-8")));
			return state && Array.isArray(state.viewers) ? state : { viewers: [] };
		} catch (e) {
			return null;
		}
	}

	function frontendCommandOutput(args) {
		try {
			var pb = new Packages.java.lang.ProcessBuilder(javaStringList(args));
			pb.redirectErrorStream(true);
			var process = pb.start();
			var output = frontendReadProcessOutput(process.getInputStream(), "Svelte dev state");
			process.waitFor();
			return String(output || "");
		} catch (e) {
			return "";
		}
	}

	function frontendPidForPort(port) {
		if (!port) {
			return 0;
		}
		var lsof = new File("/usr/sbin/lsof").isFile() ? "/usr/sbin/lsof" : "lsof";
		var output = frontendCommandOutput([lsof, "-nP", "-iTCP:" + Number(port), "-sTCP:LISTEN", "-t"]);
		var lines = output.split(/\r?\n/);
		for (var i = 0; i < lines.length; i++) {
			var pid = Number(String(lines[i] || "").trim());
			if (pid > 0) {
				return pid;
			}
		}
		return 0;
	}

	function frontendDevEntry(request, info) {
		var key = frontendDevKey(request, info);
		var cachedEntry = runtimeState.frontendDevServers[key];
		var persistedEntry = frontendReadDevState(request, info);
		var entry = frontendReconcileDevEntry(cachedEntry, persistedEntry);
		if (entry && entry !== cachedEntry) {
			if (cachedEntry && /^(?:starting|prepared)$/.test(String(cachedEntry.status || ""))
					&& String(entry.status || "") === "running") {
				cachedEntry.cancelled = true;
				frontendDestroyJavaProcess(cachedEntry.setupProcess);
			}
			runtimeState.frontendDevServers[key] = entry;
		}
		if (entry && entry.status === "starting") {
			frontendFinishPreparation(entry, false);
		}
		if (entry && entry.status === "failed") {
			return entry;
		}
		if (entry && !frontendDevAlive(entry)) {
			frontendUnregisterDevProxy(entry);
			delete runtimeState.frontendDevServers[key];
			if (!frontendDevTerminal(entry)) {
				frontendDeleteDevState(request, info);
			}
			entry = null;
		}
		if (entry && /^(?:starting|prepared)$/.test(String(entry.status || ""))) {
			return entry;
		}
		if (entry && !frontendWaitForDevHttp(entry, entry.process, 1500)) {
			frontendUnregisterDevProxy(entry);
			if (entry.process) {
				frontendDestroyDevProcess(entry, "dev-http-unavailable");
			}
			delete runtimeState.frontendDevServers[key];
			frontendDeleteDevState(request, info);
			entry = null;
		}
		if (entry && frontendEnsureDevProxy(request, entry)) {
			frontendStartDevIdleWatcher(request, null, info, entry);
			return entry;
		}
		if (entry) {
			frontendDestroyDevProcess(entry, "proxy-route-unavailable");
			delete runtimeState.frontendDevServers[key];
			frontendDeleteDevState(request, info);
			return null;
		}
		entry = frontendReadDevState(request, info);
		if (frontendDevTerminal(entry)) {
			return null;
		}
		if (entry && entry.status === "starting") {
			frontendFinishPreparation(entry, false);
		}
		if (entry && /^(?:starting|prepared)$/.test(String(entry.status || ""))) {
			runtimeState.frontendDevServers[key] = entry;
			return entry;
		}
		if (entry && frontendDevAlive(entry) && frontendWaitForDevHttp(entry, null, 1500)
				&& frontendEnsureDevProxy(request, entry)) {
			runtimeState.frontendDevServers[key] = entry;
			frontendStartDevIdleWatcher(request, null, info, entry);
			return entry;
		}
		if (entry && !frontendDevTerminal(entry)) {
			frontendDeleteDevState(request, info);
		}
		entry = frontendReadDevLogState(request, info);
		if (entry && frontendDevAlive(entry) && frontendWaitForDevHttp(entry, null, 1500)
				&& frontendEnsureDevProxy(request, entry)) {
			runtimeState.frontendDevServers[key] = entry;
			frontendWriteDevState(request, info, entry);
			frontendStartDevIdleWatcher(request, null, info, entry);
			return entry;
		}
		if (entry && frontendDevAlive(entry)) {
			frontendDestroyDevProcess(entry, "proxy-route-unavailable");
		}
		return null;
	}

	function frontendLastDevDetails(request, info) {
		var state = frontendReadDevState(request, info);
		return frontendDevTerminal(state) ? frontendDevDetails(state) : {};
	}

	function frontendDevDetails(entry) {
		if (!entry) {
			return {};
		}
		return {
			url: entry.url,
			localUrl: entry.localUrl || "",
			proxyPath: entry.proxyPath || "",
			proxyActive: entry.proxyActive === true,
			port: entry.port,
			projectRoot: entry.projectRoot,
			generatedRoot: entry.generatedRoot,
			logFile: entry.logFile,
			previousLogFile: entry.previousLogFile || "",
			startedAt: entry.startedAt,
			pid: entry.pid || 0,
			stateFile: entry.stateFile || "",
			status: entry.status || "running",
			idlePolicy: entry.idlePolicy || null,
			dependencyFingerprint: entry.dependencyFingerprint || "",
			dependencyManifestFingerprint: entry.dependencyManifestFingerprint || "",
			restartCount: Number(entry.restartCount || 0),
			previousPid: Number(entry.previousPid || 0),
			viewerCount: Number(entry.viewerCount || 0),
			viewerIds: entry.viewerIds || [],
			firstViewerAt: entry.firstViewerAt || "",
			lastViewerAt: entry.lastViewerAt || "",
			lastViewerGoneAt: entry.lastViewerGoneAt || "",
			lastViewerTransitionAt: entry.lastViewerTransitionAt || "",
			lastTransitionAt: entry.lastTransitionAt || "",
			stoppedAt: entry.stoppedAt || "",
			stopReason: entry.stopReason || "",
			exitCode: entry.exitCode === null || entry.exitCode === undefined
				? null
				: Number(entry.exitCode),
			exitLogTail: entry.exitLogTail || "",
			setupKind: entry.setupKind || "",
			error: entry.error || null
		};
	}

	function frontendExecutable(name) {
		var path = String(Packages.java.lang.System.getenv("PATH") || "");
		var parts = path.split(String(File.pathSeparator));
		var home = String(Packages.java.lang.System.getProperty("user.home") || "");
		["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"].forEach(function (dir) {
			parts.push(dir);
		});
		var nvmRoot = new File(home, ".nvm/versions/node");
		var versions = nvmRoot.listFiles();
		if (versions) {
			versions = Arrays.asList(versions).toArray();
			versions.sort(function (a, b) {
				return String(b.getName()).localeCompare(String(a.getName()));
			});
			versions.forEach(function (version) {
				parts.push(String(new File(version, "bin").getAbsolutePath()));
			});
		}
		for (var i = 0; i < parts.length; i++) {
			var candidate = new File(parts[i], name);
			if (candidate.isFile() && candidate.canExecute()) {
				return String(candidate.getAbsolutePath());
			}
		}
		if (/^(node|npm|npx)$/.test(String(name))) {
			var ProcessUtils = Packages.com.twinsoft.convertigo.engine.util.ProcessUtils;
			var windows = Packages.com.twinsoft.convertigo.engine.Engine.isWindows();
			var version = String(ProcessUtils.getDefaultNodeVersion());
			var expectedDir = ProcessUtils.getDefaultNodeDir();
			var expectedBin = windows || expectedDir && expectedDir.getName() === "bin" ? expectedDir : new File(expectedDir, "bin");
			var executableName = String(name) + (windows ? name === "node" ? ".exe" : ".cmd" : "");
			var expected = new File(expectedBin, executableName);
			if (!expected.isFile()) {
				frontendStudioLog("[Svelte frontbuilder] Installing managed Node.js " + version + " in the Convertigo workspace.");
			}
			var nodeDir = ProcessUtils.getNodeDir(version);
			var managed = new File(nodeDir, executableName);
			if (managed.isFile()) {
				return String(managed.getAbsolutePath());
			}
			var error = new Error("Managed Node.js " + version + " did not provide " + executableName + ".");
			error.code = "FRONTBUILDER_NODE_INSTALL_FAILED";
			error.hint = "Check Convertigo workspace permissions and access to nodejs.org.";
			throw error;
		}
		return name;
	}

	function frontendExecutablePathPrefix(executable) {
		var parent = new File(String(executable || "")).getParentFile();
		return parent ? String(parent.getAbsolutePath()) + File.pathSeparator : "";
	}

	function frontendProviderService() {
		if (!frontendProviderServiceModule) {
			frontendProviderServiceModule = loadEngineModule("frontend-provider-service.js");
		}
		return frontendProviderServiceModule;
	}

	function frontendProviderEnv() {
		return {
			canonical: function (path) {
				return String(new File(String(path || "")).getCanonicalPath());
			},
			resolve: function (root, path) {
				return String(new File(new File(String(root || "")), String(path || "")).getCanonicalPath());
			},
			fileInfo: function (path) {
				var file = new File(String(path || ""));
				return {
					exists: file.isFile(),
					size: file.isFile() ? Number(file.length()) : -1,
					mtime: file.isFile() ? Number(file.lastModified()) : -1
				};
			},
			readText: function (path) {
				return String(FileUtils.readFileToString(new File(String(path)), "UTF-8"));
			},
			sha256Text: sha256Hex,
			sha256File: function (path) {
				return sha256FileHex(new File(String(path)));
			}
		};
	}

	function clearFrontendProviderState() {
		frontendProviderService().clear(runtimeState.frontendProviders);
	}

	function frontendProviderSelection(resourceRoot, script) {
		var toolRoot = frontendSvelteToolRoot(resourceRoot, script);
		var selection = frontendProviderService().select(
			String(toolRoot.getCanonicalPath()),
			script,
			runtimeState.frontendProviders,
			frontendProviderEnv()
		);
		selection.toolRoot = toolRoot;
		return selection;
	}

	function frontendRejectProvider(selection, error) {
		if (!selection || selection.kind !== "compiled") {
			return;
		}
		frontendProviderService().reject(selection, runtimeState.frontendProviders,
			String(error && error.message || error || "provider launch failed"));
	}

	function frontendProviderKey(selection) {
		return String(selection.kind || "tsx") + "\n"
			+ String(selection.reason || "") + "\n" + String(selection.signature || "");
	}

	function frontendSvelteToolRoot(resourceRoot, script) {
		function usable(root) {
			if (!root || !root.isDirectory()) {
				return null;
			}
			var scriptFile = new File(root, script);
			if (!scriptFile.isFile()) {
				return null;
			}
			return root;
		}
		var root = usable(resourceRoot);
		if (root) {
			return root;
		}
		var configuredRoot = String(Packages.java.lang.System.getenv("FLOW_FRONTBUILDER_RESOURCE_ROOT") || "").trim();
		root = configuredRoot ? usable(new File(configuredRoot)) : null;
		if (root) {
			return root;
		}
		var loadedRoot = loadedProjectRootForName("lib_flow_frontbuilder_svelte");
		root = loadedRoot ? usable(new File(loadedRoot, "libs/flow/frontbuilder/svelte")) : null;
		if (root) {
			return root;
		}
		var engineFlowDir = engineDir();
		var engineProjectDir = engineFlowDir && engineFlowDir.getParentFile() && engineFlowDir.getParentFile().getParentFile();
		var gitRoot = engineProjectDir && engineProjectDir.getParentFile();
		root = gitRoot ? usable(new File(gitRoot, "c8oprj-lib-flow-frontbuilder-svelte/libs/flow/frontbuilder/svelte")) : null;
		return root || resourceRoot;
	}

	function frontendTsxCommandForToolRoot(toolRoot, script, args) {
		args = args || [];
		var scriptFile = new File(toolRoot, script);
		var tsxCli = new File(toolRoot, "node_modules/tsx/dist/cli.mjs");
		if (tsxCli.isFile()) {
			var command = [frontendExecutable("node"), String(tsxCli.getAbsolutePath()), String(scriptFile.getAbsolutePath())];
			args.forEach(function (arg) {
				command.push(arg);
			});
			return command;
		}
		var fallback = [frontendExecutable("npm"), "--prefix", String(toolRoot.getAbsolutePath()), "exec", "--", "tsx", String(scriptFile.getAbsolutePath())];
		args.forEach(function (arg) {
			fallback.push(arg);
		});
		return fallback;
	}

	function frontendTsxCommand(resourceRoot, script, args) {
		return frontendTsxCommandForToolRoot(frontendSvelteToolRoot(resourceRoot, script), script, args);
	}

	function frontendProviderCommand(resourceRoot, script, args) {
		args = args || [];
		var selection = frontendProviderSelection(resourceRoot, script);
		var command;
		if (selection.kind === "compiled") {
			command = [frontendExecutable("node"), String(selection.bundle)];
			args.forEach(function (arg) { command.push(arg); });
		} else {
			command = frontendTsxCommandForToolRoot(selection.toolRoot, script, args);
		}
		selection.command = command;
		selection.key = frontendProviderKey(selection);
		return selection;
	}

	function freePort() {
		var socket = new Packages.java.net.ServerSocket(0);
		try {
			return socket.getLocalPort();
		} finally {
			socket.close();
		}
	}

	function javaStringList(values) {
		var list = new java.util.ArrayList();
		for (var i = 0; i < values.length; i++) {
			list.add(String(values[i]));
		}
		return list;
	}

	function frontendStudioLog(message, warn) {
		try {
			var engine = Packages.com.twinsoft.convertigo.engine.Engine;
			var log = engine.logStudio || engine.logEngine;
			if (warn === true) {
				log.warn(String(message));
			} else {
				log.info(String(message));
			}
		} catch (e) {
		}
	}

	function frontendLogTail(file, maxLines) {
		try {
			if (!file || !file.isFile()) {
				return "";
			}
			var lines = String(FileUtils.readFileToString(file, "UTF-8")).split(/\r?\n/);
			var start = Math.max(0, lines.length - (maxLines || 80));
			return lines.slice(start).join("\n").trim();
		} catch (e) {
			return "";
		}
	}

	function frontendRotateLogFile(logFile) {
		if (!logFile) {
			return null;
		}
		var previousLogFile = new File(logFile.getParentFile(), "vite-dev.previous.log");
		try {
			if (previousLogFile.isFile()) {
				previousLogFile["delete"]();
			}
			if (logFile.isFile() && !logFile.renameTo(previousLogFile)) {
				FileUtils.copyFile(logFile, previousLogFile);
				FileUtils.writeStringToFile(logFile, "", "UTF-8");
			}
		} catch (e) {
			frontendStudioLog("[Svelte dev] Unable to preserve previous Vite log: " + String(e), true);
		}
		return previousLogFile;
	}

	function frontendStartLogPump(process, logFile, label) {
		var Runnable = Packages.java.lang.Runnable;
		var Thread = Packages.java.lang.Thread;
		var BufferedReader = Packages.java.io.BufferedReader;
		var FileOutputStream = Packages.java.io.FileOutputStream;
		var InputStreamReader = Packages.java.io.InputStreamReader;
		var OutputStreamWriter = Packages.java.io.OutputStreamWriter;
		var PrintWriter = Packages.java.io.PrintWriter;
		logFile.getParentFile().mkdirs();
		var thread = new Thread(new Runnable({
			run: function () {
				var reader = null;
				var writer = null;
				try {
					reader = new BufferedReader(new InputStreamReader(process.getInputStream(), "UTF-8"));
					writer = new PrintWriter(new OutputStreamWriter(new FileOutputStream(logFile, true), "UTF-8"), true);
					var line;
					while ((line = reader.readLine()) !== null) {
						line = String(line);
						writer.println(line);
						frontendStudioLog("[" + label + "] " + line);
					}
				} catch (e) {
					var expected = /(?:stream|pipe) closed/i.test(String(e || ""));
					try {
						expected = expected || !process || !process.isAlive();
					} catch (_ignoreLogPumpState) {
					}
					frontendStudioLog("[" + label + "] log pump stopped: " + String(e), !expected);
				} finally {
					try {
						if (reader) {
							reader.close();
						}
					} catch (e1) {
					}
					try {
						if (writer) {
							writer.close();
						}
					} catch (e2) {
					}
				}
			}
		}), "Flow Svelte dev log");
		thread.setDaemon(true);
		thread.start();
		return thread;
	}

	function frontendFinalizeDevState(request, info, entry, status, reason) {
		if (!entry) {
			return;
		}
		var now = new Date().toISOString();
		entry.status = String(status || "stopped");
		entry.stopReason = String(reason || entry.stopReason || "");
		entry.stoppedAt = entry.stoppedAt || now;
		entry.lastTransitionAt = now;
		frontendWriteDevState(request, info, entry);
	}

	function frontendStartDevIdleWatcher(request, blocks, info, entry) {
		if (!entry || entry.idleThreadStarted === true || frontendDevTerminal(entry)
				|| !/^(?:running|starting)$/.test(String(entry.status || "running"))) {
			return;
		}
		var watcherRequest = JSON.parse(JSON.stringify(request || {}));
		watcherRequest.engineSource = watcherRequest.engineSource || JSON.stringify(projectEngineDefinitionForRequest(request));
		entry.idlePolicy = entry.idlePolicy || frontendDevIdlePolicy();
		entry.idleThreadStarted = true;
		var Runnable = Packages.java.lang.Runnable;
		var Thread = Packages.java.lang.Thread;
		var thread = new Thread(new Runnable({
			run: function () {
				try {
					while (entry.cancelled !== true && !frontendDevTerminal(entry)) {
						var key = frontendDevKey(request, info);
						var current = runtimeState.frontendDevServers[key];
						if (current && current !== entry
								&& (!entry.pid || Number(current.pid || 0) !== Number(entry.pid))) {
							return;
						}
						if (!frontendDevAlive(entry)) {
							if (!current || current === entry) {
								delete runtimeState.frontendDevServers[key];
								var stoppedState = frontendReadDevState(request, info);
								if (stoppedState && entry.pid
										&& Number(stoppedState.pid || 0) === Number(entry.pid)) {
									if (!frontendDevTerminal(stoppedState)) {
										var stoppedReason = String(stoppedState.stopReason || "");
										var requestedStop = String(stoppedState.status || "") === "stopping"
											|| stoppedReason !== "" && stoppedReason !== "process-exited";
										frontendFinalizeDevState(request, info, stoppedState,
											requestedStop ? "stopped" : "exited",
											stoppedReason || (requestedStop ? "manual" : "process-exited"));
									}
									frontendDeleteDevViewers(request, info);
								}
							}
							return;
						}
						var viewerState = frontendReadDevViewers(request, info);
						if (viewerState !== null) {
							var decision = frontendDevLifecycle().update(entry, viewerState,
								Number(new Date().getTime()));
							if (decision.changed) {
								frontendWriteDevState(request, info, entry);
							}
							if (decision.stopReason) {
								entry.stopReason = decision.stopReason;
								entry.status = "stopping";
								entry.lastTransitionAt = new Date().toISOString();
								frontendWriteDevState(request, info, entry);
								frontendStudioLog("[Svelte dev] Stopping idle Vite server: " + decision.stopReason + ".");
								frontendDestroyDevProcess(entry, decision.stopReason);
								if (runtimeState.frontendDevServers[key] === entry) {
									delete runtimeState.frontendDevServers[key];
								}
								frontendFinalizeDevState(request, info, entry, "stopped", decision.stopReason);
								frontendDeleteDevViewers(request, info);
								frontendScheduleProductionBuild(watcherRequest, blocks, decision.stopReason);
								return;
							}
						}
						Thread.sleep(Number(entry.idlePolicy.pollMs || 1000));
					}
				} catch (e) {
					frontendStudioLog("[Svelte dev] Idle watcher stopped: " + String(e), true);
				}
			}
		}), "Flow Svelte dev idle");
		thread.setDaemon(true);
		thread.start();
		entry.idleThread = thread;
	}

	function frontendStartDevExitWatcher(request, info, entry) {
		if (!entry || !entry.process || typeof entry.process.waitFor !== "function") {
			return;
		}
		var Runnable = Packages.java.lang.Runnable;
		var Thread = Packages.java.lang.Thread;
		var thread = new Thread(new Runnable({
			run: function () {
				var exitCode = null;
				try {
					exitCode = Number(entry.process.waitFor());
				} catch (_ignoreDevWait) {
				}
				try {
					entry.exitCode = exitCode;
					entry.exitLogTail = frontendLogTail(new File(String(entry.logFile || "")), 80);
					frontendUnregisterDevProxy(entry);
					var key = frontendDevKey(request, info);
					var current = runtimeState.frontendDevServers[key];
					var persisted = frontendReadDevState(request, info);
					var currentMatches = current === entry
						|| (current && entry.pid && Number(current.pid) === Number(entry.pid));
					if (currentMatches) {
						delete runtimeState.frontendDevServers[key];
					}
					var persistedMatches = persisted && entry.pid
						&& Number(persisted.pid || 0) === Number(entry.pid);
					if (persistedMatches) {
						var finalEntry = Object.assign({}, entry, persisted);
						finalEntry.proxyActive = false;
						var persistedReason = String(persisted.stopReason || "");
						var requestedStop = entry.cancelled === true
							|| String(persisted.status || "") === "stopping"
							|| String(persisted.status || "") === "stopped"
							|| persistedReason !== "" && persistedReason !== "process-exited";
						frontendFinalizeDevState(request, info, finalEntry,
							requestedStop ? "stopped" : "exited",
							persistedReason || entry.stopReason
								|| (requestedStop ? "manual" : "process-exited"));
						frontendDeleteDevViewers(request, info);
					}
				} catch (e) {
					frontendStudioLog("[Svelte dev] Unable to clean stopped dev state: " + String(e), true);
				}
				if (entry.cancelled !== true) {
					frontendStudioLog("[Svelte dev] Vite stopped" +
						(exitCode === null ? "." : " with exit code " + exitCode + "."));
				}
			}
		}), "Flow Svelte dev exit");
		thread.setDaemon(true);
		thread.start();
		entry.exitThread = thread;
	}

	function frontendWaitForPort(host, port, process, timeoutMs) {
		var InetSocketAddress = Packages.java.net.InetSocketAddress;
		var Socket = Packages.java.net.Socket;
		var Thread = Packages.java.lang.Thread;
		var deadline = Number(new Date().getTime()) + Number(timeoutMs || 20000);
		while (Number(new Date().getTime()) < deadline) {
			if (process && typeof process.isAlive === "function" && !process.isAlive()) {
				return false;
			}
			var socket = null;
			try {
				socket = new Socket();
				socket.connect(new InetSocketAddress(String(host), Number(port)), 300);
				return true;
			} catch (e) {
			} finally {
				try {
					if (socket) {
						socket.close();
					}
				} catch (ignored) {
				}
			}
			Thread.sleep(250);
		}
		return false;
	}

	function frontendStudioBrowser(request, url, title, kind) {
		var projectName = frontendProjectName(request) || "project";
		var browserKind = String(kind || "preview");
		var debugPort = Number(request && request.browserDebugPort || 0);
		debugPort = isFinite(debugPort) && debugPort >= 1024 && debugPort <= 65535
			? Math.floor(debugPort) : 0;
		var browser = {
			id: "flow.frontend:" + projectName + ":" + browserKind,
			title: browserKind === "frontbuilder.svelte.dev"
				? projectName + " Frontend"
				: String(title || "Flow frontend"),
			project: projectName,
			url: String(url || ""),
			tooltip: String(url || ""),
			kind: browserKind
		};
		if (debugPort) {
			browser.debugPort = debugPort;
			browser.debugUrl = "http://127.0.0.1:" + debugPort;
		}
		if (browser.kind === "frontbuilder.svelte.dev") {
			browser.authoring = {
				protocol: "convertigo.flow.authoring.v1"
			};
		}
		return browser;
	}

	function frontendBrowserControlState(request, browser, waitMs) {
		var debugPort = Number(browser && browser.debugPort || request && request.browserDebugPort || 0);
		debugPort = isFinite(debugPort) && debugPort >= 1024 && debugPort <= 65535
			? Math.floor(debugPort) : 0;
		var ready = debugPort > 0 && frontendWaitForPort("127.0.0.1", debugPort, null, waitMs || 1);
		return {
			browserDebugPortRequested: debugPort,
			browserDebugPortMatched: ready,
			browserControlReady: ready,
			browserDebugUrl: debugPort ? "http://127.0.0.1:" + debugPort : ""
		};
	}

	function frontendNotifyStudioBrowser(request, browser) {
		if (!browser || String(request && request.origin || "") !== "mcp") {
			return;
		}
		try {
			Packages.com.twinsoft.convertigo.engine.flow.FlowEngineBridge.notifyStudioBrowser(JSON.stringify(browser));
		} catch (e) {
			frontendStudioLog("[Svelte dev] Unable to notify the Studio browser: " + String(e), true);
		}
	}

	function frontendLaunchVite(request, info) {
		var settings = info.settings || {};
		var projectRoot = fileForProjectPath(new File("."), request.projectDir || "");
		var generatedRoot = fileForProjectPath(projectRoot, settings.privateDir || "_private/svelte");
		var nodeModules = new File(generatedRoot, "node_modules");
		if (!nodeModules.isDirectory()) {
			return failure("frontbuilder", {
				code: "FRONTBUILDER_APP_DEPENDENCIES_MISSING",
				message: "Svelte app dependencies were not installed before starting dev mode.",
				details: {
					generatedRoot: String(generatedRoot.getAbsolutePath()),
					nodeModules: String(nodeModules.getAbsolutePath()),
					install: {}
				}
			});
		}
		var npm = frontendExecutable("npm");
		frontendDeleteDevViewers(request, info);
		var port = freePort();
		var proxy = frontendRegisterDevProxy(request, port);
		if (!proxy) {
			return failure("frontbuilder", {
				code: "FRONTBUILDER_DEV_PUBLIC_ROUTE_UNAVAILABLE",
				message: "Unable to create a public same-origin route for Svelte dev mode."
			});
		}
		var url = proxy.publicUrl;
		var logFile = new File(generatedRoot, "vite-dev.log");
		var previousLogFile = frontendRotateLogFile(logFile);
		var pb = new Packages.java.lang.ProcessBuilder(javaStringList([
			npm, "--prefix", String(generatedRoot.getAbsolutePath()), "exec", "--",
			"vite", "--host", "127.0.0.1", "--port", String(port), "--strictPort"
		]));
		pb.directory(generatedRoot);
		pb.redirectErrorStream(true);
		pb.environment().put("PATH", frontendExecutablePathPrefix(npm) + String(Packages.java.lang.System.getenv("PATH") || ""));
		pb.environment().put("FLOW_SVELTE_DEV_BASE", String(proxy.viteBase));
		frontendStudioLog("[Svelte dev] > " + npm + " --prefix " + generatedRoot.getAbsolutePath() + " exec -- vite --host 127.0.0.1 --port " + port + " --strictPort (public gateway base enabled)");
		var process;
		try {
			process = pb.start();
		} catch (startError) {
			Packages.com.twinsoft.convertigo.engine.Engine.theApp.reverseProxyManager
				.removeReverseProxyHttp(String(proxy.ticket));
			return failure("frontbuilder", {
				code: "FRONTBUILDER_DEV_START_FAILED",
				message: "Unable to launch Svelte dev mode: " + String(startError)
			});
		}
		var logPump = frontendStartLogPump(process, logFile, "Svelte dev");
		var healthEntry = {
			port: port,
			proxyPath: proxy.viteBase
		};
		if (!frontendWaitForPort("127.0.0.1", port, process, 20000)
				|| !frontendWaitForDevHttp(healthEntry, process, 20000)) {
			try {
				process.destroy();
			} catch (e) {
			}
			Packages.com.twinsoft.convertigo.engine.Engine.theApp.reverseProxyManager
				.removeReverseProxyHttp(String(proxy.ticket));
			var tail = frontendLogTail(logFile, 80);
			return failure("frontbuilder", {
				code: "FRONTBUILDER_DEV_START_FAILED",
				message: "Svelte dev mode did not start on " + url + ". See Studio log or " + logFile.getAbsolutePath() + ".",
				details: {
					url: url,
					port: port,
					generatedRoot: String(generatedRoot.getAbsolutePath()),
					logFile: String(logFile.getAbsolutePath()),
					logTail: tail
				}
			});
		}
		var startedAt = new Date().toISOString();
		var processPid = typeof process.pid === "function" ? Number(process.pid()) : 0;
		var entry = {
			url: url,
			localUrl: proxy.localUrl,
			publicBaseUrl: proxy.publicBaseUrl,
			proxyKey: proxy.ticket,
			proxyPath: proxy.viteBase,
			proxyActive: true,
			port: port,
			pid: frontendPidForPort(port) || processPid,
			projectRoot: String(projectRoot.getAbsolutePath()),
			generatedRoot: String(generatedRoot.getAbsolutePath()),
			logFile: String(logFile.getAbsolutePath()),
			previousLogFile: previousLogFile ? String(previousLogFile.getAbsolutePath()) : "",
			startedAt: startedAt,
			status: "running",
			idlePolicy: frontendDevIdlePolicy(),
			dependencyFingerprint: frontendDependencyFingerprint(generatedRoot, npm),
			dependencyManifestFingerprint: frontendDependencyManifestFingerprint(generatedRoot, npm),
			restartCount: 0,
			viewerCount: 0,
			viewerIds: [],
			lastTransitionAt: startedAt,
			logPump: logPump,
			process: process
		};
		return {
			ok: true,
			entry: entry
		};
	}

	function frontendDevWaitRequested(request) {
		var payload = request && request.action && request.action.payload || {};
		var value = payload.wait !== undefined ? payload.wait : request && request.wait;
		return value !== false && String(value).toLowerCase() !== "false";
	}

	function frontendStartDevNow(request, blocks, info) {
		var startedAt = JavaSystem.nanoTime();
		var install = frontendRunAction(request, blocks, "install");
		if (install.ok === false) {
			return install;
		}
		var steps = install.details && install.details.steps
			? install.details.steps.slice()
			: [];
		var launchStartedAt = JavaSystem.nanoTime();
		var launched = frontendLaunchVite(request, info);
		steps.push({
			action: "startVite",
			ok: launched.ok !== false,
			exitCode: launched.ok === false ? -1 : 0,
			skipped: false,
			durationMs: frontendDurationMs(launchStartedAt)
		});
		if (launched.ok === false) {
			launched.details = Object.assign({}, launched.details || {}, {
				steps: steps,
				durationMs: frontendDurationMs(startedAt)
			});
			return launched;
		}
		var entry = launched.entry;
		runtimeState.frontendDevServers[frontendDevKey(request, info)] = entry;
		frontendWriteDevState(request, info, entry);
		frontendStartDevExitWatcher(request, info, entry);
		frontendStartDevIdleWatcher(request, blocks, info, entry);
		var browser = frontendStudioBrowser(request, entry.url, "Svelte dev mode", "frontbuilder.svelte.dev");
		frontendNotifyStudioBrowser(request, browser);
		var details = frontendDevDetails(entry);
		details.steps = steps;
		details.durationMs = frontendDurationMs(startedAt);
		details.production = frontendScheduleProductionBuild(request, blocks, "startup-catch-up");
		return {
			ok: true,
			title: "Svelte dev mode",
			message: "Svelte dev mode started.",
			openUrl: entry.url,
			browser: browser,
			details: details
		};
	}

	function frontendActivatePreparedDev(request, blocks, info, entry) {
		if (!entry || entry.cancelled === true || entry.status !== "prepared" || entry.activationStarted === true) {
			return null;
		}
		var key = frontendDevKey(request, info);
		if (runtimeState.frontendDevServers[key] !== entry) {
			return null;
		}
		entry.activationStarted = true;
		var launched = frontendLaunchVite(request, info);
		if (launched.ok === false) {
			entry.status = "failed";
			entry.error = {
				message: launched.message || "Svelte dev mode failed to start after dependency preparation.",
				details: launched.details || {}
			};
			frontendWriteDevState(request, info, entry);
			return launched;
		}
		var active = launched.entry;
		runtimeState.frontendDevServers[key] = active;
		frontendWriteDevState(request, info, active);
		frontendStartDevExitWatcher(request, info, active);
		frontendStartDevIdleWatcher(request, blocks, info, active);
		var browser = frontendStudioBrowser(request, active.url, "Svelte dev mode", "frontbuilder.svelte.dev");
		frontendNotifyStudioBrowser(request, browser);
		var production = frontendScheduleProductionBuild(request, blocks, "startup-catch-up");
		frontendStudioLog("[Svelte dev] App dependencies are ready; Vite and the Studio viewer started automatically.");
		return {
			ok: true,
			entry: active,
			browser: browser,
			production: production
		};
	}

	function frontendStartDevActivationWatcher(request, blocks, info, entry) {
		if (!entry || entry.setupKind !== "app" || entry.status === "failed") {
			return;
		}
		var Runnable = Packages.java.lang.Runnable;
		var Thread = Packages.java.lang.Thread;
		var thread = new Thread(new Runnable({
			run: function () {
				try {
					if (entry.status === "starting") {
						frontendFinishPreparation(entry, true);
					}
					frontendActivatePreparedDev(request, blocks, info, entry);
				} catch (e) {
					entry.status = "failed";
					entry.error = {
						message: String(e && (e.message || e) || "Automatic Svelte dev activation failed.")
					};
					frontendWriteDevState(request, info, entry);
					frontendStudioLog("[Svelte dev] Automatic activation failed: " + entry.error.message, true);
				}
			}
		}), "Flow Svelte dev activation");
		thread.setDaemon(true);
		thread.start();
		entry.activationThread = thread;
	}

	function frontendStartDependencyPreparation(entry, args, cwd, envValues, setupRoot, fingerprint, kind) {
		var setupLogFile = new File(entry.generatedRoot || String(setupRoot.getAbsolutePath()), kind + "-install.log");
		setupLogFile.getParentFile().mkdirs();
		entry.setupLogFile = String(setupLogFile.getAbsolutePath());
		entry.setupRoot = setupRoot;
		entry.setupFingerprint = fingerprint;
		entry.setupKind = kind;
		var pb = new Packages.java.lang.ProcessBuilder(javaStringList(args));
		pb.directory(cwd);
		pb.redirectErrorStream(true);
		pb.redirectOutput(setupLogFile);
		var env = pb.environment();
		env.remove("npm_config_prefix");
		env.remove("NPM_CONFIG_PREFIX");
		Object.keys(envValues || {}).forEach(function (name) {
			env.put(String(name), String(envValues[name]));
		});
		frontendStudioLog("[Svelte frontbuilder] > " + args.join(" "));
		entry.setupProcess = pb.start();
		entry.pid = Number(entry.setupProcess.pid());
		entry.status = "starting";
	}

	function frontendPrepareGeneratedApp(request, blocks, info, entry, npm, resourceRoot, projectRoot, generatedRoot, envValues) {
		var generated = frontendRunAction(request, blocks, "generate");
		if (generated.ok === false) {
			entry.status = "failed";
			entry.error = {
				message: generated.message || "Unable to generate the initial Svelte application.",
				details: generated.details || {}
			};
			return;
		}
		var fingerprint = frontendDependencyFingerprint(generatedRoot, npm);
		if (frontendDependencyInstallReusable(generatedRoot, fingerprint, "app")) {
			entry.status = "prepared";
			entry.setupKind = "app";
			frontendStudioLog("[Svelte dev] Reusing installed app dependencies; automatic Vite startup is ready.");
			return;
		}
		var args = frontendRunCommandFor(
			"installApp",
			npm,
			resourceRoot,
			projectRoot,
			frontendProjectName(request),
			null,
			generatedRoot,
			"incremental"
		);
		frontendStartDependencyPreparation(entry, args, generatedRoot, envValues, generatedRoot, fingerprint, "app");
		frontendStudioLog("[Svelte dev] App dependencies are being installed while authoring continues.");
	}

	function frontendStartDevBackground(request, blocks, info) {
		var key = frontendDevKey(request, info);
		var projectRoot = frontendProjectRootFile(request);
		var generatedRoot = frontendGeneratedRootFile(request, info);
		var resourceRoot = frontendSvelteResourceRoot(request);
		if (!resourceRoot || !resourceRoot.isDirectory() || !new File(resourceRoot, "package.json").isFile()) {
			return failure("frontbuilder", {
				code: "FRONTBUILDER_RESOURCE_ROOT_NOT_FOUND",
				message: "The Svelte frontbuilder resources are unavailable.",
				hint: "Load the lib_flow_frontbuilder_svelte project or fix the private frontbuilder resourceRoot configuration.",
				resourceRoot: resourceRoot ? String(resourceRoot.getAbsolutePath()) : ""
			});
		}
		var npm = frontendExecutable("npm");
		var envValues = {
			PATH: frontendExecutablePathPrefix(npm) + String(Packages.java.lang.System.getenv("PATH") || "")
		};
		var fingerprint = frontendDependencyFingerprint(resourceRoot, npm);
		var entry = {
			url: "",
			port: 0,
			pid: 0,
			projectRoot: projectRoot ? String(projectRoot.getAbsolutePath()) : "",
			generatedRoot: generatedRoot ? String(generatedRoot.getAbsolutePath()) : "",
			logFile: generatedRoot ? String(new File(generatedRoot, "vite-dev.log").getAbsolutePath()) : "",
			setupLogFile: "",
			startedAt: new Date().toISOString(),
			status: "starting",
			cancelled: false
		};
		if (frontendDependencyInstallReusable(resourceRoot, fingerprint, "builder")) {
			frontendStudioLog("[Svelte dev] Reusing installed builder dependencies.");
			try {
				frontendPrepareGeneratedApp(request, blocks, info, entry, npm, resourceRoot, projectRoot, generatedRoot, envValues);
			} catch (e) {
				entry.status = "failed";
				entry.error = { message: String(e && (e.message || e) || "Background app setup failed.") };
				frontendStudioLog("[Svelte dev] Background app setup failed: " + entry.error.message, true);
			}
		} else {
			try {
				var args = frontendRunCommandFor(
					"installBuilder",
					npm,
					resourceRoot,
					projectRoot,
					"",
					null,
					generatedRoot,
					"incremental"
				);
				frontendStartDependencyPreparation(entry, args, resourceRoot, envValues, resourceRoot, fingerprint, "builder");
			} catch (e) {
				entry.status = "failed";
				entry.error = { message: String(e && (e.message || e) || "Background builder setup failed.") };
				frontendStudioLog("[Svelte dev] Background builder setup failed: " + entry.error.message, true);
			}
		}
		runtimeState.frontendDevServers[key] = entry;
		frontendWriteDevState(request, info, entry);
		frontendStartDevActivationWatcher(request, blocks, info, entry);
		return {
			ok: true,
			title: "Svelte dev mode",
			message: entry.status === "prepared"
				? "Svelte app dependencies are ready; Vite and the Studio viewer are starting automatically."
				: entry.setupKind === "app"
					? "Svelte app dependencies are being prepared; Vite and the Studio viewer will open automatically."
					: "Svelte builder dependencies are being prepared in the background.",
			pending: entry.status !== "failed",
			details: frontendDevDetails(entry)
		};
	}

	function frontendFinishPreparation(entry, wait) {
		if (!entry || entry.status !== "starting") {
			return;
		}
		var process = entry.setupProcess;
		if (!process) {
			if (frontendProcessAlive(entry.pid)) {
				if (!wait) {
					return;
				}
				try {
					var optional = Packages.java.lang.ProcessHandle.of(Packages.java.lang.Long.valueOf(String(entry.pid)));
					if (optional && optional.isPresent()) {
						optional.get().onExit().get();
					}
				} catch (_ignorePreparationWait) {
				}
			}
			entry.status = "prepared";
			return;
		}
		try {
			if (!wait && process.isAlive()) {
				return;
			}
			var exitCode = wait ? process.waitFor() : process.exitValue();
			if (entry.cancelled === true) {
				entry.status = "stopped";
			} else if (exitCode === 0) {
				entry.setupFingerprint = frontendDependencyFingerprint(entry.setupRoot, frontendExecutable("npm"))
					|| entry.setupFingerprint;
				writeFrontendDependencyInstallStamp(entry.setupRoot, entry.setupFingerprint, entry.setupKind || "builder");
				if (entry.setupKind !== "app") {
					runtimeState.frontendDependencyFingerprints = {};
				}
				entry.status = "prepared";
				frontendStudioLog("[Svelte dev] " + (entry.setupKind === "app" ? "App" : "Builder") +
					" dependencies are ready." + (entry.setupKind === "app"
						? " Starting Vite and the Studio viewer automatically."
						: " Final application setup remains pending."));
			} else {
				entry.status = "failed";
				entry.error = {
					message: (entry.setupKind === "app" ? "App" : "Builder") +
						" dependency installation failed with exit code " + exitCode + ".",
					logTail: frontendLogTail(new File(entry.setupLogFile), 60)
				};
				frontendStudioLog("[Svelte dev] Background builder setup failed.", true);
			}
		} catch (e) {
			entry.status = "failed";
			entry.error = { message: String(e && (e.message || e) || "Frontend preparation was interrupted.") };
		}
	}

	function frontendWaitForPreparation(entry) {
		frontendFinishPreparation(entry, true);
	}

	function frontendStartDev(request, blocks) {
		var info = frontbuilderSettingsForRequest(request);
		var existing = frontendDevEntry(request, info);
		if (existing && existing.status === "failed") {
			delete runtimeState.frontendDevServers[frontendDevKey(request, info)];
			frontendDeleteDevState(request, info);
			existing = null;
		}
		if (existing) {
			var starting = existing.status === "starting";
			var prepared = existing.status === "prepared";
			if (prepared && frontendDevWaitRequested(request)) {
				return frontendStartDevNow(request, blocks, info);
			}
			return {
				ok: true,
				title: "Svelte dev mode",
				message: starting
					? "Svelte " + (existing.setupKind === "app" ? "app" : "builder") + " dependencies are still being prepared."
					: prepared
						? "Svelte app dependencies are ready; call dev.sync after authoring."
						: "Svelte dev mode is already running.",
				pending: starting || prepared,
				openUrl: starting || prepared ? "" : existing.url,
				browser: starting || prepared ? null : frontendStudioBrowser(request, existing.url, "Svelte dev mode", "frontbuilder.svelte.dev"),
				details: frontendDevDetails(existing)
			};
		}
		if (!frontendDevWaitRequested(request)) {
			return frontendStartDevBackground(request, blocks, info);
		}
		return frontendStartDevNow(request, blocks, info);
	}

	function frontendDestroyJavaProcess(process) {
		if (!process) {
			return;
		}
		try {
			var descendants = process.descendants().iterator();
			while (descendants.hasNext()) {
				descendants.next().destroyForcibly();
			}
		} catch (_ignoreDevDescendants) {
		}
		try {
			process.destroyForcibly();
		} catch (_ignoreDevProcessForce) {
			try {
				process.destroy();
			} catch (_ignoreDevProcess) {
			}
		}
	}

	function frontendDestroyProcessHandle(pid) {
		if (!pid) {
			return;
		}
		try {
			var optional = Packages.java.lang.ProcessHandle.of(Packages.java.lang.Long.valueOf(String(pid)));
			if (!optional || !optional.isPresent()) {
				return;
			}
			var handle = optional.get();
			var descendants = handle.descendants().iterator();
			while (descendants.hasNext()) {
				descendants.next().destroyForcibly();
			}
			handle.destroyForcibly();
		} catch (_ignoreDevHandle) {
		}
	}

	function frontendDestroyDevProcess(entry, reason) {
		if (!entry) {
			return;
		}
		entry.cancelled = true;
		entry.stopReason = String(reason || entry.stopReason || "manual");
		frontendUnregisterDevProxy(entry);
		var listenerPid = frontendPidForPort(entry.port);
		frontendDestroyJavaProcess(entry.setupProcess);
		frontendDestroyJavaProcess(entry.process);
		frontendDestroyProcessHandle(listenerPid);
		if (Number(entry.pid || 0) !== Number(listenerPid || 0)) {
			frontendDestroyProcessHandle(entry.pid);
		}
	}

	function frontendRestartDev(request, info, entry) {
		var key = frontendDevKey(request, info);
		var restartCount = Number(entry && entry.restartCount || 0) + 1;
		var previousPid = Number(entry && entry.pid || 0);
		frontendDestroyDevProcess(entry, "dependencies-changed");
		var launched = frontendLaunchVite(request, info);
		if (launched.ok === false) {
			delete runtimeState.frontendDevServers[key];
			frontendDeleteDevState(request, info);
			return launched;
		}
		var active = launched.entry;
		active.restartCount = restartCount;
		active.previousPid = previousPid;
		runtimeState.frontendDevServers[key] = active;
		frontendWriteDevState(request, info, active);
		frontendStartDevExitWatcher(request, info, active);
		frontendStartDevIdleWatcher(request, blocks, info, active);
		var browser = frontendStudioBrowser(request, active.url, "Svelte dev mode", "frontbuilder.svelte.dev");
		frontendNotifyStudioBrowser(request, browser);
		return {
			ok: true,
			entry: active,
			browser: browser
		};
	}

	function frontendScheduleProductionBuild(request, blocks, reason) {
		var lifecycle = frontendProductionLifecycle();
		if (!lifecycle.shouldBuild(reason)) {
			return { scheduled: false, reason: String(reason || ""), cause: "build-reason" };
		}
		var info = frontbuilderSettingsForRequest(request);
		var key = frontendDevKey(request, info);
		var state = frontendObserveProductionState(request, info);
		if (!state.dirty) {
			return { scheduled: false, reason: String(reason || ""), cause: "already-current", state: state };
		}
		if (runtimeState.frontendProductionBuilds[key]) {
			return { scheduled: false, reason: String(reason || ""), cause: "single-flight", state: state };
		}
		state = lifecycle.requested(state, reason, new Date().toISOString());
		frontendWriteProductionState(request, info, state);
		// Request objects belong to the request Rhino scope. Keep only JSON data
		// before crossing into the daemon thread so project/model resolution stays
		// valid after the HTTP request has completed.
		var stableRequest = JSON.parse(JSON.stringify(request || {}));
		stableRequest.engineSource = JSON.stringify(projectEngineDefinitionForRequest(request));
		var Runnable = Packages.java.lang.Runnable;
		var Thread = Packages.java.lang.Thread;
		var thread = new Thread(new Runnable({
			run: function () {
				var startedAt = JavaSystem.nanoTime();
				frontendProductionBuildLock.lock();
				try {
					var stableInfo = frontbuilderSettingsForRequest(stableRequest);
					var activeState = lifecycle.started(frontendReadProductionState(stableRequest, stableInfo), new Date().toISOString());
					frontendWriteProductionState(stableRequest, stableInfo, activeState);
					stableRequest.productionBuildFingerprint = activeState.currentFingerprint;
					frontendStudioLog("[Svelte production] Building the dirty application in background (" + reason + ").");
					var built = frontendRunAction(stableRequest, blocks, "build");
					if (built.ok === false) {
						var failed = lifecycle.failed(
							frontendReadProductionState(stableRequest, stableInfo),
							built.details && built.details.steps && built.details.steps.length
								? built.details.steps[built.details.steps.length - 1].stdout || built.message
								: built.message || "Svelte production build failed.",
							new Date().toISOString(),
							frontendDurationMs(startedAt)
						);
						frontendWriteProductionState(stableRequest, stableInfo, failed);
						frontendStudioLog("[Svelte production] Build failed; the previous production output was preserved.", true);
					} else {
						frontendStudioLog("[Svelte production] Production output published in " + frontendDurationMs(startedAt) + " ms.");
					}
				} catch (e) {
					var failedState = lifecycle.failed(
						frontendReadProductionState(stableRequest, stableInfo),
						String(e && (e.message || e) || "Svelte production build failed."),
						new Date().toISOString(),
						frontendDurationMs(startedAt)
					);
					frontendWriteProductionState(stableRequest, stableInfo, failedState);
					frontendStudioLog("[Svelte production] Build failed; the previous production output was preserved: " + failedState.failure, true);
				} finally {
					frontendProductionBuildLock.unlock();
					delete runtimeState.frontendProductionBuilds[key];
				}
			}
		}), "Flow Svelte production build");
		thread.setDaemon(true);
		runtimeState.frontendProductionBuilds[key] = thread;
		thread.start();
		return { scheduled: true, reason: String(reason || ""), state: state };
	}

	function frontendStopDev(request, blocks) {
		var info = frontbuilderSettingsForRequest(request);
		var key = frontendDevKey(request, info);
		var entry = frontendDevEntry(request, info);
		if (!entry) {
			return {
				ok: true,
				title: "Svelte dev mode",
				message: "Svelte dev mode is not running.",
				details: frontendLastDevDetails(request, info)
			};
		}
		frontendDestroyDevProcess(entry, "manual");
		delete runtimeState.frontendDevServers[key];
		frontendFinalizeDevState(request, info, entry, "stopped", "manual");
		frontendDeleteDevViewers(request, info);
		var production = frontendScheduleProductionBuild(request, blocks, "manual");
		return {
			ok: true,
			title: "Svelte dev mode",
			message: "Svelte dev mode stopped.",
			details: Object.assign(frontendDevDetails(entry), { production: production })
		};
	}

	function frontendSyncDev(request, blocks) {
		var info = frontbuilderSettingsForRequest(request);
		var entry = frontendDevEntry(request, info);
		if (!entry) {
			var sourcePath = String((request.action && request.action.payload && request.action.payload.sourcePath) || request.sourcePath || request.sourceFile || "");
			var lastDetails = frontendLastDevDetails(request, info);
			return {
				ok: true,
				title: "Svelte dev mode",
				message: "Svelte dev mode is not running; generated source was not updated.",
				generated: false,
				details: {
					sourcePath: sourcePath,
					draftCount: frontendDraftCount(request),
					lastDev: lastDetails
				}
			};
		}
		if (entry.status === "starting") {
			frontendWaitForPreparation(entry);
		}
		if (entry.status === "failed") {
			return {
				ok: false,
				title: "Svelte dev mode",
				message: "Svelte dev mode failed to start.",
				generated: false,
				details: frontendDevDetails(entry)
			};
		}
		if (entry.status === "prepared") {
			if (entry.activationStarted === true) {
				return {
					ok: true,
						title: "Svelte dev mode",
						message: "Svelte dev mode is opening automatically.",
						pending: true,
						generated: false,
						details: frontendDevDetails(entry)
					};
			}
			entry.activationStarted = true;
			var started = frontendStartDevNow(request, blocks, info);
			if (started.ok === false) {
				entry.activationStarted = false;
			}
			started.generated = started.ok !== false;
			started.message = started.ok === false
				? "Svelte dev mode failed to start after builder preparation."
				: "Svelte dev mode started from the final authored source.";
			return started;
		}
		var generatedRoot = entry.generatedRoot
			? new File(String(entry.generatedRoot))
			: frontendGeneratedRootFile(request, info);
		var npm = frontendExecutable("npm");
		var previousManifestFingerprint = entry.dependencyManifestFingerprint
			|| frontendDependencyManifestFingerprint(generatedRoot, npm);
		var generated = frontendRunAction(request, blocks, "install");
		var dependenciesInstalled = generated.ok !== false
			&& frontendActionStepPerformed(generated, "installApp");
		var currentManifestFingerprint = frontendDependencyManifestFingerprint(generatedRoot, npm);
		var dependenciesChanged = frontendDevRestartRequired(
			dependenciesInstalled,
			previousManifestFingerprint,
			currentManifestFingerprint
		);
		if (dependenciesChanged) {
			var restarted = frontendRestartDev(request, info, entry);
			if (restarted.ok === false) {
				restarted.title = "Svelte dev mode";
				restarted.generated = true;
				restarted.message = "Svelte dependencies were installed, but dev mode failed to restart.";
				return restarted;
			}
			entry = restarted.entry;
			generated.openUrl = entry.url;
			generated.browser = restarted.browser;
		} else if (generated.ok !== false) {
			entry.dependencyFingerprint = frontendDependencyFingerprint(generatedRoot, npm);
			entry.dependencyManifestFingerprint = currentManifestFingerprint;
			frontendWriteDevState(request, info, entry);
		}
		generated.title = "Svelte dev mode";
		generated.generated = generated.ok !== false;
		generated.dev = frontendDevDetails(entry);
		generated.dependenciesInstalled = dependenciesInstalled;
		generated.dependenciesChanged = dependenciesChanged;
		generated.message = generated.ok === false
			? "Svelte dev source update failed."
			: dependenciesChanged
				? "Svelte dev source updated; dependencies installed and dev mode restarted."
				: dependenciesInstalled
					? "Svelte dev source updated; dependency metadata refreshed without restarting dev mode."
				: "Svelte dev source updated.";
		return generated;
	}

	function frontendOpenDev(request) {
		var info = frontbuilderSettingsForRequest(request);
		var entry = frontendDevEntry(request, info);
		if (!entry) {
			return {
				ok: false,
				title: "Svelte dev mode",
				message: "Svelte dev mode is not running.",
				details: frontendLastDevDetails(request, info)
			};
		}
		if (entry.status === "starting") {
			return {
				ok: true,
				title: "Svelte dev mode",
				message: "Svelte dev mode is still starting.",
				pending: true,
				details: frontendDevDetails(entry)
			};
		}
		if (entry.status === "prepared") {
			return {
				ok: true,
				title: "Svelte dev mode",
				message: "Svelte builder dependencies are ready; call dev.sync to generate and open the final application.",
				pending: true,
				details: frontendDevDetails(entry)
			};
		}
		if (entry.status === "failed") {
			return {
				ok: false,
				title: "Svelte dev mode",
				message: "Svelte dev mode failed to start.",
				details: frontendDevDetails(entry)
			};
		}
		var browser = frontendStudioBrowser(request, entry.url, "Svelte dev mode", "frontbuilder.svelte.dev");
		frontendNotifyStudioBrowser(request, browser);
		var browserControl = frontendBrowserControlState(request, browser, 3000);
		return {
			ok: true,
			title: "Svelte dev mode",
			message: "Opening Svelte dev mode.",
			openUrl: entry.url,
			browser: browser,
			browserDebugPortRequested: browserControl.browserDebugPortRequested,
			browserDebugPortMatched: browserControl.browserDebugPortMatched,
			browserControlReady: browserControl.browserControlReady,
			browserDebugUrl: browserControl.browserDebugUrl,
			details: frontendDevDetails(entry)
		};
	}

	function contextMenuRequest(request, blocks) {
		var target = request.targetObject || {};
		var targetKind = String(target.kind || "");
		var targetType = String(target.type || "");
		var hasFlow = String(request.flowName || "").trim() !== "";
		var isFlowSchemaTarget = hasFlow && (targetKind === "flow" || targetKind === "folder" && targetType === "flow");
		var items = [];
		var toggle = contextNodeToggle(target);
		if (toggle) {
			items.push(contextMenuItem(
				toggle.enabled ? "flow.node.disable" : "flow.node.enable",
				toggle.enabled ? "Disable" : "Enable",
				toggle.enabled ? "Skip this Flow node as if it was absent." : "Restore this Flow node.",
				"",
				{ mutation: toggle.mutation },
				"",
				"",
				true,
				"root"
			));
		}
		if (isFlowSchemaTarget) {
			var output = outputSchemaRequest(Object.assign({}, request, {
				source: "effective",
				detail: "full"
			}), blocks);
			var learned = output.sources && output.sources.learned && output.sources.learned.available === true;
			if (learned) {
				items.push(contextMenuItem("flow.outputSchema.resetLearned", "Reset learned output schema",
					"Deletes learned Flow result schemas without touching declared _flow.outputs.", "", {
						action: "reset"
					}, "Delete learned Flow result schemas for this Flow?", "/com/twinsoft/convertigo/beans/flow/images/flowvirtualobject_color_16x16.png"));
			}
		}
		if (isFrontendTarget(request)) {
			var info = frontbuilderSettingsForRequest(request);
			var modelPath = frontendModelPath(request, info);
			var hasModel = modelPath && modelPath.isFile();
			var dev = frontendDevEntry(request, info);
			if (hasModel) {
				items.push(contextMenuItem("frontbuilder.svelte.dev.start", "Start dev mode",
					"Generate the Svelte project, install app dependencies and start Vite dev server.", "Svelte dev",
					{}, "", "", !dev));
				items.push(contextMenuItem("frontbuilder.svelte.dev.stop", "Stop dev mode",
					"Stop the Vite dev server started for this frontend.", "Svelte dev",
					{}, "", "", !!dev));
				items.push(contextMenuItem("frontbuilder.svelte.dev.open", "Open dev mode",
					"Open the running Vite dev server in a Studio browser.", "Svelte dev",
					{}, "", "", !!dev));
				items.push(contextMenuItem("frontbuilder.svelte.generate", "Update generated source",
					"Regenerate the Svelte sources under the project private directory.", "Svelte build"));
				items.push(contextMenuItem("frontbuilder.svelte.build", "Build prod",
					"Generate and build production assets under DisplayObjects/mobile.", "Svelte build"));
				items.push(contextMenuItem("frontbuilder.svelte.openBuilt", "Open built prod",
					"Open the built production frontend in a Studio browser.", "Svelte build"));
			}
		}
		return {
			ok: true,
			protocol: "flow.studio.menu.v1",
			label: "Flow",
			items: items
		};
	}

	function contextMenuItem(id, label, description, group, payload, confirm, icon, enabled, placement) {
		return {
			id: id,
			label: label,
			description: description,
			group: group,
			enabled: enabled !== false,
			payload: payload || {},
			confirm: confirm || "",
			icon: icon || "",
			placement: placement || ""
		};
	}

	function contextNodeToggle(target) {
		var kind = String(target && target.kind || "");
		var definition = target && target.definition && typeof target.definition === "object" ? target.definition : {};
		var info = target && target.info && typeof target.info === "object" ? target.info : {};
		var mutationPath = String(info.sourceMutationPath || definition.sourceMutationPath || "");
		var writable = info.sourceWritable !== undefined ? info.sourceWritable : definition.sourceWritable;
		var backendNode = kind === "node";
		var frontendNode = kind.indexOf("frontend") === 0
			&& kind !== "frontendBuilder"
			&& kind !== "frontendSource"
			&& kind !== "frontendRoutes"
			&& kind !== "frontendPage"
			&& kind !== "frontendLayout"
			&& kind !== "frontendStructure"
			&& kind !== "frontendSlot"
			&& kind !== "frontendEvents"
			&& kind !== "frontendActionVariables"
			&& kind !== "frontendColumns"
			&& kind !== "frontendDataBindings"
			&& kind !== "frontendComponent"
			&& writable !== false
			&& mutationPath.indexOf("frontAst.") === 0;
		if (!backendNode && !frontendNode) {
			return null;
		}
		var disabled = definition.disabled === true;
		var mutation = {
			op: "setEnabled",
			enabled: disabled
		};
		if (mutationPath) {
			mutation.path = mutationPath;
		} else {
			var nodeId = String(definition.id || target.nodeId || "");
			if (!nodeId) {
				return null;
			}
			mutation.nodeId = nodeId;
		}
		return {
			enabled: !disabled,
			mutation: mutation
		};
	}

	function contextActionRequest(request, blocks) {
		var action = request.action || {};
		var id = String(action.id || request.actionId || "");
		var payload = action.payload || {};
		if (id === "flow.node.disable" || id === "flow.node.enable") {
			var mutation = payload.mutation || {};
			if (String(mutation.op || "") !== "setEnabled") {
				return failure("contextAction", {
					code: "INVALID_CONTEXT_ACTION",
					message: "Flow node enable/disable requires a setEnabled mutation."
				});
			}
			return {
				ok: true,
				title: id === "flow.node.disable" ? "Disable Flow node" : "Enable Flow node",
				message: id === "flow.node.disable" ? "Flow node disabled." : "Flow node enabled.",
				mutation: mutation,
				refresh: true
			};
		}
		if (id === "flow.outputSchema.inspect") {
			var output = outputSchemaRequest(Object.assign({}, request, payload, {
				source: payload.source || "effective"
			}), blocks);
			return Object.assign({
				ok: output.ok !== false,
				title: "Flow output schema",
				message: output.ok === false ? actionErrorMessage(output) : outputSchemaMessage(output),
				schema: output.schema || null
			}, output.ok === false ? { error: output.error } : {});
		}
		if (id === "flow.outputSchema.resetLearned") {
			var reset = resetSchemaRequest(Object.assign({}, request, payload));
			return {
				ok: reset.ok !== false,
				title: "Flow output schema",
				message: reset.deleted ? "Learned Flow result schemas have been deleted." : "No learned Flow result schema was found.",
				refresh: true,
				details: reset
			};
		}
		if (id === "flow.nodeOutputSchema.inspect") {
			var target = request.targetObject || {};
			var definition = target.definition || {};
			var node = nodeOutputSchemaRequest(Object.assign({}, request, payload, {
				nodeId: payload.nodeId || definition.id || ""
			}), blocks);
			return Object.assign({
				ok: node.ok !== false,
				title: "Flow node output schema",
				message: node.ok === false ? actionErrorMessage(node) : "",
				schema: node.schema || node.effective || null,
				details: node
			}, node.ok === false ? { error: node.error } : {});
		}
		if (id === "flow.cache.clear") {
			var cleared = clearRuntimeCaches();
			return {
				ok: true,
				title: "Flow runtime",
				message: "Flow runtime caches have been cleared.",
				refresh: true,
				refreshPalette: true,
				details: cleared
			};
		}
		if (id === "frontbuilder.svelte.generate") {
			return frontendRunAction(request, blocks, "generate");
		}
		if (id === "frontbuilder.svelte.build") {
			return frontendRunAction(request, blocks, "build");
		}
		if (id === "frontbuilder.svelte.openBuilt") {
			var builtUrl = frontendBuiltUrl(request);
			return {
				ok: builtUrl !== "",
				title: "Svelte frontbuilder",
				message: builtUrl ? "Opening built production frontend." : "Unable to resolve built production URL.",
				openUrl: builtUrl,
				browser: builtUrl ? frontendStudioBrowser(request, builtUrl, "Svelte production frontend", "frontbuilder.svelte.prod") : null,
				acceptance: builtUrl ? frontendAcceptancePlan(builtUrl) : null
			};
		}
		if (id === "frontbuilder.svelte.dev.sync") {
			return frontendSyncDev(request, blocks);
		}
		if (id === "frontbuilder.svelte.dev.start") {
			return frontendStartDev(request, blocks);
		}
		if (id === "frontbuilder.svelte.dev.stop") {
			return frontendStopDev(request, blocks);
		}
		if (id === "frontbuilder.svelte.dev.open") {
			return frontendOpenDev(request);
		}
		return failure("contextAction", {
			code: "UNKNOWN_CONTEXT_ACTION",
			message: "Unknown Flow context action: " + id
		});
	}

	function actionErrorMessage(result) {
		var error = result && result.error;
		return error ? String(error.message || error) : "Flow action failed.";
	}

	function outputSchemaMessage(output) {
		var source = String(output && output.source || "");
		var schemaSource = String(output && output.schemaSource || "");
		var warnings = output && output.warnings || [];
		var parts = [];
		if (source || schemaSource) {
			parts.push("Schema source: " + (schemaSource || source));
		}
		if (warnings.length) {
			parts.push("Warnings: " + warnings.map(function (warning) {
				return String(warning.message || warning.code || warning);
			}).join("; "));
		}
		return parts.join("\n");
	}

	function searchNeedle(request) {
		return flowTreeService().searchNeedle(request, flowTreeServiceEnv());
	}

	function searchMatches(text, needle) {
		return flowTreeService().searchMatches(text, needle, flowTreeServiceEnv());
	}

	function searchSnippet(text, needle) {
		return flowTreeService().searchSnippet(text, needle, flowTreeServiceEnv());
	}

	function isSampleFlowName(flowName) {
		return String(flowName || "").indexOf("sample_") === 0;
	}

	function childSlotNamesForMutation(blocks, node) {
		return flowTreeService().childSlotNamesForMutation(blocks, node, flowTreeServiceEnv());
	}

	function catalogService() {
		return loadEngineModule("catalog-service.js");
	}

	function catalogServiceEnv() {
		return {
			File: File,
			engineDir: engineDir,
			projectDir: projectDir,
			resourcePath: resourcePath,
			normalizeTree: normalizeTree,
			blockCatalog: blockCatalog,
			blockNamespace: blockNamespace,
			blockLocalName: blockLocalName,
			resolveBlockIcon: resolveBlockIcon,
			schemaSummary: schemaSummary,
			loadTypes: loadTypes,
			listFlowLibraries: listFlowLibraries,
			flowProviderName: flowProviderName,
			sha256Hex: sha256Hex,
			responseBudget: responseBudget
		};
	}

	function blockDescriptor(block) {
		return catalogService().blockDescriptor(block, catalogServiceEnv());
	}

	function typeDescriptor(type) {
		return catalogService().typeDescriptor(type, catalogServiceEnv());
	}

	function compactBlockDescriptor(descriptor) {
		return catalogService().compactBlockDescriptor(descriptor, catalogServiceEnv());
	}

	function summaryBlockDescriptor(descriptor) {
		return catalogService().summaryBlockDescriptor(descriptor, catalogServiceEnv());
	}

	function summaryPropertyDescriptor(property) {
		return catalogService().summaryPropertyDescriptor(property, catalogServiceEnv());
	}

	function blockSignature(descriptor) {
		return catalogService().blockSignature(descriptor, catalogServiceEnv());
	}

	function catalogDefinition(blocks, options) {
		return catalogService().catalogDefinition(blocks, options, catalogServiceEnv());
	}

	function catalogTypes(blocks, types) {
		return catalogService().catalogTypes(blocks, types, catalogServiceEnv());
	}

	function compact(value) {
		return value === undefined || value === null ? "" : JSON.stringify(normalizeTree(value));
	}

	function compactPlain(value) {
		if (value === undefined || value === null) {
			return "";
		}
		try {
			var json = JSON.stringify(value);
			return json === undefined ? "" : json;
		} catch (e) {
			return compact(value);
		}
	}

	function flowSummaryService() {
		return loadEngineModule("flow-summary-service.js");
	}

	function flowSummaryEnv() {
		return {
			normalizeTree: normalizeTree,
			nodeProps: nodeProps
		};
	}

	function flowSummaryApi() {
		return flowSummaryService().create(flowSummaryEnv());
	}

	function summaryText(value, max) {
		return flowSummaryApi().text(value, max);
	}

	var flowSummary = {
		text: summaryText,
		value: function (value, max) {
			return flowSummaryApi().value(value, max);
		},
		prop: function (node, key) {
			return flowSummaryApi().prop(node, key);
		},
		input: function (node) {
			return flowSummaryApi().input(node);
		},
		assignment: function (node, operator) {
			return flowSummaryApi().assignment(node, operator);
		},
		output: function (node, action) {
			return flowSummaryApi().output(node, action);
		}
	};

	function propertyEditorBuilderEnv() {
		return {
			File: File,
			FileUtils: FileUtils,
			engineDir: engineDir,
			engineResourceFile: engineResourceFile,
			engineModuleFile: engineModuleFile,
			canonicalPath: canonicalPath,
			fileFingerprint: fileFingerprint,
			typesCacheKey: typesCacheKey,
			loadTypes: loadTypes,
			typeDescriptor: typeDescriptor,
			raise: raise
		};
	}

	function propertyEditorHtml() {
		var builder = loadEngineModule("property-editor-builder.js");
		var env = propertyEditorBuilderEnv();
		var cache = runtimeState.caches.propertyEditor;
		var key = builder.cacheKey(env);
		var cached = readRuntimeCache(cache, key);
		if (cached) {
			return cached;
		}
		return writeRuntimeCache(cache, key, builder.html(env), "Flow property editor HTML");
	}

	function engineCall(operation, requestJson, callback) {
		try {
			var request = parseRequest(requestJson);
			return withActiveRequest(request, function () {
				return response(callback(request), operation === "run" ? "result" : "");
			});
		} catch (e) {
			return response(failure(operation, e));
		}
	}

	function runWithActiveRequest(request, functionProfile, activeStarted) {
		var invocationFrame = false;
		var invocationPrevious = null;
		try {
			if (Number(FlowEngineBridge.currentFlowInvocationDepth()) > 0) {
				invocationPrevious = FlowEngineBridge.setCurrentFlowRequestState(request);
				invocationFrame = true;
			}
		} catch (e) {
			// Older bridges keep the active request in this Engine closure.
		}
		var fallbackPrevious = null;
		if (!invocationFrame) {
			fallbackPrevious = activeRequestFallback;
			activeRequestFallback = request;
		}
		var bodyStarted = functionProfile ? JavaSystem.nanoTime() : 0;
		var bodyFinished = 0;
		if (functionProfile) {
			functionProfile.activeEnterMs = Number(bodyStarted - activeStarted) / 1000000;
		}
		var value;
		try {
			request.__deferResultSerializationSafety = true;
			value = runFlowRequest(request);
		} finally {
			if (functionProfile) {
				bodyFinished = JavaSystem.nanoTime();
				functionProfile.activeBodyMs = Number(bodyFinished - bodyStarted) / 1000000;
			}
			if (invocationFrame) {
				FlowEngineBridge.restoreCurrentFlowRequestState(invocationPrevious);
			} else {
				activeRequestFallback = fallbackPrevious;
			}
		}
		if (functionProfile) {
			var activeFinished = JavaSystem.nanoTime();
			functionProfile.activeExitMs = Number(activeFinished - bodyFinished) / 1000000;
			functionProfile.activeRunMs = Number(activeFinished - activeStarted) / 1000000;
		}
		return value;
	}

	function flowRunCall(requestJson) {
		try {
			var parseStarted = JavaSystem.nanoTime();
			var request = parseRequest(requestJson);
			var profileRequest = request.profile === true || request.profile === "envelope";
			var functionProfile = profileRequest ? {
				parseRequestMs: Number(JavaSystem.nanoTime() - parseStarted) / 1000000
			} : null;
			var activeStarted = profileRequest ? JavaSystem.nanoTime() : 0;
			var value = runWithActiveRequest(request, functionProfile, activeStarted);
			return response(value, "result", functionProfile);
		} catch (e) {
			return response(failure("run", e));
		}
	}

	function projectCall(operation, requestJson, callback) {
		return engineCall(operation, requestJson, function (request) {
			return withProjectDir(request.projectDir, function () {
				return callback(request);
			});
		});
	}

	function staticCall(operation, callback) {
		try {
			return response(callback());
		} catch (e) {
			return response(failure(operation, e));
		}
	}

	return {
		preload: function (requestJson) {
			return projectCall("preload", requestJson, function (request) {
				return preloadProjectRequest(request);
			});
		},

		prepare: function (requestJson) {
			return engineCall("prepare", requestJson, function (request) {
				var started = JavaSystem.nanoTime();
				var blocks = loadBlocks(true);
				var catalogMs = Number(JavaSystem.nanoTime() - started) / 1000000;
				var compileStarted = JavaSystem.nanoTime();
				var plan = compileFlowPlan(request, blocks);
				return {
					ok: true,
					flowQName: String(request.flowQName || ""),
					blockCount: Object.keys(plan.blocks || {}).length,
					catalogMs: catalogMs,
					compileMs: Number(JavaSystem.nanoTime() - compileStarted) / 1000000,
					durationMs: Number(JavaSystem.nanoTime() - started) / 1000000
				};
			});
		},

		run: function (requestJson) {
			return flowRunCall(requestJson);
		},

		analyze: function (requestJson) {
			return engineCall("analyze", requestJson, function (request) {
				return analyzeFlowSource(loadBlocks(), request.flowSource, request);
			});
		},

		context: function (requestJson) {
			return engineCall("context", requestJson, function (request) {
				return contextForFlowRequest(loadBlocks(), request);
			});
		},

		search: function (requestJson) {
			return engineCall("search", requestJson, function (request) {
				return searchFlowRequest(request, loadBlocks());
			});
		},

		schemaReset: function (requestJson) {
			return engineCall("schemaReset", requestJson, function (request) {
				return resetSchemaRequest(request);
			});
		},

		resourceSearch: function (requestJson) {
			return engineCall("resourceSearch", requestJson, function (request) {
				return resourceSearchRequest(request);
			});
		},

		resourceList: function (requestJson) {
			return engineCall("resourceList", requestJson, function (request) {
				return resourceListRequest(request);
			});
		},

		resourceGet: function (requestJson) {
			return engineCall("resourceGet", requestJson, function (request) {
				return resourceGetRequest(request);
			});
		},

		resourcePatch: function (requestJson) {
			return engineCall("resourcePatch", requestJson, function (request) {
				return resourcePatchRequest(request);
			});
		},

		resourceDelete: function (requestJson) {
			return engineCall("resourceDelete", requestJson, function (request) {
				return resourceDeleteRequest(request);
			});
		},

		outputSchema: function (requestJson) {
			return engineCall("outputSchema", requestJson, function (request) {
				return outputSchemaRequest(request, loadBlocks());
			});
		},

		nodeOutputSchema: function (requestJson) {
			return engineCall("nodeOutputSchema", requestJson, function (request) {
				return nodeOutputSchemaRequest(request, loadBlocks());
			});
		},

		contextMenu: function (requestJson) {
			return engineCall("contextMenu", requestJson, function (request) {
				return contextMenuRequest(request, loadBlocks());
			});
		},

		contextAction: function (requestJson) {
			return engineCall("contextAction", requestJson, function (request) {
				return contextActionRequest(request, loadBlocks());
			});
		},

		writeCodeMirror: function (requestJson) {
			return projectCall("writeCodeMirror", requestJson, function (request) {
				return writeFlowCodeMirrorRequest(request, loadBlocks());
			});
		},

		propertyEditor: function () {
			return staticCall("propertyEditor", function () {
				return { ok: true, html: propertyEditorHtml() };
			});
		},

		icons: function (requestJson) {
			return engineCall("icons", requestJson, function (request) {
				return iconCatalogRequest(request);
			});
		},

		cacheInfo: function () {
			return staticCall("cacheInfo", cacheInfoRequest);
		},

		cacheClear: function () {
			return staticCall("cacheClear", clearRuntimeCaches);
		},

		catalog: function (requestJson) {
			return engineCall("catalog", requestJson, function (request) {
				var blocks = loadBlocks();
				if (request.flowSource !== undefined && request.flowSource !== null && String(request.flowSource).trim() !== "") {
					try {
						var definition = parseSource(sourceForFlowRequest(request, blocks));
						blocks = blocksWithFlowHelpers(blocks, definition);
					} catch (e) {
					}
				}
				var out = Object.assign({ ok: true }, catalogDefinition(blocks, {
					detail: request.detail || request.mode || "full",
					includePrivate: request.includePrivate === true,
					includeInternal: request.includeInternal === true,
					query: request.query || request.q || "",
					namespace: request.namespace || "",
					provider: request.provider || "",
					origin: request.origin || "",
					limit: request.limit,
					cursor: request.cursor,
					answerBefore: request.answerBefore,
					timeoutMs: request.timeoutMs,
					maxResponseKB: request.maxResponseKB,
					minItems: request.minItems,
					doc: request.doc,
					hints: request.hints
				}));
					try {
						var projectConfig = projectEngineDefinitionForRequest(request).config || {};
						out.frontendBlocks = frontendBlocksForConfig(projectConfig);
						out.frontendCreateDescriptors = frontendCreateDescriptorsForConfig(projectConfig);
					} catch (e) {
						out.frontendBlocks = [];
						out.frontendCreateDescriptors = [];
					}
				return out;
			});
		},

		describeTree: function (requestJson) {
			return projectCall("describeTree", requestJson, function (request) {
				return describeTreeRequest(request, loadBlocks());
			});
		},

		authoringTree: function (requestJson) {
			return projectCall("authoringTree", requestJson, function (request) {
				return authoringTreeRequest(request, loadBlocks());
			});
		},

		authoringContract: function (requestJson) {
			return projectCall("authoringContract", requestJson, function (request) {
				return authoringContractRequest(request, loadBlocks());
			});
		},

		authoringPalette: function (requestJson) {
			return projectCall("authoringPalette", requestJson, function (request) {
				return authoringPaletteRequest(request, loadBlocks());
			});
		},

		authoringMutate: function (requestJson) {
			return projectCall("authoringMutate", requestJson, function (request) {
				return authoringMutateRequest(request, loadBlocks());
			});
		},

		syncInputs: function (requestJson) {
			return projectCall("syncInputs", requestJson, function (request) {
				return syncProjectFlowInputsRequest(request, null);
			});
		},

		applyMutation: function (requestJson) {
			return engineCall("applyMutation", requestJson, function (request) {
				return applyMutationRequest(request, loadBlocks());
			});
		},

		applySourceMutation: function (requestJson) {
			return engineCall("applySourceMutation", requestJson, function (request) {
				return applySourceMutationRequest(request, loadBlocks());
			});
		},

		flowSourceGet: function (requestJson) {
			return projectCall("flowSourceGet", requestJson, function (request) {
				return flowScriptGetRequest(loadBlocks(), request);
			});
		},

		flowSourceValidate: function (requestJson) {
			return projectCall("flowSourceValidate", requestJson, function (request) {
				return flowScriptValidateRequest(loadBlocks(), request);
			});
		},

		flowSourcePatch: function (requestJson) {
			return projectCall("flowSourcePatch", requestJson, function (request) {
				return flowScriptPatchRequest(loadBlocks(), request);
			});
		},

		flowCodeGet: function (requestJson) {
			return projectCall("flowCodeGet", requestJson, function (request) {
				return flowCodeGetRequest(loadBlocks(), request);
			});
		},

		flowCodeStatus: function (requestJson) {
			return projectCall("flowCodeStatus", requestJson, function (request) {
				return flowCodeStatusRequest(loadBlocks(), request);
			});
		},

		flowCodeDiscard: function (requestJson) {
			return projectCall("flowCodeDiscard", requestJson, function (request) {
				return flowCodeDiscardRequest(loadBlocks(), request);
			});
		},

		flowCodeSet: function (requestJson) {
			return projectCall("flowCodeSet", requestJson, function (request) {
				return flowCodeSetRequest(loadBlocks(), request);
			});
		},

		flowCodePatch: function (requestJson) {
			return projectCall("flowCodePatch", requestJson, function (request) {
				return flowCodePatchRequest(loadBlocks(), request);
			});
		},

		flowCodeCheck: function (requestJson) {
			return projectCall("flowCodeCheck", requestJson, function (request) {
				return flowCodeCheckRequest(loadBlocks(), request);
			});
		},

		flowCodeRg: function (requestJson) {
			return projectCall("flowCodeRg", requestJson, function (request) {
				return flowCodeRgRequest(loadBlocks(), request);
			});
		},

		blockCodeGet: function (requestJson) {
			return projectCall("blockCodeGet", requestJson, function (request) {
				return blockCodeGetRequest(loadBlocks(), request);
			});
		},

		blockCodeSet: function (requestJson) {
			return projectCall("blockCodeSet", requestJson, function (request) {
				return blockCodeSetRequest(loadBlocks(), request);
			});
		},

		blockCodeCheck: function (requestJson) {
			return projectCall("blockCodeCheck", requestJson, function (request) {
				return blockCodeCheckRequest(loadBlocks(), request);
			});
		},

		blockCodePatch: function (requestJson) {
			return projectCall("blockCodePatch", requestJson, function (request) {
				return blockCodePatchRequest(loadBlocks(), request);
			});
		},

		blockCodeRg: function (requestJson) {
			return projectCall("blockCodeRg", requestJson, function (request) {
				return blockCodeRgRequest(loadBlocks(), request);
			});
		},

		flowCodeRun: function (requestJson) {
			return projectCall("flowCodeRun", requestJson, function (request) {
				return flowCodeRunRequest(loadBlocks(), request);
			});
		},

		flowCodeAnalyze: function (requestJson) {
			return projectCall("flowCodeAnalyze", requestJson, function (request) {
				return flowCodeAnalyzeRequest(loadBlocks(), request);
			});
		},

		flowCodePromote: function (requestJson) {
			return projectCall("flowCodePromote", requestJson, function (request) {
				return flowCodePromoteRequest(loadBlocks(), request);
			});
		},

		requestableList: function (requestJson) {
			return projectCall("requestableList", requestJson, function (request) {
				return requestableListRequest(request);
			});
		},

		requestableSchema: function (requestJson) {
			return projectCall("requestableSchema", requestJson, function (request) {
				return requestableSchemaRequest(request);
			});
		},

		types: function (requestJson) {
			return staticCall("types", function () {
				return Object.assign({ ok: true }, typeList(loadBlocks()));
			});
		},

		typeGet: function (requestJson) {
			return engineCall("typeGet", requestJson, function (request) {
				return getTypeSource(loadTypes(), request.name);
			});
		},

		typeCreate: function (requestJson) {
			return engineCall("typeCreate", requestJson, function (request) {
				return createProjectType(loadTypes(), request.name, request, request.overwrite === true);
			});
		},

		blockGet: function (requestJson) {
			return engineCall("blockGet", requestJson, function (request) {
				return getBlockSource(loadBlocks(), request.name, request);
			});
		},

		blockCreate: function (requestJson) {
			return engineCall("blockCreate", requestJson, function (request) {
				return createProjectBlock(loadBlocks(), request.name, request, request.overwrite === true);
			});
		},

		blockDuplicate: function (requestJson) {
			return engineCall("blockDuplicate", requestJson, function (request) {
				return duplicateProjectBlock(loadBlocks(), request.fromName || request.from, request.toName || request.name, request.overwrite === true);
			});
		},

		blockEdit: function (requestJson) {
			return engineCall("blockEdit", requestJson, function (request) {
				return editProjectBlock(loadBlocks(), request.name, request);
			});
		}
	};
}())
