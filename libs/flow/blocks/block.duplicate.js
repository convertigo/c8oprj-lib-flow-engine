(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	function bool(value) {
		return value === true || String(value) === "true";
	}

	return {
		name: "block.duplicate",
		private: true,

		catalog: function () {
			return {
				name: "block.duplicate",
				"package": "core",
				namespace: "block",
				private: true,
				icon: "mdi:content-duplicate",
				props: {
					fromName: { label: "fromName", kind: "text", type: "string", description: "Source block name." },
					toName: { label: "toName", kind: "text", type: "string", description: "Project-local destination block name." },
					overwrite: { label: "overwrite", kind: "literal", type: "boolean", description: "Allow replacing an existing project-local block." },
					projectDir: { label: "projectDir", kind: "text", type: "string", description: "Optional project directory override." },
					out: { label: "out", kind: "path", mode: "write", description: "Scope path receiving duplicate result." }
				},
				description: "Duplicates one Flow block into a project-local block."
			};
		},

		displayName: function (node) {
			return "duplicate block " + (prop(node, "fromName") || "");
		},

		analyze: function (ctx, node) {
			var out = ctx.props(node).out;
			if (out) {
				ctx.addPath(out);
			}
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			return ctx.blockDuplicate(props.fromName, props.toName, bool(props.overwrite), props);
		}
	};
}())
