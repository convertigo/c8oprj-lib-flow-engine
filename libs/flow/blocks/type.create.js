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
			return ctx.typeCreate(props.name, {
				descriptorSource: props.descriptorSource || "",
				projectDir: props.projectDir
			}, bool(props.overwrite), props);
		}
	};
}())
