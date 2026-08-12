const _meta = {
  "version": 1,
  "icon": "mdi:account-key-outline",
  "tags": [
    "session",
    "authentication",
    "fullsync",
    "acl"
  ],
  "description": "Reads the authenticated Convertigo user from the current HTTP session.",
  "properties": {
    "out": {
      "label": "out",
      "kind": "path",
      "mode": "write",
      "default": "local.authenticatedUser",
      "description": "Scope path receiving the authenticated user id, or null when anonymous."
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
		run: function (ctx) {
			var user = ctx.convertigoContext().getAuthenticatedUser();
			return user === null || user === undefined || String(user) === "" ? null : String(user);
		}
	};
}())
