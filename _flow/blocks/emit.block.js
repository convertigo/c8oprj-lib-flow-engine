const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "runtime": "rhino",
  "targets": ["backend"],
  "icon": "mdi:export",
  "tags": ["control", "chunk", "stream", "emit", "result"],
  "description": "Adds rows to the result field of the enclosing forEachChunk (its into): sent in stream and forgotten when the requester accepts it, else appended to that field. Only inside the Each slot of a forEachChunk with into.",
  "summary": "emit {{rows}}",
  "properties": {
    "rows": {
      "label": "Rows",
      "kind": "expression",
      "type": "any",
      "required": true,
      "description": "An array of rows, or one row object."
    }
  },
  "outputs": {"out": {"type": "null", "hidden": true}},
  "hooks": {"file": "emit.hooks.js"}
}

(function () {
  return {
    run: function (ctx, node) {
      var sinks = ctx.emitSinks;
      if (!sinks || !sinks.length) {
        ctx.throwFlow({code: "EMIT_OUTSIDE_FOR_EACH_CHUNK", message: "emit runs inside the Each slot of a forEachChunk that declares into.", status: 500}, node);
      }
      var props = ctx.props(node);
      sinks[sinks.length - 1].append(ctx.expr(props.rows));
      return undefined;
    }
  };
}())
