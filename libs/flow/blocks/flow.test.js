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
		name: "flow.test",
		private: true,

		catalog: function () {
			return {
				name: "flow.test",
				"package": "core",
				namespace: "flow",
				private: true,
				icon: "mdi:test-tube",
				props: {
					name: { label: "name", kind: "text", type: "string", description: "Project Flow sidecar name." },
					flowName: { label: "flowName", kind: "text", type: "string", description: "Alias for name." },
					flowSource: { label: "flowSource", kind: "text", type: "string", description: "Flow YAML source to run." },
					definition: { label: "definition", kind: "literal", type: "object", description: "Flow definition object to run." },
					input: { label: "input", kind: "template", type: "object", description: "Input scope." },
					config: { label: "config", kind: "template", type: "object", description: "Config scope override." },
					includeFlow: { label: "includeFlow", kind: "literal", type: "boolean", description: "Include final flow scope in the response." },
					includeTrace: { label: "includeTrace", kind: "literal", type: "boolean", description: "Include execution trace in the response." },
					projectDir: { label: "projectDir", kind: "text", type: "string", description: "Optional project directory override." },
					out: { label: "out", kind: "path", mode: "write", description: "Scope path receiving execution result." }
				},
				description: "Runs a named project Flow sidecar, source or definition."
			};
		},

		displayName: function (node) {
			return "test flow " + (prop(node, "name") || prop(node, "flowName") || "");
		},

		analyze: function (ctx, node) {
			var out = ctx.props(node).out;
			if (out) {
				ctx.addPath(out);
			}
		},

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
