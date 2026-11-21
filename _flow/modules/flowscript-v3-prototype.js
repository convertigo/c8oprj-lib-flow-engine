// FROZEN. The engine no longer reads FlowScript v3 through this bridge: sourceVersion 3 is read by the Java reader
// com.convertigo.libflowengine.FlowScriptV3Reader (libs/src), in the code tools, the rendering guard and the migration.
// This file only serves the tests, as the oracle of that reader (tests/flowscript-v3-reader-differential.js and the
// refusals of flowscript-v3-prototype.js and flowscript-v3-bench-forms.js). Any new form, or any change of a reading, is
// written in the Java reader, not here; a reading the bridge gets wrong stays listed by its cause in the differential test.
(function () {
	// A deliberately bounded bridge. Every emitted expression is still checked by
	// the v2 compiler; syntax that cannot be lowered exactly is rejected here.
	function translate(input) {
		var source = String(input || ""), prepared = source, lines = [], lineMap = [], diagnostics = [];
		function kind(node) { return node ? String(node.getClass().getSimpleName()) : ""; }
		function pos(node) {
			var at = Number(node.getAbsolutePosition());
			if (kind(node) === "UnaryExpression") {
				var operator = String(Packages.org.mozilla.javascript.ast.AstNode.operatorToString(node.getOperator()));
				var before = source.substring(Math.max(0, at - operator.length - 3), at);
				var match = new RegExp(operator.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*$").exec(before);
				if (match) return at - match[0].length;
			}
			if (kind(node) === "InfixExpression" && node.getLeft && node.getLeft()) return Math.min(at, pos(node.getLeft()));
			// The oracle shares this position with the Java reader: a conditional expression starts at its test, with the
			// prefix operator of that test (typeof x === "string" ? …, !x ? …), which Rhino 1.9.2 leaves before it
			if (kind(node) === "ConditionalExpression") return Math.min(at, pos(node.getTestExpression()));
			return at;
		}
		function end(node) {
			var finish = Number(node.getAbsolutePosition()) + Number(node.getLength());
			// Rhino 1.9.2 extends an infix or conditional expression over the closing parentheses that follow it
			var last = kind(node) === "InfixExpression" && node.getRight ? node.getRight() : kind(node) === "ConditionalExpression" ? node.getFalseExpression() : null;
			if (last) {
				var rightEnd = end(last);
				if (finish > rightEnd && /^[\s)\]}]+$/.test(source.substring(rightEnd, finish))) return rightEnd;
			}
			if (kind(node) === "KeywordLiteral") {
				var keyword = String(node.toSource()).trim();
				if (source.substring(pos(node), pos(node) + keyword.length) === keyword) return pos(node) + keyword.length;
			}
			return finish;
		}
		function raw(node) { return source.substring(pos(node), end(node)); }
		function line(at) { return source.substring(0, Math.max(0, at)).split(/\r\n|\r|\n/).length; }
		function emit(value, origin) { String(value).split(/\r\n|\r|\n/).forEach(function (part, index) { lines.push(part); lineMap.push(origin + index); }); }
		function trivia(from, to) {
			var gap = source.substring(Math.max(0, from), Math.max(from, to)), match, cursor = 0;
			var comments = /\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g;
			while ((match = comments.exec(gap)) !== null) {
				if (/(?:\r\n|\r|\n)\s*(?:\r\n|\r|\n)/.test(gap.substring(cursor, match.index))) emit("", line(Math.max(0, from) + match.index));
				var at = Math.max(0, from) + match.index, content = match[0];
				if (content.substring(0, 2) === "/*") {
					content.substring(2, content.length - 2).split(/\r\n|\r|\n/).forEach(function (part, index) {
						emit("// " + part.replace(/^\s*\* ?/, "").trim(), line(at) + index);
					});
				} else emit(content.trim(), line(at));
				cursor = comments.lastIndex;
			}
			if (cursor && /(?:\r\n|\r|\n)\s*(?:\r\n|\r|\n)/.test(gap.substring(cursor))) emit("", line(Math.max(0, from) + cursor));
		}
		function reject(code, node, proposal) {
			var at = typeof node === "number" ? node : pos(node);
			var rules = {
				FLOWSCRIPT_V3_IMPORT_SYNTAX: "JavaScript import declarations are unavailable in FlowScript v3",
				FLOWSCRIPT_V3_RESERVED_NAME: "This name is reserved for a Flow scope or the bridge",
				FLOWSCRIPT_V3_RESERVED_WORD: "default is a reserved word of JavaScript, not a function: the default function is flow.default",
				FLOWSCRIPT_V3_NAME_SHADOWS_BLOCK: "This local name hides a block namespace",
				FLOWSCRIPT_V3_LOCAL_ALIAS: "A local cannot be written both by its declared name and by local.*",
				FLOWSCRIPT_V3_OUT_OF_SCOPE: "A local can only be read inside its declaring block",
				FLOWSCRIPT_V3_SHADOWING: "A local or import cannot be declared again in a nested scope",
				FLOWSCRIPT_V3_CONST_ASSIGN: "A const binding cannot be reassigned",
				FLOWSCRIPT_V3_DESTRUCTURING: "Only one-level object patterns without defaults or rest are supported",
				FLOWSCRIPT_V3_COMPOUND_CONTEXT: "Assignments and updates must be standalone statements",
				FLOWSCRIPT_V3_RESULT_MIXED: "A Flow must use either result fields or return an object consistently",
				FLOWSCRIPT_V3_BREAK: "break has no equivalent in a Flow loop body",
				FLOWSCRIPT_V3_FINALLY: "finally has no equivalent in a Flow try block",
				FLOWSCRIPT_V3_RETURN_IN_LOOP: "return inside a loop would leave the Flow rather than the iteration",
				FLOWSCRIPT_V3_FOR_FORM: "Only for (let i = start; i < end; i++) can be lowered as a counted loop",
				FLOWSCRIPT_V3_SWITCH_FALLTHROUGH: "Flow switch cases must be literal, terminate explicitly, and put default last",
				FLOWSCRIPT_V3_LOOP_FORM: "This loop form cannot be lowered to a Flow loop",
				FLOWSCRIPT_V3_FUNCTION: "Only top-level helpers, list arrows, and slot functions are supported",
				FLOWSCRIPT_V3_CHAIN: "A list operation in this expression cannot be lowered in its JavaScript evaluation order",
				FLOWSCRIPT_V3_LIST_METHOD: "This list method or comparator cannot be lowered with the same JavaScript meaning",
				FLOWSCRIPT_V3_UNTYPED_LIST: "The item type of this list cannot be proven from the values pushed into it",
				FLOWSCRIPT_V3_GLOBAL_CALL: "This global call cannot be lowered in this expression or with these arguments",
				FLOWSCRIPT_V3_ERROR_CODE_CHOICE: "throw new Error lacks the literal public error code required by Flow",
				FLOWSCRIPT_V3_UNSUPPORTED: "This JavaScript construct is outside the FlowScript v3 subset",
				FLOWSCRIPT_V3_OBJECT_CONDITION: "An object literal is not a Flow if or while condition",
				FLOWSCRIPT_V3_PATTERN: "A regular expression literal is lowered to its text block only as a whole value or in an if condition"
			};
			var message = (rules[code] || "This FlowScript v3 construct cannot be lowered faithfully") + " (" + code + " at line " + line(at) + ").";
			if (code === "FLOWSCRIPT_V3_LIST_METHOD" && kind(node) === "FunctionCall" && method(node) === "sort" && !/^\s*\[/.test(raw(node.getTarget()).replace(/\.sort$/, ""))) {
				message = "xs.sort(…) sorts in place and is refused (" + code + " at line " + line(at) + ").";
				proposal = "Write xs.toSorted((a, b) => …).";
			}
			var diagnostic = { severity: "error", code: code, line: line(at), message: message, hint: proposal };
			diagnostics.push(diagnostic);
			throw diagnostic;
		}
		function array(list) { var out = []; for (var i = 0; list && i < list.size(); i++) out.push(list.get(i)); return out; }
		function children(node) { var out = []; for (var part = node && node.getFirstChild(); part; part = part.getNext()) out.push(part); return out; }
		function visit(node, callback) {
			var visitor = new Packages.org.mozilla.javascript.ast.NodeVisitor({ visit: function (n) {
				var deeper = callback(n) !== false;
				// Rhino 1.9.2 CatchClause.visit reads its parameter: a catch without one (catch { … }) is visited here
				if (deeper && kind(n) === "CatchClause" && !n.getVarName()) {
					if (n.getCatchCondition()) n.getCatchCondition().visit(visitor);
					n.getBody().visit(visitor);
					return false;
				}
				return deeper;
			} });
			node.visit(visitor);
		}
		function prepare(text) {
			// Token scan, not a text-wide regular expression, with same-length rewrites only, so that every AST position is
			// a source position. Each const declaration keyword becomes let: Rhino 1.9.2 refuses const in a for…of head and
			// gives a const the scope of the whole function, so a const declared again in a sibling block (valid JavaScript)
			// is a redeclaration for its parser. Whether a declaration is const is read from the source text. A bare
			// default( is recorded: default is a reserved word, not a function name.
			var out = text.split(""), state = "code", quote = "", i = 0, defaults = [];
			function word(at, value) {
				return text.substring(at, at + value.length) === value && !/[\w$.]/.test(text.charAt(at - 1)) && !/[\w$]/.test(text.charAt(at + value.length));
			}
			while (i < text.length) {
				var c = text.charAt(i), next = text.charAt(i + 1);
				if (state === "line") { if (c === "\n") state = "code"; i++; continue; }
				if (state === "block") { if (c === "*" && next === "/") { state = "code"; i += 2; } else i++; continue; }
				if (state === "string") { if (c === "\\") i += 2; else if (c === quote) { state = "code"; i++; } else i++; continue; }
				if (c === "/" && next === "/") { state = "line"; i += 2; continue; }
				if (c === "/" && next === "*") { state = "block"; i += 2; continue; }
				if (c === "\"" || c === "'" || c === "`") { state = "string"; quote = c; i++; continue; }
				if (word(i, "const")) {
					var j = i + 5; while (/\s/.test(text.charAt(j))) j++;
					if (j > i + 5 && /[A-Za-z_$]/.test(text.charAt(j)) || /[{\[]/.test(text.charAt(j))) { out[i] = "l"; out[i + 1] = "e"; out[i + 2] = "t"; out[i + 3] = " "; out[i + 4] = " "; }
					i += 5; continue;
				}
				if (word(i, "default")) {
					var k = i + 7; while (/\s/.test(text.charAt(k))) k++;
					if (text.charAt(k) === "(") defaults.push({ at: i, open: k });
					i += 7; continue;
				}
				i++;
			}
			return { text: out.join(""), defaults: defaults };
		}
		function closing(text, open) {
			// The parenthesis closing the one at open, strings and comments skipped; -1 when there is none.
			var depth = 0, state = "code", quote = "";
			for (var i = open; i < text.length; i++) {
				var c = text.charAt(i), next = text.charAt(i + 1);
				if (state === "line") { if (c === "\n") state = "code"; continue; }
				if (state === "block") { if (c === "*" && next === "/") { state = "code"; i++; } continue; }
				if (state === "string") { if (c === "\\") i++; else if (c === quote) state = "code"; continue; }
				if (c === "/" && next === "/") { state = "line"; i++; continue; }
				if (c === "/" && next === "*") { state = "block"; i++; continue; }
				if (c === "\"" || c === "'" || c === "`") { state = "string"; quote = c; continue; }
				if (c === "(") depth++;
				if (c === ")" && --depth === 0) return i;
			}
			return -1;
		}
		var preparation = prepare(source);
		prepared = preparation.text;
		if (preparation.defaults.length) {
			var bare = preparation.defaults[0], close = closing(source, bare.open);
			var rewrite = close < 0 ? "flow.default(x, y)" : "flow.default(" + source.substring(bare.open + 1, close) + ")";
			try { reject("FLOWSCRIPT_V3_RESERVED_WORD", bare.at, "Write " + rewrite + "."); } catch (_ignored) {}
			return { code: "", lineMap: [], diagnostics: diagnostics };
		}
		var ast;
		try {
			var env = new Packages.org.mozilla.javascript.CompilerEnvirons(); env.setLanguageVersion(200); env.setRecoverFromErrors(false);
			ast = new Packages.org.mozilla.javascript.Parser(env).parse(prepared, "flowscript-v3", 1);
		} catch (e) {
			var m = /line\s+(\d+)/i.exec(String(e)), atLine = e.lineNumber ? Number(typeof e.lineNumber === "function" ? e.lineNumber() : e.lineNumber) : m ? Number(m[1]) : 1;
			var at = 0; while (atLine-- > 1) { var n = source.indexOf("\n", at); if (n < 0) break; at = n + 1; }
			var badLine = source.substring(at, source.indexOf("\n", at) < 0 ? source.length : source.indexOf("\n", at));
			var importSyntax = /^\s*import\b/.test(badLine), loopSyntax = /\bfor\s*\([^)]*\bin\b/.test(badLine);
			var code = importSyntax ? "FLOWSCRIPT_V3_IMPORT_SYNTAX" : loopSyntax ? "FLOWSCRIPT_V3_LOOP_FORM" : "FLOWSCRIPT_V3_UNSUPPORTED";
			try { reject(code, at, importSyntax ? "Use const { name } = flow.import(\"module\")." : loopSyntax ? "Use for (const key of Object.keys(o))." : "Use a JavaScript form from the FlowScript v3 grammar."); } catch (_ignored) {}
			return { code: "", lineMap: [], diagnostics: diagnostics };
		}
		var scope = { names: Object.create(null), parent: null }, allNames = Object.create(null), imports = Object.create(null);
		var resultStyle = "", chain = 0, counted = 0, loopDepth = 0, blockNamespaces = Object.create(null);
		// local.<name> paths created by json.array or json.map: local.rows.push(v) and local.byId[key] = v on them
		// are json.push and json.put, as on a declared name (section 14).
		var typedLocals = { list: Object.create(null), map: Object.create(null) };
		function localName(node) {
			return kind(node) === "PropertyGet" && kind(node.getTarget()) === "Name" && String(node.getTarget().getIdentifier()) === "local"
				? String(node.getProperty().getIdentifier()) : "";
		}
		visit(ast, function (part) {
			if (kind(part) === "Assignment" && localName(part.getLeft()) && kind(part.getRight()) === "FunctionCall") {
				var creator = raw(part.getRight().getTarget()).replace(/\s/g, "");
				if (creator === "json.array") typedLocals.list[localName(part.getLeft())] = true;
				if (creator === "json.map") typedLocals.map[localName(part.getLeft())] = true;
			}
			if (kind(part) === "VariableDeclaration") array(part.getVariables()).forEach(function (v) {
				var target = v.getTarget();
				if (kind(target) === "Name") allNames[String(target.getIdentifier())] = true;
			});
			if (kind(part) === "FunctionCall" && kind(part.getTarget()) === "PropertyGet") {
				var receiver = part.getTarget().getTarget();
				if (kind(receiver) === "Name") blockNamespaces[String(receiver.getIdentifier())] = true;
			}
			return true;
		});
		var reserved = /^(?:flow|input|config|local|result|request|current|parent|trace|__.*)$/;
		function lookup(name, current) { for (var s = current; s; s = s.parent) if (s.names[name]) return s.names[name]; return null; }
		function child(parent) { return { names: Object.create(null), parent: parent }; }
		function declare(name, type, node, current, mapped) {
			if (reserved.test(name)) reject("FLOWSCRIPT_V3_RESERVED_NAME", node, "Choose another local name than " + name + ".");
			if (blockNamespaces[name] && /^(?:text|list|json|http|object|email|sql|date|number|crypto|requestable)$/.test(name) && !imports[name]) reject("FLOWSCRIPT_V3_NAME_SHADOWS_BLOCK", node, "Choose a name different from the block namespace " + name + ".");
			if (lookup(name, current) || imports[name]) reject("FLOWSCRIPT_V3_SHADOWING", node, "Choose another local name than " + name + ".");
			var entry = { name: name, type: type, mapped: mapped || "local." + name, loopDepth: loopDepth };
			current.names[name] = entry; allNames[name] = true; return entry;
		}
		function rewritten(node, current, replaced) {
			if (!node) return "undefined";
			var start = pos(node), finish = end(node), edits = [];
			visit(node, function (part) {
				var k = kind(part), parent = part.getParent();
				// a step lifted before the statement (liftedCondition) reads its hidden local
				for (var r = 0; replaced && r < replaced.length; r++) if (replaced[r].node === part) { edits.push({ at: pos(part), to: end(part), value: replaced[r].value }); return false; }
				if (k === "FunctionCall" && /^(?:Object|JSON|Date)\.[A-Za-z_$][\w$]*$/.test(raw(part.getTarget()).replace(/\s/g, ""))) reject("FLOWSCRIPT_V3_GLOBAL_CALL", part, "Move the global call into its own assignment or return.");
				if (k === "FunctionCall" && part !== node && ["filter", "map", "find", "some", "every", "toSorted", "sort"].indexOf(method(part)) >= 0) reject("FLOWSCRIPT_V3_CHAIN", part, "Split the chain into two const declarations.");
				if (k === "FunctionNode") reject("FLOWSCRIPT_V3_FUNCTION", part, "Write the expression inline or use a project block.");
				if (k === "RegExpLiteral") reject("FLOWSCRIPT_V3_PATTERN", part, patternHint(part));
				if (k === "Assignment" && part !== node || k === "UpdateExpression") reject("FLOWSCRIPT_V3_COMPOUND_CONTEXT", part, "Move the assignment to its own statement.");
				if (k === "NewExpression" && /^new\s+Date\b/.test(raw(part))) reject("FLOWSCRIPT_V3_GLOBAL_CALL", part, "Use date blocks.");
				if (k === "NewExpression" || k === "ThisLiteral" || k === "AwaitExpression" || k === "Yield" || raw(part) === "this") reject("FLOWSCRIPT_V3_UNSUPPORTED", part, "Use Flow blocks.");
				if (k === "Name") {
					var name = String(part.getIdentifier());
					if (kind(parent) === "PropertyGet" && parent.getProperty() === part) return true;
					if (kind(parent) === "ObjectProperty" && parent.getKey() === part && raw(parent).trim() !== name) return true;
					var binding = lookup(name, current);
					if (!binding) { if (allNames[name] && !imports[name]) reject("FLOWSCRIPT_V3_OUT_OF_SCOPE", part, "Declare the name in the enclosing block."); return true; }
					var replacement = binding.mapped;
					if (kind(parent) === "ObjectProperty" && raw(parent).trim() === name) replacement = name + ": " + replacement;
					edits.push({ at: pos(part), to: end(part), value: replacement });
				}
				if (k === "PropertyGet" || k === "ElementGet") {
					if (k === "PropertyGet" && kind(part.getTarget()) === "Name" && String(part.getTarget().getIdentifier()) === "flow" && String(part.getProperty().getIdentifier()) === "default") {
						edits.push({ at: pos(part), to: end(part), value: "default" });
					}
					if (k === "PropertyGet" && kind(part.getTarget()) === "Name" && String(part.getTarget().getIdentifier()) === "local" && allNames[String(part.getProperty().getIdentifier())]) reject("FLOWSCRIPT_V3_LOCAL_ALIAS", part, "Use one spelling for the local.");
					var targetEnd = end(part.getTarget()), between = source.substring(targetEnd, k === "PropertyGet" ? pos(part.getProperty()) : end(part));
					var optional = between.indexOf("?."); if (optional >= 0) edits.push({ at: targetEnd + optional, to: targetEnd + optional + 2, value: k === "ElementGet" ? "" : "." });
				}
				return true;
			});
			edits.sort(function (a, b) { return b.at - a.at; });
			var output = source.substring(start, finish);
			edits.forEach(function (edit) { output = output.substring(0, edit.at - start) + edit.value + output.substring(edit.to - start); });
			return output;
		}
		function method(call) {
			var target = call.getTarget(); return kind(target) === "PropertyGet" ? String(target.getProperty().getIdentifier()) : "";
		}
		function needsOuterItemCopy(loop, name) {
			var needed = false;
			visit(loop.getBody(), function (part) {
				if (kind(part) !== "Name" || String(part.getIdentifier()) !== name) return true;
				var parent = part.getParent();
				if (kind(parent) === "PropertyGet" && parent.getProperty() === part) return true;
				if (kind(parent) === "ObjectProperty" && parent.getKey() === part && raw(parent).trim() !== name) return true;
				for (var enclosing = parent; enclosing && enclosing !== loop; enclosing = enclosing.getParent()) {
					if (kind(enclosing) === "ForInLoop" && enclosing.isForOf() && pos(part) >= pos(enclosing.getBody())) { needed = true; break; }
					if (kind(enclosing) === "FunctionNode") {
						var call = enclosing.getParent();
						if (kind(call) === "FunctionCall" && ["filter", "map", "find", "some", "every"].indexOf(method(call)) >= 0) { needed = true; break; }
					}
					if (kind(enclosing) === "FunctionCall" && /^(?:flow\.forEach|list\.)/.test(raw(enclosing.getTarget()).replace(/\s/g, "")) && /\bcurrent\b/.test(raw(enclosing))) { needed = true; break; }
				}
				return !needed;
			});
			return needed;
		}
		function argument(call) { return array(call.getArguments()); }
		function unparen(node) { while (kind(node) === "ParenthesizedExpression") node = node.getExpression(); return node; }
		function operator(node) { return String(Packages.org.mozilla.javascript.ast.AstNode.operatorToString(node.getOperator())); }
		// A sort comparator, read as the list of its keys: c1 || c2 || …, each ci a key comparator on the two parameters.
		// Returns [{ path, compare, direction }] (path "" for the items themselves), or null when a part has no exact key form.
		function comparatorKeys(node, first, second) {
			node = unparen(node);
			if (kind(node) === "InfixExpression" && operator(node) === "||") {
				var left = comparatorKeys(node.getLeft(), first, second), right = left && comparatorKeys(node.getRight(), first, second);
				return right ? left.concat(right) : null;
			}
			var key = keyComparator(node, first, second);
			return key ? [key] : null;
		}
		function keyComparator(node, first, second) {
			function side(operand) {
				var path = [], at = unparen(operand);
				while (kind(at) === "PropertyGet") { path.unshift(String(at.getProperty().getIdentifier())); at = unparen(at.getTarget()); }
				if (kind(at) !== "Name") return null;
				var name = String(at.getIdentifier());
				return name === first || name === second ? { name: name, path: path.join(".") } : null;
			}
			function pair(left, right) {
				var l = side(left), r = side(right);
				return l && r && l.path === r.path && l.name !== r.name ? { path: l.path, swapped: l.name === second } : null;
			}
			function unstring(operand) {
				var at = unparen(operand);
				return kind(at) === "FunctionCall" && raw(at.getTarget()).trim() === "String" && argument(at).length === 1 ? argument(at)[0] : operand;
			}
			var found;
			if (kind(node) === "InfixExpression" && operator(node) === "-" && (found = pair(node.getLeft(), node.getRight()))) {
				return { path: found.path, compare: "number", direction: found.swapped ? "desc" : "asc" };
			}
			if (kind(node) === "FunctionCall" && method(node) === "localeCompare" && argument(node).length === 1 &&
				(found = pair(unstring(node.getTarget().getTarget()), unstring(argument(node)[0])))) {
				return { path: found.path, compare: "locale", direction: found.swapped ? "desc" : "asc" };
			}
			if (kind(node) !== "ConditionalExpression") return null;
			// A ternary of relational and equality tests between the two keys, with number literals as results. Each test
			// is decided by the class of the pair of keys (x, y): x < y, x > y, neither with x === y, with x == y only, or
			// with x != y, and the same three for an incomparable pair (NaN, undefined). The comparator is exact when it
			// gives the sign of x < y ? -1 : x > y ? 1 : 0 (or of its reverse) in every class.
			var classes = ["LT", "GT", "EQS", "EQL", "EQN", "NCS", "NCL", "NCN"], keyPath = null;
			var truth = { "<": ["LT"], ">": ["GT"], "<=": ["LT", "EQS", "EQL", "EQN"], ">=": ["GT", "EQS", "EQL", "EQN"], "==": ["EQS", "EQL", "NCS", "NCL"], "===": ["EQS", "NCS"] };
			var mirrored = { "<": ">", ">": "<", "<=": ">=", ">=": "<=" };
			function holds(relation, at) {
				if (relation === "!=") return !holds("==", at);
				if (relation === "!==") return !holds("===", at);
				return truth[relation].indexOf(at) >= 0;
			}
			function decision(part) {
				part = unparen(part);
				if (kind(part) === "ConditionalExpression") {
					var test = unparen(part.getTestExpression());
					if (kind(test) !== "InfixExpression" || ["<", ">", "<=", ">=", "==", "!=", "===", "!=="].indexOf(operator(test)) < 0) return null;
					var tested = pair(test.getLeft(), test.getRight());
					if (!tested || keyPath !== null && keyPath !== tested.path) return null;
					keyPath = tested.path;
					var relation = tested.swapped ? mirrored[operator(test)] || operator(test) : operator(test);
					var yes = decision(part.getTrueExpression()), no = yes && decision(part.getFalseExpression());
					return no ? function (at) { return holds(relation, at) ? yes(at) : no(at); } : null;
				}
				var sign = kind(part) === "UnaryExpression" && ["-", "+"].indexOf(operator(part)) >= 0 && kind(unparen(part.getOperand())) === "NumberLiteral"
					? (operator(part) === "-" ? -1 : 1) * Number(unparen(part.getOperand()).getNumber())
					: kind(part) === "NumberLiteral" ? Number(part.getNumber()) : NaN;
				if (sign !== sign) return null;
				sign = sign < 0 ? -1 : sign > 0 ? 1 : 0;
				return function () { return sign; };
			}
			var decide = decision(node);
			if (!decide) return null;
			var ascending = classes.every(function (at) { return decide(at) === (at === "LT" ? -1 : at === "GT" ? 1 : 0); });
			var descending = classes.every(function (at) { return decide(at) === (at === "LT" ? 1 : at === "GT" ? -1 : 0); });
			return ascending || descending ? { path: keyPath, compare: "natural", direction: ascending ? "asc" : "desc" } : null;
		}
		function sortProperties(key) {
			return (key.path ? "by: current." + key.path + ", " : "") + "compare: \"" + key.compare + "\", direction: \"" + key.direction + "\"";
		}
		// The type a value has whatever the data, from its syntax alone (literals, comparisons, object and list literals),
		// or null. Object fields of no certain type are ANY: left out of the item type, so they are not checked.
		var BOTTOM = { bottom: true }, ANY = { any: true };
		function numberType(value) { return isFinite(value) ? { type: Math.floor(value) === value ? "integer" : "number" } : null; }
		function staticType(node) {
			node = unparen(node);
			var k = kind(node);
			if (k === "StringLiteral" || k === "TemplateLiteral") return { type: "string" };
			if (k === "NumberLiteral") return numberType(Number(node.getNumber()));
			if (k === "UnaryExpression") {
				var op = operator(node), operand = unparen(node.getOperand());
				if ((op === "-" || op === "+") && kind(operand) === "NumberLiteral") return numberType((op === "-" ? -1 : 1) * Number(operand.getNumber()));
				return op === "!" ? { type: "boolean" } : op === "typeof" ? { type: "string" } : null;
			}
			if (k === "KeywordLiteral") {
				var word = String(node.toSource()).trim();
				return word === "true" || word === "false" ? { type: "boolean" } : word === "null" ? { type: "null" } : null;
			}
			if (k === "InfixExpression") return ["==", "!=", "===", "!==", "<", "<=", ">", ">="].indexOf(operator(node)) >= 0 ? { type: "boolean" } : null;
			if (k === "ConditionalExpression") {
				var whenTrue = staticType(node.getTrueExpression()), whenFalse = whenTrue && staticType(node.getFalseExpression());
				return whenFalse ? mergeTypes(whenTrue, whenFalse) : null;
			}
			if (k === "ArrayLiteral") {
				var items = BOTTOM, elements = array(node.getElements());
				for (var i = 0; i < elements.length; i++) {
					var item = kind(elements[i]) === "Spread" ? null : staticType(elements[i]);
					items = item && mergeTypes(items, item);
					if (!items) return null;
				}
				return { type: "array", items: items };
			}
			if (k === "ObjectLiteral") {
				var fields = Object.create(null), exact = true;
				array(node.getElements()).forEach(function (property) {
					var key = kind(property) === "ObjectProperty" ? property.getKey() : null, keyKind = kind(key);
					if (!key || ["Name", "StringLiteral", "NumberLiteral"].indexOf(keyKind) < 0 || kind(property.getValue()) === "FunctionNode") { exact = false; return; }
					var fieldName = keyKind === "Name" ? String(key.getIdentifier()) : keyKind === "StringLiteral" ? String(key.getValue()) : String(Number(key.getNumber()));
					fields[fieldName] = staticType(property.getValue()) || ANY;
				});
				return { type: "object", fields: exact ? fields : Object.create(null) };
			}
			return null;
		}
		function mergeTypes(a, b) {
			if (a === BOTTOM) return b;
			if (b === BOTTOM) return a;
			if (a === ANY || b === ANY) return ANY;
			if (a.type === "null" && b.type === "null") return a;
			if (a.type === "null" || b.type === "null") {
				var other = a.type === "null" ? b : a, copy = {};
				Object.keys(other).forEach(function (key) { copy[key] = other[key]; });
				copy.nullable = true; return copy;
			}
			var numeric = { integer: true, number: true };
			var type = a.type === b.type ? a.type : numeric[a.type] && numeric[b.type] ? "number" : "";
			if (!type) return null;
			var merged = { type: type };
			if (a.nullable || b.nullable) merged.nullable = true;
			if (type === "array") { merged.items = mergeTypes(a.items, b.items); if (!merged.items) return null; }
			if (type === "object") {
				merged.fields = Object.create(null);
				Object.keys(a.fields).concat(Object.keys(b.fields)).forEach(function (key) {
					merged.fields[key] = key in a.fields && key in b.fields ? mergeTypes(a.fields[key], b.fields[key]) || ANY : key in a.fields ? a.fields[key] : b.fields[key];
				});
			}
			return merged;
		}
		function schemaOf(type) {
			if (!type || type === BOTTOM || type === ANY) return null;
			var schema = { type: type.type };
			if (type.nullable && type.type !== "null") schema.nullable = true;
			if (type.type === "array") { schema.items = schemaOf(type.items); if (!schema.items) return null; }
			if (type.type === "object") {
				var properties = {}, count = 0;
				Object.keys(type.fields).forEach(function (key) { var field = schemaOf(type.fields[key]); if (field) { properties[key] = field; count++; } });
				if (count) schema.properties = properties;
			}
			return schema;
		}
		function literal(value) {
			if (value && typeof value === "object" && !Array.isArray(value)) {
				var keys = Object.keys(value);
				return keys.length ? "{ " + keys.map(function (key) { return (/^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key)) + ": " + literal(value[key]); }).join(", ") + " }" : "{}";
			}
			return JSON.stringify(value);
		}
		// const rows = [] (or let) followed by rows.push(v): the item type proven by every push and every later assignment
		// of the list, or a refusal at the first value that has no certain type or disagrees.
		function inferredList(declaration, name) {
			var after = end(declaration), type = BOTTOM, pushes = 0, refused = null, conflict = false, likely = null;
			function proposal() {
				var known = conflict ? null : schemaOf(likely && type !== BOTTOM ? mergeTypes(type, likely) : likely || type);
				return "Declare the list with the type of every value pushed into it: " + source.substring(pos(declaration), pos(declaration.getVariables().get(0).getTarget())).trim() +
					" " + name + " = json.array({ itemType: " + (known ? literal(known) : "{ type: \"CHOOSE_TYPE\" }") + " })" +
					(conflict ? "; the pushed values have different types, and a list has one item type." : known ? ", if the value at line " + line(pos(refused)) + " has that type." : ".");
			}
			function add(found, at) {
				if (refused) return;
				var next = found && mergeTypes(type, found);
				if (!next) { refused = at; conflict = !!found; likely = found ? null : likelyType(at); } else type = next;
			}
			function likelyType(node) {
				// For the proposal only: arithmetic gives a number, except NaN and Infinity, which no item type accepts.
				node = unparen(node);
				if (kind(node) === "InfixExpression" && ["-", "*", "/", "%"].indexOf(operator(node)) >= 0 || kind(node) === "UnaryExpression" && operator(node) === "-") return { type: "number" };
				return null;
			}
			visit(declaration.getParent(), function (part) {
				if (refused || pos(part) < after) return !refused;
				if (kind(part) === "FunctionCall" && method(part) === "push" && kind(part.getTarget().getTarget()) === "Name" && String(part.getTarget().getTarget().getIdentifier()) === name) {
					pushes++;
					argument(part).forEach(function (pushed) { add(staticType(pushed), pushed); });
				}
				if (kind(part) === "Assignment" && kind(part.getLeft()) === "Name" && String(part.getLeft().getIdentifier()) === name) {
					var assigned = staticType(part.getRight());
					if (!assigned || assigned.type !== "array") refused = refused || part.getRight(); else add(assigned.items, part.getRight());
				}
				return true;
			});
			if (!pushes) return null;
			if (!refused && !schemaOf(type)) refused = declaration;
			if (refused) reject("FLOWSCRIPT_V3_UNTYPED_LIST", refused, proposal());
			return schemaOf(type);
		}
		function value(node, current) {
			if (kind(node) === "PropertyGet" && kind(node.getTarget()) === "FunctionCall") {
				var receiverValue = value(node.getTarget(), current);
				return { before: receiverValue.before, expression: receiverValue.expression + "." + String(node.getProperty().getIdentifier()) };
			}
			if (kind(node) !== "FunctionCall") return lifted(node, current, false);
			var pattern = patternStep(node);
			if (pattern) return patternLowered(pattern, current);
			var target = node.getTarget(), name = method(node), receiver = kind(target) === "PropertyGet" ? target.getTarget() : null;
			var args = argument(node), prefix = receiver ? value(receiver, current) : null;
			if (["reduce", "flatMap", "findIndex"].indexOf(name) >= 0) reject("FLOWSCRIPT_V3_LIST_METHOD", node, "Use filter, map, toSorted, or an explicit loop.");
			if (name === "sort" && receiver && !(kind(receiver) === "Name" && String(receiver.getIdentifier()) === "list")) {
				var spreadItems = kind(receiver) === "ArrayLiteral" ? array(receiver.getElements()) : [];
				if (spreadItems.length !== 1 || kind(spreadItems[0]) !== "Spread") reject("FLOWSCRIPT_V3_LIST_METHOD", node, "Use toSorted or [...items].sort.");
				prefix = value(spreadItems[0].getExpression(), current);
			}
			if (receiver && !(kind(receiver) === "Name" && /^(?:list|json|object|text)$/.test(String(receiver.getIdentifier()))) && ["filter", "map", "find", "some", "every"].indexOf(name) >= 0) {
					if (args.length !== 1 || kind(args[0]) !== "FunctionNode" || array(args[0].getParams()).length !== 1 || kind(array(args[0].getParams())[0]) !== "Name") reject("FLOWSCRIPT_V3_LIST_METHOD", node, "Use one arrow parameter and an expression body.");
					var fn = args[0], parameter = String(array(fn.getParams())[0].getIdentifier()), inner = child(current);
					declare(parameter, "const", fn, inner, "current");
					var body = fn.getBody(), parts = kind(body) === "Block" || kind(body) === "Scope" ? children(body) : [];
					if (parts.length === 1 && kind(parts[0]) === "ReturnStatement") body = parts[0].getReturnValue();
					else if (parts.length) reject("FLOWSCRIPT_V3_LIST_METHOD", node, "Use an expression body.");
					// x => ({ … }) selects the object itself
					if (kind(body) === "ParenthesizedExpression" && kind(body.getExpression()) === "ObjectLiteral") body = body.getExpression();
					var pred = rewritten(body, inner), temp = "local.__chain" + (++chain), before = prefix.before.slice();
					var where = name === "every" ? "!(" + pred + ")" : pred;
					before.push(temp + " = list." + (name === "map" ? "map" : "filter") + "({ items: " + prefix.expression + ", " + (name === "map" ? "select" : "where") + ": " + where + " })");
					return { before: before, expression: name === "find" ? temp + "[0]" : name === "some" ? temp + ".length > 0" : name === "every" ? temp + ".length == 0" : temp };
			}
			if (receiver && (name === "toSorted" || name === "sort" && !(kind(receiver) === "Name" && String(receiver.getIdentifier()) === "list"))) {
				var params = args.length === 1 && kind(args[0]) === "FunctionNode" ? array(args[0].getParams()) : [];
				if (params.length !== 2 || kind(params[0]) !== "Name" || kind(params[1]) !== "Name") reject("FLOWSCRIPT_V3_LIST_METHOD", node, "Use a two-parameter key comparator.");
				var comparator = args[0], first = String(params[0].getIdentifier()), second = String(params[1].getIdentifier());
				var sortBody = comparator.getBody(), sortParts = kind(sortBody) === "Block" || kind(sortBody) === "Scope" ? children(sortBody) : [];
				if (sortParts.length === 1 && kind(sortParts[0]) === "ReturnStatement") sortBody = sortParts[0].getReturnValue();
				else if (sortParts.length) reject("FLOWSCRIPT_V3_LIST_METHOD", node, "Return the comparison from an expression body.");
				var keys = first !== second && sortBody ? comparatorKeys(sortBody, first, second) : null;
				if (!keys) reject("FLOWSCRIPT_V3_LIST_METHOD", node, "Compare one key of the two items with a.k - b.k, a.k.localeCompare(b.k) or a.k < b.k ? -1 : a.k > b.k ? 1 : 0 (b before a for descending), and join several keys with ||.");
				var sortTemp = "local.__chain" + (++chain), sortBefore = prefix.before.slice();
				sortBefore.push(sortTemp + " = list.sort({ items: " + prefix.expression + ", " + sortProperties(keys[0]) +
					(keys.length > 1 ? ", then: [" + keys.slice(1).map(function (key) { return "{ " + sortProperties(key) + " }"; }).join(", ") + "]" : "") + " })");
				return { before: sortBefore, expression: sortTemp };
			}
			if (receiver && name === "concat" && !(kind(receiver) === "Name" && /^(?:list|json|object|text)$/.test(String(receiver.getIdentifier())))) {
				// xs.concat(ys…): the expression method, JavaScript's Array.prototype.concat; a list method chain in an argument
				// runs before it, after the chain of the receiver, in JavaScript order (list arrows have no effect).
				var joined = prefix.before.slice(), parts = args.map(function (part) { var lowered = value(part, current); joined = joined.concat(lowered.before); return lowered.expression; });
				if (joined.length) return { before: joined, expression: prefix.expression + ".concat(" + parts.join(", ") + ")" };
			}
			var globalName = receiver && kind(receiver) === "Name" ? String(receiver.getIdentifier()) + "." + name : "";
			if (["Object.entries", "Date.now"].indexOf(globalName) >= 0) reject("FLOWSCRIPT_V3_GLOBAL_CALL", node, "Use object.keys or date blocks.");
			if (["Object.keys", "Object.values", "JSON.parse", "JSON.stringify"].indexOf(globalName) >= 0) {
				var pretty = globalName === "JSON.stringify" && args.length === 3 && raw(args[1]).trim() === "null" && raw(args[2]).trim() === "2";
				if ((!pretty && args.length !== 1) || kind(args[0]) === "FunctionCall") reject("FLOWSCRIPT_V3_GLOBAL_CALL", node, "Call the matching object or json block in a separate statement.");
					var prop = globalName === "JSON.parse" ? "text" : globalName === "JSON.stringify" ? "value" : "source";
				return { before: [], expression: globalName.toLowerCase() + "({ " + prop + ": " + rewritten(args[0], current) + (pretty ? ", pretty: true" : "") + " })" };
			}
			if (receiver && kind(receiver) === "Name" && String(receiver.getIdentifier()) === "flow" && name === "default") return { before: [], expression: "default(" + args.map(function (a) { return rewritten(a, current); }).join(", ") + ")" };
			if (prefix && prefix.before.length) return { before: prefix.before, expression: prefix.expression + "." + name + "(" + args.map(function (a) { return rewritten(a, current); }).join(", ") + ")" };
			return { before: [], expression: rewritten(node, current) };
		}
		// A pattern step (patternStep of the Java reader): /p/f.test(s), s.match(/p/f), s.replace(/p/f, y), s.replaceAll(/p/g, y)
		// or s.split(/p/f), flags among g, i, m and s, lowered to its text block in a hidden local; the literal is refused
		// anywhere else (FLOWSCRIPT_V3_PATTERN), with the same proposal as the Java reader.
		function patternStep(part) {
			if (kind(part) !== "FunctionCall" || kind(part.getTarget()) !== "PropertyGet") return null;
			var target = part.getTarget(), args = argument(part), name = String(target.getProperty().getIdentifier()), literal, text, replacement = null;
			if (name === "test" && kind(unparen(target.getTarget())) === "RegExpLiteral" && args.length === 1) {
				literal = unparen(target.getTarget());
				text = args[0];
			} else if (["match", "replace", "replaceAll", "split"].indexOf(name) >= 0 && args.length && kind(args[0]) === "RegExpLiteral") {
				literal = args[0];
				text = target.getTarget();
				if (/^replace/.test(name)) {
					if (args.length !== 2 || kind(args[1]) === "FunctionNode") return null;
					replacement = args[1];
				} else if (args.length !== 1) return null;
			} else return null;
			var pattern = String(literal.getValue()), flags = literal.getFlags() == null ? "" : String(literal.getFlags());
			if (!/^(?!.*(.).*\1)[gims]*$/.test(flags) || pattern.indexOf("${") >= 0 || pattern.indexOf("{{") >= 0 || name === "replaceAll" && flags.indexOf("g") < 0) return null;
			return { method: name, text: text, replacement: replacement, pattern: pattern, flags: flags };
		}
		function patternLowered(step, current) {
			// the text of a method is read first, a chain before it (s.replace(/p/g, " ").trim().split(/q/))
			var receiver = step.method === "test" ? { before: [], expression: "String(" + rewritten(step.text, current) + ")" } : value(step.text, current);
			var hidden = "local.__chain" + (++chain), plain = step.flags.replace(/g/g, ""), call, text = receiver.expression;
			if (step.method === "test" || step.method === "match") {
				call = "text.match({ text: " + text + ", pattern: " + JSON.stringify(step.pattern) + (step.flags ? ", flags: " + JSON.stringify(step.flags) : "") + " })";
			} else if (step.method === "split") {
				call = "text.split({ text: " + text + ", separator: " + JSON.stringify(step.pattern) + ", regex: true, trim: false, removeEmpty: false" +
					(plain ? ", flags: " + JSON.stringify(plain) : "") + " })";
			} else {
				call = "text.replace({ text: " + text + ", search: " + JSON.stringify(step.pattern) + ", replacement: " + rewritten(step.replacement, current) +
					", regex: true" + (step.flags.indexOf("g") < 0 ? ", all: false" : "") + (plain ? ", flags: " + JSON.stringify(plain) : "") + " })";
			}
			return { before: receiver.before.concat([hidden + " = " + call]),
				expression: step.method === "test" ? hidden + ".matched" : step.method === "match" ? "(" + hidden + ".matched ? " + hidden + ".groups : null)" : hidden };
		}
		function spelled(node) { return raw(node).trim().replace(/\s*[\r\n]+\s*/g, " "); }
		function quoted(text) { return '"' + text.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"'; }
		function patternHint(literal) {
			var pattern = String(literal.getValue()), flags = literal.getFlags() == null ? "" : String(literal.getFlags());
			var method = "", operand = "value", replacement = '""', parent = literal.getParent();
			if (kind(parent) === "PropertyGet" && parent.getTarget() === literal && kind(parent.getParent()) === "FunctionCall" && parent.getParent().getTarget() === parent) {
				method = String(parent.getProperty().getIdentifier());
				if (argument(parent.getParent()).length) operand = spelled(argument(parent.getParent())[0]);
			} else if (kind(parent) === "FunctionCall" && argument(parent).length && argument(parent)[0] === literal && kind(parent.getTarget()) === "PropertyGet") {
				method = String(parent.getTarget().getProperty().getIdentifier());
				operand = spelled(parent.getTarget().getTarget());
				if (argument(parent).length > 1) replacement = spelled(argument(parent)[1]);
			}
			var named = /([A-Za-z_$][\w$]*)\s*(?:\(\s*\))?\s*$/.exec(operand), name = named ? named[1] : "text";
			var all = flags.replace(/[^gims]/g, ""), plain = all.replace(/g/g, ""), example, block;
			if (method === "replace" || method === "replaceAll") {
				block = "text.replace";
				example = "const " + name + "Replaced = text.replace({ text: " + operand + ", search: " + quoted(pattern) + ", replacement: " + replacement + ", regex: true" +
					(all.indexOf("g") < 0 ? ", all: false" : "") + (plain ? ", flags: " + quoted(plain) : "") + " }), then read " + name + "Replaced";
			} else if (method === "split") {
				block = "text.split";
				example = "const " + name + "Parts = text.split({ text: " + operand + ", separator: " + quoted(pattern) + ", regex: true, trim: false, removeEmpty: false" +
					(plain ? ", flags: " + quoted(plain) : "") + " }), then read " + name + "Parts";
			} else {
				block = "text.match";
				example = "const " + name + "Match = text.match({ text: String(" + operand + "), pattern: " + quoted(pattern) + (all ? ", flags: " + quoted(all) : "") +
					" }), then read " + name + "Match.matched where the " + (!method || method === "exec" ? "test" : method) + " was (" + name + "Match.groups holds " +
					(all.indexOf("g") < 0 ? "the whole match then the captured groups" : "every whole match") + ")";
			}
			return (/^(?!.*(.).*\1)[gims]*$/.test(flags) ? "" : "The flags of a pattern are g, i, m and s; " + quoted(flags) + " has others. ") +
				"Write the " + block + " block in its own statement, the pattern as a quoted text (backslashes doubled): " + example + ". " +
				"As the whole value of a declaration, an assignment or a return, or always evaluated in an if condition, /p/.test(s), s.match(/p/), " +
				"s.replace(/p/, y), s.replaceAll(/p/g, y) and s.split(/p/) are lowered to that block.";
		}
		// A block step of a condition: a list method with an arrow, or a global call lowered to a block.
		function blockStep(part) {
			if (kind(part) !== "FunctionCall") return false;
			var target = part.getTarget(), receiver = kind(target) === "PropertyGet" ? target.getTarget() : null;
			if (/^(?:Object|JSON)\.(?:keys|values|parse|stringify)$/.test(raw(target).replace(/\s/g, ""))) return true;
			return !!receiver && ["filter", "map", "find", "some", "every", "toSorted", "sort"].indexOf(method(part)) >= 0 &&
				!(kind(receiver) === "Name" && /^(?:list|json|object|text)$/.test(String(receiver.getIdentifier())));
		}
		// The condition of an if is evaluated once, whole, before its branches: each block step it always evaluates (not in
		// the right operand of && || ??, a branch of ?:, an arrow or an argument of a call) runs before the statement, in a
		// hidden local, which is the JavaScript order since expressions have no effect. A step in a lazy place stays refused.
		function liftedCondition(condition, current) { return lifted(condition, current, true); }
		// … and so does each pattern step a value always evaluates (const invalid = !/^[0-9]+$/.test(v)).
		function lifted(condition, current, blockSteps) {
			var before = [], replaced = [];
			visit(condition, function (part) {
				if (!(blockSteps && blockStep(part)) && !patternStep(part)) return true;
				for (var child = part, parent = part.getParent(); child !== condition && parent; child = parent, parent = parent.getParent()) {
					var k = kind(parent);
					if (k === "FunctionNode") return true;
					if (k === "InfixExpression" && ["&&", "||", "??"].indexOf(operator(parent)) >= 0 && parent.getRight() === child) return true;
					if (k === "ConditionalExpression" && parent.getTestExpression() !== child) return true;
					if (k === "FunctionCall" && parent.getTarget() !== child) return true;
				}
				var lowered = value(part, current);
				before = before.concat(lowered.before);
				if (lowered.before.length) replaced.push({ node: part, value: "(" + lowered.expression + ")" });
				else { var hidden = "local.__chain" + (++chain); before.push(hidden + " = " + lowered.expression); replaced.push({ node: part, value: hidden }); }
				return false;
			});
			return { before: before, expression: rewritten(condition, current, replaced) };
		}
		// A call with a slot ($$nodes, $$then…), or a control block: written as a call, its slots as bodies. A slot is a
		// method ($$nodes() { … }), a function (function () { … }) or an arrow with a block body (() => { … }). Assigned or
		// returned, its output goes to that destination through $$out, since an assignment holds no slot.
		function slotted(call) {
			call = unparen(call);
			if (kind(call) !== "FunctionCall") return false;
			var args = argument(call);
			return /^flow\.(?:while|forEach|if|try)$/.test(raw(call.getTarget()).replace(/\s/g, "")) || args.length === 1 && kind(args[0]) === "ObjectLiteral" &&
				array(args[0].getElements()).some(function (property) { return kind(property) === "ObjectProperty" && /^\$\$/.test(raw(property.getKey()).trim()) && kind(property.getValue()) === "FunctionNode"; });
		}
		// A returned block call (isBlockCall of the Java reader): one object argument, not an expression function, a scope
		// method or a global call.
		function returnedBlockCall(call) {
			if (kind(call) !== "FunctionCall") return false;
			var target = raw(call.getTarget()).replace(/\s/g, ""), args = argument(call);
			if (/^(?:flow\.default|default|String|Number)$|^(?:Math|Object|JSON|input|local|result|current)\./.test(target)) return false;
			return args.length === 1 && kind(args[0]) === "ObjectLiteral";
		}
		function emitSlotted(call, current, origin, out) {
			call = unparen(call);
			var controlName = raw(call.getTarget()).replace(/\s/g, ""), controlArgs = argument(call);
			if (controlArgs.length !== 1 || kind(controlArgs[0]) !== "ObjectLiteral") reject("FLOWSCRIPT_V3_UNSUPPORTED", call, "Call flow control blocks with one object argument.");
			var properties = array(controlArgs[0].getElements());
			if (out && properties.some(function (property) { return kind(property) === "ObjectProperty" && raw(property.getKey()).trim() === "$$out"; })) {
				reject("FLOWSCRIPT_V3_UNSUPPORTED", call, "Write the assignment or $$out, not both.");
			}
			// flow.while, flow.forEach, flow.if and flow.try are the control blocks; flow.poll… are flow.* blocks
			emit((/^flow\.(?:while|forEach|if|try)$/.test(controlName) ? controlName.substring(5) : controlName) + "({", origin);
			if (out) emit("$$out: " + JSON.stringify(out) + ",", origin);
			properties.forEach(function (property) {
				if (kind(property) !== "ObjectProperty") reject("FLOWSCRIPT_V3_UNSUPPORTED", property, "Use named control properties.");
				var key = raw(property.getKey()).trim(), item = property.getValue();
				if (/^\$\$[A-Za-z_$][\w$]*$/.test(key) && kind(item) === "FunctionNode") {
					if (array(item.getParams()).length || item.isGenerator() || source.charAt(pos(item.getBody())) !== "{") {
						reject("FLOWSCRIPT_V3_FUNCTION", property, "Write the slot with a body and no parameter: " + key + "() { … }, " + key + ": function () { … } or " + key + ": () => { … }.");
					}
					emit(key + "() {", line(pos(property))); body(item.getBody(), child(current)); emit("},", line(end(property) - 1));
				} else emit(key + ": " + rewritten(item, current) + ",", line(pos(property)));
			});
			emit("})", line(end(call) - 1));
		}
		function holdsBlockStep(node) {
			var found = false;
			visit(node, function (part) {
				if (kind(part) === "FunctionCall" && (["filter", "map", "find", "some", "every", "toSorted", "sort"].indexOf(method(part)) >= 0 ||
					/^(?:Object|JSON)\./.test(raw(part.getTarget()).replace(/\s/g, "")) || patternStep(part))) found = true;
				return !found;
			});
			return found;
		}
		function emitValue(node, current, target, origin) {
			if (slotted(node)) { emitSlotted(node, current, origin, target); return; }
			// A value that is entirely cond ? a : b, with a block step in a branch: if (cond) { target = a } else { target = b },
			// each branch lowered in its own body, so that only the chosen branch runs, as in JavaScript.
			var conditional = unparen(node);
			if (kind(conditional) === "ConditionalExpression" && (holdsBlockStep(conditional.getTrueExpression()) || holdsBlockStep(conditional.getFalseExpression()))) {
				emit("if (" + rewritten(conditional.getTestExpression(), current) + ") {", origin);
				emitValue(conditional.getTrueExpression(), current, target, origin);
				emit("} else {", origin);
				emitValue(conditional.getFalseExpression(), current, target, origin);
				emit("}", origin);
				return;
			}
			var lowered = value(node, current);
			lowered.before.forEach(function (item) { emit(item, origin); });
			emit(target + " = " + lowered.expression, origin);
		}
		function body(node, current) {
			var block = kind(node) === "Block" || kind(node) === "Scope", statements = block ? children(node) : [node], cursor = block ? pos(node) + 1 : pos(node);
			statements.forEach(function (item) {
				var gap = source.substring(cursor, pos(item)), disabled = /\/\/\s*@disabled\b/.test(gap) && !/\/\/\s*@disabled[^\n]*\n\s*\n/.test(gap);
				var before = lines.length;
				trivia(cursor, pos(item));
				if (disabled) {
					// the directive disables the statement; it is not part of its comment
					for (var directive = lines.length - 1; directive >= before; directive--) {
						if (/^\/\/\s*@disabled\s*$/.test(lines[directive])) { lines.splice(directive, 1); lineMap.splice(directive, 1); break; }
					}
				}
				var first = lines.length; statement(item, current);
				if (disabled) {
					if (lines.length !== first + 1) reject("FLOWSCRIPT_V3_UNSUPPORTED", item, "Put $$disabled: true on each block generated by this statement.");
					var emitted = lines[first], assignment = /^((?:local|result)\.[A-Za-z_$][\w$.]*)\s*=\s*([\s\S]*)$/.exec(emitted);
					if (assignment) lines[first] = "set({ path: " + JSON.stringify(assignment[1]) + ", value: " + assignment[2] + ", $$disabled: true })";
					else if (/^[A-Za-z_$][\w$.]*\(\{/.test(emitted)) lines[first] = emitted.replace("({", function () { return "({ $$disabled: true, "; });
					else reject("FLOWSCRIPT_V3_UNSUPPORTED", item, "Put $$disabled: true on the block call.");
				}
				cursor = end(item);
			});
			if (block) trivia(cursor, end(node) - 1);
		}
		function statement(node, current) {
			var k = kind(node), origin = line(pos(node));
			if (k === "Block" || k === "Scope") { body(node, child(current)); return; }
			if (k === "VariableDeclaration") {
				array(node.getVariables()).forEach(function (variable) {
					var target = variable.getTarget(), init = variable.getInitializer(), type = source.substring(pos(node), pos(target)).trim().split(/\s/)[0];
					if (type !== "const" && type !== "let") reject("FLOWSCRIPT_V3_UNSUPPORTED", node, "Use const or let for Flow locals.");
					if (kind(target) === "ObjectLiteral") {
						if (!init) reject("FLOWSCRIPT_V3_DESTRUCTURING", target, "Initialize the object before destructuring.");
						var object = value(init, current), objectPath = "local.__chain" + (++chain);
						object.before.forEach(function (item) { emit(item, origin); }); emit(objectPath + " = " + object.expression, origin);
						array(target.getElements()).forEach(function (field) {
							if (kind(field) !== "ObjectProperty" || kind(field.getKey()) !== "Name" || kind(field.getValue()) !== "Name") reject("FLOWSCRIPT_V3_DESTRUCTURING", node, "Use one-level fields without defaults or rest.");
							var key = String(field.getKey().getIdentifier()), alias = String(field.getValue().getIdentifier());
							declare(alias, type, node, current); emit("local." + alias + " = " + objectPath + "." + key, origin);
						}); return;
					}
					if (kind(target) !== "Name") reject("FLOWSCRIPT_V3_DESTRUCTURING", target, "Declare each field separately.");
					if (type === "const" && !init) reject("FLOWSCRIPT_V3_UNSUPPORTED", target, "Give the const its value (const x = value), or declare it with let.");
					var name = String(target.getIdentifier());
					if (init && (kind(unparen(init)) === "ConditionalExpression" || slotted(init))) {
						emitValue(init, current, "local." + name, origin);
						declare(name, type, target, current);
						return;
					}
					var emptyList = init && kind(unparen(init)) === "ArrayLiteral" && !array(unparen(init).getElements()).length ? inferredList(node, name) : null;
					var rhs = emptyList ? { before: [], expression: "json.array({ itemType: " + literal(emptyList) + " })" } : init ? value(init, current) : { before: [], expression: "undefined" };
					var declared = declare(name, type, target, current);
					declared.typedList = !!emptyList || init && kind(init) === "FunctionCall" && raw(init.getTarget()).replace(/\s/g, "") === "json.array";
					declared.typedMap = init && kind(init) === "FunctionCall" && raw(init.getTarget()).replace(/\s/g, "") === "json.map";
					rhs.before.forEach(function (item) { emit(item, origin); }); emit("local." + name + " = " + rhs.expression, origin);
				}); return;
			}
			if (k === "ExpressionStatement") {
				var expression = node.getExpression(), ek = kind(expression);
				if (ek === "Assignment") {
					var left = expression.getLeft(), right = expression.getRight(), op = String(Packages.org.mozilla.javascript.ast.AstNode.operatorToString(expression.getOperator()));
					var name = kind(left) === "Name" ? String(left.getIdentifier()) : "", binding = name && lookup(name, current);
					if (binding && binding.type === "const") reject("FLOWSCRIPT_V3_CONST_ASSIGN", left, "Declare the variable with let.");
					if (name && !binding) reject(allNames[name] ? "FLOWSCRIPT_V3_OUT_OF_SCOPE" : "FLOWSCRIPT_V3_UNSUPPORTED", left, "Declare the local first.");
					var target = binding ? binding.mapped : rewritten(left, current);
					if (kind(left) === "ElementGet" && (kind(left.getTarget()) === "Name" || typedLocals.map[localName(left.getTarget())])) {
						var mapName = kind(left.getTarget()) === "Name" ? String(left.getTarget().getIdentifier()) : "", map = mapName ? lookup(mapName, current)
							: { mapped: "local." + localName(left.getTarget()), typedMap: true };
						if (map && map.typedMap && op === "=") {
							emit("json.put({ path: " + JSON.stringify(map.mapped) + ", key: " + rewritten(left.getElement(), current) + ", value: " + rewritten(right, current) + " })", origin); return;
						}
					}
					if (target.indexOf("result.") === 0) { if (resultStyle === "returnObject") reject("FLOWSCRIPT_V3_RESULT_MIXED", node, "Use one result style."); resultStyle = "resultField"; }
					if (op !== "=") { if (!["+=", "-=", "*=", "/="].includes(op)) reject("FLOWSCRIPT_V3_COMPOUND_CONTEXT", node, "Use a simple assignment."); emit(target + " = " + target + " " + op.charAt(0) + " (" + rewritten(right, current) + ")", origin); }
					else emitValue(right, current, target, origin);
					return;
				}
				if (ek === "UpdateExpression") {
					var operand = expression.getOperand(), increment = raw(expression).indexOf("++") >= 0;
					if (kind(operand) === "PropertyGet") {
						// o.count++ on a field of a local object (or of result): the object is shared as in JavaScript (an
						// object read from a map is that object), so the field changes wherever the object is read.
						var field = rewritten(operand, current);
						if (!/^(?:local\.[A-Za-z_$][\w$]*|result)(?:\.[A-Za-z_$][\w$]*)+$/.test(field)) reject("FLOWSCRIPT_V3_UNSUPPORTED", node, "Update a field of a local object or of result (o.count++), or a local (n++).");
						if (field.indexOf("result.") === 0) { if (resultStyle === "returnObject") reject("FLOWSCRIPT_V3_RESULT_MIXED", node, "Use one result style."); resultStyle = "resultField"; }
						emit(field + " = " + (increment ? "Number(" + field + ") + 1" : field + " - 1"), origin); return;
					}
					var updateName = kind(operand) === "Name" ? String(operand.getIdentifier()) : "", update = lookup(updateName, current);
					if (!updateName) reject("FLOWSCRIPT_V3_UNSUPPORTED", node, "Update a local (n++) or a field of a local object (o.count++).");
					if (!update) reject(allNames[updateName] ? "FLOWSCRIPT_V3_OUT_OF_SCOPE" : "FLOWSCRIPT_V3_UNSUPPORTED", node, allNames[updateName] ? "Declare the name in the enclosing block." : "Declare the local first.");
					if (update.type === "const") reject("FLOWSCRIPT_V3_CONST_ASSIGN", node, "Declare the variable with let.");
					// x++ adds 1 to the number of x (ToNumeric), where + would join a text; x - 1 already converts.
					emit(update.mapped + " = " + (increment ? "Number(" + update.mapped + ") + 1" : update.mapped + " - 1"), origin); return;
				}
				if (ek === "FunctionCall") {
					if (slotted(expression)) { emitSlotted(expression, current, origin, null); return; }
					var pushReceiver = method(expression) === "push" ? expression.getTarget().getTarget() : null;
					// json.push({ … }) is the block call, not the push of a list named json
					var namespacePush = pushReceiver && kind(pushReceiver) === "Name" && !lookup(String(pushReceiver.getIdentifier()), current)
						&& !allNames[String(pushReceiver.getIdentifier())];
					if (pushReceiver && !namespacePush) {
						var rec = pushReceiver, recName = kind(rec) === "Name" ? String(rec.getIdentifier()) : "", list = recName ? lookup(recName, current)
							: typedLocals.list[localName(rec)] ? { mapped: "local." + localName(rec), typedList: true } : null;
						if (!list || !list.typedList) reject("FLOWSCRIPT_V3_UNTYPED_LIST", node, "Initialize the list with json.array({ itemType }).");
						var pushed = argument(expression); if (pushed.length !== 1) reject("FLOWSCRIPT_V3_UNSUPPORTED", node, "Push one value per statement.");
						emit("json.push({ path: " + JSON.stringify(list.mapped) + ", value: " + rewritten(pushed[0], current) + " })", origin); return;
					}
					var call = value(expression, current); call.before.forEach(function (item) { emit(item, origin); }); emit(call.expression, origin); return;
				}
				reject("FLOWSCRIPT_V3_UNSUPPORTED", node, "Use a Flow block call or an assignment.");
			}
			if (k === "ReturnStatement") {
				if (loopDepth) reject("FLOWSCRIPT_V3_RETURN_IN_LOOP", node, "Use continue or return after the loop.");
				var returned = node.getReturnValue();
				if (kind(returned) === "ObjectLiteral") {
					if (resultStyle === "resultField") reject("FLOWSCRIPT_V3_RESULT_MIXED", node, "Use one result style."); resultStyle = "returnObject";
					array(returned.getElements()).forEach(function (field) {
						if (kind(field) !== "ObjectProperty" || kind(field.getKey()) !== "Name") reject("FLOWSCRIPT_V3_DESTRUCTURING", node, "Write explicit result fields.");
						var key = String(field.getKey().getIdentifier()), val = field.getValue();
						if (raw(field).trim() === key) {
							if (!lookup(key, current) && allNames[key] && !imports[key]) reject("FLOWSCRIPT_V3_OUT_OF_SCOPE", field, "Declare the name in the enclosing block.");
							emit("result." + key + " = " + (lookup(key, current) ? lookup(key, current).mapped : key), origin);
						}
						else emitValue(val, current, "result." + key, origin);
					}); emit("return", origin); return;
				}
				if (returned && slotted(returned)) { var output = "local.__chain" + (++chain); emitSlotted(returned, current, origin, output); emit("return " + output, origin); }
				else if (returned && returnedBlockCall(returned)) {
					// return entity.read({ … }): the call writes a hidden local, returned, as the Java reader lowers it
					var called = "local.__chain" + (++chain), call = value(returned, current);
					call.before.forEach(function (item) { emit(item, origin); }); emit(called + " = " + call.expression, origin); emit("return " + called, origin);
				}
				else if (returned) { var v = value(returned, current); v.before.forEach(function (item) { emit(item, origin); }); emit("return " + v.expression, origin); }
				else emit("return", origin); return;
			}
			if (k === "IfStatement") {
				if (kind(node.getCondition()) === "ObjectLiteral") reject("FLOWSCRIPT_V3_OBJECT_CONDITION", node.getCondition(), "Use flow.if({ ... }).");
				var condition = liftedCondition(node.getCondition(), current);
				condition.before.forEach(function (item) { emit(item, origin); });
				emit("if (" + condition.expression + ") {", origin); body(node.getThenPart(), child(current));
				var otherwise = node.getElsePart(); if (otherwise) { emit("} else {", line(pos(otherwise))); body(otherwise, child(current)); }
				emit("}", line(end(node) - 1)); return;
			}
			if (k === "WhileLoop") {
				if (kind(node.getCondition()) === "ObjectLiteral") reject("FLOWSCRIPT_V3_OBJECT_CONDITION", node.getCondition(), "Use flow.while({ ... }).");
				visit(node.getCondition(), function (part) {
					if (blockStep(part)) reject("FLOWSCRIPT_V3_CHAIN", part, "A while condition is evaluated before every pass, so its list method cannot run once before the loop: keep its value in a let, computed before the loop and again at the end of the body (let pending = xs.some(…); while (pending) { …; pending = xs.some(…) }).");
					return true;
				});
				emit("while({ condition: " + rewritten(node.getCondition(), current) + ", maxIterations: 1000, timeoutMs: 60000, $$nodes() {", origin);
				loopDepth++; body(node.getBody(), child(current)); loopDepth--; emit("} })", line(end(node) - 1)); return;
			}
			if (k === "ForInLoop" && node.isForOf()) {
				var iterator = node.getIterator(), decl = kind(iterator) === "VariableDeclaration" ? array(iterator.getVariables())[0] : null;
				if (!decl || ["Name", "ObjectLiteral"].indexOf(kind(decl.getTarget())) < 0) reject("FLOWSCRIPT_V3_DESTRUCTURING", node, "Use a single loop variable or a one-level object pattern.");
				if (source.substring(pos(iterator), pos(decl.getTarget())).trim() !== "const") reject("FLOWSCRIPT_V3_LOOP_FORM", node, "Use for (const item of items).");
				var targetPattern = decl.getTarget(), loopScope = child(current);
				if (kind(targetPattern) === "Name") {
					var item = String(targetPattern.getIdentifier()), itemBinding = declare(item, "const", targetPattern, loopScope, "current");
					itemBinding.loopDepth = loopDepth + 1;
					if (needsOuterItemCopy(node, item)) itemBinding.mapped = "local." + item;
				}
				// for (const key of Object.keys(o)), of a list method chain or of a pattern step that gives a list (s.split(/p/),
				// s.match(/p/g)): the list is computed once, before the loop, in a hidden local, as JavaScript evaluates the
				// iterated expression once.
				var iterated = unparen(node.getIteratedObject()), items, listPattern = patternStep(iterated);
				if (kind(iterated) === "FunctionCall" && (blockStep(iterated) || method(iterated) === "concat" || listPattern && ["split", "match"].indexOf(listPattern.method) >= 0) &&
					["find", "some", "every"].indexOf(method(iterated)) < 0 &&
					!/^JSON\./.test(raw(iterated.getTarget()).replace(/\s/g, ""))) {
					var listed = value(iterated, current);
					listed.before.forEach(function (before) { emit(before, origin); });
					if (/^local\.__chain\d+$/.test(listed.expression)) items = listed.expression;
					else { items = "local.__chain" + (++chain); emit(items + " = " + listed.expression, origin); }
				} else items = rewritten(node.getIteratedObject(), current);
				emit("forEach({ items: " + items + ", $$nodes() {", origin);
				if (kind(targetPattern) === "Name" && itemBinding.mapped !== "current") emit(itemBinding.mapped + " = current", origin);
				if (kind(targetPattern) === "ObjectLiteral") array(targetPattern.getElements()).forEach(function (field) {
					if (kind(field) !== "ObjectProperty" || kind(field.getKey()) !== "Name" || kind(field.getValue()) !== "Name") reject("FLOWSCRIPT_V3_DESTRUCTURING", node, "Use one-level fields without defaults or rest.");
					var key = String(field.getKey().getIdentifier()), alias = String(field.getValue().getIdentifier());
					var binding = declare(alias, "const", node, loopScope); binding.loopDepth = loopDepth + 1;
					emit("local." + alias + " = current." + key, origin);
				});
				loopDepth++; body(node.getBody(), loopScope); loopDepth--; emit("} })", line(end(node) - 1)); return;
			}
			if (k === "ForLoop") {
				var initializer = node.getInitializer(), vars = kind(initializer) === "VariableDeclaration" ? array(initializer.getVariables()) : [];
				var counter = vars.length === 1 && kind(vars[0].getTarget()) === "Name" ? String(vars[0].getTarget().getIdentifier()) : "";
				var condition = node.getCondition(), increment = node.getIncrement(), operator = kind(condition) === "InfixExpression" ? String(Packages.org.mozilla.javascript.ast.AstNode.operatorToString(condition.getOperator())) : "";
				if (vars.length !== 1 || !counter || source.substring(pos(initializer), pos(vars[0].getTarget())).trim() !== "let" || !vars[0].getInitializer() ||
					!["<", "<="].includes(operator) || kind(condition.getLeft()) !== "Name" || String(condition.getLeft().getIdentifier()) !== counter ||
					kind(increment) !== "UpdateExpression" || kind(increment.getOperand()) !== "Name" || String(increment.getOperand().getIdentifier()) !== counter || raw(increment).indexOf("++") < 0)
					reject("FLOWSCRIPT_V3_FOR_FORM", node, "Use for (let i = start; i < end; i++).");
				var countedScope = child(current), counterEntry = declare(counter, "let", vars[0].getTarget(), countedScope); counterEntry.loopDepth = loopDepth + 1;
				visit(node.getBody(), function (part) {
					if (kind(part) === "Assignment" || kind(part) === "UpdateExpression") {
						var target = kind(part) === "Assignment" ? part.getLeft() : part.getOperand();
						var direct = kind(target) === "Name" && String(target.getIdentifier()) === counter;
						var scoped = kind(target) === "PropertyGet" && kind(target.getTarget()) === "Name" && String(target.getTarget().getIdentifier()) === "local" && String(target.getProperty().getIdentifier()) === counter;
						if (direct || scoped) reject("FLOWSCRIPT_V3_FOR_FORM", part, "Leave the counter to i++, or write a while loop with a local the body changes: let i = start; while (i < end) { … }.");
					}
					return true;
				});
				var continued = false;
				visit(node.getBody(), function (part) {
					if (kind(part) === "ContinueStatement") for (var enclosing = part.getParent(); enclosing; enclosing = enclosing.getParent()) {
						if (["WhileLoop", "ForLoop", "ForInLoop", "DoLoop"].indexOf(kind(enclosing)) >= 0) { continued = continued || enclosing === node; break; }
					}
					return !continued;
				});
				if (continued) {
					// continue leaves the pass: the counter steps first, on a hidden local, so that the test sees i + 1 as in
					// JavaScript whether or not the rest of the body runs; i takes the value of the pass and is never assigned.
					var hidden = "local.__count" + (++counted), steps = { names: Object.create(null), parent: countedScope };
					steps.names[counter] = { name: counter, type: "let", mapped: hidden, loopDepth: loopDepth + 1 };
					emit(hidden + " = " + rewritten(vars[0].getInitializer(), current), origin);
					emit("while({ condition: " + rewritten(condition, steps) + ", maxIterations: 1000000, timeoutMs: 60000, $$nodes() {", origin);
					emit("local." + counter + " = " + hidden, origin);
					emit(hidden + " = Number(" + hidden + ") + 1", line(pos(increment)));
					loopDepth++; body(node.getBody(), countedScope); loopDepth--;
					emit("} })", line(end(node) - 1)); return;
				}
				emit("local." + counter + " = " + rewritten(vars[0].getInitializer(), current), origin);
				emit("while({ condition: " + rewritten(condition, countedScope) + ", maxIterations: 1000000, timeoutMs: 60000, $$nodes() {", origin);
				loopDepth++; body(node.getBody(), countedScope); emit("local." + counter + " = Number(local." + counter + ") + 1", line(pos(increment))); loopDepth--;
				emit("} })", line(end(node) - 1)); return;
			}
			if (k === "ForInLoop" || k === "DoLoop") reject("FLOWSCRIPT_V3_LOOP_FORM", node, "Use while or for…of.");
			if (k === "BreakStatement") reject("FLOWSCRIPT_V3_BREAK", node, "Use a local tested by the while condition or find/filter.");
			if (k === "ContinueStatement") { if (!loopDepth) reject("FLOWSCRIPT_V3_LOOP_FORM", node, "Use continue only inside a loop."); emit("return", origin); return; }
			if (k === "ThrowStatement") {
				var thrown = node.getExpression();
				if (kind(thrown) === "Name") {
					// throw e, e the parameter of an enclosing catch (a const, never assigned): the caught error again, unchanged
					var caught = lookup(String(thrown.getIdentifier()), current);
					if (!caught || !caught.caught) reject("FLOWSCRIPT_V3_UNSUPPORTED", node, "Throw an object with a literal code (throw { code: \"LITERAL\", message }), or the parameter of the enclosing catch to raise the caught error again.");
					emit("throw({ error: " + JSON.stringify(caught.mapped) + " })", origin); return;
				}
				if (kind(thrown) === "NewExpression") reject("FLOWSCRIPT_V3_ERROR_CODE_CHOICE", node, "throw { code: \"CHOOSE_ERROR_CODE\", message: ... }");
				if (kind(thrown) !== "ObjectLiteral") reject("FLOWSCRIPT_V3_UNSUPPORTED", node, "Throw an object with a literal code.");
				// error is the property of the throw block that raises a caught error again: a field of that name would not be
				// a field of the thrown error
				if (array(thrown.getElements()).some(function (field) { return kind(field) === "ObjectProperty" && /^["']?error["']?$/.test(raw(field.getKey()).trim()); })) {
					reject("FLOWSCRIPT_V3_UNSUPPORTED", node, "Name that field otherwise (details: { error: … }); to raise a caught error again, write throw e in its catch.");
				}
				emit("throw " + rewritten(thrown, current), origin); return;
			}
			if (k === "TryStatement") {
				if (node.getFinallyBlock()) reject("FLOWSCRIPT_V3_FINALLY", node.getFinallyBlock(), "Write statements after the try.");
				var clause = array(node.getCatchClauses())[0]; if (!clause) reject("FLOWSCRIPT_V3_UNSUPPORTED", node, "Use try/catch.");
				var parameter = clause.getVarName(), catchScope = child(current), errorPath;
				if (parameter && kind(parameter) !== "Name") reject("FLOWSCRIPT_V3_DESTRUCTURING", parameter, "Name the caught error: catch (failure) { … failure.code … }.");
				if (parameter) {
					var caughtBinding = declare(String(parameter.getIdentifier()), "const", clause, catchScope);
					caughtBinding.caught = true; errorPath = caughtBinding.mapped;
				} else {
					// catch { … } declares no name: the error goes to local.error, or to a hidden local when the Flow has its own
					// error local, which the try must not overwrite
					errorPath = allNames.error || /\blocal\s*\.\s*error\b/.test(source) ? "local.__caught" + (++chain) : "local.error";
				}
				emit("try({ error: " + JSON.stringify(errorPath) + ", $$try() {", origin); body(node.getTryBlock(), child(current));
				emit("}, $$catch() {", line(pos(clause))); body(clause.getBody(), catchScope); emit("} })", line(end(node) - 1)); return;
			}
			if (k === "SwitchStatement") {
				var cases = array(node.getCases()), switchValue = value(node.getExpression(), current), switchPath = "local.__chain" + (++chain), opened = 0;
				switchValue.before.forEach(function (item) { emit(item, origin); }); emit(switchPath + " = " + switchValue.expression, origin);
				cases.forEach(function (item, index) {
					var members = array(item.getStatements()), last = members[members.length - 1], label = item.getExpression();
					if (!members.length || !["BreakStatement", "ReturnStatement", "ThrowStatement"].includes(kind(last)) ||
						(label && !["StringLiteral", "NumberLiteral", "KeywordLiteral"].includes(kind(label))) || (item.isDefault() && index !== cases.length - 1))
						reject("FLOWSCRIPT_V3_SWITCH_FALLTHROUGH", item, "Use literal cases ending with break, return or throw; put default last.");
					if (opened) emit("} else {", line(pos(item)));
					if (!item.isDefault()) { emit("if (" + switchPath + " === " + rewritten(label, current) + ") {", line(pos(item))); opened++; }
					var caseScope = child(current); members.forEach(function (member, memberIndex) { if (memberIndex !== members.length - 1 || kind(member) !== "BreakStatement") statement(member, caseScope); });
				});
				while (opened-- > 0) emit("}", line(end(node) - 1)); return;
			}
			if (k === "LabeledStatement") {
				var labelled = node.getStatement();
				if (["WhileLoop", "ForLoop", "ForInLoop", "DoLoop"].includes(kind(labelled))) reject("FLOWSCRIPT_V3_LOOP_FORM", node, "Use an unlabelled loop.");
				var firstLine = lines.length, labels = array(node.getLabels());
				if (labels.length !== 1) reject("FLOWSCRIPT_V3_UNSUPPORTED", node, "Use one label.");
				statement(labelled, current);
				if (lines.length > firstLine) lines[firstLine] = String(labels[0].getName()) + ": " + lines[firstLine];
				return;
			}
			if (k === "FunctionNode") reject("FLOWSCRIPT_V3_FUNCTION", node, "Write a project block.");
			if (k === "EmptyStatement") return;
			reject("FLOWSCRIPT_V3_UNSUPPORTED", node, "Use a supported FlowScript v3 statement (" + k + ").");
		}
		try {
			var top = children(ast), main = null, helpers = [];
			var topCursor = 0;
			top.forEach(function (node) {
				if (kind(node) === "FunctionNode") { if (main) helpers.push(node); else main = node; return; }
				if (main) reject("FLOWSCRIPT_V3_FUNCTION", node, "Put helpers after the Flow function.");
				trivia(topCursor, pos(node)); topCursor = end(node);
				if (kind(node) !== "VariableDeclaration") reject("FLOWSCRIPT_V3_UNSUPPORTED", node, "Put metadata and imports before the function.");
				array(node.getVariables()).forEach(function (decl) {
					var target = decl.getTarget(), init = decl.getInitializer();
					if (source.substring(pos(node), pos(target)).trim() !== "const") reject("FLOWSCRIPT_V3_UNSUPPORTED", node, "Use const for metadata and imports.");
					if (kind(target) === "Name" && String(target.getIdentifier()) === "_flow") { emit(raw(node).replace(/sourceVersion\s*:\s*3\b/, "sourceVersion: 2"), line(pos(node))); return; }
					if (!init || kind(init) !== "FunctionCall" || raw(init.getTarget()).replace(/\s/g, "") !== "flow.import") reject("FLOWSCRIPT_V3_IMPORT_SYNTAX", node, "Use const { name } = flow.import(\"module\").");
					var args = argument(init); if (args.length !== 1 || kind(args[0]) !== "StringLiteral") reject("FLOWSCRIPT_V3_IMPORT_SYNTAX", node, "Use a literal module name.");
					var moduleName = String(args[0].getValue());
					if (kind(target) === "Name") { var namespace = String(target.getIdentifier()); if (reserved.test(namespace)) reject("FLOWSCRIPT_V3_RESERVED_NAME", target, "Choose another import alias."); imports[namespace] = true; emit("import * as " + namespace + " from " + JSON.stringify(moduleName), line(pos(node))); }
					else if (kind(target) === "ObjectLiteral") {
						var named = array(target.getElements()).map(function (field) {
							if (kind(field) !== "ObjectProperty" || kind(field.getKey()) !== "Name" || kind(field.getValue()) !== "Name") reject("FLOWSCRIPT_V3_DESTRUCTURING", node, "Use one-level named imports.");
							var original = String(field.getKey().getIdentifier()), alias = String(field.getValue().getIdentifier());
							if (reserved.test(alias)) reject("FLOWSCRIPT_V3_RESERVED_NAME", field, "Choose another import alias.");
							imports[alias] = true;
							return original === alias ? original : original + " as " + alias;
						});
						emit("import { " + named.join(", ") + " } from " + JSON.stringify(moduleName), line(pos(node)));
					}
					else reject("FLOWSCRIPT_V3_DESTRUCTURING", target, "Use one-level named imports.");
				});
			});
			if (!main) reject("FLOWSCRIPT_V3_FUNCTION", 0, "Declare one Flow function.");
			// the Flow function is the first one: a helper declared before it would take its place (L15F, 20/11)
			var readsFlowScopes = function (fn) {
				var params = array(fn.getParams());
				return params.length === 1 && kind(params[0]) === "ObjectLiteral" && array(params[0].getElements()).some(function (field) {
					return kind(field) === "ObjectProperty" && kind(field.getKey()) === "Name" && /^(?:input|config|result)$/.test(String(field.getKey().getIdentifier()));
				});
			};
			var flowFunction = readsFlowScopes(main) ? null : helpers.filter(readsFlowScopes)[0];
			if (flowFunction) reject("FLOWSCRIPT_V3_FUNCTION", main, "Put the Flow function " + String(flowFunction.getName()) + " first, then its helpers.");
			trivia(topCursor, pos(main));
			var functionText = raw(main), open = functionText.indexOf("{", functionText.indexOf(")") + 1);
			if (open < 0) reject("FLOWSCRIPT_V3_FUNCTION", main, "Use function Name({ input, config, result }) { ... }.");
			emit(functionText.substring(0, open + 1), line(pos(main)));
			body(main.getBody(), scope);
			emit("}", line(end(main) - 1));
			var previous = main;
			helpers.forEach(function (helper) {
				trivia(end(previous), pos(helper)); previous = helper;
				var params = array(helper.getParams());
				if (params.length !== 1 || kind(params[0]) !== "ObjectLiteral") reject("FLOWSCRIPT_V3_FUNCTION", helper, "Use one object parameter in a top-level helper.");
				var helperScope = child(null), names = [];
				array(params[0].getElements()).forEach(function (field) {
					if (kind(field) !== "ObjectProperty" || kind(field.getKey()) !== "Name" || kind(field.getValue()) !== "Name") reject("FLOWSCRIPT_V3_FUNCTION", field, "Use one-level object fields without defaults or rest.");
					var key = String(field.getKey().getIdentifier()), alias = String(field.getValue().getIdentifier());
					declare(alias, "const", field, helperScope, "input." + key);
					names.push(key);
				});
				var helperText = raw(helper), helperOpen = helperText.indexOf("{", helperText.indexOf(")") + 1);
				if (helperOpen < 0) reject("FLOWSCRIPT_V3_FUNCTION", helper, "Use a top-level helper function.");
				emit("function " + String(helper.getName()) + "(" + names.join(", ") + ") {", line(pos(helper)));
				resultStyle = "";
				body(helper.getBody(), helperScope);
				emit("}", line(end(helper) - 1));
			});
		} catch (error) {
			if (!error || !error.code) {
				var unexpected = { severity: "error", code: "FLOWSCRIPT_V3_UNSUPPORTED", line: 1,
					message: "This JavaScript construct cannot be translated faithfully (FLOWSCRIPT_V3_UNSUPPORTED at line 1): " + String(error), hint: "Rewrite as explicit Flow block calls." };
				diagnostics.push(unexpected);
			}
		}
		return { code: diagnostics.length ? "" : lines.join("\n"), lineMap: lineMap, diagnostics: diagnostics };
	}
	return { translate: translate };
})()
