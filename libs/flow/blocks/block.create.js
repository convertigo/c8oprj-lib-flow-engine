(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	function bool(value) {
		return value === true || String(value) === "true";
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			return ctx.blockCreate(props.name, props, bool(props.overwrite), props);
		}
	};
}())
