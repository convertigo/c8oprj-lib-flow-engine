(function () {
	function publicDescriptor(descriptor, env) {
		var out = env.normalizeTree(descriptor || {});
		if (out.props) {
			out.properties = out.props;
			delete out.props;
		}
		delete out.__flowBlockId;
		delete out.__graphDefinition;
		delete out.__flowCode;
		delete out.__rhinoCode;
		return out;
	}

	function sourceLength(path, env) {
		if (!path) {
			return 0;
		}
		try {
			return Number(new env.File(String(path)).length());
		} catch (e) {
			return 0;
		}
	}

	function getSource(blocks, name, args, env) {
		args = args || {};
		var block = blocks[String(name || "")];
		if (!block) {
			env.raise("UNKNOWN_BLOCK", "Unknown Flow block: " + name);
		}
		var file = new env.File(String(block.__flowFile || ""));
		var flowScriptBlock = String(block.__flowFormat || "") === "flowscript-block";
		if (!flowScriptBlock) {
			env.raise("INVALID_BLOCK_STORAGE", "Flow block is not backed by canonical .block.js source: " + name);
		}
		var descriptorSource = "";
		var descriptor = env.normalizeTree(block.__blockDefinition || {});
		var catalog = env.blockDescriptor(block);
		var implementation = env.blockImplementation(descriptor);
		var detail = String(args.detail || args.mode || "compact").toLowerCase();
		if (detail !== "full") {
			var compact = {
				ok: true,
				detail: detail === "summary" ? "summary" : "compact",
				name: block.name
			};
			if (args.includeMeta === true || String(args.includeMeta || "") === "true") {
				compact.origin = block.__flowOrigin || "unknown";
				compact.provider = block.__flowProvider || block.__flowOrigin || "unknown";
				compact.format = flowScriptBlock ? (implementation.runtime === "rhino" ? "blockjs" : "flowscript") : "canonical";
				compact.implementationRuntime = implementation.runtime;
				compact.descriptorChars = descriptorSource.length;
				compact.codeChars = flowScriptBlock ? String(block.__flowCode || "").length : 0;
				compact.implementationChars = flowScriptBlock
					? String(block.__rhinoCode || "").length
					: sourceLength(block.__flowImplementationFile, env);
				compact.hooksChars = sourceLength(block.__flowHooksFile, env);
			}
			if (detail === "summary") {
				compact.block = env.summaryBlockDescriptor(catalog);
				compact.next = "Use detail='compact' for typed properties or detail='full' for descriptor/implementation sources.";
			} else {
				compact.block = env.compactBlockDescriptor(catalog);
				compact.next = "Sources omitted. Use detail='full' only when editing descriptorSource, implementationSource or hooksSource.";
			}
			return compact;
		}
		var out = {
			ok: true,
			detail: "full",
			name: block.name,
			origin: block.__flowOrigin || "unknown",
			format: flowScriptBlock ? (implementation.runtime === "rhino" ? "blockjs" : "flowscript") : "canonical",
			file: String(block.__flowFile || ""),
			codeFile: flowScriptBlock ? String(block.__flowFile || "") : "",
			codeRevision: flowScriptBlock ? env.sha256Hex(String(block.__flowCode || "")) : "",
			descriptorFile: flowScriptBlock ? "" : String(block.__flowFile || ""),
			code: flowScriptBlock ? String(block.__flowCode || "") : "",
			descriptorSource: descriptorSource,
			descriptor: publicDescriptor(descriptor, env),
			implementationRuntime: implementation.runtime
		};
		if (flowScriptBlock) {
			out.implementationSource = implementation.runtime === "rhino"
				? String(block.__rhinoCode || "")
				: env.sourceFromDefinition(block.__graphDefinition || { version: 1, nodes: [] });
		} else if (block.__flowImplementationFile) {
			out.implementationFile = String(block.__flowImplementationFile);
			out.implementationSource = String(env.FileUtils.readFileToString(new env.File(String(block.__flowImplementationFile)), "UTF-8"));
		}
		if (block.__flowHooksFile) {
			out.hooksFile = String(block.__flowHooksFile);
			out.hooksSource = String(env.FileUtils.readFileToString(new env.File(String(block.__flowHooksFile)), "UTF-8"));
		}
		return out;
	}

	return {
		publicDescriptor: publicDescriptor,
		sourceLength: sourceLength,
		getSource: getSource
	};
}())
