(function () {
	function balancedObjectEnd(text, open) {
		var quote = "";
		var brace = 0;
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
			if (ch === "{") {
				brace++;
			} else if (ch === "}") {
				brace--;
				if (brace === 0) {
					return i;
				}
			}
		}
		return -1;
	}

	function extractMeta(code, env) {
		var text = String(code || "");
		var match = text.match(/\b(?:const|let|var)\s+_meta\s*=/);
		if (!match) {
			return { meta: {}, code: text };
		}
		var start = text.indexOf("{", match.index);
		if (start < 0) {
			env.raise("INVALID_BLOCK_CODE", "FlowScript block _meta must be an object literal.");
		}
		var end = balancedObjectEnd(text, start);
		if (end < 0) {
			env.raise("INVALID_BLOCK_CODE", "Unclosed FlowScript block _meta object literal.");
		}
		var metaText = text.substring(start, end + 1);
		var rest = text.substring(0, match.index) + text.substring(end + 1).replace(/^\s*;\s*/, "");
		return {
			meta: env.parseFlowScriptObjectLiteral(metaText, 1).value,
			code: rest
		};
	}

	function unwrapFlowScriptBlockEnvelope(code) {
		var text = String(code || "").trim();
		var header = text.match(/^block\s+[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*\([^)]*\)\s*\{/);
		if (!header) {
			return text;
		}
		var open = header[0].length - 1;
		var close = text.lastIndexOf("}");
		if (close <= open) {
			return text;
		}
		return text.substring(open + 1, close).trim();
	}

	function flowScriptBlockFunctionName(name, env) {
		return env.safeIdentifier(env.blockLocalName(name) || name || "block");
	}

	function normalizeFlowScriptFunctionSyntax(code) {
		return String(code || "").replace(/(^|\n)(\s*)(?:export\s+(?:default\s+)?)?(?:(?:public|private)\s+)?(?:async\s+)?(flow|function)\s+/g, "$1$2$3 ");
	}

	function blockCodeRuntimeFromMeta(meta, env) {
		meta = env.normalizeTree(meta || {});
		var implementation = env.normalizeTree(meta.implementation || {});
		return String(meta.runtime || meta.implementationRuntime || implementation.runtime || implementation.kind || "flow").trim() || "flow";
	}

	function ensureFlowScriptBlockFunction(name, code, env) {
		var body = normalizeFlowScriptFunctionSyntax(unwrapFlowScriptBlockEnvelope(code));
		if (String(body).trim().match(/^(?:flow|function)\s+/)) {
			return env.normalizeFlowScriptCode(body);
		}
		var indent = String(body || "").replace(/\s+$/g, "").split(/\r?\n/).map(function (line) {
			return line ? "  " + line : "";
		}).join("\n");
		return env.normalizeFlowScriptCode("function " + flowScriptBlockFunctionName(name, env) + "({ input, config, result }) {\n" +
			indent + "\n}\n");
	}

	function flowScriptBlockCodeSource(name, functionCode, meta, env) {
		meta = env.normalizeTree(meta || {});
		if (!meta.description) {
			meta.description = "Project FlowScript block.";
		}
		if (!meta.icon) {
			meta.icon = "mdi:puzzle-outline";
		}
		if (!meta.properties && !meta.props) {
			meta.properties = {};
		}
		if (!meta.outputs && !meta.output) {
			meta.outputs = { out: { type: "unknown" } };
		}
		delete meta.name;
		return "const _meta = " + JSON.stringify(meta, null, 2) + "\n\n" + env.normalizeFlowScriptCode(functionCode);
	}

	function rhinoBlockCodeSource(name, source, meta, env) {
		meta = env.normalizeTree(meta || {});
		meta.runtime = "rhino";
		if (!meta.description) {
			meta.description = "Project Rhino block.";
		}
		if (!meta.icon) {
			meta.icon = "mdi:language-javascript";
		}
		if (!meta.properties && !meta.props) {
			meta.properties = {};
		}
		if (!meta.outputs && !meta.output) {
			meta.outputs = { out: { type: "unknown" } };
		}
		delete meta.name;
		return "const _meta = " + JSON.stringify(meta, null, 2) + "\n\n" + String(source || "").trim() + "\n";
	}

	function escapeRegExp(text) {
		return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}

	function renameBlockImplementationSource(source, fromName, toName) {
		source = String(source || "");
		var pattern = new RegExp("(\\bname\\s*:\\s*)([\"'])" + escapeRegExp(fromName) + "\\2", "g");
		return source.replace(pattern, "$1$2" + String(toName) + "$2");
	}

	function renameFlowScriptFunctionSource(source, fromName, toName, env) {
		var fromFunction = flowScriptBlockFunctionName(fromName, env);
		var toFunction = flowScriptBlockFunctionName(toName, env);
		var pattern = new RegExp("(^\\s*(?:flow|function)\\s+)" + escapeRegExp(fromFunction) + "\\b", "m");
		return String(source || "").replace(pattern, "$1" + toFunction);
	}

	function duplicateBlockCodeSource(source, fromName, toName, hasHooks, env) {
		var extracted = extractMeta(source, env);
		var meta = env.normalizeTree(extracted.meta || {});
		if (meta.name !== undefined) {
			delete meta.name;
		}
		if (hasHooks) {
			var hooks = meta.hooks;
			if (typeof hooks === "string") {
				hooks = { file: hooks };
			}
			hooks = env.normalizeTree(hooks || {});
			hooks.file = env.blockHooksFileName(toName);
			meta.hooks = hooks;
		} else {
			delete meta.hooks;
		}
		if (blockCodeRuntimeFromMeta(meta, env) === "rhino") {
			return rhinoBlockCodeSource(toName, renameBlockImplementationSource(extracted.code, fromName, toName), meta, env);
		}
		return flowScriptBlockCodeSource(toName, renameFlowScriptFunctionSource(extracted.code, fromName, toName, env), meta, env);
	}

	return {
		balancedObjectEnd: balancedObjectEnd,
		extractMeta: extractMeta,
		unwrapFlowScriptBlockEnvelope: unwrapFlowScriptBlockEnvelope,
		flowScriptBlockFunctionName: flowScriptBlockFunctionName,
		normalizeFlowScriptFunctionSyntax: normalizeFlowScriptFunctionSyntax,
		blockCodeRuntimeFromMeta: blockCodeRuntimeFromMeta,
		ensureFlowScriptBlockFunction: ensureFlowScriptBlockFunction,
		flowScriptBlockCodeSource: flowScriptBlockCodeSource,
		rhinoBlockCodeSource: rhinoBlockCodeSource,
		escapeRegExp: escapeRegExp,
		renameBlockImplementationSource: renameBlockImplementationSource,
		renameFlowScriptFunctionSource: renameFlowScriptFunctionSource,
		duplicateBlockCodeSource: duplicateBlockCodeSource
	};
}())
