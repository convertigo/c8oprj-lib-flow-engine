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
		name: "object.pick",

		catalog: function () {
			return {
				name: "object.pick",
				icon: "mdi:select-group",
				props: {
					source: { label: "source", kind: "expression", type: "object", "default": "flow.object", description: "Object expression to read from." },
					keys: { label: "keys", kind: "literal", type: "array|string", "default": "", description: "Comma-separated list or array of fields to copy. Nested paths are supported." },
					out: { label: "out", kind: "path", mode: "write", "default": "flow.picked", description: "Scope path receiving the selected fields." }
				},
				description: "Builds an object from selected fields."
			};
		},

		displayName: function (node) {
			var source = flowSummary.prop(node, "source") || "object";
			var selected = flowSummary.prop(node, "keys") || "keys";
			return flowSummary.output(node, flowSummary.text(source + " pick " + selected));
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addPath(props.out);
		},

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
