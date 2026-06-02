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
