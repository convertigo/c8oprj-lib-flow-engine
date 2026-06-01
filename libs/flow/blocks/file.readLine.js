(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		name: "file.readLine",

		catalog: function () {
			return {
				name: "file.readLine",
				icon: "mdi:file-find-outline",
				kind: "resource",
				props: {
					reader: { label: "reader", kind: "expression", type: "handle<file.reader>", "default": "local.reader", description: "Reader handle produced by file.withReader." },
					line: { label: "line", kind: "path", mode: "write", description: "Optional scope path receiving the line or null at EOF." },
					eof: { label: "eof", kind: "path", mode: "write", description: "Optional scope path receiving true when the reader reached EOF." },
					out: { label: "out", kind: "path", mode: "write", description: "Optional scope path receiving {line, eof}." }
				},
				description: "Reads one line from a file reader handle."
			};
		},

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
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			var reader = ctx.handleValue(ctx.expr(props.reader || "local.reader"), "file.reader");
			var raw = reader.readLine();
			var eof = raw === null;
			var result = {
				line: eof ? null : String(raw),
				eof: eof
			};
			if (props.line) {
				ctx.write(props.line, result.line);
			}
			if (props.eof) {
				ctx.write(props.eof, result.eof);
			}
			return result;
		}
	};
}())
