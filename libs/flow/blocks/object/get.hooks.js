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
				/[()?:+*\/<>!=&|]/.test(text)) {
			return null;
		}
		return text;
	}

	function directPropertySchema(sourceSchema, key) {
		var properties = sourceSchema && sourceSchema.properties || {};
		return Object.prototype.hasOwnProperty.call(properties, key) ? properties[key] : null;
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

	function isWeakSchema(schema) {
		if (!schema) {
			return true;
		}
		var type = String(schema.type || (schema.properties ? "object" : ""));
		if (type === "unknown" || type === "null" || type === "") {
			return true;
		}
		return type === "object" && Object.keys(schema.properties || {}).length === 0 && !schema.additionalProperties;
	}

	function defaultSchema(ctx, props) {
		return props.defaultValue === undefined || !ctx.schemaForValue
			? null
			: ctx.schemaForValue(props.defaultValue);
	}

	function addBestSchema(ctx, out, sourceSchema, fallbackSchema) {
		var schema = isWeakSchema(sourceSchema) && fallbackSchema ? fallbackSchema : sourceSchema || fallbackSchema;
		if (schema) {
			ctx.addSchema(out, schema);
			return true;
		}
		return false;
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
			var fallback = defaultSchema(ctx, props);
			var sourceSchema = ctx.schemaForExpression(source);
			if (key && ctx.schemaForPath) {
				var selected = directPropertySchema(sourceSchema, key) ||
					ctx.schemaForPath(String(source || "") + "." + key);
				if (addBestSchema(ctx, props.out, selected, fallback)) {
					return;
				}
			}
			var mapSchema = mergeValueSchemas(ctx, sourceSchema);
			addBestSchema(ctx, props.out, mapSchema, fallback);
		}
	};
}())
