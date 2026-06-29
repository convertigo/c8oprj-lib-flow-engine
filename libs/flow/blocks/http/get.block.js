const _meta = {
  "version": 1,
  "icon": "mdi:web",
  "tags": [
    "http",
    "network",
    "get",
    "shortcut"
  ],
  "description": "Shortcut for http.request with method GET.",
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
    "headers": {
      "kind": "template",
      "type": "object",
      "description": "Optional HTTP headers object."
    },
    "query": {
      "kind": "template",
      "type": "object",
      "description": "Optional query parameters object."
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
    "file": "get.hooks.js"
  }
}

(function () {
	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			return ctx.callBlock("http.request", {
				method: "GET",
				url: ctx.template(props.url),
				query: ctx.template(props.query),
				headers: ctx.template(props.headers),
				out: props.out
			}, {
				id: node.id || "request"
			});
		}
	};
}())
