(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		displayName: function (node) {
			var text = flowSummary.text(prop(node, "text") || "xml");
			return flowSummary.output(node, text);
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addSchema(props.out, { type: "object" });
		}
	};
}())
