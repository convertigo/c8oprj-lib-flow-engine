(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		name: "if",

		catalog: function () {
			return {
				name: "if",
				icon: "mdi:source-branch",
				kind: "control",
				props: {
					condition: { kind: "expression", type: "boolean", "default": "true", description: "Boolean expression deciding which branch runs." }
				},
				children: ["then", "else"],
				slots: [
					{ name: "then", label: "Then" },
					{ name: "else", label: "Else" }
				],
				description: "Runs then when condition is truthy, else otherwise."
			};
		},

		displayName: function (node) {
			var condition = prop(node, "condition");
			return condition ? "? " + flowSummary.text(condition) : "condition";
		},

		analyze: function (ctx, node) {
			ctx.visitNodes(node.then || []);
			ctx.visitNodes(node["else"] || []);
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			var ok = !!ctx.expr(props.condition);
			return ctx.runNodes(ok ? (node.then || []) : (node["else"] || []));
		}
	};
}())
