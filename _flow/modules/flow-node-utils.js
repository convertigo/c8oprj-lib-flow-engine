(function () {
	var engineProperties = {
		// Harmonised with Convertigo objects: Name, Comment, Is active, Output. One
		// category vocabulary for every surface: "Base properties" and "Expert" are
		// editable, "Information" is read-only. No technical prefix in a label.
		id: { label: "Name", category: "Information", description: "Node name inside its Flow. Use Rename to change it; references are updated.", kind: "text", type: "string", readOnly: true, definitionPath: "id" },
		// Every host displays the same declared property; no native-row fallback.
		comment: { label: "Comment", category: "Base properties", description: "Free comment about this node.", kind: "text", type: "string", "default": "", definitionPath: "comment" },
		disabled: { label: "Is active", category: "Base properties", description: "Uncheck to skip this node and its children at runtime.", kind: "boolean", type: "boolean", "default": false, invert: true, definitionPath: "disabled" },
		out: { label: "Output", category: "Base properties", description: "Scope path receiving the block result, for example local.result.", kind: "path", type: "string", mode: "write", definitionPath: "out" }
	};
	Object.keys(engineProperties).forEach(function (key) { Object.freeze(engineProperties[key]); });
	Object.freeze(engineProperties);
	function enginePropertiesFor(node, outputs) {
		var fields = {};
		Object.keys(engineProperties).forEach(function (name) {
			fields[name] = Object.assign({}, engineProperties[name]);
		});
		var result = outputs && outputs.out;
		if (!result || result.hidden || result.expert) {
			// Never make an existing assignment inaccessible when a contract changes.
			fields.out.hidden = (!result || result.hidden === true) && !(node && node.out);
			fields.out.category = "Expert";
		}
		return fields;
	}
	function nodePath(node) {
		return node && (node.uid || node.id || node.name) ? String(node.uid || node.id || node.name) : "";
	}

	// Business values live in node.props; id/disabled/comment/out are engine fields.
	function nodeProps(node) {
		var props = Object.create(null);
		var source = node && node.props;
		if (source) {
			Object.keys(source).forEach(function (key) { props[key] = source[key]; });
		}
		return props;
	}

	function nodeOutputPath(node) {
		return node ? node.out : undefined;
	}

	function isFlowNodeLike(value) {
		return value && typeof value === "object" && Object.prototype.toString.call(value) !== "[object Array]" &&
			(value.block !== undefined || value.id !== undefined || value.uid !== undefined || value.props !== undefined);
	}

	function canonicalFlowNode(node, env) {
		// normalizeTree already copies the complete value. Never flatten business
		// properties into the node identity, or infer nodes inside business arrays.
		return env.normalizeTree(node || {});
	}

	function canonicalFlowDefinition(definition, env) {
		var out = env.normalizeTree(definition || {});
		if (out.flow && Object.prototype.hasOwnProperty.call(out.flow, "config") &&
				(!out.flow.config || Object.prototype.toString.call(out.flow.config) !== "[object Object]")) {
			var error = new Error("_flow.config must be an object of literal defaults.");
			error.code = "FLOW_CONFIG_OBJECT_REQUIRED";
			throw error;
		}
		// Version 2 is the only Flow dialect; a definition without it is version 2.
		if (out.flow && out.flow.sourceVersion !== undefined && out.flow.sourceVersion !== 2) {
			var versionError = new Error("Unsupported Flow sourceVersion: " + out.flow.sourceVersion);
			versionError.code = "FLOW_SOURCE_VERSION_UNSUPPORTED";
			versionError.hint = "Flow sources use sourceVersion 2.";
			throw versionError;
		}
		if (Object.prototype.toString.call(out.nodes) === "[object Array]") {
			out.nodes = out.nodes.map(function (node) {
				return canonicalFlowNode(node, env);
			});
		}
		if (Object.prototype.toString.call(out.helpers) === "[object Array]") {
			out.helpers = out.helpers.map(function (helper) {
				helper = env.normalizeTree(helper || {});
				if (Object.prototype.toString.call(helper.nodes) === "[object Array]") {
					helper.nodes = helper.nodes.map(function (node) {
						return canonicalFlowNode(node, env);
					});
				}
				return helper;
			});
		}
		return out;
	}

	return {
		engineProperties: engineProperties,
		enginePropertiesFor: enginePropertiesFor,
		nodePath: nodePath,
		nodeProps: nodeProps,
		nodeOutputPath: nodeOutputPath,
		isFlowNodeLike: isFlowNodeLike,
		canonicalFlowNode: canonicalFlowNode,
		canonicalFlowDefinition: canonicalFlowDefinition
	};
}())
