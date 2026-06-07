const _meta = {
  "version": 1,
  "private": true,
  "icon": "mdi:format-list-bulleted-type",
  "tags": [
    "requestable",
    "list",
    "sequence",
    "transaction",
    "flow"
  ],
  "description": "Lists requestables in the current project: sequences, Flows and connector transactions.",
  "properties": {
    "project": {
      "label": "project",
      "kind": "text",
      "type": "string",
      "description": "Project to inspect. Defaults to the current project."
    },
    "query": {
      "label": "query",
      "kind": "text",
      "type": "string",
      "description": "Optional text filter over qname, kind, connector and name."
    },
    "q": {
      "label": "q",
      "kind": "text",
      "type": "string",
      "description": "Short alias for query."
    },
    "limit": {
      "label": "limit",
      "kind": "literal",
      "type": "number",
      "default": 100,
      "description": "Maximum number of requestables to return."
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
      "description": "Scope path receiving listed requestables."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "list.hooks.js"
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
			return ctx.requestableList(argsFrom(ctx.props(node)));
		}
	};
}())
