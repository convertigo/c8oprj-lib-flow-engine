(function () {
	function nodePath(node) {
		return node && (node.uid || node.id || node.name) ? String(node.uid || node.id || node.name) : "";
	}

	function nodeProps(node) {
		var props = {};
		var structural = {
			id: true, uid: true, block: true, type: true,
			props: true, nodes: true, "do": true, then: true, "else": true,
			disabled: true, __fragment: true, __graphBlock: true
		};
		if (node.props) {
			Object.keys(node.props).forEach(function (key) {
				props[key] = node.props[key];
			});
		}
		Object.keys(node).forEach(function (key) {
			if (!structural[key]) {
				props[key] = node[key];
			}
		});
		return props;
	}

	function isFlowNodeLike(value) {
		return value && typeof value === "object" && Object.prototype.toString.call(value) !== "[object Array]" &&
			(value.block !== undefined || value.id !== undefined || value.uid !== undefined || value.props !== undefined);
	}

	function canonicalFlowNode(node, env) {
		node = env.normalizeTree(node || {});
		if (node.props && typeof node.props === "object" && Object.prototype.toString.call(node.props) !== "[object Array]") {
			Object.keys(node.props).forEach(function (key) {
				if (node[key] === undefined) {
					node[key] = node.props[key];
				}
			});
			delete node.props;
		}
		Object.keys(node).forEach(function (key) {
			var value = node[key];
			if (Object.prototype.toString.call(value) === "[object Array]") {
				node[key] = value.map(function (item) {
					return isFlowNodeLike(item) ? canonicalFlowNode(item, env) : env.normalizeTree(item);
				});
			}
		});
		return node;
	}

	function canonicalFlowDefinition(definition, env) {
		var out = env.normalizeTree(definition || {});
		if (Object.prototype.toString.call(out.nodes) === "[object Array]") {
			out.nodes = out.nodes.map(function (node) {
				return canonicalFlowNode(node, env);
			});
		}
		return out;
	}

	return {
		nodePath: nodePath,
		nodeProps: nodeProps,
		isFlowNodeLike: isFlowNodeLike,
		canonicalFlowNode: canonicalFlowNode,
		canonicalFlowDefinition: canonicalFlowDefinition
	};
}())
