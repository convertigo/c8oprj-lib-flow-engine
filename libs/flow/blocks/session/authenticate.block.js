const _meta = {
  "version": 1,
  "icon": "mdi:account-check-outline",
  "tags": [
    "session",
    "authentication",
    "fullsync",
    "acl"
  ],
  "description": "Sets the authenticated Convertigo user for the current HTTP session. An empty user clears the identity.",
  "properties": {
    "user": {
      "label": "user",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Authenticated user id. An empty value logs the current session out."
    },
    "out": {
      "label": "out",
      "kind": "path",
      "mode": "write",
      "description": "Optional scope path receiving the authenticated user id, or null after logout."
    }
  },
  "outputs": {
    "out": {
      "type": ["string", "null"]
    }
  },
  "runtime": "rhino"
}

(function () {
	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var user = String(ctx.template(props.user || "")).trim();
			var context = ctx.convertigoContext();
			if (user) {
				context.setAuthenticatedUser(user);
				return String(context.getAuthenticatedUser() || user);
			}
			context.removeAuthenticatedUser();
			return null;
		}
	};
}())
