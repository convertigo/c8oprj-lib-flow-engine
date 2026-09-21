(function () {
	// Immutable path factory. Java supplies the live bootstrap selection;
	// current is the standalone default and therefore follows the committed
	// canonical source root. No directory sniffing or per-request dialect.
	function create(layout) {
		if (layout !== "legacy" && layout !== "_flow") {
			throw new Error("Unknown Flow source layout: " + layout);
		}
		var root = layout === "_flow" ? "_flow" : "libs/flow";
		return Object.freeze({
			root: root,
			flows: layout === "_flow" ? "_flow/flows" : "libs/flows",
			path: function (relative) {
				var text = String(relative || "");
				if (!text) return root;
				if (/^(?:\/|[A-Za-z]:)|\\/.test(text) || text.split("/").some(function (part) {
					return !part || part === "." || part === "..";
				})) {
					throw new Error("Expected a Flow-root-relative path: " + text);
				}
				return root + "/" + text;
			}
		});
	}
	return Object.freeze({ current: create("_flow"), create: create });
}())
