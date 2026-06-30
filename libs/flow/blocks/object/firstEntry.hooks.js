(function () {
	function mergeValueSchemas(ctx, sourceSchema) {
		if (!sourceSchema || sourceSchema.type !== "object") {
			return null;
		}
		var schema = sourceSchema.additionalProperties || null;
		var properties = sourceSchema.properties || {};
		Object.keys(properties).forEach(function (key) {
			schema = ctx.mergeSchema ? ctx.mergeSchema(schema, properties[key]) : schema || properties[key];
		});
		return schema;
	}

	return {
		displayName: function (node) {
			var source = flowSummary.prop(node, "source") || "object";
			return flowSummary.output(node, flowSummary.text("first entry " + source));
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addPath(props.out);
			if (!ctx.addSchema || !ctx.schemaForExpression) {
				return;
			}
			ctx.addSchema(props.out, {
				type: "object",
				properties: {
					key: {
						type: "string"
					},
					value: mergeValueSchemas(ctx, ctx.schemaForExpression(props.source)) || {
						type: "unknown"
					}
				}
			});
		}
	};
}())
