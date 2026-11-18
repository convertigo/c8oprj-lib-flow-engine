(function () {
	// The FlowScript v3 text of a Flow definition (docs/flowscript-v3.md, section 14). A node keeps the writing of its
	// author through its __flowScript* fields; without them it takes its natural JavaScript form where the meaning is
	// identical, and its call form otherwise. A natural form is only kept when reading the rendered text back gives the
	// same definition: renderGuarded() renders, reads back, and turns the natural forms the guard refuses into calls.

	var CONTROL_CALLS = { "while": "flow.while", forEach: "flow.forEach", "if": "flow.if", "try": "flow.try" };
	// list block -> [JavaScript method, per-item property]
	var ARROW_METHODS = {
		"list.filter": ["filter", "where"], "list.map": ["map", "select"], "list.find": ["find", "where"],
		"list.some": ["some", "where"], "list.every": ["every", "where"]
	};
	// block -> [JavaScript global, its property]
	var GLOBAL_CALLS = {
		"object.keys": ["Object.keys", "source"], "object.values": ["Object.values", "source"],
		"json.parse": ["JSON.parse", "text"], "json.stringify": ["JSON.stringify", "value"]
	};
	// Values the runtime reads exactly as an absent property: while.block.js (bounded, 1000 and 60000),
	// try.block.js (props.error || "local.error"), return.block.js (no value reads result) and list/sort.block.js
	// (props.direction || "asc"). A natural form leaves them out; the reader may write them.
	var RUNTIME_DEFAULTS = {
		"while": { maxIterations: 1000, timeoutMs: 60000 },
		"try": { error: "local.error" },
		"return": { value: "${result}" },
		"list.sort": { direction: "asc" }
	};
	var RESERVED_NAMES = /^(?:flow|input|config|local|result|request|current|parent|trace|__.*)$/;
	var BLOCK_NAMESPACES = /^(?:text|list|json|http|object|email|sql|date|number|crypto|requestable)$/;
	var RESERVED_WORDS = ("break case catch class const continue debugger default delete do else enum export extends false " +
		"finally for function if import in instanceof new null return super switch this throw true try typeof var void " +
		"while with yield let static implements interface package private protected public await async of arguments eval " +
		"undefined NaN Infinity").split(" ").reduce(function (all, word) { all[word] = true; return all; }, Object.create(null));
	var IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
	var HIDDEN_LOCAL = /^local\.__chain\d+$/;

	function isIdentifier(name) { return IDENTIFIER.test(String(name || "")) && !RESERVED_WORDS[name]; }

	function blockOf(node) { return String(node && (node.block || node.type) || ""); }

	function hasOwn(object, key) { return Object.prototype.hasOwnProperty.call(object || {}, key); }

	// Whether a property holds the value the runtime reads when it is absent (list.sort reads order before its
	// default direction).
	function runtimeDefault(node, key) {
		var props = node.props || {}, defaults = RUNTIME_DEFAULTS[blockOf(node)] || {};
		if (!hasOwn(defaults, key) || JSON.stringify(props[key]) !== JSON.stringify(defaults[key])) return false;
		return !(blockOf(node) === "list.sort" && key === "direction" && props.order !== undefined);
	}

	// The properties a natural form must account for: those equal to their runtime default count as absent.
	function effectiveProps(node) {
		var props = node.props || {}, out = {};
		Object.keys(props).forEach(function (key) {
			if (props[key] === undefined || runtimeDefault(node, key)) return;
			out[key] = props[key];
		});
		return out;
	}

	function sameKeys(props, keys) {
		var actual = Object.keys(props).sort();
		return actual.length === keys.length && keys.slice().sort().every(function (key, index) { return actual[index] === key; });
	}

	function containsBlock(value) {
		if (!value || typeof value !== "object") return false;
		if (value.__flowBlock) return true;
		return Object.keys(value).some(function (key) { return containsBlock(value[key]); });
	}

	// The expression held by a stored value: "${local.x}" is local.x, an expression property is itself.
	function expressionOf(value, env) {
		if (typeof value !== "string") return null;
		var exact = env.templateSyntax.exactExpression(value);
		return exact !== null ? String(exact).trim() : null;
	}

	function rawExpression(value, env) {
		if (typeof value !== "string") return null;
		var exact = expressionOf(value, env);
		if (exact !== null) return exact;
		return env.templateSyntax.hasExpression(value) ? null : String(value).trim();
	}

	function simpleLocal(path) {
		var match = /^local\.([A-Za-z_$][\w$]*)$/.exec(String(path || ""));
		return match ? match[1] : "";
	}

	// Every local name a Flow writes or reads (local.<name>), helper parameters and import aliases: a loop variable,
	// an arrow parameter or a catch parameter never takes one of them (FLOWSCRIPT_V3_LOCAL_ALIAS, _SHADOWING).
	function flowNames(definition) {
		var names = Object.create(null), text = JSON.stringify(definition || {}), match, pattern = /\blocal\s*\.\s*([A-Za-z_$][\w$]*)/g;
		while ((match = pattern.exec(text)) !== null) names[match[1]] = true;
		(definition.helpers || []).forEach(function (helper) {
			names[helper.name] = true;
			(helper.params || Object.keys(helper.props || {})).forEach(function (param) { names[param] = true; });
		});
		pattern = /"block"\s*:\s*"([A-Za-z_$][\w$]*)\./g;
		while ((match = pattern.exec(text)) !== null) names[match[1]] = true;
		return names;
	}

	function countOccurrences(text, needle) {
		var count = 0, pattern = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\w$])", "g");
		while (pattern.exec(text) !== null) count++;
		return count;
	}

	function create(blocks, definition, options, env) {
		options = options || {};
		var forced = options.call || {};
		var v2 = env.v2Renderer;
		var codec = env.sourceAttributeNameCodec();
		var names = flowNames(definition);
		var definitionText = JSON.stringify(definition || {});
		var natural = [];
		// locals created by json.array or json.map: their push and put have a natural form (the bridge reads them back)
		var typedLists = Object.create(null), typedMaps = Object.create(null);
		function scan(list) {
			(list || []).forEach(function (node) {
				if (!node || typeof node !== "object") return;
				var name = simpleLocal(node.out);
				if (name && blockOf(node) === "json.array") typedLists[name] = true;
				if (name && blockOf(node) === "json.map") typedMaps[name] = true;
				Object.keys(node).forEach(function (key) { if (key !== "props" && Array.isArray(node[key])) scan(node[key]); });
			});
		}
		scan(definition.nodes);
		(definition.helpers || []).forEach(function (helper) { scan(helper.nodes); });

		// A natural form is taken unless the guard sent it back to its call form.
		function choose(key, kind) {
			if (forced[key + ":" + kind]) return false;
			natural.push({ key: key + ":" + kind, kind: kind });
			return true;
		}

		function freeName(preferred, ctx) {
			if (preferred && isIdentifier(preferred) && !RESERVED_NAMES.test(preferred) && !BLOCK_NAMESPACES.test(preferred)
				&& !names[preferred] && !ctx.visible[preferred]) return preferred;
			for (var rank = 1; ; rank++) {
				var candidate = "item" + (rank > 1 ? rank : "");
				if (!names[candidate] && !ctx.visible[candidate]) return candidate;
			}
		}

		// locals: written name -> stored target (renderFlowScriptExpression writes the target as the name). One target
		// has one name: a loop variable replaces the name current had in the enclosing loop.
		function withLocal(locals, name, target) {
			var out = {};
			Object.keys(locals).forEach(function (key) { if (String(locals[key]) !== String(target)) out[key] = locals[key]; });
			out[name] = target;
			return out;
		}

		function withoutTarget(locals, target) {
			var out = {};
			Object.keys(locals).forEach(function (key) { if (String(locals[key]) !== String(target)) out[key] = locals[key]; });
			return out;
		}

		function bindsCurrent(node, key) {
			var block = blockOf(node);
			if (ARROW_METHODS[block] && ARROW_METHODS[block][1] === key) return true;
			if (block === "list.sort" && key === "by") return true;
			return env.propertyBindsCurrent ? env.propertyBindsCurrent(blocks, block, key) === true : false;
		}

		function value(node, key, raw, ctx, indent, column) {
			var locals = bindsCurrent(node, key) ? withoutTarget(ctx.locals, "current") : ctx.locals;
			var kind = env.flowScriptPropKind(blocks, blockOf(node), key);
			if (raw && typeof raw === "object" && ["expression", "template", "value", "binding", "configOverrides"].indexOf(kind) < 0) {
				// a literal object (a schema, options) is written as JavaScript, its keys unquoted
				return v2.flowScriptCompound(env.normalizeTree(raw), indent || "", v2.sourceLiteral, false, column);
			}
			return v2.renderFlowScriptValue(blocks, node, key, raw, locals, env, indent, column);
		}

		function expression(text, locals) {
			return v2.renderFlowScriptExpression(text, locals, env);
		}

		function callArguments(node, args, ctx, indent, assignedOutput) {
			var parts = [];
			["id", "comment", "disabled", "out"].forEach(function (name) {
				if (name === "out" && assignedOutput) return;
				if (node[name] !== undefined) parts.push(codec.encode("engine", name) + ": " + v2.flowScriptInlineValue(node[name], env));
			});
			var values = Object.create(null);
			Object.keys(args).forEach(function (key) {
				if (["id", "comment", "disabled", "out"].indexOf(key) === -1) values[key] = args[key];
			});
			Object.keys(node.props || {}).forEach(function (key) { values[key] = node.props[key]; });
			// an assignment fills the destination property of json.array or json.map (declares: "out")
			var destination = assignedOutput && env.destinationProperty ? env.destinationProperty(blocks, blockOf(node)) : "";
			if (destination && values[destination] === assignedOutput) delete values[destination];
			Object.keys(values).forEach(function (key) {
				var written = v2.flowScriptObjectKey(codec.encode("property", key));
				parts.push(written + ": " + value(node, key, values[key], ctx, indent, indent.length + written.length + 2));
			});
			return parts;
		}

		// The natural expression of a list method, a sorted copy or a global call, or null.
		function naturalExpression(node, ctx, key) {
			var block = blockOf(node), props = effectiveProps(node);
			if (node.disabled !== undefined || node.__flowScriptForm === "call") return null;
			if (ARROW_METHODS[block]) {
				var method = ARROW_METHODS[block][0], per = ARROW_METHODS[block][1];
				if (!hasOwn(props, "items") || !hasOwn(props, per) || !sameKeys(props, ["items", per])) return null;
				if (containsBlock(props[per]) || (props[per] && typeof props[per] === "object" && method !== "map")) return null;
				if (!choose(key, "list")) return null;
				var param = freeName(node.__flowScriptAs, ctx), inner = withLocal(ctx.locals, param, "current");
				var body = v2.renderFlowScriptValue(blocks, node, per, props[per], inner, env, "", 0);
				if (props[per] && typeof props[per] === "object" && !Array.isArray(props[per])) body = "(" + body + ")";
				return value(node, "items", props.items, ctx, "", 0) + "." + method + "(" + param + " => " + body + ")";
			}
			if (block === "list.sort") {
				return sortExpression(node, props, ctx, key);
			}
			if (GLOBAL_CALLS[block]) {
				var global = GLOBAL_CALLS[block], keys = [global[1]];
				if (block === "json.stringify" && hasOwn(props, "pretty")) {
					if (props.pretty !== true) return null;
					keys.push("pretty");
				}
				if (!hasOwn(props, global[1]) || !sameKeys(props, keys) || containsBlock(props[global[1]])) return null;
				if (!choose(key, "global")) return null;
				return global[0] + "(" + value(node, global[1], props[global[1]], ctx, "", 0) + (props.pretty === true ? ", null, 2" : "") + ")";
			}
			return null;
		}

		// toSorted with the comparator of compare (sections 7 and 15): number a.k - b.k, locale a.k.localeCompare(b.k),
		// natural the relational form; then adds the next keys with ||.
		function sortExpression(node, props, ctx, key) {
			var allowed = ["items", "by", "compare", "direction", "then"];
			if (!hasOwn(props, "items") || !hasOwn(props, "compare") || Object.keys(props).some(function (name) { return allowed.indexOf(name) < 0; })) return null;
			function keyComparator(by, compare, direction) {
				if (["number", "locale", "natural"].indexOf(compare) < 0) return null;
				if (direction !== undefined && direction !== "asc" && direction !== "desc") return null;
				var field = "";
				if (by !== undefined && by !== "current") {
					var match = /^current\.([A-Za-z_$][\w$]*)$/.exec(rawExpression(by, env) || "");
					if (!match) return null;
					field = "." + match[1];
				}
				var left = direction === "desc" ? "b" : "a", right = direction === "desc" ? "a" : "b";
				if (compare === "number") return left + field + " - " + right + field;
				if (compare === "locale") return left + field + ".localeCompare(" + right + field + ")";
				return left + field + " < " + right + field + " ? -1 : (" + left + field + " > " + right + field + " ? 1 : 0)";
			}
			var parts = [keyComparator(props.by, props.compare, props.direction)];
			if (props.then !== undefined) {
				if (!Array.isArray(props.then)) return null;
				props.then.forEach(function (next) {
					parts.push(next && typeof next === "object" ? keyComparator(next.by, next.compare, next.direction) : null);
				});
			}
			if (parts.some(function (part) { return !part; })) return null;
			if (!choose(key, "sort")) return null;
			if (parts.length > 1) parts = parts.map(function (part) { return part.indexOf("?") >= 0 ? "(" + part + ")" : part; });
			return value(node, "items", props.items, ctx, "", 0) + ".toSorted((a, b) => " + parts.join(" || ") + ")";
		}

		// Hidden intermediates of a chain (local.__chain<N>, D4): a producer whose only reader is the next node is
		// written inside that node's expression. find, some and every read back as filter steps.
		function planChains(nodes) {
			var plan = Object.create(null);
			(nodes || []).forEach(function (node, index) {
				var target = node && (node.out !== undefined ? node.out : blockOf(node) === "set" ? (node.props || {}).path : undefined);
				if (!HIDDEN_LOCAL.test(String(target || "")) || index + 1 >= nodes.length) return;
				if (node.comment !== undefined || node.disabled !== undefined || (node.id && node.id !== node.__flowImplicitId)) return;
				if (countOccurrences(definitionText, String(target)) !== 2) return;
				var consumer = nodes[index + 1];
				if (!consumer || countOccurrences(JSON.stringify(consumer.props || {}), String(target)) !== 1 || consumer.__flowBlankBefore || consumer.comment !== undefined) return;
				if (countOccurrences(JSON.stringify(Object.assign({}, consumer, { props: null })), String(target)) !== 0) return;
				plan[index] = { target: String(target) };
			});
			return plan;
		}

		function chainExpression(node, ctx, key) {
			if (blockOf(node) === "set") {
				var exact = sameKeys(node.props || {}, ["path", "value"]) ? expressionOf(node.props.value, env) : null;
				return exact === null || !choose(key, "chain") ? null : "(" + expression(exact, ctx.locals) + ")";
			}
			return naturalExpression(node, ctx, key);
		}

		// The idioms the prototype bridge lowers find, some and every to: a filter step read as [0], .length > 0 or,
		// on a negated filter, .length == 0.
		function idiom(producer, consumer, target, ctx, key) {
			if (blockOf(producer) !== "list.filter" || blockOf(consumer) !== "set" || !sameKeys(consumer.props || {}, ["path", "value"])
				|| consumer.out !== undefined || consumer.disabled !== undefined || consumer.__flowScriptForm || consumer.__flowScriptDeclare
				|| !/^(local|result|parent)(\.[A-Za-z_$][\w$]*)+$/.test(String(consumer.props.path))
				|| (consumer.id && consumer.id !== consumer.__flowImplicitId && !isIdentifier(consumer.id))) return null;
			var read = expressionOf(consumer.props.value, env), props = effectiveProps(producer);
			if (read === null || !sameKeys(props, ["items", "where"]) || containsBlock(props.where) || typeof props.where !== "string") return null;
			var method = read === target + "[0]" ? "find" : read === target + ".length > 0" ? "some" : read === target + ".length == 0" ? "every" : "";
			var where = rawExpression(props.where, env);
			if (!method || where === null) return null;
			if (method === "every") {
				var negated = /^!\(([\s\S]*)\)$/.exec(where);
				if (!negated || !balanced(negated[1])) return null;
				where = negated[1];
			}
			if (!choose(key, "list")) return null;
			var param = freeName(producer.__flowScriptAs, ctx);
			return value(producer, "items", props.items, ctx, "", 0) + "." + method + "(" + param + " => " + expression(where, withLocal(ctx.locals, param, "current")) + ")";
		}

		function balanced(text) {
			var depth = 0, quote = "";
			for (var i = 0; i < text.length; i++) {
				var c = text.charAt(i);
				if (quote) { if (c === "\\") i++; else if (c === quote) quote = ""; continue; }
				if (c === "\"" || c === "'" || c === "`") quote = c;
				else if (c === "(" || c === "[" || c === "{") depth++;
				else if (c === ")" || c === "]" || c === "}") { if (--depth < 0) return false; }
			}
			return depth === 0 && !quote;
		}

		// A catch parameter needs a simple error local read only inside the catch bodies that receive it (R-TRY-ESCAPE).
		function catchName(node, ctx) {
			var props = effectiveProps(node), error = hasOwn(props, "error") ? props.error : "local.error";
			if (Object.keys(props).some(function (key) { return key !== "error"; })) return "";
			var name = simpleLocal(error);
			if (!name || !isIdentifier(name) || RESERVED_NAMES.test(name) || BLOCK_NAMESPACES.test(name) || ctx.visible[name]) return "";
			var target = "local." + name, inside = 0;
			(function count(list) {
				(list || []).forEach(function (item) {
					if (blockOf(item) === "try" && simpleLocal(effectiveProps(item).error || "local.error") === name) {
						inside += countOccurrences(JSON.stringify(item["catch"] || []), target);
						count(item["try"]);
						return;
					}
					Object.keys(item || {}).forEach(function (key) { if (key !== "props" && Array.isArray(item[key])) count(item[key]); });
				});
			})(definition.nodes);
			(definition.helpers || []).forEach(function (helper) { if (countOccurrences(JSON.stringify(helper), target)) inside = -1; });
			var total = countOccurrences(definitionText, target);
			var declared = 0;
			(function errors(list) {
				(list || []).forEach(function (item) {
					if (blockOf(item) === "try" && hasOwn(item.props || {}, "error") && simpleLocal(item.props.error) === name) declared++;
					Object.keys(item || {}).forEach(function (key) { if (key !== "props" && Array.isArray(item[key])) errors(item[key]); });
				});
			})(definition.nodes);
			if (inside < 0 || total !== inside + declared) return "";
			if (JSON.stringify(node["catch"] || []).indexOf("\"path\":\"" + target) >= 0 || JSON.stringify(node["catch"] || []).indexOf("\"out\":\"" + target) >= 0) return "";
			return name;
		}

		function compound(node, ctx) {
			var form = node.__flowScriptForm, path = (node.props || {}).path, read = rawExpression((node.props || {}).value, env);
			if (!form || form === "call" || read === null) return null;
			var target = String(path);
			var written = expression(target, ctx.locals);
			if (form === "++" || form === "--") {
				return read === target + (form === "++" ? " + 1" : " - 1") ? written + form : null;
			}
			var match = /^([+\-*\/])=$/.exec(form);
			if (!match) return null;
			var prefix = target + " " + match[1] + " (";
			if (read.indexOf(prefix) !== 0 || read.charAt(read.length - 1) !== ")" || !balanced(read.substring(prefix.length, read.length - 1))) return null;
			return written + " " + form + " " + expression(read.substring(prefix.length, read.length - 1), ctx.locals);
		}

		function renderNodes(nodes, depth, lines, ctx, path) {
			var skip = 0, chains = planChains(nodes), pending = null;
			(nodes || []).forEach(function (node, index) {
				if (skip) { skip--; return; }
				var key = path + "." + index;
				var stepCtx = pending ? ctx.withLocals(withLocal(ctx.locals, pending.expression, pending.target)) : ctx;
				pending = null;
				if (chains[index]) {
					var consumer = nodes[index + 1], consumerKey = path + "." + (index + 1), target = chains[index].target;
					var joined = forced[consumerKey + ":set"] ? null : idiom(node, consumer, target, stepCtx, key);
					if (joined !== null) {
						renderStatement(consumer, depth, lines, stepCtx, consumerKey, joined, nodes, index + 1, function () {});
						skip = 1;
						return;
					}
					var expr = chainExpression(node, stepCtx, key);
					if (expr !== null) {
						pending = { target: target, expression: expr };
						return;
					}
				}
				renderStatement(node, depth, lines, stepCtx, key, null, nodes, index, function (count) { skip = count; });
			});
		}

		function renderStatement(node, depth, lines, ctx, key, joined, siblings, index, skipNext) {
			node = Object.assign({}, node);
			var indent = new Array(depth + 1).join("  "), type = blockOf(node);
			if (node.__flowBlankBefore && lines.length && lines[lines.length - 1] !== "") lines.push("");
			var directive = node.disabled === true;
			if (node.comment !== undefined) {
				String(node.comment).split("\n").forEach(function (line) { lines.push(indent + "//" + (line ? " " + line : "")); });
				if (/(^|\n)\s*@disabled\b/.test(String(node.comment))) directive = false;
				delete node.comment;
			}
			if (type === "comment") return;
			var explicit = node.id && node.id !== node.__flowImplicitId;
			var labelable = !explicit || isIdentifier(node.id);
			var label = explicit && labelable ? node.id + ": " : "";
			var props = node.props || {}, effective = effectiveProps(node), keys = Object.keys(effective);
			var outPath = typeof node.out === "string" && /^(local|result|parent)(\.[A-Za-z_$][\w$]*)+$/.test(node.out) ? node.out : "";
			var plain = node.out === undefined && labelable && node.__flowScriptForm !== "call";
			var callable = labelable && node.__flowScriptForm !== "call";
			var disabledLine = node.disabled === true ? (directive ? indent + "// @disabled" : null) : null;
			function push(text) {
				if (disabledLine) lines.push(disabledLine);
				lines.push(indent + label + text);
			}
			// return { ... } written by its author (__flowReturnCount, as in v2)
			var count = node.__flowReturnCount, group = count && siblings ? siblings.slice(index, index + count) : [];
			if (group.slice(0, -1).some(function (n, i, all) { return all.slice(0, i).some(function (p) { return p.props && n.props && p.props.path === n.props.path; }); })) count = 0;
			if (plain && node.disabled === undefined && count && group.length === count && blockOf(group[count - 1]) === "return" && group[count - 1].disabled === undefined
				&& group[count - 1].out === undefined && group[count - 1].id === group[count - 1].__flowImplicitId && Object.keys(effectiveProps(group[count - 1])).length === 0
				&& group.slice(0, -1).every(function (n, i) {
					return blockOf(n) === "set" && Object.keys(n.props || {}).length === 2 && /^result\.[A-Za-z_$][\w$]*$/.test(n.props.path) && n.disabled === undefined
						&& n.out === undefined && (!i || n.comment === undefined && !n.__flowBlankBefore) && (!i || n.id === n.__flowImplicitId);
				}) && choose(key, "return-object")) {
				var fields = Object.create(null);
				group.slice(0, -1).forEach(function (n) { Object.defineProperty(fields, n.props.path.substring(7), { value: n.props.value, enumerable: true, configurable: true }); });
				lines.push(indent + label + "return " + v2.renderFlowScriptTemplateValue(fields, ctx.locals, env, indent, (indent + label + "return ").length));
				skipNext(count - 1);
				return;
			}
			if (plain && type === "set" && keys.length === 2 && hasOwn(effective, "path") && hasOwn(effective, "value")
				&& /^(local|result|parent)(\.[A-Za-z_$][\w$]*)+$/.test(props.path) && choose(key, "set")) {
				if (joined !== null && joined !== undefined) {
					var joinedPath = expression(String(props.path), ctx.locals);
					push(joinedPath + " = " + joined);
					return;
				}
				var compoundText = node.__flowScriptForm && choose(key, "compound") ? compound(node, ctx) : null;
				if (compoundText !== null) { push(compoundText); return; }
				var declared = node.__flowScriptDeclare === "const" || node.__flowScriptDeclare === "let" ? simpleLocal(props.path) : "";
				if (declared && isIdentifier(declared) && !RESERVED_NAMES.test(declared) && !BLOCK_NAMESPACES.test(declared) && !ctx.visible[declared]
					&& node.disabled === undefined && choose(key, "declare")) {
					ctx.declare(declared, props.path);
					var initial = props.value === undefined || props.value === "${undefined}" ? "" : " = " + value(node, "value", props.value, ctx, indent, (indent + label + node.__flowScriptDeclare + " " + declared + " = ").length);
					push(node.__flowScriptDeclare + " " + declared + initial);
					return;
				}
				var written = expression(String(props.path), ctx.locals);
				push(written + " = " + value(node, "value", props.value, ctx, indent, (indent + label + written + " = ").length));
				return;
			}
			if (plain && node.disabled === undefined && type === "if" && keys.length === 1 && keys[0] === "condition" && Array.isArray(node.then)
				&& (typeof props.condition !== "object" || props.condition === null) && choose(key, "if")) {
				lines.push(indent + label + "if (" + value(node, "condition", props.condition, ctx, indent) + ") {");
				renderNodes(node.then, depth + 1, lines, ctx.nested(), key + ".then");
				var otherwise = node["else"];
				while (Array.isArray(otherwise) && otherwise.length === 1 && isElseIf(otherwise[0]) && !forced[key + ".else.0:if"]
					&& choose(key + ".else.0", "elseif") && choose(key + ".else.0", "if")) {
					var inner = otherwise[0];
					lines.push(indent + "} else if (" + value(inner, "condition", inner.props.condition, ctx, indent) + ") {");
					renderNodes(inner.then, depth + 1, lines, ctx.nested(), key + ".else.0.then");
					key = key + ".else.0";
					otherwise = inner["else"];
				}
				if (Array.isArray(otherwise)) {
					lines.push(indent + "} else {");
					renderNodes(otherwise, depth + 1, lines, ctx.nested(), key + ".else");
				}
				lines.push(indent + "}");
				return;
			}
			if (plain && node.disabled === undefined && !label && type === "while" && keys.length === 1 && keys[0] === "condition" && Array.isArray(node.nodes)
				&& (typeof props.condition !== "object" || props.condition === null) && choose(key, "while")) {
				lines.push(indent + "while (" + value(node, "condition", props.condition, ctx, indent) + ") {");
				renderNodes(node.nodes, depth + 1, lines, ctx.nested({ loop: true }), key + ".nodes");
				lines.push(indent + "}");
				return;
			}
			if (plain && node.disabled === undefined && !label && type === "forEach" && keys.length === 1 && keys[0] === "items" && Array.isArray(node.nodes)
				&& choose(key, "loop")) {
				var variable = freeName(node.__flowScriptAs, ctx);
				lines.push(indent + "for (const " + variable + " of " + value(node, "items", props.items, ctx, indent) + ") {");
				renderNodes(node.nodes, depth + 1, lines, ctx.nested({ loop: true, locals: withLocal(ctx.locals, variable, "current"), name: variable }), key + ".nodes");
				lines.push(indent + "}");
				return;
			}
			if (type === "next" && node.disabled === undefined && !label && node.out === undefined && keys.length === 0 && ctx.loop && choose(key, "continue")) {
				lines.push(indent + "continue");
				return;
			}
			if (plain && node.disabled === undefined && type === "try" && Array.isArray(node["try"]) && Array.isArray(node["catch"])) {
				var errorName = catchName(node, ctx);
				if (errorName && choose(key, "try")) {
					lines.push(indent + label + "try {");
					renderNodes(node["try"], depth + 1, lines, ctx.nested(), key + ".try");
					lines.push(indent + "} catch (" + errorName + ") {");
					renderNodes(node["catch"], depth + 1, lines, ctx.nested({ locals: withLocal(ctx.locals, errorName, "local." + errorName), name: errorName }), key + ".catch");
					lines.push(indent + "}");
					return;
				}
			}
			if (plain && node.disabled === undefined && type === "return" && (!keys.length || keys.length === 1 && keys[0] === "value")) {
				lines.push(indent + label + "return" + (keys.length ? " " + value(node, "value", props.value, ctx, indent, (indent + label + "return ").length) : ""));
				return;
			}
			if (callable && node.out === undefined && type === "json.push" && sameKeys(effective, ["path", "value"]) && typedLists[simpleLocal(props.path)]
				&& choose(key, "push")) {
				push(expression(String(props.path), ctx.locals) + ".push(" + value(node, "value", props.value, ctx, indent) + ")");
				return;
			}
			if (callable && node.out === undefined && type === "json.put" && sameKeys(effective, ["path", "key", "value"]) && typedMaps[simpleLocal(props.path)]
				&& choose(key, "put")) {
				var mapPath = expression(String(props.path), ctx.locals) + "[" + value(node, "key", props.key, ctx, indent) + "]";
				push(mapPath + " = " + value(node, "value", props.value, ctx, indent, (indent + label + mapPath + " = ").length));
				return;
			}
			if (outPath && callable && node.disabled === undefined) {
				var naturalText = naturalExpression(node, ctx, key);
				if (naturalText !== null) {
					lines.push(indent + label + expression(outPath, ctx.locals) + " = " + naturalText);
					return;
				}
			}
			renderCall(node, depth, lines, ctx, key, label, outPath, labelable);
		}

		function isElseIf(node) {
			var props = node && node.props || {}, effective = effectiveProps(node || {});
			return blockOf(node) === "if" && node.comment === undefined && !node.__flowBlankBefore && node.disabled === undefined && node.out === undefined
				&& (!node.id || node.id === node.__flowImplicitId) && node.__flowScriptForm !== "call" && sameKeys(effective, ["condition"]) && Array.isArray(node.then)
				&& (typeof props.condition !== "object" || props.condition === null);
		}

		function renderCall(node, depth, lines, ctx, key, label, outPath, labelable) {
			var indent = new Array(depth + 1).join("  "), type = blockOf(node);
			if (!labelable) label = "";
			if (labelable) delete node.id;
			var throwNatural = type === "throw" && node.disabled === undefined && node.out === undefined && labelable && node.__flowScriptForm !== "call";
			var slotNames = v2.flowScriptSlotNames(blocks, node, env);
			var slots = slotNames.filter(function (slot) { return Array.isArray(node[slot]); });
			// a call with slots keeps its output as $$out: an assignment cannot hold slot functions (section 11)
			if (outPath && (slots.length || !choose(key, "assign"))) outPath = "";
			var args = Object.create(null);
			v2.flowScriptArgKeys(node, slotNames).forEach(function (name) { args[name] = node[name]; });
			var parts = callArguments(node, args, ctx, indent + "  ", outPath);
			var callee = CONTROL_CALLS[type] || type;
			var naturalThrow = throwNatural && !slots.length;
			var open = naturalThrow ? "throw {" : callee + "({", close = naturalThrow ? "}" : "})";
			var prefix = label + (outPath ? expression(outPath, ctx.locals) + " = " : "");
			var inline = indent + prefix + open + (parts.length ? " " + parts.join(", ") + " " : "") + close;
			if (!slots.length && inline.indexOf("\n") < 0 && inline.length <= 120) { lines.push(inline); return; }
			lines.push(indent + prefix + open);
			parts.forEach(function (part) { lines.push(indent + "  " + part + ","); });
			var slotCtx = ctx.nested({ loop: false });
			if (!(type === "if" || type === "while" || type === "try")) slotCtx = ctx.nested({ loop: false, locals: withoutTarget(ctx.locals, "current") });
			slots.forEach(function (slot) {
				var params = env.childSlotParams ? env.childSlotParams(blocks, node, slot) : [];
				lines.push(indent + "  " + v2.flowScriptObjectKey(codec.encode("engine", slot)) + ": function ("
					+ (params.length ? "{" + params.join(", ") + "}" : "") + ") {");
				renderNodes(node[slot], depth + 2, lines, slotCtx, key + "." + slot);
				lines.push(indent + "  },");
			});
			lines.push(indent + close);
		}

		function context(locals, visible, loop, base) {
			var ctx = { locals: locals, visible: visible, loop: loop };
			ctx.nested = function (changes) {
				changes = changes || {};
				var visibleNames = Object.assign(Object.create(null), ctx.visible);
				if (changes.name) visibleNames[changes.name] = true;
				return context(changes.locals || ctx.locals, visibleNames, changes.loop !== undefined ? changes.loop : ctx.loop, null);
			};
			ctx.withLocals = function (next) { return context(next, ctx.visible, ctx.loop, ctx); };
			ctx.declare = function (name, target) {
				ctx.visible[name] = true;
				ctx.locals = withLocal(ctx.locals, name, target);
				if (base) base.declare(name, target);
			};
			return ctx;
		}

		function render(name) {
			var lines = [];
			var flowMeta = Object.assign({ sourceVersion: 3 }, definition.flow || {});
			flowMeta.sourceVersion = 3;
			v2.flowScriptTopLevelMeta("flow", flowMeta, lines, env);
			var root = { "flow.default": "default" };
			lines.push("function " + env.safeIdentifier(name || "Flow") + "({ input, config, result }) {");
			renderNodes(definition.nodes || [], 1, lines, context(Object.assign({}, root), Object.create(null), false), "nodes");
			lines.push("}");
			(definition.helpers || []).forEach(function (helper, index) {
				var params = helper.params || Object.keys(helper.props || {}), locals = Object.assign({}, root);
				params.forEach(function (param) { locals[param] = "input." + param; });
				var visible = Object.create(null);
				params.forEach(function (param) { visible[param] = true; });
				lines.push("");
				lines.push("function " + env.safeIdentifier(helper.name || "helper") + "({ " + params.join(", ") + " }) {");
				renderNodes(helper.nodes || [], 1, lines, context(locals, visible, false), "helpers." + index + ".nodes");
				lines.push("}");
			});
			lines.push("");
			return v2.layoutFlowScriptLines(lines).join("\n");
		}

		return { render: render, natural: function () { return natural.slice(); } };
	}

	function render(blocks, name, definition, options, env) {
		var renderer = create(blocks, definition, options, env);
		var code = renderer.render(name);
		return { code: code, natural: renderer.natural() };
	}

	// The definition the guard compares (docs: "same definition"), before comparable() of flow-code-service.js:
	// - blank-line markers are left out: the prototype bridge does not keep them;
	// - properties equal to their runtime default are left out (RUNTIME_DEFAULTS);
	// - a hidden intermediate (local.__chain<N>) written by one node and only copied by the next set is folded into
	//   that set's target, then the remaining ones are numbered in order of appearance: these locals are the
	//   engine's own (reserved prefix __), never read by the author.
	function guardDefinition(definition) {
		var copy = JSON.parse(JSON.stringify(definition || {}));
		if (copy.flow && typeof copy.flow === "object") copy.flow.sourceVersion = 3;
		function clean(list) {
			if (!Array.isArray(list)) return list;
			list.forEach(function (node) {
				if (!node || typeof node !== "object") return;
				delete node.__flowBlankBefore;
				var defaults = RUNTIME_DEFAULTS[blockOf(node)];
				if (defaults && node.props) Object.keys(defaults).forEach(function (key) {
					if (hasOwn(node.props, key) && runtimeDefault(node, key)) delete node.props[key];
				});
				Object.keys(node).forEach(function (key) { if (key !== "props" && Array.isArray(node[key])) clean(node[key]); });
			});
			return list;
		}
		clean(copy.nodes);
		(copy.helpers || []).forEach(function (helper) { clean(helper.nodes); });
		var text = JSON.stringify(copy);
		function fold(list) {
			if (!Array.isArray(list)) return;
			for (var i = 0; i + 1 < list.length; i++) {
				var node = list[i], next = list[i + 1];
				var target = node && (node.out !== undefined ? node.out : blockOf(node) === "set" ? (node.props || {}).path : undefined);
				if (!HIDDEN_LOCAL.test(String(target || "")) || node.disabled !== undefined || blockOf(next) !== "set" || !next.props || next.props.value !== "${" + target + "}"
					|| Object.keys(next.props).length !== 2 || next.disabled !== undefined || next.out !== undefined || next.comment !== undefined
					|| countOccurrences(text, String(target)) !== 2 || /\blocal\b(?!\s*\.)/.test(text.replace(/"(?:\\.|[^"\\])*"\s*:/g, ""))) continue;
				if (node.out !== undefined) node.out = next.props.path;
				else node.props.path = next.props.path;
				if (node.props && node.props.path === target) node.props.path = next.props.path;
				if (next.id && next.id !== next.__flowImplicitId && !(node.id && node.id !== node.__flowImplicitId)) node.id = next.id;
				list.splice(i + 1, 1);
				text = JSON.stringify(copy);
			}
			list.forEach(function (node) { Object.keys(node || {}).forEach(function (key) { if (key !== "props" && Array.isArray(node[key])) fold(node[key]); }); });
		}
		fold(copy.nodes);
		(copy.helpers || []).forEach(function (helper) { fold(helper.nodes); });
		var numbers = Object.create(null), rank = 0;
		text = JSON.stringify(copy).replace(/\blocal\.__chain(\d+)\b/g, function (all, n) {
			if (!numbers[n]) numbers[n] = String(++rank);
			return "local.__chain" + numbers[n];
		}).replace(/"__chain(\d+)"/g, function (all, n) { return "\"__chain" + (numbers[n] || n) + "\""; });
		return JSON.parse(text);
	}

	// Renders, reads back with env.readV3Definition (the oracle), and compares with env.comparableDefinition. A
	// natural form the guard refuses becomes a call: the natural forms are added back by halves while the guard
	// accepts them. ok is false when even the call forms do not read back the same definition.
	function renderGuarded(blocks, name, definition, options, env) {
		options = options || {};
		var expected = env.comparableDefinition(guardDefinition(definition)), attempts = 0;
		function attempt(call) {
			attempts++;
			var rendered = render(blocks, name, definition, { call: call }, env), actual, reason = "";
			try {
				actual = env.comparableDefinition(guardDefinition(env.readV3Definition(blocks, name, rendered.code)));
			} catch (error) {
				reason = String(error && error.code || "READ_FAILED") + ": " + String(error && error.message || error);
			}
			if (!reason && actual !== expected) reason = difference(expected, actual);
			return { code: rendered.code, natural: rendered.natural, ok: !reason, reason: reason };
		}
		var first = attempt({});
		if (first.ok) return { ok: true, code: first.code, natural: first.natural.length, called: [], attempts: attempts, naturalCode: first.code };
		var all = first.natural.map(function (entry) { return entry.key; }), kinds = Object.create(null);
		first.natural.forEach(function (entry) { kinds[entry.key] = entry.kind; });
		var none = Object.create(null);
		all.forEach(function (key) { none[key] = true; });
		var base = attempt(none);
		if (!base.ok) return { ok: false, code: base.code, reason: base.reason, firstReason: first.reason, natural: 0, called: all, attempts: attempts, naturalCode: first.code };
		var accepted = [], refused = [], queue = [all], best = base;
		while (queue.length) {
			var chunk = queue.shift(), trial = Object.create(null);
			all.forEach(function (key) { trial[key] = true; });
			accepted.concat(chunk).forEach(function (key) { delete trial[key]; });
			var result = attempt(trial);
			if (result.ok) { accepted = accepted.concat(chunk); best = result; }
			else if (chunk.length > 1) { queue.unshift(chunk.slice(Math.floor(chunk.length / 2))); queue.unshift(chunk.slice(0, Math.floor(chunk.length / 2))); }
			else refused.push({ key: chunk[0], kind: kinds[chunk[0]], reason: result.reason });
		}
		return { ok: true, code: best.code, natural: best.natural.length, called: refused, firstReason: first.reason, attempts: attempts, naturalCode: first.code };
	}

	function difference(expected, actual) {
		if (actual === undefined) return "no definition";
		var i = 0;
		while (i < expected.length && expected.charAt(i) === actual.charAt(i)) i++;
		return "definition differs at " + i + ": expected …" + expected.substring(Math.max(0, i - 80), i + 80) + "… read …" + String(actual).substring(Math.max(0, i - 80), i + 80) + "…";
	}

	return {
		render: render,
		renderGuarded: renderGuarded,
		guardDefinition: guardDefinition,
		RUNTIME_DEFAULTS: RUNTIME_DEFAULTS
	};
}())
