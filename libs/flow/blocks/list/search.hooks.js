(function () {
	return {
		displayName: function (node) {
			var items = flowSummary.prop(node, "items") || flowSummary.prop(node, "in") || "items";
			var query = flowSummary.prop(node, "query") || "";
			return flowSummary.output(node, flowSummary.text(items + " search " + query));
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addPath(props.out);
			ctx.addSameSchema(props.out, props.items || props["in"]);
		}
	};
}())
