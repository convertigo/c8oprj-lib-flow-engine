(function () {
	function argsFrom(props) {
		var args = {};
		Object.keys(props || {}).forEach(function (key) {
			if (key !== "out") {
				args[key] = props[key];
			}
		});
		return args;
	}

	function withNamedFlowSource(ctx, args) {
		var hasDefinition = args.definition !== undefined && args.definition !== null;
		var hasSource = args.flowSource !== undefined && args.flowSource !== null && String(args.flowSource).trim() !== "";
		if (!hasDefinition && !hasSource && (args.name || args.flowName)) {
			var name = args.name || args.flowName;
			var flow = ctx.flowGet(name, args);
			args.flowSource = flow.source;
			if (!args.flowName) {
				args.flowName = name;
			}
		}
		return args;
	}

	return {
		displayName: function () {
			return "flow output schema";
		},

		analyze: function (ctx, node) {
			var out = ctx.props(node).out;
			if (out) {
				ctx.addPath(out);
			}
		}
	};
}())
