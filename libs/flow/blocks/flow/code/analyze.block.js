const _meta = {
  "version": 1,
  "private": true,
  "icon": "mdi:file-search-outline",
  "tags": [
    "flow",
    "code",
    "flowscript"
  ],
  "description": "Analyzes the current FlowScript working copy or official Flow.",
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
    "code": {
      "label": "code",
      "kind": "text",
      "type": "string",
      "description": "Optional full FlowScript code for internal use. MCP agents should write with flow-code-set or flow-code-patch first."
    },
    "projectDir": {
      "label": "projectDir",
      "kind": "text",
      "type": "string",
      "description": "Optional project directory override."
    },
    "project": {
      "label": "project",
      "kind": "text",
      "type": "string",
      "description": "Optional logical project name used for relative requestables."
    },
    "out": {
      "label": "out",
      "kind": "path",
      "mode": "write",
      "description": "Scope path receiving reads, writes, nodes and schemas."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "analyze.hooks.js"
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
			return ctx.flowCodeAnalyze(argsFrom(ctx.props(node)));
		}
	};
}())
