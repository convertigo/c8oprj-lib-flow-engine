(function () {
	// Rewrite references, never string data. Flow expressions are a restricted
	// expression language (not arbitrary JS); templates are lowered separately.
	// Keep spelling/whitespace and do one pass so aliases cannot cascade.
	function rewriteExpressionReferences(expression, replacements) {
		var names = Object.keys(replacements || {}).sort(function (a, b) { return b.length - a.length; });
		if (!names.length) return expression;
		return expression.replace(/"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*/g,
			function (token, offset) {
				if (token.charAt(0) === "`") return rewriteTemplateReferences(token, replacements);
				if (!/^[A-Za-z_$]/.test(token)) return token;
				if (offset && /[A-Za-z0-9_$]/.test(expression.charAt(offset - 1))) return token;
				var before = expression.substring(0, offset).replace(/\s+$/, "");
				if (before.slice(-1) === ".") return token;
				var after = expression.substring(offset + token.length);
				if (/^\s*:/.test(after) && /[{,]$/.test(before)) return token;
				var parts = token.split(/\s*\.\s*/), normalized = parts.join(".");
				for (var i = 0; i < names.length; i++) {
					var name = names[i];
					if (normalized === name || normalized.indexOf(name + ".") === 0) {
						var count = name.split(".").length;
						var prefix = token.match(new RegExp("^[A-Za-z_$][\\w$]*(?:\\s*\\.\\s*[A-Za-z_$][\\w$]*){" + (count - 1) + "}"))[0];
						return replacements[name] + token.substring(prefix.length);
					}
				}
				return token;
			});
	}

	// The ${ expressions } of a template literal of an expression read the locals as the expression does
	// (n > 1 ? `${n} items` : "one"): their names are rewritten, the texts kept.
	function rewriteTemplateReferences(literal, replacements) {
		var out = "", i = 0;
		while (i < literal.length) {
			var ch = literal.charAt(i);
			if (ch === "\\") {
				out += literal.substr(i, 2);
				i += 2;
				continue;
			}
			if (ch === "$" && literal.charAt(i + 1) === "{") {
				var depth = 1, quote = "", k = i + 2;
				for (; k < literal.length; k++) {
					var c = literal.charAt(k);
					if (quote) {
						if (c === "\\") k++;
						else if (c === quote) quote = "";
						continue;
					}
					if (c === "\"" || c === "'") quote = c;
					else if (c === "{") depth++;
					else if (c === "}" && --depth === 0) break;
				}
				if (k >= literal.length) return out + literal.substring(i);
				out += "${" + rewriteExpressionReferences(literal.substring(i + 2, k), replacements) + "}";
				i = k + 1;
				continue;
			}
			out += ch;
			i++;
		}
		return out;
	}

	// Authoring only. Never execute submitted code, guess a block name, or move
	// an operation across a conditional/per-item boundary. The ordinary compiler
	// remains the authority for every transformed source.
	// Called only for an unresolved namespace. A child block call would otherwise
	// fail expression parsing before the existing rich UNKNOWN_BLOCK validation.
	function containsNestedBlockCall(blocks, token) {
		try {
			var options = new Packages.org.mozilla.javascript.CompilerEnvirons();
			options.setLanguageVersion(200);
			var ast = new Packages.org.mozilla.javascript.Parser(options).parse("(" + String(token) + ");", "unknown-block-property", 1), found = false;
			ast.visit(new Packages.org.mozilla.javascript.ast.NodeVisitor({visit:function (node) {
				if (String(node.getClass().getSimpleName()) === "FunctionCall") {
					var name = String(node.getTarget().toSource()).replace(/\s/g, "");
					if (blocks[name] || /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/.test(name) && !/^(input|local|current|result|request|config|trace)\./.test(name)) found = true;
				}
				return !found;
			}}));
			return found;
		} catch (_notExpressionSyntax) { return false; }
	}

	// The functions of the expressions (expressionFunctions of expression-utils.js): calls of them are expressions,
	// never block calls. tests/expression-number-functions.js checks this list against expression-utils.js.
	var EXPRESSION_FUNCTION_NAMES = ["lower", "upper", "trim", "contains", "startsWith", "endsWith",
		"length", "list.length", "text.repeat", "round", "floor", "ceil", "abs", "min", "max", "Math.round", "Math.floor", "Math.ceil",
		"Math.abs", "Math.min", "Math.max", "default", "json", "oneOf", "overlaps", "String", "Number", "Array.isArray",
		"parseInt", "parseFloat", "isNaN", "isFinite", "Number.parseInt", "Number.parseFloat", "Number.isNaN",
		"Number.isFinite", "Number.isInteger", "Math.sqrt", "Math.cbrt", "Math.pow", "Math.exp", "Math.log", "Math.log2",
		"Math.log10", "Math.trunc", "Math.sign", "Math.hypot", "Math.sin", "Math.cos", "Math.tan", "Math.asin",
		"Math.acos", "Math.atan", "Math.atan2"];

	// The JavaScript globals an author writes first, read as calls of unknown blocks: the refusal names the supported equivalent
	var JAVASCRIPT_GLOBAL_EQUIVALENTS = {
		"Object.assign": "the object.merge block (object.merge({ target, source }))",
		"Object.keys": "the object.keys block (object.keys({ source }))",
		"Object.values": "the object.values block (object.values({ source }))",
		"Object.entries": "the object.keys block, then object.get for each key",
		"JSON.stringify": "the json.stringify block",
		"JSON.parse": "the json.parse block (json.safeParse to get an error instead of a failure)",
		"Date.now": "the date.now block",
		"Math.random": "the crypto.random block"
	};

	function javaScriptGlobalEquivalent(name) {
		name = String(name || "");
		if (!Object.prototype.hasOwnProperty.call(JAVASCRIPT_GLOBAL_EQUIVALENTS, name)) {
			return "";
		}
		return name + " is JavaScript, not a Flow block; FlowScript expressions only give lower, upper, trim, contains, startsWith, endsWith, length, round, floor, ceil, abs, min, max, the pure Math functions (Math.sqrt, Math.pow, Math.trunc...), parseInt, parseFloat, isNaN, isFinite, Number.isInteger, Number.isFinite, default, json, oneOf, overlaps, String, Number, the operators and %. Use "
			+ JAVASCRIPT_GLOBAL_EQUIVALENTS[name] + " instead.";
	}

	function unknownBlock(blocks, name, lineNumber, env) {
		var candidates = env.blockCandidates ? env.blockCandidates(blocks, name, 5) : [];
		var decision = env.blockCandidateDecision ? env.blockCandidateDecision(candidates) : {recommendation:"mock",tool:"flow-block-mock",bestBlock:"",bestScore:0,preferExistingScore:140};
		var preferExisting = decision.recommendation === "existing";
		var create = {tool:decision.tool,name:name,block:preferExisting ? decision.bestBlock : name};
		if (preferExisting) create.alternativeTool = "flow-block-mock";
		else if (candidates.length) { create.candidateTool = "flow-block-get"; create.candidateBlock = decision.bestBlock; }
		var error = new Error("Unknown Flow block: " + name + " at line " + lineNumber + ".");
		error.code = "UNKNOWN_BLOCK";
		error.hint = javaScriptGlobalEquivalent(name) || "Inspect the suggested blocks; do not substitute one unless its contract matches the intended behavior.";
		error.details = [{severity:"error", code:"UNKNOWN_BLOCK", line:lineNumber, block:name, message:error.message,
			candidates:candidates, candidateDecision:decision, create:create,
			mock:{tool:"flow-block-mock",name:name,when:"Use this when no suggested block matches the intended domain contract."},
			next:"Inspect a candidate only if its contract matches; otherwise create " + name + " with flow-block-mock, typed properties and typed outputs, then implement the domain block.",
			hint:error.hint}];
		throw error;
	}

	// Rhino bounds a prefix unary node (!x, -x, +x, ~x, typeof x, void x, delete x) by its operand only, and a node that
	// begins with one (a && b, a ? b : c, an expression statement) inherits that start: source sliced by position loses
	// the operator (!a && b() ran as a && b()). The offset of the leftmost token of a node parsed from source as it is;
	// its end, position + length, is exact. Text between an operator and its operand is an error, never a silent change.
	function sourceStart(node, source) {
		var at = Number(node.getAbsolutePosition()), k = String(node.getClass().getSimpleName());
		if (node instanceof Packages.org.mozilla.javascript.ast.InfixExpression) return Math.min(at, sourceStart(node.getLeft(), source));
		if (k === "ConditionalExpression") return Math.min(at, sourceStart(node.getTestExpression(), source));
		if (k === "ExpressionStatement") return Math.min(at, sourceStart(node.getExpression(), source));
		if (k !== "UnaryExpression") return at; // x++ and x-- are UpdateExpression nodes, bounded right
		var op = String(Packages.org.mozilla.javascript.ast.AstNode.operatorToString(node.getOperator()));
		var from = sourceStart(node.getOperand(), source);
		while (from > 0 && /\s/.test(source.charAt(from - 1))) from--;
		if (source.substring(from - op.length, from) !== op) {
			var error = new Error("Text between the operator " + op + " and its operand at line "
				+ source.substring(0, from).split(/\r\n|\r|\n/).length + " cannot be kept in a rewrite.");
			error.code = "FLOWSCRIPT_PREFIX_OPERATOR_LOST";
			throw error;
		}
		return Math.min(at, from - op.length);
	}

	// Rhino bounds a keyword literal (null, true, false, this) followed by another token with that token ("null,",
	// "true)", "false}"), and a node that ends with one (a || null, b: false, c ? 1 : null, !true) inherits that end:
	// source sliced by position takes the next token. The offset just after the last token of a node parsed from
	// source as it is; a keyword literal ends with its keyword.
	function sourceEnd(node, source) {
		var at = Number(node.getAbsolutePosition()), end = at + Number(node.getLength()), k = String(node.getClass().getSimpleName());
		if (k === "KeywordLiteral") {
			var keyword = String(node.toSource());
			return String(source).substring(at, at + keyword.length) === keyword ? at + keyword.length : end;
		}
		var last = node instanceof Packages.org.mozilla.javascript.ast.InfixExpression ? node.getRight()
			: k === "ObjectProperty" ? node.getValue()
			: k === "ConditionalExpression" ? node.getFalseExpression()
			: k === "UnaryExpression" ? node.getOperand()
			: k === "VariableInitializer" ? node.getInitializer()
			: k === "ReturnStatement" ? node.getReturnValue()
			: k === "ExpressionStatement" ? node.getExpression() : null;
		if (!last || Number(last.getAbsolutePosition()) + Number(last.getLength()) !== end) return end;
		var inner = sourceEnd(last, source);
		// an expression statement keeps its semicolon, as Rhino bounds it when its expression ends otherwise
		if (k === "ExpressionStatement" && /^\s*;$/.test(String(source).substring(inner, end))) return end;
		return Math.min(end, inner);
	}

	// The prefix operators of a node, or of source read as statements: a rewrite writes as many as the node it replaces
	// (an operator moved to another statement is lost for its own). null when the source is not JavaScript.
	function prefixOperatorCount(value) {
		var count = 0, visitor = new Packages.org.mozilla.javascript.ast.NodeVisitor({ visit: function (node) {
			if (node instanceof Packages.org.mozilla.javascript.ast.UnaryExpression) count++;
			return true;
		} });
		if (value instanceof Packages.org.mozilla.javascript.ast.AstNode) { value.visit(visitor); return count; }
		var masked = String(value || "").replace(/"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|\b(?:if|try|while|throw)\s*(?=\(\s*\{)/g,
			function (token) { return token.replace(/^(if|try|while|throw)/, function (keyword) { return keyword.charAt(0) + new Array(keyword.length).join("_"); }); });
		try {
			var options = new Packages.org.mozilla.javascript.CompilerEnvirons();
			options.setLanguageVersion(200);
			options.setErrorReporter(new Packages.org.mozilla.javascript.ErrorReporter({
				warning: function () {}, error: function (message) { throw new Error(String(message)); },
				runtimeError: function (message) { return new Packages.org.mozilla.javascript.EvaluatorException(String(message)); }
			}));
			// statements of a function body: a lifted return statement reads as one
			new Packages.org.mozilla.javascript.Parser(options).parse("function __flowPrefixOperators() {\n" + masked + "\n}", "flow-prefix-operators", 1).visit(visitor);
		} catch (_notJavaScript) { return null; }
		return count;
	}

	function correctSource(blocks, source, request, env) {
		source = String(source || "");
		request = request || {};
		var fixes = [], catalogs = Object.create(null), original = source;
		function kind(node) { return node ? String(node.getClass().getSimpleName()) : ""; }
		function start(node) { return sourceStart(node, source); }
		function end(node) { return sourceEnd(node, source); }
		function text(node) { return source.substring(start(node), end(node)); }
		function list(value) {
			var out = [];
			for (var i = 0; value && i < value.size(); i++) out.push(value.get(i));
			return out;
		}
		function visit(root, callback) {
			root.visit(new Packages.org.mozilla.javascript.ast.NodeVisitor({ visit: function (node) {
				return callback(node) !== false;
			} }));
		}
		function line(offset) { return source.substring(0, offset).split(/\r\n|\r|\n/).length; }
		function fix(code, offset, before, after) { fixes.push({ code: code, line: line(offset), before: before, after: after }); }
		// Invariant: the text written for a node keeps its prefix operators. A loss is an error, never a proposal.
		function kept(node, after) {
			if (prefixOperatorCount(node) === prefixOperatorCount(after)) return after;
			var error = new Error("A correction at line " + line(start(node)) + " would not keep every prefix operator (!, -, typeof...).");
			error.code = "FLOWSCRIPT_PREFIX_OPERATOR_LOST";
			error.hint = "Write the statement explicitly; no correction is proposed when an operator could be lost.";
			throw error;
		}
		function fail(node, message) {
			var error = new Error(message + " at line " + line(start(node)) + ".");
			error.code = "FLOWSCRIPT_BLOCK_CALL_UNSAFE_CONTEXT";
			error.hint = "Assign the block explicitly inside the intended branch or iterator, preserving evaluation order.";
			throw error;
		}
		function parse() {
			// Keyword calls (`if`, `try`, `while`, `throw`) are Flow blocks. Mask only
			// that token, outside comments/strings, without changing offsets.
			var masked = source.replace(/"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|\b(?:if|try|while|throw)\s*(?=\(\s*\{)/g,
				function (token) { return token.replace(/^(if|try|while|throw)/, function (keyword) { return keyword.charAt(0) + new Array(keyword.length).join("_"); }); });
			try {
				var options = new Packages.org.mozilla.javascript.CompilerEnvirons();
				options.setLanguageVersion(200);
				options.setRecordingComments(true);
				options.setErrorReporter(new Packages.org.mozilla.javascript.ErrorReporter({
					warning: function () {}, error: function (message) { throw new Error(String(message)); },
					runtimeError: function (message) { return new Packages.org.mozilla.javascript.EvaluatorException(String(message)); }
				}));
				return new Packages.org.mozilla.javascript.Parser(options).parse(masked, "flow-source-corrections", 1);
			} catch (_notJavaScript) {
				// Other supported DSL spellings keep their existing diagnostics;
				// an uncertain parse is never a license to rewrite raw text.
				return null;
			}
		}
		function catalog(name) {
			if (!Object.prototype.hasOwnProperty.call(catalogs, name)) catalogs[name] = name === request.correctingBlock && request.blockContract ? request.blockContract : env.blockCatalog(blocks[name]) || {};
			return catalogs[name];
		}
		function blockName(call) {
			if (kind(call) !== "FunctionCall") return "";
			var name = text(call.getTarget()).replace(/\s/g, "");
			if (/^(input|local|current|result|request|config|trace)(\.|$)/.test(name)) return "";
			return /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(name) && (blocks[name] || name === request.correctingBlock && request.blockContract) ? name : "";
		}
		function jsonType(type) {
			return type === "integer" ? "number" : /^(string|number|boolean|array|object)$/.test(type) ? type
				: type === "requestable" ? "string" : "any";
		}
		function valueType(node) {
			var k = kind(node);
			if (k === "StringLiteral") return "string";
			if (k === "NumberLiteral" || k === "UnaryExpression" && /^(\+|-)/.test(text(node))) return "number";
			if (k === "KeywordLiteral") return /^(true|false)$/.test(text(node)) ? "boolean" : "any";
			if (k === "ObjectLiteral") return "object";
			if (k === "ArrayLiteral") return "array";
			var name = blockName(node), out = name && catalog(name).outputs;
			return out ? jsonType((out.out || out).type) : "any";
		}
		function properties(name) {
			var descriptor = catalog(name), props = descriptor.props || {};
			return Object.keys(props).filter(function (key) {
				var prop = props[key] || {};
				return !prop.hidden && !/^\$\$/.test(key);
			});
		}
		function positionalKeys(name, args) {
			var props = catalog(name).props || {}, keys = properties(name), solutions = [];
			if (!args.length) return [];
			if (args.length > keys.length || args.length > 6 || keys.length > 12 || catalog(name).dynamicProperties) return null;
			function search(index, chosen) {
				if (solutions.length > 1) return;
				if (index === args.length) { solutions.push(chosen.slice()); return; }
				var actual = valueType(args[index]);
				keys.forEach(function (key) {
					var expected = jsonType(props[key].type);
					if (chosen.indexOf(key) < 0 && (actual === "any" || expected === "any" || actual === expected)) {
						chosen.push(key); search(index + 1, chosen); chosen.pop();
					}
				});
			}
			search(0, []);
			return solutions.length === 1 ? solutions[0] : null;
		}
		// Innermost first; reparsing keeps exact ranges when a nested positional
		// call and its parent both need named arguments. The bound is explicit.
		var ast = parse();
		if (!ast) return { code: source, fixes: [] };
		// Metadata repair is isolated from expression/slot repairs. Never run an
		// inner correction against offsets that belong to an enclosing replacement.
		var metadataCalls = [], hasMetadataDeclaration = false;
		visit(ast, function (node) {
			if (kind(node) === "VariableInitializer" && kind(node.getTarget()) === "Name"
					&& String(node.getTarget().getIdentifier()) === "_flow") hasMetadataDeclaration = true;
			if (kind(node) === "FunctionCall" && text(node.getTarget()).replace(/\s/g, "") === "_flow") metadataCalls.push(node);
		});
		function literalMetadata(node) {
			var type = kind(node);
			if (type === "StringLiteral") return true;
			if (type === "NumberLiteral") return isFinite(Number(node.getNumber()));
			if (type === "KeywordLiteral") return /^(true|false|null)$/.test(text(node));
			if (type === "UnaryExpression") return /^[+-]\s*\d/.test(text(node)) && kind(node.getOperand()) === "NumberLiteral" && literalMetadata(node.getOperand());
			if (type === "ArrayLiteral") return list(node.getElements()).every(literalMetadata);
			if (type !== "ObjectLiteral") return false;
			return list(node.getElements()).every(function (field) {
				return ["Name", "StringLiteral"].indexOf(kind(field.getKey())) >= 0 && literalMetadata(field.getValue());
			});
		}
		if (metadataCalls.length) {
			var call = metadataCalls[0], args = list(call.getArguments());
			if (metadataCalls.length !== 1 || hasMetadataDeclaration || args.length !== 1 || kind(args[0]) !== "ObjectLiteral"
					|| kind(call.getParent()) !== "ExpressionStatement" || kind(call.getParent().getParent()) !== "AstRoot"
					|| !literalMetadata(args[0])) return {code:source,fixes:[],unsafeMetadata:true};
			var headerText = text(args[0]), inputEdits = [];
			list(args[0].getElements()).forEach(function (field) {
				var key = field.getKey(), value = field.getValue();
				if ((kind(key) === "Name" ? String(key.getIdentifier()) : String(key.getValue())) !== "inputs" || kind(value) !== "ObjectLiteral") return;
				list(value.getElements()).forEach(function (input) {
					var type = input.getValue();
					if (kind(type) === "StringLiteral" && /^(string|number|integer|boolean|array|object|any)$/.test(String(type.getValue())))
						inputEdits.push({start:start(type)-start(args[0]),end:end(type)-start(args[0]),after:"{ type: " + text(type) + " }"});
				});
			});
			inputEdits.sort(function(a,b){return b.start-a.start;}).forEach(function(edit){headerText=headerText.substring(0,edit.start)+edit.after+headerText.substring(edit.end);});
			var from = start(call), to = end(call), before = text(call), after = kept(call, "const _flow = " + headerText);
			var corrected = source.substring(0,from) + after + source.substring(to);
			if (source.indexOf(before) !== from || source.lastIndexOf(before) !== from
					|| corrected.substring(0,from) !== source.substring(0,from)
					|| corrected.substring(from+after.length) !== source.substring(to)) return {code:source,fixes:[],unsafeMetadata:true};
			fix("FLOWSCRIPT_METADATA_DECLARATION_REQUIRED",from,before,after);
			return {code:corrected,fixes:fixes,metadataEdits:[{line:line(from),oldText:before,newText:after,confidence:1,
				reason:"Declare literal _flow metadata; then revalidate any independent call or slot diagnostics."}]};
		}
		if (request.autoCorrect === true || String(request.autoCorrect || "").toLowerCase() === "true") {
			var slotEdits = [];
			visit(ast, function (call) {
				if (kind(call) !== "FunctionCall") return;
				var name = text(call.getTarget()).replace(/\s/g, "");
				if (name === "i_") name = "if";
				if (!blocks[name]) return;
				var args = list(call.getArguments()), slots = (catalog(name).slots || []).map(function (slot) { return String(slot.name || slot); });
				if (args.length !== 1 || kind(args[0]) !== "ObjectLiteral") return;
				var elements = list(args[0].getElements());
				elements.forEach(function (entry) {
					var keyNode = entry.getKey ? entry.getKey() : entry.getLeft(), value = entry.getValue ? entry.getValue() : entry.getRight();
					var key = kind(keyNode) === "Name" ? String(keyNode.getIdentifier()) : kind(keyNode) === "StringLiteral" ? String(keyNode.getValue()) : "";
					var slot = key.replace(/^\$+/, ""), wanted = "$$" + slot;
					var isSlot = kind(value) === "FunctionNode" && slots.indexOf(slot) >= 0;
					var isAttribute = ["id", "out", "disabled", "comment"].indexOf(slot) >= 0 && !(catalog(name).props || {})[key];
					if ((!isSlot && !isAttribute) || !/^\$+/.test(key) || key === wanted) return;
					if (elements.some(function (other) {
						var otherKey = other.getKey ? other.getKey() : other.getLeft();
						return text(otherKey) === wanted || text(otherKey) === JSON.stringify(wanted);
					})) return;
					slotEdits.push({ start: start(keyNode), end: end(keyNode), before: text(keyNode), after: kind(keyNode) === "StringLiteral" ? JSON.stringify(wanted) : wanted });
				});
			});
			slotEdits.sort(function (a, b) { return b.start - a.start; }).forEach(function (edit) {
				fix("FLOWSCRIPT_SLOT_SIGIL_CORRECTED", edit.start, edit.before, edit.after);
				source = source.substring(0, edit.start) + edit.after + source.substring(edit.end);
			});
			if (slotEdits.length) ast = parse();
		}
		if (request.slotOnly === true) return {code:source,fixes:fixes};
		// Small, explicit contract repairs. This path is used for proposals only;
		// the compiler still rejects the original spelling and keeps the draft intact.
		if (request.contractOnly === true) {
			var contractEdits = [];
			visit(ast, function (call) {
				if (kind(call) !== "FunctionCall") return;
				var name = text(call.getTarget()).replace(/\s/g, ""), args = list(call.getArguments());

				if (name === "JSON.stringify" && args.length === 1) {
					contractEdits.push({start:start(call.getTarget()), end:end(call.getTarget()), before:text(call.getTarget()), after:"json",
						code:"FLOWSCRIPT_JSON_EXPRESSION", reason:"Use the existing pure json(value) expression; it stays in the same lazy branch or item context."});
				}
				if (name !== "list.filter" || !blocks[name] || args.length !== 1 || kind(args[0]) !== "ObjectLiteral") return;
				var props = catalog(name).props || {};
				if (!props.where || props.condition) return;
				var fields = list(args[0].getElements());
				function key(field) { var k = field.getKey(); return kind(k) === "Name" ? String(k.getIdentifier()) : kind(k) === "StringLiteral" ? String(k.getValue()) : ""; }
				if (fields.some(function (field) { return key(field) === "where"; })) return;
				fields.forEach(function (field) {
					if (key(field) !== "condition") return;
					var k = field.getKey();
					contractEdits.push({start:start(k),end:end(k),before:text(k),after:kind(k)==="StringLiteral"?'"where"':"where",
						code:"FLOWSCRIPT_FILTER_PREDICATE",reason:"list.filter declares its per-item predicate as where, not condition."});
				});
			});
			contractEdits.sort(function(a,b){return b.start-a.start;});
			var boundary = source.length;
			if (contractEdits.some(function (edit) {
				var invalid = edit.end > boundary || source.substring(edit.start,edit.end) !== edit.before;
				boundary = edit.start; return invalid;
			})) return {code:original,fixes:[]};
			contractEdits.forEach(function(edit){
				fix(edit.code,edit.start,edit.before,edit.after);
				source=source.substring(0,edit.start)+edit.after+source.substring(edit.end);
			});
			return {code:source,fixes:fixes};
		}
		// Diagnose an unknown vocabulary item before examining nested-call safety.
		// Scope methods and ordinary expression functions are not block names.
		visit(ast, function (node) {
			if (kind(node) !== "FunctionCall") return;
			var name = text(node.getTarget()).replace(/\s/g, "");
			if (!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/.test(name) || /^(input|local|current|result|request|config|trace)\./.test(name) || blockName(node)) return;
			// Math.max(1, 2) and list.length(x) are expression functions, as the run reads them
			if (EXPRESSION_FUNCTION_NAMES.indexOf(name) !== -1) return;
			unknownBlock(blocks, name, line(start(node)), env);
		});
		for (var pass = 0; pass < 128; pass++) {
			var calls = [];
			visit(ast, function (node) { if (blockName(node)) calls.push(node); });
			var changed = false;
			calls.sort(function (a, b) { return start(b) - start(a); });
			for (var c = 0; c < calls.length; c++) {
				var call = calls[c], name = blockName(call), args = list(call.getArguments());
				if (args.length === 1 && kind(args[0]) === "ObjectLiteral") continue;
				var keys = positionalKeys(name, args);
				if (keys === null) {
					var signatureError = new Error("Positional arguments do not uniquely identify the properties of " + name + " at line " + line(start(call)) + ".");
					signatureError.code = "FLOWSCRIPT_INVALID_BLOCK_CALL_SIGNATURE";
					signatureError.hint = "Use named properties: " + name + "({ " + properties(name).join(", ") + " }). No positional property order is assumed.";
					throw signatureError;
				}
				var before = text(call), after = before;
				// Insert names around the existing arguments, keeping comments,
				// whitespace and trailing commas exactly where the author put them.
				for (var argumentIndex = args.length - 1; argumentIndex >= 0; argumentIndex--) {
					var argumentOffset = start(args[argumentIndex]) - start(call);
					after = after.substring(0, argumentOffset) + JSON.stringify(keys[argumentIndex]) + ": " + after.substring(argumentOffset);
				}
				var open = end(call.getTarget());
				while (/\s/.test(source.charAt(open)) || source.substr(open, 2) === "/*" || source.substr(open, 2) === "//") {
					if (source.substr(open, 2) === "/*") open = source.indexOf("*/", open + 2) + 2;
					else if (source.substr(open, 2) === "//") { while (open < source.length && !/[\r\n]/.test(source.charAt(open))) open++; }
					else open++;
				}
				open -= start(call);
				after = after.substring(0, after.length - 1) + "})";
				after = after.substring(0, open + 1) + "{" + after.substring(open + 1);
				fix("FLOWSCRIPT_BLOCK_ARGUMENTS_NAMED", start(call), before, kept(call, after));
				source = source.substring(0, start(call)) + after + source.substring(end(call));
				changed = true; break;
			}
			if (!changed) break;
			ast = parse();
			if (!ast) return { code: original, fixes: [] };
		}
		var statements = [], edits = [], names = Object.create(null), sequence = 0;
		visit(ast, function (node) {
			if (kind(node) === "Name") names[String(node.getIdentifier())] = true;
			if (/^(ExpressionStatement|ReturnStatement|VariableDeclaration)$/.test(kind(node))) statements.push(node);
		});
		function temporary() {
			var name;
			do { name = "autoBlock" + (++sequence); } while (names[name] || source.indexOf(name) >= 0);
			names[name] = true; return "local." + name;
		}
		statements.forEach(function (statement) {
			if (kind(statement.getParent()) !== "Block" && kind(statement.getParent()) !== "Scope") return;
			var calls = [], direct = null, expression = kind(statement) === "ExpressionStatement" ? statement.getExpression() : null;
			if (kind(expression) === "Assignment") direct = expression.getRight();
			if (kind(expression) === "FunctionCall") direct = expression;
			if (kind(statement) === "VariableDeclaration") {
				var declarations = list(statement.getVariables());
				if (declarations.length === 1) direct = declarations[0].getInitializer();
			}
			visit(statement, function (node) {
				if (kind(node) === "FunctionNode") return false;
				if (blockName(node) && node !== direct) calls.push(node);
			});
			calls = calls.filter(function (call) {
				for (var parent = call.getParent(); parent && parent !== statement; parent = parent.getParent()) {
					if (kind(parent) !== "ObjectProperty" || kind(parent.getParent().getParent()) !== "FunctionCall") continue;
					var outer = parent.getParent().getParent(), name = blockName(outer);
					var key = text(parent.getKey()).replace(/^["']|["']$/g, "");
					var prop = name && (catalog(name).props || {})[key];
					// Existing inline list projections already execute per element.
					// Other lazy contexts keep the compiler's explicit diagnostic.
					if (prop && prop.current) return false;
				}
				return true;
			});
			if (!calls.length) return;
			var replacements = [], prefix = [];
			function replaced(node) {
				var value = text(node), offset = start(node);
				replacements.filter(function (replacement) { return replacement.start >= offset && replacement.end <= end(node); })
					.sort(function (a, b) { return b.start - a.start; }).forEach(function (replacement) {
						value = value.substring(0, replacement.start - offset) + replacement.value + value.substring(replacement.end - offset);
					});
				return value;
			}
			calls.sort(function (a, b) { return end(a) - end(b) || start(b) - start(a); });
			calls.forEach(function (call) {
				var parent = call.getParent();
				while (parent && parent !== statement) {
					var k = kind(parent);
					if (k === "ConditionalExpression" || k === "InfixExpression" && /^(\&\&|\|\||\?\?)$/.test(String(Packages.org.mozilla.javascript.ast.AstNode.operatorToString(parent.getOperator())))) {
						fail(call, "A block in a conditional expression cannot be lifted unconditionally");
					}
					if (k === "FunctionCall" && !blockName(parent)) fail(call, "A block nested in an expression call requires an explicit intermediate");
					if (k === "ObjectProperty" && kind(parent.getParent().getParent()) === "FunctionCall") {
						var outer = parent.getParent().getParent(), outerName = blockName(outer), key = text(parent.getKey()).replace(/^["']|["']$/g, "");
						var prop = outerName && (catalog(outerName).props || {})[key];
						if (prop && (prop.current || prop.kind === "literal" || prop.kind === "text" || prop.kind === "path")) fail(call, "A block inside a lazy or literal property cannot be lifted");
						if (list(parent.getParent().getElements()).some(function (field) { return text(field.getKey()).replace(/^["']|["']$/g, "") === "$$disabled"; })) fail(call, "A nested block cannot be moved ahead of its parent's disabled guard");
					}
					parent = parent.getParent();
				}
				// Earlier reads may observe values changed by the lifted block.
				// Refuse rather than silently changing their evaluation order.
				visit(statement, function (node) {
					if (kind(node) === "FunctionNode") return false;
					if (start(node) >= start(call)) return false;
					if (expression && kind(expression) === "Assignment" && start(node) >= start(expression.getLeft()) && end(node) <= end(expression.getLeft())) return false;
					if (replacements.some(function (replacement) { return start(node) >= replacement.start && end(node) <= replacement.end; })) return false;
					if (kind(node) === "Name" && /^(input|local|current|result|request|config|trace)$/.test(String(node.getIdentifier()))) fail(call, "An earlier scope read could change if the block were lifted");
				});
				var destination = temporary();
				prefix.push(destination + " = " + replaced(call));
				// Keep only the maximal replacement span, after its children have
				// been used to build the intermediate node's arguments.
				replacements = replacements.filter(function (replacement) { return replacement.start < start(call) || replacement.end > end(call); });
				replacements.push({ start: start(call), end: end(call), value: destination });
			});
			var before = text(statement), indent = source.substring(0, start(statement)).split(/\r\n|\r|\n/).pop().match(/^\s*/)[0];
			var after = kept(statement, prefix.join("\n" + indent) + "\n" + indent + replaced(statement));
			fix("FLOWSCRIPT_BLOCK_CALL_LIFTED", start(statement), before, after);
			edits.push({ start: start(statement), end: end(statement), value: after });
		});
		edits.sort(function (a, b) { return b.start - a.start; }).forEach(function (edit) {
			source = source.substring(0, edit.start) + edit.value + source.substring(edit.end);
		});
		ast = parse();
		if (!ast) return { code: original, fixes: [] };
		// Infer only constraints actually present in contracts or member reads.
		// Unconstrained/conflicting reads use any: adding a declaration must not
		// introduce a guessed coercion, a required flag or a default value.
		var inputSchemas = Object.create(null), inputItems = Object.create(null), header = null, headerName = request.blockMode ? "_meta" : "_flow";
		function propertyName(node) { return kind(node) === "Name" ? String(node.getIdentifier()) : kind(node) === "StringLiteral" ? String(node.getValue()) : ""; }
		function field(object, name) {
			if (kind(object) !== "ObjectLiteral") return null;
			return list(object.getElements()).filter(function (entry) { return propertyName(entry.getKey()) === name; })[0] || null;
		}
		function constrain(name, type) {
			var previous = inputSchemas[name];
			if (!previous) inputSchemas[name] = { type: type };
			else if (type !== "any" && previous.type !== type) {
				if (previous.type === "any" && !previous.conflict) previous.type = type;
				else { previous.type = "any"; previous.conflict = true; }
			}
		}
		visit(ast, function (node) {
			if (kind(node) === "VariableInitializer" && kind(node.getTarget()) === "Name" && String(node.getTarget().getIdentifier()) === headerName && kind(node.getParent().getParent()) === "AstRoot") header = node.getInitializer();
			var k = kind(node), input = k === "PropertyGet" ? node.getTarget() : k === "ElementGet" ? node.getTarget() : null;
			if (!input || kind(input) !== "Name" || String(input.getIdentifier()) !== "input") return;
			var name = k === "PropertyGet" ? String(node.getProperty().getIdentifier()) : kind(node.getElement()) === "StringLiteral" ? String(node.getElement().getValue()) : "";
			if (!name) return;
			var type = "any", parent = node.getParent();
			if (kind(parent) === "Assignment" && parent.getLeft() === node && String(Packages.org.mozilla.javascript.ast.AstNode.operatorToString(parent.getOperator())) === "=") return;
			if (kind(parent) === "PropertyGet" && parent.getTarget() === node && String(parent.getProperty().getIdentifier()) !== "length" && !(kind(parent.getParent()) === "FunctionCall" && parent.getParent().getTarget() === parent)) type = "object";
			if (kind(parent) === "ElementGet" && parent.getTarget() === node) type = kind(parent.getElement()) === "NumberLiteral" ? "array" : "object";
			if (kind(parent) === "ObjectProperty" && parent.getValue() === node) {
				var outer = parent.getParent().getParent(), nameOfBlock = blockName(outer), descriptor = nameOfBlock && (catalog(nameOfBlock).props || {})[propertyName(parent.getKey())];
				if (descriptor) type = descriptor.type === "integer" ? "integer" : jsonType(descriptor.type);
				if (descriptor && descriptor.type === "array") {
					var itemTypes = [];
					list(parent.getParent().getElements()).forEach(function (property) {
						var sibling = (catalog(nameOfBlock).props || {})[propertyName(property.getKey())];
						if (!sibling || !sibling.current || sibling.sourceProperty !== propertyName(parent.getKey())) return;
						visit(property.getValue(), function (read) {
							if (kind(read) === "FunctionNode") return false;
							if (kind(read) !== "PropertyGet" || kind(read.getTarget()) !== "Name" || String(read.getTarget().getIdentifier()) !== "current") return;
							if (kind(read.getParent()) === "FunctionCall" && read.getParent().getTarget() === read) return;
							if (String(read.getProperty().getIdentifier()) !== "length") itemTypes.push("object");
						});
					});
					if (itemTypes.length) inputItems[name] = {type:"object"};
				}
			}
			constrain(name, type);
		});
		var inputsField = field(header, request.blockMode ? "properties" : "inputs") || field(header, request.blockMode ? "props" : "input");
		var inputs = inputsField && inputsField.getValue(), declared = request.blockMode && request.declaredProperties || {};
		var missing = Object.keys(inputSchemas).filter(function (name) { return !field(inputs, name) && !(!inputs && Object.prototype.hasOwnProperty.call(declared, name)); }).sort();
		if (missing.length && (!header || kind(header) === "ObjectLiteral") && (!inputs || kind(inputs) === "ObjectLiteral")) {
			var members = missing.map(function (name) {
				var schema = { type: inputSchemas[name].type };
				if (schema.type === "array") schema.items = inputItems[name] || { type: "any" };
				if (request.blockMode) schema.kind = "value";
				return JSON.stringify(name) + ": " + JSON.stringify(schema);
			});
			if (!inputs) Object.keys(declared).reverse().forEach(function (name) {
				members.unshift(JSON.stringify(name) + ": " + JSON.stringify(declared[name]));
			});
			var offset, addition;
			function append(object, value) {
				var entries = list(object.getElements());
				offset = entries.length ? end(entries[entries.length - 1]) : start(object) + 1;
				addition = (entries.length ? ", " : " ") + value;
			}
			if (inputs) append(inputs, members.join(", "));
			else if (header) append(header, JSON.stringify(request.blockMode ? "properties" : "inputs") + ": { " + members.join(", ") + " }");
			else { offset = 0; addition = "const " + headerName + " = { " + JSON.stringify(request.blockMode ? "properties" : "inputs") + ": { " + members.join(", ") + " } }\n"; }
			fix(request.blockMode ? "FLOW_BLOCK_INPUT_DECLARED" : "FLOWSCRIPT_INPUT_DECLARED", offset, "", addition);
			source = source.substring(0, offset) + addition + source.substring(offset);
		}
		return { code: source, fixes: fixes };
	}

	function create(env) {
		function flowScriptDefaultLiteral(value) {
			if (value === undefined) {
				return "";
			}
			if (typeof value === "string") {
				return JSON.stringify(value);
			}
			if (value === null || typeof value === "number" || typeof value === "boolean") {
				return String(value);
			}
			return JSON.stringify(value);
		}

		function flowScriptSignatureKey(key, prop) {
			prop = prop || {};
			if (Object.prototype.hasOwnProperty.call(prop, "default")) {
				return key + "??" + flowScriptDefaultLiteral(prop.default);
			}
			if (prop.optional === true || String(prop.description || "").match(/\boptional\b/i)) {
				return key + "?";
			}
			return key;
		}

		function flowScriptBlockInputKeys(blocks, block) {
			var descriptor = env.blockCatalog(blocks && blocks[block]) || {};
			var props = descriptor.props || {};
			return Object.keys(props).filter(function (key) {
				return key !== "id" && key !== "comment" && key !== "out";
			}).map(function (key) {
				return flowScriptSignatureKey(key, props[key]);
			});
		}

		function flowScriptBlockSignature(blocks, block) {
			var keys = flowScriptBlockInputKeys(blocks, block);
			return block + "({ " + keys.join(", ") + " })";
		}

		function raiseFlowScriptBlockSignature(blocks, block, original, lineNumber) {
			var signature = flowScriptBlockSignature(blocks, block);
			var equivalent = javaScriptGlobalEquivalent(block);
			env.raise("FLOWSCRIPT_INVALID_BLOCK_CALL_SIGNATURE",
				"Invalid FlowScript block call signature at line " + lineNumber + ": " + original,
				null,
				equivalent || "Catalog blocks take one object of named properties. Review the suggested patch or write " + signature + ". Signature keys use key for required values, key? for optional values, and key??default when a default exists.");
		}

		function normalizeObjectLiteralWhitespace(text) {
			text = String(text || "");
			var quote = "";
			var out = "";
			for (var i = 0; i < text.length; i++) {
				var ch = text.charAt(i);
				if (quote) {
					out += ch;
					if (ch === "\\" && i + 1 < text.length) {
						out += text.charAt(++i);
					} else if (ch === quote) {
						quote = "";
					}
				} else if (ch === "\"" || ch === "'" || ch === "`") {
					quote = ch;
					out += ch;
				} else {
					out += ch === "\t" ? "  " : ch;
				}
			}
			return out;
		}

		function parseFlowScriptArgs(text, lineNumber) {
			text = String(text || "").trim();
			if (text === "") {
				return {};
			}
			try {
				return env.normalizeTree(env.parseYamlSource(normalizeObjectLiteralWhitespace(text), "{}"));
			} catch (e) {
				var error = new Error("Invalid FlowScript argument object at line " + lineNumber + ": " + e.message);
				error.code = "FLOWSCRIPT_INVALID_ARGUMENTS";
				error.details = {
					line: lineNumber,
					expected: "Use an object literal such as { path: \"result.value\", value: local.value }."
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
			var scan = flowScriptBalanceScan(null, text);
			return { paren: scan.paren, brace: scan.brace, bracket: scan.bracket };
		}

		// The balance of `previous` text followed by `text`, scanning only `text`: a statement
		// read line by line is scanned once, not once per line.
		function flowScriptBalanceScan(previous, text) {
			var scan = previous
				? { paren: previous.paren, brace: previous.brace, bracket: previous.bracket,
					inString: previous.inString, quote: previous.quote, escaped: false }
				: { paren: 0, brace: 0, bracket: 0, inString: false, quote: "", escaped: false };
			// an escape that ended the previous text skips the first character of this one
			var i = previous && previous.escaped && text.length ? 1 : 0;
			for (; i < text.length; i++) {
				var ch = text.charAt(i);
				if (scan.inString) {
					if (ch === "\\") {
						if (i + 1 < text.length) {
							i++;
						} else {
							scan.escaped = true;
						}
					} else if (ch === scan.quote) {
						scan.inString = false;
					}
					continue;
				}
				if (ch === "\"" || ch === "'" || ch === "`") {
					scan.inString = true;
					scan.quote = ch;
				} else if (ch === "(") {
					scan.paren++;
				} else if (ch === ")") {
					scan.paren--;
				} else if (ch === "{") {
					scan.brace++;
				} else if (ch === "}") {
					scan.brace--;
				} else if (ch === "[") {
					scan.bracket++;
				} else if (ch === "]") {
					scan.bracket--;
				}
			}
			return scan;
		}
	
		function flowScriptStatementComplete(text, knownBalance) {
			text = String(text || "").trim().replace(/^[A-Za-z_$][\w$]*\s*:\s*/, "");
			if (text === "") {
				return true;
			}
			if (text.match(/^(flow|function)\s+/) || flowScriptBlockSeparator(text)) {
				return true;
			}
			if (/\s(?:&&|\|\||===?|!==?|<=?|>=?|[+*\/%?:=-])$/.test(text)) return false;
			var balance = knownBalance || flowScriptBalance(text);
			if (balance.paren === 0 && balance.bracket === 0 && balance.brace === 1 &&
					text.match(/^[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*\s*\(.*\)\s*\{\s*;?$/)) {
				return true;
			}
			if (balance.paren === 0 && balance.bracket === 0 && balance.brace === 1 &&
					text.match(/^if\s*\([\s\S]*\)\s*\{\s*;?$/)) {
				return true;
			}
			if (balance.paren <= 0 && balance.brace <= 0 && balance.bracket <= 0) {
				return !!(text.match(/;\s*$/) ||
					text.match(/^import\s+/) ||
					text.match(/^(return|throw)(?:\s|;|$)/) ||
					text.match(/^(const|let|var)\s+/) ||
					text.match(/^(local|result|parent)\.[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])*\s*=/) ||
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
	
		// Top-level `;` ends a statement, as in JavaScript: `var a = f({...}); result.a = a`
		// on one line is two statements. Separators inside strings, (), {} and []
		// belong to the statement (object literals, slot bodies, templates).
		function splitFlowScriptStatementText(statement) {
			var text = statement.text;
			var parts = [];
			var start = 0;
			var quote = "";
			var depth = 0;
			for (var i = 0; i < text.length; i++) {
				var ch = text.charAt(i);
				if (quote) {
					if (ch === "\\" && i + 1 < text.length) {
						i++;
					} else if (ch === quote) {
						quote = "";
					}
				} else if (ch === "\"" || ch === "'" || ch === "`") {
					quote = ch;
				} else if (ch === "(" || ch === "{" || ch === "[") {
					depth++;
				} else if (ch === ")" || ch === "}" || ch === "]") {
					depth--;
				} else if (ch === ";" && depth === 0) {
					parts.push({ offset: start, text: text.substring(start, i + 1) });
					start = i + 1;
				}
			}
			if (text.substring(start).trim() !== "") {
				parts.push({ offset: start, text: text.substring(start) });
			} else if (parts.length) {
				parts[parts.length - 1].text += text.substring(start);
			}
			if (parts.length <= 1) {
				return [statement];
			}
			return parts.map(function (part) {
				var leading = part.text.match(/^\s*/)[0];
				return {
					line: statement.line + (text.substring(0, part.offset) + leading).split("\n").length - 1,
					text: part.text.trim(),
					disabled: statement.disabled
				};
			}).filter(function (part) {
				return part.text !== "" && part.text !== ";";
			});
		}

		// The statements of a source; firstLine is the line of the source its first line is (a function body is
		// numbered from the line of its brace, so that a diagnostic names the line of the file).
		function flowScriptStatements(code, firstLine) {
			var base = typeof firstLine === "number" && firstLine > 0 ? firstLine : 1;
			var out = [];
			var pending = null;
			var disabledNext = false;
			// an if (cond) alone on its line, waiting for the statement that is its body
			var bareIf = null;
			var comments = [], commentLine = 0, blankBefore = false;
			function flushComments() {
				if (comments.length) { out.push({line:commentLine, text:"", commentNode:comments.join("\n"), blankBefore:blankBefore}); comments = []; blankBefore = false; }
			}
			function emit(statement) {
				// the reading state stays here
				statement = { line: statement.line, text: statement.text, disabled: statement.disabled };
				var first = out.length;
				if (comments.length && flowScriptBlockSeparator(statement.text)) flushComments();
				splitFlowScriptStatementText(statement).forEach(function (part) {
					pushStatement(part);
				});
				if (out[first]) {
					if (comments.length) out[first].comment = comments.join("\n");
					if (blankBefore) out[first].blankBefore = true;
				}
				comments = []; blankBefore = false;
			}
			function pushStatement(part) {
				if (bareIf) {
					var opener = bareIf;
					bareIf = null;
					if (flowScriptBlockBoundary(part.text) || inlineFlowScriptIfHead(part.text) === "bare") {
						bareFlowScriptIfWithoutBody(opener);
					}
					out.push({ line: opener.line, text: opener.text.trim() + " {", disabled: opener.disabled });
					pushStatement(part);
					out.push({ line: part.line, text: "}", disabled: false });
					return;
				}
				var labelHead = part.text.match(/^([A-Za-z_$][\w$]*\s*:\s*)([\s\S]+)$/);
				var head = inlineFlowScriptIfHead(labelHead ? labelHead[2] : part.text);
				if (head === "bare") {
					// if (cond); has an empty body in JavaScript: the next statement would not be conditional
					if (/;\s*$/.test(part.text)) {
						bareFlowScriptIfWithoutBody(part);
					}
					bareIf = part;
					return;
				}
				if (head === "inline") {
					var expandedPart = labelHead ? Object.assign({}, part, {text: labelHead[2]}) : part;
					inlineFlowScriptIfStatements(expandedPart).forEach(function (statement, rank) {
						if (rank === 0 && labelHead) statement.text = labelHead[1] + statement.text;
						out.push(statement);
					});
					return;
				}
				out.push(part);
			}
			String(code || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").forEach(function (raw, index) {
				if (!pending && raw.trim() === "// @flow-disabled") {
					disabledNext = true;
					return;
				}
				if (!pending && /^\s*\/\//.test(raw)) {
					if (!comments.length) commentLine = index + base;
					comments.push(raw.replace(/^\s*\/\/ ?/, ""));
					return;
				}
				var line = stripFlowScriptComment(raw).trim();
				var currentWrite = line.match(/^current(?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])+\s*(?:[+\-*\/%]?=(?!=)|\+\+|--)/);
				if (currentWrite) {
					env.raise("FLOWSCRIPT_WRITE_SCOPE_UNSUPPORTED", "Cannot write " + currentWrite[0].replace(/\s*(?:[+\-*\/%]?=|\+\+|--)$/, "")
						+ " at line " + (index + base) + ".", null,
						"current is read-only in an iterator. Build a new value with list.map, or update a declared local/result collection with json.put or json.push.");
				}
				if (line === "" && !pending) {
					if (index !== 0) { flushComments(); blankBefore = true; }
					return;
				}
				if (!pending && (line.match(/^(flow|function)\s+/) || flowScriptBlockSeparator(line))) {
					emit({ line: index + base, text: line, disabled: disabledNext });
					disabledNext = false;
					return;
				}
				if (pending) {
					var beforeClose = pending.balance;
					if (flowScriptBlockSeparator(line) &&
							pending.text.match(/^if\s*\(/) && !pending.text.match(/^if\s*\(\s*\{/)
							&& (beforeClose.paren > 0 || beforeClose.bracket > 0)) {
						env.raise("FLOWSCRIPT_UNBALANCED_SYNTAX", "Unbalanced FlowScript statement at line " + pending.line
							+ ": missing " + flowScriptMissingGroupClosers(beforeClose) + " before line " + (index + base),
							null, "Close the current statement before writing the next one.");
					}
					pending.text += "\n" + raw;
					pending.balance = flowScriptBalanceScan(pending.balance, "\n" + line);
					if (flowScriptStatementComplete(pending.text, pending.balance)) {
						emit(pending);
						pending = null;
					}
					return;
				}
				pending = { line: index + base, text: line, disabled: disabledNext, balance: flowScriptBalanceScan(null, line) };
				disabledNext = false;
				if (flowScriptStatementComplete(pending.text, pending.balance)) {
					emit(pending);
					pending = null;
				}
			});
			if (pending) {
				var problem = flowScriptBalanceProblem(pending.balance);
				if (problem) {
					env.raise("FLOWSCRIPT_UNBALANCED_SYNTAX", "Unbalanced FlowScript statement at line " + pending.line + ": " + problem,
						null, "Close the current statement before writing the next one.");
				}
				emit(pending);
			}
			if (bareIf) {
				bareFlowScriptIfWithoutBody(bareIf);
			}
			flushComments();
			out = expandFlowScriptElseIf(out);
			// The generated id of a native if keeps the line counted from the start of its function, as before
			// diagnostics named the lines of the file: learned schemas and traces stay attached to it. An if written in
			// the body of an if on the same line gets the rank of that if on its line, so that both ids stay distinct.
			var ifsOnLine = {};
			out.forEach(function (statement) {
				statement.idLine = statement.line - base + 1;
				if (/^if\s*\(/.test(statement.text)) {
					var rank = ifsOnLine[statement.idLine] = (ifsOnLine[statement.idLine] || 0) + 1;
					if (rank > 1) {
						statement.idLine = statement.idLine + "_" + rank;
					}
				}
			});
			return out;
		}

		// A line that closes a block and may open the next one: }, } else { and } else if (cond) {.
		function flowScriptBlockSeparator(text) {
			text = String(text || "").trim();
			return text === "}" || text === "};" || /^}\s*else\s*\{\s*;?$/.test(text) || isFlowScriptElseIf(text);
		}

		function isFlowScriptElseIf(text) {
			text = String(text || "").trim();
			if (!/^}\s*else\s+if\s*\(/.test(text) || !/\{\s*;?$/.test(text)) {
				return false;
			}
			var balance = flowScriptBalance(text);
			return balance.paren === 0 && balance.bracket === 0 && balance.brace === 0;
		}

		// } else if (cond) { reads as } else { if (cond) {, as in JavaScript: the inner if is the whole else branch, so
		// the } that closes the last branch of the chain closes each if of it.
		function expandFlowScriptElseIf(statements) {
			if (!statements.some(function (statement) { return isFlowScriptElseIf(statement.text); })) {
				return statements;
			}
			var expanded = [];
			var frames = [];
			statements.forEach(function (statement) {
				var text = statement.text;
				if (isFlowScriptElseIf(text)) {
					expanded.push({ line: statement.line, text: "} else {", disabled: false });
					expanded.push({ line: statement.line, text: text.replace(/^}\s*else\s+/, "").replace(/\s*\{\s*;?$/, "") + " {", disabled: statement.disabled });
					frames.push({ chained: true });
					return;
				}
				expanded.push(statement);
				if (text === "}" || text === "};") {
					var frame = frames.pop();
					while (frame && frame.chained) {
						expanded.push({ line: statement.line, text: "}", disabled: false });
						frame = frames.pop();
					}
				} else if (!/^}/.test(text) && /\{\s*;?$/.test(text) && flowScriptBalance(text).brace > 0) {
					frames.push({ chained: false });
				}
			});
			return expanded;
		}

		// "bare" for if (cond) alone, "inline" for an if followed by its body on the same statement (if (cond) { ... },
		// if (cond) statement), "" otherwise (not an if, or the if (cond) { that opens a body written on the next lines).
		function inlineFlowScriptIfHead(text) {
			var head = String(text || "").match(/^if\s*\(/);
			if (!head) {
				return "";
			}
			var close = balancedFlowScriptGroupEnd(text, head[0].length - 1, "(", ")");
			// if ({ condition, $$then: function () { ... } }) is the call of the block if, not an if statement
			if (close < 0 || isFlowScriptObjectLiteral(text.substring(head[0].length, close))) {
				return "";
			}
			var after = text.substring(close + 1).trim();
			if (after === "" || after === ";") {
				return "bare";
			}
			return /^\{\s*;?$/.test(after) ? "" : "inline";
		}

		function flowScriptBlockBoundary(text) {
			text = String(text || "").trim();
			return text === "}" || text === "};" || /^}\s*else\b/.test(text) ||
				/\{\s*;?$/.test(text) && flowScriptBalance(text).brace > 0;
		}

		function bareFlowScriptIfWithoutBody(statement) {
			env.raise("FLOWSCRIPT_UNSUPPORTED_SYNTAX", "if without a body at line " + statement.line + ": " + statement.text,
				null, "Write the body of the if in braces: if (" + "condition) { ... }, the opening brace on the line of the if.");
		}

		// An if written with its body on the same statement (if (cond) { ... }, if (cond) statement, with else { ... },
		// else statement or else if ...) reads as the same if written on several lines: its line, the statements of its
		// body, then } (or } else { followed by the else body and }). Anything written after the closing brace on that
		// line follows the if. A bare return in such a body is then a return of the body, as on several lines (the next
		// item in a loop body).
		function inlineFlowScriptIfStatements(statement) {
			var text = statement.text;
			var out = [];
			function lineAt(offset) {
				return statement.line + text.substring(0, offset).split("\n").length - 1;
			}
			function skipSpaces(offset) {
				while (offset < text.length && /\s/.test(text.charAt(offset))) {
					offset++;
				}
				return offset;
			}
			// the body of a branch at offset: { statements } or one statement up to the end; the offset after it
			function branch(offset) {
				var start = skipSpaces(offset);
				if (text.charAt(start) === "{") {
					var end = balancedFlowScriptGroupEnd(text, start, "{", "}");
					if (end < 0) {
						env.raise("FLOWSCRIPT_UNBALANCED_SYNTAX", "Unbalanced FlowScript statement at line " + statement.line + ": missing }",
							null, "Close the body of the if with }.");
					}
					flowScriptStatements(text.substring(start + 1, end), lineAt(start)).forEach(function (part) {
						out.push(part);
					});
					return end + 1;
				}
				flowScriptStatements(text.substring(start), lineAt(start)).forEach(function (part) {
					out.push(part);
				});
				return text.length;
			}
			var close = balancedFlowScriptGroupEnd(text, text.indexOf("("), "(", ")");
			out.push({ line: statement.line, text: text.substring(0, close + 1) + " {", disabled: statement.disabled });
			var offset = branch(close + 1);
			var rest = text.substring(offset);
			var elseMatch = rest.match(/^\s*else\b/);
			if (elseMatch) {
				out.push({ line: lineAt(offset + elseMatch[0].length), text: "} else {", disabled: false });
				offset = branch(offset + elseMatch[0].length);
				rest = text.substring(offset);
			}
			out.push({ line: lineAt(offset), text: "}", disabled: false });
			if (rest.replace(/^[\s;]+/, "") !== "") {
				flowScriptStatements(rest, lineAt(offset)).forEach(function (part) {
					out.push(part);
				});
			}
			return out;
		}
	
		function stripFlowScriptSemicolon(text) {
			return String(text || "").trim().replace(/;\s*$/, "").trim();
		}
	
		function splitFlowScriptTopLevel(text, separator, firstOnly) {
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
					// An object field owns only its first colon. Later colons
					// belong to the expression and must not be trimmed/rejoined.
					if (firstOnly) break;
				}
			}
			var last = text.substring(start).trim();
			if (last !== "") {
				out.push(last);
			}
			return out;
		}
	
		// One string literal: the quote that opens it closes it at the very end, so "a" + x + "b"
		// is an expression, not the string a" + x + "b.
		function isFlowScriptQuoted(text) {
			text = String(text || "").trim();
			var quote = text.charAt(0);
			if (text.length < 2 || (quote !== "\"" && quote !== "'") || text.charAt(text.length - 1) !== quote) {
				return false;
			}
			for (var i = 1; i < text.length - 1; i++) {
				var ch = text.charAt(i);
				if (ch === "\\") {
					i++;
				} else if (ch === quote) {
					return false;
				}
			}
			return true;
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
			// The escapes of JavaScript, for both quotes: JSON.parse used to read the double-quoted ones and gave the
			// raw text back for \' \x41 \0 \v, a few replacements read the single-quoted ones and dropped \r and \u.
			var read = env.templateSyntax.unescape(text.substring(1, text.length - 1));
			if (read.error) {
				flowScriptInvalidEscape(text, read.error);
			}
			return read.value;
		}

		function flowScriptInvalidEscape(literal, message, lineNumber) {
			env.raise("FLOWSCRIPT_INVALID_ESCAPE", "Invalid escape in " + literal + (lineNumber ? " at line " + lineNumber : "") + ": " + message,
				null, "Use the escapes of JavaScript: \\n, \\r, \\t, \\\\, \\\", \\', \\uXXXX (\\uFEFF), \\u{...} or \\xHH.");
		}
	
		function isFlowScriptObjectLiteral(text) {
			text = String(text || "").trim();
			return text.charAt(0) === "{" && text.charAt(text.length - 1) === "}";
		}

		function flowScriptObjectLiteralFromExpressionToken(token) {
			token = String(token || "").trim();
			if (isFlowScriptQuoted(token)) {
				token = unquoteFlowScriptString(token).trim();
			}
			if (token.charAt(0) === "(" && token.charAt(token.length - 1) === ")") {
				token = token.substring(1, token.length - 1).trim();
			}
			return isFlowScriptObjectLiteral(token) ? token : "";
		}
	
		function isFlowScriptArrayLiteral(text) {
			text = String(text || "").trim();
			return text.charAt(0) === "[" && text.charAt(text.length - 1) === "]";
		}
	
		function parseFlowScriptObjectLiteral(text, lineNumber, staticMetadata) {
			// Argument corrections preserve comments. Parse them as trivia, not
			// as part of a property name; never touch quoted business text.
			var originalObjectText = String(text || "").trim();
			text = String(text || "").replace(/"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g,
				function (token) { return token.charAt(0) === "/" ? token.replace(/[^\r\n]/g, " ") : token; });
			var leadingLines = (text.match(/^\s*/)[0].match(/\n/g) || []).length;
			text = text.trim();
			if (!isFlowScriptObjectLiteral(text)) {
				env.raise("FLOWSCRIPT_INVALID_OBJECT", "Expected object literal at line " + lineNumber + ": " + text);
			}
			var body = text.substring(1, text.length - 1);
			var tokens = Object.create(null);
			function addToken(key, token) {
				if (Object.prototype.hasOwnProperty.call(tokens, key)) {
					env.raise("FLOWSCRIPT_DUPLICATE_PROPERTY", "Duplicate property '" + key + "' at line " + lineNumber + ".",
						null, "Keep one value per property; an earlier value must not be silently overwritten.");
				}
				tokens[key] = token;
			}
			splitFlowScriptTopLevel(body, ",").forEach(function (part) {
				var pair = splitFlowScriptTopLevel(part, ":", true);
				if (pair.length < 2) {
					if (staticMetadata) metadataLiteralError(lineNumber);
					var shorthand = String(part || "").trim();
					if (shorthand.match(/^[A-Za-z_$][\w$]*$/)) {
						addToken(shorthand, shorthand);
						return;
					}
					// The method shorthand of JavaScript, $$then() { ... }, is the function it abbreviates:
					// $$then: function () { ... }. Any other entry was dropped without a word, its body never ran.
					var method = shorthand.match(/^(async\s+)?([A-Za-z_$][\w$]*)\s*\(/);
					if (method) {
						addToken(method[2], (method[1] ? "async " : "") + "function " + shorthand.substring(method[0].length - 1));
						return;
					}
					if (shorthand !== "") {
						env.raise("FLOWSCRIPT_UNSUPPORTED_SYNTAX", "Unsupported entry in an object at line " + lineNumber + ": " + shorthand,
							null, "Write each entry as key: value; a slot takes a function body, for example $$then: function () { ... }.");
					}
					return;
				}
				var keyToken = pair.shift().trim();
				var key = staticMetadata && isFlowScriptQuoted(keyToken)
					? parseFlowScriptMetadataValue(keyToken, lineNumber) : unquoteFlowScriptString(keyToken);
				if (staticMetadata && !isFlowScriptQuoted(keyToken) && !/^[A-Za-z_$][\w$]*$/.test(keyToken)) metadataLiteralError(lineNumber);
				addToken(key, pair[0]);
			});
			// Source keys come from the JS-like grammar, never YAML's whitespace-
			// sensitive mapping grammar ({id:5} must mean the same as {id: 5}).
			var value = Object.create(null);
			Object.keys(tokens).forEach(function (key) {
				var literal = staticMetadata ? parseFlowScriptMetadataValue(tokens[key], lineNumber)
					: flowScriptLiteralTokenValue(tokens[key], lineNumber);
				value[key] = literal === undefined ? tokens[key] : literal;
			});
			// The line of each function entry (a slot body), when lineNumber is the line the literal starts on: the
			// statements of the body are numbered from the file, as those of the main function.
			var tokenLines = Object.create(null);
			if (!staticMetadata) {
				Object.keys(tokens).forEach(function (key) {
					var token = String(tokens[key]).trim();
					var at = isFlowScriptFunctionLiteral(token) ? text.indexOf(token) : -1;
					if (at >= 0) {
						tokenLines[key] = lineNumber + leadingLines + (text.substring(0, at).match(/\n/g) || []).length;
					}
				});
			}
			Object.keys(tokens).forEach(function (key) {
				var token = String(tokens[key]).trim();
				if (!isFlowScriptFunctionLiteral(token)) return;
				var offset = text.indexOf(token);
				if (offset >= 0) tokens[key] = originalObjectText.substring(offset, offset + token.length);
			});
			return {
				value: value,
				tokens: tokens,
				tokenLines: tokenLines
			};
		}

		function metadataLiteralError(lineNumber) {
			env.raise("FLOWSCRIPT_METADATA_LITERAL_REQUIRED", "Metadata requires literal data at line " + lineNumber + ".",
				null, "Use quoted strings, finite numbers, booleans, null, arrays or objects. Put dynamic computations in Flow nodes, not _flow/_meta.");
		}

		function parseFlowScriptMetadataValue(token, lineNumber) {
			token = String(token || "").trim();
			if (isFlowScriptObjectLiteral(token)) return parseFlowScriptObjectLiteral(token, lineNumber, true).value;
			if (isFlowScriptArrayLiteral(token)) return splitFlowScriptTopLevel(token.slice(1, -1), ",").map(function (item) {
				return parseFlowScriptMetadataValue(item, lineNumber);
			});
			if (isFlowScriptQuoted(token)) {
				var quote = token.charAt(0), value = "";
				var escapes = { "n": "\n", "r": "\r", "t": "\t", "b": "\b", "f": "\f", "v": "\v", "0": "\0", "\\": "\\", "\"": "\"", "'": "'", "/": "/" };
				for (var i = 1; i < token.length - 1; i++) {
					var ch = token.charAt(i);
					if (ch === quote || ch === "\n" || ch === "\r") metadataLiteralError(lineNumber);
					if (ch === "\\") {
						var escaped = token.charAt(++i);
						if (i >= token.length - 1) metadataLiteralError(lineNumber);
						if (escaped === "u" || escaped === "x") {
							var size = escaped === "u" ? 4 : 2, hex = token.substr(i + 1, size);
							if (hex.length !== size || !/^[0-9a-fA-F]+$/.test(hex)) metadataLiteralError(lineNumber);
							value += String.fromCharCode(parseInt(hex, 16)); i += size;
						} else if (Object.prototype.hasOwnProperty.call(escapes, escaped)) {
							if (escaped === "0" && /[0-9]/.test(token.charAt(i + 1))) metadataLiteralError(lineNumber);
							value += escapes[escaped];
						} else metadataLiteralError(lineNumber);
					} else value += ch;
				}
				return value;
			}
			var scalar = flowScriptLiteralTokenValue(token, lineNumber);
			if (scalar === undefined || (typeof scalar === "number" && !isFinite(scalar))) metadataLiteralError(lineNumber);
			return scalar;
		}
	
		function flowScriptPropKind(blocks, block, key) {
			var descriptor = env.blockCatalog(blocks && blocks[block]) || {};
			var prop = descriptor.props && descriptor.props[key];
			if (!prop && (descriptor.dynamicProperties === true || descriptor.additionalProperties)) {
				prop = descriptor.additionalProperties || {};
			}
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
			// Physical continuation lines are whitespace; literals and comment boundaries stay intact.
			expr = expr.replace(/"(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*'|`(?:[^`\\]|\\[\s\S])*`|\/\/[^\r\n]*(?:\r?\n|$)|\/\*[\s\S]*?\*\/|[ \t]*\r?\n[ \t]*/g,
				function(token) { return token.indexOf("\n") >= 0 && /^[ \t\r\n]+$/.test(token) ? " " : token; });
			var exact = env.templateSyntax.exactExpression(expr);
			if (exact !== null) {
				expr = exact;
			}
			var replacements = Object.create(null);
			Object.keys(locals || {}).forEach(function (name) {
				replacements[name] = locals[name] === true ? "local." + name : String(locals[name] || ("local." + name));
			});
			return rewriteExpressionReferences(expr, replacements);
		}
	
		function flowScriptExpressionFromToken(token, locals) {
			token = String(token || "").trim();
			if (isFlowScriptQuoted(token)) {
				token = unquoteFlowScriptString(token);
			}
			return flowScriptRewriteExpression(token, locals);
		}
	
		// The value of an expression property. A quoted string is text there too, as in JavaScript: it is kept as the
		// string literal it is (day: "2025-12-14" used to be read as the expression 2025-12-14, that is 1999). The
		// check reports a quoted text that reads a scope (where: "current.active"), the former spelling of an expression.
		function flowScriptExpressionPropertyFromToken(token, locals, lineNumber) {
			if (isFlowScriptArrayLiteral(token) || isFlowScriptObjectLiteral(token)) {
				return flowScriptValueFromToken(token, locals, lineNumber);
			}
			if (isFlowScriptQuoted(token)) {
				unquoteFlowScriptString(token);
				return String(token).trim();
			}
			return flowScriptExpressionFromToken(token, locals);
		}

		function flowScriptPathFromToken(token, locals) {
			token = String(token || "").trim();
			if (isFlowScriptQuoted(token)) {
				token = unquoteFlowScriptString(token);
			}
			token = flowScriptRewriteExpression(token, locals);
			if (env.isScopePath(token)) {
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

		function flowScriptSelectorPathFromToken(token, locals) {
			token = String(token || "").trim();
			if (isFlowScriptQuoted(token)) {
				return unquoteFlowScriptString(token);
			}
			if (isFlowScriptTemplateLiteral(token)) {
				return flowScriptTemplateLiteralToTemplate(token, locals, 0);
			}
			return flowScriptRewriteExpression(token, locals);
		}

		function flowScriptObjectPathSelector(token, locals) {
			var expr = flowScriptRewriteExpression(token, locals);
			if (!env.isScopePath(expr)) {
				return null;
			}
			var parts = env.objectPathParts ? env.objectPathParts(expr) : String(expr).split(".");
			if (parts.length < 2) {
				return null;
			}
			var source = parts[0] + "." + parts[1];
			var path = String(expr).substring(source.length);
			if (path.charAt(0) === ".") {
				path = path.substring(1);
			}
			return {
				source: source,
				path: path
			};
		}

		function singleFlowScriptInputProp(blocks, block) {
			var descriptor = env.blockCatalog(blocks && blocks[block]) || {};
			var props = descriptor.props || {};
			var keys = Object.keys(props).filter(function (key) {
				return key !== "id" && key !== "comment" && key !== "out" && !(props[key] || {}).hidden;
			});
			return keys.length === 1 ? keys[0] : "";
		}

		function primaryFlowScriptInputProp(blocks, block) {
			var single = singleFlowScriptInputProp(blocks, block);
			if (single) {
				return single;
			}
			var descriptor = env.blockCatalog(blocks && blocks[block]) || {};
			var props = descriptor.props || {};
			var names = ["value", "text", "message", "source", "items", "url", "input", "request", "body", "path"];
			for (var i = 0; i < names.length; i++) {
				var name = names[i];
				if (props[name] && !props[name].hidden) {
					return name;
				}
			}
			return "";
		}
	
		function flowScriptLiteralTokenValue(token, lineNumber) {
			token = String(token || "").trim();
			if (isFlowScriptTemplateLiteral(token)) {
				return undefined;
			}
			if (isFlowScriptQuoted(token)) {
				return unquoteFlowScriptString(token);
			}
			if (isFlowScriptObjectLiteral(token)) {
				return parseFlowScriptObjectLiteral(token, lineNumber).value;
			}
			if (isFlowScriptArrayLiteral(token)) {
				return splitFlowScriptTopLevel(token.substring(1, token.length - 1), ",").map(function (item) {
					var value = flowScriptLiteralTokenValue(item, lineNumber);
					return value === undefined ? item : value;
				});
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
			if (token.match(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/) || token.match(/^0[xX][0-9a-fA-F]+$/)) {
				return Number(token);
			}
			return undefined;
		}
	
		function flowScriptValueObjectFromToken(token, locals, lineNumber) {
			if (!isFlowScriptObjectLiteral(token)) {
				return undefined;
			}
			var out = Object.create(null);
			naturalFlowScriptObjectFields(token).forEach(function (field) {
				if (Object.prototype.hasOwnProperty.call(out, field.key)) {
					env.raise("FLOWSCRIPT_DUPLICATE_PROPERTY", "Duplicate property '" + field.key + "' at line " + lineNumber + ".",
						null, "Keep one value per property; an earlier value must not be silently overwritten.");
				}
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
			var parts = [];
			var out = "";
			for (var i = 0; i < body.length; i++) {
				var ch = body.charAt(i);
				if (ch === "\\") {
					var sequence = env.templateSyntax.escapeSequence(body, i);
					if (sequence.error) {
						flowScriptInvalidEscape(token, sequence.error, lineNumber);
					}
					out += sequence.value;
					i = sequence.end - 1;
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
						env.raise("FLOWSCRIPT_INVALID_TEMPLATE_LITERAL", "Unclosed template literal expression at line " + lineNumber + ": " + token);
					}
					var expression = body.substring(start, i).trim();
					if (out !== "") {
						parts.push({ literal: out });
						out = "";
					}
					parts.push({ expression: flowScriptRewriteExpression(expression, locals) });
					continue;
				}
				out += ch;
			}
			if (out !== "") {
				parts.push({ literal: out });
			}
			return env.templateSyntax.compose(parts);
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
			if (typeof literal === "string") {
				// A quoted string is a literal text: its ${ stay text. The {{ expression }} of former sources are
				// still read as expressions until every source is migrated.
				return env.templateSyntax.map(literal, function (expression) {
					return flowScriptRewriteExpression(expression, locals);
				}, true);
			}
			if (literal !== undefined) {
				return literal;
			}
			return flowScriptExpressionTemplate(token, locals, lineNumber);
		}

		// A value written as an expression becomes a ${expression} evaluated at run time. Expressions do not call
		// blocks: a block call (date.now({})) inside one is refused here.
		function flowScriptExpressionTemplate(token, locals, lineNumber) {
			var expression = flowScriptRewriteExpression(token, locals);
			// "${}" is not an expression: at run time it is the text "${}". Never lower an empty value silently.
			if (!String(expression).trim()) {
				env.raise("FLOWSCRIPT_EXPRESSION_EMPTY", "Empty FlowScript value at line " + lineNumber + ".",
					null, "Write the value to use, such as local.value, a quoted text or null.");
			}
			var call = nestedBlockCall(expression);
			// i.test( after the closing slash of /^T-[0-9]+$/i is the end of a regular expression literal, not a block
			// call: the expression check reports the literal
			if (call && expression.indexOf("/" + call + "(") === -1) {
				env.raise("FLOWSCRIPT_EXPRESSION_UNSUPPORTED", "Unsupported FlowScript expression at line " + lineNumber + ": " + String(token).trim(),
					null, call === "JSON.stringify"
						? "Use the pure json(value) expression to serialize JSON data inside a condition or projection; it takes one value and no replacer. Review the proposed patch."
						: "This context cannot contain a block call. Assign the block to a local in the same branch or iterator, then read that result. In list.map.select or list.filter.where, keep current inside a per-item block or an explicit forEach; never hoist it outside the iteration.");
			}
			return "${" + expression.trim() + "}";
		}

		// The first call of a dotted name that is not a scope path (a block such as date.now), outside strings.
		function nestedBlockCall(text) {
			var quote = "";
			for (var i = 0; i < text.length; i++) {
				var ch = text.charAt(i);
				if (quote) {
					if (ch === "\\") {
						i++;
					} else if (ch === quote) {
						quote = "";
					}
					continue;
				}
				if (ch === "\"" || ch === "'" || ch === "`") {
					quote = ch;
					continue;
				}
				var name = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+(?=\s*\()/.exec(text.substring(i));
				if (name && (i === 0 || !/[\w$.]/.test(text.charAt(i - 1)))) {
					var root = name[0].split(".")[0];
					// Math.floor(...) and the other expression functions are not blocks
					if (!env.isScopePath(root) && FLOWSCRIPT_EXPRESSION_FUNCTIONS.indexOf(name[0]) === -1) {
						return name[0];
					}
					i += name[0].length - 1;
				}
			}
			return null;
		}

		// A text property takes the literal written in the source: a scope path there would be kept as
		// the text "input.name" instead of its value.
		function flowScriptTextFromToken(blocks, block, key, token, lineNumber) {
			var text = String(token || "").trim();
			if (!isFlowScriptQuoted(text) && /^(input|local|config|current|result|session|item)(\.|\[|$)/.test(text)) {
				env.raise("FLOWSCRIPT_TEXT_PROPERTY_PATH", "Property " + key + " of " + block + " takes a literal text, not the value of " + text + " (line " + lineNumber + ")",
					null, block === "throw" && key === "code"
						? "An error code is a constant the callers test: write one throw per code (if (...) { throw({ code: \"ORDER_LATE\", ... }) }), and put what varies in message (a template) or details (evaluated values)."
						: "Write a quoted literal, or use a block whose property accepts a value.");
			}
			return unquoteFlowScriptString(token);
		}
	
		// Engine attributes ($$id, $$disabled, $$comment, $$out) stay on the node;
		// every other attribute is a business value stored in node.props.
		function normalizeNaturalFlowScriptProps(blocks, block, parsed, locals, lineNumber, imports) {
			// Resolve namespace vocabulary before parsing its property expressions.
			// Passive checks use this path too and must not run source corrections.
			if (!blocks[block] && /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/.test(block) && !/^(input|local|current|result|request|config|trace)\./.test(block) && Object.keys(parsed.tokens || {}).some(function (key) { return containsNestedBlockCall(blocks, parsed.tokens[key]); })) unknownBlock(blocks, block, lineNumber, env);
			var codec = env.sourceAttributeNameCodec();
			var node = {};
			var propertyTokens = Object.create(null);
			Object.keys(parsed.tokens || {}).forEach(function (spelling) {
				var attr = codec.resolve(spelling, ["id", "disabled", "comment", "out"]);
				var token = parsed.tokens[spelling];
				if (attr.namespace === "property") {
					propertyTokens[attr.name] = token;
					return;
				}
				var value = flowScriptLiteralTokenValue(token, lineNumber);
				var expected = attr.name === "disabled" ? "boolean" : "string";
				if (typeof value !== expected || (attr.name === "id" && !value.length)) {
					env.raise("FLOW_SOURCE_ENGINE_ATTRIBUTE_TYPE", "Expected a literal " + expected + " for " + spelling + " at line " + lineNumber);
				}
				node[attr.name] = value;
			});
			node.props = normalizeNaturalFlowScriptPropertyBag(blocks, block, propertyTokens, locals, lineNumber, imports);
			return node;
		}

		function inlineProjection(blocks, imports, token, locals, lineNumber) {
			var call = parseNaturalFlowScriptCall(token);
			if (call && blocks[resolveFlowScriptName(call.name,imports || {})]) {
				var name = resolveFlowScriptName(call.name,imports || {}), args = call.args.trim() === "" ? ["{}"] : splitFlowScriptTopLevel(call.args,",");
				if (args.length !== 1 || !isFlowScriptObjectLiteral(args[0])) raiseFlowScriptBlockSignature(blocks,name,token,lineNumber);
				var node = normalizeNaturalFlowScriptNode(blocks,imports,locals,name,parseFlowScriptObjectLiteral(args[0],lineNumber),lineNumber);
				if (Object.keys(node).some(function (key) { return ["props","id","comment","disabled","out","__flowExplicitId"].indexOf(key) < 0; })) env.raise("FLOW_SOURCE_INLINE_METADATA_UNSUPPORTED","A projection block cannot carry child slots at line " + lineNumber);
				var result = {__flowBlock:name,properties:node.props}, metadata = {};
				["id","comment","disabled","out"].forEach(function (key) { if (node[key] !== undefined) metadata[key] = node[key]; });
				if (Object.keys(metadata).length) result.metadata = metadata;
				return result;
			}
			if (isFlowScriptObjectLiteral(token)) {
				var out = {};
				naturalFlowScriptObjectFields(token).forEach(function (field) { Object.defineProperty(out,field.key,{value:inlineProjection(blocks,imports,field.token,locals,lineNumber),enumerable:true,writable:true,configurable:true}); });
				return out;
			}
			return flowScriptValueFromToken(token,locals,lineNumber);
		}

		function normalizeNaturalFlowScriptPropertyBag(blocks, block, tokens, locals, lineNumber, imports) {
			var args = {};
			Object.keys(tokens).forEach(function (key) {
				var kind = flowScriptPropKind(blocks, block, key);
				if (block === "list.map" && key === "select" && containsNestedBlockCall(blocks,tokens[key])) {
					args[key] = inlineProjection(blocks,imports,tokens[key],locals,lineNumber);
				} else if (kind === "expression") {
					args[key] = flowScriptExpressionPropertyFromToken(tokens[key], locals, lineNumber);
				} else if (kind === "path") {
					args[key] = propertyPathFromToken(blocks, block, key, tokens[key], locals, lineNumber);
				} else if (kind === "template" || kind === "value") {
					args[key] = flowScriptValueFromToken(tokens[key], locals, lineNumber);
				} else if (kind === "schema") {
					args[key] = parseFlowScriptMetadataValue(tokens[key], lineNumber);
				} else if (kind === "text" || kind === "secret") {
					args[key] = flowScriptTextFromToken(blocks, block, key, tokens[key], lineNumber);
				} else if (kind === "binding") {
					args[key] = flowScriptValueFromToken(tokens[key], locals, lineNumber);
				} else {
					args[key] = flowScriptFixedValueFromToken(tokens[key], locals, lineNumber);
				}
			});
			return args;
		}

		function foldConfigUseOverrides(blocks, block, node) {
			if (block !== "config.use" || !node.props) {
				return node;
			}
			var descriptor = env.blockCatalog(blocks && blocks[block]) || {};
			var props = descriptor.props || {};
			var slots = {};
			flowScriptBlockSlotNames(blocks, block).forEach(function (slot) {
				slots[slot] = true;
			});
			var bag = node.props;
			var overrides = env.normalizeTree(bag.overrides || {});
			Object.keys(bag).forEach(function (key) {
				if (key === "overrides" || slots[key] || props[key]) {
					return;
				}
				overrides[key] = bag[key];
				delete bag[key];
			});
			if (Object.keys(overrides).length) {
				bag.overrides = overrides;
			}
			return node;
		}

		function propertyPathFromToken(blocks, block, key, token, locals, lineNumber) {
			var catalog = env.blockCatalog(blocks && blocks[block]) || {};
			if (env.destinationContract.isWriteProperty(catalog, key)) {
				// Literal destinations must round-trip exactly, including invalid ones:
				// do not turn false into local.false or strip ${} from a template.
				var literal = flowScriptLiteralTokenValue(token, lineNumber);
				if (literal === undefined) {
					literal = isFlowScriptTemplateLiteral(token) || isFlowScriptObjectLiteral(token) || isFlowScriptArrayLiteral(token)
						? flowScriptValueFromToken(token, locals, lineNumber) : flowScriptPathFromToken(token, locals);
				}
				var checked = env.destinationContract.validate(literal);
				if (!checked.valid) {
					var hint = "Use a static named destination such as local.value. For computed grouping, build an array of groups {key, items} or use json.map/json.put instead of local.map[current.key].";
					try { env.raise(checked.code, key + " at line " + lineNumber + ": " + checked.message, null, hint); }
					catch (error) {
						error.details = [{severity:"error",phase:"parse",code:checked.code,line:lineNumber,block:block,property:key,message:error.message,hint:hint}];
						throw error;
					}
				}
				return literal;
			}
			return flowScriptPathFromToken(token, locals);
		}

		function flowScriptPropertyValueFromToken(blocks, block, key, token, locals, lineNumber) {
			var kind = flowScriptPropKind(blocks, block, key);
			if (kind === "expression") {
				return flowScriptExpressionPropertyFromToken(token, locals, lineNumber);
			}
			if (kind === "path") {
				return propertyPathFromToken(blocks, block, key, token, locals, lineNumber);
			}
			if (kind === "template" || kind === "value") {
				return flowScriptValueFromToken(token, locals, lineNumber);
			}
			if (kind === "schema") return parseFlowScriptMetadataValue(token, lineNumber);
			if (kind === "text" || kind === "secret") {
				return flowScriptTextFromToken(blocks, block, key, token, lineNumber);
			}
			if (kind === "binding") {
				return flowScriptValueFromToken(token, locals, lineNumber);
			}
			return flowScriptFixedValueFromToken(token, locals, lineNumber);
		}

		// A fixed property (literal, select, number...) takes a quoted string as written, ${ included; other values
		// (expressions, former {{ }} templates, objects) read as dynamic values.
		function flowScriptFixedValueFromToken(token, locals, lineNumber) {
			var literal = flowScriptLiteralTokenValue(token, lineNumber);
			if (typeof literal === "string" && !isFlowScriptObjectLiteral(String(token).trim()) && literal.indexOf("{{") === -1) {
				return literal;
			}
			return flowScriptValueFromToken(token, locals, lineNumber);
		}

		function flowScriptBlockSlotNames(blocks, block) {
			var descriptor = env.blockCatalog(blocks && blocks[block]) || {};
			var out = [];
			(descriptor.slots || []).forEach(function (slot) {
				if (slot && typeof slot === "object") {
					if (slot.name) {
						out.push(String(slot.name));
					}
					(slot.aliases || []).forEach(function (alias) {
						out.push(String(alias));
					});
				} else if (slot) {
					out.push(String(slot));
				}
			});
			return out;
		}

		function flowScriptFunctionLiteralBody(token, lineNumber) {
			token = String(token || "").trim();
			var match = token.match(/^function(?:\s+[A-Za-z_$][\w$]*)?\s*\(/);
			// An arrow function with a block body is a slot function too: $$then: () => { ... }.
			var arrow = match ? null : token.match(/^(?:\(|[A-Za-z_$][\w$]*\s*=>)/);
			if (!match && !arrow) {
				return null;
			}
			var bodyStart;
			if (match || arrow[0] === "(") {
				var openParen = match ? token.indexOf("(", match[0].length - 1) : 0;
				var closeParen = balancedFlowScriptGroupEnd(token, openParen, "(", ")");
				if (closeParen < 0) {
					env.raise("FLOWSCRIPT_UNBALANCED_SYNTAX", "Unbalanced FlowScript slot function at line " + lineNumber,
						null, "Close the function argument list before the slot body.");
				}
				bodyStart = closeParen + 1;
				if (!match) {
					var arrowMark = token.substring(bodyStart).match(/^\s*=>/);
					if (!arrowMark) return null;
					bodyStart += arrowMark[0].length;
				}
			} else {
				bodyStart = arrow[0].length;
			}
			while (bodyStart < token.length && /\s/.test(token.charAt(bodyStart))) {
				bodyStart++;
			}
			if (token.charAt(bodyStart) !== "{") {
				return null;
			}
			var bodyEnd = env.balancedObjectEnd(token, bodyStart);
			if (bodyEnd < 0) {
				env.raise("FLOWSCRIPT_UNBALANCED_SYNTAX", "Unbalanced FlowScript slot function body at line " + lineNumber,
					null, "Close the slot function body with }.");
			}
			if (token.substring(bodyEnd + 1).trim() !== "") {
				env.raise("FLOWSCRIPT_UNSUPPORTED_SYNTAX", "Unsupported text after FlowScript slot function at line " + lineNumber + ": " + token.substring(bodyEnd + 1).trim(),
					null, "Use then: function () { ... } as the complete slot value.");
			}
			return token.substring(bodyStart + 1, bodyEnd);
		}

		function isFlowScriptFunctionLiteral(token) {
			token = String(token || "").trim();
			return /^(?:async\s+)?function\b/.test(token) || /^(?:\([^()]*\)|[A-Za-z_$][\w$]*)\s*=>/.test(token);
		}

		// Plain names are business properties. A function literal is never a
		// business value: it is a slot written without its $$ prefix (or a typo)
		// and would otherwise be stored as text and never run.
		function rejectFlowScriptFunctionProperties(block, slotNames, tokens, lineNumber) {
			var codec = env.sourceAttributeNameCodec();
			Object.keys(tokens || {}).forEach(function (key) {
				var decoded = codec.decode(key);
				if (decoded.namespace !== "property" || !isFlowScriptFunctionLiteral(tokens[key])) {
					return;
				}
				var slotSpelling = slotNames.indexOf(key) !== -1 ? codec.encode("engine", key) : "";
				if (slotSpelling) {
					env.raise("FLOWSCRIPT_SLOT_WITHOUT_ENGINE_PREFIX",
						"Slot \"" + key + "\" of Flow block " + block + " is written without its $$ prefix at line " + lineNumber + ".",
						null,
						"Slots are written " + slotSpelling + ": function () { ... }. Plain names are business properties.");
				}
				env.raise("FLOWSCRIPT_FUNCTION_IN_PROPERTY",
					"Property \"" + key + "\" of Flow block " + block + " receives a function at line " + lineNumber + ".",
					null,
					slotNames.length
						? "Only slots take a function body; " + block + " slots are written " + slotNames.map(function (slot) {
							return codec.encode("engine", slot);
						}).join(", ") + "."
						: block + " has no slot; pass a value or an expression.");
			});
		}

		// A function body under a $$ name the block does not declare as a slot ($$each on forEach):
		// name the slots it has instead of the bare unknown engine attribute.
		function rejectFlowScriptUnknownSlots(block, slotNames, tokens, lineNumber) {
			var codec = env.sourceAttributeNameCodec();
			Object.keys(tokens || {}).forEach(function (key) {
				var decoded = codec.decode(key);
				if (decoded.namespace !== "engine" || slotNames.indexOf(decoded.name) !== -1 || !isFlowScriptFunctionLiteral(tokens[key])) {
					return;
				}
				env.raise("FLOW_SOURCE_ENGINE_ATTRIBUTE_UNKNOWN", "Flow block " + block + " has no slot " + key + " at line " + lineNumber + ".", null,
					slotNames.length
						? block + " slots are written " + slotNames.map(function (slot) { return codec.encode("engine", slot) + ": function () { ... }"; }).join(", ") + "."
						: block + " has no slot; run the following nodes after it.");
			});
		}

		function extractFlowScriptInlineSlots(blocks, imports, locals, block, parsed, lineNumber) {
			var slotNames = flowScriptBlockSlotNames(blocks, block);
			rejectFlowScriptFunctionProperties(block, slotNames, parsed.tokens, lineNumber);
			rejectFlowScriptUnknownSlots(block, slotNames, parsed.tokens, lineNumber);
			if (!slotNames.length) {
				return { parsed: parsed, slots: {} };
			}
			var slotMap = Object.create(null);
			slotNames.forEach(function (slot) {
				if (["id", "disabled", "comment", "out", "block", "type", "uid", "props"].indexOf(slot) !== -1) {
					env.raise("FLOW_SOURCE_SLOT_NAME_CONFLICT", "Slot " + slot + " conflicts with structural AST storage for " + block + ".");
				}
				slotMap[env.sourceAttributeNameCodec().encode("engine", slot)] = slot;
			});
			var parsedValue = env.normalizeTree(parsed.value || {});
			var parsedTokens = Object.assign({}, parsed.tokens || {});
			var slots = {};
			Object.keys(parsedTokens).forEach(function (key) {
				if (!slotMap[key]) {
					return;
				}
				var body = flowScriptFunctionLiteralBody(parsedTokens[key], lineNumber);
				if (body === null) {
					env.raise("FLOWSCRIPT_INVALID_SLOT", "Invalid inline slot \"" + key + "\" for Flow block " + block + " at line " + lineNumber + ".",
						null, "Use " + key + ": function () { ... } inside the block argument object.");
				}
				// The body starts after the brace of the function; its lines are those of the file (a diagnostic in a loop
				// body named the line counted from that body).
				var token = String(parsedTokens[key]).trim();
				var tokenLine = parsed.tokenLines ? parsed.tokenLines[key] : undefined;
				var bodyLine = typeof tokenLine === "number"
					? tokenLine + (token.substring(0, token.length - 1 - body.length).match(/\n/g) || []).length : undefined;
				slots[slotMap[key]] = parseFlowScriptBodyNodes(blocks, imports || {}, Object.assign({}, locals || {}), body, bodyLine);
				delete parsedValue[key];
				delete parsedTokens[key];
			});
			return {
				parsed: {
					value: parsedValue,
					tokens: parsedTokens
				},
				slots: slots
			};
		}

		function normalizeNaturalFlowScriptNode(blocks, imports, locals, block, parsed, lineNumber) {
			var extracted = extractFlowScriptInlineSlots(blocks, imports, locals, block, parsed, lineNumber);
			var node = normalizeNaturalFlowScriptProps(blocks, block, extracted.parsed, locals, lineNumber, imports);
			Object.keys(extracted.slots || {}).forEach(function (slot) {
				node[slot] = extracted.slots[slot];
			});
			if (node.id) node.__flowExplicitId = true;
			return foldConfigUseOverrides(blocks, block, node);
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

		// The methods an expression calls on a value (expression-utils.js): on a scope path they read as JavaScript.
		var FLOWSCRIPT_VALUE_METHODS = ["trim", "toLowerCase", "toUpperCase", "includes", "startsWith", "endsWith", "indexOf",
			"lastIndexOf", "slice", "substring", "split", "replace", "replaceAll", "padStart", "padEnd", "charAt", "concat",
			"repeat", "trimStart", "trimEnd", "localeCompare", "normalize", "join", "at", "toFixed", "toString", "toPrecision"];

		function isFlowScriptExpressionCallName(name) {
			name = String(name || "");
			if (name.match(/\.(trim|toLowerCase|toUpperCase|includes|startsWith|endsWith)$/)) {
				return true;
			}
			var dot = name.lastIndexOf(".");
			if (dot > 0 && FLOWSCRIPT_VALUE_METHODS.indexOf(name.substring(dot + 1)) !== -1 && env.isScopePath(name.substring(0, dot))) {
				return true;
			}
			return FLOWSCRIPT_EXPRESSION_FUNCTIONS.indexOf(name) !== -1;
		}

		// The functions of the expressions (expression-utils.js)
		var FLOWSCRIPT_EXPRESSION_FUNCTIONS = EXPRESSION_FUNCTION_NAMES;

		function parseNaturalFlowScriptCallMember(text) {
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
						// static members only: json.select reads [local.k] as the text of a key, not as the value of local.k
						if (!rest || !rest.match(/^(?:\.[A-Za-z_$][\w$]*|\[\d+\]|\["[^"\\\]]*"\]|\['[^'\\\]]*'\])+$/)) {
							return null;
						}
						var path = rest.charAt(0) === "." ? rest.substring(1) : rest;
						return {
							name: match[1],
							args: text.substring(open + 1, i),
							path: path
						};
					}
				}
			}
			return null;
		}

		function parseNaturalFlowScriptSliceMethod(text) {
			text = stripFlowScriptSemicolon(text);
			var match = text.match(/^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])*)\.slice\s*\(([\s\S]*)\)\s*$/);
			if (!match) {
				return null;
			}
			return {
				items: match[1],
				args: splitFlowScriptTopLevel(match[2] || "", ",")
			};
		}

		function flowScriptSliceCount(startToken, endToken, locals) {
			var start = flowScriptExpressionFromToken(startToken || "0", locals);
			var end = flowScriptExpressionFromToken(endToken || "", locals);
			if (String(start).match(/^-?\d+(?:\.\d+)?$/) && String(end).match(/^-?\d+(?:\.\d+)?$/)) {
				return Number(end) - Number(start);
			}
			return "(" + end + ") - (" + start + ")";
		}

		function naturalFlowScriptListTakeNode(varName, itemsToken, countToken, offsetToken, locals, lineNumber) {
			var node = {
				id: env.safeIdentifier(varName),
				block: "list.take",
				items: flowScriptPropertyValueFromToken(blocks, "list.map", "items", itemsToken || "local.items", locals, lineNumber),
				out: "local." + env.safeIdentifier(varName),
				__flowScriptLine: lineNumber
			};
			if (countToken !== undefined && countToken !== null && String(countToken).trim() !== "") {
				node.count = flowScriptExpressionFromToken(countToken, locals);
			}
			if (offsetToken !== undefined && offsetToken !== null && String(offsetToken).trim() !== "") {
				node.offset = flowScriptExpressionFromToken(offsetToken, locals);
			}
			return node;
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
						var bodyEnd = env.balancedObjectEnd(rest, 0);
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
			value = env.safeIdentifier(value || "value");
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
				var pair = splitFlowScriptTopLevel(part, ":", true);
				if (pair.length >= 2) {
					fields.push({
						key: unquoteFlowScriptString(pair.shift().trim()),
						token: pair[0]
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
				id: env.safeIdentifier(id),
				block: "json.object",
				out: outPath,
				__flowScriptLine: lineNumber,
				fields: fields.map(function (field) {
					return {
						id: env.safeIdentifier(field.key),
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
				mapperNode = normalizeNaturalFlowScriptNode(blocks, imports, locals, mapperBlock, parseFlowScriptObjectLiteral(mapperArgs[0], lineNumber), lineNumber);
			} else if (mapperArgs.length > 0) {
				return null;
			}
			var cap = capitalizedIdentifier(varName);
			var itemName = env.safeIdentifier(varName + capitalizedIdentifier(env.blockLocalName(mapperBlock) || "item"));
			mapperNode.id = mapperNode.id || env.safeIdentifier("map" + cap + capitalizedIdentifier(env.blockLocalName(mapperBlock) || "item"));
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
					items: flowScriptPropertyValueFromToken(blocks, "list.map", "items", itemToken, locals, lineNumber),
					__flowScriptLine: lineNumber,
					nodes: [
						mapperNode,
						{
							id: "push" + cap,
							block: "json.push",
							path: "local." + varName,
							value: "${local." + itemName + "}",
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
			// Plain structured projections execute directly in list.map. Projections
			// containing Flow block calls need per-item child nodes.
			var selectObject = isFlowScriptObjectLiteral(selectToken)
				? selectToken
				: flowScriptObjectLiteralFromExpressionToken(selectToken);
			if (selectObject) {
				var hasNestedBlock = naturalFlowScriptObjectFields(selectObject).some(function (field) {
					var call = parseNaturalFlowScriptCall(field.token);
					return call && blocks && blocks[resolveFlowScriptName(call.name, imports)];
				});
				return hasNestedBlock
					? buildNaturalListMapNodes(blocks, imports, varName, [itemToken, selectObject], locals, lineNumber)
					: null;
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
				if (isFlowScriptObjectLiteral(args[1])) {
					var selectFields = naturalFlowScriptObjectFields(args[1]).filter(function (field) {
						return field.key === "select";
					});
					if (selectFields.length === 1) {
						var selectToken = selectFields[0].token;
						if (isFlowScriptObjectLiteral(selectToken)) {
							return buildNaturalListMapNodes(blocks, imports, varName, [args[0], selectToken], locals, lineNumber);
						}
						var selectObjectLiteral = flowScriptObjectLiteralFromExpressionToken(selectToken);
						if (selectObjectLiteral) {
							return buildNaturalListMapNodes(blocks, imports, varName, [args[0], selectObjectLiteral], locals, lineNumber);
						}
						return [
							{
								id: env.safeIdentifier(varName),
								block: "list.map",
								items: flowScriptPropertyValueFromToken(blocks, "list.map", "items", args[0] || "local.items", locals, lineNumber),
								select: flowScriptExpressionFromToken(selectToken, locals),
								out: "local." + env.safeIdentifier(varName),
								__flowScriptLine: lineNumber
							}
						];
					}
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
			var compiledProjection = {};
			var hasNestedProjectionBlock = false;
			objectFields.forEach(function (field) {
				var nestedCall = parseNaturalFlowScriptCall(field.token);
				var nestedBlock = nestedCall && resolveFlowScriptName(nestedCall.name, imports);
				if (!nestedCall || !blocks || !blocks[nestedBlock]) {
					compiledProjection[field.key] = flowScriptValueFromToken(field.token, locals, lineNumber);
					return;
				}
				var nestedArgs = splitFlowScriptTopLevel(nestedCall.args, ",");
				if (nestedArgs.length !== 1 || !isFlowScriptObjectLiteral(nestedArgs[0])) {
					raiseFlowScriptBlockSignature(blocks, nestedBlock, field.token, lineNumber);
				}
				var nestedNode = normalizeNaturalFlowScriptNode(blocks, imports, locals, nestedBlock,
					parseFlowScriptObjectLiteral(nestedArgs[0], lineNumber), lineNumber);
				if (Object.keys(nestedNode).some(function (key) { return key !== "props"; })) {
					env.raise("FLOW_SOURCE_INLINE_METADATA_UNSUPPORTED", "Inline block projections cannot carry engine metadata; use an explicit block node.");
				}
				compiledProjection[field.key] = {
					__flowBlock: nestedBlock,
					properties: nestedNode.props
				};
				hasNestedProjectionBlock = true;
			});
			if (hasNestedProjectionBlock) {
				return [{
					id: env.safeIdentifier(varName),
					block: "list.map",
					items: flowScriptPropertyValueFromToken(blocks, "list.map", "items", args[0], locals, lineNumber),
					select: compiledProjection,
					out: "local." + env.safeIdentifier(varName),
					__flowScriptLine: lineNumber
				}];
			}
			var cap = capitalizedIdentifier(varName);
			var itemName = env.safeIdentifier(varName + "Item");
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
					items: flowScriptPropertyValueFromToken(blocks, "list.map", "items", args[0], locals, lineNumber),
					__flowScriptLine: lineNumber,
					nodes: [
						naturalFlowScriptJsonObjectNode(itemName, "local." + itemName, objectFields, locals, lineNumber),
						{
							id: "push" + cap,
							block: "json.push",
							path: "local." + varName,
							value: "${local." + itemName + "}",
							__flowScriptLine: lineNumber
						}
					]
				}
			];
		}
	
		function buildNaturalFlowScriptCall(blocks, imports, locals, varName, rhs, lineNumber) {
			var call = parseNaturalFlowScriptCall(rhs);
			if (!call) {
				env.raise("FLOWSCRIPT_UNSUPPORTED_ASSIGNMENT", "Unsupported FlowScript assignment at line " + lineNumber + ": " + rhs,
					null, "Assign a Flow block call with one object parameter, for example const feed = requestable.call({ requestable: \".Connector.Transaction\" });");
			}
			var block = resolveFlowScriptName(call.name, imports);
			var args = call.args.trim() === "" ? ["{}"] : splitFlowScriptTopLevel(call.args, ",");
			var hasCanonicalArgs = args.length === 1 && isFlowScriptObjectLiteral(args[0]);
			if (!hasCanonicalArgs) {
				raiseFlowScriptBlockSignature(blocks, block, call.name + "(" + args.join(", ") + ")", lineNumber);
			}

			var node = normalizeNaturalFlowScriptNode(blocks, imports, locals, block, parseFlowScriptObjectLiteral(args[0], lineNumber), lineNumber);
			node.block = block;
			if (!node.id) {
				node.id = env.safeIdentifier(varName);
			}
			bindAssignmentOutput(blocks, node, block, "local." + env.safeIdentifier(varName), lineNumber);
			node.__flowScriptLine = lineNumber;
			return [node];
		}

		// The destination property of a block whose output is the value it
		// writes: set.path, and write paths declaring the output (json.array,
		// json.map). An assignment fills it when the call leaves it out.
		function assignmentDestinationProperty(blocks, block) {
			if (block === "set") return "path";
			var catalog = env.blockCatalog(blocks && blocks[block]) || {};
			var props = catalog.props || {};
			var keys = Object.keys(props).filter(function (key) {
				return props[key] && props[key].declares === "out" && env.destinationContract.isWriteProperty(catalog, key);
			});
			return keys.length === 1 ? keys[0] : "";
		}

		function bindAssignmentOutput(blocks, node, block, path, lineNumber) {
			if (node.out !== undefined && node.out !== path) {
				env.raise("FLOW_SOURCE_OUTPUT_CONFLICT", "Assignment and $$out have different destinations at line " + lineNumber,
					null, "Remove $$out from the assignment or use an explicit block call.");
			}
			var destination = assignmentDestinationProperty(blocks, block);
			if (destination && node.props[destination] === undefined) node.props[destination] = path;
			node.out = path;
		}
	
		// A block in arithmetic or a short-circuit assignment lowers to ordinary Flow nodes.
		// Evaluate each operand once, left to right; lazy branches stay lazy, including inside an iterator.
		var expressionSource = "", expressionSequence = 0;
		function lowerBlockExpression(blocks, imports, locals, destination, rhs, lineNumber) {
			if (!containsNestedBlockCall(blocks, rhs) || parseNaturalFlowScriptCall(rhs)) return null;
			var root, options = new Packages.org.mozilla.javascript.CompilerEnvirons();
			options.setLanguageVersion(200);
			function parse(source) {
				return new Packages.org.mozilla.javascript.Parser(options).parse("(" + source + ");", "flow-expression", 1)
					.getFirstChild().getExpression().getExpression();
			}
			try { root = parse(rhs); } catch (_notAnExpression) { return null; }
			function kind(node) { return String(node.getClass().getSimpleName()); }
			function unsupported(message) {
				env.raise("FLOWSCRIPT_EXPRESSION_UNSUPPORTED", message + " at line " + lineNumber, null,
					"Compute this operand on its own line, then use the local in the expression with the block call.");
			}
			// Invariant: the operands written out keep every prefix operator of the source expression.
			function prefixOperators(node) {
				var count = 0;
				node.visit(new Packages.org.mozilla.javascript.ast.NodeVisitor({ visit: function (child) {
					if (kind(child) === "UnaryExpression") count++;
					return true;
				} }));
				return count;
			}
			var written = 0;
			function slice(node) {
				var token = text(node), copy;
				try { copy = parse(token); } catch (_lost) { copy = null; }
				if (!copy || prefixOperators(copy) !== prefixOperators(node)) unsupported("An operand of this expression could not be kept whole");
				written += prefixOperators(node);
				return token;
			}
			// Rhino bounds a prefix unary node (!x, -x, typeof x, void x, ~x, +x) by its operand only: an operand sliced by
			// position would lose its operator (!a && b() ran as a && b()). A node starts at its leftmost token.
			function position(node) { return Number(node.getAbsolutePosition()) - 1; }
			function start(node) {
				var k = kind(node), at;
				if (k === "InfixExpression") return Math.min(position(node), start(node.getLeft()));
				if (k === "ConditionalExpression") return Math.min(position(node), start(node.getTestExpression()));
				if (k !== "UnaryExpression") return position(node); // x++ and x-- are UpdateExpression nodes, bounded right
				var op = String(Packages.org.mozilla.javascript.ast.AstNode.operatorToString(node.getOperator()));
				at = start(node.getOperand());
				while (at > 0 && /\s/.test(rhs.charAt(at - 1))) at--;
				if (rhs.substring(at - op.length, at) !== op) unsupported("A comment or other text between the operator " + op + " and its operand is not supported in an expression with a block call");
				return Math.min(position(node), at - op.length);
			}
			// a keyword literal ends with its keyword (sourceEnd): Rhino bounds null|| or true: by the next token too
			function text(node) { return rhs.substring(start(node), sourceEnd(node, "(" + rhs + ");") - 1); }
			function temp() {
				var name;
				do { name = "flowExpression" + (++expressionSequence); } while (expressionSource.indexOf(name) >= 0 || locals[name]);
				return "local." + name;
			}
			function set(path, value) { return {block:"set", path:path, value:flowScriptValueFromToken(value, locals, lineNumber), __flowScriptLine:lineNumber}; }
			function supported(node) {
				if (!containsNestedBlockCall(blocks, text(node))) return true;
				var k = kind(node);
				if (k === "ParenthesizedExpression") return supported(node.getExpression());
				if (k === "FunctionCall") return !!blocks[resolveFlowScriptName(String(node.getTarget().toSource()).replace(/\s/g,""), imports)];
				if (k === "InfixExpression") return supported(node.getLeft()) && supported(node.getRight());
				if (k === "ConditionalExpression") return supported(node.getTestExpression()) && supported(node.getTrueExpression()) && supported(node.getFalseExpression());
				return false;
			}
			if (!supported(root)) return null;
			function lower(node, path) {
				var k = kind(node), token = text(node);
				if (!containsNestedBlockCall(blocks, token)) return [set(path, slice(node))];
				if (k === "ParenthesizedExpression") return lower(node.getExpression(), path);
				if (k === "FunctionCall") return buildNaturalScopeAssignment(blocks, imports, locals, path, slice(node), lineNumber);
				var left = temp(), nodes;
				if (k === "ConditionalExpression") {
					nodes = lower(node.getTestExpression(), left);
					nodes.push({block:"if", condition:left, then:lower(node.getTrueExpression(), path),
						else:lower(node.getFalseExpression(), path), __flowScriptLine:lineNumber});
					return nodes;
				}
				var op = String(Packages.org.mozilla.javascript.ast.AstNode.operatorToString(node.getOperator()));
				nodes = lower(node.getLeft(), left);
				if (op === "&&" || op === "||" || op === "??") {
					nodes.push({block:"if", condition:op === "&&" ? left : op === "||" ? "!" + left : left + " == null",
						then:lower(node.getRight(), left), __flowScriptLine:lineNumber});
					nodes.push(set(path, left));
				} else {
					var right = temp();
					nodes = nodes.concat(lower(node.getRight(), right));
					nodes.push(set(path, left + " " + op + " " + right));
				}
				return nodes;
			}
			var lowered = lower(root, destination);
			if (written !== prefixOperators(root)) unsupported("An operator of this expression could not be kept");
			return lowered;
		}

		// A regular expression literal is not an expression. Assigned alone in one of its exact JavaScript forms, it is
		// read as the text block that does the same, and the source written at promote is that block:
		//   x = /p/f.test(s)        local.xMatch = text.match({ text: String(s), pattern: "p", flags: "f" }), x = local.xMatch.matched
		//   x = s.match(/p/f)       the same text.match, x = local.xMatch.matched ? local.xMatch.groups : null
		//   x = s.replace(/p/f, y)  text.replace({ text: s, search: "p", replacement: y, regex: true, all: false without g })
		//   x = s.replaceAll(/p/g, y), x = s.split(/p/f)  text.replace and text.split({ ..., regex: true, trim: false, removeEmpty: false })
		// Any other form (a literal inside a condition or a longer expression, other flags, other arguments, a replacement
		// function) is refused at its line with the block to write (expression-utils.js regularExpressionHint).
		function lowerRegularExpressionAssignment(blocks, imports, locals, destination, rhs, lineNumber) {
			var text = String(rhs || "").trim();
			if (!env.regularExpressionAdvice || text.indexOf("/") === -1) {
				return null;
			}
			var start = text.charAt(0) === "/" ? 0 : -1;
			var method = /\.\s*(match|replace|replaceAll|split)\s*\(\s*\//g, found;
			while (start < 0 && (found = method.exec(text))) {
				var candidate = env.regularExpressionAdvice(text, found.index + found[0].length - 1);
				if (candidate.callStart === 0 && candidate.callEnd === text.length) start = found.index + found[0].length - 1;
			}
			if (start < 0) {
				raiseRegularExpressionLiteral(text, lineNumber);
				return null;
			}
			var advice = env.regularExpressionAdvice(text, start);
			var exact = advice.closed && advice.flagsSupported && advice.callStart === 0 && advice.callEnd === text.length && !advice.extraArguments &&
				advice.pattern !== "" && (advice.method === "test" ? advice.argument !== "" : advice.receiver !== "") &&
				/^(test|match|replace|replaceAll|split)$/.test(advice.method) &&
				!(advice.method === "replaceAll" && advice.flags.indexOf("g") === -1) &&
				!(/^replace/.test(advice.method) && (advice.replacement === "" || /^function\b|=>/.test(advice.replacement)));
			if (!exact) {
				// /x/y.test(s), /x/.test(a) && b: an expression, refused by its checks with the same hint
				if (start === 0) return null;
				raiseRegularExpressionLiteral(text, lineNumber, start);
			}
			var pattern = JSON.stringify(advice.pattern);
			var flags = advice.flags.replace(/g/g, "");
			if (advice.method === "replace" || advice.method === "replaceAll") {
				return buildNaturalScopeAssignment(blocks, imports, locals, destination, "text.replace({ text: " + advice.receiver + ", search: " + pattern +
					", replacement: " + advice.replacement + ", regex: true" + (advice.flags.indexOf("g") === -1 ? ", all: false" : "") +
					(flags ? ", flags: " + JSON.stringify(flags) : "") + " })", lineNumber);
			}
			if (advice.method === "split") {
				return buildNaturalScopeAssignment(blocks, imports, locals, destination, "text.split({ text: " + advice.receiver + ", separator: " + pattern +
					", regex: true, trim: false, removeEmpty: false" + (flags ? ", flags: " + JSON.stringify(flags) : "") + " })", lineNumber);
			}
			var base = env.safeIdentifier(destination.replace(/^(local|result|parent)\./, "").replace(/[^\w$]+/g, "_")) + "Match", name = base;
			for (var n = 2; locals[name]; n++) name = base + n;
			locals[name] = true;
			var call = "text.match({ text: " + (advice.method === "test" ? "String(" + advice.argument + ")" : advice.receiver) + ", pattern: " + pattern +
				(advice.flags ? ", flags: " + JSON.stringify(advice.flags) : "") + " })";
			return buildNaturalScopeAssignment(blocks, imports, locals, "local." + name, call, lineNumber).concat(
				buildNaturalScopeAssignment(blocks, imports, locals, destination, advice.method === "test"
					? "local." + name + ".matched" : "local." + name + ".matched ? local." + name + ".groups : null", lineNumber));
		}

		// A statement whose regular expression literal is the target or the first argument of a call (value.replace(/x/g, y)
		// written alone, value.match(/x/, 1)) would be read as a call of a block named value.replace: it is refused at its
		// line with the block to write, as a JavaScript loop is (raiseJavaScriptLoop). A literal inside an expression of a
		// condition or a value is refused by the expression checks, at its line too.
		function raiseRegularExpressionLiteral(line, lineNumber, at) {
			var start = at;
			if (start === undefined) {
				var call = /^(?:[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*\(\s*\/|\/)/.exec(String(line || ""));
				if (!call || !env.regularExpressionAdvice) {
					return;
				}
				start = call[0].length - 1;
			}
			var advice = env.regularExpressionAdvice(line, start);
			if (!advice.closed) {
				return;
			}
			env.raise("FLOWSCRIPT_EXPRESSION_UNSUPPORTED", "A regular expression literal is not FlowScript at line " + lineNumber + ": " +
				String(line).substring(0, 120) + " (" + advice.block + " does it).", null, env.regularExpressionHint(line, start));
		}

		function buildNaturalFlowScriptAssignment(blocks, imports, locals, varName, rhs, lineNumber) {
			rhs = stripFlowScriptSemicolon(rhs);
			var regex = lowerRegularExpressionAssignment(blocks, imports, locals, "local." + env.safeIdentifier(varName), rhs, lineNumber);
			if (regex) return regex;
			var lowered = lowerBlockExpression(blocks, imports, locals, "local." + env.safeIdentifier(varName), rhs, lineNumber);
			if (lowered) return lowered;
			var callMember = parseNaturalFlowScriptCallMember(rhs);
			if (callMember) {
				var sourceName = env.safeIdentifier(varName + "Source");
				var sourceNodes = buildNaturalFlowScriptCall(blocks, imports, locals, sourceName,
					callMember.name + "(" + callMember.args + ")", lineNumber);
				if (sourceNodes.length !== 1) {
					env.raise("FLOWSCRIPT_UNSUPPORTED_ASSIGNMENT", "Unsupported chained FlowScript block call at line " + lineNumber + ": " + rhs,
						null, "Assign the block call first, then select from the local variable.");
				}
				return sourceNodes.concat([{
					id: env.safeIdentifier(varName),
					block: "json.select",
					source: "local." + sourceName,
					path: callMember.path,
					out: "local." + env.safeIdentifier(varName),
					__flowScriptLine: lineNumber
				}]);
			}
			var sliceMethod = parseNaturalFlowScriptSliceMethod(rhs);
			// items.slice(1, 3) on a scope path is a JavaScript expression (expression-utils.js)
			if (sliceMethod && !env.isScopePath(sliceMethod.items)) {
				env.raise("FLOWSCRIPT_INVALID_BLOCK_CALL_SIGNATURE",
					"Unsupported JavaScript-style slice at line " + lineNumber + ": " + rhs,
					null,
					"FlowScript is a Flow block DSL. Use list.take({ items: " + sliceMethod.items + ", offset: 0, count: 5 }) instead of " + sliceMethod.items + ".slice(...). Expected signature: list.take({ items, offset??0, count??5 }).");
			}
			var callWithBody = parseNaturalFlowScriptCallWithBody(rhs);
			if (callWithBody) {
				var nodesWithBody = buildNaturalFlowScriptCall(blocks, imports, locals, varName,
					callWithBody.name + "(" + callWithBody.args + ")", lineNumber);
				if (nodesWithBody.length !== 1) {
					env.raise("FLOWSCRIPT_UNSUPPORTED_ASSIGNMENT", "Unsupported FlowScript block assignment with body at line " + lineNumber + ": " + rhs,
						null, "Assign one block call with one child body.");
				}
				var nodeWithBody = nodesWithBody[0];
				var slot = nodeWithBody.block === "if" ? "then" : nodeWithBody.block === "json.object" ? "fields" : "nodes";
				nodeWithBody[slot] = parseFlowScriptBodyNodes(blocks, imports, locals, callWithBody.body);
				return [nodeWithBody];
			}
			if (parseNaturalFlowScriptCall(rhs)) {
				var varCall = parseNaturalFlowScriptCall(rhs);
				var resolvedCallName = resolveFlowScriptName(varCall.name, imports);
				if ((blocks && blocks[resolvedCallName]) || !isFlowScriptExpressionCallName(resolvedCallName)) {
					return buildNaturalFlowScriptCall(blocks, imports, locals, varName, rhs, lineNumber);
				}
			}
			return [{
				id: env.safeIdentifier(varName),
				block: "set",
				path: "local." + env.safeIdentifier(varName),
				value: flowScriptValueFromToken(rhs, locals, lineNumber),
				__flowScriptLine: lineNumber
			}];
		}
	
		function buildNaturalScopeAssignment(blocks, imports, locals, scopePath, rhs, lineNumber) {
			rhs = stripFlowScriptSemicolon(rhs);
			var regex = lowerRegularExpressionAssignment(blocks, imports, locals, scopePath, rhs, lineNumber);
			if (regex) return regex;
			var lowered = lowerBlockExpression(blocks, imports, locals, scopePath, rhs, lineNumber);
			if (lowered) return lowered;
			// result.x = block(...).y.z, as const x = block(...).y.z: the block runs into a local of its own, then y.z is
			// read into the destination, in the order of the statement. A call of anything but a block stays an expression.
			var callMember = parseNaturalFlowScriptCallMember(rhs);
			if (callMember && blocks && blocks[resolveFlowScriptName(callMember.name, imports)]) {
				var base = env.safeIdentifier(scopePath.replace(/^(local|result|parent)\./, "").replace(/\W+/g, "_").replace(/_+$/, "") + "Source"), sourceName = base;
				for (var n = 2; locals[sourceName] || expressionSource.indexOf(sourceName) >= 0; n++) sourceName = base + n;
				locals[sourceName] = true;
				var sourceNodes = buildNaturalFlowScriptCall(blocks, imports, locals, sourceName, callMember.name + "(" + callMember.args + ")", lineNumber);
				if (sourceNodes.length !== 1) {
					env.raise("FLOWSCRIPT_UNSUPPORTED_ASSIGNMENT", "Unsupported chained FlowScript block call at line " + lineNumber + ": " + rhs,
						null, "Assign the block call first, then select from the local variable.");
				}
				return sourceNodes.concat([{
					id: env.safeIdentifier(scopePath.replace(/^(local|result|parent)\./, "")),
					block: "json.select",
					source: "local." + sourceName,
					path: callMember.path,
					out: scopePath,
					__flowScriptLine: lineNumber
				}]);
			}
			var call = parseNaturalFlowScriptCall(rhs);
			if (call) {
				var block = resolveFlowScriptName(call.name, imports);
				if (!(blocks && blocks[block]) && isFlowScriptExpressionCallName(block)) {
					return [{
						id: env.safeIdentifier(scopePath.replace(/^(local|result|parent)\./, "")),
						block: "set",
						path: scopePath,
						value: flowScriptValueFromToken(rhs, locals, lineNumber),
						__flowScriptLine: lineNumber
					}];
				}
				var args = call.args.trim() === "" ? ["{}"] : splitFlowScriptTopLevel(call.args, ",");
				var hasCanonicalArgs = args.length === 1 && isFlowScriptObjectLiteral(args[0]);
				if (!hasCanonicalArgs) {
					raiseFlowScriptBlockSignature(blocks, block, call.name + "(" + args.join(", ") + ")", lineNumber);
				}
				var node = normalizeNaturalFlowScriptNode(blocks, imports, locals, block, parseFlowScriptObjectLiteral(args[0], lineNumber), lineNumber);
				node.block = block;
				node.__flowScriptLine = lineNumber;
				bindAssignmentOutput(blocks, node, block, scopePath, lineNumber);
				if (!node.id) node.id = env.safeIdentifier(scopePath.replace(/^(local|result|parent)\./, ""));
				return [node];
			}
			return [{
				id: env.safeIdentifier(scopePath.replace(/^(local|result|parent)\./, "")),
				block: "set",
				path: scopePath,
				value: flowScriptValueFromToken(rhs, locals, lineNumber),
				__flowScriptLine: lineNumber
			}];
		}
	
		function buildNaturalFlowScriptReturn(expr, locals, lineNumber, nested) {
			expr = stripFlowScriptSemicolon(String(expr || "").replace(/^return\b/, ""));
			
			// A bare return is a return block without value: it leaves the Flow with the result written so far, as in
			// JavaScript (lowered to a value, it answered the empty template "${}" as text). In the body of forEach or
			// while, lowerLoopBareReturns makes it the next item, as return in a JavaScript forEach callback.
			if (expr === "") {
				return [{ id: "return", block: "return", __flowScriptBareReturn: true, __flowScriptLine: lineNumber }];
			}
			var fields = isFlowScriptObjectLiteral(expr) ? naturalFlowScriptObjectFields(expr) : null;
			// Only identifier keys lower to named result destinations (destination-contract);
			// other keys keep the object as one return value.
			if (fields && fields.every(function (field) { return /^[A-Za-z_$][\w$]*$/.test(String(field.key)); })) {
				var assignments = fields.map(function (field) {
					return {
						id: "return" + capitalizedIdentifier(field.key),
						block: "set",
						path: "result." + field.key,
						value: flowScriptValueFromToken(field.token, locals, lineNumber),
						__flowScriptLine: lineNumber
					};
				});
				// Return always leaves the Flow, including when followed by another root statement.
				assignments.push({ id: "return", block: "return", value: "${result}", __flowScriptLine: lineNumber });
				assignments[0].__flowReturnCount = assignments.length;
				return assignments;
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
			if (name === "list.slice") {
				return "list.take";
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
						env.raise("FLOWSCRIPT_INVALID_IMPORT", "Invalid FlowScript import at line " + lineNumber + ": " + part,
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
			env.raise("FLOWSCRIPT_INVALID_IMPORT", "Invalid FlowScript import at line " + lineNumber,
				null, "Use import { call } from \"requestable\", import * as requestable from \"requestable\", or import requestable.call.");
		}
	
		function parseFlowScriptBodyNodes(blocks, imports, locals, body, firstLine) {
			var root = { version: 1, nodes: [] };
			parseFlowScriptStatementsInto(blocks, imports || {}, Object.assign({}, locals || {}), root, flowScriptStatements(body, firstLine));
			return root.nodes;
		}

		// The closeChar of the openChar at open, the quotes of the strings and the comments skipped (// the item's date).
		function balancedFlowScriptGroupEnd(text, open, openChar, closeChar) {
			var quote = "";
			var depth = 0;
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
				if (ch === "/" && (text.charAt(i + 1) === "/" || text.charAt(i + 1) === "*")) {
					var end = text.charAt(i + 1) === "/" ? text.slice(i).search(/[\r\n]/) : text.indexOf("*/", i + 2);
					i = end < 0 ? text.length : text.charAt(i + 1) === "/" ? i + end - 1 : end + 1;
					continue;
				}
				if (ch === "\"" || ch === "'" || ch === "`") {
					quote = ch;
					continue;
				}
				if (ch === openChar) {
					depth++;
				} else if (ch === closeChar) {
					depth--;
					if (depth === 0) {
						return i;
					}
				}
			}
			return -1;
		}

		function lineNumberAt(text, offset) {
			var line = 1;
			for (var i = 0; i < offset && i < text.length; i++) {
				if (text.charAt(i) === "\n") {
					line++;
				}
			}
			return line;
		}

		function splitFlowScriptFunctions(code) {
			code = String(code || "");
			var functions = [];
			var prelude = "";
			var cursor = 0;
			var pattern = /(^|\n)([ \t]*)(flow|function)\s+([A-Za-z_$][\w$]*)\s*\(/g;
			var match;
			while ((match = pattern.exec(code)) !== null) {
				var start = match.index + match[1].length;
				if (start < cursor) {
					continue;
				}
				var openParen = code.indexOf("(", pattern.lastIndex - 1);
				var closeParen = balancedFlowScriptGroupEnd(code, openParen, "(", ")");
				if (closeParen < 0) {
					env.raise("FLOWSCRIPT_UNBALANCED_SYNTAX", "Unbalanced FlowScript function signature at line " + lineNumberAt(code, start),
						null, "Close the function argument list before the body.");
				}
				var bodyStart = closeParen + 1;
				while (bodyStart < code.length && /\s/.test(code.charAt(bodyStart))) {
					bodyStart++;
				}
				if (code.charAt(bodyStart) !== "{") {
					pattern.lastIndex = closeParen + 1;
					continue;
				}
				var bodyEnd = env.balancedObjectEnd(code, bodyStart);
				if (bodyEnd < 0) {
					env.raise("FLOWSCRIPT_UNBALANCED_SYNTAX", "Unbalanced FlowScript function body at line " + lineNumberAt(code, start),
						null, "Close the function body with }.");
				}
				prelude += code.substring(cursor, start);
				functions.push({
					name: match[4],
					args: code.substring(openParen + 1, closeParen),
					body: code.substring(bodyStart + 1, bodyEnd),
					bodyLine: lineNumberAt(code, bodyStart),
					line: lineNumberAt(code, start),
					code: code.substring(start, bodyEnd + 1)
				});
				cursor = bodyEnd + 1;
				pattern.lastIndex = cursor;
			}
			prelude += code.substring(cursor);
			return {
				prelude: prelude,
				functions: functions
			};
		}

		function mainFlowScriptFunctionIndex(functions) {
			for (var i = functions.length - 1; i >= 0; i--) {
				if (String(functions[i].args || "").trim().charAt(0) === "{") {
					return i;
				}
			}
			return functions.length - 1;
		}

		function flowScriptFunctionParams(fn, allowObjectSignature) {
			var args = String(fn && fn.args || "").trim();
			if (args === "") {
				return [];
			}
			if (args.charAt(0) === "{") {
				if (allowObjectSignature) {
					return [];
				}
				env.raise("FLOWSCRIPT_UNSUPPORTED_HELPER_SIGNATURE", "Unsupported helper signature at line " + fn.line + ": " + args,
					null, "Use simple helper parameters, for example function normalize(txt) { return lower(txt); }.");
			}
			return splitFlowScriptTopLevel(args, ",").map(function (part) {
				part = String(part || "").trim();
				var match = part.match(/^([A-Za-z_$][\w$]*)$/);
				if (!match) {
					env.raise("FLOWSCRIPT_UNSUPPORTED_HELPER_SIGNATURE", "Unsupported helper parameter at line " + fn.line + ": " + part,
						null, "Use simple parameter names only. Defaults, destructuring and rest parameters are not supported yet.");
				}
				return match[1];
			});
		}

		function helperPropDefinitions(params) {
			var props = {};
			(params || []).forEach(function (param) {
				props[param] = {
					kind: "expression",
					type: "unknown",
					description: "Helper argument " + param + "."
				};
			});
			return props;
		}

		function helperParamLocals(params) {
			var locals = {};
			(params || []).forEach(function (param) {
				locals[param] = "input." + param;
			});
			return locals;
		}

		function helperBlockDefinitions(helpers) {
			var out = {};
			(helpers || []).forEach(function (helper) {
				out[helper.name] = {
					name: helper.name,
					catalog: function () {
						return {
							blockId: helper.name,
							name: helper.name,
							localName: helper.name,
							namespace: "helpers",
							"private": true,
							visibility: "private",
							description: "Private FlowScript helper.",
							icon: "mdi:function-variant",
							props: helper.props || {},
							outputs: {
								value: {
									type: "unknown"
								}
							}
						};
					}
				};
			});
			return out;
		}

		function parseFlowScriptImports(prelude, imports) {
			flowScriptStatements(prelude).forEach(function (statement) {
				if (statement.commentNode !== undefined) return;
				var text = statement.text;
				if (text.match(/^import\s+/)) {
					parseFlowScriptImport(text, statement.line, imports);
					return;
				}
				if (text.match(/^(?:const|let|var)\s+_(?:meta|flow|block)\s*=/)) {
					return;
				}
				if (text !== "") {
					env.raise("FLOWSCRIPT_UNSUPPORTED_TOP_LEVEL", "Unsupported FlowScript top-level statement at line " + statement.line + ": " + text,
						null, "Only imports, metadata constants and top-level function declarations are supported.");
				}
			});
		}

		function parseFlowScriptTopLevelObject(prelude, name) {
			var out = {};
			var seen = false;
			// Only the head of a statement is matched: a capture of the rest with [\\s\\S]+$ took minutes of Rhino
			// regular expression work on a large statement and held the request.
			var re = new RegExp("^(?:const|let|var)\\s+_" + name + "\\s*=\\s*");
			flowScriptStatements(prelude).forEach(function (statement) {
				if (statement.commentNode !== undefined) return;
				var text = String(statement.text);
				var head = re.exec(text.slice(0, 1024));
				var match = head && text.length > head[0].length ? [text, text.slice(head[0].length)] : null;
				if (!match) {
					return;
				}
				if (seen) env.raise("FLOWSCRIPT_DUPLICATE_METADATA", "Duplicate _" + name + " declaration at line " + statement.line + ".");
				seen = true;
				var token = stripFlowScriptSemicolon(match[1]);
				if (!isFlowScriptObjectLiteral(token)) {
					env.raise("FLOWSCRIPT_INVALID_METADATA", "Invalid _" + name + " metadata at line " + statement.line + ".",
						null, "Use a plain object literal, for example const _flow = { inputs: { city: { type: \"string\" } } }.");
				}
				out = parseFlowScriptObjectLiteral(token, statement.line, true).value;
			});
			return out;
		}

		function parseFlowScriptTopLevelObjectFromCode(code, name) {
			var split = splitFlowScriptFunctions(env.normalizeFlowScriptFunctionSyntax(code));
			return parseFlowScriptTopLevelObject(split.prelude, name);
		}
	
		// The scopes an expression reads: a local of the same name would hide them (local.input = 3 made every
		// later input.day read local.input.day, const result = 3 made result.x a local).
		var RESERVED_LOCAL_NAMES = { input: true, config: true, local: true, result: true, request: true, current: true, parent: true, trace: true };

		function trackFlowScriptLocalWrite(locals, path) {
			path = String(path || "");
			if (path.indexOf("local.") !== 0) {
				return;
			}
			var name = path.substring("local.".length).split(/[.\[]/)[0];
			if (name && RESERVED_LOCAL_NAMES[name] !== true) {
				locals[name] = true;
			}
		}
	
		function trackFlowScriptNodeWrites(locals, node) {
			if (!node || typeof node !== "object") {
				return;
			}
			trackFlowScriptLocalWrite(locals, node.out);
			trackFlowScriptLocalWrite(locals, node.props ? node.props.path : node.path);
		}

		function canonicalizeParsedNode(blocks, node) {
			var slots = flowScriptBlockSlotNames(blocks, node.block);
			if (node.block === "set" && node.props && node.out === node.props.path) delete node.out;
			// Natural assignments, returns and expanded projections synthesize
			// nodes too. Lower them into the same AST as explicit $$ calls, here
			// in the parser, never via a runtime legacy-shape fallback.
			if (!node.props) {
				node.props = Object.create(null);
				Object.keys(node).forEach(function (key) {
					// Parser bookkeeping (__flowScriptLine, __flowScriptBareReturn) stays on the node, out of the properties.
					if (["id", "block", "out", "comment", "disabled", "props"].indexOf(key) !== -1 || key.indexOf("__flow") === 0 || slots.indexOf(key) !== -1) return;
					node.props[key] = node[key];
					delete node[key];
				});
			}
			slots.forEach(function (slot) {
				if (Array.isArray(node[slot])) node[slot].forEach(function (child) { canonicalizeParsedNode(blocks, child); });
			});
		}
	
		// A JavaScript loop statement (while (...) {, for (...) {, do {) was read as a call of a block named while or for
		// with a text for its properties, and failed with "Cannot set property "0" of undefined" at line 0. It is
		// refused at its line with the loop blocks to write instead; the while block keeps its iteration limit.
		function raiseJavaScriptLoop(line, lineNumber) {
			var loop = /^(while|for)\s*\(([\s\S]*?)\)\s*\{?\s*;?$/.exec(line) || /^(while|for)\s*\(([\s\S]*)$/.exec(line) || /^(do)\s*\{/.exec(line);
			if (!loop || loop[1] === "while" && isFlowScriptObjectLiteral(String(loop[2] || "").trim())) {
				return;
			}
			var whileBlock = "while({ condition: CONDITION, maxIterations: 1000, $$nodes: function () { ... } })";
			var limit = "maxIterations is 1000 when omitted (1 to 1000000; WHILE_ITERATION_LIMIT when the condition is still true after it) and timeoutMs 60000 (at most 600000)";
			var hint;
			if (loop[1] === "for") {
				var of = /^\s*(?:const|let|var)?\s*[A-Za-z_$][\w$]*\s+(?:of|in)\s+([\s\S]+)$/.exec(String(loop[2] || ""));
				hint = "To go through a list, use the forEach block, the item being current: forEach({ items: " + (of ? of[1].trim() : "local.items") +
					", $$nodes: function () { ... current ... } }). To count, set a local before the while block and increase it in its body: local.i = 0, then " +
					whileBlock.replace("CONDITION", "local.i < input.count").replace("...", "...; local.i = local.i + 1") + "; " + limit + ".";
			} else {
				hint = "Write the while block, its body in $$nodes: " +
					whileBlock.replace("CONDITION", loop[1] === "while" && String(loop[2] || "").trim() ? String(loop[2]).trim() : "local.again") +
					"; " + limit + ". To go through a list, use forEach({ items, $$nodes: function () { ... current ... } }).";
			}
			env.raise("FLOWSCRIPT_LOOP_UNSUPPORTED", "A JavaScript " + (loop[1] === "do" ? "do...while" : loop[1]) + " loop is not FlowScript at line " + lineNumber + ": " +
				line.substring(0, 120), null, hint);
		}

		function rejectFunctionArguments(line, lineNumber) {
			if (!/\bfunction\b|=>/.test(line)) return;
			var prefix = "function __argument_check() {\n", found = null;
			try {
				var options = new Packages.org.mozilla.javascript.CompilerEnvirons();
				options.setLanguageVersion(200);
				var ast = new Packages.org.mozilla.javascript.Parser(options).parse(prefix + line + "\n}", "flow-function-arguments", 1);
				ast.visit(new Packages.org.mozilla.javascript.ast.NodeVisitor({visit:function (node) {
					if (found || String(node.getClass().getSimpleName()) !== "FunctionCall") return !found;
					var args = node.getArguments();
					for (var index = 0; args && index < args.size(); index++) {
						if (String(args.get(index).getClass().getSimpleName()) === "FunctionNode") {
							found = {call:node, argument:args.get(index)};
							break;
						}
					}
					return !found;
				}}));
			} catch (_notJavaScript) { return; }
			if (!found) return;
			var target = String(found.call.getTarget().toSource()).replace(/\s/g, "");
			// Only list callbacks are reported here; other calls keep their own diagnostic (text.replace with regex, for example)
			var method = /\.(sort|map|filter|reduce|forEach|find|findIndex|some|every|flatMap)$/.exec(target);
			if (!method) return;
			var receiver = method ? target.substring(0, target.length - method[0].length) : "local.items";
			if (!/^(?:local|input|result|current)\.[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(receiver)) receiver = "local.items";
			var hint = method && method[1] === "sort"
				? "Use list.sort({ items: " + receiver + ", by: current.name, direction: \"asc\" }) to sort by one key per item. A two-argument comparator is not supported; compose a key in by when possible, or create a dedicated block for comparator logic."
				: method && method[1] === "map"
				? "Use list.map({ items: " + receiver + ", select: { id: current.id, name: current.name } }) to build one object per item; adapt the fields to the source."
				: method && method[1] === "filter"
				? "Use list.filter({ items: " + receiver + ", where: current.active }) to keep matching items."
				: method && method[1] === "some"
				? "Use local.matches = list.filter({ items: " + receiver + ", where: current.active }); local.count = list.count({ items: local.matches }); local.found = local.count > 0. Replace current.active with the callback condition."
				: method && method[1] === "every"
				? "Use local.matches = list.filter({ items: " + receiver + ", where: current.active }); local.count = list.count({ items: local.matches }); local.total = list.count({ items: " + receiver + " }); local.all = local.count == local.total. Replace current.active with the callback condition."
				: method && method[1] === "find"
				? "Use local.matches = list.filter({ items: " + receiver + ", where: current.active }); local.found = list.first({ items: local.matches }). Replace current.active with the callback condition."
				: method && method[1] === "findIndex"
				? "Use local.index = -1; local.i = 0; forEach({ items: " + receiver + ", $$nodes: function () { if (local.index == -1 && current.active) { local.index = local.i }; local.i = local.i + 1 } }). Replace current.active with the callback condition."
				: "Function arguments are not supported. Use a Flow block with named expression properties or write the operations as separate statements.";
			var offset = Math.max(0, Number(found.argument.getAbsolutePosition()) - prefix.length);
			var argumentLine = lineNumber + (line.substring(0, offset).match(/\n/g) || []).length;
			env.raise("FLOWSCRIPT_FUNCTION_ARGUMENT_UNSUPPORTED", "Function argument to " + target + " is not supported at line " + argumentLine + ".", null, hint);
		}

		function parseFlowScriptStatementsInto(blocks, imports, locals, root, statements) {
			var stack = [{ root: root, slot: "nodes" }];
			for (var i = 0; i < statements.length; i++) {
				var lineNumber = statements[i].line;
				var line = statements[i].text;
				var disabled = statements[i].disabled === true;
				var labelMatch = line.match(/^([A-Za-z_$][\w$]*)\s*:\s*([\s\S]+)$/);
				var label = labelMatch ? labelMatch[1] : "";
				if (labelMatch) line = labelMatch[2];
				var firstNode = true;
				var addStatementNode = function (node) {
					canonicalizeParsedNode(blocks, node);
					if (firstNode) {
						if (label) {
							if (node.__flowExplicitId && node.id !== label) env.raise("FLOWSCRIPT_LABEL_ID_CONFLICT", "Label and $$id disagree at line " + lineNumber);
							node.id = label;
							node.__flowExplicitId = true;
						}
						if (statements[i].comment !== undefined) node.comment = statements[i].comment;
						if (statements[i].blankBefore) node.__flowBlankBefore = true;
						firstNode = false;
					}
					if (disabled) {
						node.disabled = true;
					}
					addFlowScriptNode(stack[stack.length - 1], node);
				};
				if (statements[i].commentNode !== undefined) {
					addStatementNode({ block: "comment", props: {}, comment: statements[i].commentNode, __flowScriptLine: lineNumber });
					continue;
				}
				if (line === "") {
					continue;
				}
				rejectFunctionArguments(line, lineNumber);
				if (line.match(/^import\s+/)) {
					parseFlowScriptImport(line, lineNumber, imports);
					continue;
				}
				if (line.match(/^(flow|function)\s+/)) {
					env.raise("FLOWSCRIPT_UNSUPPORTED_NESTED_FUNCTION", "Nested FlowScript functions are not supported at line " + lineNumber + ".",
						null, "Declare helper functions at top level, before or after the main Flow function.");
				}
				var declaration = line.match(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([\s\S]+)$/);
				if (declaration) {
					if (RESERVED_LOCAL_NAMES[declaration[1]] === true) {
						env.raise("FLOWSCRIPT_RESERVED_NAME", "A local cannot be named " + declaration[1] + " at line " + lineNumber + ": " +
							declaration[1] + " is the " + declaration[1] + " scope, which every later " + declaration[1] + ".x would no longer read.",
							null, "Name it after what it holds (const " + declaration[1] + "Value = ..., or local." + declaration[1] + "Value = ...), and keep " +
							declaration[1] + ".x for the scope.");
					}
					var varName = env.safeIdentifier(declaration[1]);
					var nodes = buildNaturalFlowScriptAssignment(blocks, imports, locals, varName, declaration[2], lineNumber);
					nodes.forEach(function (node) {
						addStatementNode(node);
					});
					locals[varName] = true;
					continue;
				}
				var scopeAssignment = line.match(/^((?:local|result|parent)\.[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])*)\s*=\s*([\s\S]+)$/);
				if (scopeAssignment) {
					buildNaturalScopeAssignment(blocks, imports, locals, scopeAssignment[1], scopeAssignment[2], lineNumber).forEach(function (node) {
						addStatementNode(node);
					});
					if (scopeAssignment[1].indexOf("local.") === 0) {
						var assignedLocal = scopeAssignment[1].substring("local.".length).split(/[.\[]/)[0];
						// local.input stays local.input: input.x keeps reading the input scope
						if (assignedLocal && RESERVED_LOCAL_NAMES[assignedLocal] !== true) {
							locals[assignedLocal] = true;
						}
					}
					continue;
				}
				if (/^throw\s+\{/.test(line)) {
					var thrown = normalizeNaturalFlowScriptNode(blocks, imports, locals, "throw", parseFlowScriptObjectLiteral(stripFlowScriptSemicolon(line.replace(/^throw\s+/, "")), lineNumber), lineNumber);
					thrown.block = "throw";
					thrown.__flowScriptLine = lineNumber;
					addStatementNode(thrown);
					continue;
				}
				if (line.match(/^return(?:\s|;|$)/)) {
					buildNaturalFlowScriptReturn(line, locals, lineNumber, stack.length > 1).forEach(function (node) {
						addStatementNode(node);
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
						env.raise("FLOWSCRIPT_INVALID_ELSE", "Unexpected else at line " + lineNumber);
					}
					var previous = stack.pop();
					previous.root.else = [];
					stack.push({ root: previous.root, slot: "else" });
					continue;
				}
				var ifMatch = line.match(/^if\s*\(([\s\S]*)\)\s*(\{)?\s*;?$/);
				if (ifMatch && !isFlowScriptObjectLiteral(ifMatch[1])) {
					var ifNode = {
						then: [],
						id: "if" + (statements[i].idLine || lineNumber),
						block: "if",
						condition: flowScriptExpressionFromToken(ifMatch[1], locals, lineNumber),
						__flowScriptLine: lineNumber
					};
					addStatementNode(ifNode);
					if (ifMatch[2]) {
						stack.push({ root: ifNode, slot: "then" });
					}
					continue;
				}
				raiseJavaScriptLoop(line, lineNumber);
				raiseRegularExpressionLiteral(line, lineNumber);
				var match = line.match(/^([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*)\s*\(([\s\S]*)\)\s*(\{)?\s*;?$/);
				if (!match) {
					env.raise("FLOWSCRIPT_UNSUPPORTED_SYNTAX", "Unsupported FlowScript syntax at line " + lineNumber + ": " + line,
						null, "Use compact FlowScript: function MyFlow({ input, config, result }) { var feed = requestable.call({ requestable: \".Connector.Transaction\" }); var sorted = list.sort({ items: feed.items, by: current.title }); result.items = sorted; return result }.");
				}
				var block = resolveFlowScriptName(match[1], imports);
				var callArgs = match[2] || "{}";
				var node = isFlowScriptObjectLiteral(callArgs)
					? normalizeNaturalFlowScriptNode(blocks, imports, locals, block, parseFlowScriptObjectLiteral(callArgs, lineNumber), lineNumber)
					: parseFlowScriptArgs(callArgs, lineNumber);
				node.block = block;
				node.__flowScriptLine = lineNumber;
				addStatementNode(node);
				trackFlowScriptNodeWrites(locals, node);
				if (match[3]) {
					var slot = block === "if" ? "then" : block === "json.object" ? "fields" : "nodes";
					stack.push({ root: node, slot: slot });
				}
			}
		}
	
		// The body of forEach, while and file.forEachLine is a callback: a bare return in it ends the current item
		// (block next), as return in a JavaScript forEach callback; the if branches are not callbacks. The slots of
		// forEachChunk keep their return, the value of the chunk.
		var ITEM_LOOP_BLOCKS = { forEach: true, "while": true, "file.forEachLine": true };
		function isFlowScriptNodeList(list) {
			return Array.isArray(list) && list.length > 0 && list.every(function (item) {
				return item && typeof item === "object" && typeof item.block === "string";
			});
		}
		function lowerLoopBareReturns(nodes, inLoop) {
			(nodes || []).forEach(function (node, index) {
				if (!node || typeof node !== "object") return;
				if (node.__flowScriptBareReturn === true) {
					nodes[index] = inLoop ? Object.assign({},node,{block:"next",props:{}}) : node;
					delete node.__flowScriptBareReturn;
					return;
				}
				var childInLoop = ITEM_LOOP_BLOCKS[node.block] === true ? true : node.block === "forEachChunk" ? false : inLoop;
				Object.keys(node).forEach(function (key) {
					if (key !== "props" && isFlowScriptNodeList(node[key])) lowerLoopBareReturns(node[key], childInLoop);
				});
			});
			return nodes;
		}

		function assignNames(definition) {
			var nodes = [], used = Object.create(null), counts = Object.create(null);
			function visit(list) { (list || []).forEach(function (node) {
				nodes.push(node);
				Object.keys(node).forEach(function (key) { if (key !== "props" && Array.isArray(node[key])) visit(node[key]); });
			}); }
			visit(definition.nodes);
			(definition.helpers || []).forEach(function (helper) { visit(helper.nodes); });
			nodes = nodes.map(function(node,index){return {node:node,index:index};}).sort(function(a,b){
				return (Number(a.node.__flowScriptLine) || 0) - (Number(b.node.__flowScriptLine) || 0) || a.index-b.index;
			}).map(function(entry){return entry.node;});
			function reserveInline(value,line) {
				if (!value || typeof value !== "object") return;
				if (value.__flowBlock && value.metadata && value.metadata.id) {
					var id=value.metadata.id;
					if (used[id]) env.raise("FLOWSCRIPT_DUPLICATE_EXPLICIT_NAME","Duplicate explicit name " + id + " at line " + line);
					used[id]=true;
				}
				Object.keys(value).forEach(function (key) { reserveInline(value[key],line); });
			}
			nodes.forEach(function (node) { reserveInline(node.props,node.__flowScriptLine); });
			nodes.forEach(function (node) {
				if (!node.__flowExplicitId) return;
				if (used[node.id]) env.raise("FLOWSCRIPT_DUPLICATE_EXPLICIT_NAME", "Duplicate explicit name " + node.id + " at line " + node.__flowScriptLine);
				used[node.id] = true;
			});
			nodes.forEach(function (node) {
				var path = node.block === "set" ? node.props.path : node.out;
				var base = path ? String(path).split(".").pop() : String(node.block).split(".").pop();
				base = env.safeIdentifier(base || "node");
				var rank = counts[base] || 0, name;
				do { rank++; name = base + (rank > 1 ? rank : ""); } while (used[name] && !(node.__flowExplicitId && node.id === name));
				counts[base] = rank;
				node.__flowImplicitId = name;
				if (!node.__flowExplicitId) node.id = name;
				used[node.id] = true;
				if (node.__flowExplicitId) node.__flowNameExplicit = true;
				delete node.__flowExplicitId;
			});
			return definition;
		}

		function parseFlowScript(blocks, code, options) {
			expressionSource = String(code); expressionSequence = 0;
			code = env.normalizeFlowScriptFunctionSyntax(code);
			var split = splitFlowScriptFunctions(code);
			var flowMeta = parseFlowScriptTopLevelObject(split.prelude, "flow");
			if (options && options.sourceVersion !== undefined) {
				if (flowMeta.sourceVersion !== undefined && flowMeta.sourceVersion !== options.sourceVersion) {
					env.raise("FLOW_SOURCE_VERSION_CONFLICT", "The source header conflicts with the block sourceVersion.");
				}
				flowMeta.sourceVersion = options.sourceVersion;
			}
			if (flowMeta.sourceVersion !== undefined && flowMeta.sourceVersion !== 2) {
				env.raise("FLOW_SOURCE_VERSION_UNSUPPORTED", "Unsupported Flow sourceVersion: " + flowMeta.sourceVersion,
					null, "Flow sources use sourceVersion 2: declare const _flow = { sourceVersion: 2 }.");
			}
			if (split.functions.length > 0) {
				var mainIndex = mainFlowScriptFunctionIndex(split.functions);
				var main = split.functions[mainIndex];
				var helpers = split.functions.filter(function (_, index) {
					return index !== mainIndex;
				}).map(function (fn) {
					var params = flowScriptFunctionParams(fn, false);
					return {
						name: env.safeIdentifier(fn.name),
						params: params,
						props: helperPropDefinitions(params),
						nodes: [],
						__flowScriptLine: fn.line,
						__flowScriptCode: fn.code,
						__flowScriptBody: fn.body,
						__flowScriptBodyLine: fn.bodyLine
					};
				});
				var imports = {};
				parseFlowScriptImports(split.prelude, imports);
				// Catalog properties can lazily compile graph blocks. Reading every property
				// here makes a small source prepare the entire catalog, including unrelated
				// libraries. Keep descriptors lazy and do not mutate the shared catalog.
				var helperBlocks = blocks || {};
				if (helpers.length) {
					helperBlocks = Object.defineProperties({}, Object.assign(
						Object.getOwnPropertyDescriptors(helperBlocks),
						Object.getOwnPropertyDescriptors(helperBlockDefinitions(helpers))));
				}
				helpers.forEach(function (helper) {
					helper.nodes = parseFlowScriptBodyNodes(helperBlocks, Object.assign({}, imports),
						helperParamLocals(helper.params), helper.__flowScriptBody, helper.__flowScriptBodyLine);
				});
				var rootFromFunctions = { version: 1, helpers: helpers, nodes: [] };
				if (Object.keys(flowMeta).length > 0) {
					rootFromFunctions.flow = flowMeta;
				}
				parseFlowScriptStatementsInto(helperBlocks, Object.assign({}, imports), {}, rootFromFunctions, flowScriptStatements(main.body, main.bodyLine));
				helpers.forEach(function (helper) { lowerLoopBareReturns(helper.nodes, false); });
				lowerLoopBareReturns(rootFromFunctions.nodes, false);
				return env.canonicalFlowDefinition(assignNames(rootFromFunctions));
			}
			// A statement-only Flow has the same root contract as a named function.
			// Its already parsed _flow header is metadata, never a local assignment.
			var root = { version: 1, helpers: [], nodes: [] };
			if (Object.keys(flowMeta).length > 0) root.flow = flowMeta;
			var statements = flowScriptStatements(code).filter(function (statement) {
				if (/^_flow\s*\(/.test(statement.text || "")) env.raise("FLOWSCRIPT_METADATA_DECLARATION_REQUIRED",
					"_flow is metadata, not a Flow block (line " + statement.line + ").",
					null, "Replace _flow({...}) with const _flow = {...}; review the exact code-patch proposal.");
				return !/^(?:const|let|var)\s+_flow\s*=/.test(statement.text || "");
			});
			parseFlowScriptStatementsInto(blocks, {}, {}, root, statements);
			lowerLoopBareReturns(root.nodes, false);
			return env.canonicalFlowDefinition(assignNames(root));
		}
	
		return {
			parseFlowScriptArgs: parseFlowScriptArgs,
			parseFlowScriptMetadataValue: parseFlowScriptMetadataValue,
			stripFlowScriptComment: stripFlowScriptComment,
			addFlowScriptNode: addFlowScriptNode,
			flowScriptBalance: flowScriptBalance,
			flowScriptStatementComplete: flowScriptStatementComplete,
			flowScriptBalanceProblem: flowScriptBalanceProblem,
			flowScriptMissingClosers: flowScriptMissingClosers,
			flowScriptMissingGroupClosers: flowScriptMissingGroupClosers,
			flowScriptStatements: flowScriptStatements,
			stripFlowScriptSemicolon: stripFlowScriptSemicolon,
			splitFlowScriptTopLevel: splitFlowScriptTopLevel,
			isFlowScriptQuoted: isFlowScriptQuoted,
			isFlowScriptTemplateLiteral: isFlowScriptTemplateLiteral,
			unquoteFlowScriptString: unquoteFlowScriptString,
			isFlowScriptObjectLiteral: isFlowScriptObjectLiteral,
			isFlowScriptArrayLiteral: isFlowScriptArrayLiteral,
			parseFlowScriptObjectLiteral: parseFlowScriptObjectLiteral,
			flowScriptPropKind: flowScriptPropKind,
			flowScriptRewriteExpression: flowScriptRewriteExpression,
			flowScriptExpressionFromToken: flowScriptExpressionFromToken,
			flowScriptPathFromToken: flowScriptPathFromToken,
			flowScriptSelectorPathFromToken: flowScriptSelectorPathFromToken,
			flowScriptObjectPathSelector: flowScriptObjectPathSelector,
			singleFlowScriptInputProp: singleFlowScriptInputProp,
			primaryFlowScriptInputProp: primaryFlowScriptInputProp,
			flowScriptLiteralTokenValue: flowScriptLiteralTokenValue,
			flowScriptValueObjectFromToken: flowScriptValueObjectFromToken,
			flowScriptValueArrayFromToken: flowScriptValueArrayFromToken,
			flowScriptTemplateLiteralToTemplate: flowScriptTemplateLiteralToTemplate,
			flowScriptValueFromToken: flowScriptValueFromToken,
			normalizeNaturalFlowScriptProps: normalizeNaturalFlowScriptProps,
			flowScriptPropertyValueFromToken: flowScriptPropertyValueFromToken,
			parseNaturalFlowScriptCall: parseNaturalFlowScriptCall,
			parseNaturalFlowScriptCallMember: parseNaturalFlowScriptCallMember,
			parseNaturalFlowScriptCallWithBody: parseNaturalFlowScriptCallWithBody,
			capitalizedIdentifier: capitalizedIdentifier,
			naturalFlowScriptObjectFields: naturalFlowScriptObjectFields,
			naturalFlowScriptJsonObjectNode: naturalFlowScriptJsonObjectNode,
			buildNaturalListMapBlockCallNodes: buildNaturalListMapBlockCallNodes,
			buildNaturalListMapObjectArgNodes: buildNaturalListMapObjectArgNodes,
			buildNaturalListMapNodes: buildNaturalListMapNodes,
			buildNaturalFlowScriptCall: buildNaturalFlowScriptCall,
			buildNaturalFlowScriptAssignment: buildNaturalFlowScriptAssignment,
			buildNaturalScopeAssignment: buildNaturalScopeAssignment,
			buildNaturalFlowScriptReturn: buildNaturalFlowScriptReturn,
			resolveFlowScriptName: resolveFlowScriptName,
			parseFlowScriptImport: parseFlowScriptImport,
			parseFlowScriptBodyNodes: parseFlowScriptBodyNodes,
			splitFlowScriptFunctions: splitFlowScriptFunctions,
			mainFlowScriptFunctionIndex: mainFlowScriptFunctionIndex,
			flowScriptFunctionParams: flowScriptFunctionParams,
			helperBlockDefinitions: helperBlockDefinitions,
			parseFlowScriptTopLevelObjectFromCode: parseFlowScriptTopLevelObjectFromCode,
			trackFlowScriptLocalWrite: trackFlowScriptLocalWrite,
			trackFlowScriptNodeWrites: trackFlowScriptNodeWrites,
			parseFlowScriptStatementsInto: parseFlowScriptStatementsInto,
			parseFlowScript: parseFlowScript
		};
	}

	return {
		correctSource: correctSource,
		sourceStart: sourceStart,
		sourceEnd: sourceEnd,
		prefixOperatorCount: prefixOperatorCount,
		parseFlowScriptArgs: function (text, lineNumber, env) {
			return create(env).parseFlowScriptArgs(text, lineNumber);
		},
		stripFlowScriptComment: function (line, env) {
			return create(env).stripFlowScriptComment(line);
		},
		addFlowScriptNode: function (target, node, env) {
			return create(env).addFlowScriptNode(target, node);
		},
		flowScriptBalance: function (text, env) {
			return create(env).flowScriptBalance(text);
		},
		flowScriptStatementComplete: function (text, env) {
			return create(env).flowScriptStatementComplete(text);
		},
		flowScriptBalanceProblem: function (balance, env) {
			return create(env).flowScriptBalanceProblem(balance);
		},
		flowScriptMissingClosers: function (balance, env) {
			return create(env).flowScriptMissingClosers(balance);
		},
		flowScriptMissingGroupClosers: function (balance, env) {
			return create(env).flowScriptMissingGroupClosers(balance);
		},
		flowScriptStatements: function (code, env) {
			return create(env).flowScriptStatements(code);
		},
		stripFlowScriptSemicolon: function (text, env) {
			return create(env).stripFlowScriptSemicolon(text);
		},
		splitFlowScriptTopLevel: function (text, separator, env) {
			return create(env).splitFlowScriptTopLevel(text, separator);
		},
		isFlowScriptQuoted: function (text, env) {
			return create(env).isFlowScriptQuoted(text);
		},
		isFlowScriptTemplateLiteral: function (text, env) {
			return create(env).isFlowScriptTemplateLiteral(text);
		},
		unquoteFlowScriptString: function (text, env) {
			return create(env).unquoteFlowScriptString(text);
		},
		isFlowScriptObjectLiteral: function (text, env) {
			return create(env).isFlowScriptObjectLiteral(text);
		},
		isFlowScriptArrayLiteral: function (text, env) {
			return create(env).isFlowScriptArrayLiteral(text);
		},
		parseFlowScriptObjectLiteral: function (text, lineNumber, env) {
			return create(env).parseFlowScriptObjectLiteral(text, lineNumber);
		},
		parseFlowScriptMetadataValue: function (text, lineNumber, env) {
			return create(env).parseFlowScriptMetadataValue(text, lineNumber);
		},
		flowScriptPropKind: function (blocks, block, key, env) {
			return create(env).flowScriptPropKind(blocks, block, key);
		},
		rewriteExpressionReferences: rewriteExpressionReferences,
		flowScriptRewriteExpression: function (expr, locals, env) {
			return create(env).flowScriptRewriteExpression(expr, locals);
		},
		flowScriptExpressionFromToken: function (token, locals, env) {
			return create(env).flowScriptExpressionFromToken(token, locals);
		},
		flowScriptPathFromToken: function (token, locals, env) {
			return create(env).flowScriptPathFromToken(token, locals);
		},
		flowScriptLiteralTokenValue: function (token, lineNumber, env) {
			return create(env).flowScriptLiteralTokenValue(token, lineNumber);
		},
		flowScriptValueObjectFromToken: function (token, locals, lineNumber, env) {
			return create(env).flowScriptValueObjectFromToken(token, locals, lineNumber);
		},
		flowScriptValueArrayFromToken: function (token, locals, lineNumber, env) {
			return create(env).flowScriptValueArrayFromToken(token, locals, lineNumber);
		},
		flowScriptTemplateLiteralToTemplate: function (token, locals, lineNumber, env) {
			return create(env).flowScriptTemplateLiteralToTemplate(token, locals, lineNumber);
		},
		flowScriptValueFromToken: function (token, locals, lineNumber, env) {
			return create(env).flowScriptValueFromToken(token, locals, lineNumber);
		},
		normalizeNaturalFlowScriptProps: function (blocks, block, parsed, locals, lineNumber, env) {
			return create(env).normalizeNaturalFlowScriptProps(blocks, block, parsed, locals, lineNumber);
		},
		flowScriptPropertyValueFromToken: function (blocks, block, key, token, locals, lineNumber, env) {
			return create(env).flowScriptPropertyValueFromToken(blocks, block, key, token, locals, lineNumber);
		},
		parseNaturalFlowScriptCall: function (text, env) {
			return create(env).parseNaturalFlowScriptCall(text);
		},
		parseNaturalFlowScriptCallMember: function (text, env) {
			return create(env).parseNaturalFlowScriptCallMember(text);
		},
		parseNaturalFlowScriptCallWithBody: function (text, env) {
			return create(env).parseNaturalFlowScriptCallWithBody(text);
		},
		capitalizedIdentifier: function (value, env) {
			return create(env).capitalizedIdentifier(value);
		},
		naturalFlowScriptObjectFields: function (text, env) {
			return create(env).naturalFlowScriptObjectFields(text);
		},
		naturalFlowScriptJsonObjectNode: function (id, outPath, fields, locals, lineNumber, env) {
			return create(env).naturalFlowScriptJsonObjectNode(id, outPath, fields, locals, lineNumber);
		},
		buildNaturalListMapBlockCallNodes: function (blocks, imports, varName, itemToken, callToken, locals, lineNumber, env) {
			return create(env).buildNaturalListMapBlockCallNodes(blocks, imports, varName, itemToken, callToken, locals, lineNumber);
		},
		buildNaturalListMapObjectArgNodes: function (blocks, imports, varName, arg, locals, lineNumber, env) {
			return create(env).buildNaturalListMapObjectArgNodes(blocks, imports, varName, arg, locals, lineNumber);
		},
		buildNaturalListMapNodes: function (blocks, imports, varName, args, locals, lineNumber, env) {
			return create(env).buildNaturalListMapNodes(blocks, imports, varName, args, locals, lineNumber);
		},
		buildNaturalFlowScriptCall: function (blocks, imports, locals, varName, rhs, lineNumber, env) {
			return create(env).buildNaturalFlowScriptCall(blocks, imports, locals, varName, rhs, lineNumber);
		},
		buildNaturalFlowScriptAssignment: function (blocks, imports, locals, varName, rhs, lineNumber, env) {
			return create(env).buildNaturalFlowScriptAssignment(blocks, imports, locals, varName, rhs, lineNumber);
		},
		buildNaturalScopeAssignment: function (blocks, imports, locals, scopePath, rhs, lineNumber, env) {
			return create(env).buildNaturalScopeAssignment(blocks, imports, locals, scopePath, rhs, lineNumber);
		},
		buildNaturalFlowScriptReturn: function (expr, locals, lineNumber, env) {
			return create(env).buildNaturalFlowScriptReturn(expr, locals, lineNumber);
		},
		resolveFlowScriptName: function (name, imports, env) {
			return create(env).resolveFlowScriptName(name, imports);
		},
		parseFlowScriptImport: function (line, lineNumber, imports, env) {
			return create(env).parseFlowScriptImport(line, lineNumber, imports);
		},
		parseFlowScriptBodyNodes: function (blocks, imports, locals, body, env) {
			return create(env).parseFlowScriptBodyNodes(blocks, imports, locals, body);
		},
		splitFlowScriptFunctions: function (code, env) {
			return create(env).splitFlowScriptFunctions(code);
		},
		mainFlowScriptFunctionIndex: function (functions, env) {
			return create(env).mainFlowScriptFunctionIndex(functions);
		},
		flowScriptFunctionParams: function (fn, allowObjectSignature, env) {
			return create(env).flowScriptFunctionParams(fn, allowObjectSignature);
		},
		helperBlockDefinitions: function (helpers, env) {
			return create(env).helperBlockDefinitions(helpers);
		},
		parseFlowScriptTopLevelObjectFromCode: function (code, name, env) {
			return create(env).parseFlowScriptTopLevelObjectFromCode(code, name);
		},
		trackFlowScriptLocalWrite: function (locals, path, env) {
			return create(env).trackFlowScriptLocalWrite(locals, path);
		},
		trackFlowScriptNodeWrites: function (locals, node, env) {
			return create(env).trackFlowScriptNodeWrites(locals, node);
		},
		parseFlowScriptStatementsInto: function (blocks, imports, locals, root, statements, env) {
			return create(env).parseFlowScriptStatementsInto(blocks, imports, locals, root, statements);
		},
		parseFlowScript: function (blocks, code, env, options) {
			return create(env).parseFlowScript(blocks, code, options);
		}
	};
}())
