(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		displayName: function (node) {
			var condition = prop(node, "condition");
			return condition ? "? " + flowSummary.text(condition) : "condition";
		},

		analyze: function (ctx, node) {
			ctx.visitNodes(node.then || []);
			ctx.visitNodes(node["else"] || []);
		}
	};
}())
