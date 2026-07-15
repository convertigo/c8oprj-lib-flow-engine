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

	var yamlMapper = new ObjectMapper(new YAMLFactory());
	var jsonMapper = new ObjectMapper();
	var scopeNames = ["request", "input", "config", "local", "result", "trace", "current"];
	var projectDirOverride = null;
	var activeRequest = null;
	var compiledScriptCache = {};
	var compiledScriptCacheSizeValue = 0;
	var compiledScriptCacheClock = 0;
	var compiledScriptCacheLimit = 1024;
	var compiledScriptStats = {
		hits: 0,
		misses: 0,
		evictions: 0
	};
	var cacheUtilsModule = null;
	var fingerprintUtilsModule = null;
	var flowNodeUtilsModule = null;
	var runtimeHandleUtilsModule = null;
	var iconServiceModule = null;
	var runtimeState = {
		id: String(new Date().getTime()) + "-" + Math.floor(Math.random() * 1000000),
		startedAt: new Date().toISOString(),
		frontendDevServers: {},
		blockArtifactCompilerFingerprint: null,
		flowPlanCompilerFingerprint: null,
		caches: {
			blocks: createRuntimeMapCacheState(),
			coreBlocks: createRuntimeMapCacheState(),
			blockArtifacts: createRuntimeMapCacheState(),
			blockCatalogHeads: createRuntimeMapCacheState(),
			types: createRuntimeMapCacheState(),
			flowPlans: createRuntimeBoundedMapCacheState(256),
			configDefinitions: createRuntimeMapCacheState(),
			libraries: createRuntimeMapCacheState(),
			engineModules: createRuntimeMapCacheState(),
			propertyEditor: createRuntimeCacheState(),
			treeSnapshots: createRuntimeMapCacheState(),
			frontendDocuments: createRuntimeMapCacheState(),
			expressionTokens: createRuntimeBoundedMapCacheState(4096)
		}
	};

	function engineDir() {
		if (typeof __flowEngineDir !== "undefined" && String(__flowEngineDir).trim() !== "") {
			return new File(String(__flowEngineDir));
		}
		return new File("libs/flow").getAbsoluteFile();
	}

	function projectDir() {
		if (projectDirOverride) {
			return new File(String(projectDirOverride));
		}
		if (typeof __flowProjectDir !== "undefined" && String(__flowProjectDir).trim() !== "") {
			return new File(String(__flowProjectDir));
		}
		return null;
	}

	function withProjectDir(dir, callback) {
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
			evictions: compiledScriptStats.evictions
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
		cached = cx.compileString(source, String(sourceName || "flow-script"), 1, null);
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

	function response(value) {
		return JSON.stringify(sanitizeRuntimeValue(value || {}));
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
		var module = evalCompiledSource(source, canonicalPath(file), file.lastModified() + ":" + file.length());
		if (!module || typeof module !== "object") {
			raise("INVALID_ENGINE_MODULE", "Invalid Flow engine module: " + file.getAbsolutePath(),
				null, "A Flow engine module must evaluate to an object.");
		}
		module.__flowFile = String(file.getAbsolutePath());
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
		return cacheUtils().readMap(cache, key, fingerprint);
	}

	function writeRuntimeMapCache(cache, key, fingerprint, value, label) {
		return cacheUtils().writeMap(cache, key, fingerprint, value, label);
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
		runtimeHandleUtilsModule = null;
		iconServiceModule = null;
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
			resetModuleCaches: resetRuntimeModuleCaches,
			compiledScriptCacheInfo: compiledScriptCacheInfo,
			clearCompiledScriptCache: clearCompiledScriptCache
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
		var module = evalCompiledSource(source, key, fingerprint);
		if (!module || typeof module !== "object") {
			raise("INVALID_ENGINE_MODULE", "Invalid Flow engine module: " + file.getAbsolutePath(),
				null, "A Flow engine module must evaluate to an object.");
		}
		module.__flowFile = String(file.getAbsolutePath());
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
		return loadEngineModule("expression-utils.js");
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
			currentTimeMillis: function () { return new Date().getTime(); },
			blockCatalogProbeIntervalMs: 1000,
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
		return {
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
			graphBlockStackLabel: graphBlockStackLabel
		};
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
				var draft = frontendDraftForFile(activeRequest, file);
				return draft === null ? fileFingerprint(file) : "draft:" + sha256Hex(draft);
			},
			readBlockArtifact: function (key, fingerprint) {
				return readRuntimeMapCache(runtimeState.caches.blockArtifacts, key, fingerprint);
			},
			writeBlockArtifact: function (key, fingerprint, value) {
				return writeRuntimeMapCache(runtimeState.caches.blockArtifacts, key, fingerprint, value,
					"compiled Flow block artifacts");
			},
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
			projectName = String(dir.getName());
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
		return flowCodeService().blockCodePatchRequest(blocks, request, flowCodeServiceEnv());
	}

	function blockCodeGetRequest(blocks, request) {
		return flowCodeService().blockCodeGetRequest(blocks, request, flowCodeServiceEnv());
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
			flowCodeError: flowCodeError,
			raise: raise,
			context: typeof context === "undefined" ? null : context
		};
	}

	function requestableOutputSchema(target) {
		return requestableService().outputSchema(target, requestableServiceEnv());
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
		return loadEngineModule("flow-runtime-service.js");
	}

	function flowRuntimeServiceEnv() {
		return {
			File: File,
			blockName: blockName,
			nodeProps: nodeProps,
			raise: raise,
			nodePath: nodePath,
			normalizeTree: normalizeTree,
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
			flowPlanCompilerFingerprint: flowPlanCompilerFingerprint,
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
			evaluateExpression: evaluateExpression,
			compileExpression: compileExpression,
			literalValue: literalValue,
			renderTemplate: renderTemplate,
			renderTemplateTree: renderTemplateTree,
			inputValue: inputValue,
			safeFilePart: safeFilePart,
			loadFlowLibrary: loadFlowLibrary,
			cacheInfoRequest: cacheInfoRequest,
			clearRuntimeCaches: clearRuntimeCaches,
			withProjectDir: withProjectDir,
			analyzeFlowSource: analyzeFlowSource,
			loadBlocks: loadBlocks,
			contextForFlowRequest: contextForFlowRequest,
			searchFlowRequest: searchFlowRequest,
			describeTreeRequest: describeTreeRequest,
			applyMutationRequest: applyMutationRequest,
			authoringTreeRequest: authoringTreeRequest,
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
			mergedContext: mergedContext,
			catalogDefinition: catalogDefinition,
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
			context: typeof context === "undefined" ? null : context,
			nanoTime: function () { return Number(JavaSystem.nanoTime()); }
		};
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

	function createRunContext(request, definition, blocks, projectEngine) {
		return flowRuntimeService().createRunContext(request, definition, blocks, projectEngine, flowRuntimeServiceEnv());
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
			canonicalPath: canonicalPath,
			directoryFingerprint: directoryFingerprint,
			resourceRelativePath: resourceRelativePath,
			resolveBlockIcon: resolveBlockIcon,
			normalizeTree: normalizeTree,
			projectRootForName: loadedProjectRootForName,
			raise: raise
		};
	}

	function frontendBlocksForSettings(name, settings) {
		return frontendCatalogService().frontendBlocksForSettings(name, settings, frontendCatalogServiceEnv());
	}

	function frontendCreateDescriptorsForSettings(name, settings) {
		return frontendCatalogService().frontendCreateDescriptorsForSettings(name, settings, frontendCatalogServiceEnv());
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
			return frontendCatalogService().fingerprintForConfig(engine.config || {}, frontendCatalogServiceEnv());
		} catch (e) {
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
				var drafts = frontendSourceDrafts(request);
				var basePath = String(file.getParentFile().getCanonicalPath());
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
			resourceRelativePath: resourceRelativePath,
			resolveBlockIcon: resolveBlockIcon,
			normalizeTree: normalizeTree,
			compact: compact,
			summaryText: summaryText,
			blockCatalog: blockCatalog,
			blockDescriptor: blockDescriptor,
			typeDescriptor: typeDescriptor,
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
				frontendBlocksForSettings: frontendBlocksForSettings,
				frontendCreateDescriptorsForSettings: frontendCreateDescriptorsForSettings,
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

	function authoringTreeRequest(request, blocks) {
		return flowTreeService().authoringTreeRequest(request || {}, blocks, flowTreeServiceEnv());
	}

	function authoringPaletteRequest(request, blocks) {
		return flowTreeService().authoringPaletteRequest(request || {}, blocks, flowTreeServiceEnv());
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
			String(request.includeSource === true),
			String(request.includeAnalysis === true),
			String(request.includeSchema === true || request.schema === true),
			String(request.includePrivate === false ? "no-private" : "private")
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
		if (!sourcePath.endsWith(".flow.svelte")) {
			return applyMutationRequest(request, blocks);
		}
		return applyFlowSvelteSourceMutationRequest(request);
	}

	function frontendRequestSourceFile(request, mustExist) {
		var sourcePath = String(request && (request.sourceFile || request.sourcePath) || "");
		if (!sourcePath) {
			raise("MISSING_FRONTEND_SOURCE", "A Flow Svelte source path is required.");
		}
		var sourceFile = new File(sourcePath);
		if (sourceFile.isAbsolute()) {
			return sourceFile.getCanonicalFile();
		}
		return projectResourceFile(sourcePath, mustExist).file.getCanonicalFile();
	}

	function frontendBindingActionSchemas(document, request, projectRoot) {
		var model = document && document.model || {};
		var calls = {};
		(model.backendCalls || []).forEach(function (call) {
			if (call && call.id && call.requestable) {
				calls[String(call.id)] = call;
			}
		});
		var projectName = currentProjectName(request) || projectRoot && String(projectRoot.getName()) || "";
		var schemas = {};
		(model.clientActions || []).forEach(function (action) {
			var call = action && calls[String(action.backendCall || "")];
			if (!action || !action.id || !call) {
				return;
			}
			if (call.outputSchema && typeof call.outputSchema === "object") {
				schemas[String(action.id)] = normalizeTree(call.outputSchema);
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
					schemas[String(action.id)] = response.schema;
				}
			} catch (e) {
			}
		});
		return schemas;
	}

	function enrichFrontendBindingSources(document, request, projectRoot) {
		return frontendCatalogService().enrichBindingSources(document,
			frontendBindingActionSchemas(document, request, projectRoot), {
				normalizeTree: normalizeTree,
				schemaPaths: schemaPaths,
				schemaArrayPaths: schemaArrayPaths,
				schemaLeafEntries: schemaLeafEntries,
				schemaSimpleType: schemaSimpleType,
				schemaAtPath: schemaAtPath
			});
	}

	function describeFrontendDocument(request) {
		request = request || {};
		var sourcePath = String(request.sourceFile || request.sourcePath || "");
		var sourceFile = frontendRequestSourceFile(request, request.source === undefined || request.source === null);
		var source = request.source !== undefined && request.source !== null
			? String(request.source)
			: String(FileUtils.readFileToString(sourceFile, "UTF-8"));
		var resourceRoot = frontendSvelteResourceRoot(request);
		var projectRoot = fileForProjectPath(new File("."), request.projectDir || "") || projectDir() || new File(".");
		var drafts = frontendSourceDrafts(request);
		var cache = runtimeState.caches.frontendDocuments;
		var key = [
			String(sourceFile.getAbsolutePath()),
			String(resourceRoot.getAbsolutePath()),
			String(projectRoot.getAbsolutePath())
		].join("\n");
		var fingerprint = sha256Hex([
			source,
			JSON.stringify(drafts || {})
		].join("\n"));
		var cached = readRuntimeMapCache(cache, key, fingerprint);
		if (cached) {
			return enrichFrontendBindingSources(cached, request, projectRoot);
		}
		var normalizedSourcePath = String(sourceFile.getCanonicalPath()).replace(/\\/g, "/");
		var local = normalizedSourcePath.indexOf("/src/routes/") >= 0
			? null
			: describeFrontAstDocument(source, request, sourceFile, projectRoot);
		if (local) {
			var cachedLocal = writeRuntimeMapCache(cache, key, fingerprint, local, "Svelte front documents");
			return enrichFrontendBindingSources(cachedLocal, request, projectRoot);
		}
		var sourceTemp = File.createTempFile("c8o-front-document-source-", ".flow.svelte");
		var draftsTemp = File.createTempFile("c8o-front-document-drafts-", ".json");
		try {
			FileUtils.writeStringToFile(sourceTemp, source, "UTF-8");
			FileUtils.writeStringToFile(draftsTemp, JSON.stringify(drafts), "UTF-8");
			var args = frontendTsxCommand(resourceRoot, "src-builder/frontDocumentCli.ts", [
				"--source-file", String(sourceFile.getAbsolutePath()),
				"--source-input", String(sourceTemp.getAbsolutePath()),
				"--drafts", String(draftsTemp.getAbsolutePath()),
				"--resource-root", String(resourceRoot.getAbsolutePath()),
				"--project-root", String(projectRoot.getAbsolutePath())
			]);
			var output = frontendRunOneShot(args, resourceRoot, "Svelte front document");
			var result = frontendMarkedJson(output, "__C8O_FRONT_DOCUMENT__");
			if (!result || !result.model) {
				var error = new Error("Svelte front document did not return a valid model.");
				error.code = "FRONTEND_DOCUMENT_INVALID_RESULT";
				error.hint = "Check src-builder/frontDocumentCli.ts output for " + sourcePath + ".";
				throw error;
			}
			var cachedResult = writeRuntimeMapCache(cache, key, fingerprint, result, "Svelte front documents");
			return enrichFrontendBindingSources(cachedResult, request, projectRoot);
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

	function applyFlowSvelteSourceMutationRequest(request) {
		var sourcePath = String(request.sourceFile || request.sourcePath || "");
		var sourceFile = frontendRequestSourceFile(request, request.source === undefined || request.source === null);
		var source = request.source !== undefined && request.source !== null
			? String(request.source)
			: String(FileUtils.readFileToString(sourceFile, "UTF-8"));
		var mutations = request.mutations || (request.mutation ? [request.mutation] : []);
		if (mutations.length === 0) {
			raise("MISSING_FRONTEND_MUTATION", "Svelte frontend source mutation requires mutation or mutations.");
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
		return out;
	}

	function applyOneFlowSvelteSourceMutation(request, source, mutation, sourceFile, sourcePath) {
		mutation = mutation || {};
		var frontAstResult = applyFrontAstSourceMutation(source, mutation, sourceFile);
		if (frontAstResult) {
			return frontAstResult;
		}
		var resourceRoot = frontendSvelteResourceRoot(request);
		var sourceTemp = File.createTempFile("c8o-flow-svelte-source-", ".flow.svelte");
		var mutationTemp = File.createTempFile("c8o-flow-svelte-mutation-", ".json");
		try {
			FileUtils.writeStringToFile(sourceTemp, source, "UTF-8");
			FileUtils.writeStringToFile(mutationTemp, JSON.stringify(mutation), "UTF-8");
			var args = frontendTsxCommand(resourceRoot, "src-builder/sourceMutateCli.ts", [
				"--source-file", String(sourceFile.getAbsolutePath()),
				"--source-input", String(sourceTemp.getAbsolutePath()),
				"--mutation", String(mutationTemp.getAbsolutePath())
			]);
			var output = frontendRunOneShot(args, resourceRoot, "Svelte source mutate");
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
		if (op === "append" || op === "insert") {
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
		if (!frontAstIsFlowValueBinding(normalized)) {
			var error = new Error("Property " + name + " requires a structured FlowValueBinding. Use the binding or mutation returned by the picker; string paths are migration input only.");
			error.code = "FRONTEND_BINDING_REQUIRED";
			error.hint = "Select a schema-backed picker candidate and pass its mutation unchanged.";
			throw error;
		}
		return normalized;
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
			return typeof value.expression === "string";
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
		return source.category === "iteration" && typeof source.scopeId === "string" && source.scopeId !== ""
			&& (source.value === "item" || source.value === "index");
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
		var attrs = frontAstParseAttributes(trimmed.substring(match[0].length));
		return { tag: tag, attrs: attrs, children: [], selfClosing: selfClosing };
	}

	function frontAstParseAttributes(text) {
		var attrs = {};
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
				i++;
			} else if (ch === "{") {
				var end = frontAstExpressionEnd(text, i);
				attrs[name] = frontAstParseAttributeExpression(text.substring(i + 1, end));
				i = end + 1;
			} else {
				var bareStart = i;
				while (i < text.length && !/\s/.test(text.charAt(i))) {
					i++;
				}
				attrs[name] = text.substring(bareStart, i);
			}
		}
		return attrs;
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
				// Preserve non-JSON Svelte expressions for the renderer.
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
		var tag = frontAstSlotTag(name);
		var children = node.children || [];
		for (var i = 0; i < children.length; i++) {
			if (children[i].tag === tag) {
				return children[i];
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
		var attrs = frontAstRenderAttributes(node.tag, node.attrs || {});
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

	function frontAstRenderAttributes(tag, attrs) {
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
			rendered.push(names[j] + "=" + frontAstRenderAttributeValue(names[j], attrs[names[j]]));
		}
		return rendered.join(" ");
	}

	function frontAstRenderAttributeValue(name, value) {
		if (value && typeof value === "object") {
			return "{" + JSON.stringify(value) + "}";
		}
		if (typeof value === "number" || typeof value === "boolean") {
			return "{" + JSON.stringify(value) + "}";
		}
		var text = String(value);
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
				structure: frontAstSlotDefinition("structure", "frontAst.slots.structure.children", true)
			},
			children: [
				frontAstSlotModel(root, "structure", "frontAst", sourceFile, projectRoot)
			]
		};
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
			if (String(node.props && node.props.kind || "") !== "callSequence") {
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
		if (kind === "callSequence" || kind === "setValue") {
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
				text: { label: "Text", kind: "text", type: "string" },
				source: { label: "Source", kind: "binding", type: "object" }
			},
			image: {
				id: { label: "Id", kind: "text", type: "string" },
				source: { label: "Source", kind: "binding", type: "object" }
			},
			button: {
				id: { label: "Id", kind: "text", type: "string" },
				label: { label: "Label", kind: "text", type: "string" }
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
				requestable: { label: "Requestable", category: "Action", kind: "requestable", type: "requestable" }
			},
			setValue: {
				id: { label: "Id", category: "Base properties", type: "string" },
				target: { label: "Target", category: "Action", type: "string" },
				value: { label: "Value", category: "Action", kind: "binding", type: "object" }
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
		if (kind === "callSequence" || kind === "setValue") {
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
		if (kind === "if" || kind === "each" || kind === "await" || kind === "callSequence" || kind === "setValue" || kind === "variable" || kind === "column") {
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
			if (root && root.isDirectory()) {
				return root;
			}
		}
		if (fallback) {
			return fallback;
		}
		return fileForProjectPath(projectRoot, "libs/flow/frontbuilder/svelte");
	}

	function frontendRunOneShot(args, cwd, label) {
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
		var drafts = frontendSourceDrafts(activeRequest);
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
		var draft = frontendDraftForFile(activeRequest, file);
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
				} else if (file.isFile() && String(file.getName()).endsWith(".flow.svelte")) {
					var draft = frontendDraftForFile(request, file);
					var content = draft === null ? String(FileUtils.readFileToString(file, "UTF-8")) : draft;
					frontendWriteFile(new File(overlayDir, file.getName()), content);
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
					cleanup: null
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
				cleanup: overlayDir
			};
		}
		var draftFile = new File(draftDir, sha256Hex(String(modelPath.getCanonicalPath())).substring(0, 16) + ".front.json");
		frontendWriteFile(draftFile, draft);
		return {
			file: draftFile.getCanonicalFile(),
			cleanup: draftFile
		};
	}

	function frontendRunCommandFor(action, npm, resourceRoot, projectRoot, modelPath, generatedRoot, generationMode) {
		if (action === "installBuilder") {
			return [npm, "--prefix", String(resourceRoot.getAbsolutePath()), "install"];
		}
		if (action === "generate") {
			return frontendTsxCommand(resourceRoot, "src-builder/cli.ts", [
				"--project-root", String(projectRoot.getAbsolutePath()),
				"--model", String(modelPath.getAbsolutePath()),
				"--mode", generationMode
			]);
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

	function frontendRunStep(stepAction, npm, resourceRoot, projectRoot, modelPath, generatedRoot, generationMode, envValues) {
		var cwd = stepAction === "installApp" || stepAction === "check" || stepAction === "build"
			? generatedRoot
			: resourceRoot;
		var args = frontendRunCommandFor(stepAction, npm, resourceRoot, projectRoot, modelPath, generatedRoot, generationMode);
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
		return {
			action: stepAction,
			command: args.join(" "),
			cwd: String(cwd.getAbsolutePath()),
			exitCode: exitCode,
			stdout: output,
			stderr: "",
			ok: exitCode === 0
		};
	}

	function frontendRunAction(request, blocks, action) {
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
		var resourceRoot = frontendSvelteResourceRoot(request);
		var generatedRoot = frontendGeneratedRootFile(request, info);
		var generationMode = "incremental";
		var sourceRoot = String(settings.privateDir || "_private/svelte");
		var buildOutput = String(settings.buildOutput || "DisplayObjects/mobile");
		var npm = frontendExecutable("npm");
		var envValues = {
			FRONTBUILDER_PROJECT_ROOT: projectRoot ? String(projectRoot.getAbsolutePath()) : String(request.projectDir || ""),
			FRONTBUILDER_SOURCE_ROOT: sourceRoot,
			FRONTBUILDER_BUILD_OUTPUT: buildOutput,
			PATH: frontendExecutablePathPrefix(npm) + String(Packages.java.lang.System.getenv("PATH") || "")
		};
		var actions = action === "install"
			? ["installBuilder", "generate", "installApp"]
			: action === "check" || action === "build"
				? ["generate", "installApp", action]
				: [action];
		var steps = [];
		var ok = true;
		try {
			for (var i = 0; i < actions.length; i++) {
				var step = frontendRunStep(actions[i], npm, resourceRoot, projectRoot, effective.file, generatedRoot, generationMode, envValues);
				steps.push(step);
				if (step.ok === false) {
					ok = false;
					break;
				}
			}
		} catch (e) {
			ok = false;
			steps.push({
				action: action,
				ok: false,
				exitCode: -1,
				stdout: String(e && (e.message || e) || "")
			});
		} finally {
			try {
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
				exitCode: step.exitCode
			};
			if (step.ok === false && step.stdout) {
				out.stdout = String(step.stdout).substring(0, 4000);
			}
			return out;
		});
		return {
			ok: ok,
			title: "Svelte frontbuilder",
			message: ok ? "Svelte frontbuilder action completed: " + action + "." : "Svelte frontbuilder action failed: " + action + ".",
			refresh: action === "generate" || action === "build",
			details: {
				action: action,
				projectRoot: projectRoot ? String(projectRoot.getAbsolutePath()) : String(request.projectDir || ""),
				resourceRoot: resourceRoot ? String(resourceRoot.getAbsolutePath()) : "",
				modelPath: modelPath ? String(modelPath.getAbsolutePath()) : "",
				effectiveModelPath: effective.file ? String(effective.file.getAbsolutePath()) : "",
				sourcePath: sourcePath,
				draftCount: draftCount,
				sourceRoot: sourceRoot,
				buildOutput: buildOutput,
				steps: compactSteps
			}
		};
	}

	function frontendProjectName(request) {
		var target = request.targetObject || {};
		var root = request.root || {};
		return String(target.project || root.project || currentProjectName(request) || "");
	}

	function frontendBuiltUrl(request) {
		var info = frontbuilderSettingsForRequest(request);
		var project = frontendProjectName(request);
		var buildOutput = String(info.settings.buildOutput || "DisplayObjects/mobile").replace(/^\/+/, "");
		if (!project) {
			return "";
		}
		return "http://localhost:18080/convertigo/projects/" + encodeURIComponent(project) + "/" + buildOutput + "/index.html";
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

	function frontendDevStateFile(request, info) {
		var generatedRoot = frontendGeneratedRootFile(request, info);
		return generatedRoot ? new File(generatedRoot, ".flow-svelte-dev.json") : null;
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
			entry.stateFile = String(file.getAbsolutePath());
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
		var state = {
			url: entry.url || "",
			port: entry.port || 0,
			pid: entry.pid || 0,
			projectRoot: entry.projectRoot || "",
			generatedRoot: entry.generatedRoot || "",
			logFile: entry.logFile || "",
			startedAt: entry.startedAt || new Date().toISOString()
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
		var entry = runtimeState.frontendDevServers[key];
		if (entry && !frontendDevAlive(entry)) {
			delete runtimeState.frontendDevServers[key];
			frontendDeleteDevState(request, info);
			entry = null;
		}
		if (entry) {
			return entry;
		}
		entry = frontendReadDevState(request, info);
		if (entry && frontendDevAlive(entry)) {
			runtimeState.frontendDevServers[key] = entry;
			return entry;
		}
		if (entry) {
			frontendDeleteDevState(request, info);
		}
		entry = frontendReadDevLogState(request, info);
		if (entry && frontendDevAlive(entry)) {
			runtimeState.frontendDevServers[key] = entry;
			frontendWriteDevState(request, info, entry);
			return entry;
		}
		return null;
	}

	function frontendDevDetails(entry) {
		if (!entry) {
			return {};
		}
		return {
			url: entry.url,
			port: entry.port,
			projectRoot: entry.projectRoot,
			generatedRoot: entry.generatedRoot,
			logFile: entry.logFile,
			startedAt: entry.startedAt,
			pid: entry.pid || 0,
			stateFile: entry.stateFile || ""
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
		return name;
	}

	function frontendExecutablePathPrefix(executable) {
		var parent = new File(String(executable || "")).getParentFile();
		return parent ? String(parent.getAbsolutePath()) + File.pathSeparator : "";
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

	function frontendTsxCommand(resourceRoot, script, args) {
		args = args || [];
		var toolRoot = frontendSvelteToolRoot(resourceRoot, script);
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
					frontendStudioLog("[" + label + "] log pump stopped: " + String(e), true);
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
		return {
			id: "flow.frontend:" + projectName + ":" + String(kind || "preview"),
			title: String(title || "Flow frontend"),
			project: projectName,
			url: String(url || ""),
			tooltip: String(url || ""),
			kind: String(kind || "preview")
		};
	}

	function frontendStartDev(request, blocks) {
		var info = frontbuilderSettingsForRequest(request);
		var existing = frontendDevEntry(request, info);
		if (existing) {
			return {
				ok: true,
				title: "Svelte dev mode",
				message: "Svelte dev mode is already running.",
				openUrl: existing.url,
				browser: frontendStudioBrowser(request, existing.url, "Svelte dev mode", "frontbuilder.svelte.dev"),
				details: frontendDevDetails(existing)
			};
		}
		var settings = info.settings || {};
		var projectRoot = fileForProjectPath(new File("."), request.projectDir || "");
		var generatedRoot = fileForProjectPath(projectRoot, settings.privateDir || "_private/svelte");
		var install = frontendRunAction(request, blocks, "install");
		if (install.ok === false) {
			return install;
		}
		var nodeModules = new File(generatedRoot, "node_modules");
		if (!nodeModules.isDirectory()) {
			return failure("frontbuilder", {
				code: "FRONTBUILDER_APP_DEPENDENCIES_MISSING",
				message: "Svelte app dependencies were not installed before starting dev mode.",
				details: {
					generatedRoot: String(generatedRoot.getAbsolutePath()),
					nodeModules: String(nodeModules.getAbsolutePath()),
					install: install.details || {}
				}
			});
		}
		var npm = frontendExecutable("npm");
		var port = freePort();
		var url = "http://localhost:" + port + "/";
		var logFile = new File(generatedRoot, "vite-dev.log");
		try {
			FileUtils.writeStringToFile(logFile, "", "UTF-8");
		} catch (e) {
		}
		var pb = new Packages.java.lang.ProcessBuilder(javaStringList([
			npm, "--prefix", String(generatedRoot.getAbsolutePath()), "exec", "--",
			"vite", "--host", "127.0.0.1", "--port", String(port), "--strictPort"
		]));
		pb.directory(generatedRoot);
		pb.redirectErrorStream(true);
		pb.environment().put("PATH", frontendExecutablePathPrefix(npm) + String(Packages.java.lang.System.getenv("PATH") || ""));
		frontendStudioLog("[Svelte dev] > " + npm + " --prefix " + generatedRoot.getAbsolutePath() + " exec -- vite --host 127.0.0.1 --port " + port + " --strictPort");
		var process = pb.start();
		var logPump = frontendStartLogPump(process, logFile, "Svelte dev");
		if (!frontendWaitForPort("127.0.0.1", port, process, 20000)) {
			try {
				process.destroy();
			} catch (e) {
			}
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
		var entry = {
			url: url,
			port: port,
			pid: typeof process.pid === "function" ? Number(process.pid()) : 0,
			projectRoot: String(projectRoot.getAbsolutePath()),
			generatedRoot: String(generatedRoot.getAbsolutePath()),
			logFile: String(logFile.getAbsolutePath()),
			startedAt: new Date().toISOString(),
			logPump: logPump,
			process: process
		};
		runtimeState.frontendDevServers[frontendDevKey(request, info)] = entry;
		frontendWriteDevState(request, info, entry);
		return {
			ok: true,
			title: "Svelte dev mode",
			message: "Svelte dev mode started.",
			openUrl: url,
			browser: frontendStudioBrowser(request, url, "Svelte dev mode", "frontbuilder.svelte.dev"),
			details: frontendDevDetails(entry)
		};
	}

	function frontendDestroyDevProcess(entry) {
		if (!entry) {
			return;
		}
		try {
			if (entry.process && typeof entry.process.destroy === "function") {
				entry.process.destroy();
			}
		} catch (e) {
		}
		try {
			if (entry.pid) {
				var optional = Packages.java.lang.ProcessHandle.of(Packages.java.lang.Long.valueOf(String(entry.pid)));
				if (optional && optional.isPresent()) {
					var handle = optional.get();
					var Consumer = Packages.java.util.function.Consumer;
					handle.descendants().forEach(new Consumer({
						accept: function (child) {
							try {
								child.destroy();
							} catch (e) {
							}
						}
					}));
					handle.destroy();
				}
			}
		} catch (e2) {
		}
	}

	function frontendStopDev(request) {
		var info = frontbuilderSettingsForRequest(request);
		var key = frontendDevKey(request, info);
		var entry = frontendDevEntry(request, info);
		if (!entry) {
			return {
				ok: true,
				title: "Svelte dev mode",
				message: "Svelte dev mode is not running."
			};
		}
		frontendDestroyDevProcess(entry);
		delete runtimeState.frontendDevServers[key];
		frontendDeleteDevState(request, info);
		return {
			ok: true,
			title: "Svelte dev mode",
			message: "Svelte dev mode stopped."
		};
	}

	function frontendSyncDev(request, blocks) {
		var info = frontbuilderSettingsForRequest(request);
		var entry = frontendDevEntry(request, info);
		if (!entry) {
			var sourcePath = String((request.action && request.action.payload && request.action.payload.sourcePath) || request.sourcePath || request.sourceFile || "");
			return {
				ok: true,
				title: "Svelte dev mode",
				message: "Svelte dev mode is not running; generated source was not updated.",
				generated: false,
				details: {
					sourcePath: sourcePath,
					draftCount: frontendDraftCount(request)
				}
			};
		}
		var generated = frontendRunAction(request, blocks, "generate");
		generated.title = "Svelte dev mode";
		generated.generated = generated.ok !== false;
		generated.dev = frontendDevDetails(entry);
		generated.message = generated.ok === false
			? "Svelte dev source update failed."
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
				message: "Svelte dev mode is not running."
			};
		}
		return {
			ok: true,
			title: "Svelte dev mode",
			message: "Opening Svelte dev mode.",
			openUrl: entry.url,
			browser: frontendStudioBrowser(request, entry.url, "Svelte dev mode", "frontbuilder.svelte.dev"),
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

	function contextMenuItem(id, label, description, group, payload, confirm, icon, enabled) {
		return {
			id: id,
			label: label,
			description: description,
			group: group,
			enabled: enabled !== false,
			payload: payload || {},
			confirm: confirm || "",
			icon: icon || ""
		};
	}

	function contextActionRequest(request, blocks) {
		var action = request.action || {};
		var id = String(action.id || request.actionId || "");
		var payload = action.payload || {};
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
				browser: builtUrl ? frontendStudioBrowser(request, builtUrl, "Svelte production frontend", "frontbuilder.svelte.prod") : null
			};
		}
		if (id === "frontbuilder.svelte.dev.sync") {
			return frontendSyncDev(request, blocks);
		}
		if (id === "frontbuilder.svelte.dev.start") {
			return frontendStartDev(request, blocks);
		}
		if (id === "frontbuilder.svelte.dev.stop") {
			return frontendStopDev(request);
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
			flowProviderName: flowProviderName
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
			var previousRequest = activeRequest;
			activeRequest = request;
			try {
				return response(callback(request));
			} finally {
				activeRequest = previousRequest;
			}
		} catch (e) {
			return response(failure(operation, e));
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
			return engineCall("run", requestJson, function (request) {
				var started = request.profile === true ? JavaSystem.nanoTime() : 0;
				var blocks = loadBlocks(true);
				if (request.profile === true) {
					request.loadBlocksMs = Number(JavaSystem.nanoTime() - started) / 1000000;
				}
				return runFlowRequest(request, blocks);
			});
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
					cursor: request.cursor
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
			return engineCall("describeTree", requestJson, function (request) {
				return describeTreeRequest(request, loadBlocks());
			});
		},

		authoringTree: function (requestJson) {
			return projectCall("authoringTree", requestJson, function (request) {
				return authoringTreeRequest(request, loadBlocks());
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
				return setProjectBlockCode(loadBlocks(), request.name || request.block, request);
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
