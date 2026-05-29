(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		name: "json.parse",

		catalog: function () {
			return {
				name: "json.parse",
				icon: "mdi:code-json",
				props: {
					text: { label: "text", kind: "template", type: "string", "default": "{{ flow.text }}", description: "JSON text to parse." },
					out: { label: "out", kind: "path", mode: "write", "default": "flow.json", description: "Scope path receiving the parsed value." }
				},
				description: "Parses JSON text into a native value."
			};
		},

		displayName: function (node) {
			var text = flowSummary.text(prop(node, "text") || "json");
			return flowSummary.output(node, text);
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addPath(props.out);
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			var text = ctx.template(props.text);
			if (typeof text !== "string") {
				return text;
			}
			return JSON.parse(text);
		}
	};
}())
