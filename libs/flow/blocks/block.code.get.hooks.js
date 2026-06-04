(function () {
	return {
		displayName: function (node) {
			var props = node && node.props || node || {};
			return "block.code.get " + flowSummary.text(props.name || "block");
		}
	};
}())
