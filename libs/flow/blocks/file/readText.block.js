const _meta = {
  "version": 1,
  "icon": "mdi:file-document-outline",
  "tags": [
    "resource"
  ],
  "description": "Reads a complete project text file with an explicit size limit.",
  "properties": {
    "path": {
      "label": "path",
      "kind": "template",
      "type": "string",
      "description": "File path. Relative paths resolve from the current project directory."
    },
    "charset": {
      "label": "charset",
      "kind": "text",
      "type": "string",
      "default": "UTF-8",
      "description": "Text charset."
    },
    "maxBytes": {
      "label": "maximum bytes",
      "kind": "literal",
      "type": "integer",
      "default": 16777216,
      "description": "Reject files larger than this limit before reading them."
    },
    "out": {
      "label": "out",
      "kind": "path",
      "mode": "write",
      "default": "local.text",
      "description": "Scope path receiving the complete text."
    }
  },
  "outputs": {
    "out": {
      "type": "string"
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "readText.hooks.js"
  }
}

(function () {
	var File = Packages.java.io.File;
	var Files = Packages.java.nio.file.Files;
	var Charset = Packages.java.nio.charset.Charset;

	function resolveFile(ctx, value) {
		var path = String(ctx.template(value || ""));
		if (!path) {
			ctx.raise("MISSING_FILE_PATH", "file.readText requires path.");
		}
		var file = new File(path);
		if (!file.isAbsolute()) {
			file = new File(String(ctx.read("request.projectDir") || "."), path);
		}
		file = file.getCanonicalFile();
		if (!file.isFile()) {
			ctx.raise("FILE_NOT_FOUND", "File not found: " + String(file.getAbsolutePath()));
		}
		return file;
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var file = resolveFile(ctx, props.path);
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
		}
	};
}())
