(function () {
  function nodePath(node) {
    return node && (node.uid || node.id || node.name) ? String(node.uid || node.id || node.name) : "";
  }

  // The writes of the slots of a parallel loop into the scopes its lanes share, found without running it (the engine
  // refuses them at run time as well): parent of this loop, result anywhere below it. The slots of a nested loop write
  // their own parent; a composite block keeps its own scopes and is not walked.
  function sharedWrites(node, withResult) {
    var found = [];
    function check(child, withParent) {
      var targets = [];
      if (typeof child.out === "string") targets.push({property: "$$out", path: child.out});
      if (child.block === "set" && child.props && typeof child.props.path === "string") targets.push({property: "path", path: child.props.path});
      targets.forEach(function (target) {
        var root = target.path.split(/[.\[]/)[0];
        if (root === "parent" && withParent || root === "result" && withResult) {
          found.push({severity: "error", code: "PARALLEL_SCOPE_READ_ONLY", property: target.property, path: nodePath(child), block: child.block,
            message: target.path + " cannot be written in a parallel chunk: parent, result, input and config are shared by the chunks there, read-only.",
            hint: "Return a value and combine it in reduce, or emit rows; or set parallel to 1."});
        }
      });
    }
    function walk(nodes, withParent) {
      (Array.isArray(nodes) ? nodes : []).forEach(function (child) {
        if (!child || typeof child !== "object" || !child.block || child.disabled) return;
        check(child, withParent);
        var nested = child.block === "forEachChunk";
        Object.keys(child).forEach(function (key) {
          if (key !== "props" && Array.isArray(child[key])) walk(child[key], withParent && !nested);
        });
      });
    }
    walk(node.each, true);
    walk(node.reduce, true);
    return found;
  }

  // HTTP calls with an effect in the Each slot of a parallel loop that stops at the first error: the chunks after a
  // failed one may have sent theirs before it is known (at most 2 x parallel - 1 of them), and it is not undone.
  var READS = ["GET", "HEAD", "OPTIONS"];
  function sentEffects(node) {
    var found = [];
    function walk(nodes) {
      (Array.isArray(nodes) ? nodes : []).forEach(function (child) {
        if (!child || typeof child !== "object" || !child.block || child.disabled) return;
        var method = child.block === "http.request" ? (child.props && child.props.method !== undefined ? child.props.method : "GET")
          : {"http.post": "POST", "http.put": "PUT", "http.delete": "DELETE"}[child.block];
        if (method !== undefined && !(typeof method === "string" && READS.indexOf(method.toUpperCase()) >= 0)) {
          found.push({severity: "warning", code: "FOR_EACH_CHUNK_PARALLEL_EFFECTS", property: "parallel", path: nodePath(child), block: child.block,
            message: "With parallel and onError stop, the chunks after a failed one may already have sent this request (at most 2 x parallel - 1 of them): "
              + "their results are dropped (listed in details.discardedChunks of the error), their effects are not undone.",
            hint: "Make the request idempotent (an upsert by key), or set onError to continue, or parallel to 1."});
        }
        Object.keys(child).forEach(function (key) {
          if (key !== "props" && Array.isArray(child[key])) walk(child[key]);
        });
      });
    }
    walk(node.each);
    return found;
  }

  return {
    displayName: function (node) {
      var props = node.props || node;
      return props.source === undefined ? "source" : flowSummary.text(props.source);
    },
    analyze: function (ctx, node) {
      var props = ctx.props(node);
      var emits = props.into !== undefined && props.into !== null && props.into !== "" ? 1 : 0;
      ctx.emitTargets = (ctx.emitTargets || 0) + emits;
      // a template parallel is checked at run time only
      var parallel = typeof props.parallel === "number" && props.parallel > 1;
      if (parallel) {
        sharedWrites(node, !(ctx.parallelChunkLoops > 0)).forEach(function (error) { ctx.errors.push(error); });
        if (props.onError !== "continue") sentEffects(node).forEach(function (warning) { ctx.errors.push(warning); });
        ctx.parallelChunkLoops = (ctx.parallelChunkLoops || 0) + 1;
      }
      try {
        ctx.visitNodes(node.each || []);
        ctx.visitNodes(node.reduce || []);
      } finally {
        ctx.emitTargets -= emits;
        if (parallel) ctx.parallelChunkLoops--;
      }
    }
  };
}())
