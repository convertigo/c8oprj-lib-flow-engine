const _meta = {
  "version": 1,
  "private": true,
  "icon": "mdi:play-box-outline",
  "tags": [
    "flow",
    "code",
    "flowscript"
  ],
  "description": "Runs FlowScript code in memory without writing the Flow.",
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
      "description": "Full FlowScript code. If omitted, the existing Flow is read."
    },
    "input": {
      "label": "input",
      "kind": "template",
      "type": "object",
      "description": "Input scope."
    },
    "config": {
      "label": "config",
      "kind": "template",
      "type": "object",
      "description": "Config scope override."
    },
    "includeFlow": {
      "label": "includeFlow",
      "kind": "literal",
      "type": "boolean",
      "description": "Include final local scope in the response."
    },
    "includeTrace": {
      "label": "includeTrace",
      "kind": "literal",
      "type": "boolean",
      "description": "Include execution trace in the response."
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
      "description": "Scope path receiving execution result."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "run.hooks.js"
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
			return ctx.flowCodeRun(argsFrom(ctx.props(node)));
		}
	};
}())
