(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	function boolValue(value, fallback) {
		if (value === undefined || value === null || value === "") {
			return fallback;
		}
		return value === true || String(value) === "true";
	}

	function textValue(ctx, value) {
		if (value === undefined || value === null) {
			return "";
		}
		if (ctx.isHandle && ctx.isHandle(value)) {
			return JSON.stringify(ctx.handleSummary(value));
		}
		if (Object.prototype.toString.call(value) === "[object Array]" ||
				Object.prototype.toString.call(value) === "[object Object]") {
			return JSON.stringify(value);
		}
		return String(value);
	}

	return {
		name: "file.write",

		catalog: function () {
			return {
				name: "file.write",
				icon: "mdi:file-document-edit-outline",
				kind: "resource",
				props: {
					writer: { label: "writer", kind: "expression", type: "handle<file.writer>", "default": "local.writer", description: "Writer handle produced by file.withWriter." },
					value: { label: "value", kind: "value", type: "unknown", "default": "", description: "Value written to the file." },
					newline: { label: "newline", kind: "literal", type: "boolean", "default": false, description: "Append a newline after the value." },
					flush: { label: "flush", kind: "literal", type: "boolean", "default": false, description: "Flush the writer after this write." }
				},
				description: "Writes text to a file writer handle."
			};
		},

		displayName: function (node) {
			return flowSummary.text((prop(node, "writer") || "writer") + " <= " + (flowSummary.prop(node, "value") || "value"));
		},

		analyze: function (ctx, node) {
			var writer = ctx.props(node).writer || "local.writer";
			if (ctx.addRead && typeof writer === "string") {
				ctx.addRead(writer);
			}
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			var writer = ctx.handleValue(ctx.expr(props.writer || "local.writer"), "file.writer");
			writer.write(textValue(ctx, ctx.input(props, "")));
			if (boolValue(props.newline, false)) {
				writer.newLine();
			}
			if (boolValue(props.flush, false)) {
				writer.flush();
			}
			return { written: true };
		}
	};
}())
