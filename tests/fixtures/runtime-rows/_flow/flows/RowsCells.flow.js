const _flow = {
 "sourceVersion": 2, "accessibility": "private",
 "inputs": {
  "rows": {"type":"array","items":{"type":"object"},"required":true},
  "columns": {"type":"array","items":{"type":"object"},"required":true}
 }
};
function RowsCells({input,local,result}) {
 local.filtered = list.filter({items:input.rows,where:current.active === true})
 json.array({path:"result.rows",itemType:{type:"object"}})
 forEach({items:local.filtered,$$nodes:function(){
  local.row = current
  local.projected = {id:local.row.id}
  forEach({items:input.columns,$$nodes:function(){
   local.column = current
   local.raw = object.get({source:local.row,key:local.column.name})
   local.cell = bench.formatCell({value:local.raw,kind:local.column.kind})
   json.put({path:"local.projected",key:local.column.name,value:local.cell})
  }})
  json.push({path:"result.rows",value:local.projected})
 }})
 result.count = result.rows.length
}
