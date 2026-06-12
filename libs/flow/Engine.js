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

	var yamlMapper = new ObjectMapper(new YAMLFactory());
	var jsonMapper = new ObjectMapper();
	var scopeNames = ["request", "input", "config", "local", "result", "trace", "current"];
	var projectDirOverride = null;
	var cacheUtilsModule = null;
	var fingerprintUtilsModule = null;
	var flowNodeUtilsModule = null;
	var runtimeHandleUtilsModule = null;
	var iconServiceModule = null;
	var runtimeState = {
		id: String(new Date().getTime()) + "-" + Math.floor(Math.random() * 1000000),
		startedAt: new Date().toISOString(),
		caches: {
			blocks: createRuntimeCacheState(),
			types: createRuntimeCacheState(),
			libraries: createRuntimeMapCacheState(),
			engineModules: createRuntimeMapCacheState(),
			propertyEditor: createRuntimeCacheState()
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
			projectDir: projectDir,
			parseYamlSource: parseYamlSource,
			jsValue: jsValue,
			normalizeTree: normalizeTree,
			collectConfigKeys: collectConfigKeys
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

	function loadBootstrapModule(name) {
		var file = engineModuleFile(name);
		if (!file.isFile()) {
			raise("MISSING_ENGINE_MODULE", "Flow engine module not found: " + file.getAbsolutePath());
		}
		var module = eval(String(FileUtils.readFileToString(file, "UTF-8")));
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

	function resetRuntimeModuleCaches() {
		cacheUtilsModule = null;
		fingerprintUtilsModule = null;
		flowNodeUtilsModule = null;
		runtimeHandleUtilsModule = null;
		iconServiceModule = null;
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
			resetModuleCaches: resetRuntimeModuleCaches
		};
	}

	function clearRuntimeCaches() {
		return runtimeCacheService().clear(runtimeCacheEnv());
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
		var module = eval(source);
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

	function resourceApi() {
		return {
			search: resourceSearchRequest,
			list: resourceListRequest,
			get: resourceGetRequest,
			patch: resourcePatchRequest
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
			readRuntimeCache: readRuntimeCache,
			writeRuntimeCache: writeRuntimeCache,
			flowProviderName: flowProviderName,
			loadFlowScriptBlockFile: loadFlowScriptBlockFile,
			loadGraphBlockFile: loadGraphBlockFile,
			reserveFlowScriptBlockFile: reserveFlowScriptBlockFile,
			reserveGraphBlockFile: reserveGraphBlockFile,
			validateTypeDescriptorSource: validateTypeDescriptorSource,
			raise: raise,
			blockCache: runtimeState.caches.blocks,
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

	function loadBlocks() {
		return catalogLoaderService().loadBlocks(catalogLoaderEnv());
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
		return blockAuthoringService().setProjectBlockCode(blocks, name, request, blockAuthoringEnv());
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
			flowCodeFileName: flowCodeFileName
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

	function projectFlowBean(name) {
		var dir = projectDir();
		var projectName = dir ? String(dir.getName()) : "";
		if (!projectName || !name) {
			return null;
		}
		try {
			var engine = Packages.com.twinsoft.convertigo.engine.Engine;
			if (!engine.theApp || !engine.theApp.databaseObjectsManager) {
				return null;
			}
			var project = engine.theApp.databaseObjectsManager.getOriginalProjectByName(projectName, false);
			var sequence = project.getSequenceByName(String(name));
			var flowClass = Packages.com.twinsoft.convertigo.beans.flow.Flow.class;
			return flowClass.isAssignableFrom(sequence.getClass()) ? sequence : null;
		} catch (e) {
			return null;
		}
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
			flowScriptPropertyCandidates: flowScriptPropertyCandidates,
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
			flowScriptGetRequest: flowScriptGetRequest,
			normalizeFlowScriptCode: normalizeFlowScriptCode,
			stripFlowScriptMirrorHeader: stripFlowScriptMirrorHeader,
			setProjectFlow: setProjectFlow,
			applyUnifiedPatchText: applyUnifiedPatchText,
			getBlockSource: getBlockSource,
			setProjectBlockCode: setProjectBlockCode,
			flowScriptBlockMetaFromRequest: flowScriptBlockMetaFromRequest,
			flowScriptBlockCodeSource: flowScriptBlockCodeSource,
			flowScriptBlockCandidates: flowScriptBlockCandidates,
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
			renderFlowScript: renderFlowScript,
			parseSource: parseSource,
			sourceForFlowRequest: sourceForFlowRequest,
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
			outputSchemaRequest: outputSchemaRequest,
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
			context: typeof context === "undefined" ? null : context
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
			schemaSummary: schemaSummary,
			expandFlowDefinition: expandFlowDefinition,
			blocksWithFlowHelpers: blocksWithFlowHelpers,
			parseSource: parseSource,
			sourceForFlowRequest: sourceForFlowRequest,
			objectSchema: objectSchema,
			assignSchemaAtPath: assignSchemaAtPath,
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
			analyzeFlowDefinition: analyzeFlowDefinition,
			analysisByNodeId: analysisByNodeId,
			currentProjectName: currentProjectName,
			visibleSearchFlows: visibleSearchFlows,
			projectSchemasDir: projectSchemasDir,
			readResultSchema: readResultSchema,
			declaredOutputSchema: declaredOutputSchema,
			resultSchemaFromAnalysis: resultSchemaFromAnalysis,
			schemaScore: schemaScore,
			objectSchema: objectSchema,
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
		return flowTreeService().describeTreeRequest(request, blocks, flowTreeServiceEnv());
	}

	function searchFlowRequest(request, blocks) {
		return flowTreeService().searchFlowRequest(request, blocks, flowTreeServiceEnv());
	}

	function applyMutationRequest(request, blocks) {
		return flowTreeService().applyMutationRequest(request, blocks, flowTreeServiceEnv());
	}

	function outputSchemaRequest(request, blocks) {
		return flowTreeService().outputSchemaRequest(request, blocks, flowTreeServiceEnv());
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
			return response(callback(request));
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
		run: function (requestJson) {
			return engineCall("run", requestJson, function (request) {
				return runFlowRequest(request, loadBlocks());
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

		outputSchema: function (requestJson) {
			return engineCall("outputSchema", requestJson, function (request) {
				return outputSchemaRequest(request, loadBlocks());
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
				return Object.assign({ ok: true }, catalogDefinition(blocks, {
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
			});
		},

		describeTree: function (requestJson) {
			return engineCall("describeTree", requestJson, function (request) {
				return describeTreeRequest(request, loadBlocks());
			});
		},

		applyMutation: function (requestJson) {
			return engineCall("applyMutation", requestJson, function (request) {
				return applyMutationRequest(request, loadBlocks());
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
