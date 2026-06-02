(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		displayName: function (node) {
			return flowSummary.text(prop(node, "fragment") || "fragment");
		},

		analyze: function (ctx, node) {
			ctx.visitNodes(node.nodes || []);
		}
	};
}())
