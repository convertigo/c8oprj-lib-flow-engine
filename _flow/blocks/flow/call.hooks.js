(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	function flowName(ctx, value) {
		value = value === undefined || value === null ? "" : value;
		return !/\$\{|\{\{/.test(String(value)) ? String(value) : ctx.render(value);
	}

	return {
		displayName: function (node) {
			return flowSummary.output(node, flowSummary.text(prop(node, "flow") || "flow"));
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addPath(ctx.outputPath(node));
		}
	};
}())
