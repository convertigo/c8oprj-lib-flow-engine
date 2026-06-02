(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	function sessionString(value) {
		if (value === undefined || value === null) {
			return "";
		}
		return typeof value === "string" ? value : JSON.stringify(value);
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var value = sessionString(ctx.input(props));
			ctx.convertigoContext().httpSession.setAttribute(String(ctx.template(props.key || "")), value);
			return value;
		}
	};
}())
