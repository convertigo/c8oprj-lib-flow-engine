(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		name: "json.select",

		catalog: function () {
			return {
				name: "json.select",
				icon: "mdi:select-search",
				props: {
					source: { label: "source", kind: "expression", type: "object", "default": "flow.source", description: "Object expression used as source." },
					path: { label: "path", kind: "text", type: "string", "default": "", description: "Dot path to read inside the source object." },
					out: { label: "out", kind: "path", mode: "write", "default": "flow.value", description: "Scope path receiving the selected value." }
				},
				description: "Reads a nested value from a JSON object."
			};
		},

		displayName: function (node) {
			var source = prop(node, "source") || "source";
			var path = prop(node, "path");
			var action = flowSummary.text(path ? source + "." + path : source);
			return flowSummary.output(node, action);
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addPath(props.out);
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			var source = ctx.expr(props.source);
			return ctx.readObjectPath(source, props.path);
		}
	};
}())
