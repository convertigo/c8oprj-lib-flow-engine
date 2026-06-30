(function () {
	return {
		displayName: function (node) {
			var source = flowSummary.prop(node, "source") || "object";
			return flowSummary.output(node, flowSummary.text("keys " + source));
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addPath(props.out);
			if (ctx.addSchema) {
				ctx.addSchema(props.out, {
					type: "array",
					items: {
						type: "string"
					}
				});
			}
		}
	};
}())
