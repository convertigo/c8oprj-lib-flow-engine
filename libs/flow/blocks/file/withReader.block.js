const _meta = {
  "version": 1,
  "icon": "mdi:file-eye-outline",
  "tags": [
    "resource"
  ],
  "description": "Opens a file reader handle, runs child nodes, then closes it.",
  "slots": [
    {
      "name": "nodes",
      "label": "Flow",
      "inline": true
    }
  ],
  "properties": {
    "path": {
      "label": "path",
      "kind": "template",
      "type": "string",
      "description": "File path. Relative paths resolve from the current project directory."
    },
    "file": {
      "label": "file",
      "kind": "template",
      "type": "string",
      "description": "Alias for path."
    },
    "charset": {
      "label": "charset",
      "kind": "text",
      "type": "string",
      "default": "UTF-8",
      "description": "Reader charset."
    },
    "as": {
      "label": "as",
      "kind": "path",
      "mode": "write",
      "default": "local.reader",
      "type": "handle<file.reader>",
      "description": "Scope path receiving the reader handle while child nodes run."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "withReader.hooks.js"
  },
  "children": [
    "nodes"
  ]
}

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
