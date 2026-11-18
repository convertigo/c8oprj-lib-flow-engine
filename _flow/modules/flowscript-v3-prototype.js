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
			return at;
		}
		function end(node) {
			var finish = Number(node.getAbsolutePosition()) + Number(node.getLength());
			if (kind(node) === "InfixExpression" && node.getRight && node.getRight()) {
				var rightEnd = end(node.getRight());
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
				FLOWSCRIPT_V3_UNTYPED_LIST: "An empty list must declare its item type before push",
				FLOWSCRIPT_V3_GLOBAL_CALL: "This global call cannot be lowered in this expression or with these arguments",
				FLOWSCRIPT_V3_ERROR_CODE_CHOICE: "throw new Error lacks the literal public error code required by Flow",
				FLOWSCRIPT_V3_UNSUPPORTED: "This JavaScript construct is outside the FlowScript v3 subset",
				FLOWSCRIPT_V3_OBJECT_CONDITION: "An object literal is not a Flow if or while condition",
				FLOWSCRIPT_V3_PROTOTYPE_RETHROW: "Rethrowing a caught value has no faithful prototype lowering"
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
		function visit(node, callback) { node.visit(new Packages.org.mozilla.javascript.ast.NodeVisitor({ visit: function (n) { return callback(n) !== false; } })); }
		function preparedForOf(text) {
			// Token scan, not a text-wide regular expression. A for…of header is the
			// only place where Rhino's const token needs the same-length workaround.
			var out = text.split(""), state = "code", quote = "", i = 0;
			while (i < text.length) {
				var c = text.charAt(i), next = text.charAt(i + 1);
				if (state === "line") { if (c === "\n") state = "code"; i++; continue; }
				if (state === "block") { if (c === "*" && next === "/") { state = "code"; i += 2; } else i++; continue; }
				if (state === "string") { if (c === "\\") i += 2; else if (c === quote) { state = "code"; i++; } else i++; continue; }
				if (c === "/" && next === "/") { state = "line"; i += 2; continue; }
				if (c === "/" && next === "*") { state = "block"; i += 2; continue; }
				if (c === "\"" || c === "'" || c === "`") { state = "string"; quote = c; i++; continue; }
				if (text.substring(i, i + 3) === "for" && !/[\w$]/.test(text.charAt(i - 1)) && !/[\w$]/.test(text.charAt(i + 3))) {
					var j = i + 3; while (/\s/.test(text.charAt(j))) j++;
					if (text.charAt(j) === "(") { j++; while (/\s/.test(text.charAt(j))) j++;
						if (text.substring(j, j + 5) === "const" && !/[\w$]/.test(text.charAt(j + 5))) {
							var tail = text.substring(j + 5), ofAt = tail.search(/\s+of\b/), closeAt = tail.indexOf(")");
							if (ofAt >= 0 && (closeAt < 0 || ofAt < closeAt)) { out[j] = "l"; out[j + 1] = "e"; out[j + 2] = "t"; out[j + 3] = " "; out[j + 4] = " "; }
						}
					}
				}
				i++;
			}
			return out.join("");
		}
		prepared = preparedForOf(source);
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
		var resultStyle = "", chain = 0, loopDepth = 0, countedDepth = 0, blockNamespaces = Object.create(null);
		visit(ast, function (part) {
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
			if (reserved.test(name)) reject("FLOWSCRIPT_V3_RESERVED_NAME", node, "Choose another local name.");
			if (blockNamespaces[name] && /^(?:text|list|json|http|object|email|sql|date|number|crypto|requestable)$/.test(name) && !imports[name]) reject("FLOWSCRIPT_V3_NAME_SHADOWS_BLOCK", node, "Choose a name different from the block namespace.");
			if (lookup(name, current) || imports[name]) reject("FLOWSCRIPT_V3_SHADOWING", node, "Choose another local name.");
			var entry = { name: name, type: type, mapped: mapped || "local." + name, loopDepth: loopDepth };
			current.names[name] = entry; allNames[name] = true; return entry;
		}
		function rewritten(node, current) {
			if (!node) return "undefined";
			var start = pos(node), finish = end(node), edits = [];
			visit(node, function (part) {
				var k = kind(part), parent = part.getParent();
				if (k === "FunctionCall" && /^(?:Object|JSON|Date)\./.test(raw(part.getTarget()).replace(/\s/g, ""))) reject("FLOWSCRIPT_V3_GLOBAL_CALL", part, "Move the global call into its own assignment or return.");
				if (k === "FunctionCall" && part !== node && ["filter", "map", "find", "some", "every", "toSorted", "sort"].indexOf(method(part)) >= 0) reject("FLOWSCRIPT_V3_CHAIN", part, "Split the chain into two const declarations.");
				if (k === "FunctionNode") reject("FLOWSCRIPT_V3_FUNCTION", part, "Write the expression inline or use a project block.");
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
		function value(node, current) {
			if (kind(node) === "PropertyGet" && kind(node.getTarget()) === "FunctionCall") {
				var receiverValue = value(node.getTarget(), current);
				return { before: receiverValue.before, expression: receiverValue.expression + "." + String(node.getProperty().getIdentifier()) };
			}
			if (kind(node) !== "FunctionCall") return { before: [], expression: rewritten(node, current) };
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
					var pred = rewritten(body, inner), temp = "local.__chain" + (++chain), before = prefix.before.slice();
					var where = name === "every" ? "!(" + pred + ")" : pred;
					before.push(temp + " = list." + (name === "map" ? "map" : "filter") + "({ items: " + prefix.expression + ", " + (name === "map" ? "select" : "where") + ": " + where + " })");
					return { before: before, expression: name === "find" ? temp + "[0]" : name === "some" ? temp + ".length > 0" : name === "every" ? temp + ".length == 0" : temp };
			}
			if (receiver && (name === "toSorted" || name === "sort" && !(kind(receiver) === "Name" && String(receiver.getIdentifier()) === "list"))) {
				if (args.length !== 1 || kind(args[0]) !== "FunctionNode" || array(args[0].getParams()).length !== 2) reject("FLOWSCRIPT_V3_LIST_METHOD", node, "Use a two-parameter key comparator.");
				var comparator = args[0], params = array(comparator.getParams()), first = String(params[0].getIdentifier()), second = String(params[1].getIdentifier());
				var sortBody = comparator.getBody(), sortParts = kind(sortBody) === "Block" || kind(sortBody) === "Scope" ? children(sortBody) : [];
				if (sortParts.length === 1 && kind(sortParts[0]) === "ReturnStatement") sortBody = sortParts[0].getReturnValue();
				var locale = kind(sortBody) === "FunctionCall" && method(sortBody) === "localeCompare";
				var l, r;
				if (locale && argument(sortBody).length === 1) {
					l = sortBody.getTarget().getTarget(); r = argument(sortBody)[0];
					function unstring(node) {
						return kind(node) === "FunctionCall" && raw(node.getTarget()).trim() === "String" && argument(node).length === 1 ? argument(node)[0] : node;
					}
					l = unstring(l); r = unstring(r);
				}
				else if (kind(sortBody) === "InfixExpression" && String(Packages.org.mozilla.javascript.ast.AstNode.operatorToString(sortBody.getOperator())) === "-") { l = sortBody.getLeft(); r = sortBody.getRight(); }
				else reject("FLOWSCRIPT_V3_LIST_METHOD", node, "Compare the same item key with subtraction or localeCompare.");
				var identity = kind(l) === "Name" && kind(r) === "Name";
				var keyed = kind(l) === "PropertyGet" && kind(r) === "PropertyGet" && kind(l.getTarget()) === "Name" && kind(r.getTarget()) === "Name" && String(l.getProperty().getIdentifier()) === String(r.getProperty().getIdentifier());
				if (!identity && !keyed) reject("FLOWSCRIPT_V3_LIST_METHOD", node, "Compare the same item or item key.");
				var leftName = String(identity ? l.getIdentifier() : l.getTarget().getIdentifier()), rightName = String(identity ? r.getIdentifier() : r.getTarget().getIdentifier());
				var direction = leftName === first && rightName === second ? "asc" : leftName === second && rightName === first ? "desc" : "";
				if (!direction) reject("FLOWSCRIPT_V3_LIST_METHOD", node, "Compare the two callback parameters.");
				var sortTemp = "local.__chain" + (++chain), sortBefore = prefix.before.slice();
				sortBefore.push(sortTemp + " = list.sort({ items: " + prefix.expression + (keyed ? ", by: current." + String(l.getProperty().getIdentifier()) : "") + ", compare: \"" + (locale ? "locale" : "number") + "\", direction: \"" + direction + "\" })");
				return { before: sortBefore, expression: sortTemp };
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
		function emitValue(node, current, target, origin) {
			var lowered = value(node, current);
			lowered.before.forEach(function (item) { emit(item, origin); });
			emit(target + " = " + lowered.expression, origin);
		}
		function body(node, current) {
			var block = kind(node) === "Block" || kind(node) === "Scope", statements = block ? children(node) : [node], cursor = block ? pos(node) + 1 : pos(node);
			statements.forEach(function (item) {
				var gap = source.substring(cursor, pos(item)), disabled = /\/\/\s*@disabled\b/.test(gap) && !/\/\/\s*@disabled[^\n]*\n\s*\n/.test(gap);
				trivia(cursor, pos(item)); var first = lines.length; statement(item, current);
				if (disabled) {
					if (lines.length !== first + 1) reject("FLOWSCRIPT_V3_UNSUPPORTED", item, "Put $$disabled: true on each block generated by this statement.");
					var emitted = lines[first], assignment = /^((?:local|result)\.[A-Za-z_$][\w$.]*)\s*=\s*([\s\S]*)$/.exec(emitted);
					if (assignment) lines[first] = "set({ path: " + JSON.stringify(assignment[1]) + ", value: " + assignment[2] + ", $$disabled: true })";
					else if (/^[A-Za-z_$][\w$.]*\(\{/.test(emitted)) lines[first] = emitted.replace("({", "({ $$disabled: true, ");
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
					var name = String(target.getIdentifier()), rhs = init ? value(init, current) : { before: [], expression: "undefined" };
					var declared = declare(name, type, target, current);
					declared.typedList = init && kind(init) === "FunctionCall" && raw(init.getTarget()).replace(/\s/g, "") === "json.array";
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
					if (kind(left) === "ElementGet" && kind(left.getTarget()) === "Name") {
						var mapName = String(left.getTarget().getIdentifier()), map = lookup(mapName, current);
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
					var operand = expression.getOperand(), updateName = kind(operand) === "Name" ? String(operand.getIdentifier()) : "", update = lookup(updateName, current);
					if (!update) reject("FLOWSCRIPT_V3_OUT_OF_SCOPE", node, "Declare the local first.");
					if (update.type === "const") reject("FLOWSCRIPT_V3_CONST_ASSIGN", node, "Declare the variable with let.");
					emit(update.mapped + " = " + update.mapped + (raw(expression).indexOf("++") >= 0 ? " + 1" : " - 1"), origin); return;
				}
				if (ek === "FunctionCall") {
					var controlName = raw(expression.getTarget()).replace(/\s/g, "");
					var slotArgs = argument(expression), hasSlot = slotArgs.length === 1 && kind(slotArgs[0]) === "ObjectLiteral" &&
						array(slotArgs[0].getElements()).some(function (property) { return /^\$\$/.test(raw(property.getKey()).trim()) && kind(property.getValue()) === "FunctionNode"; });
					if (/^flow\.(?:while|forEach|if|try)$/.test(controlName) || hasSlot) {
						var controlArgs = argument(expression);
						if (controlArgs.length !== 1 || kind(controlArgs[0]) !== "ObjectLiteral") reject("FLOWSCRIPT_V3_UNSUPPORTED", node, "Call flow control blocks with one object argument.");
						emit((controlName.substring(0, 5) === "flow." ? controlName.substring(5) : controlName) + "({", origin);
						array(controlArgs[0].getElements()).forEach(function (property) {
							if (kind(property) !== "ObjectProperty") reject("FLOWSCRIPT_V3_UNSUPPORTED", property, "Use named control properties.");
							var key = raw(property.getKey()).trim(), item = property.getValue();
							if (/^\$\$[A-Za-z_$][\w$]*$/.test(key) && kind(item) === "FunctionNode") {
								if (kind(item) !== "FunctionNode" || array(item.getParams()).length) reject("FLOWSCRIPT_V3_FUNCTION", property, "Use a zero-argument slot function.");
								emit(key + "() {", line(pos(property))); body(item.getBody(), child(current)); emit("},", line(end(property) - 1));
							} else emit(key + ": " + rewritten(item, current) + ",", line(pos(property)));
						});
						emit("})", line(end(node) - 1)); return;
					}
					if (method(expression) === "push") {
						var rec = expression.getTarget().getTarget(), recName = kind(rec) === "Name" ? String(rec.getIdentifier()) : "", list = lookup(recName, current);
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
				if (returned) { var v = value(returned, current); v.before.forEach(function (item) { emit(item, origin); }); emit("return " + v.expression, origin); }
				else emit("return", origin); return;
			}
			if (k === "IfStatement") {
				if (kind(node.getCondition()) === "ObjectLiteral") reject("FLOWSCRIPT_V3_OBJECT_CONDITION", node.getCondition(), "Use flow.if({ ... }).");
				emit("if (" + rewritten(node.getCondition(), current) + ") {", origin); body(node.getThenPart(), child(current));
				var otherwise = node.getElsePart(); if (otherwise) { emit("} else {", line(pos(otherwise))); body(otherwise, child(current)); }
				emit("}", line(end(node) - 1)); return;
			}
			if (k === "WhileLoop") {
				if (kind(node.getCondition()) === "ObjectLiteral") reject("FLOWSCRIPT_V3_OBJECT_CONDITION", node.getCondition(), "Use flow.while({ ... }).");
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
				emit("forEach({ items: " + rewritten(node.getIteratedObject(), current) + ", $$nodes() {", origin);
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
						if (direct || scoped) reject("FLOWSCRIPT_V3_FOR_FORM", part, "Do not assign the counted loop variable in its body.");
					}
					return true;
				});
				emit("local." + counter + " = " + rewritten(vars[0].getInitializer(), current), origin);
				emit("while({ condition: " + rewritten(condition, countedScope) + ", maxIterations: 1000000, timeoutMs: 60000, $$nodes() {", origin);
				loopDepth++; countedDepth++; body(node.getBody(), countedScope); countedDepth--; emit("local." + counter + " = local." + counter + " + 1", line(pos(increment))); loopDepth--;
				emit("} })", line(end(node) - 1)); return;
			}
			if (k === "ForInLoop" || k === "DoLoop") reject("FLOWSCRIPT_V3_LOOP_FORM", node, "Use while or for…of.");
			if (k === "BreakStatement") reject("FLOWSCRIPT_V3_BREAK", node, "Use a local tested by the while condition or find/filter.");
			if (k === "ContinueStatement") { if (!loopDepth) reject("FLOWSCRIPT_V3_LOOP_FORM", node, "Use continue only inside a loop."); if (countedDepth) reject("FLOWSCRIPT_V3_FOR_FORM", node, "A counted for body cannot contain continue."); emit("return", origin); return; }
			if (k === "ThrowStatement") {
				var thrown = node.getExpression(); if (kind(thrown) === "Name") reject("FLOWSCRIPT_V3_PROTOTYPE_RETHROW", node, "Raising the caught error again is not available yet: throw { code: \"LITERAL_CODE\", message: " + String(thrown.getIdentifier()) + ".message, details: " + String(thrown.getIdentifier()) + ".details }");
				if (kind(thrown) === "NewExpression") reject("FLOWSCRIPT_V3_ERROR_CODE_CHOICE", node, "throw { code: \"CHOOSE_ERROR_CODE\", message: ... }");
				if (kind(thrown) !== "ObjectLiteral") reject("FLOWSCRIPT_V3_UNSUPPORTED", node, "Throw an object with a literal code.");
				emit("throw " + rewritten(thrown, current), origin); return;
			}
			if (k === "TryStatement") {
				if (node.getFinallyBlock()) reject("FLOWSCRIPT_V3_FINALLY", node.getFinallyBlock(), "Write statements after the try.");
				var clause = array(node.getCatchClauses())[0]; if (!clause) reject("FLOWSCRIPT_V3_UNSUPPORTED", node, "Use try/catch.");
				var errorName = clause.getVarName() ? String(clause.getVarName().getIdentifier()) : "error", catchScope = child(current);
				declare(errorName, "const", clause, catchScope);
				emit("try({ error: \"local." + errorName + "\", $$try() {", origin); body(node.getTryBlock(), child(current));
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
