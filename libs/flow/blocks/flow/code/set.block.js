const _meta = {
  "version": 1,
  "private": true,
  "icon": "mdi:file-check-outline",
  "tags": [
    "flow",
    "code",
    "flowscript"
  ],
  "description": "Validates and writes FlowScript code with optional revision checking.",
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
      "description": "Validate without writing."
    },
    "draft": {
      "label": "draft",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Write the in-memory FlowScript working copy even when invalid. Does not update the saved Flow until promote/save."
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
