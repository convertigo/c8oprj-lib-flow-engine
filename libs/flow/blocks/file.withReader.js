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
		name: "file.withReader",

		catalog: function () {
			return {
				name: "file.withReader",
				icon: "mdi:file-eye-outline",
				kind: "resource",
				props: {
					path: { label: "path", kind: "template", type: "string", description: "File path. Relative paths resolve from the current project directory." },
					file: { label: "file", kind: "template", type: "string", description: "Alias for path." },
					charset: { label: "charset", kind: "text", type: "string", "default": "UTF-8", description: "Reader charset." },
					as: { label: "as", kind: "path", mode: "write", "default": "local.reader", type: "handle<file.reader>", description: "Scope path receiving the reader handle while child nodes run." }
				},
				children: ["nodes"],
				slots: [
					{ name: "nodes", label: "Flow", inline: true }
				],
				description: "Opens a file reader handle, runs child nodes, then closes it."
			};
		},

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
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			var file = resolveFile(ctx, props.path || props.file);
			var reader = new BufferedReader(new InputStreamReader(
				new FileInputStream(file),
				String(props.charset || "UTF-8")
			));
			var handle = ctx.createHandle("file.reader", reader, {
				label: String(file.getAbsolutePath()),
				close: function (value) {
					value.close();
				}
			});
			ctx.write(props.as || "local.reader", handle);
			try {
				ctx.runNodes(node.nodes || []);
			} finally {
				ctx.closeHandle(handle);
			}
			return ctx.handleSummary(handle);
		}
	};
}())
