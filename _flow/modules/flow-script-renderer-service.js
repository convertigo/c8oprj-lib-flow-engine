(function () {
	function flowScriptString(value, env) {
		if (value === undefined) {
			return "null";
		}
		return JSON.stringify(env.normalizeTree(value));
	}

	// Canonical source layout only. Leaf rendering stays with the value-intent
	// writer: indentation must never be inserted into a multiline template value.
	function flowScriptCompound(value, indent, leaf, quotedKeys) {
		var array = Object.prototype.toString.call(value) === "[object Array]";
		if (!value || typeof value !== "object") return leaf(value);
		var keys = Object.keys(value);
		var open = array ? "[" : "{", close = array ? "]" : "}";
		if (!keys.length) return open + close;
		return open + "\n" + keys.map(function (key) {
			var prefix = array ? "" : (quotedKeys ? JSON.stringify(key) : flowScriptObjectKey(key)) + ": ";
			return indent + "  " + prefix + flowScriptCompound(value[key], indent + "  ", leaf, quotedKeys) + ",";
		}).join("\n") + "\n" + indent + close;
	}

	function flowScriptInlineValue(value, env, indent) {
		value = env.normalizeTree(value);
		if (value && typeof value === "object") {
			return flowScriptCompound(value, indent || "", JSON.stringify, true);
		}
		return flowScriptString(value, env);
	}

	function flowScriptObjectKey(key) {
		key = String(key || "");
		return key.match(/^[A-Za-z_$][\w$]*$/) ? key : JSON.stringify(key);
	}

	function renderFlowScriptTemplateValue(value, locals, env, indent) {
		value = env.normalizeTree(value);
		if (value && typeof value === "object") {
			return flowScriptCompound(value, indent || "", function (item) {
				return renderFlowScriptTemplateValue(item, locals, env);
			}, false);
		}
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
		return flowScriptInlineValue(value, env);
	}

	function flowScriptTopLevelMeta(name, value, lines, env) {
		value = env.normalizeTree(value || {});
		if (!value || typeof value !== "object" || Object.keys(value).length === 0) {
			return;
		}
		lines.push("const _" + name + " = " + flowScriptCompound(value, "", JSON.stringify, true));
		lines.push("");
	}

	function renderFlowScriptExpression(expr, locals, env, indent) {
		if (expr !== undefined && expr !== null && typeof expr !== "string") {
			return flowScriptInlineValue(expr, env, indent);
		}
		expr = String(expr || "").trim();
		var exact = expr.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
		if (exact) {
			expr = exact[1].trim();
		}
		var replacements = Object.create(null);
		Object.keys(locals || {}).forEach(function (name) {
			var target = locals[name] === true ? "local." + name : String(locals[name] || ("local." + name));
			replacements[target] = name;
		});
		return Object.keys(replacements).length ? env.rewriteExpressionReferences(expr, replacements) : expr;
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
		// The statement parser trims physical lines. Keep embedded line endings
		// escaped in a quoted template value so a format/reparse cannot trim data.
		if (/[\r\n]/.test(String(text || ""))) {
			return JSON.stringify(renderFlowScriptTemplate(text, locals, env));
		}
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

	function renderFlowScriptValue(blocks, node, key, value, locals, env, indent) {
		var kind = env.flowScriptPropKind(blocks, env.blockName(node), key);
		if (kind === "expression") {
			return renderFlowScriptExpression(value, locals, env, indent);
		}
		if (kind === "template" || kind === "value" || kind === "configOverrides") {
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
			if (value && typeof value === "object") {
				return renderFlowScriptTemplateValue(value, locals, env, indent);
			}
		}
		return flowScriptInlineValue(value, env, indent);
	}

	function flowScriptArgKeys(node, slotNames) {
		var skip = {
			block: true, props: true, nodes: true, then: true, "else": true, fields: true,
			disabled: true, __fragment: true, __graphBlock: true, __flowScriptLine: true
		};
		(slotNames || []).forEach(function (slot) {
			skip[slot] = true;
		});
		return Object.keys(node || {}).filter(function (key) {
			return !skip[key] && node[key] !== undefined && typeof node[key] !== "function";
		});
	}

	function renderFlowScriptArguments(blocks, node, args, locals, env, indent, assignedOutput) {
		var codec = env.sourceAttributeNameCodec();
		var result = [];
		["id", "comment", "disabled", "out"].forEach(function (name) {
			if (name === "out" && assignedOutput) return;
			if (node[name] !== undefined) result.push(codec.encode("engine", name) + ": " + flowScriptInlineValue(node[name], env));
		});
		var values = Object.create(null);
		Object.keys(args).forEach(function (key) {
			if (["id", "comment", "disabled", "out"].indexOf(key) === -1) values[key] = args[key];
		});
		Object.keys(node.props || {}).forEach(function (key) { values[key] = node.props[key]; });
		Object.keys(values).forEach(function (key) {
			result.push(flowScriptObjectKey(codec.encode("property", key)) + ": " + renderFlowScriptValue(blocks, node, key, values[key], locals, env, indent));
		});
		return result;
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

	function flowScriptHasTopLevelReturn(nodes, env) {
		return (nodes || []).some(function (node) {
			return env.blockName(node) === "return";
		});
	}

	function renderFlowScriptNodes(blocks, nodes, depth, lines, locals, env) {
		locals = locals || {};
		var indent = new Array(depth + 1).join("  ");
		(nodes || []).forEach(function (node) {
			// A capture belongs on the left of the call, not in its business
			// arguments. Keep explicit metadata for non-assignable values so
			// rendering never drops data from an invalid/unfinished AST.
			var assignedOutput = typeof node.out === "string" && /^(local|result)(\.[A-Za-z_$][\w$]*)+$/.test(node.out) ? node.out : "";
			var callPrefix = assignedOutput ? assignedOutput + " = " : "";
			var slotNames = flowScriptSlotNames(blocks, node, env);
			var slots = slotNames.filter(function (slot) {
				return Object.prototype.toString.call(node[slot]) === "[object Array]";
			});
			var args = Object.create(null);
			flowScriptArgKeys(node, slotNames).forEach(function (key) { args[key] = node[key]; });
			var parts = renderFlowScriptArguments(blocks, node, args, locals, env, indent + "  ", assignedOutput);
			if (!parts.length && !slots.length) {
				lines.push(indent + callPrefix + env.blockName(node) + "({})");
				return;
			}
			lines.push(indent + callPrefix + env.blockName(node) + "({");
			parts.forEach(function (part) { lines.push(indent + "  " + part + ","); });
			slots.forEach(function (slot) {
				lines.push(indent + "  " + flowScriptObjectKey(env.sourceAttributeNameCodec().encode("engine", slot)) + ": function () {");
				renderFlowScriptNodes(blocks, node[slot], depth + 2, lines, Object.assign({}, locals), env);
				lines.push(indent + "  },");
			});
			lines.push(indent + "})");
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
		flowScriptTopLevelMeta("flow", definition.flow, lines, env);
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
		renderFlowScriptExpression: renderFlowScriptExpression,
		renderFlowScriptTemplate: renderFlowScriptTemplate,
		flowScriptTemplateLiteralPart: flowScriptTemplateLiteralPart,
		renderFlowScriptTemplateLiteral: renderFlowScriptTemplateLiteral,
		renderFlowScriptValue: renderFlowScriptValue,
		flowScriptArgKeys: flowScriptArgKeys,
		flowScriptSlotNames: flowScriptSlotNames,
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
