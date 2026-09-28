const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:web",
  "tags": [
    "http",
    "network",
    "delete",
    "shortcut",
  ],
  "description": "Shortcut for http.request with method DELETE.",
  "summary": "DELETE {{url}}",
  "outputs": {
    "out": {
      "type": "object",
      "properties": {
        "status": {
          "type": "integer",
        },
        "contentType": {
          "type": "string",
        },
        "headers": {
          "type": "object",
        },
        "body": {
          "type": "unknown",
        },
        "text": {
          "type": "string",
        },
      },
    },
  },
  "properties": {
    "url": {
      "label": "URL",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "HTTP URL template to call.",
    },
    "query": {
      "label": "Query parameters",
      "kind": "template",
      "type": "object",
      "description": "Optional query parameters object.",
    },
    "headers": {
      "label": "Headers",
      "kind": "template",
      "type": "object",
      "description": "Optional HTTP headers object.",
    },
    "body": {
      "label": "Body",
      "kind": "expression",
      "type": "unknown",
      "description": "Optional request body expression.",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "delete.hooks.js",
  },
}

(function () {
	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			return ctx.callBlock("http.request", {
				method: "DELETE",
				url: ctx.template(props.url),
				query: ctx.template(props.query),
				headers: ctx.template(props.headers),
				body: props.body === undefined ? undefined : ctx.expr(props.body),
				bodyResolved: props.body !== undefined
			}, {
				out: ctx.outputPath(node),
				id: node.id || "request"
			});
		}
	};
}())
