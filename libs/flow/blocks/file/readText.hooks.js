(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		displayName: function (node) {
			return flowSummary.text((prop(node, "path") || "file") + " -> " + (prop(node, "out") || "local.text"));
		},

		analyze: function (ctx, node) {
			var out = ctx.outputPath(node) || "local.text";
			ctx.addPath(out);
			if (ctx.addSchema) {
				ctx.addSchema(out, { type: "string" });
			}
		}
	};
}())
