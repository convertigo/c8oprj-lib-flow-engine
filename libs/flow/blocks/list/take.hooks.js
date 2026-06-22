(function () {
	return {
		displayName: function (node) {
			var items = flowSummary.prop(node, "items") || flowSummary.prop(node, "in") || "items";
			var offset = flowSummary.prop(node, "offset");
			var count = flowSummary.prop(node, "count");
			var text = items;
			if (offset !== undefined && String(offset) !== "0") {
				text += " from " + offset;
			}
			if (count !== undefined && String(count) !== "") {
				text += " take " + count;
			}
			return flowSummary.output(node, flowSummary.text(text));
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addPath(props.out);
			ctx.addSameSchema(props.out, props.items || props["in"]);
		}
	};
}())
