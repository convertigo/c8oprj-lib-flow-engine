(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		name: "json.parse",

		displayName: function (node) {
			var text = flowSummary.text(prop(node, "text") || "json");
			return flowSummary.output(node, text);
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addPath(props.out);
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			var text = ctx.template(props.text);
			if (typeof text !== "string") {
				return text;
			}
			return JSON.parse(text);
		}
	};
}())
