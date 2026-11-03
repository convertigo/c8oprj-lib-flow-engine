(function () {
  // Session names are model metadata. The source and its text revision never carry them.
  function flatten(definition) {
    var all = [];
    function visit(nodes) { (nodes || []).forEach(function (node) {
      all.push(node);
      Object.keys(node).forEach(function (key) { if (key !== "props" && Array.isArray(node[key])) visit(node[key]); });
    }); }
    visit(definition.nodes);
    (definition.helpers || []).forEach(function (helper) { visit(helper.nodes); });
    return all;
  }
  function base(node) {
    var path = node.block === "set" ? (node.props || {}).path : node.out;
    return String(path || node.block || "node").split(".").pop().replace(/[^A-Za-z0-9_$]/g,"_");
  }
  function signature(node) { return JSON.stringify([node.block, node.out, node.props || {}]); }
  function reconcile(definition, previous) {
    var nodes = flatten(definition), used = Object.create(null), bySignature = Object.create(null);
    var counts = previous && previous.counts || {}, old = previous && previous.nodes || [];
    old.forEach(function (entry) {
      used[entry.id] = true;
      (bySignature[entry.signature] || (bySignature[entry.signature] = [])).push(entry);
    });
    nodes.forEach(function (node) { if (node.id !== node.__flowImplicitId) used[node.id] = true; });
    var kept = new Set();
    nodes.forEach(function (node) {
      if (node.id !== node.__flowImplicitId) return;
      var candidates = bySignature[signature(node)] || [];
      var entry = candidates.filter(function (candidate) { return !kept.has(candidate) && candidate.implicit; })[0];
      if (entry) { node.id = entry.id; node.__flowImplicitId = entry.id; kept.add(entry); node.__flowScriptNameRetained = true; }
    });
    nodes.forEach(function (node) {
      if (node.id !== node.__flowImplicitId) return;
      var nameBase = base(node), rank = counts[nameBase] || 0, id;
      if (!previous) {
        used[node.id] = true;
        var match = node.id.match(new RegExp("^" + nameBase.replace(/[$]/g,"\\$") + "(\\d*)$"));
        counts[nameBase] = Math.max(rank, match ? Number(match[1] || 1) : 0);
      } else if (!node.__flowScriptNameRetained) {
        do { rank++; id = nameBase + (rank > 1 ? rank : ""); } while (used[id]);
        node.id = id; node.__flowImplicitId = id; used[id] = true; counts[nameBase] = rank;
      }
      delete node.__flowScriptNameRetained;
    });
    return { counts:counts, nodes:nodes.map(function (node) { return {id:node.id,implicit:node.id===node.__flowImplicitId,signature:signature(node)}; }) };
  }
  return {reconcile:reconcile};
}())
