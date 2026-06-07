(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		displayName: function (node) {
			var path = prop(node, "path") || "~";
			var suffix = prop(node, "suffix");
			return "resolve " + flowSummary.text(suffix ? path + "/" + suffix : path);
		}
	};
}())
