(function () {
	var File = Packages.java.io.File;
	var FileOutputStream = Packages.java.io.FileOutputStream;
	var OutputStreamWriter = Packages.java.io.OutputStreamWriter;
	var BufferedWriter = Packages.java.io.BufferedWriter;

	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	function boolValue(value, fallback) {
		if (value === undefined || value === null || value === "") {
			return fallback;
		}
		return value === true || String(value) === "true";
	}

	function resolveFile(ctx, value) {
		var path = String(ctx.template(value || ""));
		if (!path) {
			ctx.raise("MISSING_FILE_PATH", "file.withWriter requires path or file.");
		}
		var file = new File(path);
		if (!file.isAbsolute()) {
			file = new File(String(ctx.read("request.projectDir") || "."), path);
		}
		return file;
	}

	return {
		displayName: function (node) {
			return flowSummary.output({ out: prop(node, "as") }, flowSummary.text(prop(node, "path") || prop(node, "file") || "writer"));
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			var asPath = props.as || "local.writer";
			if (ctx.addOutputPath) {
				ctx.addOutputPath("as", asPath);
			} else {
				ctx.addPath(asPath);
			}
			if (ctx.addSchema) {
				ctx.addSchema(asPath, { type: "handle<file.writer>", handle: true });
			}
			ctx.visitNodes(node.nodes || []);
		}
	};
}())
