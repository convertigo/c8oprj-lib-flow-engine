(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	function bool(value) {
		return value === true || String(value) === "true";
	}

	return {
		name: "block.create",
		private: true,

		catalog: function () {
			return {
				name: "block.create",
				"package": "core",
				namespace: "block",
				private: true,
				icon: "mdi:puzzle-plus-outline",
				props: {
					name: { label: "name", kind: "text", type: "string", description: "Project-local Flow block name." },
					source: { label: "source", kind: "text", type: "string", description: "Rhino ES6 JavaScript block source." },
					overwrite: { label: "overwrite", kind: "literal", type: "boolean", description: "Allow replacing an existing project-local block." },
					projectDir: { label: "projectDir", kind: "text", type: "string", description: "Optional project directory override." },
					out: { label: "out", kind: "path", mode: "write", description: "Scope path receiving creation result." }
				},
				description: "Creates one project-local Flow block."
			};
		},

		displayName: function (node) {
			return "create block " + (prop(node, "name") || "");
		},

		analyze: function (ctx, node) {
			var out = ctx.props(node).out;
			if (out) {
				ctx.addPath(out);
			}
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			return ctx.blockCreate(props.name, props.source || "", bool(props.overwrite), props);
		}
	};
}())
