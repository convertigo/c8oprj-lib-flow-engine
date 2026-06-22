(function () {
	function comparable(value) {
		if (typeof value === "string" && value.trim() !== "") {
			var number = Number(value);
			if (!isNaN(number)) {
				return number;
			}
		}
		return value === undefined || value === null ? "" : value;
	}

	return {
		displayName: function (node) {
			var items = flowSummary.prop(node, "items") || flowSummary.prop(node, "in") || "items";
			var by = flowSummary.prop(node, "by") === undefined ? "current" : flowSummary.prop(node, "by");
			var direction = flowSummary.prop(node, "direction") || flowSummary.prop(node, "order") || "asc";
			return flowSummary.output(node, flowSummary.text(items + " by " + by + " " + direction));
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addPath(props.out);
			ctx.addSameSchema(props.out, props.items || props["in"]);
		}
	};
}())
