(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		displayName: function (node) {
			return flowSummary.assignment(node, "+=") || "array";
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addPath(props.path);
			ctx.visitNodes(node.nodes || []);
			var declared = ctx.declaredSchema(props.path);
			if (declared) {
				if (declared.type !== "array") ctx.checkValueType({type:"array",items:{type:"unknown"}}, "{{ " + props.path + " }}", "path");
				ctx.checkValueType(declared.type === "array" ? declared.items : {type:"unknown"},
					node.nodes && node.nodes.length ? undefined : props.value, "value");
				ctx.addSchema(ctx.outputPath(node), declared);
				return;
			}
			if (ctx.schemaForValue && ctx.addSchema) {
				var itemSchema = ctx.schemaForValue(props.value);
				if (itemSchema) {
					ctx.addSchema(props.path, {
						type: "array",
						items: itemSchema
					});
				}
			}
		}
	};
}())
