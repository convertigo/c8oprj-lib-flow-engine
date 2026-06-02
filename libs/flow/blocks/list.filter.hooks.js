(function () {
	function shouldKeep(ctx, props) {
		return !!ctx.expr(props.where);
	}

	return {
		displayName: function (node) {
			var items = flowSummary.prop(node, "items") || flowSummary.prop(node, "in") || "items";
			var condition = flowSummary.prop(node, "where") || "true";
			return flowSummary.output(node, flowSummary.text(items + " where " + condition));
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addPath(props.out);
		}
	};
}())
