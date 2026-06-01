(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		name: "set",

		displayName: function (node) {
			return flowSummary.assignment(node, "=") || flowSummary.text(prop(node, "path") || "value");
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addPath(props.path);
			if (ctx.schemaForValue && ctx.addSchema) {
				ctx.addSchema(props.path, ctx.schemaForValue(props.value));
			}
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			return ctx.write(props.path, ctx.input(props));
		}
	};
}())
