(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	function bool(value) {
		return value === true || String(value) === "true";
	}

	return {
		name: "block.duplicate",
		private: true,

		displayName: function (node) {
			return "duplicate block " + (prop(node, "fromName") || "");
		},

		analyze: function (ctx, node) {
			var out = ctx.props(node).out;
			if (out) {
				ctx.addPath(out);
			}
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			return ctx.blockDuplicate(props.fromName, props.toName, bool(props.overwrite), props);
		}
	};
}())
