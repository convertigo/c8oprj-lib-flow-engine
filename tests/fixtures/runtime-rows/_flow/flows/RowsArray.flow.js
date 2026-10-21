const _flow = {
 "sourceVersion": 2, "accessibility": "private",
 "inputs": {
  "rows": {"type":"array","items":{"type":"object"},"required":true},
  "columns": {"type":"array","items":{"type":"object"},"required":true}
 }
};
function RowsArray({input,local,result}) {
 local.filtered = list.filter({items:input.rows,where:current.active === true})
 result.rows = rows.formatCells({rows:local.filtered,columns:input.columns,keepColumns:["id"],escapeHtml:true,includeNumeric:true})
 result.count = result.rows.length
}
