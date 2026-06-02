(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		displayName: function (node) {
			var target = prop(node, "line") || prop(node, "out") || "line";
			return flowSummary.text((prop(node, "reader") || "reader") + " -> " + target);
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			var reader = props.reader || "local.reader";
			if (ctx.addRead && typeof reader === "string") {
				ctx.addRead(reader);
			}
			if (props.line) {
				ctx.addPath(props.line);
				if (ctx.addSchema) {
					ctx.addSchema(props.line, { type: "string", nullable: true });
				}
			}
			if (props.eof) {
				ctx.addPath(props.eof);
				if (ctx.addSchema) {
					ctx.addSchema(props.eof, { type: "boolean" });
				}
			}
			if (props.out) {
				ctx.addPath(props.out);
				if (ctx.addSchema) {
					ctx.addSchema(props.out, {
						type: "object",
						properties: {
							line: { type: "string", nullable: true },
							eof: { type: "boolean" }
						}
					});
				}
			}
		}
	};
}())
