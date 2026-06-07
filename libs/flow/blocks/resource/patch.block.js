const _meta = {
  "version": 1,
  "private": true,
  "icon": "mdi:file-edit-outline",
  "description": "Applies a unified patch to a project-local Flow source resource.",
  "properties": {
    "path": {
      "label": "path",
      "kind": "text",
      "type": "string",
      "description": "Project-local Flow resource path."
    },
    "baseHash": {
      "label": "baseHash",
      "kind": "text",
      "type": "string",
      "description": "Hash returned by resource.get before editing."
    },
    "patch": {
      "label": "patch",
      "kind": "text",
      "type": "string",
      "description": "Unified patch to apply."
    },
    "unifiedDiff": {
      "label": "unifiedDiff",
      "kind": "text",
      "type": "string",
      "description": "Alias for patch."
    },
    "dryRun": {
      "label": "dryRun",
      "kind": "literal",
      "type": "boolean",
      "description": "Validate without writing the file."
    },
    "validate": {
      "label": "validate",
      "kind": "literal",
      "type": "boolean",
      "description": "Validate resource syntax after patching."
    },
    "includeContent": {
      "label": "includeContent",
      "kind": "literal",
      "type": "boolean",
      "description": "Return patched content."
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
