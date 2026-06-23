(function () {
	function props(node) {
		return node && node.props ? node.props : node || {};
	}

	function fieldSchema(ctx, node) {
		var fieldProps = props(node);
		if (fieldProps.value !== undefined && ctx.schemaForValue) {
			return ctx.schemaForValue(fieldProps.value);
		}
		return null;
	}

	function objectSchema(ctx, fields) {
		var properties = {};
		var hasProperties = false;
		(fields || []).forEach(function (field) {
			if (!field || field.block !== "json.field") {
				return;
			}
			var fieldProps = props(field);
			var key = fieldProps.key;
			if (key === undefined || key === null || key === "") {
				return;
			}
			var schema = fieldSchema(ctx, field);
			if (schema) {
				properties[String(key)] = schema;
				hasProperties = true;
			}
		});
		return hasProperties ? {
			type: "object",
			properties: properties
		} : null;
	}

	return {
		displayName: function (node) {
			return node && node.out ? "object -> " + node.out : "object";
		},

		analyze: function (ctx, node) {
			if (node && node.out) {
				ctx.addPath(node.out);
				if (ctx.addSchema) {
					var schema = objectSchema(ctx, node.fields || []);
					if (schema) {
						ctx.addSchema(node.out, schema);
					}
				}
			}
			ctx.visitNodes(node.fields || []);
		}
	};
}())
