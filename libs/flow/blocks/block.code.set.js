(function () {
	function prop(props, key) {
		return props && props[key] !== undefined ? props[key] : undefined;
	}

	function bool(value) {
		return value === true || String(value) === "true";
	}

	function nonEmpty(value) {
		return value !== undefined && value !== null && String(value).trim() !== "";
	}

	function localName(name) {
		var parts = String(name || "").split(".");
		return parts[parts.length - 1] || "block";
	}

	function blockEnvelopeName(code) {
		var match = String(code || "").trim().match(/^block\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(/);
		return match ? match[1] : "";
	}

	function unwrapBlockEnvelope(code) {
		var text = String(code || "").trim();
		var header = text.match(/^block\s+[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*\([^)]*\)\s*\{/);
		if (!header) {
			return text;
		}
		var open = header[0].length - 1;
		var close = text.lastIndexOf("}");
		if (open < 0 || close <= open) {
			return text;
		}
		return text.substring(open + 1, close).trim();
	}

	function descriptorFrom(name, props) {
		if (props.descriptorSource !== undefined && props.descriptorSource !== null) {
			return {
				descriptorSource: String(props.descriptorSource)
			};
		}
		if (props.descriptor !== undefined && props.descriptor !== null) {
			return {
				descriptor: props.descriptor
			};
		}
		var descriptor = {
			version: 1,
			name: String(name),
			icon: nonEmpty(props.icon) ? String(props.icon) : "mdi:puzzle-outline",
			description: nonEmpty(props.description) ? String(props.description) : "Project FlowScript block.",
			props: props.properties || props.props || {},
			implementation: {
				runtime: "flow",
				file: localName(name) + ".flow.yaml"
			}
		};
		if (props.outputs !== undefined && props.outputs !== null) {
			descriptor.outputs = props.outputs;
		}
		if (props.tags !== undefined && props.tags !== null) {
			descriptor.tags = props.tags;
		}
		if (props["private"] !== undefined && props["private"] !== null && props["private"] !== "") {
			descriptor["private"] = bool(props["private"]);
		}
		if (props.hooksSource !== undefined && props.hooksSource !== null) {
			descriptor.hooks = {
				file: localName(name) + ".hooks.js"
			};
		}
		return {
			descriptor: descriptor
		};
	}

	function error(code, message, hint, details) {
		var out = {
			code: String(code || "BLOCK_CODE_ERROR"),
			message: String(message || "")
		};
		if (hint) {
			out.hint = String(hint);
		}
		if (details !== undefined && details !== null) {
			out.details = details;
		}
		return out;
	}

	function diagnostics(validation, severity) {
		return (validation && validation.diagnostics || []).filter(function (diagnostic) {
			return !severity || diagnostic.severity === severity;
		});
	}

	function projectEditableBlock(ctx, name, props) {
		try {
			var current = ctx.blockGet(name, {
				projectDir: props.projectDir,
				detail: "compact",
				includeMeta: true
			});
			return current && current.origin === "project";
		} catch (e) {
			if (String(e.code || "") === "UNKNOWN_BLOCK") {
				return false;
			}
			throw e;
		}
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var code = prop(props, "code");
			var name = String(prop(props, "name") || blockEnvelopeName(code) || "");
			if (!name) {
				return { ok: false, error: error("MISSING_BLOCK_NAME", "block.code.set requires name.") };
			}
			if (!nonEmpty(code)) {
				return { ok: false, name: name, error: error("MISSING_BLOCK_CODE", "block.code.set requires FlowScript code.") };
			}
			code = unwrapBlockEnvelope(code);
			var validation = ctx.flowSourceValidate({
				projectDir: props.projectDir,
				name: name,
				code: String(code),
				includeHeader: false
			});
			var warnings = diagnostics(validation, "warning");
			if (!validation.ok) {
				return {
					ok: false,
					name: name,
					error: error("FLOWSCRIPT_VALIDATION_FAILED", "Block FlowScript validation failed.",
						"Fix diagnostics and retry block.code.set.", diagnostics(validation)),
					warnings: warnings
				};
			}
			var request = descriptorFrom(name, props);
			request.implementationSource = validation.source;
			if (props.hooksSource !== undefined && props.hooksSource !== null) {
				request.hooksSource = String(props.hooksSource);
			}
			request.overwrite = bool(props.overwrite);
			if (bool(props.dry) || bool(props.dryRun)) {
				return {
					ok: true,
					name: name,
					dry: true,
					revision: validation.revision,
					warnings: warnings,
					descriptor: request.descriptor || null,
					implementationSource: validation.source
				};
			}
			var result = projectEditableBlock(ctx, name, props)
				? ctx.blockEdit(name, request, props)
				: ctx.blockCreate(name, request, bool(props.overwrite), props);
			return {
				ok: true,
				name: name,
				dry: false,
				revision: validation.revision,
				warnings: warnings,
				block: result
			};
		}
	};
}())
