const _meta = {
  "version": 1,
  "private": true,
  "icon": "mdi:dots-vertical-circle-outline",
  "description": "Returns the dynamic authoring context menu for Flow Studio, MCP, and future clients.",
  "properties": {
    "targetObject": {
      "label": "targetObject",
      "kind": "literal",
      "type": "object",
      "description": "Focused virtual tree node. Defaults to the Svelte frontend builder."
    },
    "builder": {
      "label": "builder",
      "kind": "text",
      "type": "string",
      "default": "svelte",
      "description": "Frontend builder name."
    },
    "projectDir": {
      "label": "projectDir",
      "kind": "text",
      "type": "string",
      "description": "Optional project directory override."
    },
    "out": {
      "label": "out",
      "kind": "path",
      "mode": "write",
      "description": "Scope path receiving the context menu."
    }
  },
  "outputs": {
    "out": {
      "type": "object"
    }
  },
  "runtime": "rhino"
}

(function () {
	function argsFrom(props) {
		var args = {};
		Object.keys(props || {}).forEach(function (key) {
			if (key !== "out") {
				args[key] = props[key];
			}
		});
		return args;
	}

	function frontendTarget(args) {
		var builder = String(args.builder || "svelte");
		if (args.targetObject && typeof args.targetObject === "object") {
			return args.targetObject;
		}
		return {
			kind: "frontendBuilder",
			type: builder,
			path: "frontends." + builder,
			summary: builder + " builder"
		};
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var args = argsFrom(props);
			args.targetObject = frontendTarget(args);
			var menu = ctx.contextMenuSource(args);
			ctx.write(props.out || "local.menu", menu);
			return menu;
		}
	};
}())
