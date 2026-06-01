(function () {
	function shouldKeep(ctx, props) {
		return !!ctx.expr(props.where);
	}

	return {
		name: "list.filter",

		displayName: function (node) {
			var items = flowSummary.prop(node, "items") || flowSummary.prop(node, "in") || "items";
			var condition = flowSummary.prop(node, "where") || "true";
			return flowSummary.output(node, flowSummary.text(items + " where " + condition));
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addPath(props.out);
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			var items = ctx.expr(props.items || props["in"]) || [];
			var previous = ctx.scopes.current;
			var filtered = [];
			for (var i = 0; i < items.length; i++) {
				ctx.scopes.current = items[i];
				if (shouldKeep(ctx, props)) {
					filtered.push(items[i]);
				}
			}
			ctx.scopes.current = previous;
			return filtered;
		}
	};
}())
