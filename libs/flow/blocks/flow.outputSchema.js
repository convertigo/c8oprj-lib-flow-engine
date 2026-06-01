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
		name: "flow.outputSchema",
		private: true,

		catalog: function () {
			return {
				name: "flow.outputSchema",
				"package": "core",
				namespace: "flow",
				private: true,
				icon: "mdi:code-json",
				props: {
					name: { label: "name", kind: "text", type: "string", description: "Project Flow sidecar name." },
					flowName: { label: "flowName", kind: "text", type: "string", description: "Alias for name." },
					flowSource: { label: "flowSource", kind: "text", type: "string", description: "Flow YAML source." },
					definition: { label: "definition", kind: "literal", type: "object", description: "Flow definition object." },
					projectDir: { label: "projectDir", kind: "text", type: "string", description: "Optional project directory override." },
					out: { label: "out", kind: "path", mode: "write", description: "Scope path receiving output schema." }
				},
				description: "Returns the best known JSON output schema for a Flow."
			};
		},

		displayName: function () {
			return "flow output schema";
		},

		analyze: function (ctx, node) {
			var out = ctx.props(node).out;
			if (out) {
				ctx.addPath(out);
			}
		},

		run: function (ctx, node) {
			return ctx.outputSchemaSource(withNamedFlowSource(ctx, argsFrom(ctx.props(node))));
		}
	};
}())
