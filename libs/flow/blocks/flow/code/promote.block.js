const _meta = {
  "version": 1,
  "private": true,
  "icon": "mdi:source-commit",
  "tags": [
    "flow",
    "code",
    "flowscript"
  ],
  "description": "Promotes a checked FlowScript draft to the official Flow model.",
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
      "description": "Expected draft revision returned by flow.code.check."
    },
    "code": {
      "label": "code",
      "kind": "text",
      "type": "string",
      "description": "Optional full FlowScript code. If omitted, the draft is promoted."
    },
    "saveProject": {
      "label": "saveProject",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Export the full Convertigo project after promotion. Keep false for fast MCP edits."
    },
    "refresh": {
      "label": "refresh",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Refresh the Studio Project Explorer after promotion."
    },
    "clearDraft": {
      "label": "clearDraft",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Clear the working copy after successful promotion."
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
      "description": "Scope path receiving promotion result."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "promote.hooks.js"
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
			return ctx.flowCodePromote(argsFrom(ctx.props(node)));
		}
	};
}())
