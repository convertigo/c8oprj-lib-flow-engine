const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "private": true,
  "icon": "mdi:file-edit-outline",
  "tags": [
    "flow",
    "source",
    "flowscript",
    "patch",
  ],
  "description": "Patches FlowScript by revision, validates it, then writes the Flow source.",
  "properties": {
    "name": {
      "label": "Flow name",
      "kind": "text",
      "type": "string",
      "description": "Project Flow name.",
    },
    "revision": {
      "label": "Revision",
      "kind": "text",
      "type": "string",
      "description": "Revision returned by flow.source.get.",
    },
    "code": {
      "label": "Code",
      "kind": "text",
      "type": "string",
      "description": "Full replacement FlowScript code.",
    },
    "patch": {
      "label": "Patch",
      "kind": "text",
      "type": "string",
      "description": "Unified patch applied to the current FlowScript code.",
    },
    "dryRun": {
      "label": "Dry run",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Validate and compile without writing the Flow source.",
    },
    "projectDir": {
      "label": "Project directory",
      "kind": "text",
      "type": "string",
      "description": "Optional project directory override.",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "patch.hooks.js",
  },
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
