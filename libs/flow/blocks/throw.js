(function () {
	return {
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
