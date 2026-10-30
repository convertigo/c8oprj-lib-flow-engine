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
      "description": "Unified diff applied to the current FlowScript code: @@ -old,count +new,count @@ hunks with the lines of the code read. For a targeted replacement, edits is simpler.",
    },
    "edits": {
      "label": "Text edits",
      "kind": "literal",
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "oldText": {
            "type": "string",
            "description": "Exact text of the current code, found once (spaces and line breaks included).",
          },
          "newText": {
            "type": "string",
            "description": "Its replacement; empty to delete it.",
          },
        },
        "required": [
          "oldText",
          "newText",
        ],
      },
      "description": "Exact replacements applied in order instead of codepatch: [{ oldText, newText }]. Each oldText must be found exactly once in the code as the edits before it left it; otherwise nothing is written (EDIT_TEXT_NOT_FOUND, EDIT_TEXT_NOT_UNIQUE with the lines).",
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
