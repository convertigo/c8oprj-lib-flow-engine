(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		name: "forEach",

		catalog: function () {
			return {
				name: "forEach",
				icon: "mdi:repeat",
				kind: "control",
				props: {
					items: { kind: "expression", type: "array", "default": "flow.items", description: "Array expression iterated by this block." }
				},
				children: ["nodes"],
				slots: [
					{ name: "nodes", label: "Flow", inline: true }
				],
				description: "Runs child nodes once per item and exposes the item as current."
			};
		},

		displayName: function (node) {
			var items = prop(node, "items") || prop(node, "in");
			return items ? flowSummary.text(items) : "items";
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			var items = props.items || props["in"];
			var source = ctx.sourceForPath ? ctx.sourceForPath(items) : null;
			source = source || { path: items };
			if (ctx.withCurrentSource) {
				ctx.withCurrentSource(source, function () {
					ctx.visitNodes(node.nodes || []);
				});
			} else {
				ctx.visitNodes(node.nodes || []);
			}
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			var items = ctx.expr(props.items || props["in"]) || [];
			for (var i = 0; i < items.length; i++) {
				if (ctx.stopped) {
					break;
				}
				ctx.scopes.current = items[i];
				ctx.runNodes(node.nodes || []);
			}
			ctx.scopes.current = null;
			return items;
		}
	};
}())
