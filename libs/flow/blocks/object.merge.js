(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	function objectValue(ctx, value) {
		if (value === undefined || value === null) {
			return {};
		}
		return typeof value === "string" ? ctx.expr(value) : ctx.template(value);
	}

	function copy(out, value) {
		if (!value || Object.prototype.toString.call(value) !== "[object Object]") {
			return;
		}
		Object.keys(value).forEach(function (key) {
			out[key] = value[key];
		});
	}

	return {
		name: "object.merge",

		displayName: function (node) {
			var target = flowSummary.prop(node, "target") || "object";
			var source = flowSummary.prop(node, "source") || "patch";
			return flowSummary.output(node, flowSummary.text(target + " + " + source));
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addPath(props.out);
			if (!ctx.addSchema) {
				return;
			}
			var targetSchema = ctx.schemaForPath ? ctx.schemaForPath(String(props.target || "")) : null;
			var sourceSchema = ctx.schemaForValue ? ctx.schemaForValue(props.source) : null;
			var schema = ctx.mergeSchema ? ctx.mergeSchema(targetSchema, sourceSchema) : targetSchema || sourceSchema;
			if (schema) {
				ctx.addSchema(props.out, schema);
			}
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			var out = {};
			copy(out, objectValue(ctx, props.target));
			copy(out, objectValue(ctx, props.source));
			return out;
		}
	};
}())
