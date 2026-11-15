const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const kernels=[vm.runInNewContext(fs.readFileSync('_flow/lib/rows.js','utf8'))];
const peer=vm.runInNewContext('('+fs.readFileSync('_flow/blocks/rows/formatCells.browser.js','utf8')+')');
kernels.push({formatCells:peer});
for(const kernel of kernels){
 const attack='<img src=x onerror="alert(1)">';
 function cell(v,type){return kernel.formatCells({profile:'table',rows:[{a:v}],schema:[{name:'a',type:type||'text'}]})[0].a;}
 for(const v of [attack,{value:attack},{name:attack},[attack]]){
  const c=cell(v);assert(!c.displayValue.includes('<img'),c.displayValue);assert(c.displayValue.includes('&lt;img'),c.displayValue);
 }
 for(const v of [{url:'javascript:alert(1)',label:attack},{url:'data:text/html,hi',is_image:true},{url:'https://example.org/" onerror="oops',is_image:true},{url:'https://example.org/file',is_image:false,visible_name:attack}]){
  const c=cell(v);assert(!/href="javascript:|src="data:|" onerror="/.test(c.displayValue),c.displayValue);
  assert(!c.displayValue.includes('<img src=x'),c.displayValue);
 }
 assert(cell({url:'https://example.org/',label:'A&B'}).displayValue.includes('A&amp;B'));
 assert(cell('example.org','url').displayValue.includes('href="https://example.org"'));
 assert(!cell('javascript:alert(1)','url').displayValue.includes('href='));
 assert(!cell('java\nscript:alert(1)','url').displayValue.includes('href='));
 assert(!cell({url:'ftp://example.org',label:'file'}).displayValue.includes('href='));
 assert.equal(cell(attack).value,attack);
 assert(!cell(12,'number').displayValue.includes('&amp;'));
}
console.log('audit-cell-html OK');
