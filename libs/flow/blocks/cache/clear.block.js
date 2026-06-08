const _meta = {
  "version": 1,
  "private": true,
  "icon": "mdi:cached-off",
  "tags": [
    "cache",
    "runtime",
    "diagnostic"
  ],
  "description": "Clears Flow Engine runtime descriptor caches and returns fresh diagnostics.",
  "properties": {
    "out": {
      "label": "out",
      "kind": "path",
      "mode": "write",
      "default": "local.cache",
      "description": "Scope path receiving cache diagnostics after clear."
    }
  },
  "outputs": {
    "out": {
      "type": "object",
      "properties": {
        "runtimeId": {
          "type": "string"
        },
        "startedAt": {
          "type": "string"
        },
        "threadName": {
          "type": "string"
        },
        "engineDir": {
          "type": "string"
        },
        "activeProjectDir": {
          "type": "string"
        },
        "caches": {
          "type": "object"
        }
      }
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "clear.hooks.js"
  }
}

(function () {
	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var info = ctx.cacheClear();
			ctx.write(props.out || "local.cache", info);
			return info;
		}
	};
}())
