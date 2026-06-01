(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		name: "json.push",

		displayName: function (node) {
			return flowSummary.assignment(node, "+=") || "array";
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addPath(props.path);
			if (ctx.schemaForValue && ctx.addSchema) {
				var itemSchema = ctx.schemaForValue(props.value);
				if (itemSchema) {
					ctx.addSchema(props.path, {
						type: "array",
						items: itemSchema
					});
				}
			}
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			var array = ctx.read(props.path);
			if (!array) {
				array = ctx.write(props.path, []);
			}
			array.push(ctx.input(props));
			return array;
		}
	};
}())
