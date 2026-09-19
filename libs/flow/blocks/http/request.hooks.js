(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		displayName: function (node) {
			var method = prop(node, "method") || "GET";
			return flowSummary.output(node, String(method).toUpperCase() + " " + flowSummary.text(prop(node, "url") || "url"));
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addPath(ctx.outputPath(node));
			if (ctx.schemaForOutput && ctx.addSchema) {
				var schema = ctx.schemaForOutput(node, "out", ctx.outputPath(node));
				if (schema) {
					ctx.addSchema(ctx.outputPath(node), schema);
				}
			}
		}
	};
}())
