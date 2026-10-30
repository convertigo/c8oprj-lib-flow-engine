const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "private": true,
  "icon": "mdi:puzzle-edit-outline",
  "tags": [
    "block",
    "code",
    "flowscript",
    "patch",
  ],
  "description": "Applies a revision-checked FlowScript block patch or replacement.",
  "traits": [
    "flow.projectScoped",
  ],
  "properties": {
    "name": {
      "label": "Block name",
      "kind": "text",
      "type": "string",
      "description": "Project-local block name, for example text.initials.",
    },
    "revision": {
      "label": "Revision",
      "kind": "text",
      "type": "string",
      "description": "Revision returned by block.code.get.",
    },
    "target": {
      "label": "Implementation",
      "kind": "text",
      "type": "string",
      "default": "backend",
      "description": "Implementation target: backend or frontend.",
    },
    "finalize": {
      "label": "Finalize",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Remove mock metadata after patching a complete frontend-only implementation.",
    },
    "code": {
      "label": "Code",
      "kind": "text",
      "type": "string",
      "description": "Full replacement FlowScript block code.",
    },
    "codepatch": {
      "label": "Code patch",
      "kind": "text",
      "type": "string",
      "description": "Unified diff applied to the current FlowScript block code: @@ -old,count +new,count @@ hunks with the lines of the code read. For a targeted replacement, edits is simpler.",
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
			return ctx.blockCodePatch(argsFrom(ctx.props(node)));
		}
	};
}())
