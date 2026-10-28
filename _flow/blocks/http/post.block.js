const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:web",
  "tags": [
    "http",
    "network",
    "post",
    "shortcut",
  ],
  "description": "Shortcut for http.request with method POST.",
  "summary": "POST {{url}}",
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
      "category": "Expert",
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
    "username": {
      "label": "User name",
      "category": "Expert",
      "kind": "template",
      "type": "string",
      "description": "Optional user name sent with HTTP Basic authentication (preemptive).",
    },
    "password": {
      "label": "Password",
      "category": "Expert",
      "kind": "template",
      "type": "string",
      "description": "Password of the HTTP Basic authentication. Read it from config, never write it in the Flow.",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "post.hooks.js",
  },
}

(function () {
	return {
		// no state: every value of a call goes to http.request
		stateless: true,
		run: function (ctx, node) {
			var props = ctx.props(node);
			return ctx.callBlock("http.request", {
				method: "POST",
				url: ctx.template(props.url),
				query: ctx.template(props.query),
				headers: ctx.template(props.headers),
				username: props.username === undefined ? undefined : ctx.template(props.username),
				password: props.password === undefined ? undefined : ctx.template(props.password),
				body: props.body === undefined ? undefined : ctx.expr(props.body),
				bodyResolved: props.body !== undefined
			}, {
				out: ctx.outputPath(node),
				id: node.id || "request"
			});
		}
	};
}())
