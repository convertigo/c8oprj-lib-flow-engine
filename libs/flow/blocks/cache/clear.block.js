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
			ctx.write(props.out || "local.cache", info);
			return info;
		}
	};
}())
