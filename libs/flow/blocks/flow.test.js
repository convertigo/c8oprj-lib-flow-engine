(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	function argsFrom(props) {
		var args = {};
		Object.keys(props || {}).forEach(function (key) {
			if (key !== "out") {
				args[key] = props[key];
			}
		});
		return args;
	}

	function include(value) {
		return value === true || String(value) === "true";
	}

	function cleanup(execution, props) {
		if (!include(props.includeFlow)) {
			delete execution.flow;
		}
		if (!include(props.includeTrace)) {
			delete execution.trace;
		}
		return execution;
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var args = argsFrom(props);
			if (!args.name && args.flowName) {
				args.name = args.flowName;
			}
			if (!args.name) {
				args.name = prop(node, "name");
			}
			return cleanup(ctx.flowTest(args), props);
		}
	};
}())
