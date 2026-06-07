(function () {
	var File = Packages.java.io.File;
	var FileInputStream = Packages.java.io.FileInputStream;
	var InputStreamReader = Packages.java.io.InputStreamReader;
	var BufferedReader = Packages.java.io.BufferedReader;

	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	function resolveFile(ctx, value) {
		var path = String(ctx.template(value || ""));
		if (!path) {
			ctx.raise("MISSING_FILE_PATH", "file.withReader requires path or file.");
		}
		var file = new File(path);
		if (!file.isAbsolute()) {
			file = new File(String(ctx.read("request.projectDir") || "."), path);
		}
		if (!file.isFile()) {
			ctx.raise("FILE_NOT_FOUND", "File not found: " + String(file.getAbsolutePath()));
		}
		return file;
	}

	return {
		displayName: function (node) {
			return flowSummary.output({ out: prop(node, "as") }, flowSummary.text(prop(node, "path") || prop(node, "file") || "reader"));
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			var asPath = props.as || "local.reader";
			if (ctx.addOutputPath) {
				ctx.addOutputPath("as", asPath);
			} else {
				ctx.addPath(asPath);
			}
			if (ctx.addSchema) {
				ctx.addSchema(asPath, { type: "handle<file.reader>", handle: true });
			}
			ctx.visitNodes(node.nodes || []);
		}
	};
}())
