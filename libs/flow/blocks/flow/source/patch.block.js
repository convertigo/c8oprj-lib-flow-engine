const _meta = {
  "version": 1,
  "private": true,
  "icon": "mdi:file-edit-outline",
  "tags": [
    "flow",
    "source",
    "flowscript",
    "patch"
  ],
  "description": "Patches FlowScript by revision, validates it, then writes the Flow sidecar.",
  "properties": {
    "name": {
      "label": "name",
      "kind": "text",
      "type": "string",
      "description": "Project Flow sidecar name."
    },
    "revision": {
      "label": "revision",
      "kind": "text",
      "type": "string",
      "description": "Revision returned by flow.source.get."
    },
    "code": {
      "label": "code",
      "kind": "text",
      "type": "string",
      "description": "Full replacement FlowScript code."
    },
    "patch": {
      "label": "patch",
      "kind": "text",
      "type": "string",
      "description": "Unified patch applied to the current FlowScript code."
    },
    "dryRun": {
      "label": "dryRun",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Validate and compile without writing the sidecar."
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
      "description": "Scope path receiving patch result."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "patch.hooks.js"
  }
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

	return {
		run: function (ctx, node) {
			return ctx.flowSourcePatch(argsFrom(ctx.props(node)));
		}
	};
}())
