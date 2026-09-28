const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "private": true,
  "icon": "mdi:file-check-outline",
  "tags": [
    "flow",
    "code",
    "flowscript",
  ],
  "description": "Writes and checks the FlowScript working copy with optional revision checking.",
  "properties": {
    "qname": {
      "label": "Qualified name",
      "kind": "text",
      "type": "string",
      "description": "Flow qname, for example Project.FlowName.",
    },
    "name": {
      "label": "Flow name",
      "kind": "text",
      "type": "string",
      "description": "Project-local Flow name.",
    },
    "revision": {
      "label": "Revision",
      "kind": "text",
      "type": "string",
      "description": "Optional revision returned by flow.code.get.",
    },
    "code": {
      "label": "Code",
      "kind": "text",
      "type": "string",
      "description": "Full FlowScript code.",
    },
    "dry": {
      "label": "Dry run",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Low-level validation only. MCP agents should usually write the working copy instead.",
    },
    "draft": {
      "label": "Use draft",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Low-level compatibility flag. The working copy is the default unless official mode is requested.",
    },
    "saveProject": {
      "label": "Save project",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Export the full Convertigo project after writing. Keep false for fast MCP edits.",
    },
    "refresh": {
      "label": "Refresh Studio",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Refresh the Studio Project Explorer after writing. Keep false for fast MCP edits.",
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
    "file": "set.hooks.js",
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
			return ctx.flowCodeSet(argsFrom(ctx.props(node)));
		}
	};
}())
