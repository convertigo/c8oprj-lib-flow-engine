(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		displayName: function (node) {
			var error = prop(node, "error");
			return "try" + (error ? " -> " + error : "");
		},

		analyze: function (ctx, node) {
			ctx.addPath(prop(node, "error") || "local.error");
			ctx.visitNodes(node["try"] || []);
			ctx.visitNodes(node["catch"] || []);
		}
	};
}())
