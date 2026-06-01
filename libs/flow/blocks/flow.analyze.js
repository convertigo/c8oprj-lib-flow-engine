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

	return {
		name: "flow.analyze",
		private: true,

		catalog: function () {
			return {
				name: "flow.analyze",
				"package": "core",
				namespace: "flow",
				private: true,
				icon: "mdi:chart-timeline-variant",
				props: {
					flowSource: { label: "flowSource", kind: "text", type: "string", description: "Flow YAML source to analyze." },
					definition: { label: "definition", kind: "literal", type: "object", description: "Flow definition object to analyze." },
					projectDir: { label: "projectDir", kind: "text", type: "string", description: "Optional project directory override." },
					out: { label: "out", kind: "path", mode: "write", description: "Scope path receiving reads, writes and nodes." }
				},
				description: "Analyzes a Flow source or definition."
			};
		},

		displayName: function () {
			return "analyze flow";
		},

		analyze: function (ctx, node) {
			var out = ctx.props(node).out;
			if (out) {
				ctx.addPath(out);
			}
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			return ctx.analyzeFlowSource(props.flowSource || "", argsFrom(props));
		}
	};
}())
