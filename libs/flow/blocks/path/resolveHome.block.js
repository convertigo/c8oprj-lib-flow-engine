const _meta = {
  "version": 1,
  "icon": "mdi:folder-home-outline",
  "tags": [
    "resource"
  ],
  "description": "Resolves a home-relative filesystem path.",
  "properties": {
    "path": {
      "label": "path",
      "kind": "template",
      "type": "string",
      "default": "~",
      "description": "Base path. Supports ~ and ~/ prefixes."
    },
    "suffix": {
      "label": "suffix",
      "kind": "template",
      "type": "string",
      "description": "Optional child path appended after the base path is resolved."
    },
    "out": {
      "label": "out",
      "kind": "path",
      "mode": "write",
      "default": "local.path",
      "description": "Scope path receiving the canonical absolute path."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "resolveHome.hooks.js"
  }
}

(function () {
	var File = Packages.java.io.File;
	var System = Packages.java.lang.System;

	function trim(value) {
		return value == null ? "" : String(value).trim();
	}

	function resolve(path, suffix) {
		var raw = trim(path) || "~";
		var home = trim(System.getProperty("user.home"));
		if (raw === "~") {
			raw = home;
		} else if (raw.indexOf("~/") === 0 || raw.indexOf("~\\") === 0) {
			raw = home + raw.substring(1);
		}
		var file = new File(raw);
		if (trim(suffix)) {
			file = new File(file, trim(suffix));
		}
		return String(file.getCanonicalFile().getAbsolutePath());
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			return resolve(ctx.template(props.path || "~"), ctx.template(props.suffix || ""));
		}
	};
}())
