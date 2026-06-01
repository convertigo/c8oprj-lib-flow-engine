(function () {
	return {
		name: "return",

		displayName: function (node) {
			return flowSummary.input(node) || "result";
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			if (ctx.schemaForValue && ctx.addReturnSchema) {
				ctx.addReturnSchema(ctx.schemaForValue(props.value));
			}
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			return ctx.returnValue(ctx.input(props, ctx.read("result")));
		}
	};
}())
