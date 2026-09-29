const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "private": true,
  "icon": "mdi:puzzle-edit-outline",
  "tags": [
    "block",
    "code",
    "flowscript",
    "patch",
  ],
  "description": "Applies a revision-checked FlowScript block patch or replacement.",
  "traits": [
    "flow.projectScoped",
  ],
  "properties": {
    "name": {
      "label": "Block name",
      "kind": "text",
      "type": "string",
      "description": "Project-local block name, for example text.initials.",
    },
    "revision": {
      "label": "Revision",
      "kind": "text",
      "type": "string",
      "description": "Revision returned by block.code.get.",
    },
    "target": {
      "label": "Implementation",
      "kind": "text",
      "type": "string",
      "default": "backend",
      "description": "Implementation target: backend or frontend.",
    },
    "finalize": {
      "label": "Finalize",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Remove mock metadata after patching a complete frontend-only implementation.",
    },
    "code": {
      "label": "Code",
      "kind": "text",
      "type": "string",
      "description": "Full replacement FlowScript block code.",
    },
    "codepatch": {
      "label": "Code patch",
      "kind": "text",
      "type": "string",
      "description": "Unified diff applied to the current FlowScript block code.",
    },
    "dry": {
      "label": "Dry run",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Validate without writing.",
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
			return ctx.blockCodePatch(argsFrom(ctx.props(node)));
		}
	};
}())
