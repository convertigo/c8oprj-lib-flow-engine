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
		if (!hasDefinition && !hasSource && args.name && String(args.target || "flow") === "flow") {
			var flow = ctx.flowGet(args.name, args);
			args.flowSource = flow.source;
			if (!args.flowName) {
				args.flowName = args.name;
			}
		}
		return args;
	}

	return {
		name: "flow.tree",
		private: true,

		catalog: function () {
			return {
				name: "flow.tree",
				"package": "core",
				namespace: "flow",
				private: true,
				icon: "mdi:file-tree-outline",
				props: {
					target: { label: "target", kind: "text", type: "string", description: "Tree target: flow or engine. Defaults to flow." },
					name: { label: "name", kind: "text", type: "string", description: "Project Flow sidecar name." },
					flowSource: { label: "flowSource", kind: "text", type: "string", description: "Flow YAML source." },
					definition: { label: "definition", kind: "literal", type: "object", description: "Flow definition object." },
					engineSource: { label: "engineSource", kind: "text", type: "string", description: "FlowEngine YAML source." },
					engineQName: { label: "engineQName", kind: "text", type: "string", description: "Engine QName used for display." },
					projectDir: { label: "projectDir", kind: "text", type: "string", description: "Optional project directory override." },
					out: { label: "out", kind: "path", mode: "write", description: "Scope path receiving the virtual tree." }
				},
				description: "Describes the virtual Flow or FlowEngine tree."
			};
		},

		displayName: function () {
			return "describe flow tree";
		},

		analyze: function (ctx, node) {
			var out = ctx.props(node).out;
			if (out) {
				ctx.addPath(out);
			}
		},

		run: function (ctx, node) {
			return ctx.describeTreeSource(withNamedFlowSource(ctx, argsFrom(ctx.props(node))));
		}
	};
}())
