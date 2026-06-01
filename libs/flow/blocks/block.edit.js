(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		name: "block.edit",
		private: true,

		displayName: function (node) {
			return "edit block " + (prop(node, "name") || "");
		},

		analyze: function (ctx, node) {
			var out = ctx.props(node).out;
			if (out) {
				ctx.addPath(out);
			}
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			return ctx.blockEdit(props.name, props, props);
		}
	};
}())
