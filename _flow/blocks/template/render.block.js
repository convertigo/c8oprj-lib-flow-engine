const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:text-box-edit-outline",
  "tags": [
    "text",
  ],
  "description": "Renders a text template with Flow expressions.",
  "summary": "render {{template}}",
  "longDescription": "Composes a text from a template literal such as `Hello ${input.name}`: each ${expression} is replaced by its value in the current Flow scopes; a template made of one expression keeps the type of its result. For an email or a document from a file, use template.freemarker.",
  "properties": {
    "template": {
      "label": "Template",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Template literal such as `Hello ${input.name}`; a quoted string stays text.",
    },
  },
  "outputs": {
    "out": {
      "type": "string",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "render.hooks.js",
  },
}

(function () {
	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			return ctx.template(props.template || "");
		}
	};
}())
