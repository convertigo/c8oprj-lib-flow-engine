(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	function bool(value) {
		return value === true || String(value) === "true";
	}

	return {
		name: "type.create",
		private: true,

		catalog: function () {
			return {
				name: "type.create",
				"package": "core",
				namespace: "type",
				private: true,
				icon: "mdi:shape-plus-outline",
				props: {
					name: { label: "name", kind: "text", type: "string", description: "Project-local Flow property type name." },
					source: { label: "source", kind: "text", type: "string", description: "Replacement Rhino ES6 JavaScript type source." },
					overwrite: { label: "overwrite", kind: "literal", type: "boolean", description: "Allow replacing an existing project-local type." },
					projectDir: { label: "projectDir", kind: "text", type: "string", description: "Optional project directory override." },
					out: { label: "out", kind: "path", mode: "write", description: "Scope path receiving creation result." }
				},
				description: "Creates one project-local Flow property type."
			};
		},

		displayName: function (node) {
			return "create type " + (prop(node, "name") || "");
		},

		analyze: function (ctx, node) {
			var out = ctx.props(node).out;
			if (out) {
				ctx.addPath(out);
			}
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			return ctx.typeCreate(props.name, props.source || "", bool(props.overwrite), props);
		}
	};
}())
