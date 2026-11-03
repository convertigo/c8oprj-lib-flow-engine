// Debug-only source table. Runtime nodes and authoring nodes use the same revision + JSON Pointer.
(function () {
 function pointer(path) {
  return '/' + String(path || '').replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)
   .map(function (part) { return part.replace(/~/g, '~0').replace(/\//g, '~1'); }).join('/');
 }
 function target(uri, revision, path, node, lines) {
  var p = pointer(path);
  var position = Math.max(1, Number(lines && lines[p] || node && node.__flowScriptLine || 1));
  return {url:'flow-block:' + encodeURIComponent(uri) + '?revision=' + revision + '#' + p,
   line:position, revision:String(revision), pointer:p,
   location:{id:String(uri),file:true,offset:0,label:String(uri) + ' › ' + String(node && (node.id || node.block) || p)}};
 }
 function create(definition, uri, revision, lines) {
  var byNode = new WeakMap(), entries = [];
  function visit(nodes, path) {
   (nodes || []).forEach(function (node, index) {
    var nodePath = path + '[' + index + ']';
    var entry = target(uri, revision, nodePath, node, lines);
    // Expansion can add implementation nodes from another file. Do not invent
    // a location in the caller's source for nodes absent from its parser table.
    if (!lines || Object.prototype.hasOwnProperty.call(lines,entry.pointer)) { entries.push(entry); byNode.set(node, entry); }
    Object.keys(node).forEach(function (slot) {
     // Business objects/arrays and parser metadata never create executable identities.
     if (slot !== 'props' && slot.indexOf('__') !== 0 && Array.isArray(node[slot]) &&
       node[slot].every(function (child) { return child && typeof child === 'object' && child.block; })) visit(node[slot], nodePath + '.' + slot);
    });
   });
  }
  visit(definition.nodes, 'nodes');
  (definition.helpers || []).forEach(function (helper, index) { visit(helper.nodes, 'helpers[' + index + '].nodes'); });
  return {entries:entries,get:function (node) { return byNode.get(node); }};
 }
 return {target:target,create:create,pointer:pointer};
}())
