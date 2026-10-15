const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:filter-outline",
  "tags": [
    "ldap",
    "directory",
    "filter",
    "security",
  ],
  "summary": "LDAP escape {{value}}",
  "description": "Escapes a value placed in an LDAP search filter (RFC 4515: \\ * ( ) and NUL) or in a distinguished name (RFC 4514). ldap.search and ldap.authenticate already escape the values of their {name} placeholders; use this block when a filter or a DN is assembled in FlowScript from a value a user typed.",
  "uses": [
    "ldap",
  ],
  "properties": {
    "value": {
      "label": "Value",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Value to escape.",
    },
    "mode": {
      "label": "Mode",
      "kind": "literal",
      "type": "string",
      "enum": [
        "filter",
        "dn",
      ],
      "default": "filter",
      "description": "filter escapes for a search filter, dn for a relative distinguished name value.",
    },
  },
  "outputs": {
    "out": {
      "type": "string",
    },
  },
  "runtime": "rhino",
}

(function () {
	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var rendered = props.value === undefined || props.value === null ? "" : ctx.template(props.value);
			var value = rendered === undefined || rendered === null ? "" : String(rendered);
			var ldap = ctx.lib("ldap");
			return props.mode === "dn" ? ldap.escapeDn(value) : ldap.escapeFilter(value);
		}
	};
}())
