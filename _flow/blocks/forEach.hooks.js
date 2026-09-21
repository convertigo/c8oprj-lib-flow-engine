(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		displayName: function (node) {
			var items = prop(node, "items") || prop(node, "in");
			return items ? flowSummary.text(items) : "items";
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			var items = props.items || props["in"];
			var source = ctx.sourceForPath ? ctx.sourceForPath(items) : null;
			source = source || { path: items };
			if (ctx.schemaForPath && ctx.itemSchema) {
				var currentSchema = ctx.itemSchema(ctx.schemaForPath(items));
				if (currentSchema) {
					source.schema = currentSchema;
				}
			}
			if (ctx.withCurrentSource) {
				ctx.withCurrentSource(source, function () {
					ctx.visitNodes(node.nodes || []);
				});
			} else {
				ctx.visitNodes(node.nodes || []);
			}
		}
	};
}())
