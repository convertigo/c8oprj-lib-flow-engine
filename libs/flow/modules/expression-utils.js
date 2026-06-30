(function () {
	function isStructuredValue(value) {
		return value && (Object.prototype.toString.call(value) === "[object Array]" ||
			Object.prototype.toString.call(value) === "[object Object]");
	}

	function isSimpleScopePath(value, env) {
		var text = String(value || "");
		return env.isScopePath(text) &&
			/^(request|input|config|local|result|trace|current)(?:\.[A-Za-z_$][\w$]*|\.\d+)*$/.test(text);
	}

	function simplePathPartsFor(ctx, source) {
		var key = String(source || "");
		var cache = ctx.__flowSimpleScopePathCache;
		if (!cache) {
			cache = ctx.__flowSimpleScopePathCache = {};
		}
		if (!cache[key]) {
			cache[key] = key.split(".");
		}
		return cache[key];
	}

	function readSimpleScopePath(ctx, source) {
		if (!ctx || !ctx.scopes) {
			return ctx.read(source);
		}
		var parts = simplePathPartsFor(ctx, source);
		var current = ctx.scopes[parts[0]];
		for (var i = 1; i < parts.length; i++) {
			if (current === null || current === undefined) {
				return undefined;
			}
			current = current[parts[i]];
		}
		return current;
	}

	function comparableValue(value) {
		if (typeof value === "string" && value.trim() !== "") {
			var number = Number(value);
			if (!isNaN(number)) {
				return number;
			}
		}
		return value;
	}

	function renderTemplate(template, ctx, env) {
		return String(template || "").replace(/\{\{\s*([^}]+?)\s*\}\}/g, function (_, path) {
			var value = evaluate(ctx, path, env);
			if (value === undefined || value === null) {
				return "";
			}
			if (env.isRuntimeHandle(value)) {
				return JSON.stringify(env.runtimeHandleSummary(value));
			}
			return isStructuredValue(value) ? JSON.stringify(value) : String(value);
		});
	}

	function renderValue(value, ctx, env) {
		if (typeof value !== "string") {
			return value;
		}
		var exact = value.match(/^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/);
		if (exact) {
			return evaluate(ctx, exact[1], env);
		}
		return renderTemplate(value, ctx, env);
	}

	function renderTree(ctx, value, env) {
		if (typeof value === "string") {
			return renderValue(value, ctx, env);
		}
		if (value && Object.prototype.toString.call(value) === "[object Array]") {
			return value.map(function (item) {
				return renderTree(ctx, item, env);
			});
		}
		if (value && typeof value === "object") {
			var out = {};
			Object.keys(value).forEach(function (key) {
				out[key] = renderTree(ctx, value[key], env);
			});
			return out;
		}
		return value;
	}

	function literalValue(value, env) {
		return env.normalizeTree(value);
	}

	function expressionFunctions(env) {
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
			"list.length": function (value) {
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
				return JSON.stringify(env.sanitizeRuntimeValue(value));
			}
		};
	}

	function tokensFor(ctx, source, env) {
		var key = String(source || "");
		if (env.cacheUtils && env.expressionTokenCache) {
			var cached = env.cacheUtils.readBoundedMap(env.expressionTokenCache, key, key);
			if (cached) {
				return cached;
			}
			return env.cacheUtils.writeBoundedMap(env.expressionTokenCache, key, key, tokenize(key, env), "Flow expressions");
		}
		var cache = ctx.__flowExpressionTokenCache;
		if (!cache) {
			cache = ctx.__flowExpressionTokenCache = {};
		}
		if (!cache[key]) {
			cache[key] = tokenize(key, env);
		}
		return cache[key];
	}

	function unknownFunctionHint(name) {
		name = String(name || "");
		if (name.match(/\.(trim|toLowerCase|toUpperCase|includes|startsWith|endsWith)$/)) {
			return "This method is only available on Flow scope paths, for example local.text.trim(). For other cases use trim(value), lower(value), upper(value), contains(value, part), startsWith(value, prefix) or endsWith(value, suffix).";
		}
		if (name === "slice" || name.match(/\.slice$/)) {
			return "Array methods are not executed inside Flow expressions. In FlowScript, assign a block call instead: var top5 = list.take({ items, count: 5 }).";
		}
		if (name === "map" || name.match(/\.map$/)) {
			return "Use the list.map block in FlowScript: var mapped = list.map({ items, select: { field: current.field } }).";
		}
		if (name === "filter" || name.match(/\.filter$/)) {
			return "Use the list.filter block in FlowScript: var filtered = list.filter({ items, where: current.enabled }).";
		}
		if (name === "sort" || name.match(/\.sort$/)) {
			return "Use the list.sort block in FlowScript: var sorted = list.sort({ items, by: current.title, direction: \"asc\" }).";
		}
		if (name === "list.length") {
			return "Use items.length in FlowScript, or length(items) when an expression function is clearer.";
		}
		if (name === "count" || name === "Count" || name === "len" || name === "list.count") {
			return "Use items.length or length(items) for array counts. There is no count/len/list.count Flow expression function.";
		}
		return "";
	}

	function unknownIdentifierHint(name) {
		name = String(name || "");
		if (name === "index") {
			return "No implicit index variable is available in list.map/list.filter expressions yet. Use list.take for top-N slicing, or create an explicit flow when you need counters.";
		}
		if (name === "item") {
			return "Use current for the item exposed by forEach/list.map/list.filter, for example current.title.";
		}
		if (name.match(/^[A-Za-z_$][\w$]*$/)) {
			return "Use explicit Flow scopes: input.*, config.*, local.*, current.* or result.*. Inside list.sort/list.map/list.filter, use current." + name + " for an item field.";
		}
		return "";
	}

	function tokenize(source, env) {
		var text = String(source || "");
		var tokens = [];
		var i = 0;
		function unsupportedHint(ch) {
			if (ch === "[") {
				return "Flow expressions support scope indexing like local.items[0] or object[\"key\"], but not JavaScript array literals inside expressions. Array literals are valid as FlowScript values such as var empty = [] or block properties; assign one first or use an existing array path.";
			}
			if (ch === "{") {
				return "Flow expressions do not support JavaScript object literals inside expressions. Object literals are valid as FlowScript values such as list.map({ select: { name: current.name } }); assign one first or use blocks for object construction.";
			}
			return "Flow expressions support scope paths, literals, function calls, arithmetic/comparison/logical operators, ternary and ??; use blocks for object/array construction.";
		}
		function isDigit(ch) {
			return ch >= "0" && ch <= "9";
		}
		function isIdentStart(ch) {
			return !!ch && (ch === "_" || ch === "$" || ch >= "A" && ch <= "Z" || ch >= "a" && ch <= "z");
		}
		function isIdentPart(ch) {
			return isIdentStart(ch) || isDigit(ch);
		}
		function readBracketPathPart() {
			if (text.charAt(i) !== "[") {
				return null;
			}
			var start = i;
			i++;
			while (i < text.length && /\s/.test(text.charAt(i))) {
				i++;
			}
			var part = "";
			var ch = text.charAt(i);
			if (isDigit(ch)) {
				var numberStart = i++;
				while (i < text.length && isDigit(text.charAt(i))) {
					i++;
				}
				part = text.substring(numberStart, i);
			} else if (ch === "\"" || ch === "'") {
				var quote = ch;
				i++;
				while (i < text.length) {
					ch = text.charAt(i++);
					if (ch === quote) {
						break;
					}
					if (ch === "\\" && i < text.length) {
						var escaped = text.charAt(i++);
						part += escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped;
					} else {
						part += ch;
					}
				}
			} else {
				i = start;
				return null;
			}
			while (i < text.length && /\s/.test(text.charAt(i))) {
				i++;
			}
			if (text.charAt(i) !== "]") {
				i = start;
				return null;
			}
			i++;
			return part;
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
				var ident = text.substring(identStart, i);
				while (i < text.length) {
					var bracketPart = readBracketPathPart();
					if (bracketPart === null) {
						break;
					}
					ident += "." + bracketPart;
					while (i < text.length && (isIdentPart(text.charAt(i)) || text.charAt(i) === ".")) {
						ident += text.charAt(i++);
					}
				}
				tokens.push({ type: "id", value: ident });
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
			env.raise("INVALID_EXPRESSION", "Unsupported expression character: " + ch, null, unsupportedHint(ch));
		}
		tokens.push({ type: "eof", value: "" });
		return tokens;
	}

		function evaluate(ctx, source, env) {
			if (source === undefined || source === null) {
				return literalValue(source, env);
			}
			if (isStructuredValue(source)) {
				return renderTree(ctx, source, env);
			}
			if (typeof source !== "string") {
				return literalValue(source, env);
			}
			if (isSimpleScopePath(source, env)) {
				return readSimpleScopePath(ctx, source);
			}
			var tokens = tokensFor(ctx, source, env);
		var position = 0;
		var fns = expressionFunctions(env);
		function peek(value) {
			var token = tokens[position];
			return value === undefined ? token : token.value === value;
		}
		function consume(value) {
			if (value !== undefined && !peek(value)) {
				env.raise("INVALID_EXPRESSION", "Expected \"" + value + "\" in expression: " + source);
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
					left = comparableValue(left);
					right = comparableValue(right);
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
		function expressionMethodCall(name, args) {
			var index = String(name || "").lastIndexOf(".");
			if (index === -1) {
				return { handled: false };
			}
			var receiverPath = name.substring(0, index);
			var method = name.substring(index + 1);
			if (!env.isScopePath(receiverPath)) {
				return { handled: false };
			}
			var receiver = ctx.read(receiverPath);
			if (method === "trim") {
				return { handled: true, value: fns.trim(receiver) };
			}
			if (method === "toLowerCase") {
				return { handled: true, value: fns.lower(receiver) };
			}
			if (method === "toUpperCase") {
				return { handled: true, value: fns.upper(receiver) };
			}
			if (method === "includes") {
				return { handled: true, value: fns.contains(receiver, args[0]) };
			}
			if (method === "startsWith") {
				return { handled: true, value: fns.startsWith(receiver, args[0]) };
			}
			if (method === "endsWith") {
				return { handled: true, value: fns.endsWith(receiver, args[0]) };
			}
			return { handled: false };
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
						var methodCall = expressionMethodCall(name, args);
						if (methodCall.handled) {
							return methodCall.value;
						}
						env.raise("INVALID_EXPRESSION", "Unknown expression function: " + name, null, unknownFunctionHint(name));
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
					if (env.isScopePath(name)) {
						return isSimpleScopePath(name, env) ? readSimpleScopePath(ctx, name) : ctx.read(name);
					}
				env.raise("INVALID_EXPRESSION", "Unknown expression identifier: " + name, null, unknownIdentifierHint(name));
			}
			if (peek("(")) {
				consume("(");
				var value = parseExpression();
				consume(")");
				return value;
			}
			env.raise("INVALID_EXPRESSION", "Invalid expression near: " + token.value);
		}
		var result = parseExpression();
		if (peek().type !== "eof") {
			env.raise("INVALID_EXPRESSION", "Unexpected token in expression: " + peek().value);
		}
		return result;
	}

	return {
		isStructuredValue: isStructuredValue,
		renderTemplate: renderTemplate,
		renderValue: renderValue,
		renderTree: renderTree,
		literalValue: literalValue,
		isSimpleScopePath: isSimpleScopePath,
		readSimpleScopePath: readSimpleScopePath,
		expressionFunctions: expressionFunctions,
		tokenize: tokenize,
		evaluate: evaluate
	};
}())
