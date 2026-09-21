(function () {
	return {
		displayName: function (node) {
			var props = node && node.props || node || {};
			return flowSummary.text(props.code || props.message || "error");
		}
	};
}())
