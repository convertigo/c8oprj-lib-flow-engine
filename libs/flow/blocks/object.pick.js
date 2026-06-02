(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	function keys(value) {
		if (!value) {
			return [];
		}
		if (Object.prototype.toString.call(value) === "[object Array]") {
			return value.map(function (item) { return String(item); });
		}
		return String(value).split(/[\n,]/).map(function (item) {
			return item.trim();
		}).filter(function (item) {
			return item !== "";
		});
	}

	function outputKey(path) {
		var parts = String(path).split(".");
		return parts[parts.length - 1];
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var source = typeof props.source === "string" ? ctx.expr(props.source) : ctx.template(props.source);
			var out = {};
			keys(props.keys).forEach(function (path) {
				var value = ctx.readObjectPath(source, path);
				if (value !== undefined) {
					out[outputKey(path)] = value;
				}
			});
			return out;
		}
	};
}())
