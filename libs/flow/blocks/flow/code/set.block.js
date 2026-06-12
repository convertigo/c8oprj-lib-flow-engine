const _meta = {
  "version": 1,
  "private": true,
  "icon": "mdi:file-check-outline",
  "tags": [
    "flow",
    "code",
    "flowscript"
  ],
  "description": "Writes and checks the FlowScript working copy with optional revision checking.",
  "properties": {
    "qname": {
      "label": "qname",
      "kind": "text",
      "type": "string",
      "description": "Flow qname, for example Project.FlowName."
    },
    "name": {
      "label": "name",
      "kind": "text",
      "type": "string",
      "description": "Project-local Flow name."
    },
    "revision": {
      "label": "revision",
      "kind": "text",
      "type": "string",
      "description": "Optional revision returned by flow.code.get."
    },
    "code": {
      "label": "code",
      "kind": "text",
      "type": "string",
      "description": "Full FlowScript code."
    },
    "dry": {
      "label": "dry",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Low-level validation only. MCP agents should usually write the working copy instead."
    },
    "draft": {
      "label": "draft",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Low-level compatibility flag. The working copy is the default unless official mode is requested."
    },
    "saveProject": {
      "label": "saveProject",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Export the full Convertigo project after writing. Keep false for fast MCP edits."
    },
    "refresh": {
      "label": "refresh",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Refresh the Studio Project Explorer after writing. Keep false for fast MCP edits."
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
      "description": "Scope path receiving compact write result."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "set.hooks.js"
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
			return ctx.flowCodeSet(argsFrom(ctx.props(node)));
		}
	};
}())
