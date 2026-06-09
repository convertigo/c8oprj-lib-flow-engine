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
		iconServiceModule = null;
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
			validateResourceContent: validateResourceContent
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
		return resourceService().patch(request, resourceServiceEnv());
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
			projectTypesDir: projectTypesDir,
			typeDescriptorFileName: typeDescriptorFileName,
			normalizeTree: normalizeTree,
			parseYamlSource: parseYamlSource,
			toYamlSource: toYamlSource,
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
			projectFlowDraftsDir: projectFlowDraftsDir,
			projectFragmentsDir: projectFragmentsDir,
			flowFileName: flowFileName,
			flowCodeFileName: flowCodeFileName,
			fragmentFileName: fragmentFileName,
			parseYamlSource: parseYamlSource,
			raise: raise
		};
	}

	function projectFlowFile(name) {
		return flowStorageService().projectFlowFile(name, flowStorageEnv());
	}

	function projectFlowCodeFile(name) {
		return flowStorageService().projectFlowCodeFile(name, flowStorageEnv());
	}

	function projectFlowDraftCodeFile(name) {
		return flowStorageService().projectFlowDraftCodeFile(name, flowStorageEnv());
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
		return flowStorageService().listProjectFragments(flowStorageEnv());
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
			flowScriptValidateRequest: flowScriptValidateRequest
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

	function safeIdentifier(value) {
		var text = String(value || "Flow").replace(/[^A-Za-z0-9_$]/g, "_");
		if (!text.match(/^[A-Za-z_$]/)) {
			text = "_" + text;
		}
		return text || "Flow";
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
			projectFlowDraftCodeFile: projectFlowDraftCodeFile,
			flowScriptGetRequest: flowScriptGetRequest,
			normalizeFlowScriptCode: normalizeFlowScriptCode,
			stripFlowScriptMirrorHeader: stripFlowScriptMirrorHeader,
			setProjectFlow: setProjectFlow,
			applyUnifiedPatchText: applyUnifiedPatchText,
			getBlockSource: getBlockSource,
			setProjectBlockCode: setProjectBlockCode,
			flowScriptBlockMetaFromRequest: flowScriptBlockMetaFromRequest,
			flowScriptBlockCodeSource: flowScriptBlockCodeSource,
			listProjectFlows: listProjectFlows,
			runFlowRequest: runFlowRequest,
			analyzeFlowSource: analyzeFlowSource
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
			writeProjectFlowCodeCanonical: writeProjectFlowCodeCanonical
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
			requestableFlowScriptHints: requestableFlowScriptHints,
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
			parseSource: parseSource,
			sourceForFlowRequest: sourceForFlowRequest,
			sourceForWriteRequest: sourceForWriteRequest,
			loadProjectEngineDefinition: loadProjectEngineDefinition,
			assertNoRuntimeHandle: assertNoRuntimeHandle,
			learnResultSchema: learnResultSchema,
			schemaSummary: schemaSummary,
			closeRuntimeHandles: closeRuntimeHandles,
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
			isRuntimeHandle: isRuntimeHandle,
			runtimeHandleSummary: runtimeHandleSummary,
			createRuntimeHandle: createRuntimeHandle,
			runtimeHandleValue: runtimeHandleValue,
			closeRuntimeHandle: closeRuntimeHandle,
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
			resourceSearchRequest: resourceSearchRequest,
			resourceListRequest: resourceListRequest,
			resourceGetRequest: resourceGetRequest,
			resourcePatchRequest: resourcePatchRequest,
			mergedContext: mergedContext,
			catalogDefinition: catalogDefinition,
			getBlockSource: getBlockSource,
			createProjectBlock: createProjectBlock,
			duplicateProjectBlock: duplicateProjectBlock,
			editProjectBlock: editProjectBlock,
			setProjectBlockCode: setProjectBlockCode,
			blockCodeGetRequest: blockCodeGetRequest,
			blockCodePatchRequest: blockCodePatchRequest,
			blockCodeRgRequest: blockCodeRgRequest,
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
			flowCodeGetRequest: flowCodeGetRequest,
			flowCodeStatusRequest: flowCodeStatusRequest,
			flowCodeDiscardRequest: flowCodeDiscardRequest,
			flowCodeSetRequest: flowCodeSetRequest,
			flowCodePatchRequest: flowCodePatchRequest,
			flowCodeCheckRequest: flowCodeCheckRequest,
			flowCodeRgRequest: flowCodeRgRequest,
			flowCodeRunRequest: flowCodeRunRequest,
			flowCodeAnalyzeRequest: flowCodeAnalyzeRequest,
			flowCodePromoteRequest: flowCodePromoteRequest,
			requestableListRequest: requestableListRequest,
			requestableSchemaRequest: requestableSchemaRequest,
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
			parseYamlSource: parseYamlSource,
			canonicalFlowDefinition: canonicalFlowDefinition,
			parseSource: parseSource,
			sourceForFlowRequest: sourceForFlowRequest,
			expandFlowDefinition: expandFlowDefinition,
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

	function catalogDefinition(blocks, options) {
		return catalogService().catalogDefinition(blocks, options, catalogServiceEnv());
	}

	function catalogTypes(blocks, types) {
		return catalogService().catalogTypes(blocks, types, catalogServiceEnv());
	}

	function compact(value) {
		return value === undefined || value === null ? "" : JSON.stringify(normalizeTree(value));
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
