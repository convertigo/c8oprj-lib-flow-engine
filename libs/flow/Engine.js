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

	var yamlMapper = new ObjectMapper(new YAMLFactory());
	var jsonMapper = new ObjectMapper();
	var scopeNames = ["request", "input", "config", "flow", "result", "trace", "current"];

	function engineDir() {
		if (typeof __flowEngineDir !== "undefined" && String(__flowEngineDir).trim() !== "") {
			return new File(String(__flowEngineDir));
		}
		return new File("libs/flow").getAbsoluteFile();
	}

	function projectDir() {
		if (typeof __flowProjectDir !== "undefined" && String(__flowProjectDir).trim() !== "") {
			return new File(String(__flowProjectDir));
		}
		return null;
	}

	function projectBlocksDir() {
		var dir = projectDir();
		return dir ? new File(dir, "libs/flow/blocks") : null;
	}

	function projectFlowsDir() {
		var dir = projectDir();
		return dir ? new File(dir, "libs/flows") : null;
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
		return parseYamlSource(source, "version: 1\nnodes: []\n");
	}

	function response(value) {
		return JSON.stringify(value || {});
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
			id: true, uid: true, name: true, block: true, type: true,
			props: true, nodes: true, "do": true, then: true, "else": true,
			disabled: true
		};
		if (node.props) {
			Object.keys(node.props).forEach(function (key) {
				props[key] = node.props[key];
			});
		}
		Object.keys(node).forEach(function (key) {
			if (!structural[key] && props[key] === undefined) {
				props[key] = node[key];
			}
		});
		return props;
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
		var parts = String(path).split(".");
		var current = root;
		for (var i = 0; i < parts.length; i++) {
			if (current === null || current === undefined) {
				return undefined;
			}
			current = current[parts[i]];
		}
		return current;
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
		if (value === undefined || value === null) {
			return value;
		}
		try {
			if (value instanceof NativeJavaObject) {
				value = value.unwrap();
			}
			if (value && typeof value.getClass === "function") {
				var className = String(value.getClass().getName());
				if (className === "java.lang.String") {
					return String(value);
				}
				if (className === "java.lang.Boolean") {
					return String(value) === "true";
				}
				if (value instanceof JavaNumber || className.indexOf("java.lang.") === 0 && className.match(/(Byte|Short|Integer|Long|Float|Double|Number)$/)) {
					return Number(value);
				}
			}
			if (value instanceof JavaString) {
				return String(value);
			}
			if (value instanceof JavaBoolean) {
				return String(value) === "true";
			}
			if (value instanceof JavaNumber) {
				return Number(value);
			}
		} catch (e) {
		}
		return value;
	}

	function normalizeTree(value) {
		value = jsValue(value);
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
		if (value === null || value === undefined) {
			return "null";
		}
		if (Object.prototype.toString.call(value) === "[object Array]") {
			return "array";
		}
		if (typeof value === "object") {
			return "object";
		}
		if (typeof value === "number") {
			return Math.floor(value) === value ? "integer" : "number";
		}
		if (typeof value === "boolean") {
			return "boolean";
		}
		return "string";
	}

	function mergeSchema(left, right) {
		if (!left) {
			return right;
		}
		if (!right) {
			return left;
		}
		if (left.type !== right.type) {
			return { type: "unknown" };
		}
		if (left.type === "object") {
			var properties = {};
			Object.keys(left.properties || {}).forEach(function (key) {
				properties[key] = left.properties[key];
			});
			Object.keys(right.properties || {}).forEach(function (key) {
				properties[key] = mergeSchema(properties[key], right.properties[key]);
			});
			return { type: "object", properties: properties };
		}
		if (left.type === "array") {
			return { type: "array", items: mergeSchema(left.items, right.items) || { type: "unknown" } };
		}
		return left;
	}

	function inferSchema(value, depth) {
		value = normalizeTree(value);
		depth = depth || 0;
		if (depth > 8) {
			return { type: "unknown" };
		}
		var type = schemaValueType(value);
		if (type === "array") {
			var itemSchema = null;
			for (var i = 0; i < value.length && i < 12; i++) {
				itemSchema = mergeSchema(itemSchema, inferSchema(value[i], depth + 1));
			}
			return { type: "array", items: itemSchema || { type: "unknown" } };
		}
		if (type === "object") {
			var properties = {};
			Object.keys(value || {}).slice(0, 120).forEach(function (key) {
				properties[key] = inferSchema(value[key], depth + 1);
			});
			return { type: "object", properties: properties };
		}
		return { type: type };
	}

	function isSchemaMetaKey(key) {
		return {
			type: true,
			description: true,
			longDescription: true,
			required: true,
			"default": true,
			nullable: true,
			enum: true,
			format: true,
			example: true,
			examples: true,
			items: true,
			properties: true
		}[key] === true;
	}

	function isLeafSchema(value) {
		if (value === null || value === undefined) {
			return true;
		}
		if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
			return true;
		}
		if (Object.prototype.toString.call(value) === "[object Array]") {
			return true;
		}
		if (typeof value === "object" && value.type && value.type !== "object" && !value.properties) {
			if (value.type === "array" && value.items) {
				return false;
			}
			return true;
		}
		return false;
	}

	function schemaPaths(schema, prefix) {
		schema = normalizeTree(schema);
		prefix = String(prefix || "");
		if (schema && typeof schema === "object" && schema.type === "array") {
			var arrayOut = prefix ? [prefix] : [];
			if (schema.items) {
				schemaPaths(schema.items, prefix).forEach(function (path) {
					addUnique(arrayOut, path);
				});
			}
			return arrayOut;
		}
		if (isLeafSchema(schema)) {
			return prefix ? [prefix] : [];
		}
		var source = schema.properties || schema;
		var keys = Object.keys(source || {}).filter(function (key) {
			return !isSchemaMetaKey(key);
		});
		if (keys.length === 0) {
			return prefix ? [prefix] : [];
		}
		var out = [];
		keys.forEach(function (key) {
			var childPrefix = joinPath(prefix, key);
			var child = source[key];
			if (isLeafSchema(child)) {
				addUnique(out, childPrefix);
			} else {
				schemaPaths(child, childPrefix).forEach(function (path) {
					addUnique(out, path);
				});
			}
		});
		return out;
	}

	function schemaAtPath(schema, path) {
		if (!schema) {
			return null;
		}
		var current = schema;
		var text = String(path || "");
		if (text === "") {
			return current;
		}
		var parts = text.split(".");
		for (var i = 0; i < parts.length; i++) {
			if (!current) {
				return null;
			}
			if (current.type === "array" && current.items) {
				current = current.items;
			}
			var source = current.properties || current;
			current = source[parts[i]];
		}
		return current || null;
	}

	function hasSchemaContent(schema) {
		if (!schema) {
			return false;
		}
		if (schema.type && schema.type !== "object") {
			return true;
		}
		return Object.keys(schema.properties || {}).length > 0;
	}

	function schemaScore(schema) {
		schema = normalizeTree(schema);
		if (!schema) {
			return 0;
		}
		if (schema.type === "unknown" || schema.type === "null") {
			return 0;
		}
		if (schema.type === "array") {
			return schemaScore(schema.items);
		}
		if (schema.type === "object" || schema.properties) {
			var score = 0;
			Object.keys(schema.properties || {}).forEach(function (key) {
				score += schemaScore(schema.properties[key]);
			});
			return score;
		}
		return schema.type ? 1 : 0;
	}

	function assignSchemaAtPath(root, path, schema) {
		if (!path || !schema) {
			return;
		}
		var parts = String(path).split(".");
		var current = root;
		for (var i = 0; i < parts.length - 1; i++) {
			var part = parts[i];
			current.type = "object";
			current.properties = current.properties || {};
			if (!current.properties[part]) {
				current.properties[part] = { type: "object", properties: {} };
			}
			current = current.properties[part];
		}
		current.type = "object";
		current.properties = current.properties || {};
		var leaf = parts[parts.length - 1];
		current.properties[leaf] = mergeSchema(current.properties[leaf], schema) || schema;
	}

	function itemSchema(schema) {
		return schema && schema.type === "array" && schema.items ? schema.items : schema;
	}

	function writeScopePath(scopes, path, value) {
		var parts = String(path || "").split(".");
		if (parts.length === 0 || scopeNames.indexOf(parts[0]) === -1) {
			raise("INVALID_SCOPE_PATH", "Invalid scope path: " + path);
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
		return value && (Object.prototype.toString.call(value) === "[object Array]" ||
			Object.prototype.toString.call(value) === "[object Object]");
	}

	function renderTemplate(template, ctx) {
		return String(template || "").replace(/\{\{\s*([^}]+?)\s*\}\}/g, function (_, path) {
			var value = evaluateExpression(ctx, path);
			if (value === undefined || value === null) {
				return "";
			}
			return isStructuredValue(value) ? JSON.stringify(value) : String(value);
		});
	}

	function renderValue(value, ctx) {
		if (typeof value !== "string") {
			return value;
		}
		var exact = value.match(/^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/);
		if (exact) {
			return evaluateExpression(ctx, exact[1]);
		}
		return renderTemplate(value, ctx);
	}

	function renderTemplateTree(ctx, value) {
		if (typeof value === "string") {
			return renderValue(value, ctx);
		}
		if (value && Object.prototype.toString.call(value) === "[object Array]") {
			return value.map(function (item) {
				return renderTemplateTree(ctx, item);
			});
		}
		if (value && typeof value === "object") {
			var out = {};
			Object.keys(value).forEach(function (key) {
				out[key] = renderTemplateTree(ctx, value[key]);
			});
			return out;
		}
		return value;
	}

	function literalValue(value) {
		return normalizeTree(value);
	}

	function expressionFunctions() {
		return {
			lower: function (value) {
				return String(value === undefined || value === null ? "" : value).toLowerCase();
			},
			upper: function (value) {
				return String(value === undefined || value === null ? "" : value).toUpperCase();
			},
			trim: function (value) {
				return String(value === undefined || value === null ? "" : value).trim();
			},
			contains: function (text, part) {
				return String(text === undefined || text === null ? "" : text).indexOf(String(part)) !== -1;
			},
			startsWith: function (text, prefix) {
				return String(text === undefined || text === null ? "" : text).indexOf(String(prefix)) === 0;
			},
			endsWith: function (text, suffix) {
				text = String(text === undefined || text === null ? "" : text);
				suffix = String(suffix);
				return text.substring(text.length - suffix.length) === suffix;
			},
			length: function (value) {
				return value === undefined || value === null ? 0 : value.length || 0;
			},
			round: function (value, digits) {
				var factor = Math.pow(10, Number(digits || 0));
				return Math.round(Number(value) * factor) / factor;
			},
			"default": function (value, fallback) {
				return value === undefined || value === null || value === "" ? fallback : value;
			},
			json: function (value) {
				return JSON.stringify(value);
			}
		};
	}

	function tokenizeExpression(source) {
		var text = String(source || "");
		var tokens = [];
		var i = 0;
		function isDigit(ch) {
			return ch >= "0" && ch <= "9";
		}
		function isIdentStart(ch) {
			return !!ch && (ch === "_" || ch === "$" || ch >= "A" && ch <= "Z" || ch >= "a" && ch <= "z");
		}
		function isIdentPart(ch) {
			return isIdentStart(ch) || isDigit(ch);
		}
		while (i < text.length) {
			var ch = text.charAt(i);
			if (/\s/.test(ch)) {
				i++;
				continue;
			}
			if (ch === "\"" || ch === "'") {
				var quote = ch;
				var value = "";
				i++;
				while (i < text.length) {
					ch = text.charAt(i++);
					if (ch === quote) {
						break;
					}
					if (ch === "\\" && i < text.length) {
						var escaped = text.charAt(i++);
						value += escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped;
					} else {
						value += ch;
					}
				}
				tokens.push({ type: "string", value: value });
				continue;
			}
			if (isDigit(ch) || ch === "." && isDigit(text.charAt(i + 1))) {
				var start = i++;
				while (i < text.length && (isDigit(text.charAt(i)) || text.charAt(i) === ".")) {
					i++;
				}
				tokens.push({ type: "number", value: Number(text.substring(start, i)) });
				continue;
			}
			if (isIdentStart(ch)) {
				var identStart = i++;
				while (i < text.length && (isIdentPart(text.charAt(i)) || text.charAt(i) === ".")) {
					i++;
				}
				tokens.push({ type: "id", value: text.substring(identStart, i) });
				continue;
			}
			var three = text.substring(i, i + 3);
			var two = text.substring(i, i + 2);
			if (three === "===" || three === "!==") {
				tokens.push({ type: "op", value: three });
				i += 3;
				continue;
			}
			if (two === ">=" || two === "<=" || two === "==" || two === "!=" ||
					two === "&&" || two === "||" || two === "??") {
				tokens.push({ type: "op", value: two });
				i += 2;
				continue;
			}
			if ("()?:,+-*/!<>".indexOf(ch) !== -1) {
				tokens.push({ type: "op", value: ch });
				i++;
				continue;
			}
			raise("INVALID_EXPRESSION", "Unsupported expression character: " + ch);
		}
		tokens.push({ type: "eof", value: "" });
		return tokens;
	}

	function evaluateExpression(ctx, source) {
		if (source === undefined || source === null || typeof source !== "string") {
			return literalValue(source);
		}
		var tokens = tokenizeExpression(source);
		var position = 0;
		var fns = expressionFunctions();
		function peek(value) {
			var token = tokens[position];
			return value === undefined ? token : token.value === value;
		}
		function consume(value) {
			if (value !== undefined && !peek(value)) {
				raise("INVALID_EXPRESSION", "Expected \"" + value + "\" in expression: " + source);
			}
			return tokens[position++];
		}
		function binary(next, operators, fn) {
			var left = next();
			while (operators.indexOf(peek().value) !== -1) {
				var op = consume().value;
				left = fn(left, op, next());
			}
			return left;
		}
		function comparable(value) {
			if (typeof value === "string" && value.trim() !== "") {
				var number = Number(value);
				if (!isNaN(number)) {
					return number;
				}
			}
			return value;
		}
		function parseExpression() {
			return parseTernary();
		}
		function parseTernary() {
			var condition = parseNullish();
			if (peek("?")) {
				consume("?");
				var whenTrue = parseExpression();
				consume(":");
				var whenFalse = parseExpression();
				return condition ? whenTrue : whenFalse;
			}
			return condition;
		}
		function parseNullish() {
			return binary(parseOr, ["??"], function (left, op, right) {
				return left === undefined || left === null ? right : left;
			});
		}
		function parseOr() {
			return binary(parseAnd, ["||"], function (left, op, right) {
				return left || right;
			});
		}
		function parseAnd() {
			return binary(parseEquality, ["&&"], function (left, op, right) {
				return left && right;
			});
		}
		function parseEquality() {
			return binary(parseComparison, ["==", "===", "!=", "!=="], function (left, op, right) {
				return op === "!=" || op === "!==" ? left != right : left == right;
			});
		}
		function parseComparison() {
			return binary(parseAdd, [">", ">=", "<", "<="], function (left, op, right) {
				left = comparable(left);
				right = comparable(right);
				if (op === ">") {
					return left > right;
				}
				if (op === ">=") {
					return left >= right;
				}
				if (op === "<") {
					return left < right;
				}
				return left <= right;
			});
		}
		function parseAdd() {
			return binary(parseMul, ["+", "-"], function (left, op, right) {
				return op === "+" ? left + right : Number(left) - Number(right);
			});
		}
		function parseMul() {
			return binary(parseUnary, ["*", "/"], function (left, op, right) {
				return op === "*" ? Number(left) * Number(right) : Number(left) / Number(right);
			});
		}
		function parseUnary() {
			if (peek("!")) {
				consume("!");
				return !parseUnary();
			}
			if (peek("-")) {
				consume("-");
				return -Number(parseUnary());
			}
			return parsePrimary();
		}
		function parseArgs() {
			var args = [];
			if (peek(")")) {
				return args;
			}
			do {
				args.push(parseExpression());
				if (!peek(",")) {
					break;
				}
				consume(",");
			} while (true);
			return args;
		}
		function parsePrimary() {
			var token = peek();
			if (token.type === "number" || token.type === "string") {
				consume();
				return token.value;
			}
			if (token.type === "id") {
				var name = consume().value;
				if (peek("(")) {
					consume("(");
					var args = parseArgs();
					consume(")");
					if (!fns[name]) {
						raise("INVALID_EXPRESSION", "Unknown expression function: " + name);
					}
					return fns[name].apply(null, args);
				}
				if (name === "true") {
					return true;
				}
				if (name === "false") {
					return false;
				}
				if (name === "null") {
					return null;
				}
				if (name === "undefined") {
					return undefined;
				}
				if (isScopePath(name)) {
					return ctx.read(name);
				}
				raise("INVALID_EXPRESSION", "Unknown expression identifier: " + name);
			}
			if (peek("(")) {
				consume("(");
				var value = parseExpression();
				consume(")");
				return value;
			}
			raise("INVALID_EXPRESSION", "Invalid expression near: " + token.value);
		}
		var result = parseExpression();
		if (peek().type !== "eof") {
			raise("INVALID_EXPRESSION", "Unexpected token in expression: " + peek().value);
		}
		return result;
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
			value.replace(/\b(request|input|config|flow|result|trace|current)(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*/g, function (path) {
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
			return JSON.parse(JSON.stringify(value));
		} catch (e) {
			return String(value);
		}
	}

	function canonicalPath(file) {
		try {
			return String(file.getCanonicalPath());
		} catch (e) {
			return String(file.getAbsolutePath());
		}
	}

	function blockFileName(name) {
		var blockName = String(name || "").trim();
		if (!blockName.match(/^[A-Za-z0-9_.-]+$/)) {
			raise("INVALID_BLOCK_NAME", "Invalid Flow block name: " + name,
				null, "Use letters, digits, dot, underscore or dash.");
		}
		return blockName + ".js";
	}

	function flowFileName(name) {
		var flowName = String(name || "").trim();
		if (!flowName.match(/^[A-Za-z0-9_.-]+$/)) {
			raise("INVALID_FLOW_NAME", "Invalid Flow name: " + name,
				null, "Use letters, digits, dot, underscore or dash.");
		}
		return flowName + ".flow.yaml";
	}

	function safeFilePart(value) {
		return String(value || "").trim().replace(/[^A-Za-z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "");
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
		var definition = parseSource(request.flowSource || "");
		var flowName = flowNameFor(request, definition);
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

	function loadBlockFile(blocks, file, origin) {
		var source = String(FileUtils.readFileToString(file, "UTF-8"));
		var block = eval(source);
		if (!block || !block.name || typeof block.run !== "function") {
			raise("INVALID_BLOCK", "Invalid block module: " + file.getAbsolutePath());
		}
		if (blocks[block.name]) {
			raise("DUPLICATE_BLOCK", "Duplicate Flow block: " + block.name,
				null, "Rename the project block or remove the duplicate.");
		}
		block.__flowOrigin = origin;
		block.__flowFile = file.getAbsolutePath();
		blocks[block.name] = block;
		return block;
	}

	function loadBlockDir(blocks, blocksDir, origin) {
		var files = blocksDir.listFiles();
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
			loadBlockFile(blocks, file, origin);
		});
	}

	function loadBlocks() {
		var blocks = {};
		var coreBlocksDir = new File(engineDir(), "blocks");
		loadBlockDir(blocks, coreBlocksDir, "core");
		var localBlocksDir = projectBlocksDir();
		if (localBlocksDir && canonicalPath(localBlocksDir) !== canonicalPath(coreBlocksDir)) {
			loadBlockDir(blocks, localBlocksDir, "project");
		}
		return blocks;
	}

	function projectBlockFile(name) {
		var dir = projectBlocksDir();
		if (!dir) {
			raise("PROJECT_BLOCKS_UNAVAILABLE", "Project blocks are unavailable.",
				null, "Run through a Flow requestable or set __flowProjectDir in standalone tests.");
		}
		return new File(dir, blockFileName(name));
	}

	function validateBlockSource(name, source) {
		var block = eval(String(source || ""));
		if (!block || !block.name || typeof block.run !== "function") {
			raise("INVALID_BLOCK", "Invalid block module: " + name,
				null, "A block file must evaluate to an object with name and run(ctx, node).");
		}
		if (String(block.name) !== String(name)) {
			raise("BLOCK_NAME_MISMATCH", "Block source declares \"" + block.name + "\" instead of \"" + name + "\".");
		}
		return block;
	}

	function createProjectBlock(blocks, name, source, overwrite) {
		validateBlockSource(name, source);
		var file = projectBlockFile(name);
		if (blocks[name] && blocks[name].__flowOrigin !== "project") {
			raise("DUPLICATE_BLOCK", "Cannot override non-project Flow block: " + name,
				null, "Choose a project-specific name instead.");
		}
		if (file.isFile() && overwrite !== true) {
			raise("BLOCK_ALREADY_EXISTS", "Project block already exists: " + name,
				null, "Pass overwrite=true to replace it explicitly.");
		}
		file.getParentFile().mkdirs();
		FileUtils.writeStringToFile(file, String(source), "UTF-8");
		if (blocks[name]) {
			delete blocks[name];
		}
		var block = loadBlockFile(blocks, file, "project");
		return blockDescriptor(block);
	}

	function getBlockSource(blocks, name) {
		var block = blocks[String(name || "")];
		if (!block) {
			raise("UNKNOWN_BLOCK", "Unknown Flow block: " + name);
		}
		return {
			name: block.name,
			origin: block.__flowOrigin || "unknown",
			file: String(block.__flowFile || ""),
			source: String(FileUtils.readFileToString(new File(String(block.__flowFile)), "UTF-8"))
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
		return {
			flows: files.filter(function (file) {
				return file.isFile() && String(file.getName()).endsWith(".flow.yaml");
			}).map(function (file) {
				var filename = String(file.getName());
				return {
					name: filename.substring(0, filename.length - ".flow.yaml".length),
					file: String(file.getAbsolutePath()),
					size: Number(file.length()),
					lastModified: Number(file.lastModified())
				};
			})
		};
	}

	function getProjectFlow(name) {
		var file = projectFlowFile(name);
		if (!file.isFile()) {
			raise("UNKNOWN_FLOW", "Unknown Flow sidecar: " + name);
		}
		return {
			name: String(name),
			file: String(file.getAbsolutePath()),
			source: String(FileUtils.readFileToString(file, "UTF-8"))
		};
	}

	function setProjectFlow(blocks, name, source) {
		var analysis = analyzeFlowSource(blocks, source);
		var file = projectFlowFile(name);
		file.getParentFile().mkdirs();
		FileUtils.writeStringToFile(file, String(source), "UTF-8");
		return {
			ok: true,
			name: String(name),
			file: String(file.getAbsolutePath()),
			analysis: analysis
		};
	}

	function sourceForFlowRequest(args) {
		args = args || {};
		if (args.flowSource !== undefined && args.flowSource !== null && String(args.flowSource).trim() !== "") {
			return String(args.flowSource);
		}
		return getProjectFlow(args.name).source;
	}

	function outputSchemaForFlowSource(flowSource) {
		var definition = parseSource(flowSource);
		return definition.output || definition.outputs || {};
	}

	function objectSchema(schema) {
		schema = normalizeTree(schema || {});
		if (schema.type) {
			return schema;
		}
		return {
			type: "object",
			properties: schema
		};
	}

	function flowOutputSchema(name) {
		var flow = getProjectFlow(name);
		var definition = parseSource(flow.source);
		return objectSchema(declaredOutputSchema(definition) || readResultSchema({ flowName: name }, definition) || {});
	}

	function outputPathsForFlow(name) {
		return schemaPaths(flowOutputSchema(name), "");
	}

	function currentProjectName(request) {
		request = request || {};
		if (request.context && request.context.project) {
			return String(request.context.project);
		}
		if (request.flowQName) {
			return String(request.flowQName).split(".")[0];
		}
		return "";
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
				var definition = parseSource(String(dbo.getFlowSource()));
				return {
					type: "object",
					properties: {
						document: objectSchema(declaredOutputSchema(definition) || readResultSchema({ flowName: String(dbo.getName()) }, definition) || {})
					}
				};
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
			return inferSchema({
				document: output
			});
		} catch (e) {
			return null;
		}
	}

	function blockName(node) {
		return node.block || node.type || "";
	}

	function blockCatalog(block) {
		return block && typeof block.catalog === "function" ? block.catalog() : {};
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

	function executeNode(ctx, node) {
		if (ctx.stopped || !node || node.disabled) {
			return undefined;
		}
		var name = blockName(node);
		var block = ctx.blocks[name];
		if (!block) {
			raise("UNKNOWN_BLOCK", "Unknown Flow block: " + name, node, "Call catalog() to list supported blocks.");
		}
		var props = nodeProps(node);
		var result = block.run(ctx, node);
		if (props.out && result !== undefined) {
			ctx.write(props.out, result);
		}
		ctx.trace(node, name, result);
		return result;
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
		var definition = parseSource(request.flowSource);
		var projectEngine = loadProjectEngineDefinition();
		var ctx = createRunContext(request, definition, blocks, projectEngine);
		ctx.runNodes(definition.nodes || []);
		var result = ctx.returned === undefined ? ctx.scopes.result : ctx.returned;
		learnResultSchema(request, definition, result);
		return {
			ok: true,
			result: result,
			flow: ctx.scopes.flow,
			trace: request.includeTrace === false ? undefined : ctx.scopes.trace
		};
	}

	function createRunContext(request, definition, blocks, projectEngine) {
		var requestScope = normalizeTree(request.context || {});
		requestScope.engineDir = canonicalPath(engineDir());
		requestScope.engineProjectDir = canonicalPath(new File(engineDir(), "../.."));
		var currentProjectDir = projectDir();
		requestScope.projectDir = currentProjectDir ? canonicalPath(currentProjectDir) : "";
		var ctx = {
			request: request,
			definition: definition,
			engine: projectEngine || {},
			blocks: blocks,
			returned: undefined,
			stopped: false,
			scopes: {
				request: requestScope,
				input: normalizeTree(request.input || {}),
				config: effectiveConfig(request, definition, projectEngine || {}),
				flow: {},
				result: {},
				trace: { nodes: [] },
				current: null
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
		ctx.convertigoContext = function () {
			if (typeof context === "undefined" || context === null) {
				raise("CONVERTIGO_CONTEXT_UNAVAILABLE", "This block needs a live Convertigo context.");
			}
			return context;
		};
		ctx.runNodes = function (nodes) {
			return executeNodes(ctx, nodes);
		};
		ctx.catalog = function () {
			return catalogDefinition(blocks);
		};
		ctx.analyzeFlowSource = function (flowSource, options) {
			options = options || {};
			return analyzeFlowSource(blocks, flowSource, options);
		};
		ctx.contextFlowSource = function (args) {
			return contextForFlowRequest(blocks, args || {});
		};
		ctx.schemaForOutput = function (node, property, outPath) {
			return readOutputSchema(request, definition, node, property || "out", outPath || "");
		};
		ctx.learnOutputSchema = function (node, property, outPath, value) {
			return learnOutputSchema(request, definition, node, property || "out", outPath || "", value);
		};
		ctx.schemaReset = function (args) {
			args = args || {};
			if (!args.flowName && !args.name) {
				args.flowName = flowNameFor(request, definition);
			}
			return resetSchemaRequest(args);
		};
		ctx.runFlowSource = function (flowSource, config, options) {
			options = options || {};
			return runFlowRequest({
				flowSource: flowSource,
				config: config || {},
				input: options.input || {},
				context: mergedContext(ctx.scopes.request, options.context || {}),
				includeTrace: options.includeTrace === true
			}, blocks);
		};
		ctx.blockList = function () {
			return catalogDefinition(blocks);
		};
		ctx.blockGet = function (name) {
			return getBlockSource(blocks, name);
		};
		ctx.blockCreate = function (name, source, overwrite) {
			return createProjectBlock(blocks, name, source, overwrite);
		};
		ctx.blockTest = function (flowSource, config, options) {
			options = options || {};
			return runFlowRequest({
				flowSource: flowSource,
				config: config || {},
				input: options.input || {},
				context: mergedContext(ctx.scopes.request, options.context || {}),
				includeTrace: options.includeTrace === true
			}, blocks);
		};
		ctx.flowList = function () {
			return listProjectFlows();
		};
		ctx.flowGet = function (name) {
			return getProjectFlow(name);
		};
		ctx.flowSet = function (name, source) {
			return setProjectFlow(blocks, name, source);
		};
		ctx.flowTest = function (args) {
			args = args || {};
			var source = sourceForFlowRequest(args);
			return runFlowRequest({
				flowSource: source,
				config: args.config || {},
				input: args.input || {},
				context: mergedContext(ctx.scopes.request, args.context || {}),
				includeTrace: args.includeTrace === true
			}, blocks);
		};
		ctx.returnValue = function (value) {
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
			paths: ["request", "input", "config", "flow", "result", "trace", "current"],
			reads: [],
			writes: [],
			providers: {},
			schemas: {},
			returnSchemas: [],
			currentSources: [],
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

	function schemaForAnalysisPath(ctx, path) {
		var best = "";
		Object.keys(ctx.schemas || {}).forEach(function (basePath) {
			if (path === basePath || path.indexOf(basePath + ".") === 0) {
				if (basePath.length > best.length) {
					best = basePath;
				}
			}
		});
		if (!best) {
			return null;
		}
		return schemaAtPath(ctx.schemas[best], path === best ? "" : String(path).substring(best.length + 1));
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
			if (writeProps.indexOf(key) !== -1 || kind === "path" && mode === "write") {
				if (typeof value === "string") {
					addUnique(writes, value);
					ctx.addWrite(value);
					outputs.push({
						property: key,
						path: value
					});
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
			raise("UNKNOWN_BLOCK", "Unknown Flow block: " + name, node, "Call catalog() to list supported blocks.");
		}
		var props = nodeProps(node);
		var catalog = blockCatalog(block);
		var info = {
			id: nodePath(node),
			block: name,
			props: Object.keys(props),
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
		var definition = parseSource(flowSource);
		return analyzeFlowDefinition(blocks, definition, request);
	}

	function analyzeFlowDefinition(blocks, definition, request) {
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
			raise("UNKNOWN_BLOCK", "Unknown Flow block: " + name, node, "Call catalog() to list supported blocks.");
		}
		var props = nodeProps(node);
		var catalog = blockCatalog(block);
		var info = {
			id: nodePath(node),
			path: path || "",
			block: name,
			props: Object.keys(props),
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
			var slots = activeSlots(node, catalog);
			for (var slotIndex = 0; slotIndex < slots.length; slotIndex++) {
				var slot = slots[slotIndex];
				var childPath = nodeListPath + "." + slot.name;
				var childResult;
				if (name === "forEach" && slot.name === "nodes") {
					var props = nodeProps(node);
					var items = props.items || props["in"];
					var source = ctx.sourceForPath ? ctx.sourceForPath(items) : null;
					source = source || { path: items };
					var currentSchema = ctx.schemaForPath ? ctx.schemaForPath(items) : null;
					currentSchema = ctx.itemSchema ? ctx.itemSchema(currentSchema) : currentSchema;
					if (currentSchema) {
						source.schema = currentSchema;
					}
					childResult = ctx.withCurrentSource(source, function () {
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
			return root === "current" ? "unknown" : "object";
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
		var definition = parseSource(request.flowSource);
		var include = normalizeInclude(request.include);
		var detail = String(request.detail || "normal");
		if (["normal", "compact"].indexOf(detail) === -1) {
			raise("INVALID_CONTEXT_DETAIL", "Unknown Flow context detail: " + detail,
				null, "Use detail=normal or detail=compact.");
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
		if (!descriptor.name) {
			descriptor.name = block.name;
		}
		if (descriptor.origin === undefined) {
			descriptor.origin = block.__flowOrigin || "unknown";
		}
		if (descriptor.file === undefined) {
			descriptor.file = String(block.__flowFile || "");
		}
		resolveBlockIcon(block, descriptor);
		return descriptor;
	}

	function catalogDefinition(blocks) {
		var descriptors = Object.keys(blocks).sort().map(function (name) {
			return blockDescriptor(blocks[name]);
		});
		var groups = [];
		function groupLabel(origin) {
			if (origin === "core") {
				return "Core engine";
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
			var group = null;
			for (var i = 0; i < groups.length; i++) {
				if (groups[i].origin === origin) {
					group = groups[i];
					break;
				}
			}
			if (!group) {
				group = {
					origin: origin,
					name: groupLabel(origin),
					order: groupOrder(origin),
					blocks: []
				};
				groups.push(group);
			}
			group.blocks.push(block);
		});
		groups.sort(function (a, b) {
			return a.order - b.order || a.name.localeCompare(b.name);
		});
		groups.forEach(function (group) {
			delete group.order;
		});
		return {
			blocks: descriptors,
			groups: groups
		};
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
		if (propertyOrder.length > 0) {
			info.propertyDefinitions = propertyDefinitions;
			info.propertyOrder = propertyOrder;
		}
		if (Object.keys(defaults).length > 0) {
			info.propertyDefaults = defaults;
		}
		if (catalog) {
			["icon", "iconify", "iconUrl", "iconSvg", "iconFile", "iconFile16", "iconFile32"].forEach(function (key) {
				if (catalog[key] !== undefined && catalog[key] !== null && String(catalog[key]) !== "") {
					info[key] = String(catalog[key]);
				}
			});
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
		return {
			name: safeVirtualName(kind || "item", name),
			kind: String(kind || ""),
			type: String(type || ""),
			path: String(path || ""),
			summary: String(summary || name || ""),
			definition: definition === undefined || definition === null ? "" : String(definition),
			info: icon ? compact(virtualIcon(icon)) : info === undefined || info === null ? "" : String(info),
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
		return {
			name: String(slot.name || "nodes"),
			label: String(slot.label || slot.name || "nodes"),
			aliases: slot.aliases || [],
			inline: slot.inline === true
		};
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

	function addNodeSlots(parent, node, nodePath, catalog, blocks, analysisById) {
		activeSlots(node, catalog).forEach(function (slot) {
			var path = nodePath + "." + slot.name;
			if (slot.inline) {
				addNodeList(parent, slot.nodes, path, blocks, analysisById);
			} else {
				var folder = virtualNode(slot.name, "slot", slot.name, path, slot.label, compact(slot.nodes), null, "mdi:call-split");
				parent.children.push(folder);
				addNodeList(folder, slot.nodes, path, blocks, analysisById);
			}
		});
	}

	function addNodeList(parent, nodes, path, blocks, analysisById) {
		(nodes || []).forEach(function (node, index) {
			var id = String(node && (node.id || node.uid || node.name) || "node" + index);
			var blockType = String(blockName(node) || "unknown");
			var block = blocks && blocks[blockType];
			var catalog = blockCatalog(block);
			resolveBlockIcon(block, catalog);
			var nodeAnalysis = analysisById && analysisById[id];
			var nodePath = path + "[" + index + "]";
			var shallow = {};
			Object.keys(node || {}).forEach(function (key) {
				if (["nodes", "do", "then", "else", "catch", "finally"].indexOf(key) === -1) {
					shallow[key] = node[key];
				}
				});
				var nodeObject = virtualNode("node_" + id, "node", blockType, nodePath,
					nodeSummary(block, catalog, node, id, blockType), compact(shallow), compact(nodeInfo(nodeAnalysis, catalog)));
				parent.children.push(nodeObject);
				addNodeSlots(nodeObject, node, nodePath, catalog, blocks, analysisById);
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

	function addCatalog(out, blocks) {
		var catalog = virtualNode("catalog", "folder", "catalog", "catalog", "Catalog", "", null, "mdi:bookshelf");
		var blocksFolder = virtualNode("blocks", "folder", "blocks", "catalog.blocks", "Blocks", "", null, "mdi:puzzle-outline");
		catalog.children.push(blocksFolder);
		var iconByOrigin = {
			core: "mdi:package-variant-closed",
			project: "mdi:folder-account-outline"
		};
		catalogDefinition(blocks).groups.forEach(function (group) {
			var groupPath = "catalog.blocks." + group.origin;
			var groupNode = virtualNode("origin_" + group.origin, "folder", group.origin, groupPath,
				group.name, compact({ origin: group.origin, count: group.blocks.length }), null,
				iconByOrigin[group.origin] || "mdi:source-repository");
			blocksFolder.children.push(groupNode);
			group.blocks.forEach(function (block) {
				groupNode.children.push(virtualNode("block_" + block.name, "block", block.name,
					groupPath + "." + block.name, block.name, compact(block)));
			});
		});
		out.push(catalog);
	}

	function describeTreeRequest(request, blocks) {
		request = request || {};
		var target = String(request.target || "flow");
		var children = [];
		if (target === "flow") {
			var definition = parseSource(request.flowSource);
			var analysisRequest = Object.assign({}, request, {
				allowRequestableSchema: false
			});
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
			addCatalog(children, blocks);
		} else {
			raise("UNKNOWN_TREE_TARGET", "Unknown Flow tree target: " + target);
		}
		return {
			ok: true,
			target: target,
			children: children
		};
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

	function applyOneMutation(root, mutation) {
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
				applyOneMutation(root, child);
			});
			return;
		}

		var parts = parseMutationPath(mutation.path);
		if (op === "append") {
			var array = valueAt(root, parts);
			if (Object.prototype.toString.call(array) !== "[object Array]") {
				raise("INVALID_MUTATION_TARGET", "Append target is not an array: " + mutation.path);
			}
			array.push(cloneMutationValue(mutation.value));
			return;
		}
		if (op === "insert") {
			var targetArray = valueAt(root, parts);
			if (Object.prototype.toString.call(targetArray) !== "[object Array]") {
				raise("INVALID_MUTATION_TARGET", "Insert target is not an array: " + mutation.path);
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
			: parseSource(request.flowSource);
		var mutations = request.mutations || (request.mutation ? [request.mutation] : []);
		if (mutations.length === 0) {
			raise("MISSING_MUTATION", "Flow mutation request requires mutation or mutations.");
		}
		mutations.forEach(function (mutation) {
			applyOneMutation(definition, mutation);
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
		var definition = parseSource(request.flowSource || "");
		var declaredSchema = declaredOutputSchema(definition);
		var staticSchema = declaredSchema ? null : resultSchemaFromAnalysis(analyzeFlowDefinition(blocks, definition, request));
		var learnedSchema = readResultSchema(request, definition);
		var schema = declaredSchema || (schemaScore(learnedSchema) > schemaScore(staticSchema) ? learnedSchema : staticSchema) || learnedSchema || {};
		return {
			ok: true,
			schema: objectSchema(schema)
		};
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

		schemaReset: function (requestJson) {
			try {
				var request = parseRequest(requestJson);
				return response(resetSchemaRequest(request));
			} catch (e) {
				return response(failure("schemaReset", e));
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

		catalog: function () {
			try {
				return response(Object.assign({ ok: true }, catalogDefinition(loadBlocks())));
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
		}
	};
}())
