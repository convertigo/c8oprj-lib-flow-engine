const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "private": true,
  "icon": "mdi:puzzle-outline",
  "description": "Lists Flow blocks visible from a project.",
  "traits": [
    "flow.projectScoped",
  ],
  "properties": {
    "query": {
      "label": "Query",
      "kind": "text",
      "type": "string",
      "description": "Optional text filter over block id, namespace, description and property names.",
    },
    "q": {
      "label": "Query (alias)",
      "kind": "text",
      "type": "string",
      "description": "Short alias for query.",
    },
    "namespace": {
      "label": "Namespace",
      "kind": "text",
      "type": "string",
      "description": "Optional namespace filter, such as json or mcp.tool.flow.",
    },
    "provider": {
      "label": "Provider",
      "kind": "text",
      "type": "string",
      "description": "Optional provider project filter, such as lib_flow_engine.",
    },
    "origin": {
      "label": "Origin",
      "kind": "text",
      "type": "string",
      "description": "Optional origin filter: core or project.",
    },
    "limit": {
      "label": "Limit",
      "kind": "literal",
      "type": "number",
      "description": "Maximum number of blocks to return.",
    },
    "cursor": {
      "label": "Cursor",
      "kind": "text",
      "type": "string",
      "description": "Pagination cursor returned by a previous catalog call.",
    },
    "detail": {
      "label": "Detail level",
      "kind": "text",
      "type": "string",
      "default": "signature",
      "description": "Palette detail: summary, signature, compact or full. Use signature for discovery.",
    },
    "mode": {
      "label": "Detail level (alias)",
      "kind": "text",
      "type": "string",
      "description": "Alias for detail.",
    },
    "includePrivate": {
      "label": "Include private",
      "kind": "literal",
      "type": "boolean",
      "description": "Include private blocks.",
    },
    "includeInternal": {
      "label": "Include internal",
      "kind": "literal",
      "type": "boolean",
      "description": "Include internal helper blocks hidden from the default palette.",
    },
    "includeTypes": {
      "label": "Include types",
      "kind": "literal",
      "type": "boolean",
      "description": "Include referenced property type descriptors in compact mode.",
    },
    "includeLibraries": {
      "label": "Include libraries",
      "kind": "literal",
      "type": "boolean",
      "description": "Include visible Flow library descriptors in compact mode.",
    },
    "doc": {
      "label": "Include documentation",
      "kind": "literal",
      "type": "boolean",
      "default": true,
      "description": "Include short palette documentation.",
    },
    "hints": {
      "label": "Include hints",
      "kind": "literal",
      "type": "boolean",
      "default": true,
      "description": "Include usage hints. Call with hints=false once understood.",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "list.hooks.js",
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
		if (!args.detail && !args.mode) {
			args.detail = "signature";
		}
		if (!args.limit) {
			args.limit = 20;
		}
		return args;
	}

	return {
		run: function (ctx, node) {
			return ctx.blockList(argsFrom(ctx.props(node)));
		}
	};
}())
