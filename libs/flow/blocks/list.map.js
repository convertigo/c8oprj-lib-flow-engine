(function () {
	return {
		name: "list.map",

		catalog: function () {
			return {
				name: "list.map",
				icon: "mdi:vector-polyline",
				props: {
					items: { label: "items", kind: "expression", type: "array", "default": "flow.items", description: "Array expression to map." },
					select: { label: "select", kind: "expression", type: "unknown", "default": "current", description: "Expression evaluated for each current item." },
					out: { label: "out", kind: "path", mode: "write", "default": "flow.mapped", description: "Scope path receiving the mapped array." }
				},
				description: "Maps an array to a new array while exposing each item as current."
			};
		},

		displayName: function (node) {
			var items = flowSummary.prop(node, "items") || flowSummary.prop(node, "in") || "items";
			var select = flowSummary.prop(node, "select") === undefined ? "current" : flowSummary.prop(node, "select");
			return flowSummary.output(node, flowSummary.text(items + " => " + select));
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addPath(props.out);
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			var items = ctx.expr(props.items || props["in"]) || [];
			var previous = ctx.scopes.current;
			var mapped = [];
			for (var i = 0; i < items.length; i++) {
				ctx.scopes.current = items[i];
				mapped.push(ctx.expr(props.select === undefined ? "current" : props.select));
			}
			ctx.scopes.current = previous;
			return mapped;
		}
	};
}())
