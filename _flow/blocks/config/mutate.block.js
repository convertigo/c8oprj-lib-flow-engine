const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:file-cog-outline",
  "tags": [
    "config",
    "authoring",
  ],
  "description": "Changes a value of a named configuration of a project (engine.yaml), for an administrator or an authenticated MCP call only.",
  "longDescription": "Use it to let an application register what it prepared, such as a data source: default is the config branch, a named configuration its configs.<name> branch. Call it once with dryRun:true to show the before and after values and get previousRevision, then confirm with revision:previousRevision; a change in between answers CONFIG_REVISION_CONFLICT. persist:draft keeps the working copy the Save of the project publishes; persist:save writes engine.yaml alone and is refused when engine.yaml has unsaved changes. The platform checks the caller of the root request, whatever the accessibility of the Flows on the way: an administrator over HTTP (POST with the session XSRF token) or an authenticated MCP call; anyone else gets AUTHORING_FORBIDDEN. Secrets are never values: a secret key only accepts a reference to a .secret global symbol, \"${<project>.<usage>.<name>.secret=<default>}\", whose default may be a test or development value.",
  "properties": {
    "project": {
      "label": "Project",
      "kind": "value",
      "type": "string",
      "default": "",
      "description": "Project whose engine.yaml is changed.",
    },
    "configuration": {
      "label": "Configuration",
      "kind": "value",
      "type": "string",
      "default": "default",
      "description": "default (the config branch) or the name of an existing named configuration.",
    },
    "path": {
      "label": "Path",
      "kind": "value",
      "type": "string",
      "default": "",
      "description": "Dot-separated path inside the configuration, such as data.sources.orders.",
    },
    "op": {
      "label": "Operation",
      "kind": "value",
      "type": "string",
      "default": "set",
      "description": "set, merge (into an object) or remove.",
    },
    "value": {
      "label": "Value",
      "kind": "value",
      "type": "object",
      "default": null,
      "description": "Value to set or merge; ignored by remove.",
    },
    "revision": {
      "label": "Revision",
      "kind": "value",
      "type": "string",
      "default": "",
      "description": "previousRevision returned by the dry run; required to persist.",
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
      "description": "draft (working copy) or save (engine.yaml alone).",
    },
  },
  "outputs": {
    "out": {
      "type": "object",
      "properties": {
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
			return ctx.configMutate({
				project: value("project"),
				configuration: value("configuration"),
				path: value("path"),
				op: value("op"),
				value: value("value"),
				revision: value("revision"),
				dryRun: value("dryRun") === true || value("dryRun") === "true",
				persist: value("persist")
			});
		}
	};
}())
