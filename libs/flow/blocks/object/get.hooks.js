(function () {
	function staticKey(value) {
		if (value === undefined || value === null) {
			return null;
		}
		if (typeof value !== "string") {
			return String(value);
		}
		var text = String(value).trim();
		if (text === "") {
			return null;
		}
		if (text.indexOf("{{") !== -1 ||
				/^(input|config|local|result|current|request|trace)(\.|\[|$)/.test(text) ||
				/[()?:+\-*\/<>!=&|]/.test(text)) {
			return null;
		}
		return text;
	}

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
			var key = flowSummary.prop(node, "key") || "key";
			return flowSummary.output(node, flowSummary.text(source + "[" + key + "]"));
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addPath(props.out);
			if (!ctx.addSchema || !ctx.schemaForExpression) {
				return;
			}
			var source = props.source;
			var key = staticKey(props.key);
			if (key && ctx.schemaForPath) {
				var selected = ctx.schemaForPath(String(source || "") + "." + key);
				if (selected) {
					ctx.addSchema(props.out, selected);
					return;
				}
			}
			var mapSchema = mergeValueSchemas(ctx, ctx.schemaForExpression(source));
			if (mapSchema) {
				ctx.addSchema(props.out, mapSchema);
			}
		}
	};
}())
