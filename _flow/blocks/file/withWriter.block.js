const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:file-edit-outline",
  "tags": [
    "resource",
  ],
  "description": "Opens a file writer handle, runs child nodes, then closes it.",
  "slots": [
    {
      "name": "nodes",
      "label": "Flow",
      "inline": true,
    },
  ],
  "uses": ["file-access"],
  "properties": {
    "unrestrictedPath": {"kind":"value","type":"boolean","default":false,"description":"Use a path outside _private/flow-data with explicit author permission."},
    "path": {
      "label": "File path",
      "kind": "template",
      "type": "string",
      "description": "File path under _private/flow-data. Relative paths resolve from the current project directory.",
    },
    "append": {
      "label": "Append",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Append to the file instead of replacing it.",
    },
    "charset": {
      "label": "Charset",
      "category": "Expert",
      "kind": "text",
      "type": "string",
      "default": "UTF-8",
      "description": "Writer charset.",
    },
    "as": {
      "label": "Writer handle",
      "kind": "path",
      "mode": "write",
      "default": "local.writer",
      "type": "handle<file.writer>",
      "description": "Scope path receiving the writer handle while child nodes run.",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "withWriter.hooks.js",
  },
  "children": [
    "nodes",
  ],
}

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

	function resolveFile(ctx, value, unrestricted) {
		var path = String(ctx.template(value || ""));
		if (!path) {
			ctx.raise("MISSING_FILE_PATH", "file.withWriter requires path.");
		}
		var file = ctx.lib("file-access").resolve(ctx, path, unrestricted === true);
		return file;
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var file = resolveFile(ctx, props.path, props.unrestrictedPath);
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
		},
		debug: {
			resolve: function (ctx, node) {
				var props = ctx.props(node);
				var file = resolveFile(ctx, props.path, props.unrestrictedPath);
				var capturedArguments = {
					path: String(file.getAbsolutePath()),
					charset: String(props.charset || "UTF-8"),
					as: props.as || "local.writer",
					append: boolValue(props.append, false)
				};
				Object.defineProperty(capturedArguments, "__state", { value: { props: props, file: file } });
				return capturedArguments;
			},
			run: function (ctx, node, args) {
				var capturedState = args.__state;
				var props = capturedState.props;
				var file = resolveFile(ctx, props.path, props.unrestrictedPath);
				var parent = file.getParentFile();
				if (parent) {
					parent.mkdirs();
				}
				var writer = new BufferedWriter(
					new OutputStreamWriter(
						new FileOutputStream(file, boolValue(props.append, false)),
						String(props.charset || "UTF-8")
					)
				);
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
		}
	};
}())
