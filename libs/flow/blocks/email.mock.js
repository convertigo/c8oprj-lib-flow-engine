(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		name: "email.mock",

		catalog: function () {
			return {
				name: "email.mock",
				icon: "mdi:email-outline",
				props: {
					to: { kind: "template", type: "string", "default": "", description: "Recipient email address template." },
					subject: { kind: "template", type: "string", "default": "", description: "Email subject template." },
					body: { kind: "template", type: "string", "default": "", description: "Email body template." },
					out: { kind: "path", mode: "write", "default": "flow.email", description: "Scope path receiving the mock send result." }
				},
				description: "Creates a mock email result without sending anything."
			};
		},

		displayName: function (node) {
			var to = prop(node, "to");
			return to ? "to " + flowSummary.text(to) : "email.mock";
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addPath(props.out);
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			return {
				sent: true,
				to: ctx.template(props.to),
				subject: ctx.template(props.subject),
				body: ctx.template(props.body)
			};
		}
	};
}())
