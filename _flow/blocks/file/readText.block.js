const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:file-document-outline",
  "tags": [
    "resource",
  ],
  "description": "Reads a complete project text file with an explicit size limit.",
  "uses": ["file-access"],
  "properties": {
    "unrestrictedPath": {"kind":"value","type":"boolean","default":false,"description":"Use a path outside _private/flow-data with explicit author permission."},
    "path": {
      "label": "File path",
      "kind": "template",
      "type": "string",
      "description": "File path under _private/flow-data. Relative paths resolve from the current project directory.",
    },
    "charset": {
      "label": "Charset",
      "category": "Expert",
      "kind": "text",
      "type": "string",
      "default": "UTF-8",
      "description": "Text charset.",
    },
    "maxBytes": {
      "label": "Maximum size (bytes)",
      "category": "Expert",
      "kind": "literal",
      "type": "integer",
      "default": 16777216,
      "description": "Reject files larger than this limit before reading them.",
    },
  },
  "outputs": {
    "out": {
      "type": "string",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "readText.hooks.js",
  },
}

(function () {
	var File = Packages.java.io.File;
	var Files = Packages.java.nio.file.Files;
	var Charset = Packages.java.nio.charset.Charset;

	function resolveFile(ctx, value, unrestricted) {
		var path = String(ctx.template(value || ""));
		if (!path) {
			ctx.raise("MISSING_FILE_PATH", "file.readText requires path.");
		}
		var file = ctx.lib("file-access").resolve(ctx, path, unrestricted === true);
		if (!file.isFile()) {
			ctx.raise("FILE_NOT_FOUND", "File not found: " + String(file.getAbsolutePath()));
		}
		return file;
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var file = resolveFile(ctx, props.path, props.unrestrictedPath);
			var maxBytes = Number(props.maxBytes === undefined || props.maxBytes === null || props.maxBytes === ""
				? 16777216 : props.maxBytes);
			var size = Number(file.length());
			if (!isFinite(maxBytes) || maxBytes < 0 || Math.floor(maxBytes) !== maxBytes) {
				ctx.raise("INVALID_FILE_LIMIT", "file.readText maxBytes must be a non-negative integer.");
			}
			if (size > maxBytes) {
				ctx.raise("FILE_TOO_LARGE", "File exceeds file.readText maxBytes: " + size + " > " + maxBytes);
			}
			var bytes = Files.readAllBytes(file.toPath());
			return String(new java.lang.String(bytes, Charset.forName(String(props.charset || "UTF-8"))));
		},
		debug: {
			resolve: function (ctx, node) {
				var props = ctx.props(node);
				var file = resolveFile(ctx, props.path, props.unrestrictedPath);
				var maxBytes = Number(
					props.maxBytes === undefined || props.maxBytes === null || props.maxBytes === ""
						? 16777216
						: props.maxBytes
				);
				var size = Number(file.length());
				if (!isFinite(maxBytes) || maxBytes < 0 || Math.floor(maxBytes) !== maxBytes) {
					ctx.raise("INVALID_FILE_LIMIT", "file.readText maxBytes must be a non-negative integer.");
				}
				if (size > maxBytes) {
					ctx.raise("FILE_TOO_LARGE", "File exceeds file.readText maxBytes: " + size + " > " + maxBytes);
				}
				var capturedArguments = {
					path: String(file.getAbsolutePath()),
					charset: String(props.charset || "UTF-8"),
					maxBytes: maxBytes
				};
				Object.defineProperty(capturedArguments, "__state", { value: { props: props, file: file } });
				return capturedArguments;
			},
			run: function (ctx, node, args) {
				var capturedState = args.__state;
				var props = capturedState.props;
				var file = resolveFile(ctx, props.path, props.unrestrictedPath);
				var bytes = Files.readAllBytes(file.toPath());
				return String(new java.lang.String(bytes, Charset.forName(String(props.charset || "UTF-8"))));
			}
		}
	};
}())
