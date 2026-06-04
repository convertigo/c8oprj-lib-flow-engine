(function () {
	function bool(value) {
		return value === true || String(value) === "true";
	}

	function error(code, message, hint) {
		var out = {
			code: String(code || "BLOCK_CODE_ERROR"),
			message: String(message || "")
		};
		if (hint) {
			out.hint = String(hint);
		}
		return out;
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var name = String(props.name || "");
			if (!name) {
				return { ok: false, error: error("MISSING_BLOCK_NAME", "block.code.get requires name.") };
			}
			var block = ctx.blockGet(name, {
				projectDir: props.projectDir,
				detail: "full",
				includeMeta: true
			});
			if (block.implementationRuntime !== "flow") {
				return {
					ok: false,
					name: name,
					error: error("BLOCK_NOT_FLOWSCRIPT", "Block " + name + " is implemented with " + block.implementationRuntime + ".",
						"Use block.get for Rhino source blocks.")
				};
			}
			var validation = ctx.flowSourceValidate({
				projectDir: props.projectDir,
				name: name,
				flowSource: block.implementationSource,
				includeHeader: false
			});
			var out = {
				ok: true,
				name: name,
				origin: block.origin,
				revision: validation.revision,
				code: validation.code,
				descriptor: block.descriptor
			};
			if (bool(props.includeSources)) {
				out.descriptorSource = block.descriptorSource;
				out.implementationSource = block.implementationSource;
			}
			return out;
		}
	};
}())
