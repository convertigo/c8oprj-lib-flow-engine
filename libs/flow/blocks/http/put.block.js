const _meta = {
  "version": 1,
  "icon": "mdi:web",
  "tags": [
    "http",
    "network",
    "put",
    "shortcut"
  ],
  "description": "Shortcut for http.request with method PUT.",
  "outputs": {
    "out": {
      "type": "object",
      "properties": {
        "status": {
          "type": "integer"
        },
        "contentType": {
          "type": "string"
        },
        "body": {
          "type": "unknown"
        },
        "text": {
          "type": "string"
        }
      }
    }
  },
  "properties": {
    "url": {
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "HTTP URL template to call."
    },
    "query": {
      "kind": "template",
      "type": "object",
      "description": "Optional query parameters object."
    },
    "headers": {
      "kind": "template",
      "type": "object",
      "description": "Optional HTTP headers object."
    },
    "body": {
      "kind": "expression",
      "type": "unknown",
      "description": "Optional request body expression."
    },
    "out": {
      "kind": "path",
      "mode": "write",
      "default": "local.response",
      "description": "Scope path receiving status, contentType, body and text."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "put.hooks.js"
  }
}

(function () {
	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			return ctx.callBlock("http.request", {
				method: "PUT",
				url: ctx.template(props.url),
				query: ctx.template(props.query),
				headers: ctx.template(props.headers),
				body: props.body === undefined ? undefined : ctx.expr(props.body),
				bodyResolved: props.body !== undefined,
				out: props.out
			}, {
				id: node.id || "request"
			});
		}
	};
}())
