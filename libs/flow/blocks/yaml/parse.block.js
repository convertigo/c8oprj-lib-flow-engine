const _meta = {
  "version": 1,
  "icon": "mdi:file-code-outline",
  "description": "Parses YAML text into a native value.",
  "longDescription": "Parses mappings, lists and scalars without creating Java objects. The result can be consumed directly by standard object and list blocks.",
  "targets": ["backend"],
  "effects": [],
  "implementations": { "backend": { "runtime": "rhino" } },
  "properties": {
    "text": {
      "label": "text",
      "kind": "template",
      "type": "string",
      "default": "{{ local.text }}",
      "description": "YAML text to parse."
    },
    "out": {
      "label": "out",
      "kind": "path",
      "mode": "write",
      "default": "local.yaml",
      "description": "Scope path receiving the parsed value."
    }
  },
  "outputs": {
    "out": {
      "type": "unknown"
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "parse.hooks.js"
  },
  "tags": [
    "yaml",
    "parse",
    "configuration"
  ]
}

(function () {
	function errorMessage(error) {
		var cause = error && error.javaException ? error.javaException : error;
		if (cause && typeof cause.getOriginalMessage === "function") {
			return String(cause.getOriginalMessage());
		}
		if (cause && typeof cause.getMessage === "function") {
			return String(cause.getMessage());
		}
		return String(error && error.message || error || "Invalid YAML");
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var text = ctx.template(props.text);
			if (typeof text !== "string") {
				return text;
			}
			try {
				var parsed = ctx.parseYaml(text);
				if (props.out && ctx.learnOutputSchema) {
					ctx.learnOutputSchema(node, "out", props.out, parsed);
				}
				return parsed;
			} catch (error) {
				ctx.raise("YAML_PARSE_ERROR", "YAML parse failed: " + errorMessage(error), node,
					"Check YAML indentation, collections and quoted values.");
			}
		}
	};
}())
