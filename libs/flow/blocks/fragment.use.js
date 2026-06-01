(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		name: "fragment.use",

		displayName: function (node) {
			return flowSummary.text(prop(node, "fragment") || "fragment");
		},

		analyze: function (ctx, node) {
			ctx.visitNodes(node.nodes || []);
		},

		run: function (ctx, node) {
			return ctx.runNodes(node.nodes || []);
		}
	};
}())
