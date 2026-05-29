(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		name: "json.stringify",

		catalog: function () {
			return {
				name: "json.stringify",
				icon: "mdi:code-json",
				props: {
					value: { label: "value", kind: "value", type: "unknown", "default": "{{ flow.value }}", description: "Value to serialize as JSON." },
					pretty: { label: "pretty", kind: "literal", type: "boolean", "default": false, description: "Write indented JSON when true." },
					out: { label: "out", kind: "path", mode: "write", "default": "flow.text", description: "Scope path receiving the JSON text." }
				},
				description: "Serializes a native value as JSON text."
			};
		},

		displayName: function (node) {
			var value = flowSummary.value(node) || flowSummary.text("value");
			return flowSummary.output(node, value);
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addPath(props.out);
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			return JSON.stringify(ctx.input(props), null, props.pretty === true ? 2 : 0);
		}
	};
}())
