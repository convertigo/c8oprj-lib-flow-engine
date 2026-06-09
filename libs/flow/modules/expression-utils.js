(function () {
	function isStructuredValue(value) {
		return value && (Object.prototype.toString.call(value) === "[object Array]" ||
			Object.prototype.toString.call(value) === "[object Object]");
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

	function tokenize(source, env) {
		var text = String(source || "");
		var tokens = [];
		var i = 0;
		function unsupportedHint(ch) {
			if (ch === "[") {
				return "Flow expressions support scope indexing like local.items[0] or object[\"key\"], but not JavaScript array literals. Use literal properties for static arrays.";
			}
			if (ch === "{") {
				return "Flow expressions do not support JavaScript object literals. Build objects with json.object/json.field or parse literal JSON with json.parse.";
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
		if (source === undefined || source === null || typeof source !== "string") {
			return literalValue(source, env);
		}
		var tokens = tokenize(source, env);
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
						env.raise("INVALID_EXPRESSION", "Unknown expression function: " + name);
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
					return ctx.read(name);
				}
				env.raise("INVALID_EXPRESSION", "Unknown expression identifier: " + name);
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
		expressionFunctions: expressionFunctions,
		tokenize: tokenize,
		evaluate: evaluate
	};
}())
