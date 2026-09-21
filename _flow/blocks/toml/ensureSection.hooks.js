(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		displayName: function (node) {
			return "ensure [" + flowSummary.text(prop(node, "section") || "section") + "]";
		}
	};
}())
