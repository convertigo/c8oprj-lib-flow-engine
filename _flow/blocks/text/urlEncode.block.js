const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:link-variant",
  "tags": [
    "text",
    "url",
    "encode",
  ],
  "summary": "URL-encode {{text}}",
  "description": "Percent-encodes a value placed in a URL path segment or query parameter (UTF-8, as encodeURIComponent: letters, digits, - _ . ! ~ * ' ( ) kept). Use it for every value a user or a key supplies in a link; it does not encode a whole URL.",
  "properties": {
    "text": {
      "label": "Text",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Value to encode.",
    },
  },
  "outputs": {
    "out": {
      "type": "string",
    },
  },
  "runtime": "rhino",
}

(function () {
	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var rendered = props.text === undefined || props.text === null ? "" : ctx.template(props.text);
			var text = rendered === undefined || rendered === null ? "" : String(rendered);
			return encodeURIComponent(text);
		}
	};
}())
