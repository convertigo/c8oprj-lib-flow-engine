const _meta = {
  "version": 1,
  "icon": "mdi:email-outline",
  "description": "Creates a mock email result without sending anything.",
  "properties": {
    "to": {
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Recipient email address template."
    },
    "subject": {
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Email subject template."
    },
    "body": {
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Email body template."
    },
    "out": {
      "kind": "path",
      "mode": "write",
      "default": "local.email",
      "description": "Scope path receiving the mock send result."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "mock.hooks.js"
  }
}

(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			return {
				sent: true,
				to: ctx.template(props.to),
				subject: ctx.template(props.subject),
				body: ctx.template(props.body)
			};
		}
	};
}())
