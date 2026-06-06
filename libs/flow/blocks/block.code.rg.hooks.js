(function () {
	return {
		displayName: function (node) {
			var props = node && node.props || {};
			return "block.code.rg " + (props.pattern || "");
		}
	};
}())
