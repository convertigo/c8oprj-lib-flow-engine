const _meta = {
  "version": 1,
  "private": true,
  "icon": "mdi:cached",
  "tags": [
    "cache",
    "runtime",
    "diagnostic"
  ],
  "description": "Returns Flow Engine runtime cache diagnostics.",
  "properties": {
    "out": {
      "label": "out",
      "kind": "path",
      "mode": "write",
      "default": "local.cache",
      "description": "Scope path receiving cache diagnostics."
    }
  },
  "outputs": {
    "out": {
      "type": "object",
      "properties": {
        "startedAt": {
          "type": "string"
        },
        "engineDir": {
          "type": "string"
        },
        "projectDir": {
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
    "file": "info.hooks.js"
  }
}

(function () {
	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var info = ctx.cacheInfo();
			ctx.write(props.out || "local.cache", info);
			return info;
		}
	};
}())
