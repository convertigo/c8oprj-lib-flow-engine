const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "private": true,
  "icon": "mdi:file-edit-outline",
  "description": "Applies a unified patch to a project-local Flow source resource.",
  "traits": [
    "flow.projectScoped",
  ],
  "properties": {
    "path": {
      "label": "Resource path",
      "kind": "text",
      "type": "string",
      "description": "Project-local Flow resource path.",
    },
    "baseHash": {
      "label": "Base hash",
      "kind": "text",
      "type": "string",
      "description": "Hash returned by resource.get before editing.",
    },
    "patch": {
      "label": "Patch",
      "kind": "text",
      "type": "string",
      "description": "Unified patch to apply.",
    },
    "unifiedDiff": {
      "label": "Unified diff (alias)",
      "kind": "text",
      "type": "string",
      "description": "Alias for patch.",
    },
    "dryRun": {
      "label": "Dry run",
      "kind": "literal",
      "type": "boolean",
      "description": "Validate without writing the file.",
    },
    "validate": {
      "label": "Validate",
      "kind": "literal",
      "type": "boolean",
      "description": "Validate resource syntax after patching.",
    },
    "includeContent": {
      "label": "Include content",
      "kind": "literal",
      "type": "boolean",
      "description": "Return patched content.",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "patch.hooks.js",
  },
}

(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

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
			return ctx.resourcePatch(argsFrom(ctx.props(node)));
		}
	};
}())
