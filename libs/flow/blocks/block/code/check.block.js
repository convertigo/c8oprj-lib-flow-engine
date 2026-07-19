const _meta = {
  "version": 1,
  "private": true,
  "icon": "mdi:check-decagram-outline",
  "tags": ["block", "code", "frontend", "check"],
  "description": "Validates one project-local target implementation without writing it.",
  "properties": {
    "name": { "label": "name", "kind": "text", "type": "string", "description": "Flow block name." },
    "target": { "label": "target", "kind": "text", "type": "string", "default": "frontend", "description": "Implementation target. Currently frontend." },
    "code": { "label": "code", "kind": "text", "type": "string", "description": "Optional browser function source. The saved implementation is checked when omitted." },
    "projectDir": { "label": "projectDir", "kind": "text", "type": "string", "description": "Optional project directory override." },
    "out": { "label": "out", "kind": "path", "mode": "write", "description": "Scope path receiving validation diagnostics." }
  },
  "runtime": "rhino"
}

(function () {
  return {
    run: function (ctx, node) {
      return ctx.blockCodeCheck(ctx.props(node))
    }
  }
}())
