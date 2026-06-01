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

		catalog: function () {
			return {
				name: "flow.run",
				"package": "core",
				namespace: "flow",
				private: true,
				icon: "mdi:play-circle-outline",
				props: {
					flowSource: { label: "flowSource", kind: "text", type: "string", description: "Flow YAML source to run." },
					definition: { label: "definition", kind: "literal", type: "object", description: "Flow definition object to run." },
					input: { label: "input", kind: "template", type: "object", description: "Input scope." },
					config: { label: "config", kind: "template", type: "object", description: "Config scope override." },
					includeFlow: { label: "includeFlow", kind: "literal", type: "boolean", description: "Include final flow scope in the response." },
					includeTrace: { label: "includeTrace", kind: "literal", type: "boolean", description: "Include execution trace in the response." },
					projectDir: { label: "projectDir", kind: "text", type: "string", description: "Optional project directory override." },
					out: { label: "out", kind: "path", mode: "write", description: "Scope path receiving execution result." }
				},
				description: "Runs a Flow source or definition."
			};
		},

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
