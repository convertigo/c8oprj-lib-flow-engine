const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "private": true,
  "icon": "mdi:code-json",
  "description": "Returns the selected JSON output schema source for a Flow; MCP authoring can adopt or remove it as _flow.outputs.",
  "properties": {
    "qname": {
      "label": "Qualified name",
      "kind": "text",
      "type": "string",
      "description": "Executable Flow DBO qname. Alias used by MCP tools.",
    },
    "name": {
      "label": "Flow name",
      "kind": "text",
      "type": "string",
      "description": "Project Flow name.",
    },
    "flowName": {
      "label": "Flow name (alias)",
      "kind": "text",
      "type": "string",
      "description": "Alias for name.",
    },
    "flowSource": {
      "label": "Flow source",
      "kind": "text",
      "type": "string",
      "description": "Flow YAML source.",
    },
    "definition": {
      "label": "Definition",
      "kind": "literal",
      "type": "object",
      "description": "Flow definition object.",
    },
    "source": {
      "label": "Schema source",
      "kind": "text",
      "type": "string",
      "description": "Schema source to read or adopt: effective, declared, static, learned.",
    },
    "action": {
      "label": "Action",
      "kind": "text",
      "type": "string",
      "description": "MCP authoring action: read, adopt or remove.",
    },
    "schema": {
      "label": "Schema",
      "kind": "literal",
      "type": "object",
      "description": "Explicit schema to adopt instead of the selected current schema.",
    },
    "dryRun": {
      "label": "Dry run",
      "kind": "literal",
      "type": "boolean",
      "description": "When adopting/removing through MCP, return the rewritten source without writing it.",
    },
    "projectDir": {
      "label": "Project directory",
      "kind": "text",
      "type": "string",
      "description": "Optional project directory override.",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "outputSchema.hooks.js",
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

	function withNamedFlowSource(ctx, args) {
		if (!args.name && args.qname) {
			var parts = String(args.qname).split(".");
			args.name = parts[parts.length - 1];
			if (!args.flowQName) {
				args.flowQName = String(args.qname);
			}
		}
		var hasDefinition = args.definition !== undefined && args.definition !== null;
		var hasSource = args.flowSource !== undefined && args.flowSource !== null && String(args.flowSource).trim() !== "";
		if (!hasDefinition && !hasSource && (args.name || args.flowName)) {
			var name = args.name || args.flowName;
			var flow = ctx.flowGet(name, args);
			args.flowSource = flow.source;
			if (!args.flowName) {
				args.flowName = name;
			}
		}
		return args;
	}

	return {
		run: function (ctx, node) {
			return ctx.outputSchemaSource(withNamedFlowSource(ctx, argsFrom(ctx.props(node))));
		}
	};
}())
