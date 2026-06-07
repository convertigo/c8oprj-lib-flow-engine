(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		displayName: function (node) {
			var source = prop(node, "source") || "source";
			var path = prop(node, "path");
			var action = flowSummary.text(path ? source + "." + path : source);
			return flowSummary.output(node, action);
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addPath(props.out);
			if (ctx.schemaForPath && ctx.addSchema && props.source && props.path) {
				var selectedSchema = ctx.schemaForPath(String(props.source) + "." + String(props.path));
				if (selectedSchema) {
					ctx.addSchema(props.out, selectedSchema);
				}
			}
		}
	};
}())
