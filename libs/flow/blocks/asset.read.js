(function () {
	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var path = String(ctx.template(props.path || "") || "");
			var resource = ctx.resourceGet({
				path: path,
				allowLarge: props.allowLarge === true
			});
			return resource.content || "";
		}
	};
}())
