(function () {
	return {
		displayName: function (node) {
			var props = node && node.props || {};
			return "block.code.patch " + (props.name || "block");
		}
	};
}())
