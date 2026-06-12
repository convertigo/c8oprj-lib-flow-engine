const _meta = {
  "version": 1,
  "icon": "mdi:web",
  "tags": [
    "http",
    "network",
    "post",
    "shortcut"
  ],
  "description": "Shortcut for http.request with method POST.",
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
    "file": "post.hooks.js"
  }
}

(function () {
	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			return ctx.callBlock("http.request", {
				method: "POST",
				url: props.url,
				query: props.query,
				headers: props.headers,
				body: props.body,
				out: props.out
			}, {
				id: node.id || "request"
			});
		}
	};
}())
