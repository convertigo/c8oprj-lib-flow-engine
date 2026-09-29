const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "private": true,
  "icon": "mdi:source-commit",
  "tags": [
    "flow",
    "code",
    "flowscript",
  ],
  "description": "Promotes a checked FlowScript working copy to the official Flow model.",
  "traits": [
    "flow.projectScoped",
  ],
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
      "description": "Expected draft revision returned by flow.code.check.",
    },
    "code": {
      "label": "Code",
      "kind": "text",
      "type": "string",
      "description": "Optional full FlowScript code. If omitted, the draft is promoted.",
    },
    "saveProject": {
      "label": "Save project",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Export the full Convertigo project after promotion. Keep false for fast MCP edits.",
    },
    "refresh": {
      "label": "Refresh Studio",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Refresh the Studio Project Explorer after promotion.",
    },
    "clearDraft": {
      "label": "Clear draft",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Clear the working copy after successful promotion.",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "promote.hooks.js",
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
			return ctx.flowCodePromote(argsFrom(ctx.props(node)));
		}
	};
}())
