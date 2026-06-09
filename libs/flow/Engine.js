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
	var runtimeHandleUtilsModule = null;
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

	function projectFlowDraftsDir() {
		var dir = projectDir();
		return dir ? new File(dir, "libs/flow/drafts") : null;
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
		return node && (node.uid || node.id || node.name) ? String(node.uid || node.id || node.name) : "";
	}

	function nodeProps(node) {
		var props = {};
		var structural = {
			id: true, uid: true, block: true, type: true,
			props: true, nodes: true, "do": true, then: true, "else": true,
			disabled: true, __fragment: true, __graphBlock: true
		};
		if (node.props) {
			Object.keys(node.props).forEach(function (key) {
				props[key] = node.props[key];
			});
		}
		Object.keys(node).forEach(function (key) {
			if (!structural[key]) {
				props[key] = node[key];
			}
		});
		return props;
	}

	function isFlowNodeLike(value) {
		return value && typeof value === "object" && Object.prototype.toString.call(value) !== "[object Array]" &&
			(value.block !== undefined || value.id !== undefined || value.uid !== undefined || value.props !== undefined);
	}

	function canonicalFlowNode(node) {
		node = normalizeTree(node || {});
		if (node.props && typeof node.props === "object" && Object.prototype.toString.call(node.props) !== "[object Array]") {
			Object.keys(node.props).forEach(function (key) {
				if (node[key] === undefined) {
					node[key] = node.props[key];
				}
			});
			delete node.props;
		}
		Object.keys(node).forEach(function (key) {
			var value = node[key];
			if (Object.prototype.toString.call(value) === "[object Array]") {
				node[key] = value.map(function (item) {
					return isFlowNodeLike(item) ? canonicalFlowNode(item) : normalizeTree(item);
				});
			}
		});
		return node;
	}

	function canonicalFlowDefinition(definition) {
		var out = normalizeTree(definition || {});
		if (Object.prototype.toString.call(out.nodes) === "[object Array]") {
			out.nodes = out.nodes.map(function (node) {
				return canonicalFlowNode(node);
			});
		}
		return out;
	}

	function isScopePath(value) {
		if (typeof value !== "string" || value.trim() === "" || value.indexOf(" ") !== -1) {
			return false;
		}
		var dot = value.indexOf(".");
		var first = dot < 0 ? value : value.substring(0, dot);
		return scopeNames.indexOf(first) !== -1;
	}

	function readObjectPath(root, path) {
		if (path === undefined || path === null || path === "") {
			return root;
		}
		var parts = objectPathParts(path);
		var current = root;
		for (var i = 0; i < parts.length; i++) {
			if (current === null || current === undefined) {
				return undefined;
			}
			current = current[parts[i]];
		}
		return current;
	}

	function objectPathParts(path) {
		var parts = [];
		var text = String(path || "");
		var part = "";
		var i = 0;
		function pushPart() {
			if (part !== "") {
				parts.push(part);
				part = "";
			}
		}
		while (i < text.length) {
			var ch = text.charAt(i);
			if (ch === ".") {
				pushPart();
				i++;
				continue;
			}
			if (ch === "[") {
				pushPart();
				i++;
				while (i < text.length && /\s/.test(text.charAt(i))) {
					i++;
				}
				var bracket = "";
				ch = text.charAt(i);
				if (ch === "\"" || ch === "'") {
					var quote = ch;
					i++;
					while (i < text.length) {
						ch = text.charAt(i++);
						if (ch === quote) {
							break;
						}
						if (ch === "\\" && i < text.length) {
							bracket += text.charAt(i++);
						} else {
							bracket += ch;
						}
					}
				} else {
					while (i < text.length && text.charAt(i) !== "]") {
						bracket += text.charAt(i++);
					}
					bracket = String(bracket).trim();
				}
				while (i < text.length && text.charAt(i) !== "]") {
					i++;
				}
				if (text.charAt(i) === "]") {
					i++;
				}
				if (bracket !== "") {
					parts.push(bracket);
				}
				continue;
			}
			part += ch;
			i++;
		}
		pushPart();
		return parts;
	}

	function readScopePath(scopes, path) {
		if (!isScopePath(path)) {
			return undefined;
		}
		var parts = String(path).split(".");
		var current = scopes[parts[0]];
		for (var i = 1; i < parts.length; i++) {
			if (current === null || current === undefined) {
				return undefined;
			}
			current = current[parts[i]];
		}
		return current;
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
		value = jsValue(value);
		if (isRuntimeHandle(value)) {
			return runtimeHandleSummary(value);
		}
		if (value && Object.prototype.toString.call(value) === "[object Array]") {
			return value.map(function (item) {
				return normalizeTree(item);
			});
		}
		if (value && typeof value === "object") {
			var out = {};
			Object.keys(value).forEach(function (key) {
				out[key] = normalizeTree(value[key]);
			});
			return out;
		}
		return value;
	}

	function mergedContext(base, override) {
		var out = {};
		Object.keys(base || {}).forEach(function (key) {
			out[key] = base[key];
		});
		Object.keys(override || {}).forEach(function (key) {
			out[key] = override[key];
		});
		return out;
	}

	function joinPath(base, leaf) {
		base = String(base || "");
		leaf = String(leaf || "");
		if (base === "") {
			return leaf;
		}
		if (leaf === "") {
			return base;
		}
		return base + "." + leaf;
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

	function flowScriptPath(base, path) {
		var out = String(base || "");
		String(path || "").split(".").filter(function (part) {
			return part !== "";
		}).forEach(function (part) {
			out += /^[A-Za-z_$][\w$]*$/.test(part) ? "." + part : "[" + JSON.stringify(part) + "]";
		});
		return out;
	}

	function requestableFlowScriptHints(target, arrays, leaves, currentProject) {
		var publicTarget = requestableTargetPublic(target, currentProject);
		var requestable = publicTarget.localRequestable || publicTarget.requestable || publicTarget.qname || "";
		var hints = {
			call: "const data = requestable.call(" + JSON.stringify(requestable) + ");"
		};
		var arrayPath = (arrays || []).filter(function (path) {
			return String(path).indexOf(".attr") === -1;
		})[0] || (arrays || [])[0] || "";
		if (!arrayPath) {
			hints.returnObject = "return data;";
			return hints;
		}
		hints.array = "const items = " + flowScriptPath("data", arrayPath) + ";";
		var leaf = (leaves || []).filter(function (entry) {
			return String(entry.path).indexOf(arrayPath + ".") === 0 && /(^|\.)title$/.test(String(entry.path));
		})[0] || (leaves || []).filter(function (entry) {
			return String(entry.path).indexOf(arrayPath + ".") === 0 && ["name", "label"].some(function (suffix) {
				return new RegExp("(^|\\.)" + suffix + "$").test(String(entry.path));
			});
		})[0] || (leaves || []).filter(function (entry) {
			return String(entry.path).indexOf(arrayPath + ".") === 0 && entry.type === "string";
		})[0];
		if (leaf) {
			var relative = String(leaf.path).substring(arrayPath.length + 1);
			hints.sort = "const sorted = list.sort(items, { by: " + flowScriptPath("current", relative) + ", direction: \"asc\" });";
		}
		hints.returnObject = "return { items, count: items.length };";
		return hints;
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
		var parts = String(path || "").split(".");
		if (parts.length === 0 || scopeNames.indexOf(parts[0]) === -1) {
			raise("INVALID_SCOPE_PATH", "Invalid scope path: " + path);
		}
		if (parts[0] === "result") {
			assertNoRuntimeHandle(value, "result");
		}
		var current = scopes[parts[0]];
		for (var i = 1; i < parts.length - 1; i++) {
			var part = parts[i];
			if (current[part] === undefined || current[part] === null) {
				current[part] = {};
			}
			current = current[part];
		}
		current[parts[parts.length - 1]] = value;
		return value;
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

	function addConfigKey(keys, value) {
		if (typeof value !== "string") {
			return;
		}
		function addPath(path) {
			if (path.indexOf("config.") !== 0) {
				return;
			}
			var key = path.substring("config.".length).split(".")[0];
			if (key && keys.indexOf(key) === -1) {
				keys.push(key);
			}
		}
		value.replace(/\bconfig(?:\.[A-Za-z_$][A-Za-z0-9_$]*)+/g, function (path) {
			addPath(path);
			return path;
		});
		value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, function (_, path) {
			String(path).replace(/\bconfig(?:\.[A-Za-z_$][A-Za-z0-9_$]*)+/g, function (configPath) {
				addPath(configPath);
				return configPath;
			});
			return "";
		});
	}

	function addUnique(items, value) {
		if (typeof value === "string" && value !== "" && items.indexOf(value) === -1) {
			items.push(value);
		}
	}

	function collectScopeRefs(value, refs) {
		refs = refs || [];
		if (typeof value === "string") {
			if (isScopePath(value)) {
				addUnique(refs, value);
			}
			value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, function (_, path) {
				var ref = String(path).trim();
				if (isScopePath(ref)) {
					addUnique(refs, ref);
				}
				return "";
			});
		} else if (value && Object.prototype.toString.call(value) === "[object Array]") {
			value.forEach(function (item) {
				collectScopeRefs(item, refs);
			});
		} else if (value && typeof value === "object") {
			Object.keys(value).forEach(function (key) {
				collectScopeRefs(value[key], refs);
			});
		}
		return refs;
	}

	function collectExpressionRefs(value, refs) {
		refs = refs || [];
		if (typeof value === "string") {
			var scopePattern = scopeNames.join("|");
			var scopeRegExp = new RegExp("\\b(" + scopePattern + ")(?:\\.[A-Za-z_$][A-Za-z0-9_$]*)*", "g");
			value.replace(scopeRegExp, function (path) {
				if (isScopePath(path)) {
					addUnique(refs, path);
				}
				return path;
			});
		} else if (value && Object.prototype.toString.call(value) === "[object Array]") {
			value.forEach(function (item) {
				collectExpressionRefs(item, refs);
			});
		} else if (value && typeof value === "object") {
			Object.keys(value).forEach(function (key) {
				collectExpressionRefs(value[key], refs);
			});
		}
		return refs;
	}

	function collectTemplateRefs(value, refs) {
		refs = refs || [];
		if (typeof value === "string") {
			value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, function (_, expression) {
				collectExpressionRefs(String(expression).trim(), refs);
				return "";
			});
		} else if (value && Object.prototype.toString.call(value) === "[object Array]") {
			value.forEach(function (item) {
				collectTemplateRefs(item, refs);
			});
		} else if (value && typeof value === "object") {
			Object.keys(value).forEach(function (key) {
				collectTemplateRefs(value[key], refs);
			});
		}
		return refs;
	}

	function exactTemplateExpression(value) {
		if (typeof value !== "string") {
			return null;
		}
		var exact = value.match(/^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/);
		return exact ? exact[1] : null;
	}

	function collectConfigKeys(value, keys) {
		keys = keys || [];
		if (typeof value === "string") {
			addConfigKey(keys, value);
		} else if (value && Object.prototype.toString.call(value) === "[object Array]") {
			value.forEach(function (item) {
				collectConfigKeys(item, keys);
			});
		} else if (value && typeof value === "object") {
			Object.keys(value).forEach(function (key) {
				collectConfigKeys(value[key], keys);
			});
		}
		return keys;
	}

	function readGlobalValue(name) {
		if (!globalScope || name === undefined || name === null || name === "") {
			return undefined;
		}
		var value = globalScope[String(name)];
		return typeof value === "undefined" ? undefined : jsValue(value);
	}

	function projectEngineFile() {
		var dir = projectDir();
		return dir ? new File(dir, "libs/flow/engine.yaml") : null;
	}

	function loadProjectEngineDefinition() {
		var file = projectEngineFile();
		if (!file || !file.isFile()) {
			return {};
		}
		return parseYamlSource(FileUtils.readFileToString(file, "UTF-8"), "version: 1\n");
	}

	function effectiveConfig(request, definition, projectEngine) {
		var config = {};
		Object.keys(projectEngine && projectEngine.config || {}).forEach(function (key) {
			config[key] = normalizeTree(projectEngine.config[key]);
		});
		Object.keys(request.config || {}).forEach(function (key) {
			config[key] = normalizeTree(request.config[key]);
		});
		var keys = collectConfigKeys(definition);
		["bindings", "binding"].forEach(function (key) {
			if (keys.indexOf(key) === -1) {
				keys.push(key);
			}
		});
		keys.forEach(function (key) {
			if (config[key] !== undefined && config[key] !== null) {
				return;
			}
			var value = readGlobalValue(key);
			if (value !== undefined) {
				config[key] = value;
			}
		});
		return config;
	}

	function snapshot(value) {
		if (value === undefined || value === null) {
			return value;
		}
		try {
			return JSON.parse(JSON.stringify(sanitizeRuntimeValue(value)));
		} catch (e) {
			return String(value);
		}
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

	function cacheUtils() {
		if (cacheUtilsModule) {
			return cacheUtilsModule;
		}
		var file = engineModuleFile("cache-utils.js");
		if (!file.isFile()) {
			raise("MISSING_ENGINE_MODULE", "Flow engine module not found: " + file.getAbsolutePath());
		}
		var module = eval(String(FileUtils.readFileToString(file, "UTF-8")));
		if (!module || typeof module !== "object") {
			raise("INVALID_ENGINE_MODULE", "Invalid Flow engine module: " + file.getAbsolutePath(),
				null, "A Flow engine module must evaluate to an object.");
		}
		module.__flowFile = String(file.getAbsolutePath());
		cacheUtilsModule = module;
		return module;
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

	function clearRuntimeCache(cache) {
		cacheUtils().clearValue(cache);
	}

	function clearRuntimeMapCache(cache) {
		cacheUtils().clearMap(cache);
	}

	function clearRuntimeCaches() {
		clearRuntimeCache(runtimeState.caches.blocks);
		clearRuntimeCache(runtimeState.caches.types);
		clearRuntimeMapCache(runtimeState.caches.libraries);
		clearRuntimeMapCache(runtimeState.caches.engineModules);
		clearRuntimeCache(runtimeState.caches.propertyEditor);
		cacheUtilsModule = null;
		runtimeHandleUtilsModule = null;
		return cacheInfoRequest();
	}

	function cacheSummary(name, cache) {
		return cacheUtils().summary(name, cache);
	}

	function bridgeRuntimeCacheInfo() {
		var enabled = typeof __flowBridgeRuntimeCacheEnabled !== "undefined" && __flowBridgeRuntimeCacheEnabled === true;
		return {
			enabled: enabled,
			hit: typeof __flowBridgeRuntimeCacheHit !== "undefined" && __flowBridgeRuntimeCacheHit === true,
			key: typeof __flowBridgeRuntimeCacheKey !== "undefined" ? String(__flowBridgeRuntimeCacheKey) : "",
			generation: typeof __flowBridgeRuntimeCacheGeneration !== "undefined" ? Number(__flowBridgeRuntimeCacheGeneration) : 0,
			size: typeof __flowBridgeRuntimeCacheSize !== "undefined" ? Number(__flowBridgeRuntimeCacheSize) : 0,
			classSource: typeof __flowBridgeClassSource !== "undefined" ? String(__flowBridgeClassSource) : "",
			classResource: typeof __flowBridgeClassResource !== "undefined" ? String(__flowBridgeClassResource) : ""
		};
	}

	function cacheInfoRequest() {
		var activeProjectDir = projectDir();
		var activeProjectPath = activeProjectDir ? canonicalPath(activeProjectDir) : "";
		return {
			ok: true,
			runtimeId: runtimeState.id,
			startedAt: runtimeState.startedAt,
			threadName: String(Packages.java.lang.Thread.currentThread().getName()),
			activeProjectDir: activeProjectPath,
			rawProjectDir: activeProjectDir ? String(activeProjectDir) : "",
			engineDir: canonicalPath(engineDir()),
			bridgeRuntimeCache: bridgeRuntimeCacheInfo(),
			caches: {
				blocks: cacheSummary("blocks", runtimeState.caches.blocks),
				types: cacheSummary("types", runtimeState.caches.types),
				libraries: cacheSummary("libraries", runtimeState.caches.libraries),
				engineModules: cacheSummary("engineModules", runtimeState.caches.engineModules),
				propertyEditor: cacheSummary("propertyEditor", runtimeState.caches.propertyEditor)
			}
		};
	}

	function fileFingerprint(file) {
		if (!file) {
			return "null";
		}
		if (!file.exists()) {
			return "missing:" + canonicalPath(file);
		}
		return canonicalPath(file) + "#" + file.lastModified() + ":" + file.length();
	}

	function directoryFingerprint(dir) {
		if (!dir) {
			return "null";
		}
		if (!dir.exists()) {
			return "missing:" + canonicalPath(dir);
		}
		var root = canonicalPath(dir);
		var parts = [root];

		function walk(file, prefix) {
			var name = String(file.getName());
			var path = prefix ? prefix + "/" + name : name;
			if (file.isDirectory()) {
				parts.push("d:" + path + ":" + file.lastModified());
				var children = file.listFiles();
				if (!children) {
					return;
				}
				children = Arrays.asList(children).toArray();
				children.sort(function (a, b) {
					return String(a.getName()).localeCompare(String(b.getName()));
				});
				children.forEach(function (child) {
					walk(child, path);
				});
				return;
			}
			if (file.isFile()) {
				parts.push("f:" + path + ":" + file.lastModified() + ":" + file.length());
			}
		}

		var files = dir.listFiles();
		if (files) {
			files = Arrays.asList(files).toArray();
			files.sort(function (a, b) {
				return String(a.getName()).localeCompare(String(b.getName()));
			});
			files.forEach(function (file) {
				walk(file, "");
			});
		}
		return parts.join("|");
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

	function resourcePath(baseDir, path) {
		path = String(path || "").trim();
		if (path === "") {
			return "";
		}
		var file = new File(path);
		if (!file.isAbsolute()) {
			file = new File(baseDir, path);
		}
		return canonicalPath(file);
	}

	function blockFileName(name) {
		var blockName = blockLocalName(name);
		if (!blockName.match(/^[A-Za-z0-9_-]+$/)) {
			raise("INVALID_BLOCK_NAME", "Invalid Flow block name: " + name,
				null, "Use letters, digits, dot, underscore or dash.");
		}
		return blockName + ".js";
	}

	function blockDescriptorFileName(name) {
		var parts = blockIdParts(name);
		if (parts.length === 0) {
			raise("INVALID_BLOCK_NAME", "Invalid Flow block name: " + name,
				null, "Use letters, digits, dot, underscore or dash.");
		}
		var leaf = parts.pop();
		return (parts.length ? parts.join("/") + "/" : "") + leaf + ".block.yaml";
	}

	function blockCodeDescriptorFileName(name) {
		var parts = blockIdParts(name);
		if (parts.length === 0) {
			raise("INVALID_BLOCK_NAME", "Invalid Flow block name: " + name,
				null, "Use letters, digits, dot, underscore or dash.");
		}
		var leaf = parts.pop();
		return (parts.length ? parts.join("/") + "/" : "") + leaf + ".block.js";
	}

	function blockFlowFileName(name) {
		var blockName = blockLocalName(name);
		if (!blockName.match(/^[A-Za-z0-9_-]+$/)) {
			raise("INVALID_BLOCK_NAME", "Invalid Flow block name: " + name,
				null, "Use letters, digits, dot, underscore or dash.");
		}
		return blockName + ".flow.yaml";
	}

	function blockHooksFileName(name) {
		var blockName = blockLocalName(name);
		if (!blockName.match(/^[A-Za-z0-9_-]+$/)) {
			raise("INVALID_BLOCK_NAME", "Invalid Flow block name: " + name,
				null, "Use letters, digits, dot, underscore or dash.");
		}
		return blockName + ".hooks.js";
	}

	function typeDescriptorFileName(name) {
		var typeName = String(name || "").trim();
		if (!typeName.match(/^[A-Za-z0-9_.-]+$/)) {
			raise("INVALID_TYPE_NAME", "Invalid Flow property type name: " + name,
				null, "Use letters, digits, dot, underscore or dash.");
		}
		return typeName + ".type.yaml";
	}

	function flowFileName(name) {
		var flowName = String(name || "").trim();
		if (!flowName.match(/^[A-Za-z0-9_.-]+$/)) {
			raise("INVALID_FLOW_NAME", "Invalid Flow name: " + name,
				null, "Use letters, digits, dot, underscore or dash.");
		}
		return flowName + ".flow.yaml";
	}

	function flowCodeFileName(name) {
		var flowName = String(name || "").trim();
		if (!flowName.match(/^[A-Za-z0-9_.-]+$/)) {
			raise("INVALID_FLOW_NAME", "Invalid Flow name: " + name,
				null, "Use letters, digits, dot, underscore or dash.");
		}
		return flowName + ".flow.js";
	}

	function flowCodeFileFromYamlFile(file, name) {
		var path = String(file && file.getAbsolutePath ? file.getAbsolutePath() : file || "");
		if (path.endsWith(".flow.yaml")) {
			return new File(path.substring(0, path.length - ".flow.yaml".length) + ".flow.js");
		}
		if (file && file.getParentFile) {
			return new File(file.getParentFile(), flowCodeFileName(name));
		}
		return new File(flowCodeFileName(name));
	}

	function fragmentFileName(name) {
		var fragmentName = String(name || "").trim();
		if (!fragmentName.match(/^[A-Za-z0-9_.-]+$/)) {
			raise("INVALID_FRAGMENT_NAME", "Invalid Flow fragment name: " + name,
				null, "Use letters, digits, dot, underscore or dash.");
		}
		return fragmentName + ".fragment.yaml";
	}

	function safeFilePart(value) {
		return String(value || "").trim().replace(/[^A-Za-z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "");
	}

	function blockIdParts(name) {
		var text = String(name || "").trim();
		if (!text.match(/^[A-Za-z0-9_.-]+$/)) {
			return [];
		}
		return text.split(".").filter(function (part) {
			return part && part.match(/^[A-Za-z0-9_-]+$/);
		});
	}

	function blockLocalName(name) {
		var parts = blockIdParts(name);
		return parts.length ? parts[parts.length - 1] : "";
	}

	function blockNamespace(name) {
		var parts = blockIdParts(name);
		parts.pop();
		return parts.join(".");
	}

	function flowNameFor(request, definition) {
		request = request || {};
		definition = definition || {};
		var name = String(request.flowName || request.name || definition.name || "").trim();
		if (!name && request.flowQName) {
			var parts = String(request.flowQName).split(".");
			name = parts[parts.length - 1];
		}
		return safeFilePart(name);
	}

	function schemaNodeKey(node, outPath) {
		return safeFilePart(nodePath(node) || outPath || blockName(node));
	}

	function outputSchemaFile(request, definition, node, property, outPath) {
		var dir = projectSchemasDir();
		var flowName = flowNameFor(request, definition);
		var nodeKey = schemaNodeKey(node, outPath);
		if (!dir || !flowName || !nodeKey) {
			return null;
		}
		var flowDir = new File(dir, flowName);
		return new File(flowDir, nodeKey + "." + safeFilePart(property || "out") + ".schema.json");
	}

	function resultSchemaFile(request, definition) {
		var dir = projectSchemasDir();
		var flowName = flowNameFor(request, definition);
		if (!dir || !flowName) {
			return null;
		}
		return new File(new File(dir, flowName), "result.out.schema.json");
	}

	function readOutputSchema(request, definition, node, property, outPath) {
		var file = outputSchemaFile(request, definition, node, property, outPath);
		if (!file || !file.isFile()) {
			return null;
		}
		return JSON.parse(String(FileUtils.readFileToString(file, "UTF-8")));
	}

	function readResultSchema(request, definition) {
		var file = resultSchemaFile(request, definition);
		if (!file || !file.isFile()) {
			return null;
		}
		return JSON.parse(String(FileUtils.readFileToString(file, "UTF-8")));
	}

	function learnOutputSchema(request, definition, node, property, outPath, value) {
		var file = outputSchemaFile(request, definition, node, property, outPath);
		if (!file || file.isFile()) {
			return { learned: false, file: file ? String(file.getAbsolutePath()) : "" };
		}
		var schema = inferSchema(value);
		file.getParentFile().mkdirs();
		FileUtils.writeStringToFile(file, JSON.stringify(schema, null, 2), "UTF-8");
		return {
			learned: true,
			file: String(file.getAbsolutePath()),
			schema: schema
		};
	}

	function clearConvertigoSchemaCache(request) {
		try {
			var projectName = currentProjectName(request);
			if (projectName) {
				Packages.com.twinsoft.convertigo.engine.Engine.theApp.schemaManager.clearCache(projectName);
			}
		} catch (e) {
		}
	}

	function declaredOutputSchema(definition) {
		var schema = definition && (definition.output || definition.outputs);
		return schema && Object.keys(schema).length > 0 ? schema : null;
	}

	function declaredPropertyOutputSchema(catalog, property) {
		if (!catalog || !property) {
			return null;
		}
		var outputs = catalog.outputs || catalog.output || {};
		if (!outputs || typeof outputs !== "object") {
			return null;
		}
		var schema = outputs[property] || (property === "out" ? outputs : null);
		return schema && typeof schema === "object" ? normalizeTree(schema) : null;
	}

	function schemaSummary(schema) {
		schema = normalizeTree(schema);
		return {
			type: schemaSimpleType(schema),
			paths: schemaPaths(schema, "").slice(0, 20),
			arrayPaths: schemaArrayPaths(schema, "").slice(0, 20),
			leafPaths: schemaLeafEntries(schema, "").slice(0, 20)
		};
	}

	function learnResultSchema(request, definition, value) {
		if (declaredOutputSchema(definition)) {
			return { learned: false, declared: true };
		}
		var file = resultSchemaFile(request, definition);
		if (!file || file.isFile()) {
			return { learned: false, file: file ? String(file.getAbsolutePath()) : "" };
		}
		var schema = inferSchema(value);
		file.getParentFile().mkdirs();
		FileUtils.writeStringToFile(file, JSON.stringify(schema, null, 2), "UTF-8");
		clearConvertigoSchemaCache(request);
		return {
			learned: true,
			file: String(file.getAbsolutePath()),
			schema: schema
		};
	}

	function resetSchemaRequest(request) {
		request = request || {};
		var blocks = loadBlocks();
		var flowName = flowNameFor(request, {});
		var hasInlineSource = request.definition !== undefined && request.definition !== null ||
			request.flowSource !== undefined && request.flowSource !== null && String(request.flowSource).trim() !== "";
		var definition = {};
		try {
			definition = parseSource(sourceForFlowRequest(request, blocks));
			if (!flowName) {
				flowName = flowNameFor(request, definition);
			}
		} catch (e) {
			if (hasInlineSource || !flowName) {
				throw e;
			}
			definition = {
				name: flowName
			};
		}
		var dir = projectSchemasDir();
		if (!dir) {
			raise("FLOW_SCHEMA_UNAVAILABLE", "Flow schema storage is unavailable.",
				null, "Run through a Flow requestable or set __flowProjectDir in standalone tests.");
		}
		if (!flowName) {
			raise("FLOW_SCHEMA_FLOW_REQUIRED", "Flow schema reset requires a flow name.");
		}
		var nodeId = request.node || request.nodeId || request.id || "";
		if (nodeId) {
			var file = outputSchemaFile({
				flowName: flowName
			}, definition, {
				id: nodeId,
				block: request.block || ""
			}, request.property || "out", request.out || request.path || "");
			var deleted = file && file.isFile() ? file["delete"]() : false;
			return {
				ok: true,
				deleted: deleted,
				file: file ? String(file.getAbsolutePath()) : ""
			};
		}
		var flowDir = new File(dir, flowName);
		var existed = flowDir.isDirectory();
		if (existed) {
			FileUtils.deleteDirectory(flowDir);
		}
		return {
			ok: true,
			deleted: existed,
			dir: String(flowDir.getAbsolutePath())
		};
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

	function projectResourceFile(path, mustExist) {
		var base = projectDir();
		if (!base) {
			raise("PROJECT_RESOURCES_UNAVAILABLE", "Project Flow resources are unavailable.",
				null, "Run through a Flow requestable or set __flowProjectDir in standalone tests.");
		}
		var normalized = normalizeResourcePath(path);
		if (!isAllowedResourcePath(normalized)) {
			raise("RESOURCE_PATH_NOT_ALLOWED", "Flow resource path is not editable through this API: " + normalized,
				null, "Allowed paths: libs/flow/blocks/**/*.block.js, libs/flow/blocks/**/*.hooks.js, libs/flow/lib/**/*.js, libs/flow/resources/**/*.{md,txt,json,yaml,yml}, libs/flow/types/**/*.{type.yaml,js}, libs/flow/types/editors/**/*.{html,css,js}. Legacy block YAML paths are still accepted as fallback.");
		}
		var file = new File(base, normalized);
		var basePath = canonicalPath(base);
		var filePath = canonicalPath(file);
		if (filePath !== basePath && filePath.indexOf(basePath + File.separator) !== 0) {
			raise("RESOURCE_PATH_NOT_ALLOWED", "Flow resource path escapes the project: " + normalized);
		}
		if (mustExist && !file.isFile()) {
			raise("UNKNOWN_RESOURCE", "Unknown Flow resource: " + normalized);
		}
		return {
			path: normalized,
			file: file
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

	function collectResourceFiles(dir, base, out) {
		var listed = dir && dir.listFiles();
		if (!listed) {
			return;
		}
		var files = Arrays.asList(listed).toArray();
		files.sort(function (a, b) {
			return String(a.getName()).localeCompare(String(b.getName()));
		});
		files.forEach(function (file) {
			if (file.isDirectory()) {
				collectResourceFiles(file, base, out);
				return;
			}
			if (!file.isFile()) {
				return;
			}
			var path = resourceRelativePath(base, file);
			if (path && isAllowedResourcePath(path)) {
				out.push({
					path: path,
					file: file
				});
			}
		});
	}

	function projectResourceEntries() {
		var base = projectDir();
		if (!base || !base.isDirectory()) {
			return [];
		}
		var out = [];
		["libs/flow/blocks", "libs/flow/fragments", "libs/flow/lib", "libs/flow/resources", "libs/flow/types"].forEach(function (path) {
			collectResourceFiles(new File(base, path), base, out);
		});
		return out;
	}

	function projectResourceEntryForUri(uri) {
		var wanted = String(uri || "").trim();
		if (wanted === "") {
			raise("MISSING_RESOURCE_URI", "A Flow resource uri is required.");
		}
		var entries = projectResourceEntries();
		for (var i = 0; i < entries.length; i++) {
			if (resourceUri(entries[i].path) === wanted) {
				return entries[i];
			}
		}
		raise("UNKNOWN_RESOURCE", "Unknown Flow resource uri: " + wanted,
			null, wanted.indexOf("flow://guide/") === 0 || wanted.indexOf("flow://skills/") === 0
				? "Use MCP resources/read for Flow MCP guides and skills; use flow-resource-get for project-local source resources."
				: "Use flow-resource-search or flow-resource-list first, then flow-resource-get with the returned path or uri.");
	}

	function resourceSummary(entry, content) {
		content = content === undefined ? String(FileUtils.readFileToString(entry.file, "UTF-8")) : String(content);
		var summary = {
			path: entry.path,
			kind: resourceKind(entry.path),
			name: resourceName(entry.path),
			mimeType: resourceMimeType(entry.path),
			file: String(entry.file.getAbsolutePath()),
			size: Number(entry.file.length()),
			lastModified: Number(entry.file.lastModified()),
			hash: sha256Hex(content)
		};
		var uri = resourceUri(entry.path);
		if (uri) {
			summary.uri = uri;
			summary.name = firstMarkdownHeading(content, summary.name);
			summary.description = firstMarkdownParagraph(content);
		}
		return summary;
	}

	function resourceListSummary(entry, includeHash) {
		var summary = {
			path: entry.path,
			kind: resourceKind(entry.path),
			name: resourceName(entry.path),
			mimeType: resourceMimeType(entry.path),
			size: Number(entry.file.length()),
			lastModified: Number(entry.file.lastModified())
		};
		var uri = resourceUri(entry.path);
		if (uri) {
			summary.uri = uri;
		}
		if (includeHash === true || uri) {
			var content = String(FileUtils.readFileToString(entry.file, "UTF-8"));
			if (includeHash === true) {
				summary.hash = sha256Hex(content);
			}
			if (uri) {
				summary.name = firstMarkdownHeading(content, summary.name);
				summary.description = firstMarkdownParagraph(content);
			}
		}
		return summary;
	}

	function globPatterns(value, fallback) {
		return loadEngineModule("resource-utils.js").globPatterns(value, fallback);
	}

	function globMatches(path, patterns) {
		return loadEngineModule("resource-utils.js").globMatches(path, patterns);
	}

	function resourceListRequest(request) {
		request = request || {};
		var rootDir = String(request.rootDir || request.root || "").trim().replace(/\\/g, "/");
		var patterns = globPatterns(request.pattern || request.glob, rootDir ? "**/*" : "libs/flow/resources/**/*");
		if (rootDir) {
			rootDir = normalizeResourcePath(rootDir);
			patterns = patterns.map(function (pattern) {
				if (pattern.indexOf("libs/flow/") === 0) {
					return pattern;
				}
				return rootDir.replace(/\/+$/, "") + "/" + pattern.replace(/^\/+/, "");
			});
		}
		var kind = String(request.kind || "").trim();
		var query = String(request.query || request.q || "").trim().toLowerCase();
		var resources = [];
		projectResourceEntries().forEach(function (entry) {
			if (!globMatches(entry.path, patterns)) {
				return;
			}
			if (kind && resourceKind(entry.path) !== kind) {
				return;
			}
			var summary = resourceListSummary(entry, request.includeHash === true);
			if (query) {
				var haystack = [summary.path, summary.uri, summary.name, summary.description, summary.kind].join(" ").toLowerCase();
				if (haystack.indexOf(query) === -1) {
					return;
				}
			}
			resources.push(summary);
		});
		resources.sort(function (a, b) {
			return String(a.path).localeCompare(String(b.path));
		});
		var offset = request.cursor !== undefined && request.cursor !== null && String(request.cursor) !== ""
			? intOption(request.cursor, 0, 0)
			: intOption(request.skip || request.offset, 0, 0);
		var limit = intOption(request.limit, 100, 1, 500);
		var page = resources.slice(offset, offset + limit);
		var out = {
			ok: true,
			pattern: patterns,
			count: page.length,
			total: resources.length,
			resources: page,
			nextCursor: offset + limit < resources.length ? String(offset + limit) : null
		};
		if (request.doc !== false) {
			out.doc = "List project-local Flow resources using glob patterns such as libs/flow/resources/**/*.md.";
		}
		if (request.hints !== false) {
			out.hints = [
				"If you understood, call with hints=false.",
				"Use resource.get with uri or path to read one listed resource.",
				"Use pattern to stay narrow; repeated calls can also pass doc=false."
			];
		}
		return out;
	}

	function resourceSearchRequest(request) {
		request = request || {};
		var needle = searchNeedle(request);
		var maxFileBytes = intOption(request.maxFileBytes, 500000, 1000, 5000000);
		var matches = [];
		projectResourceEntries().forEach(function (entry) {
			if (entry.file.length() > maxFileBytes) {
				return;
			}
			var content = String(FileUtils.readFileToString(entry.file, "UTF-8"));
			var text = [entry.path, resourceKind(entry.path), resourceName(entry.path), content].join(" ");
			if (!searchMatches(text, needle)) {
				return;
			}
			matches.push(Object.assign(resourceSummary(entry, content), {
				snippet: searchSnippet(content || entry.path, needle),
				next: "flow-resource-get path=" + entry.path
			}));
		});
		var offset = intOption(request.cursor, 0, 0);
		var limit = intOption(request.limit, 50, 1, 500);
		var page = matches.slice(offset, offset + limit);
		var out = {
			ok: true,
			query: String(request.query || request.q || ""),
			count: page.length,
			total: matches.length,
			resources: page,
			nextCursor: offset + limit < matches.length ? String(offset + limit) : null
		};
		if (request.doc !== false) {
			out.doc = "Search project-local Flow text resources. Patch only these whitelisted files through flow-resource-patch.";
		}
		if (request.hints !== false) {
			out.hints = [
				"If you understood, call with hints=false.",
				"Use this for block/fragment/type/editor/library sources. Use flow-search for Flow graph nodes.",
				"Call flow-resource-get before patching; pass its hash as baseHash.",
				"Pass doc=false on repeated calls when the short tool contract is already known."
			];
		}
		return out;
	}

	function resourceGetRequest(request) {
		request = request || {};
		var entry = request.path !== undefined && request.path !== null && String(request.path).trim() !== ""
			? projectResourceFile(request.path, true)
			: projectResourceEntryForUri(request.uri);
		var maxBytes = intOption(request.maxBytes, 1000000, 1000, 5000000);
		if (entry.file.length() > maxBytes && request.allowLarge !== true) {
			raise("RESOURCE_TOO_LARGE", "Flow resource is too large to return: " + entry.path,
				null, "Pass a higher maxBytes or allowLarge=true if this file is intentionally large.");
		}
		var content = String(FileUtils.readFileToString(entry.file, "UTF-8"));
		return Object.assign({ ok: true, content: content }, resourceSummary(entry, content));
	}

	function applyUnifiedPatchText(content, patch) {
		return loadEngineModule("patch-utils.js").applyUnifiedPatchText(content, patch, { raise: raise });
	}

	function validateResourceContent(path, content) {
		var kind = resourceKind(path);
		if (kind === "block") {
			var descriptorFile = projectBlockDescriptorFileForResource(path);
			if (!descriptorFile || !descriptorFile.isFile()) {
				raise("BLOCK_DESCRIPTOR_REQUIRED", "Block implementation resources require a peer *.block.yaml descriptor: " + path,
					null, "Create or patch libs/flow/blocks/" + blockDescriptorFileName(blockIdFromResourcePath(path)) + " first.");
			}
			validateBlockImplementationSource(blockIdFromResourcePath(path), content);
		} else if (kind === "blockFlow") {
			var flowDescriptorFile = projectBlockDescriptorFileForResource(path);
			if (!flowDescriptorFile || !flowDescriptorFile.isFile()) {
				raise("BLOCK_DESCRIPTOR_REQUIRED", "Flow block implementation resources require a peer *.block.yaml descriptor: " + path,
					null, "Create or patch libs/flow/blocks/" + blockDescriptorFileName(blockIdFromResourcePath(path)) + " first.");
			}
			validateBlockFlowImplementationSource(blockIdFromResourcePath(path), content);
		} else if (kind === "blockHooks") {
			var hooksContractFile = projectBlockContractFileForResource(path);
			if (!hooksContractFile || !hooksContractFile.isFile()) {
				raise("BLOCK_DESCRIPTOR_REQUIRED", "Block hooks resources require a peer *.block.js source or legacy *.block.yaml descriptor: " + path,
					null, "Create or patch libs/flow/blocks/" + blockCodeDescriptorFileName(blockIdFromResourcePath(path)) + " first.");
			}
			validateBlockHooksSource(blockIdFromResourcePath(path), content);
		} else if (kind === "graphBlock") {
			validateGraphBlockSource(blockIdFromResourcePath(path), content);
		} else if (kind === "graphBlockCode") {
			compileProjectBlockCode(loadBlocks(), blockIdFromResourcePath(path), content);
		} else if (kind === "fragment") {
			parseYamlSource(content, "version: 1\nnodes: []\n");
		} else if (kind === "library") {
			var library = eval(String(content || ""));
			if (!library || typeof library !== "object") {
				raise("INVALID_LIBRARY", "Invalid Flow library resource: " + path,
					null, "A Flow library must evaluate to an object.");
			}
		} else if (kind === "typeDescriptor") {
			validateTypeDescriptorSource(resourceName(path), content);
		}
		return {
			ok: true,
			kind: kind
		};
	}

	function resourcePatchRequest(request) {
		request = request || {};
		var entry = projectResourceFile(request.path, true);
		var oldContent = String(FileUtils.readFileToString(entry.file, "UTF-8"));
		var oldHash = sha256Hex(oldContent);
		if (request.baseHash && String(request.baseHash) !== oldHash) {
			raise("RESOURCE_BASE_HASH_MISMATCH", "Flow resource changed since it was read: " + entry.path,
				null, "Read the resource again and patch from the new hash.");
		}
		var applied = applyUnifiedPatchText(oldContent, request.patch || request.unifiedDiff || request.diff || "");
		var validation = request.validate === false
			? { ok: true, skipped: true }
			: validateResourceContent(entry.path, applied.content);
		var newHash = sha256Hex(applied.content);
		if (request.dryRun !== true) {
			FileUtils.writeStringToFile(entry.file, applied.content, "UTF-8");
		}
		return Object.assign({
			ok: true,
			path: entry.path,
			dryRun: request.dryRun === true,
			hunks: applied.hunks,
			oldHash: oldHash,
			newHash: newHash,
			changed: oldHash !== newHash,
			validation: validation
		}, request.includeContent === true ? { content: applied.content } : {});
	}

	function flowProviderName(flowDir, fallback) {
		try {
			var dir = new File(flowDir);
			var project = dir.getParentFile() ? dir.getParentFile().getParentFile() : null;
			var name = project ? String(project.getName() || "") : "";
			return name || fallback || "unknown";
		} catch (e) {
			return fallback || "unknown";
		}
	}

	function flowProjectRootFromFlowDir(flowDir) {
		var dir = new File(flowDir);
		return dir.getParentFile() ? dir.getParentFile().getParentFile() : null;
	}

	function blockIdFromDescriptorFile(file, blocksDir) {
		var relative = resourceRelativePath(blocksDir, file);
		if (!relative || (!String(relative).endsWith(".block.yaml") && !String(relative).endsWith(".block.js"))) {
			return "";
		}
		relative = String(relative);
		relative = relative.endsWith(".block.yaml")
			? relative.substring(0, relative.length - ".block.yaml".length)
			: relative.substring(0, relative.length - ".block.js".length);
		return relative.replace(/\//g, ".");
	}

	function loadBlockDir(blocks, blocksDir, origin, provider) {
		var files = blocksDir.listFiles();
		if (!files) {
			return;
		}
		files = Arrays.asList(files).toArray();
		files.sort(function (a, b) {
			return String(a.getName()).localeCompare(String(b.getName()));
		});
		files.forEach(function (file) {
			if (file.isDirectory()) {
				loadBlockDir(blocks, file, origin, provider);
				return;
			}
			if (!file.isFile()) {
				return;
			}
			var base = origin === "core" ? new File(engineDir(), "blocks") : projectBlocksDir();
			if (String(file.getName()).endsWith(".block.js")) {
				loadFlowScriptBlockFile(blocks, file, origin, provider, base);
				return;
			}
			if (String(file.getName()).endsWith(".block.yaml")) {
				var peer = new File(String(file.getAbsolutePath()).substring(0,
					String(file.getAbsolutePath()).length - ".block.yaml".length) + ".block.js");
				if (peer.isFile()) {
					return;
				}
				loadGraphBlockFile(blocks, file, origin, provider, base);
			}
		});
	}

	function reserveBlockDir(blocks, blocksDir, origin, provider) {
		var files = blocksDir.listFiles();
		if (!files) {
			return;
		}
		files = Arrays.asList(files).toArray();
		files.sort(function (a, b) {
			return String(a.getName()).localeCompare(String(b.getName()));
		});
		files.forEach(function (file) {
			if (file.isDirectory()) {
				reserveBlockDir(blocks, file, origin, provider);
				return;
			}
			if (!file.isFile()) {
				return;
			}
			var base = origin === "core" ? new File(engineDir(), "blocks") : projectBlocksDir();
			if (String(file.getName()).endsWith(".block.js")) {
				reserveFlowScriptBlockFile(blocks, file, origin, provider, base);
				return;
			}
			if (String(file.getName()).endsWith(".block.yaml")) {
				var peer = new File(String(file.getAbsolutePath()).substring(0,
					String(file.getAbsolutePath()).length - ".block.yaml".length) + ".block.js");
				if (!peer.isFile()) {
					reserveGraphBlockFile(blocks, file, origin, provider, base);
				}
			}
		});
	}

	function blocksCacheKey() {
		var coreBlocksDir = new File(engineDir(), "blocks");
		var key = [
			"engine", canonicalPath(engineDir()),
			"core", directoryFingerprint(coreBlocksDir)
		];
		var localBlocksDir = projectBlocksDir();
		if (localBlocksDir && canonicalPath(localBlocksDir) !== canonicalPath(coreBlocksDir)) {
			key.push("project", canonicalPath(projectDir()), directoryFingerprint(localBlocksDir));
		}
		return key.join("\n");
	}

	function loadBlocksUncached() {
		var blocks = {};
		var coreBlocksDir = new File(engineDir(), "blocks");
		reserveBlockDir(blocks, coreBlocksDir, "core", flowProviderName(engineDir(), "lib_flow_engine"));
		loadBlockDir(blocks, coreBlocksDir, "core", flowProviderName(engineDir(), "lib_flow_engine"));
		var localBlocksDir = projectBlocksDir();
		if (localBlocksDir && canonicalPath(localBlocksDir) !== canonicalPath(coreBlocksDir)) {
			reserveBlockDir(blocks, localBlocksDir, "project",
				flowProviderName(new File(projectDir(), "libs/flow"), "project"));
			loadBlockDir(blocks, localBlocksDir, "project",
				flowProviderName(new File(projectDir(), "libs/flow"), "project"));
		}
		return blocks;
	}

	function loadBlocks() {
		var cache = runtimeState.caches.blocks;
		var key = blocksCacheKey();
		var cached = readRuntimeCache(cache, key);
		if (cached) {
			return cached;
		}
		return writeRuntimeCache(cache, key, loadBlocksUncached(), "blocks for " + (projectDir() ? canonicalPath(projectDir()) : "no project"));
	}

	function loadTypeDescriptorFile(types, file, origin) {
		var source = String(FileUtils.readFileToString(file, "UTF-8"));
		var type = validateTypeDescriptorSource(resourceName(file.getName()), source);
		if (types[type.name]) {
			raise("DUPLICATE_TYPE", "Duplicate Flow property type: " + type.name,
				null, "Rename the project type or remove the duplicate.");
		}
		type.__flowOrigin = origin;
		type.__flowFile = file.getAbsolutePath();
		types[type.name] = type;
		return type;
	}

	function loadTypeDir(types, typesDir, origin) {
		var files = typesDir && typesDir.listFiles();
		if (!files) {
			return;
		}
		files = Arrays.asList(files).toArray();
		files.sort(function (a, b) {
			return String(a.getName()).localeCompare(String(b.getName()));
		});
		files.forEach(function (file) {
			if (!file.isFile() || !String(file.getName()).endsWith(".type.yaml")) {
				return;
			}
			loadTypeDescriptorFile(types, file, origin);
		});
	}

	function typesCacheKey() {
		var coreTypesDir = new File(engineDir(), "types");
		var key = [
			"engine", canonicalPath(engineDir()),
			"core", directoryFingerprint(coreTypesDir)
		];
		var localTypesDir = projectTypesDir();
		if (localTypesDir && canonicalPath(localTypesDir) !== canonicalPath(coreTypesDir)) {
			key.push("project", canonicalPath(projectDir()), directoryFingerprint(localTypesDir));
		}
		return key.join("\n");
	}

	function loadTypesUncached() {
		var types = {};
		var coreTypesDir = new File(engineDir(), "types");
		loadTypeDir(types, coreTypesDir, "core");
		var localTypesDir = projectTypesDir();
		if (localTypesDir && canonicalPath(localTypesDir) !== canonicalPath(coreTypesDir)) {
			loadTypeDir(types, localTypesDir, "project");
		}
		return types;
	}

	function loadTypes() {
		var cache = runtimeState.caches.types;
		var key = typesCacheKey();
		var cached = readRuntimeCache(cache, key);
		if (cached) {
			return cached;
		}
		return writeRuntimeCache(cache, key, loadTypesUncached(), "types for " + (projectDir() ? canonicalPath(projectDir()) : "no project"));
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
		name = safeFilePart(name);
		if (!name) {
			raise("MISSING_LIBRARY_NAME", "Flow library name is required.");
		}
		var localDir = projectLibDir();
		if (localDir) {
			var localFile = new File(localDir, name + ".js");
			if (localFile.isFile()) {
				return localFile;
			}
		}
		var engineFile = new File(engineLibDir(), name + ".js");
		if (engineFile.isFile()) {
			return engineFile;
		}
		raise("UNKNOWN_LIBRARY", "Unknown Flow library: " + name,
			null, "Create libs/flow/lib/" + name + ".js in the project or engine.");
	}

	function collectFlowLibraries(out, dir, origin, provider) {
		var files = dir && dir.listFiles();
		if (!files) {
			return;
		}
		files = Arrays.asList(files).toArray();
		files.sort(function (a, b) {
			return String(a.getName()).localeCompare(String(b.getName()));
		});
		files.forEach(function (file) {
			if (!file.isFile() || !String(file.getName()).endsWith(".js")) {
				return;
			}
			var name = String(file.getName());
			name = name.substring(0, name.length - 3);
			out[name] = {
				name: name,
				provider: provider,
				origin: origin,
				file: String(file.getAbsolutePath()),
				description: "Flow JavaScript library loaded with ctx.lib(\"" + name + "\")."
			};
		});
	}

	function listFlowLibraries() {
		var libraries = {};
		collectFlowLibraries(libraries, engineLibDir(), "core", flowProviderName(engineDir(), "lib_flow_engine"));
		var localDir = projectLibDir();
		if (localDir && canonicalPath(localDir) !== canonicalPath(engineLibDir())) {
			collectFlowLibraries(libraries, localDir, "project",
				flowProviderName(new File(projectDir(), "libs/flow"), "project"));
		}
		return Object.keys(libraries).sort().map(function (name) {
			return libraries[name];
		});
	}

	function loadFlowLibrary(name) {
		var file = flowLibraryFile(name);
		var cache = runtimeState.caches.libraries;
		var key = canonicalPath(file);
		var fingerprint = fileFingerprint(file);
		var cached = readRuntimeMapCache(cache, key, fingerprint);
		if (cached) {
			return cached;
		}
		var source = String(FileUtils.readFileToString(file, "UTF-8"));
		var library = eval(source);
		if (!library || typeof library !== "object") {
			raise("INVALID_LIBRARY", "Invalid Flow library: " + file.getAbsolutePath(),
				null, "A Flow library must evaluate to an object.");
		}
		library.__flowFile = String(file.getAbsolutePath());
		return writeRuntimeMapCache(cache, key, fingerprint, library, "Flow JavaScript libraries");
	}

	function validateBlockImplementationSource(name, source) {
		var block = eval(String(source || ""));
		if (!block || typeof block.run !== "function") {
			raise("INVALID_BLOCK_IMPLEMENTATION", "Invalid block implementation: " + name,
				null, "A Rhino .block.js implementation must evaluate to an object with run(ctx, node).");
		}
		["catalog", "name", "private", "displayName", "analyze"].forEach(function (key) {
			if (block[key] !== undefined) {
				raise("INVALID_BLOCK_IMPLEMENTATION", "Rhino implementation must not define " + key + ": " + name,
					null, "Move static metadata to _meta in *.block.js and dynamic display/analyze code to hooks.file.");
			}
		});
		return block;
	}

	function rhinoImplementationWarnings(name, source) {
		var text = String(source || "");
		var warnings = [];
		function add(severity, code, message, hint) {
			warnings.push({
				severity: severity || "warning",
				code: code,
				block: String(name || ""),
				message: message,
				hint: hint
			});
		}
		if (/(?:java\.net\.URL|openConnection\s*\(|openStream\s*\(|URLConnection|HttpClient|setRequestProperty\s*\()/m.test(text)) {
			add("error", "RHINO_REIMPLEMENTS_HTTP",
				"Rhino implementation appears to perform HTTP directly.",
				"Use http.get/http.request in FlowScript and pass response.body or response.text to a small parser block.");
		}
		if (/(?:callSequence|callTransaction|executeSequence|executeTransaction)/m.test(text)) {
			add("error", "RHINO_REIMPLEMENTS_REQUESTABLE",
				"Rhino implementation appears to call Convertigo requestables directly.",
				"Use requestable.call in FlowScript so the requestable call stays visible in the graph.");
		}
		if (text.length > 3000 && /(?:for\s*\(|while\s*\(|\.sort\s*\(|\.map\s*\(|JSON\.parse|JSON\.stringify)/m.test(text)) {
			add("warning", "RHINO_BLOCK_MAY_BE_MONOLITHIC",
				"Large Rhino implementation contains algorithmic control flow or JSON/list processing.",
				"Keep only the missing low-level primitive in Rhino; compose fetch, loops, list transforms and response mapping with Flow blocks.");
		}
		return warnings;
	}

	function enforceRhinoImplementationPolicy(name, source) {
		var warnings = rhinoImplementationWarnings(name, source);
		for (var i = 0; i < warnings.length; i++) {
			var warning = warnings[i];
			if (warning.severity === "error") {
				raise(warning.code, warning.message, null, warning.hint);
			}
		}
		return warnings;
	}

	function validateBlockHooksSource(name, source) {
		var hooks = eval(String(source || ""));
		if (!hooks || typeof hooks !== "object") {
			raise("INVALID_BLOCK_HOOKS", "Invalid block hooks: " + name,
				null, "A hooks script must evaluate to an object, usually with displayName(node) and/or analyze(ctx, node).");
		}
		return hooks;
	}

	function normalizeGraphBlockProps(definition) {
		var props = definition.props || definition.properties || {};
		if (Object.prototype.toString.call(props) === "[object Array]") {
			var out = {};
			props.forEach(function (prop) {
				if (prop && prop.name) {
					var copy = normalizeTree(prop);
					delete copy.name;
					out[String(prop.name)] = copy;
				}
			});
			return out;
		}
		return normalizeTree(props || {});
	}

	function normalizeGraphBlockSlots(definition) {
		var slots = definition.slots || definition.children;
		if (!slots) {
			return [];
		}
		if (Object.prototype.toString.call(slots) === "[object Array]") {
			return slots.map(function (slot) {
				if (slot && typeof slot === "object") {
					return normalizeTree(slot);
				}
				return { name: String(slot), label: String(slot) };
			}).filter(function (slot) {
				return slot.name;
			});
		}
		if (typeof slots === "object") {
			return Object.keys(slots).map(function (name) {
				var slot = slots[name];
				if (slot && typeof slot === "object") {
					slot = normalizeTree(slot);
					if (!slot.name) {
						slot.name = name;
					}
					return slot;
				}
				return { name: name, label: String(slot || name) };
			});
		}
		return [];
	}

	function normalizeGraphBlockUses(definition) {
		var uses = definition.uses || definition.libraries || [];
		if (typeof uses === "string") {
			uses = uses.split(",");
		}
		if (typeof uses === "object" && Object.prototype.toString.call(uses) !== "[object Array]") {
			uses = Object.keys(uses).map(function (key) {
				var value = uses[key];
				if (value && typeof value === "object" && value.name) {
					return value.name;
				}
				return key;
			});
		}
		var out = [];
		(uses || []).forEach(function (use) {
			use = safeFilePart(use);
			if (use && out.indexOf(use) === -1) {
				out.push(use);
			}
		});
		return out;
	}

	function blockImplementation(definition) {
		var implementation = definition.implementation || {};
		if (typeof implementation === "string") {
			implementation = { runtime: implementation };
		}
		implementation = normalizeTree(implementation || {});
		var runtime = String(implementation.runtime || implementation.kind || "").trim();
		if (!runtime) {
			runtime = definition.nodes ? "flow" : "rhino";
		}
		implementation.runtime = runtime;
		return implementation;
	}

	function blockImplementationFile(definition, file, config) {
		config = config || blockImplementation(definition);
		var filename = String(config.file || config.source || "").trim();
		if (!filename) {
			raise("MISSING_BLOCK_IMPLEMENTATION", "Block \"" + definition.name + "\" needs an implementation file.",
				null, "Use implementation.file in the block YAML.");
		}
		var implementationFile = new File(filename);
		if (!implementationFile.isAbsolute()) {
			implementationFile = new File(file.getParentFile(), filename);
		}
		if (!implementationFile.isFile()) {
			raise("UNKNOWN_BLOCK_IMPLEMENTATION", "Unknown block implementation file: " + implementationFile.getAbsolutePath());
		}
		return implementationFile;
	}

	function loadBlockScript(file, label) {
		var source = String(FileUtils.readFileToString(file, "UTF-8"));
		var script = eval(source);
		if (!script || typeof script !== "object") {
			raise("INVALID_BLOCK_IMPLEMENTATION", "Invalid " + label + ": " + file.getAbsolutePath(),
				null, "The script must evaluate to an object.");
		}
		script.__flowFile = String(file.getAbsolutePath());
		return script;
	}

	function loadRhinoBlockImplementation(definition, file) {
		var implementation = blockImplementation(definition);
		if (definition.__rhinoCode !== undefined && definition.__rhinoCode !== null) {
			var inlineScript = validateBlockImplementationSource(definition.__flowBlockId || definition.name, definition.__rhinoCode);
			var inlineEntry = String(implementation.entry || "run");
			if (typeof inlineScript[inlineEntry] !== "function") {
				raise("INVALID_BLOCK_IMPLEMENTATION", "Inline block implementation has no " + inlineEntry + "(ctx, node): " + file.getAbsolutePath());
			}
			return {
				file: file,
				script: inlineScript,
				entry: inlineEntry,
				inline: true
			};
		}
		var scriptFile = blockImplementationFile(definition, file, implementation);
		var script = loadBlockScript(scriptFile, "block implementation");
		["catalog", "name", "private", "displayName", "analyze"].forEach(function (key) {
			if (script[key] !== undefined) {
				raise("INVALID_BLOCK_IMPLEMENTATION", "Block runtime implementation must not define " + key + ": " + scriptFile.getAbsolutePath(),
					null, "Move static metadata to _meta in *.block.js and dynamic display/analyze code to hooks.file.");
			}
		});
		var entry = String(implementation.entry || "run");
		if (typeof script[entry] !== "function") {
			raise("INVALID_BLOCK_IMPLEMENTATION", "Block implementation has no " + entry + "(ctx, node): " + scriptFile.getAbsolutePath());
		}
		return {
			file: scriptFile,
			script: script,
			entry: entry
		};
	}

	function validateBlockFlowImplementationDefinition(name, definition) {
		definition = normalizeTree(definition || {});
		if (!definition.version) {
			definition.version = 1;
		}
		if (!definition.nodes) {
			definition.nodes = [];
		}
		if (Object.prototype.toString.call(definition.nodes) !== "[object Array]") {
			raise("INVALID_BLOCK_IMPLEMENTATION", "Flow block implementation \"" + name + "\" must define a nodes array.");
		}
		return definition;
	}

	function validateBlockFlowImplementationSource(name, source) {
		return validateBlockFlowImplementationDefinition(name, parseYamlSource(source, "version: 1\nnodes: []\n"));
	}

	function loadFlowBlockImplementation(definition, file) {
		var implementation = blockImplementation(definition);
		var flowFile = blockImplementationFile(definition, file, implementation);
		var source = String(FileUtils.readFileToString(flowFile, "UTF-8"));
		return {
			file: flowFile,
			definition: validateBlockFlowImplementationSource(definition.name, source)
		};
	}

	function loadBlockHooks(definition, file) {
		var hooks = definition.hooks;
		if (!hooks) {
			return {};
		}
		if (typeof hooks === "string") {
			hooks = { file: hooks };
		}
		hooks = normalizeTree(hooks);
		if (!hooks.file) {
			return hooks;
		}
		var hookFile = blockImplementationFile(definition, file, hooks);
		var script = loadBlockScript(hookFile, "block hooks");
		Object.keys(hooks).forEach(function (key) {
			if (key !== "file" && script[key] === undefined) {
				script[key] = hooks[key];
			}
		});
		return script;
	}

	function graphBlockCatalog(definition) {
		var props = normalizeGraphBlockProps(definition);
		var slots = normalizeGraphBlockSlots(definition);
		var uses = normalizeGraphBlockUses(definition);
		var implementation = blockImplementation(definition);
		var blockId = String(definition.__flowBlockId || definition.blockId || definition.name || "");
		var namespace = blockNamespace(blockId);
		var localName = blockLocalName(blockId);
		var descriptor = {
			blockId: blockId,
			name: localName || blockId,
			localName: localName || blockId,
			namespace: namespace,
			icon: definition.icon || "mdi:puzzle-outline",
			tags: definition.tags || (definition.kind ? [String(definition.kind)] : []),
			implementation: implementation.runtime,
			runtime: implementation.runtime,
			props: props,
			outputs: normalizeTree(definition.outputs || definition.output || {}),
			description: definition.description || "Composite Flow block implemented with child nodes.",
			longDescription: definition.longDescription || definition.documentation || ""
		};
		if (implementation.file) {
			descriptor.implementationFile = implementation.file;
		}
		if (slots.length > 0) {
			descriptor.slots = slots;
		}
		if (uses.length > 0) {
			descriptor.uses = uses;
		}
		["private", "label", "display", "hooks"].forEach(function (key) {
			if (definition[key] !== undefined) {
				descriptor[key] = definition[key];
			}
		});
		return descriptor;
	}

	function validateGraphBlockDefinition(name, definition) {
		definition = normalizeTree(definition || {});
		name = String(name || "");
		if (!name) {
			raise("INVALID_GRAPH_BLOCK", "Composite block name is required.");
		}
		if (definition.name && String(definition.name) !== name && String(definition.name) !== blockLocalName(name)) {
			raise("BLOCK_NAME_MISMATCH", "Composite block source declares \"" + definition.name + "\" instead of \"" + name + "\".");
		}
		definition.__flowBlockId = name;
		definition.name = blockLocalName(name) || name;
		definition.namespace = blockNamespace(name);
		var implementation = blockImplementation(definition);
		if (implementation.runtime === "flow" && definition.nodes !== undefined) {
			raise("INVALID_GRAPH_BLOCK", "Flow block \"" + name + "\" must move nodes to implementation.file.",
				null, "Use canonical *.block.js with _meta plus a FlowScript function for editable Flow block source.");
		}
		if (implementation.runtime === "flow" && !implementation.file && !definition.__graphDefinition) {
			raise("INVALID_GRAPH_BLOCK", "Flow block \"" + name + "\" must define implementation.file.");
		}
		if (implementation.runtime === "rhino" && !implementation.file && definition.__rhinoCode === undefined) {
			raise("INVALID_GRAPH_BLOCK", "Rhino block \"" + name + "\" must define implementation.file.");
		}
		normalizeGraphBlockProps(definition);
		return definition;
	}

	function validateGraphBlockSource(name, source) {
		return validateGraphBlockDefinition(name, parseYamlSource(source, "version: 1\nnodes: []\n"));
	}

	function graphBlockDefinitionForWrite(definition) {
		var out = normalizeTree(definition || {});
		delete out.__flowBlockId;
		delete out.blockId;
		delete out.localName;
		delete out.provider;
		delete out.namespace;
		delete out.__rhinoCode;
		delete out.__flowCode;
		delete out.__graphDefinition;
		delete out["package"];
		if (out.kind !== undefined) {
			if (out.tags === undefined || out.tags === null) {
				out.tags = [String(out.kind)];
			}
			delete out.kind;
		}
		if (out.name !== undefined && out.name !== null && String(out.name) !== "") {
			delete out.name;
		}
		return out;
	}

	function graphBlockDisplayName(definition, node) {
		var props = nodeProps(node);
		var display = definition.displayName || definition.display || "";
		if (display) {
			return summaryText(renderTemplateTree({
				scopes: {
					request: {},
					input: props,
					config: {},
					result: {},
					trace: {},
					current: null,
					local: {}
				},
				read: function (path) {
					return readScopePath(this.scopes, path);
				}
			}, display));
		}
		return props.out ? definition.name + " -> " + props.out : definition.name;
	}

	function resolveGraphBlockProp(ctx, descriptor, value) {
		descriptor = descriptor || {};
		var kind = descriptor.kind || descriptor.type || "";
		var mode = descriptor.mode || "";
		if (value === undefined && descriptor["default"] !== undefined) {
			value = descriptor["default"];
		}
		if (kind === "expression") {
			return ctx.expr(value);
		}
		if (kind === "template") {
			return ctx.template(value);
		}
		if (kind === "literal" || kind === "text" || kind === "schema" || kind === "secret") {
			return ctx.literal(value);
		}
		if (kind === "path" && mode === "write") {
			return value;
		}
		if (kind === "value" || kind === "") {
			return ctx.template(ctx.literal(value));
		}
		return ctx.template(ctx.literal(value));
	}

	function resolveGraphBlockProps(ctx, node, catalog) {
		var raw = nodeProps(node);
		var descriptors = catalog.props || {};
		var props = {};
		Object.keys(descriptors).forEach(function (key) {
			props[key] = resolveGraphBlockProp(ctx, descriptors[key], raw[key]);
		});
		Object.keys(raw).forEach(function (key) {
			if (props[key] === undefined) {
				props[key] = raw[key];
			}
		});
		return props;
	}

	function runGraphBlock(ctx, node, block) {
		var catalog = blockCatalog(block);
		var graphName = String(block && block.name || blockName(node) || "");
		ctx.graphBlockStack = ctx.graphBlockStack || [];
		var maxDepth = Number(ctx.maxGraphBlockDepth || 128);
		if (ctx.graphBlockStack.length >= maxDepth) {
			var stack = ctx.graphBlockStack.concat([graphName]);
			raise("FLOW_GRAPH_BLOCK_DEPTH_LIMIT",
				"Composite Flow block call depth exceeded " + maxDepth + " calls: " + graphBlockStackLabel(stack),
				node,
				"Make the recursion converge, lower the input size, or raise maxGraphBlockDepth for this run.");
		}
		var previousInput = ctx.scopes.input;
		var previousProps = ctx.scopes.props;
		var previousLocal = ctx.scopes.local;
		var previousCurrent = ctx.scopes.current;
		var previousReturned = ctx.returned;
		var previousStopped = ctx.stopped;
		if (graphName) {
			ctx.graphBlockStack.push(graphName);
		}
		ctx.scopes.props = resolveGraphBlockProps(ctx, node, catalog);
		ctx.scopes.input = ctx.scopes.props;
		ctx.scopes.local = {};
		ctx.returned = undefined;
		ctx.stopped = false;
		try {
			var result = ctx.runNodes(block.__graphDefinition.nodes || []);
			if (ctx.returned !== undefined) {
				result = ctx.returned;
			}
			return result;
		} finally {
			ctx.scopes.input = previousInput;
			ctx.scopes.props = previousProps;
			ctx.scopes.local = previousLocal;
			ctx.scopes.current = previousCurrent;
			ctx.returned = previousReturned;
			ctx.stopped = previousStopped;
			if (graphName) {
				ctx.graphBlockStack.pop();
			}
		}
	}

	function analyzeGraphBlockDescriptor(ctx, node, catalog) {
		var raw = nodeProps(node);
		Object.keys(catalog.props || {}).forEach(function (key) {
			var descriptor = catalog.props[key] || {};
			var kind = String(descriptor.kind || descriptor.type || "");
			var mode = String(descriptor.mode || "");
			if (kind === "path" && mode === "write") {
				var value = raw[key] !== undefined ? raw[key] : descriptor["default"];
				if (value !== undefined && value !== null && String(value) !== "") {
					ctx.addPath(String(value));
				}
			}
		});
	}

	function graphBlockFromDefinition(definition, file, origin, provider) {
		var catalog = graphBlockCatalog(definition);
		var implementation = blockImplementation(definition);
		var runtime = implementation.runtime;
		var blockId = String(definition.__flowBlockId || definition.blockId || definition.name || "");
		var rhino = runtime === "rhino" ? loadRhinoBlockImplementation(definition, file) : null;
		var flow = runtime === "flow" ? (definition.__graphDefinition ? {
			definition: definition.__graphDefinition,
			file: file
		} : loadFlowBlockImplementation(definition, file)) : null;
		var hooks = loadBlockHooks(definition, file);
		var block = {
			name: blockId,
			"private": definition["private"] === true,
			__blockDefinition: definition,
			__blockImplementationRuntime: runtime,
			catalog: function () {
				return normalizeTree(catalog);
			},
			displayName: function (node) {
				if (typeof hooks.displayName === "function") {
					return hooks.displayName(node);
				}
				return graphBlockDisplayName(definition, node);
			},
			analyze: function (ctx, node) {
				if (typeof hooks.analyze === "function") {
					return hooks.analyze(ctx, node);
				}
				analyzeGraphBlockDescriptor(ctx, node, catalog);
				if (runtime === "flow" && ctx.withGraphBlock) {
					ctx.withGraphBlock(node, block, function () {
						ctx.visitNodes(block.__graphDefinition.nodes || []);
					});
				} else if (runtime === "flow") {
					ctx.visitNodes(block.__graphDefinition.nodes || []);
				}
			},
			run: function (ctx, node) {
				if (rhino) {
					return rhino.script[rhino.entry](ctx, node);
				}
				return runGraphBlock(ctx, node, block);
			}
		};
		if (flow) {
			block.__graphDefinition = flow.definition;
		}
		block.__flowOrigin = origin;
		block.__flowProvider = provider || origin || "unknown";
		block.__flowFile = String(file.getAbsolutePath());
		block.__flowFormat = definition.__flowCode ? "flowscript-block" : "yaml-block";
		if (definition.__flowCode) {
			block.__flowCode = String(definition.__flowCode);
		}
		if (rhino) {
			if (rhino.inline) {
				block.__rhinoCode = String(definition.__rhinoCode || "");
				block.__flowImplementationFile = "";
			} else {
				block.__flowImplementationFile = String(rhino.file.getAbsolutePath());
			}
		} else if (flow) {
			block.__flowImplementationFile = definition.__flowCode ? "" : String(flow.file.getAbsolutePath());
		}
		if (hooks.__flowFile) {
			block.__flowHooksFile = String(hooks.__flowFile);
		}
		return block;
	}

	function loadGraphBlockFile(blocks, file, origin, provider, blocksDir) {
		var source = String(FileUtils.readFileToString(file, "UTF-8"));
		var name = blockIdFromDescriptorFile(file, blocksDir || file.getParentFile());
		if (!name) {
			name = String(file.getName());
			name = name.substring(0, name.length - ".block.yaml".length);
		}
		var definition = validateGraphBlockSource(name, source);
		var block = graphBlockFromDefinition(definition, file, origin, provider);
		if (blocks[block.name] && blocks[block.name].__flowScriptPlaceholder !== true) {
			raise("DUPLICATE_BLOCK", "Duplicate Flow block: " + block.name,
				null, "Rename the project block or remove the duplicate.");
		}
		blocks[block.name] = block;
		return block;
	}

	function balancedObjectEnd(text, open) {
		var quote = "";
		var brace = 0;
		for (var i = open; i < text.length; i++) {
			var ch = text.charAt(i);
			if (quote) {
				if (ch === "\\" && i + 1 < text.length) {
					i++;
					continue;
				}
				if (ch === quote) {
					quote = "";
				}
				continue;
			}
			if (ch === "\"" || ch === "'" || ch === "`") {
				quote = ch;
				continue;
			}
			if (ch === "{") {
				brace++;
			} else if (ch === "}") {
				brace--;
				if (brace === 0) {
					return i;
				}
			}
		}
		return -1;
	}

	function extractFlowScriptBlockMeta(code) {
		var text = String(code || "");
		var match = text.match(/\b(?:const|let|var)\s+_meta\s*=/);
		if (!match) {
			return { meta: {}, code: text };
		}
		var start = text.indexOf("{", match.index);
		if (start < 0) {
			raise("INVALID_BLOCK_CODE", "FlowScript block _meta must be an object literal.");
		}
		var end = balancedObjectEnd(text, start);
		if (end < 0) {
			raise("INVALID_BLOCK_CODE", "Unclosed FlowScript block _meta object literal.");
		}
		var metaText = text.substring(start, end + 1);
		var rest = text.substring(0, match.index) + text.substring(end + 1).replace(/^\s*;\s*/, "");
		return {
			meta: parseFlowScriptObjectLiteral(metaText, 1).value,
			code: rest
		};
	}

	function unwrapFlowScriptBlockEnvelope(code) {
		var text = String(code || "").trim();
		var header = text.match(/^block\s+[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*\([^)]*\)\s*\{/);
		if (!header) {
			return text;
		}
		var open = header[0].length - 1;
		var close = text.lastIndexOf("}");
		if (close <= open) {
			return text;
		}
		return text.substring(open + 1, close).trim();
	}

	function flowScriptBlockFunctionName(name) {
		return safeIdentifier(blockLocalName(name) || name || "block");
	}

	function normalizeFlowScriptFunctionSyntax(code) {
		return String(code || "").replace(/(^|\n)(\s*)(?:export\s+(?:default\s+)?)?(?:(?:public|private)\s+)?(?:async\s+)?(flow|function)\s+/g, "$1$2$3 ");
	}

	function blockCodeRuntimeFromMeta(meta) {
		meta = normalizeTree(meta || {});
		var implementation = normalizeTree(meta.implementation || {});
		return String(meta.runtime || meta.implementationRuntime || implementation.runtime || implementation.kind || "flow").trim() || "flow";
	}

	function ensureFlowScriptBlockFunction(name, code) {
		var body = normalizeFlowScriptFunctionSyntax(unwrapFlowScriptBlockEnvelope(code));
		if (String(body).trim().match(/^(?:flow|function)\s+/)) {
			return normalizeFlowScriptCode(body);
		}
		var indent = String(body || "").replace(/\s+$/g, "").split(/\r?\n/).map(function (line) {
			return line ? "  " + line : "";
		}).join("\n");
		return normalizeFlowScriptCode("function " + flowScriptBlockFunctionName(name) + "({ input, config, result }) {\n" +
			indent + "\n}\n");
	}

	function flowScriptBlockDescriptorFromMeta(name, meta, graphDefinition, code) {
		meta = normalizeTree(meta || {});
		if (meta.name && String(meta.name) !== String(name) && String(meta.name) !== blockLocalName(name)) {
			raise("BLOCK_NAME_MISMATCH", "FlowScript block _meta declares \"" + meta.name + "\" instead of \"" + name + "\".");
		}
		var runtime = blockCodeRuntimeFromMeta(meta);
		var implementation = normalizeTree(meta.implementation || {});
		implementation.runtime = runtime;
		delete implementation.file;
		var descriptor = {
			version: Number(meta.version || 1),
			name: blockLocalName(name) || name,
			icon: meta.icon || "mdi:puzzle-outline",
			description: meta.description || "Project FlowScript block.",
			props: meta.properties || meta.props || {},
			outputs: meta.outputs || meta.output || { out: { type: "unknown" } },
			implementation: implementation,
			__flowBlockId: String(name)
		};
		if (runtime === "flow") {
			descriptor.__graphDefinition = graphDefinition;
			descriptor.__flowCode = String(code || "");
		} else if (runtime === "rhino") {
			descriptor.__rhinoCode = String(graphDefinition || "");
			descriptor.__flowCode = String(code || "");
		} else {
			raise("INVALID_BLOCK_RUNTIME", "Unsupported .block.js runtime: " + runtime,
				null, "Use runtime: \"flow\" or runtime: \"rhino\" in _meta.");
		}
		["private", "tags", "label", "display", "longDescription", "documentation", "slots", "uses", "hooks"].forEach(function (key) {
			if (meta[key] !== undefined) {
				descriptor[key] = meta[key];
			}
		});
		return validateGraphBlockDefinition(name, descriptor);
	}

	function flowScriptBlockMetaFromRequest(name, request) {
		request = request || {};
		var descriptor = {};
		if (request.descriptorSource !== undefined && request.descriptorSource !== null) {
			descriptor = parseYamlSource(String(request.descriptorSource), "version: 1\n");
		} else if (request.descriptor !== undefined && request.descriptor !== null) {
			descriptor = normalizeTree(request.descriptor);
		} else if (request.definition !== undefined && request.definition !== null) {
			descriptor = normalizeTree(request.definition);
		}
		var meta = {};
		["version", "description", "icon", "private", "tags", "label", "display", "longDescription", "documentation", "slots", "uses", "hooks"].forEach(function (key) {
			if (descriptor[key] !== undefined) {
				meta[key] = descriptor[key];
			}
			if (request[key] !== undefined && request[key] !== null && request[key] !== "") {
				meta[key] = request[key];
			}
		});
		if (descriptor.props !== undefined) {
			meta.properties = descriptor.props;
		}
		if (descriptor.properties !== undefined) {
			meta.properties = descriptor.properties;
		}
		if (request.props !== undefined && request.props !== null) {
			meta.properties = request.props;
		}
		if (request.properties !== undefined && request.properties !== null) {
			meta.properties = request.properties;
		}
		if (descriptor.output !== undefined) {
			meta.outputs = descriptor.output;
		}
		if (descriptor.outputs !== undefined) {
			meta.outputs = descriptor.outputs;
		}
		if (request.output !== undefined && request.output !== null) {
			meta.outputs = request.output;
		}
		if (request.outputs !== undefined && request.outputs !== null) {
			meta.outputs = request.outputs;
		}
		return normalizeTree(meta);
	}

	function compileFlowScriptBlockCode(blocks, name, code, request) {
		var extracted = extractFlowScriptBlockMeta(code);
		var functionCode = ensureFlowScriptBlockFunction(name, extracted.code);
		var meta = Object.assign({}, flowScriptBlockMetaFromRequest(name, request), normalizeTree(extracted.meta || {}));
		var provisional = flowScriptBlockDescriptorFromMeta(name, meta, { version: 1, nodes: [] }, functionCode);
		var validationBlocks = Object.assign({}, blocks || {});
		validationBlocks[name] = {
			name: String(name),
			catalog: function () {
				return graphBlockCatalog(provisional);
			}
		};
		var validation = flowScriptValidateRequest(validationBlocks, {
			name: blockLocalName(name) || name,
			code: functionCode,
			includeHeader: false
		});
		if (!validation.ok) {
			var error = new Error("FlowScript block validation failed: " + name);
			error.code = "FLOWSCRIPT_BLOCK_VALIDATION_FAILED";
			error.details = validation.diagnostics;
			error.hint = "Fix the FlowScript block diagnostics and retry.";
			throw error;
		}
		var canonicalCode = flowScriptBlockCodeSource(name, functionCode, meta);
		var descriptor = flowScriptBlockDescriptorFromMeta(name, meta, validation.definition, canonicalCode);
		return {
			name: String(name),
			code: canonicalCode,
			functionCode: functionCode,
			revision: sha256Hex(canonicalCode),
			descriptor: descriptor,
			source: validation.source,
			definition: validation.definition,
			diagnostics: validation.diagnostics
		};
	}

	function flowScriptBlockCodeSource(name, functionCode, meta) {
		meta = normalizeTree(meta || {});
		if (!meta.description) {
			meta.description = "Project FlowScript block.";
		}
		if (!meta.icon) {
			meta.icon = "mdi:puzzle-outline";
		}
		if (!meta.properties && !meta.props) {
			meta.properties = {};
		}
		if (!meta.outputs && !meta.output) {
			meta.outputs = { out: { type: "unknown" } };
		}
		delete meta.name;
		return "const _meta = " + JSON.stringify(meta, null, 2) + "\n\n" + normalizeFlowScriptCode(functionCode);
	}

	function rhinoBlockCodeSource(name, source, meta) {
		meta = normalizeTree(meta || {});
		meta.runtime = "rhino";
		if (!meta.description) {
			meta.description = "Project Rhino block.";
		}
		if (!meta.icon) {
			meta.icon = "mdi:language-javascript";
		}
		if (!meta.properties && !meta.props) {
			meta.properties = {};
		}
		if (!meta.outputs && !meta.output) {
			meta.outputs = { out: { type: "unknown" } };
		}
		delete meta.name;
		return "const _meta = " + JSON.stringify(meta, null, 2) + "\n\n" + String(source || "").trim() + "\n";
	}

	function compileRhinoBlockCode(name, code, request) {
		var extracted = extractFlowScriptBlockMeta(code);
		var source = String(extracted.code || "").trim();
		var meta = Object.assign({}, flowScriptBlockMetaFromRequest(name, request), normalizeTree(extracted.meta || {}));
		meta.runtime = "rhino";
		var block = validateBlockImplementationSource(name, source);
		var warnings = request && request.allowPrimitiveRhino === true
			? rhinoImplementationWarnings(name, source)
			: enforceRhinoImplementationPolicy(name, source);
		var canonicalCode = rhinoBlockCodeSource(name, source, meta);
		var descriptor = flowScriptBlockDescriptorFromMeta(name, meta, source, canonicalCode);
		return {
			name: String(name),
			code: canonicalCode,
			functionCode: source,
			revision: sha256Hex(canonicalCode),
			descriptor: descriptor,
			source: source,
			definition: null,
			diagnostics: [],
			warnings: warnings,
			block: block,
			runtime: "rhino"
		};
	}

	function compileProjectBlockCode(blocks, name, code, request) {
		var extracted = extractFlowScriptBlockMeta(code);
		var meta = Object.assign({}, flowScriptBlockMetaFromRequest(name, request), normalizeTree(extracted.meta || {}));
		if (blockCodeRuntimeFromMeta(meta) === "rhino") {
			return compileRhinoBlockCode(name, code, request);
		}
		return compileFlowScriptBlockCode(blocks, name, code, request);
	}

	function loadFlowScriptBlockFile(blocks, file, origin, provider, blocksDir) {
		var code = String(FileUtils.readFileToString(file, "UTF-8"));
		var name = blockIdFromDescriptorFile(file, blocksDir || file.getParentFile());
		if (!name) {
			name = String(file.getName());
			name = name.substring(0, name.length - ".block.js".length);
		}
		var compiled = compileProjectBlockCode(blocks, name, code, {
			allowPrimitiveRhino: origin !== "project"
		});
		var block = graphBlockFromDefinition(compiled.descriptor, file, origin, provider);
		if (blocks[block.name] && blocks[block.name].__flowScriptPlaceholder !== true) {
			raise("DUPLICATE_BLOCK", "Duplicate Flow block: " + block.name,
				null, "Rename the project block or remove the duplicate.");
		}
		blocks[block.name] = block;
		return block;
	}

	function reserveFlowScriptBlockFile(blocks, file, origin, provider, blocksDir) {
		var code = String(FileUtils.readFileToString(file, "UTF-8"));
		var name = blockIdFromDescriptorFile(file, blocksDir || file.getParentFile());
		if (!name) {
			name = String(file.getName());
			name = name.substring(0, name.length - ".block.js".length);
		}
		if (blocks[name] && blocks[name].__flowScriptPlaceholder !== true) {
			raise("DUPLICATE_BLOCK", "Duplicate Flow block: " + name,
				null, "Rename the project block or remove the duplicate.");
		}
		var extracted = extractFlowScriptBlockMeta(code);
		var meta = Object.assign({}, flowScriptBlockMetaFromRequest(name, {}), normalizeTree(extracted.meta || {}));
		var runtime = blockCodeRuntimeFromMeta(meta);
		var descriptor = runtime === "rhino"
			? flowScriptBlockDescriptorFromMeta(name, meta, "", code)
			: flowScriptBlockDescriptorFromMeta(name, meta, { version: 1, nodes: [] }, code);
		var catalog = graphBlockCatalog(descriptor);
		blocks[name] = {
			name: String(name),
			"private": descriptor["private"] === true,
			__flowScriptPlaceholder: true,
			__blockDefinition: descriptor,
			catalog: function () {
				return normalizeTree(catalog);
			}
		};
	}

	function reserveGraphBlockFile(blocks, file, origin, provider, blocksDir) {
		var source = String(FileUtils.readFileToString(file, "UTF-8"));
		var name = blockIdFromDescriptorFile(file, blocksDir || file.getParentFile());
		if (!name) {
			name = String(file.getName());
			name = name.substring(0, name.length - ".block.yaml".length);
		}
		if (blocks[name] && blocks[name].__flowScriptPlaceholder !== true) {
			raise("DUPLICATE_BLOCK", "Duplicate Flow block: " + name,
				null, "Rename the project block or remove the duplicate.");
		}
		var descriptor = validateGraphBlockSource(name, source);
		var catalog = graphBlockCatalog(descriptor);
		blocks[name] = {
			name: String(name),
			"private": descriptor["private"] === true,
			__flowScriptPlaceholder: true,
			__blockDefinition: descriptor,
			catalog: function () {
				return normalizeTree(catalog);
			}
		};
	}

	function escapeRegExp(text) {
		return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}

	function renameBlockImplementationSource(source, fromName, toName) {
		source = String(source || "");
		var pattern = new RegExp("(\\bname\\s*:\\s*)([\"'])" + escapeRegExp(fromName) + "\\2", "g");
		return source.replace(pattern, "$1$2" + String(toName) + "$2");
	}

	function renameFlowScriptFunctionSource(source, fromName, toName) {
		var fromFunction = blockFunctionName(fromName);
		var toFunction = blockFunctionName(toName);
		var pattern = new RegExp("(^\\s*(?:flow|function)\\s+)" + escapeRegExp(fromFunction) + "\\b", "m");
		return String(source || "").replace(pattern, "$1" + toFunction);
	}

	function duplicateBlockCodeSource(source, fromName, toName, hasHooks) {
		var extracted = extractFlowScriptBlockMeta(source);
		var meta = normalizeTree(extracted.meta || {});
		if (meta.name !== undefined) {
			delete meta.name;
		}
		if (hasHooks) {
			var hooks = meta.hooks;
			if (typeof hooks === "string") {
				hooks = { file: hooks };
			}
			hooks = normalizeTree(hooks || {});
			hooks.file = blockHooksFileName(toName);
			meta.hooks = hooks;
		} else {
			delete meta.hooks;
		}
		if (blockCodeRuntimeFromMeta(meta) === "rhino") {
			return rhinoBlockCodeSource(toName, renameBlockImplementationSource(extracted.code, fromName, toName), meta);
		}
		return flowScriptBlockCodeSource(toName, renameFlowScriptFunctionSource(extracted.code, fromName, toName), meta);
	}

	function canonicalBlockDefinition(name, request) {
		request = request || {};
		var implementationSource = request.implementationSource;
		var hasDefinition = request.descriptorSource !== undefined && request.descriptorSource !== null ||
			request.descriptor !== undefined && request.descriptor !== null ||
			request.definition !== undefined && request.definition !== null;
		var definition;
		if (request.descriptorSource !== undefined && request.descriptorSource !== null) {
			definition = parseYamlSource(request.descriptorSource, "version: 1\n");
		} else if (request.descriptor !== undefined && request.descriptor !== null) {
			definition = normalizeTree(request.descriptor);
		} else if (request.definition !== undefined && request.definition !== null) {
			definition = normalizeTree(request.definition);
		} else {
			definition = {
				version: 1,
				name: String(name),
				implementation: { runtime: String(request.runtime || "flow") }
			};
		}
		definition.name = String(name);
		if (definition.version === undefined) {
			definition.version = 1;
		}
		var implementation = blockImplementation(definition);
		if (request.runtime && !hasDefinition) {
			implementation.runtime = String(request.runtime);
		}
		if (!implementation.file) {
			implementation.file = implementation.runtime === "flow" ? blockFlowFileName(name) : blockFileName(name);
		}
		definition.implementation = implementation;
		return validateGraphBlockDefinition(name, definition);
	}

	function blockCodeMetaFromDefinition(definition) {
		var meta = graphBlockDefinitionForWrite(definition || {});
		var implementation = blockImplementation(meta);
		meta.runtime = String(implementation.runtime || "flow");
		meta.properties = meta.properties || meta.props || {};
		delete meta.props;
		delete meta.implementation;
		delete meta.name;
		return meta;
	}

	function canonicalBlockCodeFromDefinitionSource(blocks, name, definition, implementationSource, request) {
		var implementation = blockImplementation(definition);
		var meta = blockCodeMetaFromDefinition(definition);
		if (implementation.runtime === "flow") {
			var flowDefinition = validateBlockFlowImplementationSource(name, implementationSource);
			return flowScriptBlockCodeSource(name, sourceFromDefinition(flowDefinition), meta);
		}
		validateBlockImplementationSource(name, implementationSource);
		enforceRhinoImplementationPolicy(name, implementationSource);
		return rhinoBlockCodeSource(name, implementationSource, meta);
	}

	function implementationTargetFile(descriptorFile, definition) {
		var implementation = blockImplementation(definition);
		var defaultFile = implementation.runtime === "flow" ? blockFlowFileName(definition.name) : blockFileName(definition.name);
		var file = new File(String(implementation.file || defaultFile));
		if (!file.isAbsolute()) {
			file = new File(descriptorFile.getParentFile(), String(implementation.file || defaultFile));
		}
		return file;
	}

	function hooksTargetFile(descriptorFile, definition) {
		var hooks = definition && definition.hooks;
		if (!hooks) {
			return null;
		}
		if (typeof hooks === "string") {
			hooks = { file: hooks };
			definition.hooks = hooks;
		}
		hooks = normalizeTree(hooks);
		if (!hooks.file) {
			return null;
		}
		var file = new File(String(hooks.file));
		if (!file.isAbsolute()) {
			file = new File(descriptorFile.getParentFile(), String(hooks.file));
		}
		return file;
	}

	function createProjectBlock(blocks, name, request, overwrite) {
		if (typeof request !== "object" || request === null) {
			raise("INVALID_BLOCK_REQUEST", "Block creation expects a canonical descriptor request object.",
				null, "Pass code to flow-block-code-set, or descriptor/implementationSource for compatibility.");
		}
		overwrite = overwrite === true || request.overwrite === true;
		var descriptorFile = projectBlockDescriptorFile(name);
		var codeFile = projectBlockCodeFile(name);
		var block = blocks[String(name || "")];
		if (block && block.__flowOrigin !== "project") {
			raise("DUPLICATE_BLOCK", "Cannot override non-project Flow block: " + name,
				null, "Choose a project-specific name instead.");
		}
		if ((codeFile.isFile() || descriptorFile.isFile()) && overwrite !== true) {
			raise("BLOCK_ALREADY_EXISTS", "Project block already exists: " + name,
				null, "Pass overwrite=true to replace it explicitly.");
		}
		var definition = canonicalBlockDefinition(name, request);
		var implementation = blockImplementation(definition);
		var hooksFile = hooksTargetFile(codeFile, definition);
		var implementationSource = request.implementationSource;
		var hooksSource = request.hooksSource;
		if (implementation.runtime === "flow" && (implementationSource === undefined || implementationSource === null)) {
			implementationSource = "version: 1\nnodes: []\n";
		}
		if (implementationSource === undefined || implementationSource === null || String(implementationSource).trim() === "") {
			raise("MISSING_BLOCK_IMPLEMENTATION", "Block \"" + name + "\" needs implementationSource.",
				null, "Pass Flow YAML for runtime=flow, Rhino ES6 source for runtime=rhino, or use flow-block-code-set with .block.js code.");
		}
		if (hooksFile && hooksSource !== undefined && hooksSource !== null && hooksFile.isFile() && overwrite !== true) {
			raise("BLOCK_ALREADY_EXISTS", "Block hooks already exists: " + hooksFile.getAbsolutePath(),
				null, "Pass overwrite=true to replace it explicitly.");
		}
		if (hooksFile && (hooksSource === undefined || hooksSource === null) && !hooksFile.isFile()) {
			raise("MISSING_BLOCK_HOOKS", "Block \"" + name + "\" declares hooks.file but no hooksSource was provided.",
				null, "Pass hooksSource or remove hooks.file from the descriptor.");
		}
		var code = canonicalBlockCodeFromDefinitionSource(blocks, name, definition, String(implementationSource), request);
		if (hooksFile && hooksSource !== undefined && hooksSource !== null) {
			validateBlockHooksSource(name, hooksSource);
			hooksFile.getParentFile().mkdirs();
			FileUtils.writeStringToFile(hooksFile, String(hooksSource), "UTF-8");
		}
		return setProjectBlockCode(blocks, name, Object.assign({}, request, {
			code: code,
			overwrite: overwrite
		})).block;
	}

	function deleteIfFile(file) {
		try {
			return file && file.isFile() && file["delete"]();
		} catch (_ignoreDelete) {
			return false;
		}
	}

	function cleanupProjectBlockYamlFallback(name, descriptor) {
		var removed = [];
		var descriptorFile = projectBlockDescriptorFile(name);
		if (deleteIfFile(descriptorFile)) {
			removed.push(String(descriptorFile.getAbsolutePath()));
		}
		var implementation = blockImplementation(descriptor || {});
		var implementationFile = implementationTargetFile(descriptorFile, Object.assign({
			name: blockLocalName(name) || name,
			implementation: implementation.file ? implementation : { runtime: "flow", file: blockFlowFileName(name) }
		}, descriptor || {}));
		if (deleteIfFile(implementationFile)) {
			removed.push(String(implementationFile.getAbsolutePath()));
		}
		return removed;
	}

	function setProjectBlockCode(blocks, name, request) {
		request = request || {};
		name = String(name || request.name || "").trim();
		if (!name) {
			raise("MISSING_BLOCK_NAME", "block.code.set requires name.");
		}
		var code = request.code !== undefined && request.code !== null ? String(request.code) : "";
		if (code.trim() === "") {
			raise("MISSING_BLOCK_CODE", "block.code.set requires .block.js code.");
		}
		var compiled = compileProjectBlockCode(blocks, name, code, request);
		if (request.dry === true || request.dryRun === true || String(request.dry || "") === "true" || String(request.dryRun || "") === "true") {
			return {
				ok: true,
				name: name,
				dry: true,
				format: compiled.runtime === "rhino" ? "blockjs" : "flowscript",
				canonical: true,
				revision: compiled.revision,
				descriptor: publicBlockDescriptor(compiled.descriptor),
				code: compiled.code,
				implementationSource: compiled.source,
				warnings: (compiled.warnings || (compiled.diagnostics || []).filter(function (diagnostic) {
					return diagnostic.severity === "warning";
				}))
			};
		}
		var current = blocks[name];
		if (current && current.__flowOrigin !== "project") {
			raise("DUPLICATE_BLOCK", "Cannot override non-project Flow block: " + name,
				null, "Choose a project-specific name instead.");
		}
		var codeFile = projectBlockCodeFile(name);
		if (codeFile.isFile() && request.overwrite !== true && String(request.overwrite || "") !== "true" &&
				(!current || current.__flowFormat !== "flowscript-block")) {
			raise("BLOCK_ALREADY_EXISTS", "Project FlowScript block already exists: " + name,
				null, "Pass overwrite=true to replace it explicitly.");
		}
		codeFile.getParentFile().mkdirs();
		FileUtils.writeStringToFile(codeFile, compiled.code, "UTF-8");
		var removed = cleanupProjectBlockYamlFallback(name, compiled.descriptor);
		if (blocks[name]) {
			delete blocks[name];
		}
		var loaded = publicBlockDescriptor(blockDescriptor(loadFlowScriptBlockFile(blocks, codeFile, "project",
			flowProviderName(new File(projectDir(), "libs/flow"), "project"), projectBlocksDir())));
		return {
			ok: true,
			name: name,
			dry: false,
			format: compiled.runtime === "rhino" ? "blockjs" : "flowscript",
			canonical: true,
			file: String(codeFile.getAbsolutePath()),
			codeFile: String(codeFile.getAbsolutePath()),
			revision: compiled.revision,
			removedFallbacks: removed,
			warnings: (compiled.warnings || (compiled.diagnostics || []).filter(function (diagnostic) {
				return diagnostic.severity === "warning";
			})),
			block: loaded
		};
	}

	function editProjectBlock(blocks, name, request) {
		if (typeof request !== "object" || request === null) {
			raise("INVALID_BLOCK_REQUEST", "Block edit expects a canonical descriptor request object.",
				null, "Pass code to flow-block-code-set, or descriptor/implementationSource for compatibility.");
		}
		var block = blocks[String(name || "")];
		if (!block || block.__flowOrigin !== "project") {
			raise("BLOCK_NOT_EDITABLE", "Only project-local Flow blocks can be edited: " + name,
				null, "Duplicate core/shared blocks first, then edit the project-local copy.");
		}
		if (request.code !== undefined && request.code !== null) {
			return setProjectBlockCode(blocks, name, request).block;
		}
		var sourceInfo = getBlockSource(blocks, name, { detail: "full", includeSources: true });
		var hasDescriptor = request.descriptorSource !== undefined || request.descriptor !== undefined || request.definition !== undefined;
		var hasImplementation = request.implementationSource !== undefined;
		return createProjectBlock(blocks, name, {
			descriptorSource: request.descriptorSource,
			descriptor: hasDescriptor && request.descriptorSource === undefined ? request.descriptor || request.definition : sourceInfo.descriptor,
			implementationSource: hasImplementation ? request.implementationSource : sourceInfo.implementationSource,
			hooksSource: request.hooksSource,
			overwrite: true
		}, true);
	}

	function duplicateProjectBlock(blocks, fromName, toName, overwrite) {
		fromName = String(fromName || "");
		toName = String(toName || "");
		if (!fromName || !toName) {
			raise("MISSING_BLOCK_NAME", "Block duplication requires fromName and toName.");
		}
		if (fromName === toName) {
			raise("INVALID_BLOCK_NAME", "Block duplication target must differ from source: " + toName);
		}
		var sourceInfo = getBlockSource(blocks, fromName, { detail: "full", includeSources: true });
		var hooksSource = sourceInfo.hooksSource;
		if (sourceInfo.code) {
			var duplicatedCode = duplicateBlockCodeSource(sourceInfo.code, fromName, toName, hooksSource !== undefined && hooksSource !== null);
			if (hooksSource !== undefined && hooksSource !== null) {
				var hooksFile = hooksTargetFile(projectBlockCodeFile(toName), {
					name: blockLocalName(toName) || toName,
					hooks: { file: blockHooksFileName(toName) }
				});
				hooksFile.getParentFile().mkdirs();
				FileUtils.writeStringToFile(hooksFile, String(hooksSource), "UTF-8");
			}
			return setProjectBlockCode(blocks, toName, {
				code: duplicatedCode,
				overwrite: overwrite === true
			}).block;
		}
		var definition = normalizeTree(sourceInfo.descriptor || {});
		definition.name = toName;
		return createProjectBlock(blocks, toName, {
			descriptor: definition,
			implementationSource: sourceInfo.implementationSource,
			hooksSource: hooksSource,
			overwrite: overwrite === true
		}, overwrite);
	}

	function publicBlockDescriptor(descriptor) {
		var out = normalizeTree(descriptor || {});
		if (out.props) {
			out.properties = out.props;
			delete out.props;
		}
		delete out.__flowBlockId;
		delete out.__graphDefinition;
		delete out.__flowCode;
		delete out.__rhinoCode;
		return out;
	}

	function sourceLength(path) {
		if (!path) {
			return 0;
		}
		try {
			return Number(new File(String(path)).length());
		} catch (e) {
			return 0;
		}
	}

	function getBlockSource(blocks, name, args) {
		args = args || {};
		var block = blocks[String(name || "")];
		if (!block) {
			raise("UNKNOWN_BLOCK", "Unknown Flow block: " + name);
		}
		var file = new File(String(block.__flowFile || ""));
		var flowScriptBlock = String(block.__flowFormat || "") === "flowscript-block";
		if (!flowScriptBlock && !String(block.__flowFile || "").endsWith(".block.yaml")) {
			raise("INVALID_BLOCK_STORAGE", "Flow block is not backed by a canonical descriptor: " + name);
		}
		var descriptorSource = flowScriptBlock ? "" : String(FileUtils.readFileToString(file, "UTF-8"));
		var descriptor = flowScriptBlock ? normalizeTree(block.__blockDefinition || {}) : validateGraphBlockSource(block.name, descriptorSource);
		var catalog = blockDescriptor(block);
		var implementation = blockImplementation(descriptor);
		var detail = String(args.detail || args.mode || "compact").toLowerCase();
		if (detail !== "full") {
			var compact = {
				ok: true,
				detail: detail === "summary" ? "summary" : "compact",
				name: block.name
			};
			if (args.includeMeta === true || String(args.includeMeta || "") === "true") {
				compact.origin = block.__flowOrigin || "unknown";
				compact.provider = block.__flowProvider || block.__flowOrigin || "unknown";
				compact.format = flowScriptBlock ? (implementation.runtime === "rhino" ? "blockjs" : "flowscript") : "canonical";
				compact.implementationRuntime = implementation.runtime;
				compact.descriptorChars = descriptorSource.length;
				compact.codeChars = flowScriptBlock ? String(block.__flowCode || "").length : 0;
				compact.implementationChars = flowScriptBlock
					? String(block.__rhinoCode || "").length
					: sourceLength(block.__flowImplementationFile);
				compact.hooksChars = sourceLength(block.__flowHooksFile);
			}
			if (detail === "summary") {
				compact.block = summaryBlockDescriptor(catalog);
				compact.next = "Use detail='compact' for typed properties or detail='full' for descriptor/implementation sources.";
			} else {
				compact.block = compactBlockDescriptor(catalog);
				compact.next = "Sources omitted. Use detail='full' only when editing descriptorSource, implementationSource or hooksSource.";
			}
			return compact;
		}
		var out = {
			ok: true,
			detail: "full",
			name: block.name,
			origin: block.__flowOrigin || "unknown",
			format: flowScriptBlock ? (implementation.runtime === "rhino" ? "blockjs" : "flowscript") : "canonical",
			file: String(block.__flowFile || ""),
			codeFile: flowScriptBlock ? String(block.__flowFile || "") : "",
			codeRevision: flowScriptBlock ? sha256Hex(String(block.__flowCode || "")) : "",
			descriptorFile: flowScriptBlock ? "" : String(block.__flowFile || ""),
			code: flowScriptBlock ? String(block.__flowCode || "") : "",
			descriptorSource: descriptorSource,
			descriptor: publicBlockDescriptor(descriptor),
			implementationRuntime: implementation.runtime
		};
		if (flowScriptBlock) {
			out.implementationSource = implementation.runtime === "rhino"
				? String(block.__rhinoCode || "")
				: sourceFromDefinition(block.__graphDefinition || { version: 1, nodes: [] });
		} else if (block.__flowImplementationFile) {
			out.implementationFile = String(block.__flowImplementationFile);
			out.implementationSource = String(FileUtils.readFileToString(new File(String(block.__flowImplementationFile)), "UTF-8"));
		}
		if (block.__flowHooksFile) {
			out.hooksFile = String(block.__flowHooksFile);
			out.hooksSource = String(FileUtils.readFileToString(new File(String(block.__flowHooksFile)), "UTF-8"));
		}
		return out;
	}

	function projectTypeDescriptorFile(name) {
		var dir = projectTypesDir();
		if (!dir) {
			raise("PROJECT_TYPES_UNAVAILABLE", "Project property types are unavailable.",
				null, "Run through a Flow requestable or set __flowProjectDir in standalone tests.");
		}
		return new File(dir, typeDescriptorFileName(name));
	}

	function validateTypeDescriptorDefinition(name, definition) {
		var type = normalizeTree(definition || {});
		if (type.version === undefined || type.version === null) {
			type.version = 1;
		}
		if (!type.name) {
			type.name = String(name || "");
		}
		if (!type.name) {
			raise("INVALID_TYPE", "Invalid property type descriptor: " + name,
				null, "A type descriptor must define a name.");
		}
		if (String(type.name) !== String(name)) {
			raise("TYPE_NAME_MISMATCH", "Type descriptor declares \"" + type.name + "\" instead of \"" + name + "\".");
		}
		return type;
	}

	function validateTypeDescriptorSource(name, source) {
		return validateTypeDescriptorDefinition(name, parseYamlSource(source, "version: 1\nname: " + String(name || "") + "\n"));
	}

	function typeDescriptorSourceForWriteRequest(name, request) {
		request = request || {};
		var source = request.descriptorSource !== undefined ? request.descriptorSource : request.source;
		if (source !== undefined && source !== null && String(source).trim() !== "") {
			return String(source);
		}
		var definition = request.descriptor || request.definition;
		if (definition !== undefined && definition !== null) {
			var type = validateTypeDescriptorDefinition(name, definition);
			return toYamlSource(type);
		}
		raise("MISSING_TYPE_DESCRIPTOR", "Project property type \"" + name + "\" needs descriptorSource or descriptor.",
			null, "Define the type contract in libs/flow/types/" + typeDescriptorFileName(name) + ".");
	}

	function createProjectType(types, name, request, overwrite) {
		var descriptorSource = typeDescriptorSourceForWriteRequest(name, request);
		validateTypeDescriptorSource(name, descriptorSource);
		var file = projectTypeDescriptorFile(name);
		if (types[name] && types[name].__flowOrigin !== "project") {
			raise("DUPLICATE_TYPE", "Cannot override non-project Flow property type: " + name,
				null, "Choose a project-specific name instead.");
		}
		if (file.isFile() && overwrite !== true) {
			raise("TYPE_ALREADY_EXISTS", "Project property type already exists: " + name,
				null, "Pass overwrite=true to replace it explicitly.");
		}
		file.getParentFile().mkdirs();
		FileUtils.writeStringToFile(file, descriptorSource, "UTF-8");
		if (types[name]) {
			delete types[name];
		}
		var type = loadTypeDescriptorFile(types, file, "project");
		return typeDescriptor(type);
	}

	function getTypeSource(types, name) {
		var type = types[String(name || "")];
		if (!type) {
			raise("UNKNOWN_TYPE", "Unknown Flow property type: " + name);
		}
		var descriptorSource = String(FileUtils.readFileToString(new File(String(type.__flowFile)), "UTF-8"));
		return {
			name: type.name,
			origin: type.__flowOrigin || "unknown",
			file: String(type.__flowFile || ""),
			descriptorFile: String(type.__flowFile || ""),
			descriptor: typeDescriptor(type),
			descriptorSource: descriptorSource
		};
	}

	function typeList(blocks) {
		return {
			types: catalogTypes(Object.keys(blocks).sort().map(function (name) {
				return blockDescriptor(blocks[name]);
			}), loadTypes())
		};
	}

	function projectFlowFile(name) {
		var dir = projectFlowsDir();
		if (!dir) {
			raise("PROJECT_FLOWS_UNAVAILABLE", "Project flows are unavailable.",
				null, "Run through a Flow requestable or set __flowProjectDir in standalone tests.");
		}
		return new File(dir, flowFileName(name));
	}

	function projectFlowCodeFile(name) {
		var dir = projectFlowsDir();
		if (!dir) {
			raise("PROJECT_FLOWS_UNAVAILABLE", "Project flows are unavailable.",
				null, "Run through a Flow requestable or set __flowProjectDir in standalone tests.");
		}
		return new File(dir, flowCodeFileName(name));
	}

	function projectFlowDraftCodeFile(name) {
		var dir = projectFlowDraftsDir();
		if (!dir) {
			raise("PROJECT_FLOW_DRAFTS_UNAVAILABLE", "Project Flow drafts are unavailable.",
				null, "Run through a Flow requestable or set __flowProjectDir in standalone tests.");
		}
		return new File(dir, flowCodeFileName(name));
	}

	function flowNameFromFile(file) {
		var filename = String(file && file.getName ? file.getName() : file || "");
		if (filename.endsWith(".flow.js")) {
			return filename.substring(0, filename.length - ".flow.js".length);
		}
		if (filename.endsWith(".flow.yaml")) {
			return filename.substring(0, filename.length - ".flow.yaml".length);
		}
		return "";
	}

	function projectFlowStorage(name) {
		return {
			name: String(name || ""),
			codeFile: projectFlowCodeFile(name),
			yamlFile: projectFlowFile(name)
		};
	}

	function projectFragmentFile(name) {
		var dir = projectFragmentsDir();
		if (!dir) {
			raise("PROJECT_FRAGMENTS_UNAVAILABLE", "Project Flow fragments are unavailable.",
				null, "Run through a Flow requestable or set __flowProjectDir in standalone tests.");
		}
		return new File(dir, fragmentFileName(name));
	}

	function fragmentCandidates(name) {
		var out = [];
		var dir = projectFragmentsDir();
		if (dir) {
			out.push(new File(dir, fragmentFileName(name)));
		}
		out.push(new File(new File(engineDir(), "fragments"), fragmentFileName(name)));
		return out;
	}

	function fragmentFile(name) {
		var candidates = fragmentCandidates(name);
		for (var i = 0; i < candidates.length; i++) {
			if (candidates[i].isFile()) {
				return candidates[i];
			}
		}
		raise("UNKNOWN_FRAGMENT", "Unknown Flow fragment: " + name,
			null, "Create libs/flow/fragments/" + fragmentFileName(name) + " in the current project.");
	}

	function readFragment(name) {
		var file = fragmentFile(name);
		var source = String(FileUtils.readFileToString(file, "UTF-8"));
		return {
			name: String(name),
			file: String(file.getAbsolutePath()),
			source: source,
			definition: parseYamlSource(source, "version: 1\nnodes: []\n")
		};
	}

	function listProjectFlows() {
		var dir = projectFlowsDir();
		if (!dir || !dir.isDirectory()) {
			return { flows: [] };
		}
		var listed = dir.listFiles();
		if (!listed) {
			return { flows: [] };
		}
		var files = Arrays.asList(listed).toArray();
		files.sort(function (a, b) {
			return String(a.getName()).localeCompare(String(b.getName()));
		});
		var byName = {};
		files.filter(function (file) {
			return file.isFile() && (String(file.getName()).endsWith(".flow.js") || String(file.getName()).endsWith(".flow.yaml"));
		}).forEach(function (file) {
			var name = flowNameFromFile(file);
			if (!name) {
				return;
			}
			var codeFile = String(file.getName()).endsWith(".flow.js") ? file : new File(file.getParentFile(), flowCodeFileName(name));
			var yamlFile = String(file.getName()).endsWith(".flow.yaml") ? file : new File(file.getParentFile(), flowFileName(name));
			var previous = byName[name];
			if (previous && previous.format === "flowscript" && !String(file.getName()).endsWith(".flow.js")) {
				return;
			}
			var canonical = codeFile.isFile() ? codeFile : yamlFile;
			byName[name] = {
				name: name,
				format: codeFile.isFile() ? "flowscript" : "yaml",
				file: String(canonical.getAbsolutePath()),
				sourceFile: yamlFile.isFile() ? String(yamlFile.getAbsolutePath()) : "",
				codeFile: codeFile.isFile() ? String(codeFile.getAbsolutePath()) : "",
				size: Number(canonical.length()),
				sourceSize: yamlFile.isFile() ? Number(yamlFile.length()) : 0,
				codeSize: codeFile.isFile() ? Number(codeFile.length()) : 0,
				lastModified: Number(canonical.lastModified())
			};
		});
		return {
			flows: Object.keys(byName).sort().map(function (name) {
				return byName[name];
			})
		};
	}

	function listFlowsFromRoot(root, projectName, origin, samplesOnly) {
		root = root ? new File(root) : null;
		var dir = root ? new File(root, "libs/flows") : null;
		if (!dir || !dir.isDirectory()) {
			return [];
		}
		var listed = dir.listFiles();
		if (!listed) {
			return [];
		}
		var files = Arrays.asList(listed).toArray();
		files.sort(function (a, b) {
			return String(a.getName()).localeCompare(String(b.getName()));
		});
		var byName = {};
		files.filter(function (file) {
			return file.isFile() && (String(file.getName()).endsWith(".flow.js") || String(file.getName()).endsWith(".flow.yaml"));
		}).forEach(function (file) {
			var name = flowNameFromFile(file);
			if (!name || (samplesOnly === true && !isSampleFlowName(name))) {
				return;
			}
			var previous = byName[name];
			if (previous && previous.format === "flowscript" && !String(file.getName()).endsWith(".flow.js")) {
				return;
			}
			byName[name] = {
				name: name,
				file: file,
				format: String(file.getName()).endsWith(".flow.js") ? "flowscript" : "yaml"
			};
		});
		return Object.keys(byName).sort().map(function (name) {
			var entry = byName[name];
			var file = entry.file;
			var raw = String(FileUtils.readFileToString(file, "UTF-8"));
			var source = raw;
			if (entry.format === "flowscript") {
				source = sourceFromFlowScript(loadBlocks(), name, raw).source;
			}
			return {
				name: name,
				project: projectName || (root ? String(root.getName()) : ""),
				origin: origin || "project",
				format: entry.format,
				file: String(file.getAbsolutePath()),
				source: source,
				code: entry.format === "flowscript" ? raw : "",
				size: Number(file.length()),
				lastModified: Number(file.lastModified())
			};
		});
	}

	function visibleSearchFlows(request) {
		var flows = [];
		var currentRoot = projectDir();
		var currentProject = currentProjectName(request) || (currentRoot ? String(new File(currentRoot).getName()) : "");
		var blocks = loadBlocks();
		listProjectFlows().flows.forEach(function (flow) {
			var current = getProjectFlow(flow.name, blocks);
			flows.push(Object.assign({}, flow, {
				project: currentProject,
				origin: "project",
				source: current.source,
				code: current.code || ""
			}));
		});
		if (request.includeLibrarySamples === false) {
			return flows;
		}
		var seen = {};
		flows.forEach(function (flow) {
			seen[canonicalPath(new File(flow.file))] = true;
		});
		var engineRoot = flowProjectRootFromFlowDir(engineDir());
		var engineProvider = flowProviderName(engineDir(), "lib_flow_engine");
		listFlowsFromRoot(engineRoot, engineProvider, "core", true).forEach(function (flow) {
			var key = canonicalPath(new File(flow.file));
			if (!seen[key]) {
				seen[key] = true;
				flows.push(flow);
			}
		});
		return flows;
	}

	function listProjectFragments() {
		var dir = projectFragmentsDir();
		if (!dir || !dir.isDirectory()) {
			return { fragments: [] };
		}
		var listed = dir.listFiles();
		if (!listed) {
			return { fragments: [] };
		}
		var files = Arrays.asList(listed).toArray();
		files.sort(function (a, b) {
			return String(a.getName()).localeCompare(String(b.getName()));
		});
		return {
			fragments: files.filter(function (file) {
				return file.isFile() && String(file.getName()).endsWith(".fragment.yaml");
			}).map(function (file) {
				var filename = String(file.getName());
				return {
					name: filename.substring(0, filename.length - ".fragment.yaml".length),
					file: String(file.getAbsolutePath()),
					size: Number(file.length()),
					lastModified: Number(file.lastModified())
				};
			})
		};
	}

	function sourceFromFlowScript(blocks, name, code) {
		code = normalizeFlowScriptFunctionSyntax(code);
		var definition = parseFlowScript(blocks, code);
		var diagnostics = validateFlowScriptDefinition(blocks, definition);
		var errors = diagnostics.filter(function (diagnostic) {
			return diagnostic.severity === "error";
		});
		if (errors.length) {
			var error = new Error("Canonical FlowScript is invalid for Flow " + name + ".");
			error.code = "FLOWSCRIPT_CANONICAL_INVALID";
			error.details = diagnostics;
			error.hint = "Fix the .flow.js file or regenerate it from a valid Flow model.";
			throw error;
		}
		var clean = stripFlowScriptMetadata(definition);
		return {
			source: sourceFromDefinition(clean),
			definition: clean,
			diagnostics: diagnostics
		};
	}

	function getProjectFlow(name) {
		var blocks = arguments.length > 1 ? arguments[1] : null;
		var storage = projectFlowStorage(name);
		if (storage.codeFile.isFile()) {
			var code = String(FileUtils.readFileToString(storage.codeFile, "UTF-8"));
			var compiled = sourceFromFlowScript(blocks || loadBlocks(), name, code);
			return {
				name: String(name),
				format: "flowscript",
				file: String(storage.codeFile.getAbsolutePath()),
				sourceFile: storage.yamlFile.isFile() ? String(storage.yamlFile.getAbsolutePath()) : "",
				codeFile: String(storage.codeFile.getAbsolutePath()),
				code: code,
				revision: sha256Hex(code),
				source: compiled.source,
				definition: compiled.definition,
				diagnostics: compiled.diagnostics
			};
		}
		if (!storage.yamlFile.isFile()) {
			raise("UNKNOWN_FLOW", "Unknown Flow sidecar: " + name);
		}
		var source = String(FileUtils.readFileToString(storage.yamlFile, "UTF-8"));
		return {
			name: String(name),
			format: "yaml",
			file: String(storage.yamlFile.getAbsolutePath()),
			sourceFile: String(storage.yamlFile.getAbsolutePath()),
			codeFile: storage.codeFile.isFile() ? String(storage.codeFile.getAbsolutePath()) : "",
			source: source,
			definition: parseSource(source)
		};
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

	function flowScriptString(value) {
		if (value === undefined) {
			return "null";
		}
		return JSON.stringify(normalizeTree(value));
	}

	function flowScriptInlineValue(value) {
		value = normalizeTree(value);
		if (value && typeof value === "object") {
			return JSON.stringify(value);
		}
		return flowScriptString(value);
	}

	function flowScriptLocalName(path) {
		var match = String(path || "").match(/^local\.([A-Za-z_$][\w$]*)$/);
		return match ? match[1] : "";
	}

	function flowScriptScopeAssignmentPath(path) {
		var text = String(path || "");
		return text.match(/^(local|result)\.[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])*$/) ? text : "";
	}

	function renderFlowScriptExpression(expr, locals) {
		if (expr !== undefined && expr !== null && typeof expr !== "string") {
			return flowScriptInlineValue(expr);
		}
		expr = String(expr || "").trim();
		var exact = expr.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
		if (exact) {
			expr = exact[1].trim();
		}
		Object.keys(locals || {}).sort(function (a, b) {
			return b.length - a.length;
		}).forEach(function (name) {
			var escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			expr = expr.replace(new RegExp("(^|[^A-Za-z0-9_$\\.])local\\." + escaped + "(?=\\b|\\.)", "g"), "$1" + name);
		});
		return expr;
	}

	function renderFlowScriptTemplate(text, locals) {
		return String(text || "").replace(/\{\{\s*([^}]+?)\s*\}\}/g, function (_, expr) {
			return "{{ " + renderFlowScriptExpression(expr, locals) + " }}";
		});
	}

	function flowScriptTemplateLiteralPart(text) {
		return String(text || "")
			.replace(/\\/g, "\\\\")
			.replace(/`/g, "\\`")
			.replace(/\$\{/g, "\\${");
	}

	function renderFlowScriptTemplateLiteral(text, locals) {
		var out = "`";
		var index = 0;
		String(text || "").replace(/\{\{\s*([^}]+?)\s*\}\}/g, function (match, expr, offset) {
			out += flowScriptTemplateLiteralPart(String(text).substring(index, offset));
			out += "${" + renderFlowScriptExpression(expr, locals) + "}";
			index = offset + match.length;
			return match;
		});
		out += flowScriptTemplateLiteralPart(String(text || "").substring(index));
		return out + "`";
	}

	function renderFlowScriptValue(blocks, node, key, value, locals) {
		var kind = flowScriptPropKind(blocks, blockName(node), key);
		if (kind === "expression") {
			return renderFlowScriptExpression(value, locals);
		}
		if (kind === "template" || kind === "value") {
			if (typeof value === "string") {
				var exact = value.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
				if (exact) {
					return renderFlowScriptExpression(exact[1], locals);
				}
				if (value.indexOf("{{") !== -1) {
					return renderFlowScriptTemplateLiteral(value, locals);
				}
				return JSON.stringify(value);
			}
		}
		return flowScriptInlineValue(value);
	}

	function flowScriptArgKeys(node, slotNames) {
		var skip = {
			block: true, props: true, nodes: true, then: true, "else": true, fields: true,
			__fragment: true, __graphBlock: true, __flowScriptLine: true
		};
		(slotNames || []).forEach(function (slot) {
			skip[slot] = true;
		});
		return Object.keys(node || {}).filter(function (key) {
			return !skip[key] && node[key] !== undefined && typeof node[key] !== "function";
		});
	}

	function flowScriptSlotNames(blocks, node) {
		var names = childSlotNamesForMutation(blocks, node);
		["nodes", "then", "else", "fields"].forEach(function (name) {
			if (Object.prototype.toString.call(node && node[name]) === "[object Array]" && names.indexOf(name) === -1) {
				names.push(name);
			}
		});
		return names;
	}

	function defaultFlowScriptSlot(blocks, node) {
		var slots = flowScriptSlotNames(blocks, node);
		if (slots.indexOf("nodes") !== -1) {
			return "nodes";
		}
		if (slots.indexOf("then") !== -1) {
			return "then";
		}
		if (slots.indexOf("fields") !== -1) {
			return "fields";
		}
		return slots.length ? slots[0] : "";
	}

	function flowScriptCallLine(blocks, node, indent, locals) {
		locals = locals || {};
		var block = String(blockName(node) || node.block || "unknown.block");
		if (block === "if") {
			return indent + "if (" + renderFlowScriptExpression(node && node.condition || "true", locals) + ")";
		}
		if (block === "return") {
			return indent + "return " + renderFlowScriptValue(blocks, node, "value", node && node.value, locals);
		}
		var outLocal = flowScriptLocalName(node && node.out);
		if (block === "set" && flowScriptScopeAssignmentPath(node && node.path)) {
			var assignmentPath = String(node.path);
			if (assignmentPath.indexOf("local.") === 0) {
				var localName = flowScriptLocalName(assignmentPath);
				if (localName) {
					var rendered = renderFlowScriptValue(blocks, node, "value", node.value, locals);
					locals[localName] = true;
					return indent + "var " + localName + " = " + rendered;
				}
			}
			return indent + assignmentPath + " = " + renderFlowScriptValue(blocks, node, "value", node.value, locals);
		}
		var slotNames = flowScriptSlotNames(blocks, node);
		var args = {};
		flowScriptArgKeys(node, slotNames).forEach(function (key) {
			if (key === "out" && outLocal) {
				return;
			}
			args[key] = node[key];
		});
		var parts = Object.keys(args).map(function (key) {
			return key + ": " + renderFlowScriptValue(blocks, node, key, args[key], locals);
		});
		var call = block + "({ " + parts.join(", ") + " })";
		if (outLocal) {
			locals[outLocal] = true;
			return indent + "var " + outLocal + " = " + call;
		}
		return indent + call;
	}

	function flowScriptHasTopLevelReturn(nodes) {
		return (nodes || []).some(function (node) {
			return blockName(node) === "return";
		});
	}

	function renderFlowScriptNodes(blocks, nodes, depth, lines, locals) {
		locals = locals || {};
		var indent = new Array(depth + 1).join("  ");
		(nodes || []).forEach(function (node) {
			var defaultSlot = defaultFlowScriptSlot(blocks, node);
			var renderedChildren = defaultSlot && Object.prototype.toString.call(node[defaultSlot]) === "[object Array]" && node[defaultSlot].length > 0;
			var line = flowScriptCallLine(blocks, node, indent, locals);
			if (renderedChildren) {
				lines.push(line + " {");
				renderFlowScriptNodes(blocks, node[defaultSlot], depth + 1, lines, Object.assign({}, locals));
				lines.push(indent + "}");
			} else {
				lines.push(line);
			}
			if (blockName(node) === "if" && Object.prototype.toString.call(node["else"]) === "[object Array]" && node["else"].length > 0) {
				lines[lines.length - 1] = lines[lines.length - 1] + " else {";
				renderFlowScriptNodes(blocks, node["else"], depth + 1, lines, Object.assign({}, locals));
				lines.push(indent + "}");
			}
		});
	}

	function renderFlowScript(blocks, name, flowSource, request) {
		request = request || {};
		var definition = parseSource(flowSource);
		var lines = [];
		if (request.includeHeader !== false) {
			lines.push("// c8o: FlowScript spike. Function calls are Flow blocks; named arguments are block properties.");
			lines.push("// c8o: Patch with the returned revision. The engine validates and compiles this code back to Flow YAML.");
		}
		if (request.includeContext === true) {
			var analysis = analyzeFlowDefinition(blocks, definition, request);
			var paths = [];
			(analysis.paths || []).slice(0, 30).forEach(function (path) {
				paths.push(typeof path === "string" ? path : path.path);
			});
			if (paths.length) {
				lines.push("// c8o: Known paths: " + paths.join(", "));
			}
		}
		if (lines.length) {
			lines.push("");
		}
		lines.push("function " + safeIdentifier(name || "Flow") + "({ input, config, result }) {");
		renderFlowScriptNodes(blocks, definition.nodes || [], 1, lines, {});
		if (request.includeImplicitReturn !== false && !flowScriptHasTopLevelReturn(definition.nodes || [])) {
			lines.push("  return result");
		}
		lines.push("}");
		lines.push("");
		return lines.join("\n");
	}

	function normalizeFlowScriptCode(code) {
		code = normalizeFlowScriptFunctionSyntax(code).replace(/\s+$/g, "");
		return code + "\n";
	}

	function stripFlowScriptMirrorHeader(code) {
		var lines = String(code || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
		if (!lines.length || lines[0].indexOf("// c8o-flow: generated FlowScript mirror") !== 0) {
			return String(code || "");
		}
		while (lines.length && String(lines[0]).indexOf("// c8o-flow:") === 0) {
			lines.shift();
		}
		if (lines.length && String(lines[0]).trim() === "") {
			lines.shift();
		}
		return lines.join("\n");
	}

	function flowScriptMirrorCode(blocks, name, source, args) {
		args = args || {};
		var code = args.code !== undefined && args.code !== null
			? String(args.code)
			: renderFlowScript(blocks, name, source, { includeHeader: false });
		return normalizeFlowScriptCode(stripFlowScriptMirrorHeader(code));
	}

	function writeProjectFlowCodeMirror(blocks, name, source, args) {
		args = args || {};
		if (args.flowCodeMirror === false || args.mirrorCode === false || args.saveCode === false) {
			return null;
		}
		return writeFlowCodeMirrorFile(blocks, name, source, projectFlowCodeFile(name), args);
	}

	function writeProjectFlowCodeCanonical(blocks, name, source, args) {
		args = args || {};
		var file = projectFlowCodeFile(name);
		file.getParentFile().mkdirs();
		var code = flowScriptMirrorCode(blocks, name, source, args);
		FileUtils.writeStringToFile(file, code, "UTF-8");
		return {
			file: String(file.getAbsolutePath()),
			code: code,
			revision: sha256Hex(code)
		};
	}

	function writeFlowCodeMirrorFile(blocks, name, source, file, args) {
		args = args || {};
		if (args.flowCodeMirror === false || args.mirrorCode === false || args.saveCode === false) {
			return null;
		}
		file.getParentFile().mkdirs();
		var code = flowScriptMirrorCode(blocks, name, source, args);
		FileUtils.writeStringToFile(file, code, "UTF-8");
		return {
			file: String(file.getAbsolutePath()),
			code: code,
			revision: sha256Hex(code)
		};
	}

	function writeFlowCodeMirrorRequest(request, blocks) {
		request = request || {};
		var source = sourceForWriteRequest(request, request.source || request.flowSource);
		source = sourceFromDefinition(parseSource(source));
		var name = String(request.name || request.flowName || "Flow");
		var sourceFile = request.sourceFile ? new File(String(request.sourceFile)) : null;
		var codeFile = request.codeFile ? new File(String(request.codeFile))
			: (sourceFile ? flowCodeFileFromYamlFile(sourceFile, name) : projectFlowCodeFile(name));
		var mirror = writeFlowCodeMirrorFile(blocks, name, source, codeFile, request);
		return {
			ok: true,
			name: name,
			sourceFile: sourceFile ? String(sourceFile.getAbsolutePath()) : "",
			codeFile: mirror ? mirror.file : "",
			codeRevision: mirror ? mirror.revision : ""
		};
	}

	function flowScriptCodeFromMirror(blocks, name, source, request) {
		request = request || {};
		var file = projectFlowCodeFile(name);
		if (request.useMirror !== false && file.isFile()) {
			var code = String(FileUtils.readFileToString(file, "UTF-8"));
			try {
				var validation = flowScriptValidateRequest(blocks, Object.assign({}, request, {
					name: name,
					code: code
				}));
				if (validation.ok && sha256Hex(validation.source) === sha256Hex(sourceFromDefinition(parseSource(source)))) {
					return {
						code: code,
						file: String(file.getAbsolutePath()),
						fromMirror: true,
						stale: false
					};
				}
			} catch (e) {
				// A broken mirror must not hide the canonical Flow YAML.
			}
			return {
				code: renderFlowScript(blocks, name, source, request),
				file: String(file.getAbsolutePath()),
				fromMirror: false,
				stale: true
			};
		}
		return {
			code: renderFlowScript(blocks, name, source, request),
			file: file.isFile() ? String(file.getAbsolutePath()) : "",
			fromMirror: false,
			stale: false
		};
	}

	function safeIdentifier(value) {
		var text = String(value || "Flow").replace(/[^A-Za-z0-9_$]/g, "_");
		if (!text.match(/^[A-Za-z_$]/)) {
			text = "_" + text;
		}
		return text || "Flow";
	}

	function parseFlowScriptArgs(text, lineNumber) {
		text = String(text || "").trim();
		if (text === "") {
			return {};
		}
		try {
			return normalizeTree(parseYamlSource(text, "{}"));
		} catch (e) {
			var error = new Error("Invalid FlowScript argument object at line " + lineNumber + ": " + e.message);
			error.code = "FLOWSCRIPT_INVALID_ARGUMENTS";
			error.details = {
				line: lineNumber,
				expected: "Use an object literal such as { id: \"step\", path: \"result.value\", value: \"{{ local.value }}\" }."
			};
			throw error;
		}
	}

	function stripFlowScriptComment(line) {
		var inString = false;
		var quote = "";
		for (var i = 0; i < line.length - 1; i++) {
			var ch = line.charAt(i);
			if (inString) {
				if (ch === "\\" && i + 1 < line.length) {
					i++;
				} else if (ch === quote) {
					inString = false;
				}
			} else if (ch === "\"" || ch === "'" || ch === "`") {
				inString = true;
				quote = ch;
			} else if (ch === "/" && line.charAt(i + 1) === "/") {
				return line.substring(0, i);
			}
		}
		return line;
	}

	function addFlowScriptNode(target, node) {
		if (!target.root[target.slot]) {
			target.root[target.slot] = [];
		}
		target.root[target.slot].push(node);
	}

	function flowScriptBalance(text) {
		var balance = { paren: 0, brace: 0, bracket: 0 };
		var inString = false;
		var quote = "";
		for (var i = 0; i < text.length; i++) {
			var ch = text.charAt(i);
			if (inString) {
				if (ch === "\\" && i + 1 < text.length) {
					i++;
				} else if (ch === quote) {
					inString = false;
				}
				continue;
			}
			if (ch === "\"" || ch === "'" || ch === "`") {
				inString = true;
				quote = ch;
			} else if (ch === "(") {
				balance.paren++;
			} else if (ch === ")") {
				balance.paren--;
			} else if (ch === "{") {
				balance.brace++;
			} else if (ch === "}") {
				balance.brace--;
			} else if (ch === "[") {
				balance.bracket++;
			} else if (ch === "]") {
				balance.bracket--;
			}
		}
		return balance;
	}

	function flowScriptStatementComplete(text) {
		text = String(text || "").trim();
		if (text === "") {
			return true;
		}
		if (text.match(/^(flow|function)\s+/) || text === "}" || text === "};" || text.match(/^}\s*else\s*\{\s*;?$/)) {
			return true;
		}
		var balance = flowScriptBalance(text);
		if (balance.paren === 0 && balance.bracket === 0 && balance.brace === 1 &&
				text.match(/^[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*\s*\(.*\)\s*\{\s*;?$/)) {
			return true;
		}
		if (balance.paren === 0 && balance.bracket === 0 && balance.brace === 1 &&
				text.match(/^if\s*\(.*\)\s*\{\s*;?$/)) {
			return true;
		}
		if (balance.paren <= 0 && balance.brace <= 0 && balance.bracket <= 0) {
			return !!(text.match(/;\s*$/) ||
				text.match(/^import\s+/) ||
				text.match(/^return(?:\s|;|$)/) ||
				text.match(/^(const|let|var)\s+/) ||
				text.match(/^(local|result)\.[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])*\s*=/) ||
				text.match(/^[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*\s*\(/));
		}
		return false;
	}

	function flowScriptBalanceProblem(balance) {
		balance = balance || {};
		var missing = [];
		var extra = [];
		if (balance.paren > 0) {
			missing.push(")");
		} else if (balance.paren < 0) {
			extra.push(")");
		}
		if (balance.brace > 0) {
			missing.push("}");
		} else if (balance.brace < 0) {
			extra.push("}");
		}
		if (balance.bracket > 0) {
			missing.push("]");
		} else if (balance.bracket < 0) {
			extra.push("]");
		}
		var parts = [];
		if (missing.length) {
			parts.push("missing " + missing.join(", "));
		}
		if (extra.length) {
			parts.push("extra " + extra.join(", "));
		}
		return parts.join("; ");
	}

	function flowScriptMissingClosers(balance) {
		balance = balance || {};
		var missing = [];
		if (balance.paren > 0) {
			missing.push(")");
		}
		if (balance.brace > 0) {
			missing.push("}");
		}
		if (balance.bracket > 0) {
			missing.push("]");
		}
		return missing.join(", ");
	}

	function flowScriptMissingGroupClosers(balance) {
		balance = balance || {};
		var missing = [];
		if (balance.paren > 0) {
			missing.push(")");
		}
		if (balance.bracket > 0) {
			missing.push("]");
		}
		return missing.join(", ");
	}

	function flowScriptStatements(code) {
		var out = [];
		var pending = null;
		String(code || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").forEach(function (raw, index) {
			var line = stripFlowScriptComment(raw).trim();
			if (line === "") {
				return;
			}
			if (!pending && (line.match(/^(flow|function)\s+/) || line === "}" || line === "};" || line.match(/^}\s*else\s*\{\s*;?$/))) {
				out.push({ line: index + 1, text: line });
				return;
			}
			if (pending) {
				var beforeClose = flowScriptBalance(pending.text);
				if ((line === "}" || line === "};" || line.match(/^}\s*else\s*\{\s*;?$/)) &&
						pending.text.match(/^if\s*\(/) && (beforeClose.paren > 0 || beforeClose.bracket > 0)) {
					raise("FLOWSCRIPT_UNBALANCED_SYNTAX", "Unbalanced FlowScript statement at line " + pending.line
						+ ": missing " + flowScriptMissingGroupClosers(beforeClose) + " before line " + (index + 1),
						null, "Close the current statement before writing the next one.");
				}
				pending.text += "\n" + line;
				if (flowScriptStatementComplete(pending.text)) {
					out.push(pending);
					pending = null;
				}
				return;
			}
			pending = { line: index + 1, text: line };
			if (flowScriptStatementComplete(pending.text)) {
				out.push(pending);
				pending = null;
			}
		});
		if (pending) {
			var problem = flowScriptBalanceProblem(flowScriptBalance(pending.text));
			if (problem) {
				raise("FLOWSCRIPT_UNBALANCED_SYNTAX", "Unbalanced FlowScript statement at line " + pending.line + ": " + problem,
					null, "Close the current statement before writing the next one.");
			}
			out.push(pending);
		}
		return out;
	}

	function stripFlowScriptSemicolon(text) {
		return String(text || "").trim().replace(/;\s*$/, "").trim();
	}

	function splitFlowScriptTopLevel(text, separator) {
		var out = [];
		var start = 0;
		var inString = false;
		var quote = "";
		var paren = 0;
		var brace = 0;
		var bracket = 0;
		separator = separator || ",";
		for (var i = 0; i < text.length; i++) {
			var ch = text.charAt(i);
			if (inString) {
				if (ch === "\\" && i + 1 < text.length) {
					i++;
				} else if (ch === quote) {
					inString = false;
				}
				continue;
			}
			if (ch === "\"" || ch === "'" || ch === "`") {
				inString = true;
				quote = ch;
			} else if (ch === "(") {
				paren++;
			} else if (ch === ")") {
				paren--;
			} else if (ch === "{") {
				brace++;
			} else if (ch === "}") {
				brace--;
			} else if (ch === "[") {
				bracket++;
			} else if (ch === "]") {
				bracket--;
			} else if (ch === separator && paren === 0 && brace === 0 && bracket === 0) {
				out.push(text.substring(start, i).trim());
				start = i + 1;
			}
		}
		var last = text.substring(start).trim();
		if (last !== "") {
			out.push(last);
		}
		return out;
	}

	function isFlowScriptQuoted(text) {
		text = String(text || "").trim();
		return text.length >= 2 && (text.charAt(0) === "\"" && text.charAt(text.length - 1) === "\"" ||
			text.charAt(0) === "'" && text.charAt(text.length - 1) === "'");
	}

	function isFlowScriptTemplateLiteral(text) {
		text = String(text || "").trim();
		return text.length >= 2 && text.charAt(0) === "`" && text.charAt(text.length - 1) === "`";
	}

	function unquoteFlowScriptString(text) {
		text = String(text || "").trim();
		if (!isFlowScriptQuoted(text)) {
			return text;
		}
		if (text.charAt(0) === "\"") {
			try {
				return JSON.parse(text);
			} catch (e) {
				return text.substring(1, text.length - 1);
			}
		}
		return text.substring(1, text.length - 1)
			.replace(/\\'/g, "'")
			.replace(/\\"/g, "\"")
			.replace(/\\n/g, "\n")
			.replace(/\\t/g, "\t")
			.replace(/\\\\/g, "\\");
	}

	function isFlowScriptObjectLiteral(text) {
		text = String(text || "").trim();
		return text.charAt(0) === "{" && text.charAt(text.length - 1) === "}";
	}

	function isFlowScriptArrayLiteral(text) {
		text = String(text || "").trim();
		return text.charAt(0) === "[" && text.charAt(text.length - 1) === "]";
	}

	function parseFlowScriptObjectLiteral(text, lineNumber) {
		text = String(text || "").trim();
		if (!isFlowScriptObjectLiteral(text)) {
			raise("FLOWSCRIPT_INVALID_OBJECT", "Expected object literal at line " + lineNumber + ": " + text);
		}
		var body = text.substring(1, text.length - 1);
		var tokens = {};
		splitFlowScriptTopLevel(body, ",").forEach(function (part) {
			var pair = splitFlowScriptTopLevel(part, ":");
			if (pair.length < 2) {
				return;
			}
			var key = unquoteFlowScriptString(pair.shift().trim());
			tokens[key] = pair.join(":").trim();
		});
		var value;
		try {
			value = parseFlowScriptArgs(text, lineNumber);
		} catch (_expressionObject) {
			value = {};
			Object.keys(tokens).forEach(function (key) {
				value[key] = tokens[key];
			});
		}
		return {
			value: value,
			tokens: tokens
		};
	}

	function flowScriptPropKind(blocks, block, key) {
		var descriptor = blockCatalog(blocks && blocks[block]) || {};
		var prop = descriptor.props && descriptor.props[key];
		if (!prop) {
			return "";
		}
		if (prop.kind) {
			return String(prop.kind);
		}
		var type = String(prop.type || "").toLowerCase();
		if (type === "expression") {
			return "expression";
		}
		if (type === "path") {
			return "path";
		}
		if (type === "template") {
			return "template";
		}
		if (type === "value" || type === "literal") {
			return "value";
		}
		if (type === "string") {
			return "template";
		}
		if (type === "array" || type === "object" || type === "boolean" ||
				type === "number" || type === "integer") {
			return "expression";
		}
		return "value";
	}

	function flowScriptRewriteExpression(expr, locals) {
		expr = String(expr || "").trim();
		var exact = expr.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
		if (exact) {
			expr = exact[1].trim();
		}
		Object.keys(locals || {}).sort(function (a, b) {
			return b.length - a.length;
		}).forEach(function (name) {
			var escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			expr = expr.replace(new RegExp("(^|[^A-Za-z0-9_$\\.])" + escaped + "(?=\\b|\\.)", "g"), "$1local." + name);
		});
		return expr;
	}

	function flowScriptExpressionFromToken(token, locals) {
		token = String(token || "").trim();
		if (isFlowScriptQuoted(token)) {
			token = unquoteFlowScriptString(token);
		}
		return flowScriptRewriteExpression(token, locals);
	}

	function flowScriptPathFromToken(token, locals) {
		token = String(token || "").trim();
		if (isFlowScriptQuoted(token)) {
			token = unquoteFlowScriptString(token);
		}
		token = flowScriptRewriteExpression(token, locals);
		if (isScopePath(token)) {
			return token;
		}
		if (token.indexOf("$.") === 0) {
			return "local." + token.substring(2);
		}
		if (token.charAt(0) === "/" && token.indexOf("//") !== 0) {
			return "local." + token.substring(1).replace(/\//g, ".");
		}
		if (token.match(/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])*$/)) {
			return "local." + token;
		}
		return token;
	}

	function flowScriptLiteralTokenValue(token, lineNumber) {
		token = String(token || "").trim();
		if (isFlowScriptTemplateLiteral(token)) {
			return undefined;
		}
		if (isFlowScriptQuoted(token)) {
			return unquoteFlowScriptString(token);
		}
		if (isFlowScriptArrayLiteral(token) || isFlowScriptObjectLiteral(token)) {
			return normalizeTree(parseYamlSource(token, "{}"));
		}
		if (token === "true") {
			return true;
		}
		if (token === "false") {
			return false;
		}
		if (token === "null") {
			return null;
		}
		if (token.match(/^-?\d+(?:\.\d+)?$/)) {
			return Number(token);
		}
		return undefined;
	}

	function flowScriptValueObjectFromToken(token, locals, lineNumber) {
		if (!isFlowScriptObjectLiteral(token)) {
			return undefined;
		}
		var out = {};
		naturalFlowScriptObjectFields(token).forEach(function (field) {
			out[field.key] = flowScriptValueFromToken(field.token, locals, lineNumber);
		});
		return out;
	}

	function flowScriptValueArrayFromToken(token, locals, lineNumber) {
		if (!isFlowScriptArrayLiteral(token)) {
			return undefined;
		}
		var body = String(token || "").trim();
		body = body.substring(1, body.length - 1);
		return splitFlowScriptTopLevel(body, ",").map(function (item) {
			return flowScriptValueFromToken(item, locals, lineNumber);
		});
	}

	function flowScriptTemplateLiteralToTemplate(token, locals, lineNumber) {
		var body = String(token || "").trim();
		if (!isFlowScriptTemplateLiteral(body)) {
			return undefined;
		}
		body = body.substring(1, body.length - 1);
		var out = "";
		for (var i = 0; i < body.length; i++) {
			var ch = body.charAt(i);
			if (ch === "\\" && i + 1 < body.length) {
				var escaped = body.charAt(++i);
				out += escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped;
				continue;
			}
			if (ch === "$" && body.charAt(i + 1) === "{") {
				i += 2;
				var start = i;
				var brace = 1;
				var quote = "";
				while (i < body.length && brace > 0) {
					ch = body.charAt(i);
					if (quote) {
						if (ch === "\\" && i + 1 < body.length) {
							i += 2;
							continue;
						}
						if (ch === quote) {
							quote = "";
						}
						i++;
						continue;
					}
					if (ch === "\"" || ch === "'" || ch === "`") {
						quote = ch;
						i++;
						continue;
					}
					if (ch === "{") {
						brace++;
					} else if (ch === "}") {
						brace--;
						if (brace === 0) {
							break;
						}
					}
					i++;
				}
				if (brace !== 0) {
					raise("FLOWSCRIPT_INVALID_TEMPLATE_LITERAL", "Unclosed template literal expression at line " + lineNumber + ": " + token);
				}
				var expression = body.substring(start, i).trim();
				out += "{{ " + flowScriptRewriteExpression(expression, locals) + " }}";
				continue;
			}
			out += ch;
		}
		return out;
	}

	function flowScriptRewriteTemplateText(text, locals) {
		return String(text || "").replace(/\{\{\s*([^}]+?)\s*\}\}/g, function (_, expr) {
			return "{{ " + flowScriptRewriteExpression(expr, locals) + " }}";
		});
	}

	function flowScriptValueFromToken(token, locals, lineNumber) {
		var template = flowScriptTemplateLiteralToTemplate(token, locals, lineNumber);
		if (template !== undefined) {
			return template;
		}
		var object = flowScriptValueObjectFromToken(token, locals, lineNumber);
		if (object !== undefined) {
			return object;
		}
		var array = flowScriptValueArrayFromToken(token, locals, lineNumber);
		if (array !== undefined) {
			return array;
		}
		var literal = flowScriptLiteralTokenValue(token, lineNumber);
		if (literal !== undefined) {
			if (typeof literal === "string" && literal.indexOf("{{") !== -1) {
				return flowScriptRewriteTemplateText(literal, locals);
			}
			return literal;
		}
		return "{{ " + flowScriptRewriteExpression(token, locals) + " }}";
	}

	function normalizeNaturalFlowScriptProps(blocks, block, parsed, locals, lineNumber) {
		var args = normalizeTree(parsed.value || {});
		var tokens = parsed.tokens || {};
		Object.keys(tokens).forEach(function (key) {
			var kind = flowScriptPropKind(blocks, block, key);
			if (kind === "expression") {
				if (isFlowScriptArrayLiteral(tokens[key]) || isFlowScriptObjectLiteral(tokens[key])) {
					args[key] = flowScriptLiteralTokenValue(tokens[key], lineNumber);
				} else {
					args[key] = flowScriptExpressionFromToken(tokens[key], locals);
				}
			} else if (kind === "path") {
				args[key] = flowScriptPathFromToken(tokens[key], locals);
			} else if (kind === "template" || kind === "value") {
				args[key] = flowScriptValueFromToken(tokens[key], locals, lineNumber);
			} else if (kind === "text" || kind === "schema" || kind === "secret") {
				args[key] = unquoteFlowScriptString(tokens[key]);
			}
		});
		return args;
	}

	function parseNaturalFlowScriptCall(text) {
		text = stripFlowScriptSemicolon(text);
		var match = text.match(/^([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*)\s*\(/);
		if (!match) {
			return null;
		}
		var open = text.indexOf("(", match[0].length - 1);
		var paren = 0;
		var inString = false;
		var quote = "";
		for (var i = open; i < text.length; i++) {
			var ch = text.charAt(i);
			if (inString) {
				if (ch === "\\" && i + 1 < text.length) {
					i++;
				} else if (ch === quote) {
					inString = false;
				}
				continue;
			}
			if (ch === "\"" || ch === "'" || ch === "`") {
				inString = true;
				quote = ch;
			} else if (ch === "(") {
				paren++;
			} else if (ch === ")") {
				paren--;
				if (paren === 0) {
					if (text.substring(i + 1).trim() !== "") {
						return null;
					}
					return { name: match[1], args: text.substring(open + 1, i) };
				}
			}
		}
		return null;
	}

	function parseNaturalFlowScriptCallWithBody(text) {
		text = stripFlowScriptSemicolon(text);
		var match = text.match(/^([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*)\s*\(/);
		if (!match) {
			return null;
		}
		var open = text.indexOf("(", match[0].length - 1);
		var paren = 0;
		var inString = false;
		var quote = "";
		for (var i = open; i < text.length; i++) {
			var ch = text.charAt(i);
			if (inString) {
				if (ch === "\\" && i + 1 < text.length) {
					i++;
				} else if (ch === quote) {
					inString = false;
				}
				continue;
			}
			if (ch === "\"" || ch === "'" || ch === "`") {
				inString = true;
				quote = ch;
			} else if (ch === "(") {
				paren++;
			} else if (ch === ")") {
				paren--;
				if (paren === 0) {
					var rest = text.substring(i + 1).trim();
					if (!rest || rest.charAt(0) !== "{") {
						return null;
					}
					var bodyEnd = balancedObjectEnd(rest, 0);
					if (bodyEnd < 0 || rest.substring(bodyEnd + 1).trim() !== "") {
						return null;
					}
					return {
						name: match[1],
						args: text.substring(open + 1, i),
						body: rest.substring(1, bodyEnd)
					};
				}
			}
		}
		return null;
	}

	function capitalizedIdentifier(value) {
		value = safeIdentifier(value || "value");
		return value.substring(0, 1).toUpperCase() + value.substring(1);
	}

	function naturalFlowScriptObjectFields(text) {
		text = String(text || "").trim();
		if (!isFlowScriptObjectLiteral(text)) {
			return [];
		}
		var fields = [];
		var body = text.substring(1, text.length - 1);
		splitFlowScriptTopLevel(body, ",").forEach(function (part) {
			var pair = splitFlowScriptTopLevel(part, ":");
			if (pair.length >= 2) {
				fields.push({
					key: unquoteFlowScriptString(pair.shift().trim()),
					token: pair.join(":").trim()
				});
			} else if (part.trim() !== "") {
				fields.push({
					key: part.trim(),
					token: part.trim()
				});
			}
		});
		return fields;
	}

	function naturalFlowScriptJsonObjectNode(id, outPath, fields, locals, lineNumber) {
		return {
			id: safeIdentifier(id),
			block: "json.object",
			out: outPath,
			__flowScriptLine: lineNumber,
			fields: fields.map(function (field) {
				return {
					id: safeIdentifier(field.key),
					block: "json.field",
					key: field.key,
					value: flowScriptValueFromToken(field.token, locals, lineNumber),
					__flowScriptLine: lineNumber
				};
			})
		};
	}

	function buildNaturalListMapBlockCallNodes(blocks, imports, varName, itemToken, callToken, locals, lineNumber) {
		var mapperCall = parseNaturalFlowScriptCall(callToken);
		if (!mapperCall) {
			return null;
		}
		var mapperBlock = resolveFlowScriptName(mapperCall.name, imports);
		var mapperArgs = splitFlowScriptTopLevel(mapperCall.args, ",");
		var mapperNode = {};
		if (mapperArgs.length === 1 && isFlowScriptObjectLiteral(mapperArgs[0])) {
			mapperNode = normalizeNaturalFlowScriptProps(blocks, mapperBlock, parseFlowScriptObjectLiteral(mapperArgs[0], lineNumber), locals, lineNumber);
		} else if (mapperArgs.length > 0) {
			return null;
		}
		var cap = capitalizedIdentifier(varName);
		var itemName = safeIdentifier(varName + capitalizedIdentifier(blockLocalName(mapperBlock) || "item"));
		mapperNode.id = mapperNode.id || safeIdentifier("map" + cap + capitalizedIdentifier(blockLocalName(mapperBlock) || "item"));
		mapperNode.block = mapperBlock;
		mapperNode.out = mapperNode.out || "local." + itemName;
		mapperNode.__flowScriptLine = lineNumber;
		return [
			{
				id: "init" + cap,
				block: "set",
				path: "local." + varName,
				value: [],
				__flowScriptLine: lineNumber
			},
			{
				id: "each" + cap,
				block: "forEach",
				items: flowScriptRewriteExpression(itemToken, locals),
				__flowScriptLine: lineNumber,
				nodes: [
					mapperNode,
					{
						id: "push" + cap,
						block: "json.push",
						path: "local." + varName,
						value: "{{ local." + itemName + " }}",
						__flowScriptLine: lineNumber
					}
				]
			}
		];
	}

	function buildNaturalListMapObjectArgNodes(blocks, imports, varName, arg, locals, lineNumber) {
		if (!isFlowScriptObjectLiteral(arg)) {
			return null;
		}
		var fields = naturalFlowScriptObjectFields(arg);
		var itemToken = "";
		var selectToken = "";
		fields.forEach(function (field) {
			if (field.key === "items") {
				itemToken = field.token;
			} else if (field.key === "select") {
				selectToken = field.token;
			}
		});
		if (!itemToken || !selectToken) {
			return null;
		}
		return buildNaturalListMapBlockCallNodes(blocks, imports, varName, itemToken, selectToken, locals, lineNumber);
	}

	function buildNaturalListMapNodes(blocks, imports, varName, args, locals, lineNumber) {
		var blockCallNodes = null;
		if (args.length >= 2) {
			blockCallNodes = buildNaturalListMapBlockCallNodes(blocks, imports, varName, args[0], args[1], locals, lineNumber);
			if (blockCallNodes) {
				return blockCallNodes;
			}
		} else if (args.length === 1) {
			blockCallNodes = buildNaturalListMapObjectArgNodes(blocks, imports, varName, args[0], locals, lineNumber);
			if (blockCallNodes) {
				return blockCallNodes;
			}
		}
		if (args.length < 2 || !isFlowScriptObjectLiteral(args[1])) {
			return null;
		}
		var objectFields = naturalFlowScriptObjectFields(args[1]);
		if (!objectFields.length) {
			return null;
		}
		var cap = capitalizedIdentifier(varName);
		var itemName = safeIdentifier(varName + "Item");
		return [
			{
				id: "init" + cap,
				block: "set",
				path: "local." + varName,
				value: [],
				__flowScriptLine: lineNumber
			},
			{
				id: "each" + cap,
				block: "forEach",
				items: flowScriptRewriteExpression(args[0], locals),
				__flowScriptLine: lineNumber,
				nodes: [
					naturalFlowScriptJsonObjectNode(itemName, "local." + itemName, objectFields, locals, lineNumber),
					{
						id: "push" + cap,
						block: "json.push",
						path: "local." + varName,
						value: "{{ local." + itemName + " }}",
						__flowScriptLine: lineNumber
					}
				]
			}
		];
	}

	function buildNaturalFlowScriptCall(blocks, imports, locals, varName, rhs, lineNumber) {
		var call = parseNaturalFlowScriptCall(rhs);
		if (!call) {
			raise("FLOWSCRIPT_UNSUPPORTED_ASSIGNMENT", "Unsupported FlowScript assignment at line " + lineNumber + ": " + rhs,
				null, "Assign a Flow block call, for example const feed = requestable.call(\".Connector.Transaction\");");
		}
		var block = resolveFlowScriptName(call.name, imports);
		var args = splitFlowScriptTopLevel(call.args, ",");
		if (block === "list.map") {
			var mapNodes = buildNaturalListMapNodes(blocks, imports, varName, args, locals, lineNumber);
			if (mapNodes) {
				return mapNodes;
			}
		}
		var node = {};
		if (args.length === 1 && isFlowScriptObjectLiteral(args[0])) {
			node = normalizeNaturalFlowScriptProps(blocks, block, parseFlowScriptObjectLiteral(args[0], lineNumber), locals, lineNumber);
		} else if (block === "requestable.call") {
			node.requestable = isFlowScriptQuoted(args[0]) ? unquoteFlowScriptString(args[0]) : flowScriptRewriteExpression(args[0], locals);
			if (args.length > 1 && isFlowScriptObjectLiteral(args[1])) {
				Object.assign(node, normalizeNaturalFlowScriptProps(blocks, block, parseFlowScriptObjectLiteral(args[1], lineNumber), locals, lineNumber));
			}
		} else if (block === "list.sort") {
			node.items = flowScriptRewriteExpression(args[0] || "local.items", locals);
			if (args.length > 1 && isFlowScriptObjectLiteral(args[1])) {
				Object.assign(node, normalizeNaturalFlowScriptProps(blocks, block, parseFlowScriptObjectLiteral(args[1], lineNumber), locals, lineNumber));
			}
		} else if (block === "list.filter") {
			node.items = flowScriptRewriteExpression(args[0] || "local.items", locals);
			if (args.length > 1 && isFlowScriptObjectLiteral(args[1])) {
				Object.assign(node, normalizeNaturalFlowScriptProps(blocks, block, parseFlowScriptObjectLiteral(args[1], lineNumber), locals, lineNumber));
			} else if (args.length > 1) {
				node.where = flowScriptExpressionFromToken(args[1], locals);
			}
		} else if (block === "http.get") {
			if (args.length > 0 && !isFlowScriptObjectLiteral(args[0])) {
				node.url = flowScriptValueFromToken(args[0], locals, lineNumber);
			}
			if (args.length > 1 && isFlowScriptObjectLiteral(args[1])) {
				Object.assign(node, normalizeNaturalFlowScriptProps(blocks, block, parseFlowScriptObjectLiteral(args[1], lineNumber), locals, lineNumber));
			}
		} else {
			if (args.length > 0 && isFlowScriptObjectLiteral(args[args.length - 1])) {
				node = normalizeNaturalFlowScriptProps(blocks, block, parseFlowScriptObjectLiteral(args[args.length - 1], lineNumber), locals, lineNumber);
			}
		}
		node.block = block;
		if (!node.id) {
			node.id = safeIdentifier(varName);
		}
		if (block === "set") {
			if (!node.path) {
				node.path = "local." + safeIdentifier(varName);
			}
			delete node.out;
		} else if (!node.out) {
			node.out = "local." + safeIdentifier(varName);
		}
		node.__flowScriptLine = lineNumber;
		return [node];
	}

	function buildNaturalFlowScriptAssignment(blocks, imports, locals, varName, rhs, lineNumber) {
		rhs = stripFlowScriptSemicolon(rhs);
		var callWithBody = parseNaturalFlowScriptCallWithBody(rhs);
		if (callWithBody) {
			var nodesWithBody = buildNaturalFlowScriptCall(blocks, imports, locals, varName,
				callWithBody.name + "(" + callWithBody.args + ")", lineNumber);
			if (nodesWithBody.length !== 1) {
				raise("FLOWSCRIPT_UNSUPPORTED_ASSIGNMENT", "Unsupported FlowScript block assignment with body at line " + lineNumber + ": " + rhs,
					null, "Assign one block call with one child body.");
			}
			var nodeWithBody = nodesWithBody[0];
			var slot = nodeWithBody.block === "if" ? "then" : nodeWithBody.block === "json.object" ? "fields" : "nodes";
			nodeWithBody[slot] = parseFlowScriptBodyNodes(blocks, imports, locals, callWithBody.body);
			return [nodeWithBody];
		}
		if (parseNaturalFlowScriptCall(rhs)) {
			return buildNaturalFlowScriptCall(blocks, imports, locals, varName, rhs, lineNumber);
		}
		return [{
			id: safeIdentifier(varName),
			block: "set",
			path: "local." + safeIdentifier(varName),
			value: flowScriptValueFromToken(rhs, locals, lineNumber),
			__flowScriptLine: lineNumber
		}];
	}

	function buildNaturalScopeAssignment(blocks, imports, locals, scopePath, rhs, lineNumber) {
		rhs = stripFlowScriptSemicolon(rhs);
		var call = parseNaturalFlowScriptCall(rhs);
		if (call) {
			var block = resolveFlowScriptName(call.name, imports);
			var args = splitFlowScriptTopLevel(call.args, ",");
			var node = {};
			if (args.length === 1 && isFlowScriptObjectLiteral(args[0])) {
				node = normalizeNaturalFlowScriptProps(blocks, block, parseFlowScriptObjectLiteral(args[0], lineNumber), locals, lineNumber);
			} else if (args.length > 0 && isFlowScriptObjectLiteral(args[args.length - 1])) {
				node = normalizeNaturalFlowScriptProps(blocks, block, parseFlowScriptObjectLiteral(args[args.length - 1], lineNumber), locals, lineNumber);
			}
			node.block = block;
			node.__flowScriptLine = lineNumber;
			if (block === "set") {
				node.path = scopePath;
				if (node.id === undefined || node.id === null || String(node.id).trim() === "") {
					node.id = safeIdentifier(scopePath.replace(/^(local|result)\./, ""));
				}
			} else {
				node.out = scopePath;
				if (node.id === undefined || node.id === null || String(node.id).trim() === "") {
					node.id = safeIdentifier(scopePath.replace(/^(local|result)\./, ""));
				}
			}
			return [node];
		}
		return [{
			id: safeIdentifier(scopePath.replace(/^(local|result)\./, "")),
			block: "set",
			path: scopePath,
			value: flowScriptValueFromToken(rhs, locals, lineNumber),
			__flowScriptLine: lineNumber
		}];
	}

	function buildNaturalFlowScriptReturn(expr, locals, lineNumber) {
		expr = stripFlowScriptSemicolon(String(expr || "").replace(/^return\b/, ""));
		if (expr === "result") {
			return [];
		}
		if (isFlowScriptObjectLiteral(expr)) {
			return naturalFlowScriptObjectFields(expr).map(function (field) {
				return {
					id: "return" + capitalizedIdentifier(field.key),
					block: "set",
					path: "result." + field.key,
					value: flowScriptValueFromToken(field.token, locals, lineNumber),
					__flowScriptLine: lineNumber
				};
			});
		}
		return [{
			id: "returnValue",
			block: "return",
			value: flowScriptValueFromToken(expr, locals, lineNumber),
			__flowScriptLine: lineNumber
		}];
	}

	function resolveFlowScriptName(name, imports) {
		name = String(name || "");
		if (name === "return.value") {
			return "return";
		}
		if (imports[name]) {
			return imports[name];
		}
		var dot = name.indexOf(".");
		if (dot > 0) {
			var namespace = name.substring(0, dot);
			var rest = name.substring(dot + 1);
			if (imports[namespace + ".*"]) {
				return imports[namespace + ".*"] + "." + rest;
			}
		}
		return name;
	}

	function parseFlowScriptImport(line, lineNumber, imports) {
		var named = line.match(/^import\s+\{\s*([^}]+)\s*\}\s+from\s+["']([^"']+)["']\s*;?$/);
		if (named) {
			var moduleName = String(named[2] || "").trim();
			splitFlowScriptTopLevel(named[1], ",").forEach(function (part) {
				var match = String(part || "").trim().match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
				if (!match) {
					raise("FLOWSCRIPT_INVALID_IMPORT", "Invalid FlowScript import at line " + lineNumber + ": " + part,
						null, "Use import { call } from \"requestable\" or import { get as httpGet } from \"http\".");
				}
				imports[match[2] || match[1]] = moduleName + "." + match[1];
			});
			return;
		}
		var namespace = line.match(/^import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+)["']\s*;?$/);
		if (namespace) {
			imports[namespace[1] + ".*"] = String(namespace[2] || "").trim();
			return;
		}
		var legacy = line.match(/^import\s+([A-Za-z_][\w]*(?:\.[A-Za-z_*][\w*]*)*)(?:\s+as\s+([A-Za-z_][\w]*))?\s*;?$/);
		if (legacy) {
			if (legacy[1].indexOf("*") === -1) {
				var parts = legacy[1].split(".");
				imports[legacy[2] || parts[parts.length - 1]] = legacy[1];
			} else {
				var prefix = legacy[1].replace(/\.\*$/, "");
				imports[legacy[2] ? legacy[2] + ".*" : prefix + ".*"] = prefix;
			}
			return;
		}
		raise("FLOWSCRIPT_INVALID_IMPORT", "Invalid FlowScript import at line " + lineNumber,
			null, "Use import { call } from \"requestable\", import * as requestable from \"requestable\", or import requestable.call.");
	}

	function parseFlowScriptBodyNodes(blocks, imports, locals, body) {
		var root = { version: 1, nodes: [] };
		parseFlowScriptStatementsInto(blocks, imports || {}, Object.assign({}, locals || {}), root, flowScriptStatements(body));
		return root.nodes;
	}

	function trackFlowScriptLocalWrite(locals, path) {
		path = String(path || "");
		if (path.indexOf("local.") !== 0) {
			return;
		}
		var name = path.substring("local.".length).split(/[.\[]/)[0];
		if (name) {
			locals[name] = true;
		}
	}

	function trackFlowScriptNodeWrites(locals, node) {
		if (!node || typeof node !== "object") {
			return;
		}
		trackFlowScriptLocalWrite(locals, node.out);
		trackFlowScriptLocalWrite(locals, node.path);
	}

	function parseFlowScriptStatementsInto(blocks, imports, locals, root, statements) {
		var stack = [{ root: root, slot: "nodes" }];
		for (var i = 0; i < statements.length; i++) {
			var lineNumber = statements[i].line;
			var line = statements[i].text;
			if (line === "") {
				continue;
			}
			if (line.match(/^import\s+/)) {
				parseFlowScriptImport(line, lineNumber, imports);
				continue;
			}
			if (line.match(/^(flow|function)\s+/)) {
				continue;
			}
			var declaration = line.match(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([\s\S]+)$/);
			if (declaration) {
				var varName = safeIdentifier(declaration[1]);
				var nodes = buildNaturalFlowScriptAssignment(blocks, imports, locals, varName, declaration[2], lineNumber);
				nodes.forEach(function (node) {
					addFlowScriptNode(stack[stack.length - 1], node);
				});
				locals[varName] = true;
				continue;
			}
			var scopeAssignment = line.match(/^((?:local|result)\.[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])*)\s*=\s*([\s\S]+)$/);
			if (scopeAssignment) {
				buildNaturalScopeAssignment(blocks, imports, locals, scopeAssignment[1], scopeAssignment[2], lineNumber).forEach(function (node) {
					addFlowScriptNode(stack[stack.length - 1], node);
				});
				if (scopeAssignment[1].indexOf("local.") === 0) {
					var assignedLocal = scopeAssignment[1].substring("local.".length).split(/[.\[]/)[0];
					if (assignedLocal) {
						locals[assignedLocal] = true;
					}
				}
				continue;
			}
			if (line.match(/^return(?:\s|;|$)/)) {
				buildNaturalFlowScriptReturn(line, locals, lineNumber).forEach(function (node) {
					addFlowScriptNode(stack[stack.length - 1], node);
				});
				continue;
			}
			if (line === "}" || line === "};") {
				if (stack.length > 1) {
					stack.pop();
				}
				continue;
			}
			if (line === "} else {" || line === "} else{") {
				if (stack.length <= 1) {
					raise("FLOWSCRIPT_INVALID_ELSE", "Unexpected else at line " + lineNumber);
				}
				var previous = stack.pop();
				stack.push({ root: previous.root, slot: "else" });
				continue;
			}
			var ifMatch = line.match(/^if\s*\((.*)\)\s*(\{)?\s*;?$/);
			if (ifMatch) {
				var ifNode = {
					id: "if" + lineNumber,
					block: "if",
					condition: flowScriptExpressionFromToken(ifMatch[1], locals, lineNumber),
					__flowScriptLine: lineNumber
				};
				addFlowScriptNode(stack[stack.length - 1], ifNode);
				if (ifMatch[2]) {
					stack.push({ root: ifNode, slot: "then" });
				}
				continue;
			}
			var match = line.match(/^([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*)\s*\(([\s\S]*)\)\s*(\{)?\s*;?$/);
			if (!match) {
				raise("FLOWSCRIPT_UNSUPPORTED_SYNTAX", "Unsupported FlowScript syntax at line " + lineNumber + ": " + line,
					null, "Use compact FlowScript: function MyFlow({ input, config, result }) { var feed = requestable.call(\".Connector.Transaction\"); var sorted = list.sort(feed.items, { by: current.title }); result.items = sorted; return result }.");
			}
			var block = resolveFlowScriptName(match[1], imports);
			var callArgs = match[2] || "{}";
			var node = isFlowScriptObjectLiteral(callArgs)
				? normalizeNaturalFlowScriptProps(blocks, block, parseFlowScriptObjectLiteral(callArgs, lineNumber), locals, lineNumber)
				: parseFlowScriptArgs(callArgs, lineNumber);
			node.block = block;
			node.__flowScriptLine = lineNumber;
			addFlowScriptNode(stack[stack.length - 1], node);
			trackFlowScriptNodeWrites(locals, node);
			if (match[3]) {
				var slot = block === "if" ? "then" : block === "json.object" ? "fields" : "nodes";
				stack.push({ root: node, slot: slot });
			}
		}
	}

	function parseFlowScript(blocks, code) {
		code = normalizeFlowScriptFunctionSyntax(code);
		var root = { version: 1, nodes: [] };
		parseFlowScriptStatementsInto(blocks, {}, {}, root, flowScriptStatements(code));
		return canonicalFlowDefinition(root);
	}

	function stripFlowScriptMetadata(value) {
		if (Object.prototype.toString.call(value) === "[object Array]") {
			return value.map(stripFlowScriptMetadata);
		}
		if (value && typeof value === "object") {
			var out = {};
			Object.keys(value).forEach(function (key) {
				if (key.indexOf("__flowScript") !== 0) {
					out[key] = stripFlowScriptMetadata(value[key]);
				}
			});
			return out;
		}
		return value;
	}

	function intentTokens(value) {
		return String(value || "")
			.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
			.toLowerCase()
			.split(/[^a-z0-9]+/)
			.filter(function (token) {
				return token.length > 1;
			});
	}

	function expandIntentTokens(tokens) {
		var aliases = {
			add: ["append", "push", "insert"],
			append: ["add", "push"],
			array: ["list", "items"],
			call: ["requestable", "sequence", "transaction", "invoke"],
			email: ["mail", "notify", "notification", "send"],
			fetch: ["get", "http", "request"],
			field: ["by", "path", "key"],
			find: ["search", "select", "query"],
			get: ["fetch", "read"],
			hash: ["sha", "sha256", "digest"],
			http: ["url", "request", "fetch"],
			json: ["object", "parse", "stringify"],
			key: ["by", "field"],
			mail: ["email", "notify", "send"],
			map: ["transform", "select"],
			notify: ["email", "mail", "send"],
			order: ["sort"],
			parse: ["json", "read"],
			pick: ["select", "path"],
			query: ["search", "select"],
			read: ["get", "load"],
			request: ["http", "call", "requestable"],
			requestable: ["call", "sequence", "transaction"],
			search: ["find", "query"],
			select: ["pick", "path", "map"],
			sequence: ["requestable", "call"],
			send: ["email", "mail", "notify"],
			sort: ["order"],
			transaction: ["requestable", "call"],
			uri: ["url", "endpoint"],
			url: ["http", "request"],
			write: ["set", "save"]
		};
		var out = [];
		(tokens || []).forEach(function (token) {
			addUnique(out, token);
			(aliases[token] || []).forEach(function (alias) {
				addUnique(out, alias);
			});
		});
		return out;
	}

	function intentScoreText(text, tokens) {
		text = String(text || "").toLowerCase();
		var score = 0;
		(tokens || []).forEach(function (token) {
			if (!token) {
				return;
			}
			if (text === token) {
				score += 18;
			} else if (text.indexOf(token) !== -1) {
				score += 6;
			}
		});
		return score;
	}

	function flowScriptBlockCandidateScore(descriptor, wanted) {
		var wantedText = String(wanted || "").toLowerCase();
		var wantedTokens = expandIntentTokens(intentTokens(wanted));
		var blockId = String(descriptor.blockId || descriptor.name || "").toLowerCase();
		var localName = String(descriptor.localName || descriptor.name || "").toLowerCase();
		var namespace = String(descriptor.namespace || "").toLowerCase();
		var tags = (descriptor.tags || []).join(" ").toLowerCase();
		var props = Object.keys(descriptor.props || {}).join(" ").toLowerCase();
		var desc = String(descriptor.description || "").toLowerCase();
		var score = 0;
		if (blockId === wantedText || localName === wantedText) {
			score += 120;
		} else if (blockId.replace(/\./g, "") === wantedText.replace(/\./g, "")) {
			score += 85;
		} else if (blockId.indexOf(wantedText) !== -1 ||
				(blockId.length >= 4 && wantedText.indexOf(blockId) !== -1)) {
			score += 45;
		}
		score += intentScoreText(localName, wantedTokens) * 2;
		score += intentScoreText(blockId, wantedTokens);
		score += intentScoreText(namespace, wantedTokens);
		score += intentScoreText(tags, wantedTokens);
		score += Math.floor(intentScoreText(props, wantedTokens) / 2);
		score += Math.floor(intentScoreText(desc, wantedTokens) / 3);
		if (wantedTokens.indexOf("fetch") !== -1 && (namespace === "http" || localName === "get" || localName === "request")) {
			score += 40;
		}
		if ((wantedTokens.indexOf("email") !== -1 || wantedTokens.indexOf("mail") !== -1 || wantedTokens.indexOf("notify") !== -1) &&
				(namespace === "email" || blockId.indexOf("email.") === 0)) {
			score += 40;
		}
		if ((wantedTokens.indexOf("sort") !== -1 || wantedTokens.indexOf("order") !== -1) && blockId === "list.sort") {
			score += 40;
		}
		return score;
	}

	function flowScriptBlockCandidates(blocks, wanted, limit) {
		limit = limit || 5;
		var candidates = Object.keys(blocks || {}).map(function (name) {
			var descriptor = blockDescriptor(blocks[name]);
			var score = flowScriptBlockCandidateScore(descriptor, wanted);
			return {
				block: descriptor.blockId,
				score: score,
				confidence: Math.min(1, Math.round((score / 80) * 100) / 100),
				signature: blockSignature(descriptor),
				description: descriptor.description || ""
			};
		}).filter(function (candidate) {
			return candidate.score > 0;
		}).sort(function (a, b) {
			return b.score - a.score || String(a.block).localeCompare(String(b.block));
		});
		if (!candidates.length) {
			return [];
		}
		var best = candidates[0].score;
		var strongThreshold = Math.max(35, Math.floor(best * 0.8));
		return candidates.filter(function (candidate, index) {
			return index === 0 || candidate.score >= strongThreshold;
		}).slice(0, limit);
	}

	function flowScriptPropertyCandidates(props, wanted, limit) {
		limit = limit || 5;
		var wantedTokens = expandIntentTokens(intentTokens(wanted));
		return Object.keys(props || {}).map(function (name) {
			var descriptor = props[name] || {};
			var text = [
				name,
				descriptor.kind || "",
				descriptor.type || "",
				descriptor.mode || "",
				descriptor.description || ""
			].join(" ").toLowerCase();
			var score = String(name).toLowerCase() === String(wanted || "").toLowerCase() ? 100 : intentScoreText(text, wantedTokens);
			return {
				property: name,
				score: score,
				signature: summaryPropertyDescriptor(descriptor),
				description: descriptor.description || ""
			};
		}).filter(function (candidate) {
			return candidate.score > 0;
		}).sort(function (a, b) {
			return b.score - a.score || String(a.property).localeCompare(String(b.property));
		}).slice(0, limit);
	}

	function validateFlowScriptDefinition(blocks, definition) {
		var diagnostics = [];
		function expectedProps(block) {
			return Object.keys(blockCatalog(block).props || {}).sort();
		}
		function walk(nodes) {
			(nodes || []).forEach(function (node) {
				var name = blockName(node);
				var block = blocks[name];
				var line = node.__flowScriptLine || 0;
				if (!block) {
					var candidates = flowScriptBlockCandidates(blocks, name, 5);
					diagnostics.push({
						severity: "error",
						code: "UNKNOWN_BLOCK",
						line: line,
						message: "Unknown Flow block: " + name,
						candidates: candidates,
						next: candidates.length && candidates[0].score >= 35
							? "Try " + candidates[0].block + " first, or call flow-block-get for its exact contract."
							: "No strong palette match. If this is a real domain concept, create a project block with flow-block-code-set, then use it from FlowScript.",
						create: {
							tool: "flow-block-code-set",
							name: name,
							dry: true
						},
						hint: candidates.length
							? "Use one candidate block, inspect it with flow-block-get, or create " + name + " as a project block if none matches."
							: "Create a project block with flow-block-code-set before using " + name + "."
					});
				} else {
					var props = blockCatalog(block).props || {};
					var slotMap = {};
					flowScriptSlotNames(blocks, node).forEach(function (slot) {
						slotMap[slot] = true;
					});
					flowScriptArgKeys(node, Object.keys(slotMap)).forEach(function (key) {
						if (key !== "id" && key !== "comment" && key !== "out" && !props[key]) {
							var propertyCandidates = flowScriptPropertyCandidates(props, key, 5);
							diagnostics.push({
								severity: "error",
								code: "UNKNOWN_BLOCK_PROPERTY",
								line: line,
								block: name,
								property: key,
								message: "Unknown property " + key + " for Flow block " + name + ".",
								expected: expectedProps(block),
								candidates: propertyCandidates,
								next: propertyCandidates.length
									? "Use property " + propertyCandidates[0].property + " if it matches the intent, otherwise inspect the block contract with flow-block-get."
									: "Use only expected properties, or create/patch a project block if this property is part of a new contract.",
								hint: "Use " + name + "({ " + expectedProps(block).map(function (prop) { return prop + ": ..."; }).join(", ") + " })."
							});
						}
					});
				}
				["nodes", "then", "else", "fields"].forEach(function (slot) {
					if (Object.prototype.toString.call(node[slot]) === "[object Array]") {
						walk(node[slot]);
					}
				});
			});
		}
		walk(definition.nodes || []);
		return diagnostics;
	}

	function collectPotentialArrayPaths(schema, prefix, out) {
		schema = normalizeTree(schema);
		if (!schema || typeof schema !== "object") {
			return;
		}
		if (schema.type === "array") {
			addUnique(out, prefix);
			return;
		}
		if (schema.type === "unknown") {
			if (prefix) {
				addUnique(out, prefix);
			}
			return;
		}
		var source = schema.properties || schema;
		Object.keys(source || {}).filter(function (key) {
			return !isSchemaMetaKey(key);
		}).forEach(function (key) {
			collectPotentialArrayPaths(source[key], joinPath(prefix, key), out);
		});
	}

	function flowScriptArrayPathCandidates(basePath, schema) {
		var paths = [];
		collectPotentialArrayPaths(schema, "", paths);
		return paths.map(function (path) {
			return path ? basePath + "." + path : basePath;
		}).filter(function (path) {
			return path !== basePath;
		}).slice(0, 8);
	}

	function flowScriptAnalysisDiagnostics(blocks, analysis) {
		var diagnostics = [];
		if (!analysis || !analysis.nodes) {
			return diagnostics;
		}
		analysis.nodes.forEach(function (node) {
			var catalog = blockCatalog(blocks[node.block]);
			(node.inputs || []).forEach(function (input) {
				var descriptor = catalog.props && catalog.props[input.property] || {};
				var expected = String(descriptor.type || "");
				if (descriptor.kind !== "expression" || expected !== "array" || !input.path) {
					return;
				}
				var schema = schemaForSchemasPath(analysis.schemas || {}, input.path);
				if (!schema) {
					return;
				}
				var actual = schemaSimpleType(schema);
				if (actual === "array" || actual === "unknown") {
					return;
				}
				var candidates = flowScriptArrayPathCandidates(input.path, schema);
				diagnostics.push({
					severity: "warning",
					code: "FLOWSCRIPT_EXPECTED_ARRAY",
					block: node.block,
					property: input.property,
					path: input.path,
					actual: actual,
					candidates: candidates,
					message: node.block + "." + input.property + " expects an array but " + input.path + " is " + actual + ".",
					hint: candidates.length
						? "Use " + candidates[0] + " or another array path from candidates."
						: "Use a path whose schema type is array."
				});
			});
		});
		return diagnostics;
	}

	function flowScriptValidateRequest(blocks, request) {
		request = request || {};
		var code = String(request.code || request.flowScript || "");
		if (code.trim() === "") {
			var source = sourceForFlowRequest(request);
			code = renderFlowScript(blocks, request.name || request.flowName || "Flow", source, request);
		}
		var definition = parseFlowScript(blocks, code);
		var diagnostics = validateFlowScriptDefinition(blocks, definition);
		var clean = stripFlowScriptMetadata(definition);
		var source = sourceFromDefinition(clean);
		var ok = diagnostics.filter(function (diagnostic) {
			return diagnostic.severity === "error";
		}).length === 0;
		var analysis = ok ? analyzeFlowSource(blocks, source, request) : null;
		if (analysis) {
			flowScriptAnalysisDiagnostics(blocks, analysis).forEach(function (diagnostic) {
				diagnostics.push(diagnostic);
			});
		}
		return {
			ok: ok,
			revision: sha256Hex(code),
			code: code,
			definition: clean,
			source: source,
			diagnostics: diagnostics,
			analysis: analysis
		};
	}

	function flowScriptGetRequest(blocks, request) {
		request = request || {};
		var flow = getProjectFlow(request.name || request.flowName, blocks);
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

	function flowCodeName(request) {
		request = request || {};
		var name = request.name || request.flowName || "";
		if (!name && request.qname) {
			var parts = String(request.qname).split(".");
			name = parts[parts.length - 1];
		}
		if (!name) {
			raise("MISSING_FLOW_QNAME", "flow-code requires qname or name.");
		}
		return String(name);
	}

	function flowCodeNameFromCode(code) {
		var match = normalizeFlowScriptFunctionSyntax(code).match(/\b(?:flow|function)\s+([A-Za-z_$][\w$]*)\s*\(/);
		return match ? String(match[1]) : "";
	}

	function flowCodeNameOptional(request, code, fallback) {
		request = request || {};
		var name = request.name || request.flowName || "";
		if (!name && request.qname) {
			var parts = String(request.qname).split(".");
			name = parts[parts.length - 1];
		}
		return String(name || flowCodeNameFromCode(code) || fallback || "FlowScript");
	}

	function flowCodeQName(request, name) {
		request = request || {};
		var project = currentProjectName(request);
		if (request.qname) {
			var qname = String(request.qname);
			if (qname.indexOf(".") !== -1) {
				return qname.charAt(0) === "." && project ? project + qname : qname;
			}
			return project ? project + "." + qname : qname;
		}
		return project ? project + "." + name : String(name);
	}

	function flowCodeDryRun(request) {
		return request && (request.dry === true || request.dryRun === true);
	}

	function flowCodeDraftMode(request) {
		request = request || {};
		return request.draft === true
			|| String(request.draft || "").toLowerCase() === "true"
			|| String(request.mode || "").toLowerCase() === "draft"
			|| String(request.stage || "").toLowerCase() === "draft";
	}

	function flowCodeOfficialMode(request) {
		request = request || {};
		return request.official === true
			|| request.draft === false
			|| String(request.official || "").toLowerCase() === "true"
			|| String(request.mode || "").toLowerCase() === "official"
			|| String(request.stage || "").toLowerCase() === "official";
	}

	function flowCodeMaxDiagnostics(request) {
		request = request || {};
		var value = request.maxDiagnostics !== undefined && request.maxDiagnostics !== null && request.maxDiagnostics !== ""
			? request.maxDiagnostics
			: request.diagnosticLimit !== undefined && request.diagnosticLimit !== null && request.diagnosticLimit !== ""
				? request.diagnosticLimit
				: request.diagnosticsLimit;
		var max = value === undefined || value === null || value === "" ? 8 : parseInt(String(value), 10);
		if (isNaN(max)) {
			max = 8;
		}
		return Math.max(1, Math.min(25, max));
	}

	function flowCodeDiagnostics(diagnostics, severity) {
		return (diagnostics || []).filter(function (diagnostic) {
			return !severity || diagnostic.severity === severity;
		}).map(function (diagnostic) {
			var out = {};
			["severity", "phase", "code", "line", "message", "block", "property", "path", "actual", "expected", "candidates", "next", "create", "hint"].forEach(function (key) {
				if (diagnostic[key] !== undefined && diagnostic[key] !== null && diagnostic[key] !== "") {
					out[key] = diagnostic[key];
				}
			});
			return out;
		});
	}

	function flowCodeDiagnosticReport(diagnostics, request, severity) {
		var all = flowCodeDiagnostics(diagnostics, severity);
		var limit = flowCodeMaxDiagnostics(request);
		var shown = all.slice(0, limit);
		return {
			diagnosticCount: all.length,
			diagnosticsShown: shown.length,
			hasMore: all.length > shown.length,
			diagnostics: shown
		};
	}

	function flowCodeAddDiagnosticReport(out, diagnostics, request, severity) {
		var report = flowCodeDiagnosticReport(diagnostics, request, severity);
		out.diagnosticCount = report.diagnosticCount;
		out.diagnosticsShown = report.diagnosticsShown;
		out.hasMore = report.hasMore;
		out.diagnostics = report.diagnostics;
		return out;
	}

	function flowCodeParseDiagnostics(error) {
		var message = String(error && error.message || error || "FlowScript parse failed.");
		var line = 0;
		var match = message.match(/(?:line|at line)\s+(\d+)/i);
		if (match) {
			line = parseInt(match[1], 10) || 0;
		}
		return [{
			severity: "error",
			phase: "parse",
			code: String(error && error.code || "FLOWSCRIPT_PARSE_FAILED"),
			line: line,
			message: message,
			hint: error && error.hint ? String(error.hint) : "Fix the FlowScript syntax and retry."
		}];
	}

	function flowCodeExceptionDetails(error, request) {
		var details = error && error.details;
		if (Object.prototype.toString.call(details) === "[object Array]") {
			return flowCodeDiagnosticReport(details, request);
		}
		if (details !== undefined && details !== null) {
			return details;
		}
		return flowCodeDiagnosticReport(flowCodeParseDiagnostics(error), request);
	}

	function flowCodeError(code, message, hint, details) {
		var out = {
			code: String(code || "FLOW_CODE_ERROR"),
			message: String(message || "")
		};
		if (hint) {
			out.hint = String(hint);
		}
		if (details !== undefined && details !== null) {
			out.details = details;
		}
		return out;
	}

	function flowCodeRevisionForSource(blocks, name, source, request) {
		var code = renderFlowScript(blocks, name, source, Object.assign({}, request || {}, { includeHeader: false }));
		return sha256Hex(code);
	}

	function flowCodeValidate(blocks, request, name, code) {
		try {
			var validation = flowScriptValidateRequest(blocks, Object.assign({}, request, {
				name: name,
				code: code
			}));
			return {
				validation: validation,
				warnings: flowCodeDiagnostics(validation.diagnostics, "warning"),
				error: null
			};
		} catch (e) {
			return {
				validation: null,
				warnings: [],
				error: flowCodeError(String(e.code || "FLOWSCRIPT_PARSE_FAILED"),
					String(e.message || e || "FlowScript validation failed."),
					e.hint || "Fix the FlowScript syntax and retry.",
					flowCodeExceptionDetails(e, request))
			};
		}
	}

	function flowCodeDraftRead(name) {
		var file = projectFlowDraftCodeFile(name);
		if (!file.isFile()) {
			return null;
		}
		var code = String(FileUtils.readFileToString(file, "UTF-8"));
		return {
			ok: true,
			name: String(name),
			format: "flowscript",
			canonical: false,
			draft: true,
			file: String(file.getAbsolutePath()),
			codeFile: String(file.getAbsolutePath()),
			revision: sha256Hex(code),
			code: code
		};
	}

	function flowCodeCurrentForEdit(blocks, request, name, preferDraft) {
		var draft = preferDraft ? flowCodeDraftRead(name) : null;
		if (draft) {
			draft.qname = flowCodeQName(request, name);
			return draft;
		}
		var current = flowCodeGetRequest(blocks, Object.assign({}, request, {
			name: name,
			draft: false,
			mode: "",
			stage: ""
		}));
		current.draft = false;
		return current;
	}

	function flowCodeGetRequest(blocks, request) {
		request = request || {};
		var name = flowCodeName(request);
		if (!flowCodeOfficialMode(request)) {
			var draft = flowCodeDraftRead(name);
			if (draft) {
				draft.qname = flowCodeQName(request, name);
				draft.next = "Working copy loaded. Check with flow-code-check, run with flow-code-run, then save with flow-code-promote.";
				return draft;
			}
		}
		var current = flowScriptGetRequest(blocks, Object.assign({}, request, { name: name, includeHeader: false }));
		return {
			ok: true,
			qname: flowCodeQName(request, name),
			name: name,
			format: current.format,
			canonical: current.canonical === true,
			file: current.file,
			codeFile: current.codeFile,
			codeFromMirror: current.codeFromMirror,
			codeMirrorStale: current.codeMirrorStale,
			revision: current.revision,
			code: current.code
		};
	}

	function flowCodeOfficialRead(blocks, request, name) {
		try {
			return flowCodeGetRequest(blocks, Object.assign({}, request, {
				name: name,
				draft: false,
				mode: "",
				stage: ""
			}));
		} catch (e) {
			if (String(e.code || "") !== "UNKNOWN_FLOW") {
				throw e;
			}
			return null;
		}
	}

	function flowCodeStatusRequest(blocks, request) {
		request = request || {};
		var name = flowCodeName(request);
		var draft = flowCodeDraftRead(name);
		var official = flowCodeOfficialRead(blocks, request, name);
		var dirty = draft !== null && (!official || draft.revision !== official.revision);
		return {
			ok: true,
			qname: flowCodeQName(request, name),
			name: name,
			exists: official !== null,
			dirty: dirty,
			workingCopy: draft !== null,
			revision: draft ? draft.revision : official ? official.revision : "",
			workingRevision: draft ? draft.revision : "",
			officialRevision: official ? official.revision : "",
			codeFile: draft ? draft.codeFile : official ? official.codeFile : "",
			workingCodeFile: draft ? draft.codeFile : "",
			officialCodeFile: official ? official.codeFile : "",
			next: dirty
				? "Working copy differs from the official Flow. Run/check it, promote it to save, or discard it."
				: "No unsaved FlowScript working copy."
		};
	}

	function flowCodeDiscardRequest(blocks, request) {
		request = request || {};
		var name = flowCodeName(request);
		var draftFile = projectFlowDraftCodeFile(name);
		var discarded = false;
		if (draftFile.isFile()) {
			discarded = draftFile["delete"]();
		}
		var official = flowCodeOfficialRead(blocks, request, name);
		return {
			ok: true,
			qname: flowCodeQName(request, name),
			name: name,
			exists: official !== null,
			dirty: false,
			workingCopy: false,
			discarded: discarded,
			revision: official ? official.revision : "",
			officialRevision: official ? official.revision : "",
			codeFile: official ? official.codeFile : "",
			officialCodeFile: official ? official.codeFile : "",
			next: discarded
				? "Working copy discarded. The official Flow is now the active source."
				: "No FlowScript working copy existed."
		};
	}

	function flowCodeDraftSetRequest(blocks, request, name, code) {
		var file = projectFlowDraftCodeFile(name);
		var current = null;
		try {
			current = flowCodeCurrentForEdit(blocks, request, name, true);
		} catch (e) {
			if (String(e.code || "") !== "UNKNOWN_FLOW") {
				throw e;
			}
		}
		var expectedRevision = request.revision || request.baseRevision || request.baseHash;
		if (expectedRevision && current && String(expectedRevision) !== current.revision) {
			return {
				ok: false,
				qname: flowCodeQName(request, name),
				name: name,
				draft: true,
				revision: current.revision,
				error: flowCodeError("FLOW_CODE_DRAFT_REVISION_MISMATCH",
					"FlowScript draft changed since it was read: " + name,
					"Call flow-code-get again and regenerate the patch from the new working copy revision."),
				warnings: []
			};
		}
		var normalized = normalizeFlowScriptCode(stripFlowScriptMirrorHeader(code));
		file.getParentFile().mkdirs();
		FileUtils.writeStringToFile(file, normalized, "UTF-8");
		var revision = sha256Hex(normalized);
		var checked = flowCodeValidate(blocks, request, name, normalized);
		var out = {
			ok: checked.error === null && checked.validation && checked.validation.ok === true,
			qname: flowCodeQName(request, name),
			name: name,
			draft: true,
			written: true,
			format: "flowscript",
			canonical: false,
			file: String(file.getAbsolutePath()),
			codeFile: String(file.getAbsolutePath()),
			revision: revision,
			oldRevision: current ? current.revision : null,
			warnings: checked.warnings
		};
		if (out.ok) {
			flowCodeAddDiagnosticReport(out, checked.validation.diagnostics || [], request);
			out.next = "Working copy check passed. Run with flow-code-run without sending code, then save with flow-code-promote.";
		} else {
			out.error = checked.error || flowCodeError("FLOWSCRIPT_VALIDATION_FAILED", "FlowScript validation failed.",
				"Patch the working copy and retry flow-code-check.", flowCodeDiagnosticReport(checked.validation.diagnostics, request));
		}
		return out;
	}

	function flowCodeSetRequest(blocks, request) {
		request = request || {};
		var name = flowCodeName(request);
		var code = request.code !== undefined && request.code !== null ? String(request.code) : "";
		if (code.trim() === "") {
			return {
				ok: false,
				qname: flowCodeQName(request, name),
				name: name,
				error: flowCodeError("MISSING_CODE", "flow-code-set requires code."),
				warnings: []
			};
		}
		if (!flowCodeOfficialMode(request)) {
			return flowCodeDraftSetRequest(blocks, request, name, code);
		}
		var current = null;
		try {
			current = flowCodeGetRequest(blocks, Object.assign({}, request, { name: name }));
		} catch (e) {
			if (String(e.code || "") !== "UNKNOWN_FLOW") {
				throw e;
			}
		}
		var expectedRevision = request.revision || request.baseRevision || request.baseHash;
		if (expectedRevision && current && String(expectedRevision) !== current.revision) {
			return {
				ok: false,
				qname: flowCodeQName(request, name),
				name: name,
				revision: current.revision,
				error: flowCodeError("FLOW_CODE_REVISION_MISMATCH",
					"FlowScript changed since it was read: " + name,
					"Call flow-code-get again and regenerate the patch from the new revision."),
				warnings: []
			};
		}
		var validation = flowScriptValidateRequest(blocks, Object.assign({}, request, { name: name, code: code }));
		var warnings = flowCodeDiagnostics(validation.diagnostics, "warning");
		if (!validation.ok) {
			return {
				ok: false,
				qname: flowCodeQName(request, name),
				name: name,
				revision: current ? current.revision : null,
				error: flowCodeError("FLOWSCRIPT_VALIDATION_FAILED", "FlowScript validation failed.",
					"Fix the reported diagnostics and retry.", flowCodeDiagnosticReport(validation.diagnostics, request)),
				warnings: warnings
			};
		}
		var saved = null;
		if (!flowCodeDryRun(request)) {
			saved = setProjectFlow(blocks, name, validation.source, request);
		}
		var revision = saved && saved.codeRevision
			? saved.codeRevision
			: flowCodeRevisionForSource(blocks, name, validation.source, request);
		return {
			ok: true,
			qname: flowCodeQName(request, name),
			name: name,
			dry: flowCodeDryRun(request),
			format: "flowscript",
			canonical: true,
			file: saved ? saved.file : (current ? current.file : ""),
			codeFile: saved ? saved.codeFile : (current ? current.codeFile : ""),
			revision: revision,
			oldRevision: current ? current.revision : null,
			warnings: warnings
		};
	}

	function flowCodePatchRequest(blocks, request) {
		request = request || {};
		var name = flowCodeName(request);
		var current = null;
		try {
			current = flowCodeCurrentForEdit(blocks, request, name, !flowCodeOfficialMode(request));
		} catch (e) {
			if (String(e.code || "") !== "UNKNOWN_FLOW" ||
					request.code === undefined || request.code === null || String(request.code).trim() === "") {
				throw e;
			}
			return flowCodeSetRequest(blocks, Object.assign({}, request, {
				name: name,
				qname: flowCodeQName(request, name)
			}));
		}
		var expectedRevision = request.revision || request.baseRevision || request.baseHash;
		if (expectedRevision && String(expectedRevision) !== current.revision) {
			return {
				ok: false,
				qname: flowCodeQName(request, name),
				name: name,
				draft: current.draft === true,
				revision: current.revision,
				error: flowCodeError("FLOW_CODE_REVISION_MISMATCH",
					"FlowScript changed since it was read: " + name,
					"Call flow-code-get again and regenerate the patch from the new revision."),
				warnings: []
			};
		}
		var patch = request.codepatch || request.patch || request.unifiedDiff || request.diff || "";
		var code = request.code !== undefined && request.code !== null
			? String(request.code)
			: applyUnifiedPatchText(current.code, patch).content;
		if (!flowCodeOfficialMode(request)) {
			return flowCodeDraftSetRequest(blocks, Object.assign({}, request, {
				name: name,
				qname: flowCodeQName(request, name),
				revision: current.revision
			}), name, code);
		}
		return flowCodeSetRequest(blocks, Object.assign({}, request, {
			name: name,
			qname: flowCodeQName(request, name),
			code: code,
			revision: current.revision
		}));
	}

	function blockCodePatchRequest(blocks, request) {
		request = request || {};
		var name = String(request.name || request.block || "").trim();
		if (!name) {
			return {
				ok: false,
				name: name,
				error: flowCodeError("MISSING_BLOCK_NAME", "flow-block-code-patch requires name."),
				warnings: []
			};
		}
		var current = getBlockSource(blocks, name, Object.assign({}, request, { detail: "full" }));
		if ((current.format !== "flowscript" && current.format !== "blockjs") || !current.code) {
			return {
				ok: false,
				name: name,
				revision: current.codeRevision || "",
				error: flowCodeError("BLOCK_NOT_CANONICAL_CODE",
					"Block " + name + " is not stored as canonical .block.js.",
					"Use flow-block-code-get only for .block.js blocks, or duplicate/migrate the block first."),
				warnings: []
			};
		}
		var expectedRevision = request.revision || request.baseRevision || request.baseHash;
		if (expectedRevision && String(expectedRevision) !== current.codeRevision) {
			return {
				ok: false,
				name: name,
				revision: current.codeRevision,
				error: flowCodeError("BLOCK_CODE_REVISION_MISMATCH",
					"FlowScript block changed since it was read: " + name,
					"Call flow-block-code-get again and regenerate the patch from the new revision."),
				warnings: []
			};
		}
		var patch = request.codepatch || request.patch || request.unifiedDiff || request.diff || "";
		var code = request.code !== undefined && request.code !== null
			? String(request.code)
			: applyUnifiedPatchText(current.code, patch).content;
		var write = setProjectBlockCode(blocks, name, Object.assign({}, request, {
			name: name,
			code: code,
			revision: current.codeRevision
		}));
		return Object.assign({}, write, {
			oldRevision: current.codeRevision
		});
	}

	function blockCodeGetRequest(blocks, request) {
		request = request || {};
		var name = String(request.name || request.block || "").trim();
		if (!name) {
			return {
				ok: false,
				name: name,
				error: flowCodeError("MISSING_BLOCK_NAME", "flow-block-code-get requires name."),
				warnings: []
			};
		}
		var block = getBlockSource(blocks, name, Object.assign({}, request, {
			detail: "full",
			includeMeta: true
		}));
		if ((block.format === "flowscript" || block.format === "blockjs") && block.code) {
			var direct = {
				ok: true,
				name: name,
				origin: block.origin,
				format: block.format,
				implementationRuntime: block.implementationRuntime,
				canonical: true,
				revision: block.codeRevision || "",
				code: block.code,
				descriptor: block.descriptor,
				warnings: []
			};
			if (request.includeSources === true || String(request.includeSources || "") === "true") {
				direct.codeFile = block.codeFile;
				direct.implementationSource = block.implementationSource;
			}
			return direct;
		}
		if (block.implementationRuntime !== "flow") {
			return {
				ok: false,
				name: name,
				error: flowCodeError("BLOCK_NOT_FLOWSCRIPT", "Block " + name + " is implemented with " + block.implementationRuntime + ".",
					"Use flow-block-get for legacy descriptor-backed Rhino blocks, or migrate the block to canonical .block.js."),
				warnings: []
			};
		}
		var validation = flowScriptValidateRequest(blocks, Object.assign({}, request, {
			name: name,
			flowSource: block.implementationSource,
			includeHeader: false,
			includeImplicitReturn: false
		}));
		var meta = flowScriptBlockMetaFromRequest(name, { descriptor: block.descriptor });
		var code = flowScriptBlockCodeSource(name, validation.code, meta);
		var out = {
			ok: validation.ok !== false,
			name: name,
			origin: block.origin,
			format: "flowscript-mirror",
			canonical: false,
			revision: sha256Hex(code),
			code: code,
			descriptor: block.descriptor,
			diagnostics: validation.diagnostics || [],
			warnings: (validation.diagnostics || []).filter(function (diagnostic) {
				return diagnostic.severity === "warning";
			}),
			next: "Call flow-block-code-set with this full _meta + function code to migrate the project-local block to canonical .block.js."
		};
		if (request.includeSources === true || String(request.includeSources || "") === "true") {
			out.descriptorSource = block.descriptorSource;
			out.implementationSource = block.implementationSource;
		}
		return out;
	}

	function flowCodeRgExtract(code, matcher, context, limit) {
		var lines = String(code || "").split(/\r?\n/);
		var extracts = [];
		for (var i = 0; i < lines.length && extracts.length < limit; i++) {
			matcher.lastIndex = 0;
			if (matcher.test(lines[i])) {
				var start = Math.max(0, i - context);
				var end = Math.min(lines.length - 1, i + context);
				extracts.push({
					line: i + 1,
					startLine: start + 1,
					endLine: end + 1,
					code: lines.slice(start, end + 1).join("\n")
				});
			}
		}
		return extracts;
	}

	function codeRgMatcher(request, toolName) {
		var pattern = String(request && request.pattern || "");
		if (!pattern) {
			raise("MISSING_PATTERN", String(toolName || "code-rg") + " requires pattern.");
		}
		if (request.regex === true) {
			return new RegExp(pattern, request.caseSensitive === true ? "g" : "gi");
		}
		var escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		return new RegExp(escaped, request.caseSensitive === true ? "g" : "gi");
	}

	function flowCodeRgMatcher(request) {
		return codeRgMatcher(request, "flow-code-rg");
	}

	function flowCodeRgRequest(blocks, request) {
		request = request || {};
		var matcher = flowCodeRgMatcher(request);
		var context = Math.max(0, Math.min(20, Number(request.context || request.contextLines || 2)));
		var limit = Math.max(1, Math.min(100, Number(request.limit || 20)));
		var targets = [];
		if (request.qname || request.name || request.flowName) {
			targets.push(flowCodeGetRequest(blocks, request));
		} else {
			listProjectFlows().flows.forEach(function (flow) {
				targets.push(flowCodeGetRequest(blocks, Object.assign({}, request, { name: flow.name, qname: null })));
			});
		}
		var extracts = [];
		targets.forEach(function (target) {
			if (extracts.length >= limit) {
				return;
			}
			flowCodeRgExtract(target.code, matcher, context, limit - extracts.length).forEach(function (extract) {
				extracts.push(Object.assign({
					qname: target.qname,
					name: target.name,
					revision: target.revision
				}, extract));
			});
		});
		return {
			ok: true,
			qname: request.qname ? String(request.qname) : null,
			revision: targets.length === 1 ? targets[0].revision : null,
			extracts: extracts
		};
	}

	function blockCodeRgTargets(blocks, request) {
		request = request || {};
		var targetName = String(request.name || request.block || "").trim();
		if (targetName) {
			var target = getBlockSource(blocks, targetName, Object.assign({}, request, { detail: "full" }));
			return (target.format === "flowscript" || target.format === "blockjs") && target.code ? [target] : [];
		}
		var origin = String(request.origin || "").trim();
		var provider = String(request.provider || "").trim();
		var namespace = String(request.namespace || "").trim();
		return Object.keys(blocks || {}).sort().map(function (name) {
			var block = blocks[name];
			if (String(block && block.__flowFormat || "") !== "flowscript-block") {
				return null;
			}
			if (origin && String(block.__flowOrigin || "") !== origin) {
				return null;
			}
			if (provider && String(block.__flowProvider || "") !== provider) {
				return null;
			}
			if (namespace && String(name).indexOf(namespace + ".") !== 0) {
				return null;
			}
			return getBlockSource(blocks, name, Object.assign({}, request, { detail: "full" }));
		}).filter(function (target) {
			return target && (target.format === "flowscript" || target.format === "blockjs") && target.code;
		});
	}

	function blockCodeRgRequest(blocks, request) {
		request = request || {};
		var matcher = codeRgMatcher(request, "flow-block-code-rg");
		var context = Math.max(0, Math.min(20, Number(request.context || request.contextLines || 2)));
		var limit = Math.max(1, Math.min(100, Number(request.limit || 20)));
		var targets = blockCodeRgTargets(blocks, request);
		var extracts = [];
		targets.forEach(function (target) {
			if (extracts.length >= limit) {
				return;
			}
			flowCodeRgExtract(target.code, matcher, context, limit - extracts.length).forEach(function (extract) {
				extracts.push(Object.assign({
					name: target.name,
					origin: target.origin,
					revision: target.codeRevision
				}, extract));
			});
		});
		return {
			ok: true,
			name: request.name ? String(request.name) : null,
			revision: targets.length === 1 ? targets[0].codeRevision : null,
			totalTargets: targets.length,
			extracts: extracts
		};
	}

	function flowCodeCompileRequest(blocks, request, fallbackName) {
		request = request || {};
		var code = request.code !== undefined && request.code !== null ? String(request.code)
			: request.flowScript !== undefined && request.flowScript !== null ? String(request.flowScript)
				: "";
		var name = flowCodeNameOptional(request, code, fallbackName);
		var current = null;
		if (code.trim() === "") {
			current = flowCodeCurrentForEdit(blocks, request, name, !flowCodeOfficialMode(request));
			code = current.code;
			name = current.name || name;
		}
		var checked = flowCodeValidate(blocks, request, name, code);
		var revision = current ? current.revision : sha256Hex(normalizeFlowScriptCode(stripFlowScriptMirrorHeader(code)));
		if (checked.error || !checked.validation || !checked.validation.ok) {
			return {
				ok: false,
				qname: flowCodeQName(request, name),
				name: name,
				draft: current && current.draft === true,
				revision: revision,
				codeFile: current ? current.codeFile : "",
				error: checked.error || flowCodeError("FLOWSCRIPT_VALIDATION_FAILED", "FlowScript validation failed.",
					"Fix the reported diagnostics and retry.", flowCodeDiagnosticReport(checked.validation.diagnostics, request)),
				warnings: checked.warnings
			};
		}
		return {
			ok: true,
			qname: flowCodeQName(request, name),
			name: name,
			code: code,
			draft: current && current.draft === true,
			codeFile: current ? current.codeFile : "",
			revision: revision,
			modelRevision: flowCodeRevisionForSource(blocks, name, checked.validation.source, request),
			warnings: checked.warnings,
			validation: checked.validation
		};
	}

	function flowCodeCheckRequest(blocks, request) {
		request = request || {};
		var compiled = flowCodeCompileRequest(blocks, request, "FlowScriptCheck");
		if (!compiled.ok) {
			return compiled;
		}
		return flowCodeAddDiagnosticReport({
			ok: true,
			qname: compiled.qname,
			name: compiled.name,
			draft: compiled.draft === true,
			revision: compiled.revision,
			codeFile: compiled.codeFile || "",
			warnings: compiled.warnings || [],
			next: compiled.draft === true
				? "Check passed. Run with flow-code-run without sending code, then save with flow-code-promote."
				: "Check passed."
		}, compiled.validation.diagnostics || [], request);
	}

	function flowCodeRunRequest(blocks, request) {
		request = request || {};
		var compiled = flowCodeCompileRequest(blocks, request, "FlowScriptRun");
		if (!compiled.ok) {
			return compiled;
		}
		var execution = runFlowRequest(Object.assign({}, request, {
			name: compiled.name,
			flowName: compiled.name,
			qname: compiled.qname,
			flowSource: compiled.validation.source,
			definition: null
		}), blocks);
		execution.qname = compiled.qname;
		execution.name = compiled.name;
		execution.revision = compiled.revision;
		execution.draft = compiled.draft === true;
		if (compiled.warnings && compiled.warnings.length) {
			execution.warnings = compiled.warnings;
		}
		return execution;
	}

	function flowCodeAnalyzeRequest(blocks, request) {
		request = request || {};
		var compiled = flowCodeCompileRequest(blocks, request, "FlowScriptAnalyze");
		if (!compiled.ok) {
			return compiled;
		}
		var analysis = analyzeFlowSource(blocks, compiled.validation.source, request);
		analysis.qname = compiled.qname;
		analysis.name = compiled.name;
		analysis.revision = compiled.revision;
		analysis.draft = compiled.draft === true;
		if (compiled.warnings && compiled.warnings.length) {
			analysis.warnings = compiled.warnings;
		}
		return analysis;
	}

	function flowCodePromoteRequest(blocks, request) {
		request = Object.assign({}, request || {}, { draft: true });
		var name = flowCodeName(request);
		var current = request.code !== undefined && request.code !== null
			? {
				name: name,
				code: normalizeFlowScriptCode(stripFlowScriptMirrorHeader(String(request.code))),
				revision: sha256Hex(normalizeFlowScriptCode(stripFlowScriptMirrorHeader(String(request.code)))),
				codeFile: ""
			}
			: flowCodeDraftRead(name);
		if (!current) {
			return {
				ok: false,
				qname: flowCodeQName(request, name),
				name: name,
				draft: true,
				error: flowCodeError("FLOW_CODE_DRAFT_MISSING",
					"No FlowScript draft exists for " + name + ".",
					"Create a working copy with flow-code-set before promoting."),
				warnings: []
			};
		}
		var expectedRevision = request.revision || request.baseRevision || request.baseHash;
		if (expectedRevision && String(expectedRevision) !== current.revision) {
			return {
				ok: false,
				qname: flowCodeQName(request, name),
				name: name,
				draft: true,
				revision: current.revision,
				error: flowCodeError("FLOW_CODE_DRAFT_REVISION_MISMATCH",
					"FlowScript draft changed since it was checked: " + name,
					"Run flow-code-check again and promote with the latest working copy revision."),
				warnings: []
			};
		}
		var checked = flowCodeValidate(blocks, request, name, current.code);
		if (checked.error || !checked.validation || !checked.validation.ok) {
			return {
				ok: false,
				qname: flowCodeQName(request, name),
				name: name,
				draft: true,
				revision: current.revision,
				error: checked.error || flowCodeError("FLOWSCRIPT_VALIDATION_FAILED", "FlowScript validation failed.",
					"Patch the working copy and retry flow-code-check.", flowCodeDiagnosticReport(checked.validation.diagnostics, request)),
				warnings: checked.warnings
			};
		}
		var saved = setProjectFlow(blocks, name, checked.validation.source, Object.assign({}, request, {
			code: current.code,
			draft: false,
			mode: "",
			stage: ""
		}));
		var draftFile = projectFlowDraftCodeFile(name);
		var draftCleared = false;
		if (draftFile.isFile()) {
			draftCleared = draftFile["delete"]();
		}
		return {
			ok: true,
			qname: flowCodeQName(request, name),
			name: name,
			draft: false,
			promoted: true,
			format: "flowscript",
			canonical: true,
			revision: saved && saved.codeRevision ? saved.codeRevision : flowCodeRevisionForSource(blocks, name, checked.validation.source, request),
			draftRevision: current.revision,
			draftCleared: draftCleared,
			file: saved ? saved.file : "",
			codeFile: saved ? saved.codeFile : "",
			warnings: checked.warnings,
			saved: saved
		};
	}

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
		return !!text.match(/^(?:\/\/[^\n]*\n\s*)*(?:import\s+|const\s+_meta\s*=|flow\s+[A-Za-z_$][\w$]*\s*\(|function\s+[A-Za-z_$][\w$]*\s*\()/);
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
			return getProjectFlow(name, blocks || loadBlocks()).source;
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
		var storage = projectFlowStorage(name);
		var codeFile = writeProjectFlowCodeCanonical(blocks, name, source, args);
		var yamlFile = null;
		if (args && (args.writeYaml === true || args.writeYamlMirror === true || args.saveYaml === true)) {
			storage.yamlFile.getParentFile().mkdirs();
			FileUtils.writeStringToFile(storage.yamlFile, String(source), "UTF-8");
			yamlFile = storage.yamlFile;
		}
		return {
			ok: true,
			name: String(name),
			format: "flowscript",
			file: codeFile.file,
			sourceFile: yamlFile ? String(yamlFile.getAbsolutePath()) : (storage.yamlFile.isFile() ? String(storage.yamlFile.getAbsolutePath()) : ""),
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
		var projectSource = projectFlowSourceIfAvailable(blocks, args);
		if (projectSource !== null) {
			return projectSource;
		}
		if (args.flowSource !== undefined && args.flowSource !== null && String(args.flowSource).trim() !== "") {
			return sourceForMaybeFlowScript(blocks, args, args.flowSource);
		}
		return getProjectFlow(args.name || args.flowName, blocks).source;
	}

	function outputSchemaForFlowSource(flowSource) {
		var definition = parseSource(sourceForMaybeFlowScript(loadBlocks(), {}, flowSource));
		return definition.output || definition.outputs || {};
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

	function stripXmlPrefix(value) {
		var text = String(value || "");
		var index = text.indexOf(":");
		return index === -1 ? text : text.substring(index + 1);
	}

	function xsdScalarType(type) {
		type = stripXmlPrefix(type);
		if (type === "boolean") {
			return { type: "boolean" };
		}
		if (["byte", "short", "int", "integer", "long", "nonNegativeInteger", "positiveInteger"].indexOf(type) !== -1) {
			return { type: "integer" };
		}
		if (["decimal", "double", "float"].indexOf(type) !== -1) {
			return { type: "number" };
		}
		if (["string", "anyURI", "date", "dateTime", "time"].indexOf(type) !== -1) {
			return { type: "string" };
		}
		return null;
	}

	function childElementsByLocalName(node, localName) {
		var out = [];
		var children = node ? node.getChildNodes() : null;
		for (var i = 0; children && i < children.getLength(); i++) {
			var child = children.item(i);
			if (child.getNodeType && child.getNodeType() === 1 && String(child.getLocalName ? child.getLocalName() : stripXmlPrefix(child.getNodeName())) === localName) {
				out.push(child);
			}
		}
		return out;
	}

	function descendantElementsByLocalName(node, localName) {
		var out = [];
		var children = node ? node.getChildNodes() : null;
		for (var i = 0; children && i < children.getLength(); i++) {
			var child = children.item(i);
			if (!child.getNodeType || child.getNodeType() !== 1) {
				continue;
			}
			if (String(child.getLocalName ? child.getLocalName() : stripXmlPrefix(child.getNodeName())) === localName) {
				out.push(child);
			}
			descendantElementsByLocalName(child, localName).forEach(function (match) {
				out.push(match);
			});
		}
		return out;
	}

	function attr(node, name) {
		return node && node.hasAttribute && node.hasAttribute(name) ? String(node.getAttribute(name)) : "";
	}

	function xsdAttributesSchema(complexType) {
		var attributes = descendantElementsByLocalName(complexType, "attribute");
		var properties = {};
		attributes.forEach(function (attribute) {
			var name = attr(attribute, "name");
			if (!name) {
				return;
			}
			properties[name] = xsdScalarType(attr(attribute, "type")) || { type: "string" };
		});
		return Object.keys(properties).length ? { type: "object", properties: properties } : null;
	}

	function xsdElementSchema(element, complexTypes, stack) {
		var type = attr(element, "type");
		var schema = xsdScalarType(type);
		if (!schema && type) {
			schema = xsdComplexTypeSchema(complexTypes[stripXmlPrefix(type)], complexTypes, stack);
		}
		if (!schema) {
			var inlineComplex = childElementsByLocalName(element, "complexType")[0];
			schema = inlineComplex ? xsdComplexTypeSchema(inlineComplex, complexTypes, stack) : { type: "unknown" };
		}
		var maxOccurs = attr(element, "maxOccurs");
		if (maxOccurs === "unbounded" || Number(maxOccurs || 1) > 1) {
			schema = { type: "array", items: schema };
		}
		return schema;
	}

	function xsdComplexTypeSchema(complexType, complexTypes, stack) {
		if (!complexType) {
			return null;
		}
		var name = attr(complexType, "name");
		stack = stack || {};
		if (name && stack[name]) {
			return { type: "object" };
		}
		if (name) {
			stack[name] = true;
		}
		var properties = {};
		var sequence = childElementsByLocalName(complexType, "sequence")[0];
		if (sequence) {
			childElementsByLocalName(sequence, "element").forEach(function (element) {
				var elementName = attr(element, "name");
				if (!elementName) {
					return;
				}
				properties[elementName] = mergeSchema(properties[elementName], xsdElementSchema(element, complexTypes, stack));
			});
		}
		var simpleContent = childElementsByLocalName(complexType, "simpleContent")[0];
		if (simpleContent) {
			var extension = childElementsByLocalName(simpleContent, "extension")[0];
			properties.text = xsdScalarType(attr(extension, "base")) || { type: "string" };
		}
		var attrs = xsdAttributesSchema(complexType);
		if (attrs) {
			properties.attr = attrs;
		}
		if (name) {
			delete stack[name];
		}
		return Object.keys(properties).length ? { type: "object", properties: properties } : { type: "unknown" };
	}

	function learnedXsdOutputSchema(target) {
		var root = projectDir();
		if (!root || !target || !target.project || !target.connector || !target.requestable) {
			return null;
		}
		if (String(new File(root).getName()) !== String(target.project)) {
			return null;
		}
		var file = new File(root, "xsd/internal/" + target.connector + "/" + target.requestable + ".xsd");
		if (!file.isFile()) {
			return null;
		}
		try {
			var factory = Packages.javax.xml.parsers.DocumentBuilderFactory.newInstance();
			factory.setNamespaceAware(true);
			var document = factory.newDocumentBuilder().parse(file);
			var complexTypes = {};
			descendantElementsByLocalName(document.getDocumentElement(), "complexType").forEach(function (complexType) {
				var name = attr(complexType, "name");
				if (name) {
					complexTypes[name] = complexType;
				}
			});
			var responseDataName = target.connector + "__" + target.requestable + "ResponseData";
			return xsdComplexTypeSchema(complexTypes[responseDataName], complexTypes, {});
		} catch (e) {
			return null;
		}
	}

	function requestableOutputSchema(target) {
		target = target || {};
		var projectName = String(target.project || "").trim();
		var connectorName = String(target.connector || "").trim();
		var requestableName = String(target.requestable || target.sequence || target.transaction || "").trim();
		if (!projectName || !requestableName) {
			return null;
		}
		try {
			var qname = projectName + "." + (connectorName ? connectorName + "." : "") + requestableName;
			var dbo = Packages.com.twinsoft.convertigo.engine.Engine.theApp.databaseObjectsManager.getDatabaseObjectByQName(qname);
			if (!dbo) {
				return null;
			}
			var className = String(dbo.getClass().getName());
			if (className === "com.twinsoft.convertigo.beans.flow.Flow") {
				return withProjectDir(String(dbo.getProject().getDirPath()), function () {
					var blocks = loadBlocks();
					var request = {
						name: String(dbo.getName()),
						flowName: String(dbo.getName()),
						flowSource: String(dbo.getFlowSource())
					};
					var definition = parseSource(sourceForFlowRequest(request, blocks));
					return objectSchema(declaredOutputSchema(definition) || readResultSchema(request, definition) || {});
				});
			}
			var learnedSchema = learnedXsdOutputSchema(target);
			if (learnedSchema) {
				return learnedSchema;
			}
			var project = dbo.getProject();
			var schema = Packages.com.twinsoft.convertigo.engine.Engine.theApp.schemaManager.getSchemaForProject(project.getName());
			var xso = Packages.com.twinsoft.convertigo.engine.enums.SchemaMeta.getXmlSchemaObject(schema, dbo);
			if (!xso) {
				return null;
			}
			var document = Packages.com.twinsoft.convertigo.engine.util.XmlSchemaUtils.getDomInstance(xso);
			var jsonString = Packages.com.twinsoft.convertigo.engine.util.XMLUtils.XmlToJson(document.getDocumentElement(), true, true);
			var sample = JSON.parse(String(jsonString));
			var responseName = String(dbo.getXsdTypePrefix()) + String(dbo.getName()) + "Response";
			var output = readObjectPath(sample, "document." + responseName + ".response");
			if (output === undefined) {
				output = sample;
			}
			return unwrapDocumentSchema(inferSchema(output));
		} catch (e) {
			return learnedXsdOutputSchema(target);
		}
	}

	function requestableTargetQName(target) {
		target = target || {};
		return target.project + "." + (target.connector ? target.connector + "." : "") + target.requestable;
	}

	function requestableTargetPublic(target, currentProject) {
		var qname = requestableTargetQName(target);
		var local = target.project === currentProject
			? "." + (target.connector ? target.connector + "." : "") + target.requestable
			: qname;
		var out = {
			kind: target.kind,
			project: target.project,
			name: target.requestable,
			qname: qname,
			requestable: qname,
			localRequestable: local
		};
		if (target.connector) {
			out.connector = target.connector;
		}
		return out;
	}

	function requestableTargetCandidates(request, targetText) {
		request = request || {};
		var project = currentProjectName(request);
		var text = String(targetText || "").trim();
		if (text.charAt(0) === ".") {
			text = project + text;
		}
		var parts = text.split(".").filter(function (part) {
			return part !== "";
		});
		var candidates = [];
		if (parts.length >= 3) {
			candidates.push({
				kind: "transaction",
				project: parts.slice(0, parts.length - 2).join("."),
				connector: parts[parts.length - 2],
				requestable: parts[parts.length - 1],
				transaction: parts[parts.length - 1]
			});
		} else if (parts.length === 2) {
			candidates.push({
				kind: "sequence",
				project: parts[0],
				requestable: parts[1],
				sequence: parts[1]
			});
		} else if (parts.length === 1 && project) {
			candidates.push({
				kind: "sequence",
				project: project,
				requestable: parts[0],
				sequence: parts[0]
			});
		}
		return candidates;
	}

	function requestableKindForDbo(dbo, candidate) {
		var className = String(dbo.getClass().getName());
		if (className.indexOf(".transactions.") !== -1 || className.indexOf(".beans.core.Transaction") !== -1) {
			candidate.kind = "transaction";
			candidate.connector = candidate.connector || String(dbo.getConnector().getName());
			candidate.transaction = candidate.requestable;
			return candidate;
		}
		if (className === "com.twinsoft.convertigo.beans.flow.Flow") {
			candidate.kind = "flow";
			delete candidate.connector;
			candidate.sequence = candidate.requestable;
			return candidate;
		}
		if (className === "com.twinsoft.convertigo.beans.core.Sequence" || className.indexOf(".beans.sequences.") !== -1) {
			candidate.kind = "sequence";
			delete candidate.connector;
			candidate.sequence = candidate.requestable;
			return candidate;
		}
		return null;
	}

	function resolveRequestableTarget(request, targetText) {
		var candidates = requestableTargetCandidates(request, targetText);
		for (var i = 0; i < candidates.length; i++) {
			try {
				var dbo = Packages.com.twinsoft.convertigo.engine.Engine.theApp.databaseObjectsManager
					.getDatabaseObjectByQName(requestableTargetQName(candidates[i]));
				if (!dbo) {
					continue;
				}
				if (String(dbo.getProject().getName()) !== String(candidates[i].project)) {
					continue;
				}
				try {
					if (candidates[i].connector && String(dbo.getConnector().getName()) !== String(candidates[i].connector)) {
						continue;
					}
				} catch (e) {
					if (candidates[i].connector) {
						continue;
					}
				}
				var resolved = requestableKindForDbo(dbo, candidates[i]);
				if (resolved) {
					return resolved;
				}
			} catch (e) {
			}
		}
		return null;
	}

	function requestableMatches(entry, query) {
		query = String(query || "").trim().toLowerCase();
		if (!query) {
			return true;
		}
		var haystack = [
			entry.kind,
			entry.project,
			entry.connector || "",
			entry.name,
			entry.qname,
			entry.localRequestable || ""
		].join(" ").toLowerCase();
		return query.split(/\s+/).filter(function (token) {
			return token !== "";
		}).every(function (token) {
			return haystack.indexOf(token) !== -1;
		});
	}

	function requestableListRequest(request) {
		request = request || {};
		var projectName = currentProjectName(request);
		if (!projectName) {
			return {
				ok: false,
				error: flowCodeError("MISSING_PROJECT", "requestable.list requires project or context.project.",
					"Pass the current project name.")
			};
		}
		var limit = Math.max(1, Math.min(500, Number(request.limit || 100)));
		var query = String(request.query || request.q || "").trim();
		var dbom = Packages.com.twinsoft.convertigo.engine.Engine.theApp.databaseObjectsManager;
		var project = dbom.getOriginalProjectByName(projectName, false);
		var requestables = [];
		var sequenceIterator = project.getSequencesList().iterator();
		while (sequenceIterator.hasNext()) {
			var sequence = sequenceIterator.next();
			var sequenceClass = String(sequence.getClass().getName());
			requestables.push(requestableTargetPublic({
				kind: sequenceClass === "com.twinsoft.convertigo.beans.flow.Flow" ? "flow" : "sequence",
				project: projectName,
				requestable: String(sequence.getName())
			}, projectName));
		}
		var connectorIterator = project.getConnectorsList().iterator();
		while (connectorIterator.hasNext()) {
			var connector = connectorIterator.next();
			var transactionIterator = connector.getTransactionsList().iterator();
			while (transactionIterator.hasNext()) {
				var transaction = transactionIterator.next();
				requestables.push(requestableTargetPublic({
					kind: "transaction",
					project: projectName,
					connector: String(connector.getName()),
					requestable: String(transaction.getName()),
					transaction: String(transaction.getName())
				}, projectName));
			}
		}
		requestables = requestables.filter(function (entry) {
			return requestableMatches(entry, query);
		}).slice(0, limit);
		return {
			ok: true,
			project: projectName,
			count: requestables.length,
			requestables: requestables
		};
	}

	function requestableSchemaRequest(request) {
		request = request || {};
		var text = request.requestable || request.target || request.qname || request.name || "";
		if (!text) {
			return {
				ok: false,
				error: flowCodeError("MISSING_REQUESTABLE", "requestable.schema requires requestable.",
					"Pass for example .RSSConnector.GetFeed, .MyFlow or Project.Connector.Transaction.")
			};
		}
		var target = resolveRequestableTarget(request, text);
		if (!target || !target.project || !target.requestable) {
			return {
				ok: false,
				error: flowCodeError("UNKNOWN_REQUESTABLE", "Unknown requestable: " + text,
					"Call requestable.list first and reuse one returned qname or localRequestable. Current-project requestables start with a dot.")
			};
		}
		var schema = requestableOutputSchema(target);
		var learned = false;
		var sample;
		if (!schema && request.learn === true) {
			sample = requestableSampleOutput(target, request.input || {});
			schema = unwrapDocumentSchema(inferSchema(sample));
			learned = true;
		}
		if (!schema) {
			return {
				ok: false,
				target: requestableTargetPublic(target, currentProjectName(request)),
				error: flowCodeError("REQUESTABLE_SCHEMA_UNAVAILABLE", "No schema available for requestable: " + text,
					"Run or learn the requestable schema in Studio, or retry with learn:true when executing the requestable is safe.")
			};
		}
		schema = objectSchema(schema);
		var paths = schemaPaths(schema, "");
		var arrayPaths = schemaArrayPaths(schema, "");
		var leafPaths = schemaLeafEntries(schema, "");
		var out = {
			ok: true,
			target: requestableTargetPublic(target, currentProjectName(request)),
			learned: learned,
			schema: schema,
			paths: paths,
			arrayPaths: arrayPaths,
			leafPaths: leafPaths,
			flowScript: requestableFlowScriptHints(target, arrayPaths, leafPaths, currentProjectName(request))
		};
		if (request.includeSample === true) {
			out.sample = sample;
		}
		return out;
	}

	function requestableSampleOutput(target, input) {
		if (typeof context === "undefined" || context === null) {
			raise("CONVERTIGO_CONTEXT_UNAVAILABLE", "requestable.schema learn:true needs a live Convertigo context.");
		}
		var request = new Packages.java.util.HashMap();
		request.put("__project", target.project);
		if (target.kind === "transaction") {
			request.put("__connector", target.connector);
			request.put("__transaction", target.transaction || target.requestable);
		} else {
			request.put("__sequence", target.sequence || target.requestable);
		}
		Object.keys(input || {}).forEach(function (key) {
			var value = input[key];
			request.put(String(key), value === undefined || value === null ? "" : typeof value === "string" ? value : JSON.stringify(value));
		});
		var doc = new Packages.com.twinsoft.convertigo.engine.requesters.InternalRequester(request, context.httpServletRequest).processRequest();
		var raw = JSON.parse(String(Packages.com.twinsoft.convertigo.engine.util.XMLUtils.XmlToJson(doc.getDocumentElement(), true)));
		return raw && raw.document !== undefined ? raw.document : raw;
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

	function isIconifyIcon(icon) {
		return String(icon || "").match(/^[A-Za-z][A-Za-z0-9_-]*:[A-Za-z0-9_.-]+$/) !== null;
	}

	function isUrlIcon(icon) {
		return String(icon || "").match(/^https?:\/\//i) !== null;
	}

	function flowDirForBlock(block) {
		var blockFile = String(block && block.__flowFile || "");
		if (blockFile) {
			var dir = new File(blockFile).getParentFile();
			if (dir && String(dir.getName()) === "blocks") {
				return dir.getParentFile();
			}
			return dir || engineDir();
		}
		return engineDir();
	}

	function iconCacheDir(block, family, provider) {
		var dir = new File(new File(flowDirForBlock(block), "icons"), family);
		return provider ? new File(dir, provider) : dir;
	}

	function safeIconName(name) {
		return String(name || "").replace(/[^A-Za-z0-9_.-]/g, "_");
	}

	function urlExtension(icon) {
		var path = String(icon || "").replace(/[?#].*$/, "");
		var dot = path.lastIndexOf(".");
		var ext = dot === -1 ? "" : path.substring(dot + 1).toLowerCase();
		if (["svg", "png", "jpg", "jpeg", "gif", "webp", "ico"].indexOf(ext) === -1) {
			return "bin";
		}
		return ext;
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

	function downloadToCache(url, file) {
		if (file.isFile()) {
			return true;
		}
		var failureMarker = new File(String(file.getAbsolutePath()) + ".failed");
		if (failureMarker.isFile() && Number(new Date().getTime()) - Number(failureMarker.lastModified()) < 3600000) {
			return false;
		}
		try {
			file.getParentFile().mkdirs();
			FileUtils.copyURLToFile(new Packages.java.net.URL(String(url)), file, 800, 2000);
			if (failureMarker.isFile()) {
				FileUtils.deleteQuietly(failureMarker);
			}
			return file.isFile();
		} catch (e) {
			try {
				file.getParentFile().mkdirs();
				FileUtils.writeStringToFile(failureMarker, String(e), "UTF-8");
			} catch (ignored) {
			}
			return false;
		}
	}

	function exposeCachedIconFiles(descriptor, base, extension) {
		var svg = new File(String(base.getAbsolutePath()) + ".svg");
		var png16 = new File(String(base.getAbsolutePath()) + "_16x16.png");
		var png32 = new File(String(base.getAbsolutePath()) + "_32x32.png");
		var original = extension ? new File(String(base.getAbsolutePath()) + "." + extension) : null;
		if (svg.isFile()) {
			descriptor.iconSvg = canonicalPath(svg);
		}
		if (png16.isFile()) {
			descriptor.iconFile16 = canonicalPath(png16);
			descriptor.iconFile = descriptor.iconFile || descriptor.iconFile16;
		}
		if (png32.isFile()) {
			descriptor.iconFile32 = canonicalPath(png32);
			if (!descriptor.iconFile) {
				descriptor.iconFile = descriptor.iconFile32;
			}
		}
		if (original && original.isFile()) {
			var path = canonicalPath(original);
			if (extension === "svg") {
				descriptor.iconSvg = path;
			}
			if (!descriptor.iconFile && extension !== "bin") {
				descriptor.iconFile = path;
			}
		}
	}

	function fileDataUrl(file, mimeType) {
		try {
			if (!file || !file.isFile() || file.length() > 65536) {
				return "";
			}
			var encoded = Base64.getEncoder().encodeToString(FileUtils.readFileToByteArray(file));
			return "data:" + mimeType + ";base64," + encoded;
		} catch (e) {
			return "";
		}
	}

	function addIconifyCache(block, descriptor, icon) {
		var parts = String(icon || "").split(":");
		if (parts.length !== 2) {
			return;
		}
		var provider = safeIconName(parts[0]);
		var name = safeIconName(parts[1]);
		var base = new File(iconCacheDir(block, "iconify", provider), name);
		var svg = new File(String(base.getAbsolutePath()) + ".svg");
		if (!svg.isFile()) {
			downloadToCache("https://api.iconify.design/" + provider + "/" + name + ".svg?color=%2314a7cf", svg);
		}
		descriptor.iconify = provider + ":" + name;
		exposeCachedIconFiles(descriptor, base, "svg");
	}

	function addUrlIconCache(block, descriptor, icon) {
		var ext = urlExtension(icon);
		var base = new File(iconCacheDir(block, "url", null), sha256Hex(icon));
		var file = new File(String(base.getAbsolutePath()) + "." + ext);
		downloadToCache(icon, file);
		descriptor.iconUrl = icon;
		exposeCachedIconFiles(descriptor, base, ext);
	}

	function exposeLocalIcon(descriptor, iconFile) {
		if (!iconFile || !iconFile.isFile()) {
			return;
		}
		var path = canonicalPath(iconFile);
		var ext = urlExtension(path);
		if (ext === "svg") {
			descriptor.iconSvg = path;
		}
		descriptor.iconFile = path;
		if (String(iconFile.getName()).indexOf("_16x16.") !== -1) {
			descriptor.iconFile16 = path;
		}
		if (String(iconFile.getName()).indexOf("_32x32.") !== -1) {
			descriptor.iconFile32 = path;
		}
	}

	function resolveBlockIcon(block, descriptor) {
		var icon = descriptor && descriptor.icon !== undefined ? String(descriptor.icon || "").trim() : "";
		if (!icon) {
			return descriptor;
		}
		descriptor.icon = icon;
		if (isIconifyIcon(icon)) {
			descriptor.iconify = icon;
			addIconifyCache(block, descriptor, icon);
			return descriptor;
		}
		if (isUrlIcon(icon)) {
			addUrlIconCache(block, descriptor, icon);
			return descriptor;
		}
		if (icon.indexOf("/com/twinsoft/convertigo/") === 0) {
			descriptor.iconFile = icon;
			return descriptor;
		}
		var iconFile = new File(icon);
		if (!iconFile.isAbsolute()) {
			var blockFile = String(block && block.__flowFile || "");
			var baseDir = blockFile ? new File(blockFile).getParentFile() : engineDir();
			iconFile = new File(baseDir, icon);
		}
		exposeLocalIcon(descriptor, iconFile);
		return descriptor;
	}

	function iconNameFromCacheFile(file) {
		var name = String(file.getName() || "");
		if (name.indexOf(".") === -1) {
			return "";
		}
		name = name.replace(/\.(svg|png|gif|jpg|jpeg|webp|ico)$/i, "");
		name = name.replace(/_(16|32)x(16|32)$/i, "");
		return name;
	}

	function collectIconifyProviderIcons(providerDir, provider, origin, icons, seen) {
		var files = providerDir && providerDir.listFiles();
		if (!files) {
			return;
		}
		files = Arrays.asList(files).toArray();
		files.forEach(function (file) {
			if (!file.isFile()) {
				return;
			}
			var name = iconNameFromCacheFile(file);
			if (!name || name === ".gitignore") {
				return;
			}
			var id = provider + ":" + name;
			if (seen[id]) {
				return;
			}
			seen[id] = true;
			var icon = {
				id: id,
				provider: provider,
				name: name,
				origin: origin
			};
			var base = new File(providerDir, name);
			exposeCachedIconFiles(icon, base, "svg");
			var svg = new File(String(base.getAbsolutePath()) + ".svg");
			if (svg.isFile()) {
				icon.iconData = fileDataUrl(svg, "image/svg+xml");
			}
			icons.push(icon);
		});
	}

	function collectIconifyIcons(flowDir, origin, provider, icons, seen) {
		var root = flowDir ? new File(new File(flowDir, "icons"), "iconify") : null;
		if (!root || !root.isDirectory()) {
			return;
		}
		if (provider) {
			collectIconifyProviderIcons(new File(root, safeIconName(provider)), safeIconName(provider), origin, icons, seen);
			return;
		}
		var providers = root.listFiles();
		if (!providers) {
			return;
		}
		providers = Arrays.asList(providers).toArray();
		providers.forEach(function (dir) {
			if (dir.isDirectory()) {
				collectIconifyProviderIcons(dir, String(dir.getName()), origin, icons, seen);
			}
		});
	}

	function iconCatalogRequest(request) {
		request = request || {};
		var provider = String(request.provider || "mdi").trim();
		var query = String(request.query || "").trim().toLowerCase();
		var limit = Math.max(1, Math.min(Number(request.limit || 200), 500));
		var icons = [];
		var seen = {};
		collectIconifyIcons(projectDir() ? new File(projectDir(), "libs/flow") : null, "project", provider, icons, seen);
		collectIconifyIcons(engineDir(), "core", provider, icons, seen);
		icons.sort(function (a, b) {
			return String(a.id).localeCompare(String(b.id));
		});
		if (query) {
			icons = icons.filter(function (icon) {
				return String(icon.id).toLowerCase().indexOf(query) !== -1;
			});
		}
		return {
			ok: true,
			provider: provider,
			count: icons.length,
			icons: icons.slice(0, limit)
		};
	}

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
		var definition = expandFlowDefinition(blocks, parseSource(sourceForFlowRequest(request, blocks)));
		var projectEngine = loadProjectEngineDefinition();
		var ctx = createRunContext(request, definition, blocks, projectEngine);
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
			if (typeof context === "undefined" || context === null) {
				raise("CONVERTIGO_CONTEXT_UNAVAILABLE", "This block needs a live Convertigo context.");
			}
			return context;
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
				return resourceSearchRequest(args);
			});
		};
		ctx.resourceList = function (args) {
			args = args || {};
			return withProjectDir(args.projectDir, function () {
				return resourceListRequest(args);
			});
		};
		ctx.resourceGet = function (args) {
			args = args || {};
			return withProjectDir(args.projectDir, function () {
				return resourceGetRequest(args);
			});
		};
		ctx.resourcePatch = function (args) {
			args = args || {};
			return withProjectDir(args.projectDir, function () {
				return resourcePatchRequest(args);
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
					return blockCodeGetRequest(loadBlocks(), args);
				});
			};
			ctx.blockCodePatch = function (args) {
				args = args || {};
				return withProjectDir(args.projectDir, function () {
					return blockCodePatchRequest(loadBlocks(), args);
			});
		};
		ctx.blockCodeRg = function (args) {
			args = args || {};
			return withProjectDir(args.projectDir, function () {
				return blockCodeRgRequest(loadBlocks(), args);
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
				return flowCodeGetRequest(loadBlocks(), args);
			});
		};
		ctx.flowCodeStatus = function (args) {
			args = args || {};
			return withProjectDir(args.projectDir, function () {
				return flowCodeStatusRequest(loadBlocks(), args);
			});
		};
		ctx.flowCodeDiscard = function (args) {
			args = args || {};
			return withProjectDir(args.projectDir, function () {
				return flowCodeDiscardRequest(loadBlocks(), args);
			});
		};
		ctx.flowCodeSet = function (args) {
			args = args || {};
			return withProjectDir(args.projectDir, function () {
				return flowCodeSetRequest(loadBlocks(), args);
			});
		};
		ctx.flowCodePatch = function (args) {
			args = args || {};
			return withProjectDir(args.projectDir, function () {
				return flowCodePatchRequest(loadBlocks(), args);
			});
		};
		ctx.flowCodeCheck = function (args) {
			args = args || {};
			return withProjectDir(args.projectDir, function () {
				return flowCodeCheckRequest(loadBlocks(), args);
			});
		};
		ctx.flowCodeRg = function (args) {
			args = args || {};
			return withProjectDir(args.projectDir, function () {
				return flowCodeRgRequest(loadBlocks(), args);
			});
		};
		ctx.flowCodeRun = function (args) {
			args = args || {};
			return withProjectDir(args.projectDir, function () {
				return flowCodeRunRequest(loadBlocks(), args);
			});
		};
		ctx.flowCodeAnalyze = function (args) {
			args = args || {};
			return withProjectDir(args.projectDir, function () {
				return flowCodeAnalyzeRequest(loadBlocks(), args);
			});
		};
		ctx.flowCodePromote = function (args) {
			args = args || {};
			return withProjectDir(args.projectDir, function () {
				return flowCodePromoteRequest(loadBlocks(), args);
			});
		};
		ctx.requestableList = function (args) {
			args = args || {};
			return withProjectDir(args.projectDir, function () {
				return requestableListRequest(args);
			});
		};
		ctx.requestableSchema = function (args) {
			args = args || {};
			return withProjectDir(args.projectDir, function () {
				return requestableSchemaRequest(args);
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

	function createAnalysisContext(blocks, request, definition) {
		request = request || {};
		definition = definition || {};
		var ctx = {
			request: request,
			definition: definition,
			blocks: blocks,
				paths: scopeNames.slice(0),
			reads: [],
			writes: [],
			providers: {},
				schemas: {},
				returnSchemas: [],
				currentSources: [],
				graphBlockStack: [],
				maxGraphBlockAnalysisDepth: intOption(request.maxGraphBlockAnalysisDepth, 32, 1, 200),
				currentNodeInfo: null,
				nodes: [],
				errors: []
			};
		ctx.props = nodeProps;
		ctx.addPath = function (path) {
			addUnique(ctx.paths, path);
		};
		ctx.addRead = function (path) {
			addUnique(ctx.reads, path);
			ctx.addPath(path);
		};
		ctx.addWrite = function (path) {
			addUnique(ctx.writes, path);
			ctx.addPath(path);
			if (ctx.currentNodeInfo && typeof path === "string" && path !== "") {
				ctx.providers[path] = {
					id: ctx.currentNodeInfo.id,
					block: ctx.currentNodeInfo.block,
					path: path
				};
			}
		};
		ctx.addOutputPath = function (property, path) {
			ctx.addWrite(path);
			if (ctx.currentNodeInfo && typeof path === "string" && path !== "") {
				addUnique(ctx.currentNodeInfo.writes, path);
				var exists = false;
				ctx.currentNodeInfo.outputs.forEach(function (output) {
					if (output.property === property && output.path === path) {
						exists = true;
					}
				});
				if (!exists) {
					ctx.currentNodeInfo.outputs.push({
						property: property || "out",
						path: path
					});
				}
			}
		};
		ctx.addSchema = function (basePath, schema) {
			if (typeof basePath !== "string" || basePath === "" || !schema) {
				return;
			}
			ctx.schemas[basePath] = normalizeTree(schema);
			ctx.addPath(basePath);
			if (ctx.currentNodeInfo) {
				ctx.providers[basePath] = {
					id: ctx.currentNodeInfo.id,
					block: ctx.currentNodeInfo.block,
					path: basePath
				};
			}
			schemaPaths(schema, "").forEach(function (path) {
				ctx.addPath(joinPath(basePath, path));
			});
		};
		ctx.schemaForOutput = function (node, property, outPath) {
			return readOutputSchema(request, definition, node, property || "out", outPath || "");
		};
		ctx.schemaForPath = function (path) {
			return schemaForAnalysisPath(ctx, path);
		};
		ctx.schemaForValue = function (value) {
			if (value && typeof value === "object") {
				return inferSchema(value);
			}
			var expression = exactTemplateExpression(value);
			if (expression) {
				var refs = collectExpressionRefs(expression, []);
				for (var i = 0; i < refs.length; i++) {
					var schema = schemaForAnalysisPath(ctx, refs[i]);
					if (schema) {
						return schema;
					}
				}
				return null;
			}
			if (typeof value === "string") {
				return { type: "string" };
			}
			if (typeof value === "number") {
				return { type: Math.floor(value) === value ? "integer" : "number" };
			}
			if (typeof value === "boolean") {
				return { type: "boolean" };
			}
			return null;
		};
		ctx.addReturnSchema = function (schema) {
			if (schema) {
				ctx.returnSchemas.push(normalizeTree(schema));
			}
		};
		ctx.itemSchema = itemSchema;
		ctx.inferSchema = inferSchema;
		ctx.sourceForPath = function (path) {
			return sourceForPath(ctx, path);
		};
		ctx.withCurrentSource = function (source, callback) {
			ctx.currentSources.push(source || {});
			if (source && source.schema) {
				ctx.addSchema("current", source.schema);
			}
			try {
				return callback();
			} finally {
				ctx.currentSources.pop();
			}
		};
			ctx.withGraphBlock = function (node, block, callback) {
				var catalog = blockCatalog(block);
				var props = nodeProps(node);
				var graphName = String(block && block.name || blockName(node) || "");
				ctx.graphBlockStack = ctx.graphBlockStack || [];
				var stack = ctx.graphBlockStack;
				if (graphName && stack.indexOf(graphName) !== -1) {
					var recursiveStack = stack.concat([graphName]);
					ctx.errors.push({
						severity: "warning",
						code: "RECURSIVE_GRAPH_BLOCK_ANALYSIS_SKIPPED",
						block: graphName,
						path: nodePath(node),
						stack: recursiveStack,
						message: "Skipped recursive analysis for composite Flow block " + graphName + ".",
						hint: "Declared outputs are still used; runtime recursion is allowed but tree/schema introspection stops at this reference."
					});
					return undefined;
				}
				var maxDepth = Number(ctx.maxGraphBlockAnalysisDepth || 32);
				if (stack.length >= maxDepth) {
					ctx.errors.push({
						severity: "warning",
						code: "GRAPH_BLOCK_ANALYSIS_DEPTH_LIMIT",
						block: graphName,
						path: nodePath(node),
						stack: stack.concat([graphName]),
						message: "Skipped composite Flow block analysis after " + maxDepth + " nested block calls.",
						hint: "Increase maxGraphBlockAnalysisDepth only for debugging; production introspection should stay bounded."
					});
					return undefined;
				}
				ctx.addPath("input");
				ctx.addPath("local");
				Object.keys(catalog.props || {}).forEach(function (key) {
					var descriptor = catalog.props[key] || {};
					var value = props[key] === undefined ? descriptor["default"] : props[key];
				var schema = null;
				if (descriptor.kind === "expression" && typeof value === "string") {
					schema = ctx.schemaForPath(value);
				} else {
					schema = ctx.schemaForValue(value);
				}
				if (!schema && descriptor.type) {
					schema = { type: String(descriptor.type) };
				}
				if (schema) {
					ctx.addSchema("input." + key, schema);
					} else {
						ctx.addPath("input." + key);
					}
				});
				if (graphName) {
					stack.push(graphName);
				}
				try {
					return callback();
				} finally {
					if (graphName) {
						stack.pop();
					}
				}
			};
		ctx.visitNodes = function (nodes) {
			analyzeNodes(ctx, nodes);
		};
		ctx.flowOutputPaths = function (name) {
			return outputPathsForFlow(name);
		};
		ctx.flowOutputSchema = function (name) {
			return flowOutputSchema(name);
		};
		ctx.currentProjectName = function () {
			return currentProjectName(request);
		};
		ctx.mergeSchema = mergeSchema;
		ctx.requestableOutputSchema = request.allowRequestableSchema === false
			? function () { return null; }
			: requestableOutputSchema;
		var sourceBlockName = String(request.sourceBlockName || request.blockName || "").trim();
		var sourceBlock = sourceBlockName ? blocks[sourceBlockName] : null;
		if (sourceBlock) {
			var sourceCatalog = blockCatalog(sourceBlock);
			ctx.addPath("input");
			Object.keys(sourceCatalog.props || {}).forEach(function (key) {
				var descriptor = sourceCatalog.props[key] || {};
				var schema = descriptor.type ? { type: String(descriptor.type) } : null;
				if (!schema && descriptor.kind === "array") {
					schema = { type: "array" };
				}
				if (schema) {
					ctx.addSchema("input." + key, schema);
				} else {
					ctx.addPath("input." + key);
				}
			});
		}
		ctx.raise = raise;
		return ctx;
	}

	function cloneSource(source) {
		if (!source) {
			return null;
		}
		var out = {};
		["id", "block", "path", "sourcePath"].forEach(function (key) {
			if (source[key] !== undefined && source[key] !== null && source[key] !== "") {
				out[key] = source[key];
			}
		});
		return Object.keys(out).length === 0 ? null : out;
	}

	function sourceForPath(ctx, path) {
		if (typeof path !== "string" || path === "") {
			return null;
		}
		if (path === "current" || path.indexOf("current.") === 0) {
			var current = ctx.currentSources.length === 0 ? null : ctx.currentSources[ctx.currentSources.length - 1];
			if (current) {
				var cloned = cloneSource(current);
				if (cloned) {
					cloned.sourcePath = path;
					return cloned;
				}
			}
			return null;
		}
		if (ctx.providers[path]) {
			return cloneSource(ctx.providers[path]);
		}
		var best = "";
		Object.keys(ctx.providers).forEach(function (providerPath) {
			if (path.indexOf(providerPath + ".") === 0 && providerPath.length > best.length) {
				best = providerPath;
			}
		});
		if (best) {
			var source = cloneSource(ctx.providers[best]);
			if (source) {
				source.path = best;
				source.sourcePath = path;
			}
			return source;
		}
		return null;
	}

	function schemaForSchemasPath(schemas, path) {
		var best = "";
		Object.keys(schemas || {}).forEach(function (basePath) {
			if (path === basePath || path.indexOf(basePath + ".") === 0) {
				if (basePath.length > best.length) {
					best = basePath;
				}
			}
		});
		if (!best) {
			return null;
		}
		return schemaAtPath(schemas[best], path === best ? "" : String(path).substring(best.length + 1));
	}

	function schemaForAnalysisPath(ctx, path) {
		return schemaForSchemasPath(ctx.schemas, path);
	}

	function childGroups(node) {
		var groups = [];
		["nodes", "do", "then", "else"].forEach(function (key) {
			if (node[key]) {
				groups.push({
					name: key,
					count: (node[key] || []).length
				});
			}
		});
		return groups;
	}

	function analyzeProps(ctx, props, catalog) {
		var reads = [];
		var writes = [];
		var inputs = [];
		var outputs = [];
		var writeProps = catalog.writes || [];
		Object.keys(props).forEach(function (key) {
			var value = props[key];
			var descriptor = catalog.props && !Object.prototype.toString.call(catalog.props).match(/Array/) ?
				catalog.props[key] || {} : {};
			var kind = descriptor.kind || "";
			var mode = descriptor.mode || "";
			if (writeProps.indexOf(key) !== -1 || kind === "path" && mode === "write"
					|| key === "out" && declaredPropertyOutputSchema(catalog, key)) {
				if (typeof value === "string") {
					addUnique(writes, value);
					ctx.addOutputPath(key, value);
					var output = {
						property: key,
						path: value
					};
					var outputSchema = declaredPropertyOutputSchema(catalog, key);
					if (outputSchema) {
						ctx.addSchema(value, outputSchema);
						output.schema = schemaSummary(outputSchema);
					}
					outputs.push(output);
				}
				return;
			}
			var refs = [];
			if (kind === "path") {
				collectScopeRefs(value, refs);
			} else if (kind === "expression") {
				collectExpressionRefs(value, refs);
			} else if (kind === "template") {
				collectTemplateRefs(value, refs);
			} else if (kind === "value") {
				collectTemplateRefs(value, refs);
			} else if (kind === "literal" || kind === "text" || kind === "schema" || kind === "secret") {
				refs = [];
			} else {
				collectScopeRefs(value, refs);
			}
			refs.forEach(function (path) {
				addUnique(reads, path);
				ctx.addRead(path);
				inputs.push({
					property: key,
					path: path,
					source: ctx.sourceForPath(path)
				});
			});
		});
		return {
			reads: reads,
			writes: writes,
			inputs: inputs,
			outputs: outputs
		};
	}

	function analyzeNode(ctx, node) {
		if (!node || node.disabled) {
			return;
		}
		var name = blockName(node);
		var block = ctx.blocks[name];
		if (!block) {
			raise("UNKNOWN_BLOCK", "Unknown Flow block: " + name, node, "Use flow-catalog or blockList to list supported blocks.");
		}
		var props = nodeProps(node);
		var catalog = blockCatalog(block);
		var info = {
			id: nodePath(node),
			block: name,
			properties: Object.keys(props),
			reads: [],
			writes: [],
			inputs: [],
			outputs: [],
			children: childGroups(node)
		};
		var previousNodeInfo = ctx.currentNodeInfo;
		ctx.currentNodeInfo = info;
		try {
			var effects = analyzeProps(ctx, props, catalog);
			info.reads = effects.reads;
			info.writes = effects.writes;
			info.inputs = effects.inputs;
			info.outputs = effects.outputs;
			ctx.nodes.push(info);
			if (typeof block.analyze === "function") {
				block.analyze(ctx, node);
			}
		} finally {
			ctx.currentNodeInfo = previousNodeInfo;
		}
	}

	function analyzeNodes(ctx, nodes) {
		(nodes || []).forEach(function (node) {
			analyzeNode(ctx, node);
		});
	}

	function analyzeFlowSource(blocks, flowSource, request) {
		var args = Object.assign({}, request || {}, {
			flowSource: flowSource
		});
		var definition = parseSource(sourceForFlowRequest(args, blocks));
		return analyzeFlowDefinition(blocks, definition, request);
	}

	function analyzeFlowDefinition(blocks, definition, request) {
		definition = expandFlowDefinition(blocks, definition);
		var ctx = createAnalysisContext(blocks, request || {}, definition);
		ctx.visitNodes(definition.nodes || []);
		return {
			ok: true,
			version: definition.version || 1,
			paths: ctx.paths,
			reads: ctx.reads,
			writes: ctx.writes,
			nodes: ctx.nodes,
			schemas: ctx.schemas,
			returnSchemas: ctx.returnSchemas,
			errors: ctx.errors
		};
	}

	function resultSchemaFromAnalysis(analysis) {
		if (analysis.returnSchemas && analysis.returnSchemas.length > 0) {
			var returned = null;
			analysis.returnSchemas.forEach(function (schema) {
				returned = mergeSchema(returned, schema) || schema;
			});
			return returned;
		}
		var result = { type: "object", properties: {} };
		Object.keys(analysis.schemas || {}).forEach(function (path) {
			if (path === "result") {
				result = mergeSchema(result, objectSchema(analysis.schemas[path])) || result;
			} else if (path.indexOf("result.") === 0) {
				assignSchemaAtPath(result, path.substring("result.".length), analysis.schemas[path]);
			}
		});
		(analysis.writes || []).forEach(function (path) {
			if (path.indexOf("result.") === 0 && !schemaAtPath(result, path.substring("result.".length))) {
				assignSchemaAtPath(result, path.substring("result.".length), { type: "unknown" });
			}
		});
		return hasSchemaContent(result) ? result : null;
	}

	function hasChildSlots(catalog) {
		return !!(catalog && (
			catalog.slots && Object.prototype.toString.call(catalog.slots) === "[object Array]" ||
			catalog.children && Object.prototype.toString.call(catalog.children) === "[object Array]"
		));
	}

	function analyzeNodeShallow(ctx, node, path) {
		if (!node || node.disabled) {
			return null;
		}
		var name = blockName(node);
		var block = ctx.blocks[name];
		if (!block) {
			raise("UNKNOWN_BLOCK", "Unknown Flow block: " + name, node, "Use flow-catalog or blockList to list supported blocks.");
		}
		var props = nodeProps(node);
		var catalog = blockCatalog(block);
		var info = {
			id: nodePath(node),
			path: path || "",
			block: name,
			properties: Object.keys(props),
			reads: [],
			writes: [],
			inputs: [],
			outputs: [],
			children: childGroups(node)
		};
		var previousNodeInfo = ctx.currentNodeInfo;
		ctx.currentNodeInfo = info;
		try {
			var effects = analyzeProps(ctx, props, catalog);
			info.reads = effects.reads;
			info.writes = effects.writes;
			info.inputs = effects.inputs;
			info.outputs = effects.outputs;
			ctx.nodes.push(info);
			if (!hasChildSlots(catalog) && typeof block.analyze === "function") {
				block.analyze(ctx, node);
			}
		} finally {
			ctx.currentNodeInfo = previousNodeInfo;
		}
		return info;
	}

	function contextTargetValue(request) {
		return request.node || request.nodeId || request.id || "";
	}

	function currentContextSource(ctx) {
		if (!ctx || !ctx.currentSources || ctx.currentSources.length === 0) {
			return null;
		}
		return cloneSource(ctx.currentSources[ctx.currentSources.length - 1]);
	}

	function matchesContextTarget(request, node, path) {
		var target = String(contextTargetValue(request) || "");
		var targetPath = String(request.path || request.nodePath || "");
		if (targetPath && targetPath === path) {
			return true;
		}
		if (!target) {
			return false;
		}
		return target === String(node && node.id || "") ||
			target === String(node && node.uid || "") ||
			target === String(node && node.name || "") ||
			target === nodePath(node) ||
			target === path;
	}

	function currentSourceForSlot(ctx, node, slot) {
		var current = String(slot && slot.current || "");
		if (!current) {
			return null;
		}
		if (current === "item") {
			var props = nodeProps(node);
			var items = props.items || props["in"];
			var source = ctx.sourceForPath ? ctx.sourceForPath(items) : null;
			source = source || { path: items };
			var currentSchema = ctx.schemaForPath ? ctx.schemaForPath(items) : null;
			currentSchema = ctx.itemSchema ? ctx.itemSchema(currentSchema) : currentSchema;
			if (currentSchema) {
				source.schema = currentSchema;
			}
			return source;
		}
		if (current === "error") {
			return {
				path: "error",
				schema: {
					type: "object",
					properties: {
						code: { type: "string" },
						message: { type: "string" },
						details: { type: "object" }
					}
				}
			};
		}
		return { path: current };
	}

	function contextWalkNodes(ctx, nodes, request, path) {
		nodes = nodes || [];
		for (var i = 0; i < nodes.length; i++) {
			var node = nodes[i];
			var nodeListPath = path + "[" + i + "]";
			var targetHere = matchesContextTarget(request, node, nodeListPath);
			var position = String(request.position || "before");
			if (targetHere && position !== "after") {
				return { found: true, node: node, path: nodeListPath, currentSource: currentContextSource(ctx) };
			}
			var name = blockName(node);
			var block = ctx.blocks[name];
			var catalog = blockCatalog(block);
			analyzeNodeShallow(ctx, node, nodeListPath);
			function walkSlots() {
				var slots = activeSlots(node, catalog);
				for (var slotIndex = 0; slotIndex < slots.length; slotIndex++) {
					var slot = slots[slotIndex];
					var childPath = nodeListPath + "." + slot.name;
					var childResult;
					var currentSource = currentSourceForSlot(ctx, node, slot);
					if (currentSource) {
						childResult = ctx.withCurrentSource(currentSource, function () {
							ctx.addPath("current");
							return contextWalkNodes(ctx, slot.nodes || [], request, childPath);
						});
					} else if (name === "file.forEachLine" && slot.name === "nodes") {
						childResult = ctx.withCurrentSource({ path: "file.line", schema: { type: "string" } }, function () {
							ctx.addPath("current");
							return contextWalkNodes(ctx, slot.nodes || [], request, childPath);
						});
					} else {
						childResult = contextWalkNodes(ctx, slot.nodes || [], request, childPath);
					}
					if (childResult && childResult.found) {
						return childResult;
					}
				}
				return { found: false };
			}
			var slotResult = block && block.__graphDefinition && ctx.withGraphBlock
				? ctx.withGraphBlock(node, block, walkSlots)
				: walkSlots();
			if (slotResult && slotResult.found) {
				return slotResult;
			}
			if (targetHere && position === "after") {
				return { found: true, node: node, path: nodeListPath, currentSource: currentContextSource(ctx) };
			}
		}
		return { found: false };
	}

	function scopeRoot(path) {
		return String(path || "").split(".")[0];
	}

	function normalizeInclude(include) {
		if (include === undefined || include === null || include === "") {
			return scopeNames.slice(0);
		}
		if (typeof include === "string") {
			include = [include];
		}
		if (Object.prototype.toString.call(include) !== "[object Array]") {
			raise("INVALID_CONTEXT_INCLUDE", "Flow context include must be an array of scope names.");
		}
		var out = [];
		include.forEach(function (scope) {
			scope = String(scope || "").trim();
			if (scopeNames.indexOf(scope) === -1) {
				raise("INVALID_CONTEXT_SCOPE", "Unknown Flow scope in include: " + scope);
			}
			addUnique(out, scope);
		});
		return out;
	}

	function schemaType(schema, path) {
		if (!schema) {
			return "";
		}
		var current = schema;
		if (!path) {
			return current.type ? String(current.type) : typeof current === "string" ? current : "object";
		}
		String(path).split(".").forEach(function (part) {
			if (!current) {
				return;
			}
			if (current.type === "array" && current.items) {
				current = current.items;
			}
			var source = current.properties || current;
			current = source[part];
		});
		if (!current) {
			return "";
		}
		if (typeof current === "string") {
			return current;
		}
		if (current.type) {
			return String(current.type);
		}
		if (current.properties) {
			return "object";
		}
		if (Object.prototype.toString.call(current) === "[object Array]") {
			return "array";
		}
		return "";
	}

	function analysisSchemaType(ctx, path) {
		var best = "";
		Object.keys(ctx.schemas || {}).forEach(function (basePath) {
			if (path === basePath || path.indexOf(basePath + ".") === 0) {
				if (basePath.length > best.length) {
					best = basePath;
				}
			}
		});
		if (!best) {
			return "";
		}
		var local = path === best ? "" : String(path).substring(best.length + 1);
		return schemaType(ctx.schemas[best], local);
	}

	function declaredSchemaForRoot(definition, root) {
		if (root === "input") {
			return definition.input || definition.inputs || {};
		}
		if (root === "config") {
			return definition.config || {};
		}
		if (root === "result") {
			return definition.output || definition.outputs || {};
		}
		return {};
	}

	function pathType(definition, ctx, path) {
		var root = scopeRoot(path);
		if (path === root) {
			return analysisSchemaType(ctx, path) || (root === "current" ? "unknown" : "object");
		}
		var local = String(path).substring(root.length + 1);
		return analysisSchemaType(ctx, path) || schemaType(declaredSchemaForRoot(definition, root), local) || "unknown";
	}

	function pathConfidence(definition, ctx, path) {
		var root = scopeRoot(path);
		if (path === root) {
			return "declared";
		}
		if (schemaType(declaredSchemaForRoot(definition, root), String(path).substring(root.length + 1))) {
			return "declared";
		}
		if (analysisSchemaType(ctx, path)) {
			return "learned";
		}
		if (ctx.sourceForPath(path)) {
			return "inferred";
		}
		return "unknown";
	}

	function contextPathEntry(ctx, definition, path, currentSource) {
		var source = ctx.sourceForPath(path);
		if (!source && path === "current" && currentSource) {
			source = cloneSource(currentSource);
		}
		var entry = {
			path: path,
			type: pathType(definition, ctx, path),
			confidence: pathConfidence(definition, ctx, path)
		};
		if (source) {
			entry.producer = source;
		}
		return entry;
	}

	function targetPropertyDescriptor(blocks, node, property) {
		if (!node || !property) {
			return null;
		}
		var block = blocks[blockName(node)];
		var descriptor = blockCatalog(block);
		return descriptor && descriptor.props ? normalizeTree(descriptor.props[property] || null) : null;
	}

	function contextForFlowRequest(blocks, request) {
		request = request || {};
		var definition = request.definition !== undefined && request.definition !== null
			? canonicalFlowDefinition(normalizeTree(request.definition))
			: parseSource(sourceForFlowRequest(request, blocks));
		definition = expandFlowDefinition(blocks, definition);
		var include = normalizeInclude(request.include);
		var detail = String(request.detail || "normal");
		if (detail === "summary") {
			detail = "compact";
		}
		if (["normal", "compact"].indexOf(detail) === -1) {
			raise("INVALID_CONTEXT_DETAIL", "Unknown Flow context detail: " + detail,
				null, "Use detail=normal or detail=compact. detail=summary is accepted as compact.");
		}
		var ctx = createAnalysisContext(blocks, request, definition);
		var hasTarget = !!(contextTargetValue(request) || request.path || request.nodePath);
		var found = contextWalkNodes(ctx, definition.nodes || [], request, "nodes");
		if (hasTarget && !found.found) {
			raise("FLOW_CONTEXT_TARGET_NOT_FOUND", "Flow context target not found: " +
				(contextTargetValue(request) || request.path || request.nodePath));
		}
		var scopes = {};
		var currentSource = found.currentSource || null;
		include.forEach(function (scope) {
			var paths = ctx.paths.filter(function (path) {
				return scopeRoot(path) === scope;
			});
			if (paths.length === 0 && ctx.paths.indexOf(scope) !== -1) {
				paths = [scope];
			}
			if (detail === "compact") {
				scopes[scope] = paths;
			} else {
				scopes[scope] = {
					paths: paths.map(function (path) {
						return contextPathEntry(ctx, definition, path, currentSource);
					})
				};
			}
		});
		var out = {
			ok: true,
			node: found.node ? nodePath(found.node) : "",
			path: found.path || "",
			property: request.property || "",
			mode: request.mode || "read",
			include: include,
			detail: detail,
			scopes: scopes
		};
		if (found.node) {
			out.target = {
				id: nodePath(found.node),
				block: blockName(found.node),
				path: found.path || "",
				property: request.property || "",
				propertyDefinition: targetPropertyDescriptor(blocks, found.node, request.property)
			};
		}
		return out;
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

	function blockDescriptor(block) {
		var descriptor = blockCatalog(block);
		descriptor.blockId = descriptor.blockId || block.name;
		descriptor.namespace = blockNamespace(descriptor.blockId);
		descriptor.localName = descriptor.localName || blockLocalName(descriptor.blockId) || descriptor.blockId;
		descriptor.name = descriptor.localName;
		if (descriptor.origin === undefined) {
			descriptor.origin = block.__flowOrigin || "unknown";
		}
		if (descriptor.provider === undefined) {
			descriptor.provider = block.__flowProvider || descriptor.origin || "unknown";
		}
		if (descriptor.file === undefined) {
			descriptor.file = String(block.__flowFile || "");
		}
		if (descriptor.implementation === undefined) {
			descriptor.implementation = block.__graphDefinition ? "flow" : "javascript";
		}
		if (!descriptor.tags) {
			descriptor.tags = [];
		}
		if (descriptor["private"] === undefined && block["private"] !== undefined) {
			descriptor["private"] = block["private"] === true;
		}
		resolveBlockIcon(block, descriptor);
		return descriptor;
	}

	function typeDescriptor(type) {
		var descriptor = normalizeTree(type || {});
		if (!descriptor.name) {
			descriptor.name = type.name;
		}
		if (descriptor.origin === undefined) {
			descriptor.origin = type.__flowOrigin || "unknown";
		}
		if (descriptor.file === undefined) {
			descriptor.file = String(type.__flowFile || "");
		}
		var baseDir = descriptor.file ? new File(descriptor.file).getParentFile() : engineDir();
		["editor", "validator", "reader", "writer", "documentation"].forEach(function (key) {
			var resource = descriptor[key];
			if (resource && typeof resource === "object" && resource.file) {
				resource.file = resourcePath(baseDir, resource.file);
			}
		});
		return descriptor;
	}

	function compactPropertyDescriptor(property) {
		var out = {};
		["kind", "type", "items", "mode", "default", "description"].forEach(function (key) {
			if (property && property[key] !== undefined && property[key] !== null && property[key] !== "") {
				out[key] = property[key];
			}
		});
		return out;
	}

	function compactSlotDescriptor(slot) {
		var out = {};
		["name", "label", "inline", "scope", "input", "local", "current", "error", "description"].forEach(function (key) {
			if (slot && slot[key] !== undefined && slot[key] !== null && slot[key] !== "") {
				out[key] = slot[key];
			}
		});
		return out;
	}

	function compactOutputDescriptors(descriptor) {
		var outputs = descriptor.outputs || descriptor.output || {};
		var out = {};
		if (!outputs || typeof outputs !== "object") {
			return out;
		}
		if (outputs.type || outputs.properties || outputs.items) {
			out.out = schemaSummary(outputs);
			return out;
		}
		Object.keys(outputs).sort().forEach(function (name) {
			var schema = outputs[name];
			if (schema && typeof schema === "object") {
				out[name] = schemaSummary(schema);
			}
		});
		return out;
	}

	function compactBlockDescriptor(descriptor) {
		var properties = {};
		Object.keys(descriptor.props || {}).sort().forEach(function (name) {
			properties[name] = compactPropertyDescriptor(descriptor.props[name]);
		});
		var outputs = compactOutputDescriptors(descriptor);
		var out = {
			blockId: descriptor.blockId,
			description: descriptor.description || ""
		};
		if (Object.keys(properties).length > 0) {
			out.properties = properties;
		}
		if (Object.keys(outputs).length > 0) {
			out.outputs = outputs;
		}
		if (descriptor.tags && descriptor.tags.length) {
			out.tags = descriptor.tags;
		}
		if (descriptor.uses && descriptor.uses.length) {
			out.uses = descriptor.uses;
		}
		if (descriptor.implementation) {
			out.implementation = descriptor.implementation;
		}
		if (descriptor["private"] === true) {
			out["private"] = true;
		}
		if (descriptor.slots) {
			out.slots = descriptor.slots.map(compactSlotDescriptor);
		}
		return out;
	}

	function signatureBlockDescriptor(descriptor) {
		var properties = {};
		Object.keys(descriptor.props || {}).sort().forEach(function (name) {
			properties[name] = summaryPropertyDescriptor(descriptor.props[name]);
		});
		var outputs = compactOutputDescriptors(descriptor);
		var out = {
			block: descriptor.blockId,
			sig: blockSignature(descriptor),
			desc: descriptor.description || ""
		};
		if (Object.keys(properties).length > 0) {
			out.props = properties;
		}
		if (Object.keys(outputs).length > 0) {
			out.outputs = outputs;
		}
		if (descriptor.slots) {
			out.slots = descriptor.slots.map(function (slot) {
				return slot.name;
			});
		}
		if (descriptor["private"] === true) {
			out["private"] = true;
		}
		return out;
	}

	function compactTypeDescriptor(type) {
		var out = {
			name: type.name,
			label: type.label || type.name,
			type: type.type || "unknown",
			origin: type.origin || "unknown",
			description: type.description || ""
		};
		if (type.editor && type.editor.component) {
			out.editor = type.editor.component;
		}
		return out;
	}

	function summaryPropertyDescriptor(property) {
		var parts = [];
		if (property && property.kind) {
			parts.push(String(property.kind));
		}
		if (property && property.type) {
			parts.push(String(property.type));
		}
		if (property && property.mode) {
			parts.push(String(property.mode));
		}
		return parts.join(":") || "value";
	}

	function blockSignature(descriptor) {
		var inputs = [];
		var outputs = [];
		Object.keys(descriptor.props || {}).sort().forEach(function (name) {
			var property = descriptor.props[name] || {};
			var signature = name;
			var type = summaryPropertyDescriptor(property);
			if (type && type !== "value") {
				signature += ":" + type;
			}
			if (property.mode === "write" || name === "out") {
				outputs.push(signature);
			} else {
				inputs.push(signature);
			}
		});
		return (inputs.length ? inputs.join(", ") : "-") + (outputs.length ? " -> " + outputs.join(", ") : "");
	}

	function summaryBlockDescriptor(descriptor) {
		var out = {
			block: descriptor.blockId,
			sig: blockSignature(descriptor),
			desc: descriptor.description || ""
		};
		if (descriptor.slots) {
			out.slots = descriptor.slots.map(function (slot) {
				return slot.name;
			});
		}
		return out;
	}

	function filterPrivateDescriptors(descriptors, options) {
		options = options || {};
		if (options.includePrivate === true) {
			return descriptors;
		}
		return descriptors.filter(function (descriptor) {
			return descriptor["private"] !== true;
		});
	}

	function catalogSearchText(descriptor) {
		return [
			descriptor.blockId,
			descriptor.name,
			descriptor.localName,
			descriptor.namespace,
			descriptor.provider,
			descriptor.origin,
			descriptor.description,
			(descriptor.tags || []).join(" "),
			Object.keys(descriptor.props || {}).join(" ")
		].join(" ").toLowerCase();
	}

	function catalogQueryScore(descriptor, query) {
		query = String(query || "").toLowerCase().trim();
		if (!query) {
			return 1;
		}
		var text = catalogSearchText(descriptor);
		var blockId = String(descriptor.blockId || descriptor.name || "").toLowerCase();
		var localName = String(descriptor.localName || "").toLowerCase();
		var namespace = String(descriptor.namespace || "").toLowerCase();
		var tokens = query.split(/\s+/);
		var score = 0;
		if (blockId === query || localName === query) {
			score += 100;
		} else if (blockId.indexOf(query) !== -1) {
			score += 30;
		}
		for (var i = 0; i < tokens.length; i++) {
			var token = tokens[i];
			if (!token) {
				continue;
			}
			if (blockId === token || localName === token) {
				score += 12;
			} else if (blockId.indexOf(token) !== -1 || localName.indexOf(token) !== -1) {
				score += 8;
			} else if (namespace.indexOf(token) !== -1) {
				score += 4;
			} else if (text.indexOf(token) !== -1) {
				score += 1;
			}
		}
		return score;
	}

	function filterCatalogDescriptors(descriptors, options) {
		options = options || {};
		var query = String(options.query || options.q || "").toLowerCase().trim();
		var namespace = String(options.namespace || "").trim();
		var provider = String(options.provider || "").trim();
		var origin = String(options.origin || "").trim();
		var filtered = descriptors.filter(function (descriptor) {
			if (namespace && String(descriptor.namespace || "") !== namespace &&
					String(descriptor.namespace || "").indexOf(namespace + ".") !== 0) {
				return false;
			}
			if (provider && String(descriptor.provider || "") !== provider) {
				return false;
			}
			if (origin && String(descriptor.origin || "") !== origin) {
				return false;
			}
			if (query) {
				return catalogQueryScore(descriptor, query) > 0;
			}
			return true;
		});
		if (query) {
			filtered.sort(function (a, b) {
				var scoreDiff = catalogQueryScore(b, query) - catalogQueryScore(a, query);
				if (scoreDiff !== 0) {
					return scoreDiff;
				}
				return String(a.blockId || a.name).localeCompare(String(b.blockId || b.name));
			});
		}
		return filtered;
	}

	function pagedCatalogDescriptors(descriptors, options) {
		options = options || {};
		var offset = parseInt(String(options.cursor || "0"), 10);
		if (isNaN(offset) || offset < 0) {
			offset = 0;
		}
		var limit = parseInt(String(options.limit || "0"), 10);
		if (isNaN(limit) || limit < 0) {
			limit = 0;
		}
		if (limit === 0) {
			return {
				items: descriptors,
				total: descriptors.length,
				nextCursor: null
			};
		}
		var items = descriptors.slice(offset, offset + limit);
		return {
			items: items,
			total: descriptors.length,
			nextCursor: offset + limit < descriptors.length ? String(offset + limit) : null
		};
	}

	function catalogPage(blocks, options, mapper) {
		var descriptors = Object.keys(blocks).sort().map(function (name) {
			return blockDescriptor(blocks[name]);
		});
		descriptors = filterPrivateDescriptors(descriptors, options);
		descriptors = filterCatalogDescriptors(descriptors, options);
		var page = pagedCatalogDescriptors(descriptors, options);
		return {
			blocks: page.items.map(mapper),
			total: page.total,
			nextCursor: page.nextCursor
		};
	}

	function addCatalogDocs(out, options) {
		options = options || {};
		if (options.doc !== false) {
			out.doc = "Flow palette. Use summary to discover block names, compact for typed properties, and full only when source-level metadata is required. Compact block descriptors expose typed properties under 'properties'.";
		}
		if (options.hints !== false) {
			out.hints = [
				"If you understood, call with hints=false.",
				"Natural queries are scored token-by-token, so query='requestable call transaction sequence connector' still returns requestable.call even if not every word matches.",
				"Keep calls narrow with query, namespace, provider, origin, limit and cursor. Prefer limit<=20 for discovery.",
				"After finding a candidate block, call flow-block-get for the exact block instead of requesting detail='full' for the whole palette.",
				"Use includeTypes=true or includeLibraries=true only when a compact catalog response must include type or library details.",
				"Use flow-search before palette browsing when an existing Flow example may already show the intended pattern."
			];
		}
		return out;
	}

	function summaryCatalogDefinition(blocks, options) {
		var page = catalogPage(blocks, options, summaryBlockDescriptor);
		var types = loadTypes();
		return addCatalogDocs({
			detail: "summary",
			count: page.blocks.length,
			total: page.total,
			nextCursor: page.nextCursor,
			blocks: page.blocks,
			libraryCount: listFlowLibraries().length,
			typeCount: Object.keys(types).length,
			next: "This is the short palette. Use query/namespace/provider to stay narrow, detail='signature' for typed signatures, flow-block-get for one block, detail='full' only for source-level details."
		}, options);
	}

	function signatureCatalogDefinition(blocks, options) {
		var page = catalogPage(blocks, options, signatureBlockDescriptor);
		return addCatalogDocs({
			detail: "signature",
			count: page.blocks.length,
			total: page.total,
			nextCursor: page.nextCursor,
			blocks: page.blocks,
			next: "Use flow-block-get for one candidate block. Use flow-search first when an executable sample may show the whole pattern."
		}, options);
	}

	function compactCatalogDefinition(blocks, options) {
		var fullPage = catalogPage(blocks, options, function (descriptor) { return descriptor; });
		var page = catalogPage(blocks, options, compactBlockDescriptor);
		var descriptors = page.blocks;
		var includeTypes = options.includeTypes === true || String(options.includeTypes || "") === "true";
		var includeLibraries = options.includeLibraries === true || String(options.includeLibraries || "") === "true";
		return addCatalogDocs({
			detail: "compact",
			count: descriptors.length,
			total: page.total,
			nextCursor: page.nextCursor,
			blocks: descriptors,
			libraryCount: listFlowLibraries().length,
			typeCount: Object.keys(loadTypes()).length,
			libraries: includeLibraries ? listFlowLibraries() : undefined,
			types: includeTypes ? catalogTypes(fullPage.blocks, loadTypes()).map(compactTypeDescriptor) : undefined,
			next: "Use flow-search for examples and flow-block-get for one block. Add includeTypes=true/includeLibraries=true only when those details are needed."
		}, options);
	}

	function catalogDefinition(blocks, options) {
		options = options || {};
		var detail = String(options.detail || options.mode || "full");
		if (detail === "summary") {
			return summaryCatalogDefinition(blocks, options);
		}
		if (detail === "signature") {
			return signatureCatalogDefinition(blocks, options);
		}
		if (detail === "compact") {
			return compactCatalogDefinition(blocks, options);
		}
		var page = catalogPage(blocks, options, function (descriptor) { return descriptor; });
		var descriptors = page.blocks;
		var typeDescriptors = loadTypes();
		var groups = [];
		function groupLabel(provider, origin) {
			if (provider) {
				return provider;
			}
			if (origin === "core") {
				return "lib_flow_engine";
			}
			if (origin === "project") {
				return "Project";
			}
			return "Libraries";
		}
		function groupOrder(origin) {
			if (origin === "core") {
				return 0;
			}
			if (origin === "project") {
				return 1;
			}
			return 2;
		}
		descriptors.forEach(function (block) {
			var origin = block.origin || "unknown";
			var provider = block.provider || origin;
			var group = null;
			for (var i = 0; i < groups.length; i++) {
				if (groups[i].provider === provider) {
					group = groups[i];
					break;
				}
			}
			if (!group) {
				group = {
					origin: origin,
					provider: provider,
					name: groupLabel(provider, origin),
					order: groupOrder(origin),
					blocks: []
				};
				groups.push(group);
			}
			group.blocks.push(block);
		});
		if (projectDir()) {
			var hasProjectGroup = false;
			var projectProvider = flowProviderName(new File(projectDir(), "libs/flow"), "project");
			for (var i = 0; i < groups.length; i++) {
				if (groups[i].origin === "project") {
					hasProjectGroup = true;
					break;
				}
			}
			if (!hasProjectGroup) {
				groups.push({
					origin: "project",
					provider: projectProvider,
					name: groupLabel(projectProvider, "project"),
					order: groupOrder("project"),
					blocks: []
				});
			}
		}
		groups.sort(function (a, b) {
			return a.order - b.order || a.name.localeCompare(b.name);
		});
		groups.forEach(function (group) {
			delete group.order;
		});
		return addCatalogDocs({
			detail: "full",
			count: descriptors.length,
			total: page.total,
			nextCursor: page.nextCursor,
			blocks: descriptors,
			groups: groups,
			libraries: listFlowLibraries(),
			types: catalogTypes(descriptors, typeDescriptors)
		}, options);
	}

	function inferredTypeDescriptor(name) {
		return {
			name: name,
			label: name,
			icon: "mdi:form-textbox",
			origin: "inferred",
			description: "Inferred property type. Add a Flow type descriptor to provide docs, validation and editor resources.",
			inferred: true,
			uses: []
		};
	}

	function catalogTypes(blocks, types) {
		var byName = {};
		Object.keys(types || {}).sort().forEach(function (name) {
			var descriptor = typeDescriptor(types[name]);
			descriptor.uses = [];
			byName[descriptor.name] = descriptor;
		});
		(blocks || []).forEach(function (block) {
			Object.keys(block.props || {}).forEach(function (propName) {
				var prop = block.props[propName] || {};
				var name = String(prop.kind || prop.type || "unknown");
				if (!byName[name]) {
					byName[name] = inferredTypeDescriptor(name);
				}
				if (!byName[name].type && prop.type) {
					byName[name].type = String(prop.type || "");
				}
				byName[name].uses.push({
					block: block.blockId || block.name,
					property: propName,
					type: String(prop.type || ""),
					mode: String(prop.mode || ""),
					file: String(block.file || "")
				});
			});
		});
		return Object.keys(byName).sort().map(function (name) {
			return byName[name];
		});
	}

	function compact(value) {
		return value === undefined || value === null ? "" : JSON.stringify(normalizeTree(value));
	}

	function nodeInfo(nodeAnalysis, catalog) {
		var info = nodeAnalysis ? normalizeTree(nodeAnalysis) : {};
		var props = catalog && catalog.props || {};
		var propertyDefinitions = {};
		var propertyOrder = [];
		var defaults = {};
		Object.keys(props).forEach(function (key) {
			var descriptor = props[key];
			propertyOrder.push(key);
			propertyDefinitions[key] = normalizeTree(descriptor || {});
			if (descriptor && descriptor["default"] !== undefined) {
				defaults[key] = descriptor["default"];
			}
		});
		if (Object.keys(defaults).length > 0) {
			info.propertyDefaults = defaults;
		}
		if (catalog) {
			["icon", "iconify", "iconUrl", "iconSvg", "iconFile", "iconFile16", "iconFile32"].forEach(function (key) {
				if (catalog[key] !== undefined && catalog[key] !== null && String(catalog[key]) !== "") {
					info[key] = String(catalog[key]);
				}
			});
			if (catalog.file) {
				var source = sourceDefinitionForFile(catalog.file, catalog.implementation || "");
				info.implementationKind = source.implementationKind;
				info.sourcePath = source.sourcePath;
				info.sourceRelativePath = source.sourceRelativePath;
				info.sourceOrigin = source.sourceOrigin;
				info.sourceWritable = source.sourceWritable;
				if (source.implementationKind === "flow") {
					info.flowImplementation = true;
					info.readOnlyReference = true;
				}
			}
			if (catalog.provider) {
				info.blockProvider = String(catalog.provider);
				propertyDefinitions.blockProvider = propertyDefinition("Block provider", "Information",
					"Project or library providing this block.", { readOnly: true });
				propertyOrder.push("blockProvider");
			}
			if (catalog.file) {
				var blockSource = sourceDefinitionForFile(catalog.file, catalog.implementation || "");
				if (blockSource.sourceRelativePath) {
					info.blockSource = blockSource.sourceRelativePath;
					propertyDefinitions.blockSource = propertyDefinition("Block source", "Information",
						"Descriptor source for this block.", { readOnly: true });
					propertyOrder.push("blockSource");
				}
			}
		}
		if (propertyOrder.length > 0) {
			info.propertyDefinitions = propertyDefinitions;
			info.propertyOrder = propertyOrder;
		}
		return info;
	}

	var SUMMARY_LIMIT = 72;

	function summaryText(value, max) {
		var text = value === undefined || value === null ? "" : String(value);
		text = text.replace(/\s+/g, " ").trim();
		max = Number(max || SUMMARY_LIMIT);
		if (max > 3 && text.length > max) {
			return text.substring(0, max - 3) + "...";
		}
		return text;
	}

	function summaryValue(value, max) {
		if (value === undefined) {
			return "";
		}
		if (value === null) {
			return "null";
		}
		if (typeof value === "string") {
			var exact = value.match(/^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/);
			if (exact) {
				return summaryText(exact[1], max);
			}
			return summaryText(value, max);
		}
		try {
			return summaryText(JSON.stringify(normalizeTree(value)), max);
		} catch (e) {
			return summaryText(value, max);
		}
	}

	function summaryProp(node, key) {
		return nodeProps(node)[key];
	}

	function hasSummaryProp(props, key) {
		return props && props[key] !== undefined;
	}

	function summaryInput(node) {
		var props = nodeProps(node);
		if (hasSummaryProp(props, "value")) {
			return summaryValue(props.value);
		}
		return "";
	}

	function summaryAssignment(node, operator) {
		var props = nodeProps(node);
		var path = summaryText(props.path || props.out);
		var input = summaryInput(node);
		if (!path) {
			return input;
		}
		return input ? path + " " + (operator || "=") + " " + input : path;
	}

	function summaryOutput(node, action) {
		var props = nodeProps(node);
		var text = summaryText(action);
		var out = summaryText(props.out);
		return text && out ? text + " -> " + out : text || out;
	}

	var flowSummary = {
		text: summaryText,
		value: summaryValue,
		prop: summaryProp,
		input: summaryInput,
		assignment: summaryAssignment,
		output: summaryOutput
	};

	function safeVirtualName(prefix, value) {
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

	function virtualIcon(icon) {
		var descriptor = {
			icon: icon
		};
		resolveBlockIcon({
			__flowFile: new File(engineDir(), "virtual-icons.js").getAbsolutePath()
		}, descriptor);
		return descriptor;
	}

	function virtualNode(name, kind, type, path, summary, definition, info, icon) {
		var nodeInfo = info === undefined || info === null ? "" : String(info);
		if (icon) {
			var baseInfo = {};
			if (nodeInfo) {
				try {
					baseInfo = normalizeTree(JSON.parse(nodeInfo));
				} catch (e) {
					baseInfo = {};
				}
			}
			var iconInfo = virtualIcon(icon);
			Object.keys(iconInfo).forEach(function (key) {
				baseInfo[key] = iconInfo[key];
			});
			nodeInfo = compact(baseInfo);
		}
		return {
			name: safeVirtualName(kind || "item", name),
			kind: String(kind || ""),
			type: String(type || ""),
			path: String(path || ""),
			summary: String(summary || name || ""),
			definition: definition === undefined || definition === null ? "" : String(definition),
			info: nodeInfo,
			children: []
		};
	}

	function addSchemaFields(parent, schema, path, name) {
		if (!schema || typeof schema !== "object" || Object.prototype.toString.call(schema) === "[object Array]") {
			return;
		}
		var folder = virtualNode(name, "schema", name, path, name, compact(schema), null, "mdi:code-json");
		parent.children.push(folder);
		addObjectFields(folder, schema, path);
	}

	function addObjectFields(parent, object, path) {
		Object.keys(object || {}).sort().forEach(function (key) {
			var value = object[key];
			var fieldPath = path + "." + key;
			if (value && typeof value === "object" && Object.prototype.toString.call(value) !== "[object Array]") {
				var folder = virtualNode(key, "object", key, fieldPath, key, compact(value), null, "mdi:cube-outline");
				parent.children.push(folder);
				addObjectFields(folder, value, fieldPath);
			} else {
				parent.children.push(virtualNode(key, "field", value, fieldPath, key + ": " + String(value), compact(value), null, "mdi:variable"));
			}
		});
	}

	function addContracts(out, contracts, path) {
		if (!contracts || typeof contracts !== "object" || Object.keys(contracts).length === 0) {
			return;
		}
		var folder = virtualNode("contracts", "folder", "contracts", path, "Contracts", compact(contracts), null, "mdi:file-sign");
		out.push(folder);
		Object.keys(contracts).sort().forEach(function (name) {
			var contract = contracts[name] || {};
			var contractObject = virtualNode("contract_" + name, "contract", name, path + "." + name, name, compact(contract), null, "mdi:file-sign");
			folder.children.push(contractObject);
			addSchemaFields(contractObject, contract.input, path + "." + name + ".input", "input");
			addSchemaFields(contractObject, contract.output, path + "." + name + ".output", "output");
			if (contract.defaultImplementation !== undefined && contract.defaultImplementation !== null) {
				var implementation = String(contract.defaultImplementation);
				contractObject.children.push(virtualNode("defaultImplementation", "binding", implementation,
					path + "." + name + ".defaultImplementation", "default -> " + implementation, implementation, null, "mdi:link-variant"));
			}
		});
	}

	function addBindings(out, bindings, path) {
		if (!bindings || typeof bindings !== "object" || Object.keys(bindings).length === 0) {
			return;
		}
		var folder = virtualNode("bindings", "folder", "bindings", path, "Bindings", compact(bindings), null, "mdi:link-variant");
		out.push(folder);
		Object.keys(bindings).sort().forEach(function (contract) {
			var implementation = bindings[contract];
			folder.children.push(virtualNode("binding_" + contract, "binding", contract, path + "." + contract,
				contract + " -> " + String(implementation), compact(implementation), null, "mdi:link-variant"));
		});
	}

	function addConfig(out, config, path) {
		if (!config || typeof config !== "object" || Object.keys(config).length === 0) {
			return;
		}
		var folder = virtualNode("config", "scope", "config", path, "Config", compact(config), null, "mdi:cog-outline");
		out.push(folder);
		addObjectFields(folder, config, path);
	}

	function normalizeSlotDefinition(slot) {
		if (typeof slot === "string") {
			return { name: slot, label: slot, aliases: [], inline: false };
		}
		slot = slot || {};
		var out = {
			name: String(slot.name || "nodes"),
			label: String(slot.label || slot.name || "nodes"),
			aliases: slot.aliases || [],
			inline: slot.inline === true
		};
		["scope", "input", "local", "current", "error", "description"].forEach(function (key) {
			if (slot[key] !== undefined && slot[key] !== null && String(slot[key]) !== "") {
				out[key] = slot[key];
			}
		});
		return out;
	}

	function slotDefinitions(catalog) {
		var slots = catalog && catalog.slots;
		if (slots && Object.prototype.toString.call(slots) === "[object Array]") {
			return slots.map(normalizeSlotDefinition);
		}
		var children = catalog && catalog.children;
		if (children && Object.prototype.toString.call(children) === "[object Array]") {
			return children.map(normalizeSlotDefinition);
		}
		return ["nodes", "do", "then", "else", "catch", "finally"].map(normalizeSlotDefinition);
	}

	function activeSlots(node, catalog) {
		var active = [];
		slotDefinitions(catalog).forEach(function (definition) {
			var names = [definition.name].concat(definition.aliases || []);
			for (var i = 0; i < names.length; i++) {
				var name = String(names[i]);
				var nodes = node && node[name];
				if (nodes && Object.prototype.toString.call(nodes) === "[object Array]" && nodes.length > 0) {
					active.push({
						name: name,
						label: definition.label,
						inline: definition.inline,
						scope: definition.scope || "",
						input: definition.input || "",
						local: definition.local || "",
						current: definition.current || "",
						error: definition.error || "",
						nodes: nodes
					});
					break;
				}
			}
		});
		return active;
	}

	function nodeSummary(block, catalog, node, id, blockName) {
		var label = id;
		try {
			if (block && typeof block.displayName === "function") {
				label = block.displayName(node) || id;
			} else if (catalog && typeof catalog.displayName === "function") {
				label = catalog.displayName(node) || id;
			}
		} catch (e) {
			label = id;
		}
		return "[" + blockName + "] " + summaryText(label);
	}

	function addNodeSlots(parent, node, nodePath, catalog, blocks, analysisById, sourceInfo, sourceNodePath) {
		activeSlots(node, catalog).forEach(function (slot) {
			var path = nodePath + "." + slot.name;
			var slotSourcePath = sourceNodePath ? sourceNodePath + "." + slot.name : "";
			if (slot.inline) {
				addNodeList(parent, slot.nodes, path, blocks, analysisById, sourceInfo, slotSourcePath);
			} else {
				var slotMeta = normalizeTree(slot);
				delete slotMeta.nodes;
				var slotInfo = sourceInfo ? sourceInfoForPath(sourceInfo, slotSourcePath) : {};
				Object.keys(slotMeta).forEach(function (key) {
					slotInfo[key] = slotMeta[key];
				});
				var folder = virtualNode(slot.name, "slot", slot.name, path, slot.label, compact(slot.nodes), compact(slotInfo), "mdi:call-split");
				parent.children.push(folder);
				addNodeList(folder, slot.nodes, path, blocks, analysisById, sourceInfo, slotSourcePath);
			}
		});
	}

	function sourceInfoForPath(sourceInfo, mutationPath) {
		if (!sourceInfo) {
			return null;
		}
		var info = normalizeTree(sourceInfo);
		if (mutationPath !== undefined && mutationPath !== null && String(mutationPath) !== "") {
			info.sourceMutationPath = String(mutationPath);
		}
		return info;
	}

	function mergeSourceInfo(info, sourceInfo, mutationPath) {
		info = info || {};
		var source = sourceInfoForPath(sourceInfo, mutationPath);
		if (source) {
			Object.keys(source).forEach(function (key) {
				info[key] = source[key];
			});
		}
		return info;
	}

	function addNodeList(parent, nodes, path, blocks, analysisById, sourceInfo, sourceBasePath) {
		(nodes || []).forEach(function (node, index) {
			var id = String(node && (node.id || node.uid || node.name) || "node" + index);
			var blockType = String(blockName(node) || "unknown");
			var block = blocks && blocks[blockType];
			var catalog = blockDescriptor(block);
			resolveBlockIcon(block, catalog);
			var nodeAnalysis = analysisById && analysisById[id];
			var nodePath = path + "[" + index + "]";
			var sourceNodePath = sourceBasePath ? sourceBasePath + "[" + index + "]" : "";
			var shallow = {};
			Object.keys(node || {}).forEach(function (key) {
				if (key.indexOf("__") !== 0 && ["nodes", "do", "then", "else", "catch", "finally"].indexOf(key) === -1) {
					shallow[key] = node[key];
				}
				});
				var nodeInformation = mergeSourceInfo(nodeInfo(nodeAnalysis, catalog), sourceInfo, sourceNodePath);
				var nodeObject = virtualNode("node_" + id, "node", blockType, nodePath,
					nodeSummary(block, catalog, node, id, blockType), compact(shallow), compact(nodeInformation));
				parent.children.push(nodeObject);
				if (node.__graphBlock && node.nodes) {
					var graphSource = sourceDefinitionForFile(node.__graphBlock.file, "flow");
					graphSource.sourceWritable = false;
					graphSource.writable = false;
					graphSource.readOnly = true;
					graphSource.readOnlyReference = true;
					var implementationNode = virtualNode("implementation", "blockImplementation", "flow",
						nodePath + ".implementation", "Implementation",
						compact(graphSource), compact(sourceObjectInfo(graphSource, sourcePropertyDefinitions(),
							["implementationKind", "sourceRelativePath", "sourceOrigin", "sourceWritable", "readOnly"])), "mdi:source-branch");
					nodeObject.children.push(implementationNode);
					addNodeList(implementationNode, node.nodes, nodePath + ".implementation.nodes", blocks, analysisById, graphSource, "nodes");
				}
				var slotNode = node;
				if (node.__graphBlock && node.nodes) {
					slotNode = normalizeTree(node);
					delete slotNode.nodes;
				}
				addNodeSlots(nodeObject, slotNode, nodePath, catalog, blocks, analysisById, sourceInfo, sourceNodePath);
			});
	}

	function addNodes(out, nodes, path, blocks, analysisById) {
		if (!nodes || Object.prototype.toString.call(nodes) !== "[object Array]") {
			return;
		}
		var folder = virtualNode("flow", "folder", "flow", path, "Flow", compact(nodes), null, "mdi:sitemap-outline");
		out.push(folder);
		addNodeList(folder, nodes, path, blocks, analysisById);
	}

	function sourceDefinitionForFile(file, implementation) {
		var text = String(file || "");
		var definition = {
			implementation: implementation,
			implementationKind: implementation,
			file: text,
			sourcePath: text,
			sourceOrigin: "",
			sourceRelativePath: "",
			sourceWritable: false,
			writable: false,
			readOnly: true
		};
		if (text) {
			var sourceFile = new File(text);
			var projectRelative = projectDir() ? resourceRelativePath(projectDir(), sourceFile) : "";
			var engineRelative = resourceRelativePath(new File(engineDir(), "../.."), sourceFile);
			if (projectRelative) {
				definition.path = projectRelative;
				definition.origin = "project";
				definition.sourceOrigin = "project";
				definition.sourceRelativePath = projectRelative;
				definition.sourceWritable = true;
				definition.writable = true;
				definition.readOnly = false;
			} else if (engineRelative) {
				definition.path = engineRelative;
				definition.origin = "engine";
				definition.sourceOrigin = "engine";
				definition.sourceRelativePath = engineRelative;
			}
		}
		return definition;
	}

	function propertyDefinition(label, category, description, options) {
		options = options || {};
		var definition = {
			label: label,
			category: category || "Base properties",
			description: description || "",
			readOnly: options.readOnly === true
		};
		if (options.kind) {
			definition.kind = options.kind;
		}
		if (options.type) {
			definition.type = options.type;
		}
		if (options.items !== undefined) {
			definition.items = options.items;
		}
		if (options.defaultValue !== undefined) {
			definition.default = options.defaultValue;
		}
		if (options.hidden === true) {
			definition.hidden = true;
		}
		if (options.expert === true) {
			definition.expert = true;
		}
		return definition;
	}

	function sourceObjectInfo(sourceInfo, propertyDefinitions, propertyOrder) {
		var info = normalizeTree(sourceInfo || {});
		if (propertyDefinitions) {
			info.propertyDefinitions = propertyDefinitions;
		}
		if (propertyOrder) {
			info.propertyOrder = propertyOrder;
		}
		return info;
	}

	function sourcePropertyDefinitions() {
		return {
			implementation: propertyDefinition("Implementation", "Information", "Internal implementation kind.", { readOnly: true, hidden: true }),
			file: propertyDefinition("File", "Information", "Internal source file.", { readOnly: true, hidden: true }),
			path: propertyDefinition("Path", "Information", "Internal relative source path.", { readOnly: true, hidden: true }),
			origin: propertyDefinition("Origin", "Information", "Internal source origin.", { readOnly: true, hidden: true }),
			writable: propertyDefinition("Writable", "Information", "Internal writable flag.", { readOnly: true, hidden: true }),
			sourcePath: propertyDefinition("Source path", "Information", "Internal absolute source path.", { readOnly: true, hidden: true }),
			sourceMutationPath: propertyDefinition("Mutation path", "Information", "Internal mutation path.", { readOnly: true, hidden: true }),
			sourceBlockName: propertyDefinition("Block", "Information", "Internal source block name.", { readOnly: true, hidden: true }),
			sourceRelativePath: propertyDefinition("Relative path", "Information", "Project or engine relative source path.", { readOnly: true }),
			sourceOrigin: propertyDefinition("Origin", "Information", "Source origin: project, core engine or library.", { readOnly: true }),
			implementationKind: propertyDefinition("Implementation", "Information", "Implementation source kind.", { readOnly: true }),
			sourceWritable: propertyDefinition("Writable", "Information", "Whether this source can be edited from the current project.", { readOnly: true }),
			flowImplementation: propertyDefinition("Flow implementation", "Information", "Whether this source is a Flow implementation.", { readOnly: true, hidden: true }),
			readOnlyReference: propertyDefinition("Read-only reference", "Information", "Whether this source is shown as a read-only reference.", { readOnly: true, hidden: true }),
			readOnly: propertyDefinition("Read only", "Information", "Whether this virtual object is read-only.", { readOnly: true })
		};
	}

	function catalogGroupPropertyDefinitions() {
		return {
			provider: propertyDefinition("Provider", "Information", "Project or library providing the catalog entries.", { readOnly: true }),
			origin: propertyDefinition("Origin", "Information", "Catalog origin.", { readOnly: true }),
			count: propertyDefinition("Count", "Information", "Number of blocks in this group.", { readOnly: true })
		};
	}

	function libraryPropertyDefinitions() {
		return {
			name: propertyDefinition("Name", "Information", "Library name used by ctx.lib(name).", { readOnly: true }),
			provider: propertyDefinition("Provider", "Information", "Project providing this library.", { readOnly: true }),
			origin: propertyDefinition("Origin", "Information", "Library origin.", { readOnly: true }),
			description: propertyDefinition("Description", "Information", "Library documentation.", { readOnly: true }),
			sourceRelativePath: propertyDefinition("Relative path", "Information", "Project or engine relative source path.", { readOnly: true }),
			sourceOrigin: propertyDefinition("Source origin", "Information", "Source origin: project or core engine.", { readOnly: true }),
			sourceWritable: propertyDefinition("Writable", "Information", "Whether this library can be edited from the current project.", { readOnly: true })
		};
	}

	function blockPropertyDefinitions() {
		return {
			version: propertyDefinition("Version", "Information", "Descriptor version.", { readOnly: true, hidden: true }),
			blockId: propertyDefinition("Block id", "Information", "Full runtime block id computed from provider namespace and block name.", { readOnly: true }),
			name: propertyDefinition("Name", "Information", "Local block name computed from the descriptor file name.", { readOnly: true }),
			localName: propertyDefinition("Local name", "Information", "Local block name computed from the descriptor file name.", { readOnly: true, hidden: true }),
			namespace: propertyDefinition("Namespace", "Information", "Namespace computed from the descriptor path.", { readOnly: true }),
			provider: propertyDefinition("Provider", "Information", "Project providing this block.", { readOnly: true }),
			file: propertyDefinition("File", "Information", "Internal descriptor file.", { readOnly: true, hidden: true }),
			origin: propertyDefinition("Origin", "Information", "Catalog origin.", { readOnly: true, hidden: true }),
			__flowFile: propertyDefinition("Source file", "Information", "Internal descriptor file.", { readOnly: true, hidden: true }),
			__flowOrigin: propertyDefinition("Source origin", "Information", "Internal source origin.", { readOnly: true, hidden: true }),
			implementationFile: propertyDefinition("Implementation file", "Information", "Internal implementation file.", { readOnly: true, hidden: true }),
			runtime: propertyDefinition("Runtime", "Information", "Internal runtime kind.", { readOnly: true, hidden: true }),
			iconify: propertyDefinition("Iconify", "Information", "Resolved Iconify id.", { readOnly: true, hidden: true }),
			iconUrl: propertyDefinition("Icon URL", "Information", "Resolved remote icon URL.", { readOnly: true, hidden: true }),
			iconSvg: propertyDefinition("Icon SVG", "Information", "Resolved SVG icon file.", { readOnly: true, hidden: true }),
			iconFile: propertyDefinition("Icon file", "Information", "Resolved icon file.", { readOnly: true, hidden: true }),
			iconFile16: propertyDefinition("Icon 16", "Information", "Resolved 16x16 icon file.", { readOnly: true, hidden: true }),
			iconFile32: propertyDefinition("Icon 32", "Information", "Resolved 32x32 icon file.", { readOnly: true, hidden: true }),
			implementation: propertyDefinition("Implementation", "Information", "Runtime and source file. Edit the Implementation child instead.", { readOnly: true }),
			hooks: propertyDefinition("Hooks", "Information", "Dynamic display/analyze source. Edit the Hooks child instead.", { readOnly: true }),
			description: propertyDefinition("Description", "Base properties", "Short block description.", { kind: "text", type: "string" }),
			longDescription: propertyDefinition("Long description", "Base properties", "Detailed block documentation.", { kind: "markdown", type: "string" }),
			icon: propertyDefinition("Icon", "Base properties", "Icon id, relative icon file, or URL.", { kind: "icon", type: "string" }),
			uses: propertyDefinition("Libraries", "Base properties", "JavaScript libraries explicitly used by this block implementation.", { kind: "array", type: "array", items: { kind: "text", type: "string", trim: true, unique: true }, defaultValue: [] }),
			display: propertyDefinition("Display template", "Information", "Legacy static display fallback. Prefer the Hooks displayName function.", { readOnly: true, hidden: true }),
			private: propertyDefinition("Private", "Expert", "Hide this block from projects referencing this library.", { kind: "boolean", type: "boolean", defaultValue: false }),
			tags: propertyDefinition("Tags", "Base properties", "Searchable labels used for filtering and documentation.", { kind: "array", type: "array", items: { kind: "text", type: "string", trim: true, unique: true }, defaultValue: [] }),
			kind: propertyDefinition("Kind", "Information", "Legacy field migrated to tags.", { readOnly: true, hidden: true }),
			package: propertyDefinition("Package", "Information", "Legacy field replaced by provider.", { readOnly: true, hidden: true }),
			props: propertyDefinition("Properties", "Information", "Block property contract. Edit the Properties child instead.", { readOnly: true, hidden: true }),
			slots: propertyDefinition("Slots", "Properties", "Child node slots accepted by this block.", { kind: "literal", type: "array" }),
			defaults: propertyDefinition("Defaults", "Properties", "Default node values applied when the block is dropped from the palette.", { kind: "literal", type: "object" })
		};
	}

	function blockPropertiesFolderDefinitions() {
		return {
			count: propertyDefinition("Count", "Information", "Number of properties declared by this block.", { readOnly: true })
		};
	}

	function blockPropertyDefinitionDefinitions() {
		return {
			name: propertyDefinition("Name", "Information", "Property name computed from the descriptor key.", { readOnly: true }),
			label: propertyDefinition("Label", "Base properties", "Human-readable property label.", { kind: "text", type: "string" }),
			kind: propertyDefinition("Kind", "Base properties", "Flow property editor kind.", { kind: "text", type: "string" }),
			type: propertyDefinition("Value type", "Base properties", "JSON value type handled by this property.", { kind: "text", type: "string" }),
			mode: propertyDefinition("Mode", "Base properties", "Property usage mode such as read or write.", { kind: "text", type: "string" }),
			description: propertyDefinition("Description", "Base properties", "Property documentation.", { kind: "markdown", type: "string" }),
			default: propertyDefinition("Default", "Base properties", "Default property value.", { kind: "literal" }),
			items: propertyDefinition("Items", "Expert", "Array item descriptor.", { kind: "literal", type: "object" }),
			component: propertyDefinition("Component", "Expert", "Optional custom editor component.", { kind: "text", type: "string" })
		};
	}

	function typePropertyDefinitions() {
		return {
			version: propertyDefinition("Version", "Information", "Descriptor version.", { readOnly: true, hidden: true }),
			name: propertyDefinition("Name", "Information", "Type name. It is owned by the descriptor file name.", { readOnly: true }),
			file: propertyDefinition("File", "Information", "Internal type descriptor file.", { readOnly: true, hidden: true }),
			__flowFile: propertyDefinition("Source file", "Information", "Internal type descriptor file.", { readOnly: true, hidden: true }),
			__flowOrigin: propertyDefinition("Source origin", "Information", "Internal source origin.", { readOnly: true, hidden: true }),
			sourcePath: propertyDefinition("Source path", "Information", "Internal absolute source path.", { readOnly: true, hidden: true }),
			sourceRelativePath: propertyDefinition("Relative path", "Information", "Project or engine relative source path.", { readOnly: true }),
			sourceOrigin: propertyDefinition("Origin", "Information", "Source origin: project, core engine or library.", { readOnly: true }),
			sourceWritable: propertyDefinition("Writable", "Information", "Whether this type can be edited from the current project.", { readOnly: true }),
			origin: propertyDefinition("Origin", "Information", "Catalog origin.", { readOnly: true, hidden: true }),
			iconify: propertyDefinition("Iconify", "Information", "Resolved Iconify id.", { readOnly: true, hidden: true }),
			iconUrl: propertyDefinition("Icon URL", "Information", "Resolved remote icon URL.", { readOnly: true, hidden: true }),
			iconSvg: propertyDefinition("Icon SVG", "Information", "Resolved SVG icon file.", { readOnly: true, hidden: true }),
			iconFile: propertyDefinition("Icon file", "Information", "Resolved icon file.", { readOnly: true, hidden: true }),
			iconFile16: propertyDefinition("Icon 16", "Information", "Resolved 16x16 icon file.", { readOnly: true, hidden: true }),
			iconFile32: propertyDefinition("Icon 32", "Information", "Resolved 32x32 icon file.", { readOnly: true, hidden: true }),
			label: propertyDefinition("Label", "Base properties", "Human-readable type label.", { kind: "text", type: "string" }),
			description: propertyDefinition("Description", "Base properties", "Type documentation.", { kind: "markdown", type: "string" }),
			icon: propertyDefinition("Icon", "Base properties", "Icon id, relative icon file, or URL.", { kind: "icon", type: "string" }),
			type: propertyDefinition("Value type", "Base properties", "JSON value type handled by this property type.", { kind: "text", type: "string" }),
			editor: propertyDefinition("Editor", "Editor", "Editor descriptor. Edit the Editor child/source for implementation code.", { readOnly: true, hidden: true }),
			validator: propertyDefinition("Validator", "Editor", "Validator descriptor.", { readOnly: true, hidden: true }),
			reader: propertyDefinition("Reader", "Editor", "Reader descriptor.", { readOnly: true, hidden: true }),
			writer: propertyDefinition("Writer", "Editor", "Writer descriptor.", { readOnly: true, hidden: true }),
			uses: propertyDefinition("Usages", "Information", "Blocks using this type.", { readOnly: true })
		};
	}

	function typeResourcePropertyDefinitions() {
		return {
			type: propertyDefinition("Type", "Information", "Owner property type.", { readOnly: true }),
			role: propertyDefinition("Role", "Information", "Resource role.", { readOnly: true }),
			file: propertyDefinition("File", "Information", "Internal source file.", { readOnly: true, hidden: true }),
			sourcePath: propertyDefinition("Source path", "Information", "Internal absolute source path.", { readOnly: true, hidden: true }),
			sourceRelativePath: propertyDefinition("Relative path", "Information", "Resource source file. Open the tree item to edit the source.", { readOnly: true }),
			sourceOrigin: propertyDefinition("Origin", "Information", "Source origin: project, core engine or library.", { readOnly: true }),
			sourceWritable: propertyDefinition("Writable", "Information", "Whether this resource can be edited from the current project.", { readOnly: true }),
			iconify: propertyDefinition("Iconify", "Information", "Resolved Iconify id.", { readOnly: true, hidden: true }),
			iconUrl: propertyDefinition("Icon URL", "Information", "Resolved remote icon URL.", { readOnly: true, hidden: true }),
			iconSvg: propertyDefinition("Icon SVG", "Information", "Resolved SVG icon file.", { readOnly: true, hidden: true }),
			iconFile: propertyDefinition("Icon file", "Information", "Resolved icon file.", { readOnly: true, hidden: true }),
			iconFile16: propertyDefinition("Icon 16", "Information", "Resolved 16x16 icon file.", { readOnly: true, hidden: true }),
			iconFile32: propertyDefinition("Icon 32", "Information", "Resolved 32x32 icon file.", { readOnly: true, hidden: true }),
			label: propertyDefinition("Label", "Base properties", "Resource label.", { kind: "text", type: "string" }),
			kind: propertyDefinition("Kind", "Base properties", "Resource kind.", { kind: "text", type: "string" }),
			component: propertyDefinition("Component", "Base properties", "Web component or editor component name.", { kind: "text", type: "string" }),
			icon: propertyDefinition("Icon", "Base properties", "Icon id, relative icon file, or URL.", { kind: "icon", type: "string" }),
			function: propertyDefinition("Function", "Expert", "Runtime function exported by this resource.", { kind: "text", type: "string" })
		};
	}

	function addImplementationNodes(parent, nodes, path, blocks, stack, sourceInfo, sourceBasePath) {
		var implementationNodes = expandFragmentNodes(blocks, nodes || [], stack || [], {
			expandGraphBlocks: false
		});
		addNodeList(parent, implementationNodes, path, blocks, {}, sourceInfo, sourceBasePath || "nodes");
	}

	function addBlockImplementation(parent, block, descriptor, path, blocks) {
		if (!descriptor || !descriptor.file) {
			return;
		}
		if (block && block.__graphDefinition) {
			var flowSource = sourceDefinitionForFile(block.__flowImplementationFile || descriptor.implementationFile || descriptor.file, "flow");
			flowSource.sourceBlockName = descriptor.blockId || block.name || descriptor.name || "";
			flowSource.sourceMutationPath = "nodes";
			flowSource.flowImplementation = true;
			var flowSourceInfo = sourceObjectInfo(flowSource, sourcePropertyDefinitions(),
				["implementationKind", "sourceRelativePath", "sourceOrigin", "sourceWritable", "readOnly"]);
			var flowNode = virtualNode("implementation", "blockImplementation", "flow",
				path + ".implementation", "Implementation",
				compact(flowSource), compact(flowSourceInfo), "mdi:source-branch");
			parent.children.push(flowNode);
			addImplementationNodes(flowNode, block.__graphDefinition.nodes || [],
				path + ".implementation.nodes", blocks, ["block:" + block.name], flowSource, "nodes");
			return;
		}
		var jsFile = block && block.__flowImplementationFile ? block.__flowImplementationFile : descriptor.implementationFile || descriptor.file;
		var jsSource = sourceDefinitionForFile(jsFile, "javascript");
		var jsSourceInfo = sourceObjectInfo(jsSource, sourcePropertyDefinitions(),
			["implementationKind", "sourceRelativePath", "sourceOrigin", "sourceWritable", "readOnly"]);
		parent.children.push(virtualNode("implementation", "blockImplementation", "javascript",
			path + ".implementation", "Implementation",
			compact(jsSource), compact(jsSourceInfo), "mdi:language-javascript"));
	}

	function addBlockHooks(parent, block, path) {
		if (!block || !block.__flowHooksFile) {
			return;
		}
		var hooksSource = sourceDefinitionForFile(block.__flowHooksFile, "javascript-hooks");
		var hooksSourceInfo = sourceObjectInfo(hooksSource, sourcePropertyDefinitions(),
			["implementationKind", "sourceRelativePath", "sourceOrigin", "sourceWritable", "readOnly"]);
		parent.children.push(virtualNode("hooks", "blockHooks", "javascript",
			path + ".hooks", "Hooks", compact(hooksSource), compact(hooksSourceInfo), "mdi:script-text-outline"));
	}

	function librarySourceInfo(library) {
		var source = sourceDefinitionForFile(library.file || "", "javascript-library");
		Object.keys(library).forEach(function (key) {
			if (source[key] === undefined) {
				source[key] = library[key];
			}
		});
		return sourceObjectInfo(source, libraryPropertyDefinitions(),
			["name", "provider", "origin", "description", "sourceRelativePath", "sourceOrigin", "sourceWritable"]);
	}

	function libraryForName(libraries, name) {
		name = String(name || "");
		for (var i = 0; i < libraries.length; i++) {
			if (libraries[i].name === name) {
				return libraries[i];
			}
		}
		return null;
	}

	function addBlockUses(parent, descriptor, path) {
		var uses = normalizeGraphBlockUses(descriptor || {});
		if (uses.length === 0) {
			return;
		}
		var libraries = listFlowLibraries();
		var folder = virtualNode("uses", "folder", "uses", path + ".uses",
			"Uses (" + uses.length + ")", compact({ count: uses.length, uses: uses }), null, "mdi:library-outline");
		parent.children.push(folder);
		uses.forEach(function (name, index) {
			var library = libraryForName(libraries, name);
			var definition = library || {
				name: name,
				provider: "",
				origin: "missing",
				file: "",
				description: "Missing Flow JavaScript library."
			};
			var summary = library ? name + " [" + library.provider + "]" : name + " [missing]";
			folder.children.push(virtualNode("library_" + name, "libraryUse", name,
				path + ".uses[" + index + "]", summary, compact(definition),
				compact(librarySourceInfo(definition)), library ? "mdi:script-text-outline" : "mdi:alert-outline"));
		});
	}

	function propertyDefinitionIcon(definition) {
		var kind = String(definition && (definition.kind || definition.type) || "");
		if (kind === "expression") {
			return "mdi:function-variant";
		}
		if (kind === "path") {
			return "mdi:map-marker-path";
		}
		if (kind === "template") {
			return "mdi:code-braces";
		}
		if (kind === "boolean") {
			return "mdi:toggle-switch-outline";
		}
		if (kind === "array") {
			return "mdi:format-list-bulleted";
		}
		if (kind === "object" || kind === "literal") {
			return "mdi:code-json";
		}
		return "mdi:form-textbox";
	}

	function propertyDefinitionSummary(name, definition) {
		definition = definition || {};
		var kind = String(definition.kind || definition.type || "value");
		var type = String(definition.type || "");
		var suffix = type && type !== kind ? kind + ":" + type : kind;
		return name + " [" + suffix + "]";
	}

	function addBlockProperties(parent, descriptor, path) {
		var props = normalizeTree(descriptor && descriptor.props || {});
		var keys = Object.keys(props);
		var propsSource = sourceDefinitionForFile(descriptor.file, "properties");
		propsSource.sourceMutationPath = "props";
		var folderInfo = sourceObjectInfo(propsSource, blockPropertiesFolderDefinitions(), ["count"]);
		var folder = virtualNode("properties", "folder", "blockProperties",
			path + ".properties", "Properties", compact({ count: keys.length }), compact(folderInfo), "mdi:form-textbox");
		parent.children.push(folder);
		keys.forEach(function (key) {
			var propDefinition = normalizeTree(props[key] || {});
			propDefinition.name = key;
			var propSource = sourceDefinitionForFile(descriptor.file, "property");
			propSource.sourceMutationPath = "props." + key;
			var propInfo = sourceObjectInfo(propSource, blockPropertyDefinitionDefinitions(),
				["name", "label", "kind", "type", "mode", "description", "default", "items", "component",
					"sourceRelativePath", "sourceOrigin", "sourceWritable"]);
			folder.children.push(virtualNode("property_" + safeVirtualName("property", key), "blockProperty", key,
				path + ".properties." + safeVirtualName("property", key),
				propertyDefinitionSummary(key, propDefinition), compact(propDefinition), compact(propInfo),
				propertyDefinitionIcon(propDefinition)));
		});
	}

	function addCatalogLibraries(catalog) {
		var libraries = listFlowLibraries();
		var folder = virtualNode("libraries", "folder", "libraries", "catalog.libraries",
			"Libraries", compact({ count: libraries.length }), null, "mdi:library-outline");
		catalog.children.push(folder);
		var groups = {};
		libraries.forEach(function (library) {
			var provider = String(library.provider || library.origin || "unknown");
			if (!groups[provider]) {
				var groupPath = "catalog.libraries." + safeVirtualName("provider", provider);
				groups[provider] = virtualNode("provider_" + provider, "folder", library.origin || "unknown",
					groupPath, provider, compact({ provider: provider, origin: library.origin || "", count: 0 }),
					compact(sourceObjectInfo({ provider: provider, origin: library.origin || "", count: 0 },
						catalogGroupPropertyDefinitions(), ["provider", "origin", "count"])),
					library.origin === "core" ? "mdi:package-variant-closed" : "mdi:folder-account-outline");
				folder.children.push(groups[provider]);
			}
			var group = groups[provider];
			var definition = JSON.parse(group.definition || "{}");
			definition.count = Number(definition.count || 0) + 1;
			group.definition = compact(definition);
			group.children.push(virtualNode("library_" + library.name, "library", library.name,
				group.path + "." + safeVirtualName("library", library.name),
				library.name, compact(library), compact(librarySourceInfo(library)), "mdi:script-text-outline"));
		});
	}

	function addCatalog(out, blocks, options) {
		var catalog = virtualNode("catalog", "folder", "catalog", "catalog", "Catalog", compact({}), null, "mdi:bookshelf");
		var catalogDefinitionValue = catalogDefinition(blocks, options || {});
		var blocksFolder = virtualNode("blocks", "folder", "blocks", "catalog.blocks", "Blocks", compact({}), null, "mdi:puzzle-outline");
		catalog.children.push(blocksFolder);
		var iconByOrigin = {
			core: "mdi:package-variant-closed",
			project: "mdi:folder-account-outline"
		};
		catalogDefinitionValue.groups.forEach(function (group) {
			var groupKey = safeVirtualName("provider", group.provider || group.origin || "unknown");
			var groupPath = "catalog.blocks." + groupKey;
			var groupDefinition = compact({ provider: group.provider || "", origin: group.origin, count: group.blocks.length });
			var groupInfo = sourceObjectInfo({}, catalogGroupPropertyDefinitions(), ["provider", "origin", "count"]);
			var groupNode = virtualNode("provider_" + groupKey, "folder", group.origin, groupPath,
				group.name, groupDefinition, compact(groupInfo),
				iconByOrigin[group.origin] || "mdi:source-repository");
			blocksFolder.children.push(groupNode);
			var namespaceFolders = {};
			group.blocks.forEach(function (block) {
				var namespace = String(block.namespace || "");
				var namespaceKey = namespace || "_root";
				var parentNode = groupNode;
				var parentPath = groupPath;
				if (namespace) {
					if (!namespaceFolders[namespaceKey]) {
						var namespacePath = groupPath + "." + safeVirtualName("namespace", namespaceKey);
						namespaceFolders[namespaceKey] = virtualNode("namespace_" + namespaceKey, "folder", "namespace",
							namespacePath, namespace, compact({ namespace: namespace, count: 0 }), null, "mdi:folder-pound-outline");
						groupNode.children.push(namespaceFolders[namespaceKey]);
					}
					parentNode = namespaceFolders[namespaceKey];
					parentPath = parentNode.path;
					var nsDefinition = JSON.parse(parentNode.definition || "{}");
					nsDefinition.count = Number(nsDefinition.count || 0) + 1;
					parentNode.definition = compact(nsDefinition);
				}
				var blockId = block.blockId || block.name;
				var blockPath = parentPath + "." + safeVirtualName("block", blockId);
				var blockSource = sourceDefinitionForFile(block.file, block.implementation || "");
				var loadedBlock = blocks[blockId] || {};
				var blockDefinition = normalizeTree(loadedBlock.__blockDefinition || block);
				blockDefinition.blockId = blockId;
				blockDefinition.name = block.name || block.localName || blockId;
				blockDefinition.localName = block.localName || block.name || blockId;
				blockDefinition.namespace = block.namespace || "";
				blockDefinition.provider = block.provider || "";
				blockDefinition.file = block.file || blockDefinition.file || "";
				var blockInfo = sourceObjectInfo(blockSource, blockPropertyDefinitions(),
					["name", "provider", "namespace", "blockId", "description", "longDescription", "icon", "tags", "uses", "private", "slots", "implementation", "hooks"]);
				var blockNode = virtualNode("block_" + blockId, "block", blockId,
					blockPath, block.name || blockId, compact(blockDefinition), compact(blockInfo),
					block.icon || block.iconify || "mdi:puzzle-outline");
				parentNode.children.push(blockNode);
				addBlockProperties(blockNode, blockDefinition, blockPath);
				addBlockImplementation(blockNode, blocks[blockId], block, blockPath, blocks);
				addBlockHooks(blockNode, blocks[blockId], blockPath);
				addBlockUses(blockNode, blockDefinition, blockPath);
			});
		});
		addCatalogLibraries(catalog);
		var typesFolder = virtualNode("types", "folder", "types", "catalog.types", "Types", compact({}), null, "mdi:shape-outline");
		catalog.children.push(typesFolder);
		catalogDefinitionValue.types.forEach(function (type) {
			var typePath = "catalog.types." + type.name;
			var summary = (type.label || type.name) + (type.uses && type.uses.length ? " (" + type.uses.length + " uses)" : "");
			var typeSource = sourceDefinitionForFile(type.file, "type");
			var typeInfo = sourceObjectInfo(typeSource, typePropertyDefinitions(),
				["name", "sourceRelativePath", "sourceOrigin", "sourceWritable", "label", "description", "icon", "type", "uses"]);
			var typeNode = virtualNode("type_" + type.name, "type", type.name,
				typePath, summary, compact(type), compact(typeInfo), type.icon || "mdi:form-textbox");
			typesFolder.children.push(typeNode);
			["documentation", "editor", "validator", "reader", "writer"].forEach(function (resourceName) {
				var resource = type[resourceName];
				if (!resource || typeof resource !== "object") {
					return;
				}
				if (resource.file && type.file && resource.file === type.file) {
					return;
				}
				var resourceInfo = sourceObjectInfo(sourceDefinitionForFile(resource.file || "", resourceName),
					typeResourcePropertyDefinitions(),
					["type", "role", "sourceRelativePath", "sourceOrigin", "sourceWritable", "label", "kind", "component", "function"]);
				typeNode.children.push(virtualNode(resourceName, "typeResource", resourceName,
					typePath + "." + resourceName,
					(resource.label || resourceName) + (resource.component ? " [" + resource.component + "]" : ""),
					compact(Object.assign({ type: type.name, role: resourceName }, resource)),
					compact(resourceInfo), resource.icon || "mdi:file-code-outline"));
			});
			if (!type.uses || type.uses.length === 0) {
				return;
			}
			var usesFolder = virtualNode("uses", "folder", "uses", typePath + ".uses",
				"Usages (" + type.uses.length + ")", "", null, "mdi:source-branch");
			typeNode.children.push(usesFolder);
			type.uses.forEach(function (use, index) {
				usesFolder.children.push(virtualNode("type_use_" + use.block + "_" + use.property, "typeUse", type.name,
					typePath + ".uses[" + index + "]",
					use.block + "." + use.property, compact(use), null, "mdi:source-branch"));
			});
		});
		out.push(catalog);
	}

	function addFragments(out, blocks) {
		var fragments = listProjectFragments().fragments;
		if (fragments.length === 0) {
			return;
		}
		var folder = virtualNode("fragments", "folder", "fragments", "fragments",
			"Fragments", compact(fragments), null, "mdi:folder-sync-outline");
		fragments.forEach(function (fragment) {
			var fragmentPath = "fragments." + fragment.name;
			var fragmentNode = virtualNode("fragment_" + fragment.name, "fragment", fragment.name,
				fragmentPath, fragment.name, compact(fragment), null, "mdi:folder-sync-outline");
			folder.children.push(fragmentNode);
			try {
				var loaded = readFragment(fragment.name);
				var implementationNode = virtualNode("implementation", "fragmentImplementation", "flow",
					fragmentPath + ".implementation", "Implementation",
					compact(sourceDefinitionForFile(loaded.file, "flow")), null, "mdi:source-branch");
				fragmentNode.children.push(implementationNode);
				addImplementationNodes(implementationNode, loaded.definition.nodes || [],
					fragmentPath + ".implementation.nodes", blocks, ["fragment:" + fragment.name]);
			} catch (e) {
				fragmentNode.children.push(virtualNode("error", "error", "fragment",
					fragmentPath + ".error", String(e.message || e), compact({ error: String(e.message || e) }), null, "mdi:alert-outline"));
			}
		});
		out.push(folder);
	}

	function compactTreeNode(node, depth, maxDepth, includeDefinition) {
		var out = {
			name: node.name,
			kind: node.kind,
			type: node.type,
			path: node.path,
			summary: node.summary
		};
		if (node.definition) {
			try {
				var definition = JSON.parse(node.definition);
				if (definition && typeof definition === "object" && Object.prototype.toString.call(definition) !== "[object Array]") {
					if (definition.id !== undefined) {
						out.nodeId = definition.id;
					}
					if (definition.block !== undefined) {
						out.block = definition.block;
					}
				}
			} catch (e) {
			}
			if (includeDefinition === true) {
				out.definition = node.definition;
			}
		}
		var children = node.children || [];
		out.childCount = children.length;
		if (children.length && depth < maxDepth) {
			out.children = children.map(function (child) {
				return compactTreeNode(child, depth + 1, maxDepth, includeDefinition);
			});
		}
		return out;
	}

	function compactTreeResponse(tree, request) {
		request = request || {};
		var detail = String(request.detail || request.mode || "full");
		if (detail === "full") {
			return tree;
		}
		var maxDepth = intOption(request.maxDepth, detail === "summary" ? 2 : 4, 0, 20);
		var includeDefinition = request.includeDefinition === true || String(request.includeDefinition || "") === "true";
		var out = {
			ok: tree.ok,
			target: tree.target,
			detail: detail,
			childCount: (tree.children || []).length,
			children: (tree.children || []).map(function (child) {
				return compactTreeNode(child, 0, maxDepth, includeDefinition);
			})
		};
		if (tree.source && request.includeSource === true) {
			out.source = tree.source;
		}
		if (tree.analysis && request.includeAnalysis === true) {
			out.analysis = tree.analysis;
		}
		return out;
	}

	function describeTreeRequest(request, blocks) {
		request = request || {};
		var target = String(request.target || "flow");
		var children = [];
				if (target === "flow") {
					var definition = request.definition !== undefined && request.definition !== null
						? canonicalFlowDefinition(normalizeTree(request.definition))
						: parseSource(sourceForFlowRequest(request, blocks));
					definition = expandFlowDefinition(blocks, definition);
				var analysisRequest = Object.assign({}, request, {
					allowRequestableSchema: false
				});
			analysisRequest.flowSource = sourceFromDefinition(definition);
			var analysis = analyzeFlowDefinition(blocks, definition, analysisRequest);
			var analysisById = analysisByNodeId(analysis);
			addContracts(children, definition.contracts, "contracts");
			addBindings(children, definition.bindings, "bindings");
			addNodes(children, definition.nodes || [], "nodes", blocks, analysisById);
		} else if (target === "engine") {
			var engine = parseYamlSource(request.engineSource, "version: 1\n");
			var engineQName = String(engine.engineQName || request.engineQName || "");
				children.push(virtualNode("engine", "engine", engineQName, "engineQName", engineQName, engineQName, null, "mdi:engine-outline"));
				addBindings(children, engine.bindings, "bindings");
				addConfig(children, engine.config, "config");
				addFragments(children, blocks);
				addCatalog(children, blocks, {
					includePrivate: request.includePrivate !== false
				});
			} else {
			raise("UNKNOWN_TREE_TARGET", "Unknown Flow tree target: " + target);
		}
		return compactTreeResponse({
			ok: true,
			target: target,
			children: children
		}, request);
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

	function searchKinds(request) {
		var kinds = request.kinds;
		if (!kinds) {
			return { sample: true, flow: true, node: true, block: true, type: true, schema: true };
		}
		if (typeof kinds === "string") {
			kinds = String(kinds).split(",");
		}
		var out = {};
		(kinds || []).forEach(function (kind) {
			out[String(kind).trim()] = true;
		});
		return out;
	}

	function isSampleFlowName(flowName) {
		return String(flowName || "").indexOf("sample_") === 0;
	}

	function collectFlowBlockUses(definition, blocks) {
		var uses = [];
		function add(name) {
			name = String(name || "");
			if (name && uses.indexOf(name) === -1) {
				uses.push(name);
			}
		}
		function walk(nodes) {
			(nodes || []).forEach(function (node) {
				var name = blockName(node);
				add(name);
				activeSlots(node, blockCatalog(blocks && blocks[name])).forEach(function (slot) {
					walk(slot.nodes || []);
				});
			});
		}
		walk(definition && definition.nodes || []);
		uses.sort();
		return uses;
	}

	function searchNeedle(request) {
		return String(request.query || request.q || "").trim().toLowerCase();
	}

	function searchTokens(needle) {
		var tokens = [];
		String(needle || "").toLowerCase().split(/[^a-z0-9_]+/).forEach(function (part) {
			if (part) {
				tokens.push(part);
			}
		});
		return tokens;
	}

	function searchMatches(text, needle) {
		if (!needle) {
			return true;
		}
		var haystack = String(text || "").toLowerCase();
		if (haystack.indexOf(needle) !== -1) {
			return true;
		}
		var tokens = searchTokens(needle);
		if (!tokens.length) {
			return true;
		}
		return tokens.every(function (token) {
			return haystack.indexOf(token) !== -1;
		});
	}

	function searchSnippet(text, needle) {
		text = String(text || "").replace(/\s+/g, " ").trim();
		if (!text) {
			return "";
		}
		var max = 180;
		var lower = text.toLowerCase();
		var index = needle ? lower.indexOf(needle) : -1;
		var matchLength = String(needle || "").length;
		if (index < 0 && needle) {
			searchTokens(needle).some(function (token) {
				index = lower.indexOf(token);
				if (index >= 0) {
					matchLength = token.length;
					return true;
				}
				return false;
			});
		}
		if (index < 0) {
			return summaryText(text, max);
		}
		var start = Math.max(0, index - 60);
		var end = Math.min(text.length, index + matchLength + 80);
		return (start > 0 ? "..." : "") + text.substring(start, end) + (end < text.length ? "..." : "");
	}

	function pointerEscape(part) {
		return String(part).replace(/~/g, "~0").replace(/\//g, "~1");
	}

	function pointerPath(parts) {
		return "/" + (parts || []).map(pointerEscape).join("/");
	}

	function flowQNameForSearch(request, flowName) {
		var project = currentProjectName(request);
		return project ? project + "." + flowName : String(flowName || "");
	}

	function searchTokenScore(text, needle) {
		if (!needle) {
			return 1;
		}
		var haystack = String(text || "").toLowerCase();
		if (haystack.indexOf(needle) !== -1) {
			return 100;
		}
		var tokens = searchTokens(needle);
		var score = 0;
		tokens.forEach(function (token) {
			if (haystack.indexOf(token) !== -1) {
				score += 10;
			}
		});
		return score;
	}

		function shallowNodeDefinition(node) {
			var shallow = {};
			Object.keys(node || {}).forEach(function (key) {
				if (key.indexOf("__") !== 0 && ["nodes", "do", "then", "else", "catch", "finally"].indexOf(key) === -1) {
					shallow[key] = node[key];
				}
		});
		return shallow;
	}

	function searchNodeContext(nodes, index, node, parentSummary, blocks, contextCount) {
		if (contextCount <= 0) {
			return undefined;
		}
		var context = {
			parent: parentSummary || "",
			previous: [],
			children: [],
			next: []
		};
		for (var previous = Math.max(0, index - contextCount); previous < index; previous++) {
			context.previous.push(searchNodeSummary(nodes[previous], blocks));
		}
		var slots = activeSlots(node, blockCatalog(blocks[blockName(node)]));
		slots.forEach(function (slot) {
			(slot.nodes || []).slice(0, contextCount).forEach(function (child) {
				context.children.push(searchNodeSummary(child, blocks));
			});
		});
		for (var next = index + 1; next < Math.min(nodes.length, index + 1 + contextCount); next++) {
			context.next.push(searchNodeSummary(nodes[next], blocks));
		}
		return context;
	}

	function searchNodeSummary(node, blocks) {
		node = node || {};
		var name = blockName(node);
		var block = blocks && blocks[name];
		var catalog = blockCatalog(block);
		return nodeSummary(block, catalog, node, nodePath(node), name || "unknown");
	}

	function searchFlowNodes(request, blocks, flowName, definition, matches) {
		var needle = searchNeedle(request);
		var contextCount = intOption(request.context || request.around, 0, 0, 5);
		var includeDefinition = request.includeDefinition === true;
		var flowQName = flowQNameForSearch(request, flowName);

		function walk(nodes, parts, parentSummary) {
			nodes = nodes || [];
			for (var i = 0; i < nodes.length; i++) {
				var node = nodes[i] || {};
				var name = blockName(node);
				var block = blocks && blocks[name];
				var catalog = blockCatalog(block);
				var id = nodePath(node);
				var path = pointerPath(parts.concat([String(i)]));
				var summary = nodeSummary(block, catalog, node, id, name || "unknown");
				var shallow = shallowNodeDefinition(node);
				var text = [flowName, flowQName, id, name, summary, JSON.stringify(normalizeTree(shallow))].join(" ");
				if (searchMatches(text, needle)) {
					var match = {
						kind: "node",
						project: currentProjectName(request),
						flow: flowName,
						flowQName: flowQName,
						nodeId: id,
						path: path,
						block: name,
						summary: summary,
						snippet: searchSnippet(text, needle),
						next: "flow-context name=" + flowName + " node=" + id
					};
					var context = searchNodeContext(nodes, i, node, parentSummary, blocks, contextCount);
					if (context) {
						match.context = context;
					}
					if (includeDefinition) {
						match.definition = normalizeTree(node);
					}
					matches.push(match);
				}
				activeSlots(node, catalog).forEach(function (slot) {
					walk(slot.nodes || [], parts.concat([String(i), slot.name]), summary);
				});
			}
		}

		walk(definition.nodes || [], ["nodes"], "");
	}

	function searchCatalogEntries(request, blocks, matches) {
		var needle = searchNeedle(request);
		var kinds = searchKinds(request);
		var catalog = catalogDefinition(blocks);
		if (kinds.block) {
			(catalog.blocks || []).forEach(function (block) {
				var text = JSON.stringify(block);
				if (!searchMatches(text, needle)) {
					return;
				}
				matches.push({
					kind: "block",
					name: block.blockId || block.name,
					label: block.name,
					provider: block.provider,
					origin: block.origin,
					namespace: block.namespace,
					summary: "[" + (block.namespace ? block.namespace + "." : "") + block.name + "] " + summaryText(block.description || ""),
					snippet: searchSnippet(text, needle),
					next: "flow-block-get name=" + (block.blockId || block.name)
				});
			});
		}
		if (kinds.type) {
			(catalog.types || []).forEach(function (type) {
				var text = JSON.stringify(type);
				if (!searchMatches(text, needle)) {
					return;
				}
				matches.push({
					kind: "type",
					name: type.name,
					origin: type.origin,
					summary: "[" + type.name + "] " + summaryText(type.description || ""),
					snippet: searchSnippet(text, needle),
					next: "flow-type-get name=" + type.name
				});
			});
		}
	}

	function searchSchemaFiles(request, matches) {
		var kinds = searchKinds(request);
		if (!kinds.schema) {
			return;
		}
		var dir = projectSchemasDir();
		if (!dir || !dir.isDirectory()) {
			return;
		}
		var needle = searchNeedle(request);
		function walk(file) {
			var files = file.listFiles();
			if (!files) {
				return;
			}
			Arrays.asList(files).toArray().forEach(function (child) {
				if (child.isDirectory()) {
					walk(child);
					return;
				}
				if (!String(child.getName()).endsWith(".schema.json")) {
					return;
				}
				var text = String(FileUtils.readFileToString(child, "UTF-8"));
				if (!searchMatches(text, needle)) {
					return;
				}
				matches.push({
					kind: "schema",
					file: String(child.getAbsolutePath()),
					summary: "[schema] " + String(child.getName()),
					snippet: searchSnippet(text, needle)
				});
			});
		}
		walk(dir);
	}

	function searchFlowRequest(request, blocks) {
		request = request || {};
		var needle = searchNeedle(request);
		var kinds = searchKinds(request);
		var matches = [];
		var includeSampleMatches = kinds.sample || request.includeLibrarySamples === true;
		var flows = request.name ? [{ name: String(request.name), source: sourceForFlowRequest(request) }] :
			visibleSearchFlows(request);
		flows.forEach(function (flow) {
			var flowProject = flow.project || currentProjectName(request);
			var flowQName = flowQNameForSearch(request, flow.name);
			if (flowProject && flowProject !== currentProjectName(request)) {
				flowQName = flowQNameForSearch(Object.assign({}, request, { project: flowProject }), flow.name);
			}
			var definition = expandFlowDefinition(blocks, parseSource(flow.source));
			var sample = isSampleFlowName(flow.name);
			var uses = sample ? collectFlowBlockUses(definition, blocks) : [];
			var flowText = [flow.name, flowQName, flow.source, uses.join(" "), sample ? "sample example tutorial usage pattern" : ""].join(" ");
			if (sample && includeSampleMatches) {
				var sampleScore = searchTokenScore(flowText, needle);
				if (sampleScore <= 0) {
					return;
				}
				matches.push({
					kind: "sample",
					score: 90 + sampleScore,
					project: flowProject || currentProjectName(request),
					flow: flow.name,
					flowQName: flowQName,
					file: flow.file || "",
					uses: uses,
					summary: "[sample] " + flowQName + (uses.length ? " uses " + uses.join(", ") : ""),
					snippet: searchSnippet(flow.source, needle),
					next: "flow-tree project=" + (flowProject || currentProjectName(request)) + " name=" + flow.name +
						", flow-test project=" + (flowProject || currentProjectName(request)) + " name=" + flow.name +
						", then copy the pattern into a new Flow"
				});
			}
			if (kinds.flow && !sample && searchMatches(flowText, needle)) {
				matches.push({
					kind: "flow",
					score: 50,
					project: flowProject || currentProjectName(request),
					flow: flow.name,
					flowQName: flowQName,
					file: flow.file || "",
					summary: "[flow] " + flowQName,
					snippet: searchSnippet(flow.source, needle),
					next: "flow-tree name=" + flow.name
				});
			}
			if (kinds.node) {
				searchFlowNodes(request, blocks, flow.name, definition, matches);
			}
		});
		searchCatalogEntries(request, blocks, matches);
		searchSchemaFiles(request, matches);
		matches.sort(function (a, b) {
			var scoreDiff = Number(b.score || 0) - Number(a.score || 0);
			if (scoreDiff !== 0) {
				return scoreDiff;
			}
			return String(a.summary || a.name || "").localeCompare(String(b.summary || b.name || ""));
		});

		var offset = intOption(request.cursor, 0, 0);
		var limit = intOption(request.limit, 50, 1, 500);
		var page = matches.slice(offset, offset + limit);
		var out = {
			ok: true,
			query: String(request.query || request.q || ""),
			scope: String(request.scope || "project"),
			project: currentProjectName(request),
			count: page.length,
			total: matches.length,
			matches: page,
			nextCursor: offset + limit < matches.length ? String(offset + limit) : null
		};
		if (request.doc !== false) {
			out.doc = "Search Flow sidecars, nodes, catalog entries and learned schemas. Use flow-tree on a match for detailed inspection, then flow-edit with nodeId/path for mutations.";
		}
		if (request.hints !== false) {
			out.hints = [
				"If you understood, call with hints=false.",
				"Use kinds=['node'] to search executable Flow nodes only.",
				"Use context=1 or 2 to get nearby parent/previous/children/next summaries.",
				"Pass doc=false on repeated calls when the short tool contract is already known."
			];
		}
		return out;
	}

	function toYamlSource(value) {
		var json = JSON.stringify(normalizeTree(value || {}));
		var root = jsonMapper.readTree(json);
		return String(yamlMapper.writeValueAsString(root)).replace(/^---\s*\r?\n/, "");
	}

	function parseMutationPath(path) {
		if (Object.prototype.toString.call(path) === "[object Array]") {
			return path.map(function (part) { return String(part); });
		}
		var text = String(path === undefined || path === null ? "" : path);
		if (text === "") {
			return [];
		}
		if (text.charAt(0) === "/") {
			if (text === "/") {
				return [""];
			}
			return text.substring(1).split("/").map(function (part) {
				return part.replace(/~1/g, "/").replace(/~0/g, "~");
			});
		}
		var parts = [];
		text.replace(/([^\.\[\]]+)|\[(\d+)\]/g, function (_, name, index) {
			parts.push(name !== undefined ? name : String(index));
			return "";
		});
		return parts;
	}

	function asArrayIndex(container, key, allowEnd) {
		if (allowEnd && key === "-") {
			return container.length;
		}
		var index = Number(key);
		if (String(index) !== String(key) || index < 0 || Math.floor(index) !== index) {
			raise("INVALID_MUTATION_PATH", "Expected array index, got: " + key);
		}
		return index;
	}

	function containerAt(root, parts, create) {
		var current = root;
		for (var i = 0; i < parts.length - 1; i++) {
			var key = parts[i];
			if (Object.prototype.toString.call(current) === "[object Array]") {
				current = current[asArrayIndex(current, key, false)];
			} else {
				if ((current[key] === undefined || current[key] === null) && create) {
					var next = parts[i + 1];
					current[key] = String(Number(next)) === String(next) ? [] : {};
				}
				current = current[key];
			}
			if (current === undefined || current === null) {
				raise("INVALID_MUTATION_PATH", "Mutation path does not exist: " + parts.join("/"));
			}
		}
		return current;
	}

	function valueAt(root, parts) {
		var current = root;
		for (var i = 0; i < parts.length; i++) {
			if (current === undefined || current === null) {
				return undefined;
			}
			if (Object.prototype.toString.call(current) === "[object Array]") {
				current = current[asArrayIndex(current, parts[i], false)];
			} else {
				current = current[parts[i]];
			}
		}
		return current;
	}

	function cloneMutationValue(value) {
		return normalizeTree(value);
	}

	function childSlotNamesForMutation(blocks, node) {
		var names = {};
		var block = blocks && blocks[blockName(node)];
		slotDefinitions(blockCatalog(block)).forEach(function (definition) {
			names[String(definition.name)] = true;
			(definition.aliases || []).forEach(function (alias) {
				names[String(alias)] = true;
			});
		});
		return Object.keys(names);
	}

	function collectNodeLocations(root, blocks, wantedId) {
		var matches = [];
		var wanted = String(wantedId || "");
		function walk(nodes, arrayParts) {
			if (Object.prototype.toString.call(nodes) !== "[object Array]") {
				return;
			}
			for (var i = 0; i < nodes.length; i++) {
				var node = nodes[i] || {};
				var nodeParts = arrayParts.concat([String(i)]);
				if (nodePath(node) === wanted) {
					matches.push({
						node: node,
						parts: nodeParts,
						arrayParts: arrayParts,
						index: i
					});
				}
				childSlotNamesForMutation(blocks, node).forEach(function (slot) {
					if (Object.prototype.toString.call(node[slot]) === "[object Array]") {
						walk(node[slot], nodeParts.concat([slot]));
					}
				});
			}
		}
		walk(root.nodes || [], ["nodes"]);
		return matches;
	}

	function locateSingleNode(root, blocks, nodeId, role) {
		var id = String(nodeId || "");
		if (!id) {
			raise("MISSING_NODE_ID", "Mutation requires " + role + ".");
		}
		var matches = collectNodeLocations(root, blocks, id);
		if (matches.length === 0) {
			raise("UNKNOWN_NODE_ID", "No Flow node found for " + role + ": " + id);
		}
		if (matches.length > 1) {
			raise("AMBIGUOUS_NODE_ID", "More than one Flow node matches " + role + ": " + id);
		}
		return matches[0];
	}

	function mutationNodeId(mutation) {
		return mutation.nodeId || mutation.node || "";
	}

	function mutationPropertyName(mutation) {
		return mutation.property || mutation.prop || mutation.field || "";
	}

	function resolveMutationValueParts(root, mutation, blocks) {
		if (mutation.path !== undefined && mutation.path !== null) {
			return parseMutationPath(mutation.path);
		}
		var nodeId = mutationNodeId(mutation);
		if (nodeId) {
			var location = locateSingleNode(root, blocks, nodeId, "nodeId");
			var property = mutationPropertyName(mutation);
			return property ? location.parts.concat([String(property)]) : location.parts;
		}
		return [];
	}

	function resolveMutationArrayParts(root, mutation, blocks) {
		if (mutation.beforeNodeId || mutation.before) {
			var before = locateSingleNode(root, blocks, mutation.beforeNodeId || mutation.before, "beforeNodeId");
			if (mutation.index === undefined || mutation.index === null) {
				mutation.index = String(before.index);
			}
			return before.arrayParts;
		}
		if (mutation.afterNodeId || mutation.after) {
			var after = locateSingleNode(root, blocks, mutation.afterNodeId || mutation.after, "afterNodeId");
			if (mutation.index === undefined || mutation.index === null) {
				mutation.index = String(after.index + 1);
			}
			return after.arrayParts;
		}
		if (mutation.parentNodeId || mutation.parentNode) {
			var parent = locateSingleNode(root, blocks, mutation.parentNodeId || mutation.parentNode, "parentNodeId");
			var slot = String(mutation.slot || "nodes");
			if (parent.node[slot] === undefined || parent.node[slot] === null) {
				parent.node[slot] = [];
			}
			if (Object.prototype.toString.call(parent.node[slot]) !== "[object Array]") {
				raise("INVALID_MUTATION_TARGET", "Node slot is not an array: " + slot);
			}
			return parent.parts.concat([slot]);
		}
		if (mutation.path !== undefined && mutation.path !== null) {
			return parseMutationPath(mutation.path);
		}
		return ["nodes"];
	}

	function mergeObjects(target, patch) {
		if (!patch || typeof patch !== "object" || Object.prototype.toString.call(patch) === "[object Array]") {
			return cloneMutationValue(patch);
		}
		if (!target || typeof target !== "object" || Object.prototype.toString.call(target) === "[object Array]") {
			target = {};
		}
		Object.keys(patch).forEach(function (key) {
			var value = patch[key];
			if (value && typeof value === "object" && Object.prototype.toString.call(value) !== "[object Array]") {
				target[key] = mergeObjects(target[key], value);
			} else {
				target[key] = cloneMutationValue(value);
			}
		});
		return target;
	}

	function applyOneMutation(root, mutation, blocks) {
		mutation = mutation || {};
		var op = String(mutation.op || "replace");
		if (op === "set") {
			op = "replace";
		}
		if (op === "remove") {
			op = "delete";
		}
		if (op === "batch") {
			(mutation.mutations || []).forEach(function (child) {
				applyOneMutation(root, child, blocks);
			});
			return;
		}

		var parts = (op === "insert" || op === "append" || op === "move" || op === "copy")
			? resolveMutationArrayParts(root, mutation, blocks)
			: resolveMutationValueParts(root, mutation, blocks);
		if (op === "move" || op === "copy") {
			var fromPath = mutation.from || mutation.source;
			if (!fromPath && (mutation.fromNodeId || mutation.sourceNodeId || mutationNodeId(mutation))) {
				fromPath = pointerPath(locateSingleNode(root, blocks,
					mutation.fromNodeId || mutation.sourceNodeId || mutationNodeId(mutation), "fromNodeId").parts);
			}
			if (!fromPath) {
				raise("INVALID_MUTATION_PATH", "Move/copy mutation requires a source path.");
			}
			var moved = cloneMutationValue(valueAt(root, parseMutationPath(fromPath)));
			if (op === "copy") {
				var patch = mutation.patch || mutation.properties || mutation.props;
				if (patch !== undefined && patch !== null) {
					moved = mergeObjects(moved, patch);
				}
				if (mutation.newId || mutation.newNodeId) {
					moved.id = String(mutation.newId || mutation.newNodeId);
				}
			}
			if (op === "move") {
				applyOneMutation(root, { op: "delete", path: fromPath }, blocks);
			}
			var moveArray = valueAt(root, parts);
			if (Object.prototype.toString.call(moveArray) !== "[object Array]") {
				raise("INVALID_MUTATION_TARGET", "Move target is not an array: " + pointerPath(parts));
			}
			var moveIndex = mutation.index === undefined || mutation.index === null || mutation.index === "end"
				? moveArray.length : asArrayIndex(moveArray, String(mutation.index), true);
			moveArray.splice(moveIndex, 0, moved);
			return;
		}
		if (op === "append") {
			var array = valueAt(root, parts);
			if (Object.prototype.toString.call(array) !== "[object Array]") {
				raise("INVALID_MUTATION_TARGET", "Append target is not an array: " + pointerPath(parts));
			}
			array.push(cloneMutationValue(mutation.value));
			return;
		}
		if (op === "insert") {
			var targetArray = valueAt(root, parts);
			if (Object.prototype.toString.call(targetArray) !== "[object Array]") {
				raise("INVALID_MUTATION_TARGET", "Insert target is not an array: " + pointerPath(parts));
			}
			var index = mutation.index === undefined || mutation.index === null || mutation.index === "end"
				? targetArray.length : asArrayIndex(targetArray, String(mutation.index), true);
			targetArray.splice(index, 0, cloneMutationValue(mutation.value));
			return;
		}
		if (parts.length === 0) {
			if (op !== "replace" && op !== "merge") {
				raise("INVALID_MUTATION_PATH", "Only replace or merge can target the root.");
			}
			var replacement = op === "merge" ? mergeObjects(root, mutation.value) : cloneMutationValue(mutation.value);
			Object.keys(root).forEach(function (key) {
				delete root[key];
			});
			Object.keys(replacement || {}).forEach(function (key) {
				root[key] = replacement[key];
			});
			return;
		}

		var parent = containerAt(root, parts, op === "replace" || op === "merge");
		var key = parts[parts.length - 1];
		if (Object.prototype.toString.call(parent) === "[object Array]") {
			var arrayIndex = asArrayIndex(parent, key, false);
			if (op === "delete") {
				parent.splice(arrayIndex, 1);
			} else if (op === "merge") {
				parent[arrayIndex] = mergeObjects(parent[arrayIndex], mutation.value);
			} else if (op === "replace") {
				parent[arrayIndex] = cloneMutationValue(mutation.value);
			} else {
				raise("UNKNOWN_MUTATION_OP", "Unknown Flow mutation operation: " + op);
			}
			return;
		}
		if (op === "delete") {
			delete parent[key];
		} else if (op === "merge") {
			parent[key] = mergeObjects(parent[key], mutation.value);
		} else if (op === "replace") {
			parent[key] = cloneMutationValue(mutation.value);
		} else {
			raise("UNKNOWN_MUTATION_OP", "Unknown Flow mutation operation: " + op);
		}
	}

	function applyMutationRequest(request, blocks) {
		request = request || {};
		var target = String(request.target || "flow");
		var definition = target === "engine"
			? parseYamlSource(request.engineSource, "version: 1\n")
			: request.definition !== undefined && request.definition !== null
				? canonicalFlowDefinition(normalizeTree(request.definition))
				: parseSource(sourceForFlowRequest(request, blocks));
		var mutations = request.mutations || (request.mutation ? [request.mutation] : []);
		if (mutations.length === 0) {
			raise("MISSING_MUTATION", "Flow mutation request requires mutation or mutations.");
		}
		mutations.forEach(function (mutation) {
			applyOneMutation(definition, mutation, blocks);
		});
		if (definition.version === undefined || definition.version === null) {
			definition.version = 1;
		}
		var source = toYamlSource(definition);
		var tree = describeTreeRequest({
			target: target,
			flowSource: source,
			engineSource: source,
			engineQName: request.engineQName || definition.engineQName || ""
		}, blocks);
		var out = {
			ok: true,
			target: target,
			source: source,
			children: tree.children
		};
		if (target === "flow") {
			out.analysis = analyzeFlowSource(blocks, source);
		}
		return out;
	}

	function outputSchemaRequest(request, blocks) {
		request = request || {};
		var definition = request.definition !== undefined && request.definition !== null
			? canonicalFlowDefinition(normalizeTree(request.definition))
			: parseSource(sourceForFlowRequest(request, blocks));
		var declaredSchema = declaredOutputSchema(definition);
		var staticSchema = declaredSchema ? null : resultSchemaFromAnalysis(analyzeFlowDefinition(blocks, definition, request));
		var learnedSchema = readResultSchema(request, definition);
		var schema = declaredSchema || (schemaScore(learnedSchema) > schemaScore(staticSchema) ? learnedSchema : staticSchema) || learnedSchema || {};
		return {
			ok: true,
			schema: objectSchema(schema)
		};
	}

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

	return {
		run: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(runFlowRequest(request, loadBlocks()));
			} catch (e) {
				return response(failure("run", e));
			}
		},

		analyze: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(analyzeFlowSource(loadBlocks(), request.flowSource, request));
			} catch (e) {
				return response(failure("analyze", e));
			}
		},

		context: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(contextForFlowRequest(loadBlocks(), request));
			} catch (e) {
				return response(failure("context", e));
			}
		},

		search: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(searchFlowRequest(request, loadBlocks()));
			} catch (e) {
				return response(failure("search", e));
			}
		},

		schemaReset: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(resetSchemaRequest(request));
			} catch (e) {
				return response(failure("schemaReset", e));
			}
		},

		resourceSearch: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(resourceSearchRequest(request));
			} catch (e) {
				return response(failure("resourceSearch", e));
			}
		},

		resourceList: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(resourceListRequest(request));
			} catch (e) {
				return response(failure("resourceList", e));
			}
		},

		resourceGet: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(resourceGetRequest(request));
			} catch (e) {
				return response(failure("resourceGet", e));
			}
		},

		resourcePatch: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(resourcePatchRequest(request));
			} catch (e) {
				return response(failure("resourcePatch", e));
			}
		},

		outputSchema: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(outputSchemaRequest(request, loadBlocks()));
			} catch (e) {
				return response(failure("outputSchema", e));
			}
		},

		writeCodeMirror: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(withProjectDir(request.projectDir, function () {
					return writeFlowCodeMirrorRequest(request, loadBlocks());
				}));
			} catch (e) {
				return response(failure("writeCodeMirror", e));
			}
		},

		propertyEditor: function () {
			try {
				return response({ ok: true, html: propertyEditorHtml() });
			} catch (e) {
				return response(failure("propertyEditor", e));
			}
		},

		icons: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(iconCatalogRequest(request));
			} catch (e) {
				return response(failure("icons", e));
			}
		},

		cacheInfo: function () {
			try {
				return response(cacheInfoRequest());
			} catch (e) {
				return response(failure("cacheInfo", e));
			}
		},

		cacheClear: function () {
			try {
				return response(clearRuntimeCaches());
			} catch (e) {
				return response(failure("cacheClear", e));
			}
		},

		catalog: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(Object.assign({ ok: true }, catalogDefinition(loadBlocks(), {
					detail: request.detail || request.mode || "full",
					includePrivate: request.includePrivate === true,
					query: request.query || request.q || "",
					namespace: request.namespace || "",
					provider: request.provider || "",
					origin: request.origin || "",
					limit: request.limit,
					cursor: request.cursor
				})));
			} catch (e) {
				return response(failure("catalog", e));
			}
		},

		describeTree: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(describeTreeRequest(request, loadBlocks()));
			} catch (e) {
				return response(failure("describeTree", e));
			}
		},

		applyMutation: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(applyMutationRequest(request, loadBlocks()));
			} catch (e) {
				return response(failure("applyMutation", e));
			}
		},

		flowSourceGet: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(withProjectDir(request.projectDir, function () {
					return flowScriptGetRequest(loadBlocks(), request);
				}));
			} catch (e) {
				return response(failure("flowSourceGet", e));
			}
		},

		flowSourceValidate: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(withProjectDir(request.projectDir, function () {
					return flowScriptValidateRequest(loadBlocks(), request);
				}));
			} catch (e) {
				return response(failure("flowSourceValidate", e));
			}
		},

		flowSourcePatch: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(withProjectDir(request.projectDir, function () {
					return flowScriptPatchRequest(loadBlocks(), request);
				}));
			} catch (e) {
				return response(failure("flowSourcePatch", e));
			}
		},

		flowCodeGet: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(withProjectDir(request.projectDir, function () {
					return flowCodeGetRequest(loadBlocks(), request);
				}));
			} catch (e) {
				return response(failure("flowCodeGet", e));
			}
		},

		flowCodeStatus: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(withProjectDir(request.projectDir, function () {
					return flowCodeStatusRequest(loadBlocks(), request);
				}));
			} catch (e) {
				return response(failure("flowCodeStatus", e));
			}
		},

		flowCodeDiscard: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(withProjectDir(request.projectDir, function () {
					return flowCodeDiscardRequest(loadBlocks(), request);
				}));
			} catch (e) {
				return response(failure("flowCodeDiscard", e));
			}
		},

		flowCodeSet: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(withProjectDir(request.projectDir, function () {
					return flowCodeSetRequest(loadBlocks(), request);
				}));
			} catch (e) {
				return response(failure("flowCodeSet", e));
			}
		},

		flowCodePatch: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(withProjectDir(request.projectDir, function () {
					return flowCodePatchRequest(loadBlocks(), request);
				}));
			} catch (e) {
				return response(failure("flowCodePatch", e));
			}
		},

		flowCodeCheck: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(withProjectDir(request.projectDir, function () {
					return flowCodeCheckRequest(loadBlocks(), request);
				}));
			} catch (e) {
				return response(failure("flowCodeCheck", e));
			}
		},

		flowCodeRg: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(withProjectDir(request.projectDir, function () {
					return flowCodeRgRequest(loadBlocks(), request);
				}));
			} catch (e) {
				return response(failure("flowCodeRg", e));
			}
		},

		blockCodeGet: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(withProjectDir(request.projectDir, function () {
					return blockCodeGetRequest(loadBlocks(), request);
				}));
			} catch (e) {
				return response(failure("blockCodeGet", e));
			}
		},

		blockCodeSet: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(withProjectDir(request.projectDir, function () {
					return setProjectBlockCode(loadBlocks(), request.name || request.block, request);
				}));
			} catch (e) {
				return response(failure("blockCodeSet", e));
			}
		},

		blockCodePatch: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(withProjectDir(request.projectDir, function () {
					return blockCodePatchRequest(loadBlocks(), request);
				}));
			} catch (e) {
				return response(failure("blockCodePatch", e));
			}
		},

		blockCodeRg: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(withProjectDir(request.projectDir, function () {
					return blockCodeRgRequest(loadBlocks(), request);
				}));
			} catch (e) {
				return response(failure("blockCodeRg", e));
			}
		},

		flowCodeRun: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(withProjectDir(request.projectDir, function () {
					return flowCodeRunRequest(loadBlocks(), request);
				}));
			} catch (e) {
				return response(failure("flowCodeRun", e));
			}
		},

		flowCodeAnalyze: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(withProjectDir(request.projectDir, function () {
					return flowCodeAnalyzeRequest(loadBlocks(), request);
				}));
			} catch (e) {
				return response(failure("flowCodeAnalyze", e));
			}
		},

		flowCodePromote: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(withProjectDir(request.projectDir, function () {
					return flowCodePromoteRequest(loadBlocks(), request);
				}));
			} catch (e) {
				return response(failure("flowCodePromote", e));
			}
		},

		requestableList: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(withProjectDir(request.projectDir, function () {
					return requestableListRequest(request);
				}));
			} catch (e) {
				return response(failure("requestableList", e));
			}
		},

		requestableSchema: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(withProjectDir(request.projectDir, function () {
					return requestableSchemaRequest(request);
				}));
			} catch (e) {
				return response(failure("requestableSchema", e));
			}
		},

		types: function (requestJson) {
			try {
				return response(Object.assign({ ok: true }, typeList(loadBlocks())));
			} catch (e) {
				return response(failure("types", e));
			}
		},

		typeGet: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(getTypeSource(loadTypes(), request.name));
			} catch (e) {
				return response(failure("typeGet", e));
			}
		},

		typeCreate: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(createProjectType(loadTypes(), request.name, request, request.overwrite === true));
			} catch (e) {
				return response(failure("typeCreate", e));
			}
		},

		blockGet: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(getBlockSource(loadBlocks(), request.name, request));
			} catch (e) {
				return response(failure("blockGet", e));
			}
		},

		blockCreate: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(createProjectBlock(loadBlocks(), request.name, request, request.overwrite === true));
			} catch (e) {
				return response(failure("blockCreate", e));
			}
		},

		blockDuplicate: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(duplicateProjectBlock(loadBlocks(), request.fromName || request.from, request.toName || request.name, request.overwrite === true));
			} catch (e) {
				return response(failure("blockDuplicate", e));
			}
		},

		blockEdit: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(editProjectBlock(loadBlocks(), request.name, request));
			} catch (e) {
				return response(failure("blockEdit", e));
			}
		}
	};
}())
