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
		name: "flow.schema.reset",
		private: true,

		catalog: function () {
			return {
				name: "flow.schema.reset",
				"package": "core",
				namespace: "flow",
				private: true,
				icon: "mdi:database-refresh-outline",
				props: {
					flowName: { label: "flowName", kind: "text", type: "string", description: "Flow sidecar name." },
					name: { label: "name", kind: "text", type: "string", description: "Alias for flowName." },
					node: { label: "node", kind: "text", type: "string", description: "Optional node id." },
					property: { label: "property", kind: "text", type: "string", description: "Optional output property." },
					projectDir: { label: "projectDir", kind: "text", type: "string", description: "Optional project directory override." },
					out: { label: "out", kind: "path", mode: "write", description: "Scope path receiving reset status." }
				},
				description: "Deletes learned Flow schema files so the next run learns them again."
			};
		},

		displayName: function () {
			return "reset flow schema";
		},

		analyze: function (ctx, node) {
			var out = ctx.props(node).out;
			if (out) {
				ctx.addPath(out);
			}
		},

		run: function (ctx, node) {
			return ctx.schemaReset(argsFrom(ctx.props(node)));
		}
	};
}())
