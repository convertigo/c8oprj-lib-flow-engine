(function () {
	return {
		displayName: function (node) {
			return flowSummary.input(node) || "result";
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			if (ctx.schemaForValue && ctx.addReturnSchema) {
				ctx.addReturnSchema(ctx.schemaForValue(props.value));
			}
		}
	};
}())
