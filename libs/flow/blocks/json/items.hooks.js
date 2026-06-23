(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	function isFalse(value) {
		return value === false || String(value).toLowerCase() === "false";
	}

	function join(base, leaf) {
		base = String(base || "");
		leaf = String(leaf || "");
		if (!base || !leaf) {
			return base || leaf;
		}
		return leaf.charAt(0) === "[" ? base + leaf : base + "." + leaf;
	}

	function arrayOf(schema) {
		if (!schema) {
			return null;
		}
		return schema.type === "array" ? schema : { type: "array", items: schema };
	}

	return {
		displayName: function (node) {
			var source = prop(node, "source") || prop(node, "value") || prop(node, "in") || "source";
			var path = prop(node, "path");
			return flowSummary.output(node, flowSummary.text(path ? source + "." + path : source));
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			if (!props.out || !ctx.schemaForExpression || !ctx.schemaForPath || !ctx.addSchema) {
				return;
			}
			var source = props.source || props.value || props["in"];
			if (!source) {
				return;
			}
			var path = props.path === undefined || props.path === null || props.path === "" ? "items" : String(props.path);
			var selected = path ? ctx.schemaForPath(join(source, path)) : ctx.schemaForExpression(source);
			if (selected) {
				ctx.addSchema(props.out, arrayOf(selected));
				return;
			}
			var sourceSchema = ctx.schemaForExpression(source);
			if (sourceSchema && sourceSchema.type === "array") {
				ctx.addSchema(props.out, sourceSchema);
			} else if (sourceSchema && !isFalse(props.includeScalar)) {
				ctx.addSchema(props.out, arrayOf(sourceSchema));
			}
		}
	};
}())
