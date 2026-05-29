(function () {
	function shouldKeep(ctx, props) {
		return !!ctx.expr(props.where);
	}

	return {
		name: "list.filter",

		catalog: function () {
			return {
				name: "list.filter",
				icon: "mdi:filter-outline",
				props: {
					items: { label: "items", kind: "expression", type: "array", "default": "flow.items", description: "Array expression to filter." },
					where: { label: "where", kind: "expression", type: "boolean", "default": "true", description: "Boolean expression evaluated for each current item." },
					out: { label: "out", kind: "path", mode: "write", "default": "flow.filtered", description: "Scope path receiving the filtered array." }
				},
				description: "Filters an array using a pure expression evaluated with current.*."
			};
		},

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
