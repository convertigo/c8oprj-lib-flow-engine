(function () {
	return {
		displayName: function (node) {
			var items = flowSummary.prop(node, "items") || flowSummary.prop(node, "in") || "items";
			var select = flowSummary.prop(node, "select") === undefined ? "current" : flowSummary.prop(node, "select");
			return flowSummary.output(node, flowSummary.text(items + " => " + select));
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addPath(props.out);
			var item = ctx.itemSchemaFor(props.items || props["in"]);
			ctx.withCurrentSchema(item, function () {
				var selected = props.select === undefined ? "current" : props.select;
				ctx.addArraySchema(props.out, ctx.schemaForExpression(selected));
			});
		}
	};
}())
