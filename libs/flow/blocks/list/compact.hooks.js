(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	function isFalse(value) {
		return value === false || String(value).toLowerCase() === "false";
	}

	return {
		displayName: function (node) {
			var items = prop(node, "items") || prop(node, "in") || "items";
			return flowSummary.output(node, flowSummary.text(items + " compact"));
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			var items = props.items || props["in"];
			if (!props.out || !items || !ctx.schemaForExpression || !ctx.addSchema) {
				return;
			}
			var schema = ctx.schemaForExpression(items);
			if (!schema) {
				return;
			}
			if (!isFalse(props.flatten) && schema.type === "array" && schema.items && schema.items.type === "array") {
				ctx.addSchema(props.out, {
					type: "array",
					items: schema.items.items || { type: "unknown" }
				});
				return;
			}
			ctx.addSchema(props.out, schema);
		}
	};
}())
