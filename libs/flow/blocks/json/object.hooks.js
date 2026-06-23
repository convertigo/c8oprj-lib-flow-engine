(function () {
	function props(node) {
		return node && node.props ? node.props : node || {};
	}

	function fieldSchema(ctx, node) {
		var fieldProps = props(node);
		if (fieldProps.value !== undefined && ctx.schemaForValue) {
			return ctx.schemaForValue(fieldProps.value) || { type: "unknown" };
		}
		return null;
	}

	function addObjectSchema(ctx, node) {
		if (!node || !node.out || !ctx.addSchema) {
			return;
		}
		var properties = {};
		var hasProperties = false;
		(node.fields || []).forEach(function (field) {
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
		if (hasProperties) {
			ctx.addSchema(node.out, {
				type: "object",
				properties: properties
			});
		}
	}

	return {
		displayName: function (node) {
			return node && node.out ? "object -> " + node.out : "object";
		},

		analyze: function (ctx, node) {
			if (node && node.out) {
				ctx.addPath(node.out);
				addObjectSchema(ctx, node);
			}
			ctx.visitNodes(node.fields || []);
		},

		analyzeShallow: function (ctx, node) {
			if (node && node.out) {
				ctx.addPath(node.out);
				addObjectSchema(ctx, node);
			}
		}
	};
}())
