(function () {
	function resourcePath(baseDir, path, env) {
		path = String(path || "").trim();
		if (path === "") {
			return "";
		}
		var file = new env.File(path);
		if (!file.isAbsolute()) {
			file = new env.File(baseDir, path);
		}
		return env.canonicalPath(file);
	}

	function safeFilePart(value) {
		return String(value || "").trim().replace(/[^A-Za-z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "");
	}

	function safeIdentifier(value) {
		var text = String(value || "Flow").replace(/[^A-Za-z0-9_$]/g, "_");
		if (!text.match(/^[A-Za-z_$]/)) {
			text = "_" + text;
		}
		return text || "Flow";
	}

	function blockIdParts(name) {
		var text = String(name || "").trim();
		if (!text.match(/^[A-Za-z0-9_.-]+$/)) {
			return [];
		}
		return text.split(".").filter(function (part) {
			return part && part.match(/^[A-Za-z0-9_-]+$/);
		});
	}

	function blockLocalName(name) {
		var parts = blockIdParts(name);
		return parts.length ? parts[parts.length - 1] : "";
	}

	function blockNamespace(name) {
		var parts = blockIdParts(name);
		parts.pop();
		return parts.join(".");
	}

	function blockFileName(name, env) {
		var namePart = blockLocalName(name);
		if (!namePart.match(/^[A-Za-z0-9_-]+$/)) {
			env.raise("INVALID_BLOCK_NAME", "Invalid Flow block name: " + name,
				null, "Use letters, digits, dot, underscore or dash.");
		}
		return namePart + ".js";
	}

	function blockDescriptorFileName(name, env) {
		var parts = blockIdParts(name);
		if (parts.length === 0) {
			env.raise("INVALID_BLOCK_NAME", "Invalid Flow block name: " + name,
				null, "Use letters, digits, dot, underscore or dash.");
		}
		var leaf = parts.pop();
		return (parts.length ? parts.join("/") + "/" : "") + leaf + ".block.yaml";
	}

	function blockCodeDescriptorFileName(name, env) {
		var parts = blockIdParts(name);
		if (parts.length === 0) {
			env.raise("INVALID_BLOCK_NAME", "Invalid Flow block name: " + name,
				null, "Use letters, digits, dot, underscore or dash.");
		}
		var leaf = parts.pop();
		return (parts.length ? parts.join("/") + "/" : "") + leaf + ".block.js";
	}

	function blockFlowFileName(name, env) {
		var namePart = blockLocalName(name);
		if (!namePart.match(/^[A-Za-z0-9_-]+$/)) {
			env.raise("INVALID_BLOCK_NAME", "Invalid Flow block name: " + name,
				null, "Use letters, digits, dot, underscore or dash.");
		}
		return namePart + ".flow.yaml";
	}

	function blockHooksFileName(name, env) {
		var namePart = blockLocalName(name);
		if (!namePart.match(/^[A-Za-z0-9_-]+$/)) {
			env.raise("INVALID_BLOCK_NAME", "Invalid Flow block name: " + name,
				null, "Use letters, digits, dot, underscore or dash.");
		}
		return namePart + ".hooks.js";
	}

	function typeDescriptorFileName(name, env) {
		var typeName = String(name || "").trim();
		if (!typeName.match(/^[A-Za-z0-9_.-]+$/)) {
			env.raise("INVALID_TYPE_NAME", "Invalid Flow property type name: " + name,
				null, "Use letters, digits, dot, underscore or dash.");
		}
		return typeName + ".type.yaml";
	}

	function flowFileName(name, env) {
		var flowName = String(name || "").trim();
		if (!flowName.match(/^[A-Za-z0-9_.-]+$/)) {
			env.raise("INVALID_FLOW_NAME", "Invalid Flow name: " + name,
				null, "Use letters, digits, dot, underscore or dash.");
		}
		return flowName + ".flow.yaml";
	}

	function flowCodeFileName(name, env) {
		var flowName = String(name || "").trim();
		if (!flowName.match(/^[A-Za-z0-9_.-]+$/)) {
			env.raise("INVALID_FLOW_NAME", "Invalid Flow name: " + name,
				null, "Use letters, digits, dot, underscore or dash.");
		}
		return flowName + ".flow.js";
	}

	function flowCodeFileFromYamlFile(file, name, env) {
		var path = String(file && file.getAbsolutePath ? file.getAbsolutePath() : file || "");
		if (path.endsWith(".flow.yaml")) {
			return new env.File(path.substring(0, path.length - ".flow.yaml".length) + ".flow.js");
		}
		if (file && file.getParentFile) {
			return new env.File(file.getParentFile(), flowCodeFileName(name, env));
		}
		return new env.File(flowCodeFileName(name, env));
	}

	function fragmentFileName(name, env) {
		var fragmentName = String(name || "").trim();
		if (!fragmentName.match(/^[A-Za-z0-9_.-]+$/)) {
			env.raise("INVALID_FRAGMENT_NAME", "Invalid Flow fragment name: " + name,
				null, "Use letters, digits, dot, underscore or dash.");
		}
		return fragmentName + ".fragment.yaml";
	}

	function flowNameFor(request, definition) {
		request = request || {};
		definition = definition || {};
		var name = String(request.flowName || request.name || definition.name || "").trim();
		if (!name && request.flowQName) {
			var parts = String(request.flowQName).split(".");
			name = parts[parts.length - 1];
		}
		return safeFilePart(name);
	}

	return {
		resourcePath: resourcePath,
		safeFilePart: safeFilePart,
		safeIdentifier: safeIdentifier,
		blockIdParts: blockIdParts,
		blockLocalName: blockLocalName,
		blockNamespace: blockNamespace,
		blockFileName: blockFileName,
		blockDescriptorFileName: blockDescriptorFileName,
		blockCodeDescriptorFileName: blockCodeDescriptorFileName,
		blockFlowFileName: blockFlowFileName,
		blockHooksFileName: blockHooksFileName,
		typeDescriptorFileName: typeDescriptorFileName,
		flowFileName: flowFileName,
		flowCodeFileName: flowCodeFileName,
		flowCodeFileFromYamlFile: flowCodeFileFromYamlFile,
		fragmentFileName: fragmentFileName,
		flowNameFor: flowNameFor
	};
}())
