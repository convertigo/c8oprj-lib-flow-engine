(function () {
	return {
		analyze: function (ctx, node) {
			var schema = ctx.configOverrideSchema ? ctx.configOverrideSchema(node) : null;
			if (ctx.withScopedSchema) {
				ctx.withScopedSchema("config", schema, function () {
					ctx.visitNodes(node.then || []);
				});
			} else {
				ctx.visitNodes(node.then || []);
			}
		}
	};
}())
