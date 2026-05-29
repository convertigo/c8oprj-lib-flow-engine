(function () {
	function comparable(value) {
		if (typeof value === "string" && value.trim() !== "") {
			var number = Number(value);
			if (!isNaN(number)) {
				return number;
			}
		}
		return value === undefined || value === null ? "" : value;
	}

	return {
		name: "list.sort",

		catalog: function () {
			return {
				name: "list.sort",
				icon: "mdi:sort",
				props: {
					items: { kind: "expression", type: "array", "default": "flow.items", description: "Array expression to sort." },
					by: { kind: "expression", type: "unknown", "default": "current", description: "Expression evaluated as the sort key for each current item." },
					direction: { kind: "text", type: "string", "default": "asc", description: "Sort direction: asc or desc." },
					out: { kind: "path", mode: "write", "default": "flow.sorted", description: "Scope path receiving the sorted array." }
				},
				description: "Sorts an array copy by a current.* expression."
			};
		},

		displayName: function (node) {
			var items = flowSummary.prop(node, "items") || flowSummary.prop(node, "in") || "items";
			var by = flowSummary.prop(node, "by") === undefined ? "current" : flowSummary.prop(node, "by");
			var direction = flowSummary.prop(node, "direction") || flowSummary.prop(node, "order") || "asc";
			return flowSummary.output(node, flowSummary.text(items + " by " + by + " " + direction));
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addPath(props.out);
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			var items = (ctx.expr(props.items || props["in"]) || []).slice(0);
			var previous = ctx.scopes.current;
			var direction = String(props.direction || props.order || "asc").toLowerCase() === "desc" ? -1 : 1;
			var by = props.by === undefined ? "current" : props.by;
			items.sort(function (a, b) {
				ctx.scopes.current = a;
				var left = comparable(ctx.expr(by));
				ctx.scopes.current = b;
				var right = comparable(ctx.expr(by));
				if (left < right) {
					return -1 * direction;
				}
				if (left > right) {
					return direction;
				}
				return 0;
			});
			ctx.scopes.current = previous;
			return items;
		}
	};
}())
