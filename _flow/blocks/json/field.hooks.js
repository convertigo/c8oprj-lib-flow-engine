(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		displayName: function (node) {
			var key = prop(node, "key") || "field";
			var value = prop(node, "value");
			return value === undefined || value === "" ? String(key) : String(key) + ": " + flowSummary.text(value);
		},

		analyze: function (ctx, node) {
			ctx.visitNodes(node.nodes || []);
		}
	};
}())
