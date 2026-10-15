const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:file-check-outline",
  "tags": [
    "schema",
    "authoring",
  ],
  "description": "Adopts a result schema for a Flow output (_flow.outputs) or one of its nodes, for an administrator or an authenticated MCP call only.",
  "longDescription": "Use it once the data of an unstructured source is known, so that pickers and agents get a structured contract. Pass the complete schema: a proposal (such as data.schemaPropose) is never adopted implicitly, and a document schema must not replace an envelope you keep. Without node, the schema replaces _flow.outputs in the working copy of the Flow source; with node, it becomes the learned schema of that node. Call it with dryRun:true to show before and after and get previousRevision, then confirm with revision:previousRevision (SCHEMA_REVISION_CONFLICT otherwise); flowRevision optionally pins the Flow source you read. persist:draft keeps the working copy the Save of the project publishes; persist:save writes the Flow source alone and is refused over its unsaved changes; a node schema has no working copy and is written. The platform checks the caller of the root request like config.mutate.",
  "properties": {
    "qname": {
      "label": "Flow",
      "kind": "value",
      "type": "string",
      "default": "",
      "description": "Project.Flow whose output or node schema is adopted.",
    },
    "node": {
      "label": "Node",
      "kind": "value",
      "type": "string",
      "default": "",
      "description": "Node id; empty for the output of the Flow (_flow.outputs).",
    },
    "schema": {
      "label": "Schema",
      "kind": "value",
      "type": "object",
      "default": null,
      "description": "Complete JSON schema to adopt.",
    },
    "revision": {
      "label": "Revision",
      "kind": "value",
      "type": "string",
      "default": "",
      "description": "previousRevision returned by the dry run; required to persist.",
    },
    "flowRevision": {
      "label": "Flow revision",
      "kind": "value",
      "type": "string",
      "default": "",
      "description": "Optional revision of the Flow source read by the caller.",
    },
    "dryRun": {
      "label": "Dry run",
      "kind": "value",
      "type": "boolean",
      "default": false,
      "description": "Tells the change without writing anything.",
    },
    "persist": {
      "label": "Persist",
      "kind": "value",
      "type": "string",
      "default": "draft",
      "description": "draft (working copy) or save (the Flow source alone).",
    },
  },
  "outputs": {
    "out": {
      "type": "object",
      "properties": {
        "target": { "type": "string" },
        "changed": { "type": "boolean" },
        "before": {},
        "after": {},
        "previousRevision": { "type": "string" },
        "revision": { "type": "string" },
        "persisted": { "type": "string" },
        "dryRun": { "type": "boolean" },
      },
    },
  },
  "runtime": "rhino",
}

(function () {
	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			// literal values, ${expressions} rendered
			function value(property) {
				return props[property] === undefined ? undefined : ctx.template(ctx.literal(props[property]));
			}
			return ctx.schemaAdopt({
				qname: value("qname"),
				node: value("node"),
				schema: value("schema"),
				revision: value("revision"),
				flowRevision: value("flowRevision"),
				dryRun: value("dryRun") === true || value("dryRun") === "true",
				persist: value("persist")
			});
		}
	};
}())
