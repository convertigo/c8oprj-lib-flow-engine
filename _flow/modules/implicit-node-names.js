(function () {
  // Only plain JSON crosses runtimes. A parent's retained name identifies each child-list editing context.
  function eachList(definition, callback) {
    function visit(nodes, context) {
      callback(nodes || [], context);
      (nodes || []).forEach(function(node) {
        Object.keys(node).forEach(function(key) {
          if (key !== 'props' && Array.isArray(node[key])) visit(node[key],context+'/'+node.id+'/'+key);
        });
      });
    }
    visit(definition.nodes,'root');
    (definition.helpers || []).forEach(function(helper){visit(helper.nodes,'helper/'+helper.name);});
  }
  function base(node) {
    var path=node.block==='set'?(node.props || {}).path:node.out;
    return String(path || node.block || 'node').split('.').pop().replace(/[^A-Za-z0-9_$]/g,'_');
  }
  function implicit(node) {return !node.__flowNameExplicit && node.id===node.__flowImplicitId;}
  function signature(node) {return JSON.stringify([node.block,node.out,node.props || {},node.comment,node.disabled]);}
  function key(node) {return JSON.stringify([node.block,node.out,(node.props || {}).path]);}
  function remember(definition, previous) {
    var state={counts:previous&&previous.counts || {},nodes:[]};
    eachList(definition,function(nodes,context){nodes.forEach(function(node){
      if(implicit(node)) {
        var nameBase=base(node),suffix=String(node.id).substring(nameBase.length);
        state.counts[nameBase]=Math.max(state.counts[nameBase]||0,/^\d*$/.test(suffix)?Number(suffix||1):0);
      }
      state.nodes.push({id:node.id,implicit:implicit(node),key:key(node),signature:signature(node),context:context});
    });});
    return state;
  }
  function reconcile(definition, previous) {
    if(!previous)return remember(definition,null);
    var used=Object.create(null),explicit=Object.create(null),kept=new Set(),old=previous.nodes || [],counts=previous.counts || {};
    old.forEach(function(entry){used[entry.id]=true;});
    function reserveInline(value){
      if(!value || typeof value!=='object')return;
      if(value.__flowBlock && value.metadata && value.metadata.id){explicit[value.metadata.id]=true;used[value.metadata.id]=true;}
      Object.keys(value).forEach(function(k){reserveInline(value[k]);});
    }
    eachList(definition,function(nodes){nodes.forEach(function(node){
      if(!implicit(node)){explicit[node.id]=true;used[node.id]=true;}
      reserveInline(node.props);
    });});
    function visit(nodes, context, oldContext) {
      nodes=nodes || [];
      var matches=new Map();
      function available(node){return old.filter(function(entry){return !kept.has(entry) && (entry.context || 'root')===oldContext && !explicit[entry.id] && (entry.implicit || entry.id===node.id);});}
      function keep(node,entry){node.id=entry.id;node.__flowImplicitId=entry.id;matches.set(node,entry);kept.add(entry);}
      nodes.forEach(function(node){
        if(!implicit(node))return;
        var entry=available(node).filter(function(entry){return entry.signature===signature(node);})[0];
        if(entry)keep(node,entry);
      });
      nodes.forEach(function(node){
        if(!implicit(node) || matches.has(node))return;
        var candidates=available(node).filter(function(entry){return entry.key===key(node);});
        if(candidates.length===1)keep(node,candidates[0]);
      });
      // An explicit parent renamed in source still owns its unchanged child lists.
      nodes.forEach(function(node){
        if(implicit(node))return;
        var candidates=old.filter(function(entry){return !kept.has(entry) && (entry.context || 'root')===oldContext;});
        var entry=candidates.filter(function(entry){return entry.id===node.id;})[0];
        if(!entry){candidates=candidates.filter(function(entry){return entry.signature===signature(node);});if(candidates.length===1)entry=candidates[0];}
        if(entry){matches.set(node,entry);kept.add(entry);}
      });
      nodes.forEach(function(node){
        var entry=matches.get(node);
        if(implicit(node) && !entry){
          var nameBase=base(node),rank=counts[nameBase] || 0,id;
          do{rank++;id=nameBase+(rank>1?rank:'');}while(used[id]);
          node.id=id;node.__flowImplicitId=id;used[id]=true;counts[nameBase]=rank;
        }
        Object.keys(node).forEach(function(slot){
          if(slot!=='props' && Array.isArray(node[slot]))visit(node[slot],context+'/'+node.id+'/'+slot,oldContext+'/'+(entry?entry.id:node.id)+'/'+slot);
        });
      });
    }
    visit(definition.nodes,'root','root');
    (definition.helpers || []).forEach(function(helper){visit(helper.nodes,'helper/'+helper.name,'helper/'+helper.name);});
    return remember(definition,{counts:counts});
  }
  return {reconcile:reconcile,remember:remember};
}())
