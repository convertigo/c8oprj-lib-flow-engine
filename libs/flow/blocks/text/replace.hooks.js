(function () {
	return {
		displayName: function (node) {
			var text = flowSummary.prop(node, "text") || "text";
			var search = flowSummary.prop(node, "search") || "search";
			return flowSummary.output(node, flowSummary.text(text + " replace " + search));
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addSchema(props.out, { type: "string" });
		}
	};
}())
