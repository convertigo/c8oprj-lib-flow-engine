(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var array = ctx.read(props.path);
			if (!array) {
				array = ctx.write(props.path, []);
			}
			array.push(ctx.input(props));
			return array;
		}
	};
}())
