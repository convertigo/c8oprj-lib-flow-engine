const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:account-key-outline",
  "tags": [
    "session",
    "authentication",
    "fullsync",
    "acl",
  ],
  "description": "Reads the authenticated Convertigo user from the current HTTP session.",
  "summary": "authenticated user",
  "properties": {
  },
  "outputs": {
    "out": {
      "type": [
        "string",
        "null",
      ],
    },
  },
  "runtime": "rhino",
}

(function () {
	return {
		run: function (ctx) {
			var user = ctx.convertigoContext().getAuthenticatedUser();
			return user === null || user === undefined || String(user) === "" ? null : String(user);
		}
	};
}())
