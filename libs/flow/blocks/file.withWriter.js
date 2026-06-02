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
		run: function (ctx, node) {
			var props = ctx.props(node);
			var file = resolveFile(ctx, props.path || props.file);
			var parent = file.getParentFile();
			if (parent) {
				parent.mkdirs();
			}
			var writer = new BufferedWriter(new OutputStreamWriter(
				new FileOutputStream(file, boolValue(props.append, false)),
				String(props.charset || "UTF-8")
			));
			var handle = ctx.createHandle("file.writer", writer, {
				label: String(file.getAbsolutePath()),
				close: function (value) {
					value.close();
				}
			});
			ctx.write(props.as || "local.writer", handle);
			try {
				ctx.runNodes(node.nodes || []);
			} finally {
				ctx.closeHandle(handle);
			}
			return ctx.handleSummary(handle);
		}
	};
}())
