(function () {
	function comparable(value) {
		if (typeof value === "string" && value.trim() !== "") {
			var number = Number(value);
			if (!isNaN(number)) {
				return number;
			}
		}
		return value === undefined || value === null ? "" : value;
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var items = (ctx.expr(props.items || props["in"]) || []).slice(0);
			var previous = ctx.scopes.current;
			var direction = String(props.direction || props.order || "asc").toLowerCase() === "desc" ? -1 : 1;
			var by = props.by === undefined ? "current" : props.by;
			items.sort(function (a, b) {
				ctx.scopes.current = a;
				var left = comparable(ctx.expr(by));
				ctx.scopes.current = b;
				var right = comparable(ctx.expr(by));
				if (left < right) {
					return -1 * direction;
				}
				if (left > right) {
					return direction;
				}
				return 0;
			});
			ctx.scopes.current = previous;
			return items;
		}
	};
}())
