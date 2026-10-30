(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		displayName: function (node) {
			var to = prop(node, "to");
			return to ? "to " + flowSummary.text(to) : "email.mock";
		}
	};
}())
