(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		name: "flow.get",
		private: true,

		displayName: function (node) {
			return "get flow " + (prop(node, "name") || prop(node, "flowName") || "");
		},

		analyze: function (ctx, node) {
			var out = ctx.props(node).out;
			if (out) {
				ctx.addPath(out);
			}
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			return ctx.flowGet(props.name || props.flowName || prop(node, "name"), props);
		}
	};
}())
