// Isolated manual/browser qualification page. Does not connect to a Studio/project.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../_flow');
const editors = ['literal', 'value', 'template', 'path', 'schema'].map(name =>
  fs.readFileSync(path.join(root, 'types/editors', name + '.html'), 'utf8')).join('\n');
const theme = fs.readFileSync(path.join(root, 'resources/property-editor.css'), 'utf8');
const destinations = fs.readFileSync(path.join(root, 'modules/destination-contract.js'), 'utf8');
const schemas = fs.readFileSync(path.join(root, 'modules/schema-contract.js'), 'utf8');
const html = `<!doctype html><html data-flow-theme="light"><head><meta charset="utf-8"><title>Flow property contract qualification</title>
<style>${theme} body { margin:24px; background:#f5f7fa; color:#142132; font:15px system-ui } main{max-width:950px;margin:auto;background:white;padding:24px;border-radius:10px} select{margin:12px;padding:8px} #status{margin-top:18px;white-space:pre-wrap}</style></head>
<body><main><h1>Flow — isolated editor qualification</h1><p>No project is modified by this page.</p>
<label>Property <select id="property"><option value="number">Number / Left</option><option value="boolean">Boolean value</option><option value="enum">Typed choices</option><option value="message">Log / Message</option><option value="output">Output destination</option><option value="schema">Collection item type</option></select></label>
<div id="editor"></div><div id="status"></div></main><script>window.FlowDestinationContract = ${destinations};window.FlowSchemaContract = ${schemas};</script>${editors}
<script>
const definitions = {
 number: {tag:'flow-value-editor', definition:{kind:'value',type:'number'}, value:12},
 boolean: {tag:'flow-value-editor', definition:{kind:'value',type:'boolean'}, value:false},
 enum: {tag:'flow-value-editor', definition:{kind:'value',type:'string',enum:['context','engine','user']},value:'context'},
 message: {tag:'flow-template-editor',definition:{kind:'template',type:'string'},value:'Hello'},
 output: {tag:'flow-path-editor',definition:{kind:'path',mode:'write'},value:'local.answer'},
 schema: {tag:'flow-schema-editor',definition:{kind:'schema',type:'object'},value:{type:'object',properties:{city:{type:'string'},temperature:{type:'number'}},required:['city'],additionalProperties:false}}
};
function show() {
 const example=definitions[document.querySelector('#property').value];
 const editor=document.createElement(example.tag);
 document.querySelector('#editor').replaceChildren(editor);
 editor.addEventListener('flow-value', event=>document.querySelector('#status').textContent='Draft value: '+String(event.detail.value)+'; valid: '+String(event.detail.valid !== false));
 editor.setState({propertyDefinition:example.definition,value:example.value,context:{scopes:{input:{paths:[{path:'input.count',type:'number'},{path:'input.name',type:'string'}]},local:{paths:[{path:'local.total',type:'number'}]}}}});
}
document.querySelector('#property').addEventListener('change',show);show();
</script></body></html>`;
const server = http.createServer((request, response) => {
  if (request.url !== '/') { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(html);
});
server.listen(0, '127.0.0.1', () => console.log('Qualification URL: http://127.0.0.1:' + server.address().port + '/'));
