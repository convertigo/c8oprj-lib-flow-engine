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
			delete execution.local;
		}
		if (!include(props.includeTrace)) {
			delete execution.trace;
		}
		return execution;
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			return cleanup(ctx.runFlowSource(props.flowSource || "", props.config || {}, {
				input: props.input || {},
				project: props.project,
				projectDir: props.projectDir,
				definition: props.definition,
				includeFlow: include(props.includeFlow),
				includeTrace: include(props.includeTrace)
			}), props);
		}
	};
}())
