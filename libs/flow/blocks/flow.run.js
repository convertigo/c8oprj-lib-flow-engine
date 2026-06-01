(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
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
		name: "flow.run",
		private: true,

		displayName: function (node) {
			return "run flow " + (prop(node, "name") || prop(node, "flowName") || "");
		},

		analyze: function (ctx, node) {
			var out = ctx.props(node).out;
			if (out) {
				ctx.addPath(out);
			}
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			return cleanup(ctx.runFlowSource(props.flowSource || "", props.config || {}, {
				input: props.input || {},
				projectDir: props.projectDir,
				definition: props.definition,
				includeTrace: include(props.includeTrace)
			}), props);
		}
	};
}())
