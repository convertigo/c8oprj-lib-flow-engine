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
		if (!hasDefinition && !hasSource && args.name) {
			var flow = ctx.flowGet(args.name, args);
			args.flowSource = flow.source;
			if (!args.flowName) {
				args.flowName = args.name;
			}
		}
		return args;
	}

	return {
		name: "flow.context",
		private: true,

		catalog: function () {
			return {
				name: "flow.context",
				"package": "core",
				namespace: "flow",
				private: true,
				icon: "mdi:graph-outline",
				props: {
					name: { label: "name", kind: "text", type: "string", description: "Project Flow sidecar name." },
					flowName: { label: "flowName", kind: "text", type: "string", description: "Alias for name." },
					flowSource: { label: "flowSource", kind: "text", type: "string", description: "Flow YAML source." },
					definition: { label: "definition", kind: "literal", type: "object", description: "Flow definition object." },
					node: { label: "node", kind: "text", type: "string", description: "Target node id." },
					path: { label: "path", kind: "text", type: "string", description: "Target virtual tree path." },
					property: { label: "property", kind: "text", type: "string", description: "Target property name." },
					mode: { label: "mode", kind: "text", type: "string", description: "Picker mode: read or write." },
					include: { label: "include", kind: "literal", type: "array", description: "Optional scope roots to include, such as flow or current." },
					detail: { label: "detail", kind: "text", type: "string", description: "normal or compact." },
					projectDir: { label: "projectDir", kind: "text", type: "string", description: "Optional project directory override." },
					out: { label: "out", kind: "path", mode: "write", description: "Scope path receiving visible paths." }
				},
				description: "Returns visible scope paths at a Flow node."
			};
		},

		displayName: function () {
			return "flow context";
		},

		analyze: function (ctx, node) {
			var out = ctx.props(node).out;
			if (out) {
				ctx.addPath(out);
			}
		},

		run: function (ctx, node) {
			return ctx.contextFlowSource(withNamedFlowSource(ctx, argsFrom(ctx.props(node))));
		}
	};
}())
