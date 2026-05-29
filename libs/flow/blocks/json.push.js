(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		name: "json.push",

		catalog: function () {
			return {
				name: "json.push",
				icon: "mdi:playlist-plus",
				props: {
					path: { label: "path", kind: "path", mode: "write", "default": "result.items", description: "Array scope path receiving the pushed value." },
					value: { label: "value", kind: "value", type: "unknown", "default": "{{ current }}", description: "Value to push. Use {{ expression }} for dynamic values." }
				},
				description: "Pushes a value into an array stored in a scope path.",
				longDescription: "Use path for the target array and value for the pushed content. A value containing only {{ expression }} keeps the native expression type."
			};
		},

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
