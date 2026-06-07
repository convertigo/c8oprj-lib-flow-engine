const _meta = {
  "version": 1,
  "private": true,
  "icon": "mdi:file-edit-outline",
  "tags": [
    "flow",
    "code",
    "flowscript",
    "patch"
  ],
  "description": "Applies a revision-checked FlowScript patch or replacement.",
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
      "description": "Revision returned by flow.code.get."
    },
    "code": {
      "label": "code",
      "kind": "text",
      "type": "string",
      "description": "Full replacement FlowScript code."
    },
    "codepatch": {
      "label": "codepatch",
      "kind": "text",
      "type": "string",
      "description": "Unified diff applied to the current FlowScript code."
    },
    "dry": {
      "label": "dry",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Validate without writing."
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
      "description": "Scope path receiving compact patch result."
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
			return ctx.flowCodePatch(argsFrom(ctx.props(node)));
		}
	};
}())
