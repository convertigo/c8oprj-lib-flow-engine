(function () {
	return {
		displayName: function (node) {
			var props = node && node.props || node || {};
			return "block.code.set " + flowSummary.text(props.name || "block");
		}
	};
}())
