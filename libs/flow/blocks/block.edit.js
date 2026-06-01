(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		name: "block.edit",
		private: true,

		catalog: function () {
			return {
				name: "block.edit",
				"package": "core",
				namespace: "block",
				private: true,
				icon: "mdi:puzzle-edit-outline",
				props: {
					name: { label: "name", kind: "text", type: "string", description: "Project-local Flow block name." },
					source: { label: "source", kind: "text", type: "string", description: "Replacement Rhino ES6 JavaScript block source." },
					projectDir: { label: "projectDir", kind: "text", type: "string", description: "Optional project directory override." },
					out: { label: "out", kind: "path", mode: "write", description: "Scope path receiving edit result." }
				},
				description: "Replaces one project-local Flow block source."
			};
		},

		displayName: function (node) {
			return "edit block " + (prop(node, "name") || "");
		},

		analyze: function (ctx, node) {
			var out = ctx.props(node).out;
			if (out) {
				ctx.addPath(out);
			}
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			return ctx.blockEdit(props.name, props.source || "", props);
		}
	};
}())
