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
