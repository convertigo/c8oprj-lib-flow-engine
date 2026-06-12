(function () {
	function flowScriptString(value, env) {
		if (value === undefined) {
			return "null";
		}
		return JSON.stringify(env.normalizeTree(value));
	}

	function flowScriptInlineValue(value, env) {
		value = env.normalizeTree(value);
		if (value && typeof value === "object") {
			return JSON.stringify(value);
		}
		return flowScriptString(value, env);
	}

	function flowScriptTopLevelMeta(name, value, lines, env) {
		value = env.normalizeTree(value || {});
		if (!value || typeof value !== "object" || Object.keys(value).length === 0) {
			return;
		}
		lines.push("const _" + name + " = " + JSON.stringify(value, null, 2));
		lines.push("");
	}

	function flowScriptLocalName(path) {
		var match = String(path || "").match(/^local\.([A-Za-z_$][\w$]*)$/);
		return match ? match[1] : "";
	}

	function flowScriptScopeAssignmentPath(path) {
		var text = String(path || "");
		return text.match(/^(local|result)\.[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])*$/) ? text : "";
	}

	function renderFlowScriptExpression(expr, locals, env) {
		if (expr !== undefined && expr !== null && typeof expr !== "string") {
			return flowScriptInlineValue(expr, env);
		}
		expr = String(expr || "").trim();
		var exact = expr.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
		if (exact) {
			expr = exact[1].trim();
		}
		Object.keys(locals || {}).sort(function (a, b) {
			return b.length - a.length;
		}).forEach(function (name) {
			var target = locals[name] === true ? "local." + name : String(locals[name] || ("local." + name));
			var escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			expr = expr.replace(new RegExp("(^|[^A-Za-z0-9_$\\.])" + escaped + "(?=\\b|\\.)", "g"), "$1" + name);
		});
		return expr;
	}

	function renderFlowScriptTemplate(text, locals, env) {
		return String(text || "").replace(/\{\{\s*([^}]+?)\s*\}\}/g, function (_, expr) {
			return "{{ " + renderFlowScriptExpression(expr, locals, env) + " }}";
		});
	}

	function flowScriptTemplateLiteralPart(text) {
		return String(text || "")
			.replace(/\\/g, "\\\\")
			.replace(/`/g, "\\`")
			.replace(/\$\{/g, "\\${");
	}

	function renderFlowScriptTemplateLiteral(text, locals, env) {
		var out = "`";
		var index = 0;
		String(text || "").replace(/\{\{\s*([^}]+?)\s*\}\}/g, function (match, expr, offset) {
			out += flowScriptTemplateLiteralPart(String(text).substring(index, offset));
			out += "${" + renderFlowScriptExpression(expr, locals, env) + "}";
			index = offset + match.length;
			return match;
		});
		out += flowScriptTemplateLiteralPart(String(text || "").substring(index));
		return out + "`";
	}

	function renderFlowScriptValue(blocks, node, key, value, locals, env) {
		var kind = env.flowScriptPropKind(blocks, env.blockName(node), key);
		if (kind === "expression") {
			return renderFlowScriptExpression(value, locals, env);
		}
		if (kind === "template" || kind === "value") {
			if (typeof value === "string") {
				var exact = value.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
				if (exact) {
					return renderFlowScriptExpression(exact[1], locals, env);
				}
				if (value.indexOf("{{") !== -1) {
					return renderFlowScriptTemplateLiteral(value, locals, env);
				}
				return JSON.stringify(value);
			}
		}
		return flowScriptInlineValue(value, env);
	}

	function flowScriptArgKeys(node, slotNames) {
		var skip = {
			block: true, props: true, nodes: true, then: true, "else": true, fields: true,
			__fragment: true, __graphBlock: true, __flowScriptLine: true
		};
		(slotNames || []).forEach(function (slot) {
			skip[slot] = true;
		});
		return Object.keys(node || {}).filter(function (key) {
			return !skip[key] && node[key] !== undefined && typeof node[key] !== "function";
		});
	}

	function flowScriptSlotNames(blocks, node, env) {
		var names = env.childSlotNamesForMutation(blocks, node);
		["nodes", "then", "else", "fields"].forEach(function (name) {
			if (Object.prototype.toString.call(node && node[name]) === "[object Array]" && names.indexOf(name) === -1) {
				names.push(name);
			}
		});
		return names;
	}

	function defaultFlowScriptSlot(blocks, node, env) {
		var slots = flowScriptSlotNames(blocks, node, env);
		if (slots.indexOf("nodes") !== -1) {
			return "nodes";
		}
		if (slots.indexOf("then") !== -1) {
			return "then";
		}
		if (slots.indexOf("fields") !== -1) {
			return "fields";
		}
		return slots.length ? slots[0] : "";
	}

	function flowScriptCallLine(blocks, node, indent, locals, env) {
		locals = locals || {};
		var block = String(env.blockName(node) || node.block || "unknown.block");
		if (block === "if") {
			return indent + "if (" + renderFlowScriptExpression(node && node.condition || "true", locals, env) + ")";
		}
		if (block === "return") {
			return indent + "return " + renderFlowScriptValue(blocks, node, "value", node && node.value, locals, env);
		}
		var outLocal = flowScriptLocalName(node && node.out);
		if (block === "set" && flowScriptScopeAssignmentPath(node && node.path)) {
			var assignmentPath = String(node.path);
			if (assignmentPath.indexOf("local.") === 0) {
				var localName = flowScriptLocalName(assignmentPath);
				if (localName) {
					var rendered = renderFlowScriptValue(blocks, node, "value", node.value, locals, env);
					locals[localName] = true;
					return indent + "var " + localName + " = " + rendered;
				}
			}
			return indent + assignmentPath + " = " + renderFlowScriptValue(blocks, node, "value", node.value, locals, env);
		}
		var slotNames = flowScriptSlotNames(blocks, node, env);
		var args = {};
		flowScriptArgKeys(node, slotNames).forEach(function (key) {
			if (key === "out" && outLocal) {
				return;
			}
			args[key] = node[key];
		});
		var parts = Object.keys(args).map(function (key) {
			return key + ": " + renderFlowScriptValue(blocks, node, key, args[key], locals, env);
		});
		var call = block + "({ " + parts.join(", ") + " })";
		if (outLocal) {
			locals[outLocal] = true;
			return indent + "var " + outLocal + " = " + call;
		}
		return indent + call;
	}

	function flowScriptHasTopLevelReturn(nodes, env) {
		return (nodes || []).some(function (node) {
			return env.blockName(node) === "return";
		});
	}

	function renderFlowScriptNodes(blocks, nodes, depth, lines, locals, env) {
		locals = locals || {};
		var indent = new Array(depth + 1).join("  ");
		(nodes || []).forEach(function (node) {
			var defaultSlot = defaultFlowScriptSlot(blocks, node, env);
			var renderedChildren = defaultSlot && Object.prototype.toString.call(node[defaultSlot]) === "[object Array]" && node[defaultSlot].length > 0;
			var line = flowScriptCallLine(blocks, node, indent, locals, env);
			if (renderedChildren) {
				lines.push(line + " {");
				renderFlowScriptNodes(blocks, node[defaultSlot], depth + 1, lines, Object.assign({}, locals), env);
				lines.push(indent + "}");
			} else {
				lines.push(line);
			}
			if (env.blockName(node) === "if" && Object.prototype.toString.call(node["else"]) === "[object Array]" && node["else"].length > 0) {
				lines[lines.length - 1] = lines[lines.length - 1] + " else {";
				renderFlowScriptNodes(blocks, node["else"], depth + 1, lines, Object.assign({}, locals), env);
				lines.push(indent + "}");
			}
		});
	}

	function helperParamLocals(helper) {
		var locals = {};
		(helper.params || Object.keys(helper.props || {})).forEach(function (param) {
			locals[param] = "input." + param;
		});
		return locals;
	}

	function renderFlowScriptHelpers(blocks, helpers, lines, env) {
		(helpers || []).forEach(function (helper) {
			var params = helper.params || Object.keys(helper.props || {});
			lines.push("function " + env.safeIdentifier(helper.name || "helper") + "(" + params.join(", ") + ") {");
			renderFlowScriptNodes(blocks, helper.nodes || [], 1, lines, helperParamLocals(helper), env);
			lines.push("}");
			lines.push("");
		});
	}

	function renderFlowScript(blocks, name, flowSource, request, env) {
		request = request || {};
		var definition = env.parseSource(flowSource);
		var renderBlocks = env.blocksWithFlowHelpers ? env.blocksWithFlowHelpers(blocks, definition) : blocks;
		var lines = [];
		if (request.includeHeader !== false) {
			lines.push("// c8o: FlowScript spike. Function calls are Flow blocks; named arguments are block properties.");
			lines.push("// c8o: Patch with the returned revision. The engine validates and compiles this code back to Flow YAML.");
		}
		if (request.includeContext === true) {
			var analysis = env.analyzeFlowDefinition(blocks, definition, request);
			var paths = [];
			(analysis.paths || []).slice(0, 30).forEach(function (path) {
				paths.push(typeof path === "string" ? path : path.path);
			});
			if (paths.length) {
				lines.push("// c8o: Known paths: " + paths.join(", "));
			}
		}
		if (lines.length) {
			lines.push("");
		}
		if (request.includeMeta !== false && request.meta !== false) {
			flowScriptTopLevelMeta("flow", definition.flow, lines, env);
		}
		renderFlowScriptHelpers(renderBlocks, definition.helpers || [], lines, env);
		lines.push("function " + env.safeIdentifier(name || "Flow") + "({ input, config, result }) {");
		renderFlowScriptNodes(renderBlocks, definition.nodes || [], 1, lines, {}, env);
		if (request.includeImplicitReturn !== false && !flowScriptHasTopLevelReturn(definition.nodes || [], env)) {
			lines.push("  return result");
		}
		lines.push("}");
		lines.push("");
		return lines.join("\n");
	}

	function normalizeFlowScriptCode(code, env) {
		code = env.normalizeFlowScriptFunctionSyntax(code).replace(/\s+$/g, "");
		return code + "\n";
	}

	function stripFlowScriptMirrorHeader(code) {
		var lines = String(code || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
		if (!lines.length || lines[0].indexOf("// c8o-flow: generated FlowScript mirror") !== 0) {
			return String(code || "");
		}
		while (lines.length && String(lines[0]).indexOf("// c8o-flow:") === 0) {
			lines.shift();
		}
		if (lines.length && String(lines[0]).trim() === "") {
			lines.shift();
		}
		return lines.join("\n");
	}

	function flowScriptMirrorCode(blocks, name, source, args, env) {
		args = args || {};
		var code = args.code !== undefined && args.code !== null
			? String(args.code)
			: renderFlowScript(blocks, name, source, { includeHeader: false }, env);
		return normalizeFlowScriptCode(stripFlowScriptMirrorHeader(code), env);
	}

	function writeFlowCodeMirrorFile(blocks, name, source, file, args, env) {
		args = args || {};
		if (args.flowCodeMirror === false || args.mirrorCode === false || args.saveCode === false) {
			return null;
		}
		file.getParentFile().mkdirs();
		var code = flowScriptMirrorCode(blocks, name, source, args, env);
		env.FileUtils.writeStringToFile(file, code, "UTF-8");
		return {
			file: String(file.getAbsolutePath()),
			code: code,
			revision: env.sha256Hex(code)
		};
	}

	function writeProjectFlowCodeMirror(blocks, name, source, args, env) {
		args = args || {};
		if (args.flowCodeMirror === false || args.mirrorCode === false || args.saveCode === false) {
			return null;
		}
		return writeFlowCodeMirrorFile(blocks, name, source, env.projectFlowCodeFile(name), args, env);
	}

	function writeProjectFlowCodeCanonical(blocks, name, source, args, env) {
		args = args || {};
		var file = env.projectFlowCodeFile(name);
		file.getParentFile().mkdirs();
		var code = flowScriptMirrorCode(blocks, name, source, args, env);
		env.FileUtils.writeStringToFile(file, code, "UTF-8");
		return {
			file: String(file.getAbsolutePath()),
			code: code,
			revision: env.sha256Hex(code)
		};
	}

	function writeFlowCodeMirrorRequest(request, blocks, env) {
		request = request || {};
		var source = env.sourceForWriteRequest(request, request.source || request.flowSource);
		source = env.sourceFromDefinition(env.parseSource(source));
		var name = String(request.name || request.flowName || "Flow");
		var sourceFile = request.sourceFile ? new env.File(String(request.sourceFile)) : null;
		var codeFile = request.codeFile ? new env.File(String(request.codeFile))
			: (sourceFile ? env.flowCodeFileFromYamlFile(sourceFile, name) : env.projectFlowCodeFile(name));
		var mirror = writeFlowCodeMirrorFile(blocks, name, source, codeFile, request, env);
		return {
			ok: true,
			name: name,
			sourceFile: sourceFile ? String(sourceFile.getAbsolutePath()) : "",
			codeFile: mirror ? mirror.file : "",
			codeRevision: mirror ? mirror.revision : ""
		};
	}

	function flowScriptCodeFromMirror(blocks, name, source, request, env) {
		request = request || {};
		var file = env.projectFlowCodeFile(name);
		if (request.useMirror !== false && file.isFile()) {
			var code = String(env.FileUtils.readFileToString(file, "UTF-8"));
			try {
				var validation = env.flowScriptValidateRequest(blocks, Object.assign({}, request, {
					name: name,
					code: code
				}));
				if (validation.ok && env.sha256Hex(validation.source) === env.sha256Hex(env.sourceFromDefinition(env.parseSource(source)))) {
					return {
						code: code,
						file: String(file.getAbsolutePath()),
						fromMirror: true,
						stale: false
					};
				}
			} catch (e) {
				// A broken mirror must not hide the canonical Flow YAML.
			}
			return {
				code: renderFlowScript(blocks, name, source, request, env),
				file: String(file.getAbsolutePath()),
				fromMirror: false,
				stale: true
			};
		}
		return {
			code: renderFlowScript(blocks, name, source, request, env),
			file: file.isFile() ? String(file.getAbsolutePath()) : "",
			fromMirror: false,
			stale: false
		};
	}

	return {
		flowScriptString: flowScriptString,
		flowScriptInlineValue: flowScriptInlineValue,
		flowScriptLocalName: flowScriptLocalName,
		flowScriptScopeAssignmentPath: flowScriptScopeAssignmentPath,
		renderFlowScriptExpression: renderFlowScriptExpression,
		renderFlowScriptTemplate: renderFlowScriptTemplate,
		flowScriptTemplateLiteralPart: flowScriptTemplateLiteralPart,
		renderFlowScriptTemplateLiteral: renderFlowScriptTemplateLiteral,
		renderFlowScriptValue: renderFlowScriptValue,
		flowScriptArgKeys: flowScriptArgKeys,
		flowScriptSlotNames: flowScriptSlotNames,
		defaultFlowScriptSlot: defaultFlowScriptSlot,
		flowScriptCallLine: flowScriptCallLine,
		flowScriptHasTopLevelReturn: flowScriptHasTopLevelReturn,
		renderFlowScriptNodes: renderFlowScriptNodes,
		renderFlowScript: renderFlowScript,
		normalizeFlowScriptCode: normalizeFlowScriptCode,
		stripFlowScriptMirrorHeader: stripFlowScriptMirrorHeader,
		flowScriptMirrorCode: flowScriptMirrorCode,
		writeProjectFlowCodeMirror: writeProjectFlowCodeMirror,
		writeProjectFlowCodeCanonical: writeProjectFlowCodeCanonical,
		writeFlowCodeMirrorFile: writeFlowCodeMirrorFile,
		writeFlowCodeMirrorRequest: writeFlowCodeMirrorRequest,
		flowScriptCodeFromMirror: flowScriptCodeFromMirror
	};
}())
