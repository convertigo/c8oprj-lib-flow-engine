(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		displayName: function (node) {
			var value = flowSummary.value(node) || flowSummary.text("value");
			return flowSummary.output(node, value);
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addPath(props.out);
			if (ctx.addSchema) {
				ctx.addSchema(props.out, { type: "string" });
			}
		}
	};
}())
