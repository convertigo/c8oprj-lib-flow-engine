const _meta = {
  "version": 1,
  "icon": "mdi:text-box-edit-outline",
  "tags": [
    "text"
  ],
  "description": "Renders a text template with Flow expressions.",
  "longDescription": "Replaces {{ expression }} placeholders with values from the current Flow scopes. An exact {{ expression }} keeps the native value type; mixed text produces a string.",
  "properties": {
    "template": {
      "label": "template",
      "kind": "text",
      "type": "string",
      "default": "",
      "description": "Template text containing optional {{ expression }} placeholders."
    },
    "out": {
      "label": "out",
      "kind": "path",
      "mode": "write",
      "default": "local.text",
      "description": "Scope path receiving the rendered text."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "render.hooks.js"
  }
}

(function () {
	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			return ctx.template(props.template || "");
		}
	};
}())
