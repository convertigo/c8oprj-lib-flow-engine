(function () {
	function create(env) {
		function parseFlowScriptArgs(text, lineNumber) {
			text = String(text || "").trim();
			if (text === "") {
				return {};
			}
			try {
				return env.normalizeTree(env.parseYamlSource(text, "{}"));
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
						env.raise("FLOWSCRIPT_UNBALANCED_SYNTAX", "Unbalanced FlowScript statement at line " + pending.line
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
					env.raise("FLOWSCRIPT_UNBALANCED_SYNTAX", "Unbalanced FlowScript statement at line " + pending.line + ": " + problem,
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
	
		function parseFlowScriptObjectLiteral(text, lineNumber) {
			text = String(text || "").trim();
			if (!isFlowScriptObjectLiteral(text)) {
				env.raise("FLOWSCRIPT_INVALID_OBJECT", "Expected object literal at line " + lineNumber + ": " + text);
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
			var descriptor = env.blockCatalog(blocks && blocks[block]) || {};
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
				var mapped = locals[name] === true ? "local." + name : String(locals[name] || ("local." + name));
				expr = expr.replace(new RegExp("(^|[^A-Za-z0-9_$\\.])" + escaped + "(?=\\b|\\.)", "g"), "$1" + mapped);
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
			if (isFlowScriptArrayLiteral(token) || isFlowScriptObjectLiteral(token)) {
				return env.normalizeTree(env.parseYamlSource(token, "{}"));
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
						env.raise("FLOWSCRIPT_INVALID_TEMPLATE_LITERAL", "Unclosed template literal expression at line " + lineNumber + ": " + token);
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
			var args = env.normalizeTree(parsed.value || {});
			var tokens = parsed.tokens || {};
			Object.keys(tokens).forEach(function (key) {
				if (key === "id" || key === "comment") {
					args[key] = unquoteFlowScriptString(tokens[key]);
					return;
				}
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

		function flowScriptPropertyValueFromToken(blocks, block, key, token, locals, lineNumber) {
			var kind = flowScriptPropKind(blocks, block, key);
			if (kind === "expression") {
				return flowScriptExpressionFromToken(token, locals);
			}
			if (kind === "path") {
				return flowScriptPathFromToken(token, locals);
			}
			if (kind === "template" || kind === "value") {
				return flowScriptValueFromToken(token, locals, lineNumber);
			}
			if (kind === "text" || kind === "schema" || kind === "secret") {
				return unquoteFlowScriptString(token);
			}
			return flowScriptValueFromToken(token, locals, lineNumber);
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

		function isFlowScriptExpressionCallName(name) {
			return ["lower", "upper", "trim", "contains", "startsWith", "endsWith",
				"length", "list.length", "round", "default", "json"].indexOf(String(name || "")) !== -1;
		}

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
						if (!rest || !rest.match(/^(?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])+$/)) {
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
				items: flowScriptRewriteExpression(itemsToken || "local.items", locals),
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
				mapperNode = normalizeNaturalFlowScriptProps(blocks, mapperBlock, parseFlowScriptObjectLiteral(mapperArgs[0], lineNumber), locals, lineNumber);
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
			if (isFlowScriptObjectLiteral(selectToken)) {
				return buildNaturalListMapNodes(blocks, imports, varName, [itemToken, selectToken], locals, lineNumber);
			}
			var selectObjectLiteral = flowScriptObjectLiteralFromExpressionToken(selectToken);
			if (selectObjectLiteral) {
				return buildNaturalListMapNodes(blocks, imports, varName, [itemToken, selectObjectLiteral], locals, lineNumber);
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
								items: flowScriptRewriteExpression(args[0] || "local.items", locals),
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
				env.raise("FLOWSCRIPT_UNSUPPORTED_ASSIGNMENT", "Unsupported FlowScript assignment at line " + lineNumber + ": " + rhs,
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
				} else if (args.length > 1) {
					node.by = flowScriptExpressionFromToken(args[1], locals);
				}
			} else if (block === "list.map") {
				node.items = flowScriptRewriteExpression(args[0] || "local.items", locals);
				if (args.length > 1) {
					node.select = flowScriptExpressionFromToken(args[1], locals);
				}
			} else if (block === "list.filter") {
				node.items = flowScriptRewriteExpression(args[0] || "local.items", locals);
				if (args.length > 1 && isFlowScriptObjectLiteral(args[1])) {
					Object.assign(node, normalizeNaturalFlowScriptProps(blocks, block, parseFlowScriptObjectLiteral(args[1], lineNumber), locals, lineNumber));
				} else if (args.length > 1) {
					node.where = flowScriptExpressionFromToken(args[1], locals);
				}
			} else if (block === "list.take") {
				if (args.length === 1 && isFlowScriptObjectLiteral(args[0])) {
					node = normalizeNaturalFlowScriptProps(blocks, block, parseFlowScriptObjectLiteral(args[0], lineNumber), locals, lineNumber);
				} else if (call.name === "list.slice") {
					node.items = flowScriptRewriteExpression(args[0] || "local.items", locals);
					node.offset = flowScriptExpressionFromToken(args[1] || "0", locals);
					if (args.length > 2) {
						node.count = flowScriptSliceCount(args[1] || "0", args[2], locals);
					}
				} else {
					node.items = flowScriptRewriteExpression(args[0] || "local.items", locals);
					if (args.length > 1 && isFlowScriptObjectLiteral(args[1])) {
						Object.assign(node, normalizeNaturalFlowScriptProps(blocks, block, parseFlowScriptObjectLiteral(args[1], lineNumber), locals, lineNumber));
					} else if (args.length > 1) {
						node.count = flowScriptExpressionFromToken(args[1], locals);
					}
					if (args.length > 2) {
						node.offset = flowScriptExpressionFromToken(args[2], locals);
					}
				}
			} else if (block === "json.select") {
				var options = null;
				if (args.length > 1 && isFlowScriptObjectLiteral(args[args.length - 1])) {
					options = normalizeNaturalFlowScriptProps(blocks, block,
						parseFlowScriptObjectLiteral(args.pop(), lineNumber), locals, lineNumber);
				}
				if (args.length === 1) {
					var selector = flowScriptObjectPathSelector(args[0], locals);
					if (selector) {
						node.source = selector.source;
						node.path = selector.path;
					} else {
						node.source = flowScriptExpressionFromToken(args[0], locals);
						node.path = "";
					}
				} else if (args.length >= 2) {
					node.source = flowScriptExpressionFromToken(args[0], locals);
					node.path = flowScriptSelectorPathFromToken(args[1], locals);
				}
				if (options) {
					Object.assign(node, options);
				}
			} else if (block === "http.get") {
				if (args.length > 0 && !isFlowScriptObjectLiteral(args[0])) {
					node.url = flowScriptValueFromToken(args[0], locals, lineNumber);
				}
				if (args.length > 1 && isFlowScriptObjectLiteral(args[1])) {
					Object.assign(node, normalizeNaturalFlowScriptProps(blocks, block, parseFlowScriptObjectLiteral(args[1], lineNumber), locals, lineNumber));
				}
			} else if (block === "http.request") {
				if (args.length === 1 && isFlowScriptObjectLiteral(args[0])) {
					node = normalizeNaturalFlowScriptProps(blocks, block, parseFlowScriptObjectLiteral(args[0], lineNumber), locals, lineNumber);
				} else {
					if (args.length > 0 && !isFlowScriptObjectLiteral(args[0])) {
						if (args.length > 1) {
							node.method = unquoteFlowScriptString(args[0]).toUpperCase();
							node.url = flowScriptValueFromToken(args[1], locals, lineNumber);
						} else {
							node.url = flowScriptValueFromToken(args[0], locals, lineNumber);
						}
					}
					if (args.length > 2 && isFlowScriptObjectLiteral(args[2])) {
						Object.assign(node, normalizeNaturalFlowScriptProps(blocks, block, parseFlowScriptObjectLiteral(args[2], lineNumber), locals, lineNumber));
					}
				}
			} else {
				if (args.length > 0 && isFlowScriptObjectLiteral(args[args.length - 1])) {
					node = normalizeNaturalFlowScriptProps(blocks, block, parseFlowScriptObjectLiteral(args[args.length - 1], lineNumber), locals, lineNumber);
					if (args.length > 1) {
						var optionInputProp = primaryFlowScriptInputProp(blocks, block);
						if (optionInputProp && node[optionInputProp] === undefined) {
							node[optionInputProp] = flowScriptPropertyValueFromToken(blocks, block, optionInputProp, args[0], locals, lineNumber);
						}
					}
				} else if (args.length > 0) {
					var inputProp = primaryFlowScriptInputProp(blocks, block);
					if (inputProp) {
						node[inputProp] = flowScriptPropertyValueFromToken(blocks, block, inputProp, args[0], locals, lineNumber);
					}
				}
			}
			node.block = block;
			if (!node.id) {
				node.id = env.safeIdentifier(varName);
			}
			if (block === "set") {
				if (!node.path) {
					node.path = "local." + env.safeIdentifier(varName);
				}
				delete node.out;
			} else if (!node.out) {
				node.out = "local." + env.safeIdentifier(varName);
			}
			node.__flowScriptLine = lineNumber;
			return [node];
		}
	
		function buildNaturalFlowScriptAssignment(blocks, imports, locals, varName, rhs, lineNumber) {
			rhs = stripFlowScriptSemicolon(rhs);
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
			if (sliceMethod) {
				var offsetToken = sliceMethod.args[0] || "0";
				var countToken = sliceMethod.args.length > 1 ? flowScriptSliceCount(offsetToken, sliceMethod.args[1], locals) : "";
				return [naturalFlowScriptListTakeNode(varName, sliceMethod.items, countToken, offsetToken, locals, lineNumber)];
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
				if (!isFlowScriptExpressionCallName(resolveFlowScriptName(varCall.name, imports))) {
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
			var call = parseNaturalFlowScriptCall(rhs);
			if (call) {
				var block = resolveFlowScriptName(call.name, imports);
				if (isFlowScriptExpressionCallName(block)) {
					return [{
						id: env.safeIdentifier(scopePath.replace(/^(local|result)\./, "")),
						block: "set",
						path: scopePath,
						value: flowScriptValueFromToken(rhs, locals, lineNumber),
						__flowScriptLine: lineNumber
					}];
				}
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
						node.id = env.safeIdentifier(scopePath.replace(/^(local|result)\./, ""));
					}
				} else {
					node.out = scopePath;
					if (node.id === undefined || node.id === null || String(node.id).trim() === "") {
						node.id = env.safeIdentifier(scopePath.replace(/^(local|result)\./, ""));
					}
				}
				return [node];
			}
			return [{
				id: env.safeIdentifier(scopePath.replace(/^(local|result)\./, "")),
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
	
		function parseFlowScriptBodyNodes(blocks, imports, locals, body) {
			var root = { version: 1, nodes: [] };
			parseFlowScriptStatementsInto(blocks, imports || {}, Object.assign({}, locals || {}), root, flowScriptStatements(body));
			return root.nodes;
		}

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
					env.raise("FLOWSCRIPT_UNSUPPORTED_NESTED_FUNCTION", "Nested FlowScript functions are not supported at line " + lineNumber + ".",
						null, "Declare helper functions at top level, before or after the main Flow function.");
				}
				var declaration = line.match(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([\s\S]+)$/);
				if (declaration) {
					var varName = env.safeIdentifier(declaration[1]);
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
						env.raise("FLOWSCRIPT_INVALID_ELSE", "Unexpected else at line " + lineNumber);
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
					env.raise("FLOWSCRIPT_UNSUPPORTED_SYNTAX", "Unsupported FlowScript syntax at line " + lineNumber + ": " + line,
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
			code = env.normalizeFlowScriptFunctionSyntax(code);
			var split = splitFlowScriptFunctions(code);
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
						__flowScriptBody: fn.body
					};
				});
				var imports = {};
				parseFlowScriptImports(split.prelude, imports);
				var helperBlocks = Object.assign({}, blocks || {}, helperBlockDefinitions(helpers));
				helpers.forEach(function (helper) {
					helper.nodes = parseFlowScriptBodyNodes(helperBlocks, Object.assign({}, imports),
						helperParamLocals(helper.params), helper.__flowScriptBody);
				});
				var rootFromFunctions = { version: 1, helpers: helpers, nodes: [] };
				parseFlowScriptStatementsInto(helperBlocks, Object.assign({}, imports), {}, rootFromFunctions, flowScriptStatements(main.body));
				return env.canonicalFlowDefinition(rootFromFunctions);
			}
			var root = { version: 1, nodes: [] };
			parseFlowScriptStatementsInto(blocks, {}, {}, root, flowScriptStatements(code));
			return env.canonicalFlowDefinition(root);
		}
	
		return {
			parseFlowScriptArgs: parseFlowScriptArgs,
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
			flowScriptRewriteTemplateText: flowScriptRewriteTemplateText,
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
			trackFlowScriptLocalWrite: trackFlowScriptLocalWrite,
			trackFlowScriptNodeWrites: trackFlowScriptNodeWrites,
			parseFlowScriptStatementsInto: parseFlowScriptStatementsInto,
			parseFlowScript: parseFlowScript
		};
	}

	return {
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
		flowScriptPropKind: function (blocks, block, key, env) {
			return create(env).flowScriptPropKind(blocks, block, key);
		},
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
		flowScriptRewriteTemplateText: function (text, locals, env) {
			return create(env).flowScriptRewriteTemplateText(text, locals);
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
		trackFlowScriptLocalWrite: function (locals, path, env) {
			return create(env).trackFlowScriptLocalWrite(locals, path);
		},
		trackFlowScriptNodeWrites: function (locals, node, env) {
			return create(env).trackFlowScriptNodeWrites(locals, node);
		},
		parseFlowScriptStatementsInto: function (blocks, imports, locals, root, statements, env) {
			return create(env).parseFlowScriptStatementsInto(blocks, imports, locals, root, statements);
		},
		parseFlowScript: function (blocks, code, env) {
			return create(env).parseFlowScript(blocks, code);
		}
	};
}())
