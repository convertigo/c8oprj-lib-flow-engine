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
		displayName: function (node) {
			return flowSummary.text((prop(node, "writer") || "writer") + " <= " + (flowSummary.prop(node, "value") || "value"));
		},

		analyze: function (ctx, node) {
			var writer = ctx.props(node).writer || "local.writer";
			if (ctx.addRead && typeof writer === "string") {
				ctx.addRead(writer);
			}
		}
	};
}())
