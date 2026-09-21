(function () {
	return {
		displayName: function (node) {
			var source = flowSummary.prop(node, "source") || "object";
			return flowSummary.output(node, flowSummary.text("values " + source));
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addPath(ctx.outputPath(node));
			if (ctx.addSchema) {
				ctx.addSchema(ctx.outputPath(node), {
					type: "array",
					items: { type: "unknown" }
				});
			}
		}
	};
}())
