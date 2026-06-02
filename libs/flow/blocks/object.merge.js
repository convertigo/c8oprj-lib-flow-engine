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
		run: function (ctx, node) {
			var props = ctx.props(node);
			var out = {};
			copy(out, objectValue(ctx, props.target));
			copy(out, objectValue(ctx, props.source));
			return out;
		}
	};
}())
