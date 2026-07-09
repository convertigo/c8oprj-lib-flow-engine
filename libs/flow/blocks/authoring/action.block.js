const _meta = {
  "version": 1,
  "private": true,
  "icon": "mdi:play-circle-outline",
  "description": "Runs one dynamic authoring action through the same engine contract used by the Studio context menu.",
  "properties": {
    "actionId": {
      "label": "actionId",
      "kind": "text",
      "type": "string",
      "description": "Action id or shortcut: generate, build, openBuilt, dev.start, dev.stop, dev.open, dev.sync."
    },
    "action": {
      "label": "action",
      "kind": "literal",
      "type": "object",
      "description": "Optional complete context action object."
    },
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
      "description": "Scope path receiving the action response."
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
	var SHORT_ACTIONS = {
		generate: "frontbuilder.svelte.generate",
		build: "frontbuilder.svelte.build",
		openBuilt: "frontbuilder.svelte.openBuilt",
		"open-built": "frontbuilder.svelte.openBuilt",
		dev: "frontbuilder.svelte.dev.start",
		"dev.start": "frontbuilder.svelte.dev.start",
		"dev-start": "frontbuilder.svelte.dev.start",
		"dev.stop": "frontbuilder.svelte.dev.stop",
		"dev-stop": "frontbuilder.svelte.dev.stop",
		"dev.open": "frontbuilder.svelte.dev.open",
		"dev-open": "frontbuilder.svelte.dev.open",
		"dev.sync": "frontbuilder.svelte.dev.sync",
		"dev-sync": "frontbuilder.svelte.dev.sync"
	};

	function argsFrom(props) {
		var args = {};
		Object.keys(props || {}).forEach(function (key) {
			if (key !== "out") {
				args[key] = props[key];
			}
		});
		return args;
	}

	function actionId(value) {
		value = String(value || "").trim();
		return SHORT_ACTIONS[value] || value;
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
			args.action = args.action && typeof args.action === "object" ? args.action : {};
			args.action.id = actionId(args.action.id || args.actionId);
			if (!args.action.id) {
				throw new Error("authoring.action requires actionId or action.id.");
			}
			var response = ctx.contextActionSource(args);
			ctx.write(props.out || "local.action", response);
			return response;
		}
	};
}())
