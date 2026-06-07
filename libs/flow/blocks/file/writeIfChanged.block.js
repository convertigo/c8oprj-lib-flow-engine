const _meta = {
  "version": 1,
  "icon": "mdi:file-sync-outline",
  "tags": [
    "resource"
  ],
  "description": "Writes a text file only when its content changed.",
  "longDescription": "Creates parent directories, compares existing text and returns created, updated or unchanged. Use dryRun to preview without writing.",
  "properties": {
    "path": {
      "label": "path",
      "kind": "template",
      "type": "string",
      "default": "~/file.txt",
      "description": "Absolute path or home-relative path receiving the content."
    },
    "content": {
      "label": "content",
      "kind": "value",
      "type": "unknown",
      "default": "",
      "description": "Text content to write."
    },
    "dryRun": {
      "label": "dryRun",
      "kind": "expression",
      "type": "boolean",
      "default": false,
      "description": "Preview the write without touching the file."
    },
    "out": {
      "label": "out",
      "kind": "path",
      "mode": "write",
      "default": "local.fileWrite",
      "description": "Scope path receiving write status."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "writeIfChanged.hooks.js"
  }
}

(function () {
	var File = Packages.java.io.File;
	var Files = Packages.java.nio.file.Files;
	var StandardCharsets = Packages.java.nio.charset.StandardCharsets;
	var StandardOpenOption = Packages.java.nio.file.StandardOpenOption;
	var System = Packages.java.lang.System;

	function trim(value) {
		return value == null ? "" : String(value).trim();
	}

	function bool(value) {
		return value === true || String(value).toLowerCase() === "true";
	}

	function resolvePath(path) {
		var raw = trim(path);
		var home = trim(System.getProperty("user.home"));
		if (raw === "~") {
			raw = home;
		} else if (raw.indexOf("~/") === 0 || raw.indexOf("~\\") === 0) {
			raw = home + raw.substring(1);
		}
		return new File(raw).getCanonicalFile();
	}

	function readText(file) {
		if (!file || !file.isFile()) {
			return "";
		}
		return String(new java.lang.String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8));
	}

	function writeText(file, text) {
		Files.createDirectories(file.getParentFile().toPath());
		Files.write(
			file.toPath(),
			new java.lang.String(String(text == null ? "" : text)).getBytes(StandardCharsets.UTF_8),
			StandardOpenOption.CREATE,
			StandardOpenOption.TRUNCATE_EXISTING,
			StandardOpenOption.WRITE
		);
	}

	function textValue(ctx, value) {
		if (value === undefined || value === null) {
			return "";
		}
		if (ctx.isHandle && ctx.isHandle(value)) {
			return JSON.stringify(ctx.handleSummary(value));
		}
		if (Object.prototype.toString.call(value) === "[object Array]" ||
				Object.prototype.toString.call(value) === "[object Object]") {
			return JSON.stringify(value, null, 2);
		}
		return String(value);
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var file = resolvePath(ctx.template(props.path || ""));
			var previous = readText(file);
			var content = textValue(ctx, props.content !== undefined ? ctx.template(props.content) : ctx.input(props, ""));
			var existed = file.isFile();
			var changed = previous !== content;
			var dryRun = bool(ctx.expr(props.dryRun));
			if (changed && !dryRun) {
				writeText(file, content);
			}
			return {
				path: String(file.getAbsolutePath()),
				status: changed ? (existed ? "updated" : "created") : "unchanged",
				existed: existed,
				changed: changed,
				dryRun: dryRun
			};
		}
	};
}())
