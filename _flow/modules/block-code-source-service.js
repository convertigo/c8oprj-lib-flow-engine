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
		// Headers are declarations in the prelude, not text found inside a
		// comment, string or implementation. The body remains opaque here.
		var start = skipTrivia(text, 0, env);
		var declarationEndOffset = metaDeclarationEnd(text, start, env);
		if (declarationEndOffset < 0) {
			return { meta: {}, code: text };
		}
		var valueStart = skipTrivia(text, declarationEndOffset, env);
		if (text.charAt(valueStart) !== "=") headerError(text, valueStart, env);
		valueStart = skipTrivia(text, valueStart + 1, env);
		if (text.charAt(valueStart) !== "{") headerError(text, valueStart, env);
		var end = metadataObjectEnd(text, valueStart, env);
		if (end < 0) headerError(text, valueStart, env);
		var next = skipTrivia(text, end + 1, env);
		var hasSemicolon = text.charAt(next) === ";";
		var declarationEnd = hasSemicolon ? next + 1 : end + 1;
		if (hasSemicolon) next = skipTrivia(text, next + 1, env);
		// Do not accept an object prefix of a dynamic initializer. A newline
		// also separates the Flow DSL header from its function/Rhino IIFE.
		if (!hasSemicolon && next < text.length &&
			(!/[\r\n]/.test(text.substring(end + 1, next)) ||
			 !/^(?:function\b|flow\b|block\b|(?:const|let|var)\b|\(|[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*\()/.test(text.substring(next)))) {
			headerError(text, next, env);
		}
		if (metaDeclarationEnd(text, next, env) >= 0) {
			env.raise("FLOWSCRIPT_DUPLICATE_METADATA", "Duplicate _meta header at line " + lineAt(text, next) + ".");
		}
		// Blank the declaration rather than shifting body line numbers.
		var rest = text.substring(0, start) + text.substring(start, declarationEnd).replace(/[^\r\n]/g, " ") + text.substring(declarationEnd);
		return {
			meta: env.parseFlowScriptMetadataValue(stripMetadataComments(text.substring(valueStart, end + 1), env), lineAt(text, valueStart)),
			code: rest
		};
	}

	function lineAt(text, index) { return text.substring(0, index).split("\n").length; }

	function metaDeclarationEnd(text, start, env) {
		var declaration = text.substring(start).match(/^(?:const|let|var)\b/);
		if (!declaration) return -1;
		var name = skipTrivia(text, start + declaration[0].length, env);
		return /^_meta(?![\w$])/.test(text.substring(name)) ? name + 5 : -1;
	}

	function headerError(text, index, env) {
		env.raise("FLOWSCRIPT_METADATA_LITERAL_REQUIRED", "Block _meta requires a standalone object literal at line " + lineAt(text, index) + ".");
	}

	function skipTrivia(text, start, env) {
		var i = start;
		while (i < text.length) {
			if (/\s/.test(text.charAt(i))) { i++; continue; }
			if (text.substr(i, 2) === "//") {
				while (i < text.length && text.charAt(i) !== "\n" && text.charAt(i) !== "\r") i++;
			} else if (text.substr(i, 2) === "/*") {
				var end = text.indexOf("*/", i + 2);
				if (end < 0) headerError(text, i, env);
				i = end + 2;
			} else break;
		}
		return i;
	}

	function metadataObjectEnd(text, start, env) {
		var depth = 0, quote = "";
		for (var i = start; i < text.length; i++) {
			var ch = text.charAt(i);
			if (quote) {
				if (ch === "\\") i++;
				else if (ch === quote) quote = "";
			} else if (ch === "\"" || ch === "'" || ch === "`") quote = ch;
			else if (text.substr(i, 2) === "//" || text.substr(i, 2) === "/*") i = skipTrivia(text, i, env) - 1;
			else if (ch === "{") depth++;
			else if (ch === "}" && --depth === 0) return i;
		}
		return -1;
	}

	function stripMetadataComments(text, env) {
		var out = "", quote = "";
		for (var i = 0; i < text.length; i++) {
			var ch = text.charAt(i);
			if (quote) {
				out += ch;
				if (ch === "\\") out += text.charAt(++i);
				else if (ch === quote) quote = "";
			} else if (ch === "\"" || ch === "'" || ch === "`") { quote = ch; out += ch; }
			else if (text.substr(i, 2) === "//" || text.substr(i, 2) === "/*") {
				var end = skipTrivia(text, i, env);
				out += text.substring(i, end).replace(/[^\r\n]/g, " "); i = end - 1;
			} else out += ch;
		}
		return out;
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
		if (body.substring(skipTrivia(body, 0, env)).match(/^(?:(?:flow|function)\s+|(?:const|let|var)\s+_flow\s*=)/)) {
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
