(function () {
	return {
		name: "throw",

		catalog: function () {
			return {
				name: "throw",
				icon: "mdi:alert-circle-outline",
				props: {
					code: { kind: "text", type: "string", "default": "FLOW_THROW", description: "Structured error code." },
					message: { kind: "template", type: "string", "default": "Flow error", description: "Error message template." },
					status: { kind: "expression", type: "number", description: "Optional HTTP-style status code." },
					details: { kind: "literal", type: "object", description: "Optional structured error details." },
					hint: { kind: "template", type: "string", description: "Optional remediation hint template." }
				},
				description: "Stops the Flow with a structured error."
			};
		},

		displayName: function (node) {
			var props = node && node.props || node || {};
			return flowSummary.text(props.code || props.message || "error");
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			return ctx.throwFlow({
				code: props.code || "FLOW_THROW",
				message: ctx.template(props.message || "Flow error"),
				status: props.status === undefined ? undefined : ctx.expr(props.status),
				details: ctx.literal(props.details),
				hint: ctx.template(props.hint)
			}, node);
		}
	};
}())
