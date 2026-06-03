(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		displayName: function (node) {
			return flowSummary.assignment(node, "+=") || "array";
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addPath(props.path);
			ctx.visitNodes(node.nodes || []);
			if (ctx.schemaForValue && ctx.addSchema) {
				var itemSchema = ctx.schemaForValue(props.value);
				if (itemSchema) {
					ctx.addSchema(props.path, {
						type: "array",
						items: itemSchema
					});
				}
			}
		}
	};
}())
