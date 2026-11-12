(function () {
	// The Java text types, looked up once with the module: from the engine that evaluates it (flowEngineClass, kept for
	// the runtime), else by their full names. Packages.java.lang.String at each method call of an expression looked up
	// "java.lang" as a class first, in the class path of the project of the call. None without Java (Node).
	function javaClass(name) {
		return typeof flowEngineClass === "function" ? flowEngineClass(name) : typeof Packages === "undefined" ? null : Packages[name];
	}
	var JavaString = javaClass("java.lang.String");
	var JavaCharSequence = javaClass("java.lang.CharSequence");

	// The names an expression never reads: the members that lead to a constructor or a prototype.
	var HIDDEN_NAMES = ["constructor", "__proto__", "prototype"];
	function hiddenName(name) {
		return HIDDEN_NAMES.indexOf(String(name)) !== -1;
	}
	// A function is never a value of an expression: it reads as undefined.
	function dataValue(value) {
		return typeof value === "function" ? undefined : value;
	}
	// The this of the functions of expressions: an object of no prototype, frozen.
	var NO_THIS = Object.freeze(Object.create(null));
	// A key of an object an expression builds is data: __proto__ is an own property, never the prototype.
	function ownValue(out, key, value) {
		if (key === "__proto__") {
			Object.defineProperty(out, key, { value: value, enumerable: true, writable: true, configurable: true });
		} else {
			out[key] = value;
		}
	}

	function isStructuredValue(value) {
		return value && (Object.prototype.toString.call(value) === "[object Array]" ||
			Object.prototype.toString.call(value) === "[object Object]");
	}

	function isSimpleScopePath(value, env) {
		var text = String(value || "");
		return /^(request|input|config|local|result|trace|current)(?:\.[A-Za-z_$][\w$]*|\.\d+)*$/.test(text);
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
		return readSimpleScopeParts(ctx, parts);
	}

	function readSimpleScopeParts(ctx, parts) {
		var current = ctx.scopes[parts[0]];
		for (var i = 1; i < parts.length; i++) {
			if (current === null || current === undefined || hiddenName(parts[i])) {
				return undefined;
			}
			current = dataValue(current[parts[i]]);
		}
		return dataValue(current);
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

	// FlowScript is written as JavaScript: === and !== keep strict equality, so a 0, false
	// or "" input stays distinct from the others. A Rhino Java wrapper (String, Number,
	// Boolean) compares as its JavaScript value.
	function strictValue(value, env) {
		return value !== null && typeof value === "object" && env && typeof env.jsValue === "function"
			? env.jsValue(value) : value;
	}

	function strictEqual(left, right, env) {
		return strictValue(left, env) === strictValue(right, env);
	}

	// Values use the notation of template-syntax.js: ${expression} (the former {{ expression }} is still read), \${
	// for a literal ${. A value made of one expression keeps the type of its result; a composition is text.
	function renderTemplate(template, ctx, env) {
		return env.templateSyntax.render(String(template === undefined || template === null ? "" : template), function (path) {
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
		if (typeof value !== "string" || value.indexOf("${") < 0 && value.indexOf("{{") < 0) return value;
		return compileValue(value, env)(ctx);
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

	// A value program captures its notation, never its evaluated data or the current
	// frame. The bounded expression cache is runtime-local and cleared with modules.
	function compileValue(value, env) {
		if (typeof value !== "string") return function () { return value; };
		if (value.indexOf("${") < 0 && value.indexOf("{{") < 0) return function () { return value; };
		var cache = env.expressionProgramCache, utils = env.cacheUtils;
		var cacheKey = "\u0000value-v1:" + value;
		var cacheable = cache && utils && value.length <= 8192;
		var known = cacheable ? utils.readBoundedMap(cache, cacheKey, "") : null;
		if (known) return known;
		var program = compileValueProgram(value, env);
		return cacheable ? utils.writeBoundedMap(cache, cacheKey, "", program) : program;
	}

	function compileValueProgram(value, env) {
		var syntax = env.templateSyntax;
		var exact = syntax.exactExpression(value);
		if (exact !== null) return compile(exact, env);
		var parts = syntax.parts(value);
		if (!parts) return function () { return value; };
		var programs = parts.map(function (part) { return part.expression !== undefined ? compile(part.expression, env) : null; });
		return function (ctx) {
			var out = "";
			for (var i = 0; i < parts.length; i++) {
				if (!programs[i]) { out += parts[i].literal; continue; }
				var item = programs[i](ctx);
				if (item === undefined || item === null) continue;
				out += env.isRuntimeHandle(item) ? JSON.stringify(env.runtimeHandleSummary(item))
					: isStructuredValue(item) ? JSON.stringify(item) : String(item);
			}
			return out;
		};
	}

	function compileTree(value, env) {
		if (typeof value === "string") {
			return compileValue(value, env);
		}
		if (value && Object.prototype.toString.call(value) === "[object Array]") {
			var itemCompilers = value.map(function (item) { return compileTree(item, env); });
			return function (ctx) {
				return itemCompilers.map(function (compileItem) { return compileItem(ctx); });
			};
		}
		if (value && typeof value === "object") {
			var keys = Object.keys(value);
			var fieldCompilers = keys.map(function (key) { return compileTree(value[key], env); });
			return function (ctx) {
				var out = {};
				for (var i = 0; i < keys.length; i++) {
					ownValue(out, keys[i], fieldCompilers[i](ctx));
				}
				return out;
			};
		}
		return function () { return value; };
	}

	function compile(value, env) {
		if (isStructuredValue(value)) {
			return compileTree(value, env);
		}
		if (typeof value === "string" && isSimpleScopePath(value, env)) {
			var parts = String(value).split(".");
			refuseHiddenPath(parts, value, env);
			return function (ctx) { return readSimpleScopeParts(ctx, parts); };
		}
		if (typeof value === "string") {
			return expressionProgramFor(null, value, env);
		}
		return function () { return literalValue(value, env); };
	}

	function refuseHiddenPath(parts, source, env) {
		for (var i = 1; i < parts.length; i++) {
			if (hiddenName(parts[i])) {
				env.raise("INVALID_EXPRESSION", parts[i] + " cannot be read in an expression: " + source, null,
					"constructor, __proto__ and prototype are not data. Read a field of the value instead.");
			}
		}
	}

	function literalValue(value, env) {
		return env.normalizeTree(value);
	}

	function listItems(value, env) {
		value = strictValue(value, env);
		if (Object.prototype.toString.call(value) === "[object Array]") {
			return value;
		}
		return value === undefined || value === null || value === "" ? [] : [value];
	}

	// Scalars are equal when their texts are; objects and lists never are
	function sameItem(first, second, env) {
		first = strictValue(first, env);
		second = strictValue(second, env);
		if (first === undefined || first === null || second === undefined || second === null ||
				typeof first === "object" || typeof second === "object") {
			return false;
		}
		return String(first) === String(second);
	}

	function numberArguments(values) {
		var numbers = [];
		for (var i = 0; i < values.length; i++) {
			numbers.push(Number(values[i]));
		}
		return numbers;
	}

	// The longest text an expression builds by repetition (text.repeat, .repeat, .padStart, .padEnd) or multiplication
	// (.replaceAll, .join of a list): the ceiling of a text.replace result (text-pattern.js, ten times its 100000
	// characters of input). It is checked before the text is built, so that a count from a caller never fills the heap.
	var MAX_BUILT_TEXT = 1000000;

	function builtText(env, length, what) {
		if (length > MAX_BUILT_TEXT) {
			env.raise("EXPRESSION_TEXT_TOO_LONG", what + " would build a text of " + length + " characters, more than the " +
				MAX_BUILT_TEXT + " an expression builds.", null,
				"Check the count before the expression (a number input with a maximum, an if that throws), or use a block for large data.");
		}
	}

	// The count of String.prototype.repeat (ToIntegerOrInfinity): truncated, NaN as 0
	function wholeCount(count) {
		var value = Number(count);
		return value !== value ? 0 : value < 0 ? Math.ceil(value) : Math.floor(value);
	}

	function joinedLength(items, separator) {
		var length = items.length > 1 ? (items.length - 1) * separator.length : 0;
		for (var i = 0; i < items.length && length <= MAX_BUILT_TEXT; i++) {
			length += items[i] === null || items[i] === undefined ? 0 : String(items[i]).length;
		}
		return length;
	}

	function functionTable(functions) {
		var table = Object.create(null);
		Object.keys(functions).forEach(function (name) {
			table[name] = functions[name];
		});
		return Object.freeze(table);
	}

	// The functions of expressions, by name: a table of no prototype, frozen.
	function expressionFunctions(env) {
		return functionTable(withNumberFunctions({
			"Array.isArray": function (value) { return Object.prototype.toString.call(value) === "[object Array]"; },
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
			// String.prototype.repeat, the value first: text.repeat("x", 2001) builds a test value one character over a
			// limit of 2000, never typed by hand
			"text.repeat": function (value, count) {
				var text = String(value === undefined || value === null ? "" : value);
				var times = wholeCount(count);
				if (times < 0 || times === Infinity) {
					env.raise("INVALID_EXPRESSION", "text.repeat takes a count of 0 or more, not " + String(count) + ".", null,
						"text.repeat(value, count) repeats the value count times, as String.prototype.repeat: a whole count from 0, for example text.repeat(\"x\", 2001).");
				}
				builtText(env, text.length * times, "text.repeat");
				return text.repeat(times);
			},
			"list.length": function (value) {
				return value === undefined || value === null ? 0 : value.length || 0;
			},
			round: function (value, digits) {
				var factor = Math.pow(10, Number(digits || 0));
				return Math.round(Number(value) * factor) / factor;
			},
			// A count of pages, a whole part: floor(total / size), ceil(total / size); % gives the remainder
			floor: function (value) {
				return Math.floor(Number(value));
			},
			ceil: function (value) {
				return Math.ceil(Number(value));
			},
			abs: function (value) {
				return Math.abs(Number(value));
			},
			min: function () {
				return Math.min.apply(null, numberArguments(arguments));
			},
			max: function () {
				return Math.max.apply(null, numberArguments(arguments));
			},
			// the JavaScript spellings, as an author writes them first
			"Math.round": function (value) {
				return Math.round(Number(value));
			},
			"Math.floor": function (value) {
				return Math.floor(Number(value));
			},
			"Math.ceil": function (value) {
				return Math.ceil(Number(value));
			},
			"Math.abs": function (value) {
				return Math.abs(Number(value));
			},
			"Math.min": function () {
				return Math.min.apply(null, numberArguments(arguments));
			},
			"Math.max": function () {
				return Math.max.apply(null, numberArguments(arguments));
			},
			// A single value counts as a list of one item, as a JWT aud claim: oneOf(clientId, claims.aud)
			oneOf: function (value, list) {
				return listItems(list, env).some(function (item) {
					return sameItem(item, value, env);
				});
			},
			overlaps: function (first, second) {
				var others = listItems(second, env);
				return listItems(first, env).some(function (item) {
					return others.some(function (other) {
						return sameItem(item, other, env);
					});
				});
			},
			"default": function (value, fallback) {
				return value === undefined || value === null || value === "" ? fallback : value;
			},
			String: function (value) {
				return value === null || value === undefined ? "" : String(value);
			},
			Number: function (value) {
				return Number(value);
			},
			json: function (value) {
				return JSON.stringify(env.sanitizeRuntimeValue(value));
			}
		}, env));
	}

	// The pure number functions of JavaScript an author writes first (parseInt, Number.isInteger, Math.sqrt...), with
	// the results of JavaScript (NaN, Infinity). Each one converts its arguments with Number or String, then calls the
	// function this module captured when it loaded: an expression never reaches a global object, a prototype or a
	// function value. Math.random is left out: it is not pure (crypto.random is the block).
	var MATH_FUNCTIONS = ["sqrt", "cbrt", "pow", "exp", "log", "log2", "log10", "trunc", "sign", "hypot",
		"sin", "cos", "tan", "asin", "acos", "atan", "atan2"];
	var MATH_IMPLEMENTATIONS = MATH_FUNCTIONS.map(function (name) { return Math[name]; });
	var parseIntegerText = parseInt, parseFloatText = parseFloat, isNaNNumber = isNaN, isFiniteNumber = isFinite;
	// The names an expression may read as a value, besides the scopes, true, false, null and undefined: a table of no
	// prototype, frozen
	var EXPRESSION_CONSTANTS = functionTable({ Infinity: Infinity, NaN: NaN, "Math.PI": Math.PI, "Math.E": Math.E });

	function withNumberFunctions(fns, env) {
		function text(value) { return String(strictValue(value, env)); }
		function number(value) { return Number(strictValue(value, env)); }
		function integer(value, radix) {
			return radix === undefined || radix === null ? parseIntegerText(text(value)) : parseIntegerText(text(value), number(radix));
		}
		function decimal(value) { return parseFloatText(text(value)); }
		fns.parseInt = integer;
		fns["Number.parseInt"] = integer;
		fns.parseFloat = decimal;
		fns["Number.parseFloat"] = decimal;
		fns.isNaN = function (value) { return isNaNNumber(number(value)); };
		fns.isFinite = function (value) { return isFiniteNumber(number(value)); };
		// The Number.* predicates do not convert, as in JavaScript: Number.isInteger("3") is false
		fns["Number.isNaN"] = function (value) {
			value = strictValue(value, env);
			return typeof value === "number" && value !== value;
		};
		fns["Number.isFinite"] = function (value) {
			value = strictValue(value, env);
			return typeof value === "number" && isFiniteNumber(value);
		};
		fns["Number.isInteger"] = function (value) {
			value = strictValue(value, env);
			return typeof value === "number" && isFiniteNumber(value) && Math.floor(value) === value;
		};
		MATH_FUNCTIONS.forEach(function (name, index) {
			var implementation = MATH_IMPLEMENTATIONS[index];
			fns["Math." + name] = function () {
				return implementation.apply(null, numberArguments(arguments));
			};
		});
		return fns;
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

	function expressionProgramFor(ctx, source, env) {
		var key = String(source || "");
		if (env.cacheUtils && env.expressionProgramCache) {
			var cached = env.cacheUtils.readBoundedMap(env.expressionProgramCache, key, key);
			if (cached) {
				return cached;
			}
			return env.cacheUtils.writeBoundedMap(env.expressionProgramCache, key, key,
				compileExpressionProgram(ctx, key, env), "Flow expression programs");
		}
		if (ctx) {
			var cache = ctx.__flowExpressionProgramCache;
			if (!cache) {
				cache = ctx.__flowExpressionProgramCache = {};
			}
			if (!cache[key]) {
				cache[key] = compileExpressionProgram(ctx, key, env);
			}
			return cache[key];
		}
		return compileExpressionProgram(null, key, env);
	}

	function unknownFunctionHint(name) {
		name = String(name || "");
		if (name === "listIncludes") {
			return "No listIncludes function is declared. For list membership use the existing scope expression local.items.includes(current.id), with your actual list and item paths; do not create a guessed block.";
		}
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
		// A block (date.isValid, orders.check...) called inside a condition or a computed value: blocks are statements.
		if (/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/.test(name) && !/^(input|local|current|result|request|config|trace)\./.test(name)) {
			return name + " is not an expression function. A block runs as a statement, not inside an expression (a condition, a select): call it on its own line " +
				"and read its result, for example local.value = " + name + "({ ... }) before the if, then if (!local.value) { ... }.";
		}
		return "";
	}

	function unknownIdentifierHint(name) {
		name = String(name || "");
		if (/^current\d+(?:[.[]|$)/.test(name)) {
			return "Numbered current aliases such as current0/current2 do not exist: current is the item of the innermost iteration. In a nested iteration, copy the outer item field to a local (local.k) before entering the inner block, then read local.k there.";
		}
		if (name === "index") {
			return "No implicit index variable is available in list.map/list.filter expressions yet. Use list.take for top-N slicing, or create an explicit flow when you need counters.";
		}
		if (name === "item") {
			return "Quote literal text. Read an item through the scope available at this expression; an iteration exposes its item as current.";
		}
		if (name.match(/^[A-Za-z_$][\w$]*$/)) {
			return "Quote literal text (\"" + name + "\"). Read a value through its existing input.*, local.* or config.* scope.";
		}
		return "";
	}

	// A regular expression literal of a JavaScript-like text at the / of start, with the call it is the target of
	// (/x/.test(value), /x/.exec(value)) or the first argument of (value.match(/x/), value.replace(/x/g, y),
	// value.split(/x/), value.search(/x/)). The diagnostics of the expressions and of the FlowScript statements name
	// the block to write from it, with the operands of the text; the parser rewrites the exact forms (callStart 0 and
	// callEnd the end of the value) to that block. A / that the reading cannot tell from a division is a literal here:
	// the callers only ask at a / where a value is expected.
	function regularExpressionAdvice(source, start) {
		var text = String(source || "");
		var end = regularExpressionClosingSlash(text, start);
		var closed = text.charAt(end) === "/";
		var flags = closed ? /^[A-Za-z]*/.exec(text.substring(end + 1))[0] : "";
		var literalEnd = closed ? end + 1 + flags.length : Math.min(end, text.length);
		var advice = {
			literal: text.substring(start, literalEnd),
			pattern: text.substring(start + 1, Math.min(end, text.length)),
			flags: flags,
			closed: closed,
			flagsSupported: /^(?!.*(.).*\1)[gims]*$/.test(flags),
			method: "",
			receiver: "",
			argument: "",
			replacement: "",
			extraArguments: false,
			callStart: start,
			callEnd: literalEnd
		};
		var after = /^\s*\.\s*(test|exec)\s*\(/.exec(text.substring(literalEnd));
		var before = /\.\s*(match|matchAll|replace|replaceAll|split|search)\s*\(\s*$/.exec(text.substring(0, start));
		var open, close, args;
		if (closed && after) {
			open = literalEnd + after[0].length - 1;
			close = closingParenthesis(text, open);
			if (close > open) {
				args = topLevelArguments(text.substring(open + 1, close));
				advice.method = after[1];
				advice.argument = args[0] || "";
				advice.extraArguments = args.length > 1;
				advice.callEnd = close + 1;
			}
		} else if (closed && before) {
			open = text.lastIndexOf("(", start);
			close = closingParenthesis(text, open);
			var receiverStart = operandStart(text, before.index);
			if (close > open && receiverStart < before.index) {
				args = topLevelArguments(text.substring(literalEnd, close).replace(/^\s*,/, ""));
				advice.method = before[1];
				advice.receiver = text.substring(receiverStart, before.index).trim();
				advice.replacement = /^replace/.test(before[1]) ? args[0] || "" : "";
				advice.extraArguments = /^replace/.test(before[1]) ? args.length !== 1 : args.length > 0;
				advice.callStart = receiverStart;
				advice.callEnd = close + 1;
			}
		}
		advice.block = /^replace/.test(advice.method) ? "text.replace" : advice.method === "split" ? "text.split" : "text.match";
		advice.example = regularExpressionExample(advice);
		return advice;
	}

	// The block call that does what the literal did, written with the operands of the text, ready to paste
	function regularExpressionExample(advice) {
		var operand = advice.argument || advice.receiver || "value";
		var name = (/([A-Za-z_$][\w$]*)\s*(?:\(\s*\))?\s*$/.exec(operand) || [0, "text"])[1];
		var pattern = JSON.stringify(advice.pattern);
		var flags = advice.flags.replace(/[^gims]/g, "");
		if (advice.block === "text.replace") {
			var replaceFlags = flags.replace(/g/g, "");
			return "local." + name + " = text.replace({ text: " + operand + ", search: " + pattern + ", replacement: " +
				(advice.replacement || "\"\"") + ", regex: true" + (flags.indexOf("g") === -1 ? ", all: false" : "") +
				(replaceFlags ? ", flags: " + JSON.stringify(replaceFlags) : "") + " })";
		}
		if (advice.block === "text.split") {
			var splitFlags = flags.replace(/g/g, "");
			return "local." + name + "Parts = text.split({ text: " + operand + ", separator: " + pattern +
				", regex: true, trim: false, removeEmpty: false" + (splitFlags ? ", flags: " + JSON.stringify(splitFlags) : "") + " })";
		}
		return "local." + name + "Match = text.match({ text: String(" + operand + "), pattern: " + pattern +
			(flags ? ", flags: " + JSON.stringify(flags) : "") + " }), then read local." + name + "Match.matched where the " +
			(advice.method === "test" || !advice.method ? "test" : advice.method) + " was (local." + name + "Match.groups holds " +
			(flags.indexOf("g") !== -1 ? "every whole match" : "the whole match then the captured groups") + ")";
	}

	// The hint of a regular expression literal: the block to write instead, with the operands of the text, written by
	// the expression checks and by the FlowScript parser at the line of the statement
	function regularExpressionHint(text, start) {
		var advice = regularExpressionAdvice(text, start);
		var unsupported = advice.flagsSupported ? "" : "The flags of a pattern are g, i, m and s; " + JSON.stringify(advice.flags) + " has others. ";
		var block = advice.block === "text.match" ? "the text.match block" : "the " + advice.block + " block with regex: true";
		return unsupported + "Write " + block + ", the pattern written as a quoted text (backslashes doubled): " + advice.example + ". " +
			"Assigned alone (local.x = /x/.test(value), value.match(/x/), value.replace(/x/g, y), value.split(/x/)), the literal is rewritten to that block. " +
			"Simple tests need no pattern: value.startsWith(\"x\"), value.endsWith(\"x\"), value.includes(\"x\"), value.length; replace and replaceAll without regex take a text.";
	}

	// The index of the / that closes the literal opened at start (the end of the line or of the text when unclosed)
	function regularExpressionClosingSlash(text, start) {
		var end = start + 1, inClass = false;
		while (end < text.length) {
			var c = text.charAt(end);
			if (c === "\\") {
				end += 2;
				continue;
			}
			if (c === "[") inClass = true;
			else if (c === "]") inClass = false;
			else if (c === "/" && !inClass) break;
			else if (c === "\n" || c === "\r") break;
			end++;
		}
		return end;
	}

	// The ) that closes the ( at open, past the strings and the regular expression literals; -1 when it is not closed
	function closingParenthesis(text, open) {
		var depth = 0, quote = "", previous = "";
		for (var i = open; i < text.length; i++) {
			var ch = text.charAt(i);
			if (quote) {
				if (ch === "\\") i++;
				else if (ch === quote) quote = "";
				continue;
			}
			if (ch === "\"" || ch === "'" || ch === "`") {
				quote = ch;
			} else if (ch === "/" && (previous === "" || /[(,=:\[!&|?{};+\-*%<>~^]/.test(previous))) {
				var slash = regularExpressionClosingSlash(text, i);
				if (text.charAt(slash) === "/") i = slash;
			} else if (ch === "(" || ch === "[" || ch === "{") {
				depth++;
			} else if (ch === ")" || ch === "]" || ch === "}") {
				depth--;
				if (depth === 0) return ch === ")" ? i : -1;
			}
			if (!/\s/.test(ch)) previous = ch;
		}
		return -1;
	}

	// The arguments of a call, split on its top-level commas, trimmed (an empty text has none)
	function topLevelArguments(text) {
		var args = [], depth = 0, quote = "", from = 0;
		for (var i = 0; i < text.length; i++) {
			var ch = text.charAt(i);
			if (quote) {
				if (ch === "\\") i++;
				else if (ch === quote) quote = "";
				continue;
			}
			if (ch === "\"" || ch === "'" || ch === "`") quote = ch;
			else if (ch === "(" || ch === "[" || ch === "{") depth++;
			else if (ch === ")" || ch === "]" || ch === "}") depth--;
			else if (ch === "," && depth === 0) {
				args.push(text.substring(from, i).trim());
				from = i + 1;
			}
		}
		if (text.trim() !== "" || args.length) args.push(text.substring(from).trim());
		return args;
	}

	// The start of the operand that ends before index (a path, a call, an index or a string: input.text,
	// String(local.q).trim(), local.items[0], "a-b")
	function operandStart(text, index) {
		var i = index - 1;
		while (i >= 0 && /\s/.test(text.charAt(i))) i--;
		while (i >= 0) {
			var ch = text.charAt(i);
			if (ch === ")" || ch === "]") {
				var depth = 0;
				for (; i >= 0; i--) {
					var c = text.charAt(i);
					if (c === ")" || c === "]") depth++;
					else if (c === "(" || c === "[") depth--;
					if (depth === 0) break;
				}
				i--;
			} else if (ch === "\"" || ch === "'") {
				i--;
				while (i >= 0 && !(text.charAt(i) === ch && text.charAt(i - 1) !== "\\")) i--;
				i--;
			} else if (/[\w$.]/.test(ch)) {
				i--;
			} else {
				break;
			}
		}
		return i + 1;
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
			return "Flow expressions support scope paths, literals, function calls (round, floor, ceil, min, max, abs and their Math.* forms among them), arithmetic (+ - * / %), comparison and logical operators, ternary and ??; use blocks for object/array construction.";
		}
		// The escape sequence of a string whose backslash is at index slash, read as JavaScript does (template-syntax.js):
		// "\r\n" used to give "r" and a line feed, "\uFEFF" the text uFEFF.
		function readEscape(slash) {
			var sequence = env.templateSyntax.escapeSequence(text, slash);
			if (sequence.error) {
				env.raise("INVALID_EXPRESSION", "Invalid escape in a string of the expression: " + sequence.error, null,
					"Use the escapes of JavaScript: \\n, \\r, \\t, \\\\, \\\", \\', \\uXXXX (\\uFEFF), \\u{...} or \\xHH.");
			}
			i = sequence.end;
			return sequence.value;
		}
		// A / where a value is expected starts a regular expression literal, which an expression does not run: it is
		// refused with the block that tests a pattern, instead of an "Unsupported expression character" on its first
		// character that named neither the construction nor what to write.
		function regularExpressionLiteral(start) {
			env.raise("FLOWSCRIPT_EXPRESSION_UNSUPPORTED", "A regular expression literal is not supported in a Flow expression: " +
				regularExpressionAdvice(text, start).literal + ".", null, regularExpressionHint(text, start));
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
					if (ch === "\\") {
						part += readEscape(i - 1);
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
		// The end of the ${ expression } of a template literal starting at from: its } at depth 0, the strings (and the
		// template literals) inside it skipped; -1 when it is not closed.
		function templateExpressionEnd(from) {
			var depth = 1, quote = "";
			for (var k = from; k < text.length; k++) {
				var c = text.charAt(k);
				if (quote) {
					if (c === "\\") k++;
					else if (c === quote) quote = "";
					continue;
				}
				if (c === "\"" || c === "'" || c === "`") quote = c;
				else if (c === "{") depth++;
				else if (c === "}" && --depth === 0) return k;
			}
			return -1;
		}
		// `text ${expression} text`, the template literal of JavaScript, in an expression (a branch of a ternary, an
		// operand): a text, as a value written as a template literal gives it. Its parts are its texts (escapes read) and
		// its expressions, each with its tokens (the checks read the paths in them).
		function readTemplateLiteral() {
			var start = i, parts = [], literal = "";
			i++;
			while (i < text.length) {
				var c = text.charAt(i);
				if (c === "`") {
					i++;
					if (literal !== "") parts.push({ literal: literal });
					return { type: "template", value: text.substring(start, i), parts: parts };
				}
				if (c === "\\") {
					literal += readEscape(i);
					continue;
				}
				if (c === "$" && text.charAt(i + 1) === "{") {
					var end = templateExpressionEnd(i + 2);
					var expression = end < 0 ? "" : text.substring(i + 2, end).trim();
					if (!expression) {
						env.raise("INVALID_EXPRESSION", (end < 0 ? "Unclosed" : "Empty") + " ${ } in a template literal of the expression: " + text.substring(start), null,
							"Write ${ expression } with a value inside, or \\${ for the text ${.");
					}
					if (literal !== "") parts.push({ literal: literal });
					literal = "";
					parts.push({ expression: expression, tokens: tokenize(expression, env) });
					i = end + 1;
					continue;
				}
				literal += c;
				i++;
			}
			env.raise("INVALID_EXPRESSION", "Unclosed template literal in the expression: " + text.substring(start), null, "Close the template literal with `.");
		}
		while (i < text.length) {
			var ch = text.charAt(i);
			if (/\s/.test(ch)) {
				i++;
				continue;
			}
			if (ch === "`") {
				tokens.push(readTemplateLiteral());
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
					if (ch === "\\") {
						value += readEscape(i - 1);
					} else {
						value += ch;
					}
				}
				tokens.push({ type: "string", value: value });
				continue;
			}
			// .name after a call, an index, a parenthesis or a string: a member of that value (s.trim().toLowerCase())
			var previous = tokens.length ? tokens[tokens.length - 1] : null;
			if (ch === "." && isIdentStart(text.charAt(i + 1)) && previous &&
					(previous.type === "string" || previous.type === "template" || previous.type === "member" || previous.type === "op" && (previous.value === ")" || previous.value === "]"))) {
				var memberStart = ++i;
				while (i < text.length && isIdentPart(text.charAt(i))) {
					i++;
				}
				tokens.push({ type: "member", value: text.substring(memberStart, i) });
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
			if (ch === "/" && (!previous || previous.type === "op" && previous.value !== ")" && previous.value !== "]")) {
				regularExpressionLiteral(i);
			}
			if ("()?:,+-*/%!<>{}[]".indexOf(ch) !== -1) {
				tokens.push({ type: "op", value: ch });
				i++;
				continue;
			}
			env.raise("INVALID_EXPRESSION", "Unsupported expression character: " + ch, null, unsupportedHint(ch));
		}
		tokens.push({ type: "eof", value: "" });
		return tokens;
	}

	function flatTokens(tokens) {
		var out = [];
		(tokens || []).forEach(function (token) {
			out.push(token);
			if (token.type !== "template") return;
			token.parts.forEach(function (part) {
				if (!part.tokens) return;
				flatTokens(part.tokens).forEach(function (inner) {
					if (inner.type !== "eof") out.push(inner);
				});
				out.push({ type: "op", value: "," });
			});
		});
		return out;
	}

	// The methods an expression may call on a value, as in JavaScript; nothing else is invoked.
	var STRING_METHODS = ["trim", "toLowerCase", "toUpperCase", "includes", "startsWith", "endsWith", "indexOf",
		"lastIndexOf", "slice", "substring", "split", "replace", "replaceAll", "padStart", "padEnd", "charAt", "concat",
		"repeat", "trimStart", "trimEnd", "localeCompare", "normalize"];
	var ARRAY_METHODS = ["includes", "indexOf", "lastIndexOf", "slice", "join", "concat", "at"];
	var NUMBER_METHODS = ["toFixed", "toString", "toPrecision"];

	function valueKind(value) {
		if (Object.prototype.toString.call(value) === "[object Array]") {
			return "a list";
		}
		if (typeof value === "number") {
			return "a number";
		}
		if (typeof value === "boolean") {
			return "a boolean";
		}
		if (typeof value === "string") {
			return "a text";
		}
		return "an object";
	}

	function methodTypeHint(method, family, received) {
		if (method === "split" && received === "a list") {
			return "The value is already a list: use it as is, or join(\",\") it first if a text is needed. An input declared array receives a JSON array or a repeated parameter, never a text it would split.";
		}
		if (family === "list" && received === "a text") {
			return "Declare the value as an array (an input of type array, a list block) or use a text method: " + STRING_METHODS.join(", ") + ".";
		}
		return "Text: " + STRING_METHODS.join(", ") + ". Lists: " + ARRAY_METHODS.join(", ") + ". Numbers: " + NUMBER_METHODS.join(", ") +
			". Convert the value first (String(value), a list block) or use a block.";
	}

	// A method called on an absent value (null or undefined) gives a value instead of failing, as lower(value) does: the
	// run reports it once per path and method (ctx.warn, the warnings of the run response), since a missing value
	// silently turned into "" or false is how a check like `if (local.email == "")` lets a null through.
	function absentReceiver(runCtx, label, method, receiver, result) {
		if (!runCtx || typeof runCtx.warn !== "function") {
			return;
		}
		var what = label ? label : "a value";
		var gives = result === "" ? "\"\"" : result === false ? "false" : "undefined";
		runCtx.warn({
			code: "EXPRESSION_METHOD_ON_ABSENT_VALUE",
			path: label || "",
			method: method,
			value: receiver === null ? "null" : "undefined",
			message: method + "() is called on " + what + ", which is " + (receiver === null ? "null" : "absent (undefined)") +
				": the expression gives " + gives + " instead of failing.",
			hint: label
				? "Test the value before using it (condition: !" + label + "), or give it a default: default(" + label + ", \"\")." + method + "()."
				: "Test the value before calling " + method + "(), or give it a default with default(value, \"\")."
		});
	}

	function compileExpressionProgram(ctx, source, env) {
		var tokens = tokensFor(ctx || {}, source, env);
		// Compiled closures may retain their activation. Keep request state out
		// of programs published in the revision's expression cache.
		ctx = null;
		var position = 0;
		var fns = expressionFunctions(env);
		function constant(value) {
			return function () { return value; };
		}
		function peek(value) {
			var token = tokens[position];
			// an operator, never a string literal that spells one ("-", ",", ")")
			return value === undefined ? token : token.type === "op" && token.value === value;
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
				left = (function (leftProgram, op, rightProgram) {
					return function (runCtx) {
						return fn(leftProgram(runCtx), op, rightProgram(runCtx));
					};
				}(left, consume().value, next()));
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
				return function (runCtx) {
					var conditionValue = condition(runCtx);
					var trueValue = whenTrue(runCtx);
					var falseValue = whenFalse(runCtx);
					return conditionValue ? trueValue : falseValue;
				};
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
				if (op === "===" || op === "!==") {
					var same = strictEqual(left, right, env);
					return op === "===" ? same : !same;
				}
				return op === "!=" ? left != right : left == right;
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
			return binary(parseUnary, ["*", "/", "%"], function (left, op, right) {
				return op === "*" ? Number(left) * Number(right)
					: op === "%" ? Number(left) % Number(right)
					: Number(left) / Number(right);
			});
		}
		function parseUnary() {
			if (peek().type === "id" && peek().value === "typeof") {
				consume();
				var typedValue = parseUnary();
				return function (runCtx) { return typeof literalValue(typedValue(runCtx), env); };
			}
			if (peek("!")) {
				consume("!");
				var notValue = parseUnary();
				return function (runCtx) { return !notValue(runCtx); };
			}
			if (peek("-")) {
				consume("-");
				var negativeValue = parseUnary();
				return function (runCtx) { return -Number(negativeValue(runCtx)); };
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
		function runArgs(programs, runCtx) {
			var args = [];
			for (var i = 0; i < programs.length; i++) {
				args.push(programs[i](runCtx));
			}
			return args;
		}
		function callMethod(receiver, method, values, runCtx, label) {
			if (receiver === null || receiver === undefined) {
				absentReceiver(runCtx, label, method, receiver, undefined);
				return undefined;
			}
			if (JavaString !== null && (receiver instanceof JavaString || receiver instanceof JavaCharSequence)) {
				receiver = String(receiver);
			}
			if (typeof receiver === "string" && STRING_METHODS.indexOf(method) !== -1) {
				if ((method === "replace" || method === "replaceAll") && typeof values[0] !== "string") {
					env.raise("INVALID_EXPRESSION", "replace takes a text pattern in an expression, not a regular expression.", null,
						"Call .replace(search, replacement) with two text arguments, or use the text.replace block with { text, search, replacement, regex: true } in a separate statement.");
				}
				if (method === "replaceAll") {
					var search = String(values[0]), replacement = String(values[1]);
					var parts = receiver.split(search);
					builtText(env, receiver.length + (parts.length - 1) * (replacement.length - search.length), ".replaceAll");
					return parts.join(replacement);
				}
				if (method === "repeat") {
					builtText(env, receiver.length * wholeCount(values[0]), ".repeat");
				} else if ((method === "padStart" || method === "padEnd") && (values[1] === undefined || String(values[1]) !== "")) {
					builtText(env, Number(values[0]), "." + method);
				}
				return String.prototype[method].apply(receiver, values);
			}
			if (Object.prototype.toString.call(receiver) === "[object Array]" && ARRAY_METHODS.indexOf(method) !== -1) {
				if (method === "at") {
					var index = Number(values[0]);
					return dataValue(receiver[index < 0 ? receiver.length + index : index]);
				}
				if (method === "join") {
					builtText(env, joinedLength(receiver, values[0] === undefined ? "," : String(values[0])), ".join");
				}
				return Array.prototype[method].apply(receiver, values);
			}
			if (typeof receiver === "number" && NUMBER_METHODS.indexOf(method) !== -1) {
				return Number.prototype[method].apply(receiver, values);
			}
			var family = STRING_METHODS.indexOf(method) !== -1 ? "text" : ARRAY_METHODS.indexOf(method) !== -1 ? "list"
				: NUMBER_METHODS.indexOf(method) !== -1 ? "number" : "";
			if (family) {
				// a method of another type of value: the error names the type received
				var received = valueKind(receiver);
				env.raise("EXPRESSION_METHOD_TYPE_MISMATCH", method + " is a " + family + " method, " + (label ? "the value of " + label : "the value") +
					" is " + received + (received === "a list" ? " (" + JSON.stringify(receiver).substring(0, 60) + ")" : "") + ".", null,
					methodTypeHint(method, family, received));
			}
			env.raise("INVALID_EXPRESSION", "Unsupported method in an expression: " + method, null,
				"Text: " + STRING_METHODS.join(", ") + ". Lists: " + ARRAY_METHODS.join(", ") + ". Numbers: " +
				NUMBER_METHODS.join(", ") + ". Use a block for anything else.");
		}
		// value[key]: a computed index (local.rows[local.rows.length - 1], local.byId[input.id]) as in JavaScript,
		// null-safe; an index of a text or a list is its position, never one of their functions.
		function indexValue(receiver, key) {
			if (receiver === null || receiver === undefined || key === null || key === undefined) {
				return undefined;
			}
			if (JavaString !== null && (receiver instanceof JavaString || receiver instanceof JavaCharSequence)) {
				receiver = String(receiver);
			}
			if (typeof key === "object" && env && typeof env.jsValue === "function") {
				key = env.jsValue(key);
			}
			var name = String(key);
			if (hiddenName(name)) {
				return undefined;
			}
			if (typeof receiver === "string" || Object.prototype.toString.call(receiver) === "[object Array]") {
				if (name === "length") {
					return receiver.length;
				}
				return /^(?:0|[1-9][0-9]*)$/.test(name) ? (typeof receiver === "string" ? receiver.charAt(Number(name)) || undefined : dataValue(receiver[Number(name)])) : undefined;
			}
			if (typeof receiver !== "object") {
				return undefined;
			}
			return dataValue(receiver[name]);
		}
		function parsePostfix(program) {
			while (peek().type === "member" || peek("[")) {
				if (peek("[")) {
					consume("[");
					var keyProgram = parseExpression();
					consume("]");
					var indexedLabel = program.flowLabel || "";
					program = (function (receiverProgram, indexProgram) {
						return function (runCtx) {
							return indexValue(receiverProgram(runCtx), indexProgram(runCtx));
						};
					})(program, keyProgram);
					program.flowLabel = indexedLabel ? indexedLabel + "[...]" : "";
					continue;
				}
				var member = consume().value;
				var receiverLabel = program.flowLabel || "";
				if (hiddenName(member) && !peek("(")) {
					env.raise("INVALID_EXPRESSION", member + " cannot be read in an expression: " + source, null,
						"constructor, __proto__ and prototype are not data. Read a field of the value instead.");
				}
				if (peek("(")) {
					consume("(");
					var memberArgs = parseArgs();
					consume(")");
					program = (function (receiverProgram, method, argPrograms, label) {
						return function (runCtx) {
							return callMethod(receiverProgram(runCtx), method, runArgs(argPrograms, runCtx), runCtx, label);
						};
					})(program, member, memberArgs, receiverLabel);
					program.flowLabel = receiverLabel ? receiverLabel + "." + member + "()" : "";
				} else {
					program = (function (receiverProgram, name) {
						return function (runCtx) {
							var receiver = receiverProgram(runCtx);
							return receiver === null || receiver === undefined ? undefined : dataValue(receiver[name]);
						};
					})(program, member);
					program.flowLabel = receiverLabel ? receiverLabel + "." + member : "";
				}
			}
			return program;
		}
		function methodProgram(name, args) {
			var index = String(name || "").lastIndexOf(".");
			if (index === -1) {
				return null;
			}
			var receiverPath = name.substring(0, index);
			var method = name.substring(index + 1);
			if (!env.isScopePath(receiverPath)) {
				return null;
			}
			if (["trim", "toLowerCase", "toUpperCase", "includes", "startsWith", "endsWith"].indexOf(method) === -1) {
				if (STRING_METHODS.indexOf(method) === -1 && ARRAY_METHODS.indexOf(method) === -1 && NUMBER_METHODS.indexOf(method) === -1) {
					return null;
				}
				return labelled(function (runCtx) {
					return callMethod(runCtx.read(receiverPath), method, runArgs(args, runCtx), runCtx, receiverPath);
				}, name + "()");
			}
			return labelled(function (runCtx) {
				var receiver = runCtx.read(receiverPath);
				var values = runArgs(args, runCtx);
				if (receiver === null || receiver === undefined) {
					// trim(), toLowerCase() and toUpperCase() give "", the tests false: the value is reported, not refused
					absentReceiver(runCtx, receiverPath, method, receiver,
						method === "trim" || method === "toLowerCase" || method === "toUpperCase" ? "" : false);
				} else if (/^\[object (?:Array|Object)\]$/.test(Object.prototype.toString.call(receiver))) {
					// a list or an object is never read as its text: includes of a list is the one of the list, the
					// text methods name the type received
					return callMethod(receiver, method, values, runCtx, receiverPath);
				}
				if (method === "trim") {
					return fns.trim(receiver);
				}
				if (method === "toLowerCase") {
					return fns.lower(receiver);
				}
				if (method === "toUpperCase") {
					return fns.upper(receiver);
				}
				if (method === "includes") {
					return fns.contains(receiver, values[0]);
				}
				if (method === "startsWith") {
					return fns.startsWith(receiver, values[0]);
				}
				return fns.endsWith(receiver, values[0]);
			}, name + "()");
		}
		function labelled(program, label) {
			program.flowLabel = label;
			return program;
		}
		// A template literal is a text: the texts of its parts and what its expressions give, as a value written as a
		// template literal renders them (null and undefined give "", an object or a list its JSON).
		function templateProgram(token) {
			var parts = token.parts;
			var programs = parts.map(function (part) { return part.expression !== undefined ? compile(part.expression, env) : null; });
			return labelled(function (runCtx) {
				var out = "";
				for (var k = 0; k < parts.length; k++) {
					if (!programs[k]) { out += parts[k].literal; continue; }
					var item = programs[k](runCtx);
					if (item === undefined || item === null) continue;
					out += env.isRuntimeHandle && env.isRuntimeHandle(item) ? JSON.stringify(env.runtimeHandleSummary(item))
						: isStructuredValue(item) ? JSON.stringify(item) : String(item);
				}
				return out;
			}, token.value);
		}
		function parsePrimary() {
			var token = peek();
			if (token.type === "number" || token.type === "string") {
				consume();
				return parsePostfix(constant(token.value));
			}
			if (token.type === "template") {
				consume();
				return parsePostfix(templateProgram(token));
			}
			if (token.type === "id") {
				var name = consume().value;
				if (peek("(")) {
					consume("(");
					var args = parseArgs();
					consume(")");
					if (fns[name]) {
						return parsePostfix(labelled(function (runCtx) {
							return fns[name].apply(NO_THIS, runArgs(args, runCtx));
						}, name + "()"));
					}
					var method = methodProgram(name, args);
					if (method) {
						return parsePostfix(method);
					}
					env.raise("INVALID_EXPRESSION", "Unknown expression function: " + name, null, unknownFunctionHint(name));
				}
				if (name === "true") {
					return constant(true);
				}
				if (name === "false") {
					return constant(false);
				}
				if (name === "null") {
					return constant(null);
				}
				if (name === "undefined") {
					return constant(undefined);
				}
				if (Object.prototype.hasOwnProperty.call(EXPRESSION_CONSTANTS, name)) {
					return parsePostfix(labelled(constant(EXPRESSION_CONSTANTS[name]), name));
				}
				if (env.isScopePath(name)) {
					var parts = String(name).split(".");
					refuseHiddenPath(parts, source, env);
					if (isSimpleScopePath(name, env)) {
						return parsePostfix(labelled(function (runCtx) { return readSimpleScopeParts(runCtx, parts); }, name));
					}
					return parsePostfix(labelled(function (runCtx) { return dataValue(runCtx.read(name)); }, name));
				}
				env.raise("INVALID_EXPRESSION", "Unknown expression identifier: " + name, null, unknownIdentifierHint(name));
			}
			if (peek("(")) {
				consume("(");
				var value = parseExpression();
				consume(")");
				return parsePostfix(value);
			}
			if (peek("[")) {
				return parsePostfix(parseArrayLiteral());
			}
			if (peek("{")) {
				return parseObjectLiteral();
			}
			env.raise("INVALID_EXPRESSION", "Invalid expression near: " + token.value);
		}
		// [a, b] and { key: value, "other key": value }: each evaluation builds a new array or object.
		function parseArrayLiteral() {
			consume("[");
			var items = [];
			while (!peek("]")) {
				items.push(parseExpression());
				if (!peek(",")) {
					break;
				}
				consume(",");
			}
			consume("]");
			return function (runCtx) {
				return runArgs(items, runCtx);
			};
		}
		function parseObjectLiteral() {
			consume("{");
			var keys = [];
			var values = [];
			while (!peek("}")) {
				var key = consume();
				if ((key.type !== "id" || String(key.value).indexOf(".") !== -1) && key.type !== "string" && key.type !== "number") {
					env.raise("INVALID_EXPRESSION", "Invalid object key in expression: " + source, null,
						"Write keys as names or quoted strings: { name: input.name, \"display name\": local.label }.");
				}
				consume(":");
				keys.push(String(key.value));
				values.push(parseExpression());
				if (!peek(",")) {
					break;
				}
				consume(",");
			}
			consume("}");
			return function (runCtx) {
				var out = {};
				for (var i = 0; i < keys.length; i++) {
					ownValue(out, keys[i], values[i](runCtx));
				}
				return out;
			};
		}
		var program = parseExpression();
		if (peek().type !== "eof") {
			var extra = peek();
			env.raise("INVALID_EXPRESSION", "Unexpected " + (extra.type === "string" ? JSON.stringify(extra.value) : String(extra.value)) +
				" in expression: " + source, null, "Write one expression: a value, a path, a call or an operation (local.a + local.b, local.items[0], local.text.trim()).");
		}
		var label = program.flowLabel;
		return labelled(function (runCtx) { return dataValue(program(runCtx)); }, label);
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
			return expressionProgramFor(ctx, source, env)(ctx);
	}

	return {
		isStructuredValue: isStructuredValue,
		renderTemplate: renderTemplate,
		renderValue: renderValue,
		renderTree: renderTree,
		literalValue: literalValue,
		isSimpleScopePath: isSimpleScopePath,
		readSimpleScopePath: readSimpleScopePath,
		compile: compile,
		compileTemplate: compileTree,
		expressionFunctions: expressionFunctions,
		// the methods an expression may call, by type of value (the checks of the sources read them)
		methods: { text: STRING_METHODS.slice(0), list: ARRAY_METHODS.slice(0), number: NUMBER_METHODS.slice(0) },
		tokenize: tokenize,
		// a regular expression literal at a / of a text, with its call and the block to write (the FlowScript parser)
		regularExpressionAdvice: regularExpressionAdvice,
		regularExpressionHint: regularExpressionHint,
		// the tokens of an expression, those of the expressions of its template literals after each of them (a "," between
		// two): what the checks walk to find the paths and the calls of an expression
		flatTokens: flatTokens,
		// compiles without evaluating: unknown functions, methods and identifiers are reported at check time
		parse: function (source, env) { return compileExpressionProgram(null, String(source || ""), env); },
		evaluate: evaluate
	};
}())
