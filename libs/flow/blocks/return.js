(function () {
	return {
		name: "return",

		catalog: function () {
			return {
				name: "return",
				icon: "mdi:keyboard-return",
				props: {
					value: { label: "value", kind: "value", type: "unknown", "default": "{{ result }}", description: "Value returned by the flow. Use {{ expression }} for dynamic values." }
				},
				description: "Stops the Flow and returns a value. Without this block, result is returned implicitly.",
				longDescription: "Most flows do not need this block because result is returned at the end. Use it only to return early from a branch."
			};
		},

		displayName: function (node) {
			return flowSummary.input(node) || "result";
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			if (ctx.schemaForValue && ctx.addReturnSchema) {
				ctx.addReturnSchema(ctx.schemaForValue(props.value));
			}
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			return ctx.returnValue(ctx.input(props, ctx.read("result")));
		}
	};
}())
