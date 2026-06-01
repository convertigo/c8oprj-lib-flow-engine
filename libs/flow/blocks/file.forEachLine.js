(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		name: "file.forEachLine",

		displayName: function (node) {
			return flowSummary.text(prop(node, "reader") || "reader");
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			var reader = props.reader || "local.reader";
			if (ctx.addRead && typeof reader === "string") {
				ctx.addRead(reader);
			}
			if (props.out) {
				ctx.addPath(props.out);
				if (ctx.addSchema) {
					ctx.addSchema(props.out, {
						type: "object",
						properties: {
							count: { type: "integer" }
						}
					});
				}
			}
			var source = { path: "file.line", schema: { type: "string" } };
			if (ctx.withCurrentSource) {
				ctx.withCurrentSource(source, function () {
					ctx.visitNodes(node.nodes || []);
				});
			} else {
				ctx.visitNodes(node.nodes || []);
			}
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			var reader = ctx.handleValue(ctx.expr(props.reader || "local.reader"), "file.reader");
			var previous = ctx.scopes.current;
			var count = 0;
			try {
				var line;
				while ((line = reader.readLine()) !== null) {
					if (ctx.stopped) {
						break;
					}
					ctx.scopes.current = String(line);
					ctx.runNodes(node.nodes || []);
					count++;
				}
			} finally {
				ctx.scopes.current = previous;
			}
			return { count: count };
		}
	};
}())
