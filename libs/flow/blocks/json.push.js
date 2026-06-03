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
			var value = node.nodes && node.nodes.length ? ctx.runNodes(node.nodes) : ctx.input(props);
			array.push(value);
			return array;
		}
	};
}())
