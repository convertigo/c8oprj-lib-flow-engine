const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "description": "Splits text into clean lines.",
  "summary": "lines of {{text}}",
  "targets": [
    "backend",
    "frontend",
  ],
  "effects": [],
  "implementations": {
    "backend": {
      "runtime": "rhino",
    },
    "frontend": {
      "runtime": "browser",
      "file": "lines.browser.js",
    },
  },
  "icon": "mdi:format-list-text",
  "properties": {
    "text": {
      "label": "Text",
      "kind": "template",
      "type": "string",
      "default": "${local.text}",
      "description": "Text to split. Scope paths such as local.execution.stdout are accepted.",
    },
    "trim": {
      "label": "Trim lines",
      "category": "Expert",
      "kind": "expression",
      "type": "boolean",
      "default": true,
      "description": "Trim whitespace around each returned line.",
    },
    "skipEmpty": {
      "label": "Skip empty lines",
      "category": "Expert",
      "kind": "expression",
      "type": "boolean",
      "default": true,
      "description": "Remove empty lines after optional trimming.",
    },
  },
  "outputs": {
    "out": {
      "type": "array",
      "items": {
        "type": "string",
      },
    },
  },
  "runtime": "rhino",
  "tags": [
    "text",
    "lines",
    "split",
    "stdout",
    "process",
  ],
}

// Use Rhino 1.9.0 features: https://mozilla.github.io/rhino/compat/engines.html
(function () {
  function bool(ctx, value, fallback) {
    if (value === undefined || value === null || value === "") {
      return fallback
    }
    if (typeof value === "boolean") {
      return value
    }
    var resolved = typeof value === "string" ? ctx.expr(value) : value
    if (typeof resolved === "boolean") {
      return resolved
    }
    var lowered = String(resolved || "").toLowerCase()
    return lowered === "true" || lowered === "1" || lowered === "yes"
  }

  function text(ctx, value) {
    if (value === undefined || value === null) {
      return ""
    }
    // A bare scope path written as the value (local.text, the former spelling of ${local.text}) is read; the text a
    // template gives is data and stays as it is
    if (typeof value === "string" && !/\$\{|\{\{/.test(value) && /^(input|local|config|current|result)(?:\.|\[)/.test(value.trim())) {
      var evaluated = ctx.expr(value.trim())
      return evaluated === undefined || evaluated === null ? "" : String(evaluated)
    }
    var rendered = String(ctx.template(value))
    if (rendered === "undefined" || rendered === "null") {
      return ""
    }
    return rendered
  }

  return {
    run: function (ctx, node) {
      var props = ctx.props(node)
      var source = text(ctx, props.text || props.value || props.source)
      var trim = bool(ctx, props.trim, true)
      var skipEmpty = bool(ctx, props.skipEmpty, true)
      var raw = String(source || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
      var lines = []
      for (var i = 0; i < raw.length; i++) {
        var line = trim ? raw[i].trim() : raw[i]
        if (skipEmpty && line.length === 0) {
          continue
        }
        lines.push(line)
      }
      return lines
    },
		debug: {
			resolve: function (ctx, node) {
				var p = ctx.props(node);
				return {
					text: text(ctx, p.text || p.value || p.source),
					trim: bool(ctx, p.trim, true),
					skipEmpty: bool(ctx, p.skipEmpty, true)
				};
			},
			run: function (ctx, node, args) {
				var raw = String(args.text || "")
						.replace(/\r\n/g, "\n")
						.replace(/\r/g, "\n")
						.split("\n"),
					lines = [];
				for (var i = 0; i < raw.length; i++) {
					var line = args.trim ? raw[i].trim() : raw[i];
					if (args.skipEmpty && line.length === 0) continue;
					lines.push(line);
				}
				return lines;
			}
		}
	}
}())
