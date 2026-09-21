(function () {
	return {
		displayName: function (node) {
			return "render template" + (node && node.out ? " -> " + node.out : "");
		}
	};
}())
