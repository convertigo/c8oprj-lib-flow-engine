(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var text = ctx.template(props.text);
			if (typeof text !== "string") {
				return text;
			}
			return JSON.parse(text);
		}
	};
}())
