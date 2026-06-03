(function () {
	function isObject(value) {
		return value && Object.prototype.toString.call(value) === "[object Object]";
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var target = ctx.scopes.local.__jsonTarget;
			if (!isObject(target)) {
				ctx.raise("JSON_TARGET_REQUIRED", "json.field must run inside json.object.");
			}
			var value = node.nodes && node.nodes.length ? ctx.runNodes(node.nodes) : ctx.input(props, null);
			target[String(props.key || "field")] = value;
			return value;
		}
	};
}())
