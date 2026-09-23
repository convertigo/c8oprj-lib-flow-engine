const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "private": true,
  "icon": "mdi:cached-off",
  "tags": [
    "cache",
    "runtime",
    "diagnostic",
  ],
  "description": "Debug only: clears Flow Engine runtime descriptor caches and returns fresh diagnostics when automatic invalidation is suspected stale.",
  "properties": {
  },
  "outputs": {
    "out": {
      "type": "object",
      "properties": {
        "runtimeId": {
          "type": "string",
        },
        "startedAt": {
          "type": "string",
        },
        "threadName": {
          "type": "string",
        },
        "engineDir": {
          "type": "string",
        },
        "activeProjectDir": {
          "type": "string",
        },
        "caches": {
          "type": "object",
        },
      },
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "clear.hooks.js",
  },
}

(function () {
	function clearBridgeCaches() {
		try {
			var bridge = Packages.com.twinsoft.convertigo.engine.flow.FlowEngineBridge;
			if (bridge && typeof bridge.clearCaches === "function") {
				bridge.clearCaches();
				return true;
			}
		} catch (e) {
		}
		return false;
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var info = ctx.cacheClear();
			info.bridgeCachesCleared = clearBridgeCaches();
			ctx.write(ctx.outputPath(node) || "local.cache", info);
			return info;
		}
	};
}())
