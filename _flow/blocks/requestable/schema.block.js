const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "private": true,
  "icon": "mdi:database-search-outline",
  "tags": [
    "requestable",
    "schema",
    "sequence",
    "transaction",
    "flow",
  ],
  "description": "Returns the known output schema and paths for a requestable.",
  "traits": [
    "flow.projectScoped",
  ],
  "properties": {
    "requestable": {
      "label": "Requestable",
      "kind": "requestable",
      "type": "requestable",
      "description": "Target requestable, for example .RSSConnector.GetFeed, .MyFlow or Project.Connector.Transaction.",
    },
    "project": {
      "label": "Project",
      "kind": "text",
      "type": "string",
      "description": "Project used to resolve local requestables.",
    },
    "input": {
      "label": "Input",
      "kind": "template",
      "type": "object",
      "description": "Optional input variables when learn is true.",
    },
    "learn": {
      "label": "Learn schema",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "When no static schema is available, execute the requestable and infer schema from the runtime sample. Use only when the call is safe.",
    },
    "includeSample": {
      "label": "Include sample",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Include the runtime sample when learn is true.",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "schema.hooks.js",
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
			return ctx.requestableSchema(argsFrom(ctx.props(node)));
		}
	};
}())
