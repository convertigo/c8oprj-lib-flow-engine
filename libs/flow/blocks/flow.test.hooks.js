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
		displayName: function (node) {
			return "test flow " + (prop(node, "name") || prop(node, "flowName") || "");
		},

		analyze: function (ctx, node) {
			var out = ctx.props(node).out;
			if (out) {
				ctx.addPath(out);
			}
		}
	};
}())
