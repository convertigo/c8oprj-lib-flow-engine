const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "private": true,
  "icon": "mdi:file-edit-outline",
  "tags": [
    "flow",
    "code",
    "flowscript",
    "patch",
  ],
  "description": "Applies a revision-checked FlowScript patch to the working copy.",
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
      "description": "Revision returned by flow.code.get.",
    },
    "code": {
      "label": "Code",
      "kind": "text",
      "type": "string",
      "description": "Full replacement FlowScript code.",
    },
    "codepatch": {
      "label": "Code patch",
      "kind": "text",
      "type": "string",
      "description": "Unified diff applied to the current FlowScript code.",
    },
    "dry": {
      "label": "Dry run",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Validate without writing.",
    },
    "draft": {
      "label": "Use draft",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Patch the in-memory FlowScript working copy. Does not update the saved Flow until promote/save.",
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
			return ctx.flowCodePatch(argsFrom(ctx.props(node)));
		}
	};
}())
