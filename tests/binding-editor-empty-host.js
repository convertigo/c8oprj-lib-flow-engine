const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require(process.argv[2] || 'jsdom');
const root = path.join(__dirname, '../_flow');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const types = { binding:{type:'object',editor:{tag:'flow-binding-editor',valueEncoding:'typed'}} };
const messages = [];
const dom = new JSDOM('<div id="app"></div><script>window.FlowPropertyValueCodec = '
  + read('modules/property-value-codec.js') + ';window.FlowPropertyValueTypes = ' + JSON.stringify(types) + ';</script>'
  + ['literal', 'path', 'binding'].map(name => read('types/editors/' + name + '.html')).join('')
  + '<script>' + read('resources/property-editor.js') + '</script>', {
  runScripts:'dangerously', beforeParse(window) {
    window.HTMLElement.prototype.scrollIntoView = function () {};
    window.flowEditor = {receive(message) {messages.push(JSON.parse(message));}};
  }
});
const {document,Event} = dom.window;
const local = {source:{category:'local',name:'myMCP',scopeId:'home'},label:'page.myMCP',schema:{type:'string'},paths:[]};
// A binding property not set opens in its picker without becoming a value, nor an invalid one.
dom.window.receiveFromJava({mode:'property',embedded:true,property:'classes',value:'',
  propertyDefinition:{kind:'binding',type:'object'},bindingSources:[local]});
assert.ok(messages.length, 'the host tells the value it opens with');
assert.deepEqual(messages.map(message => [message.value, message.valid, message.error]), messages.map(() => ['', true, '']),
  JSON.stringify(messages));
const editor = document.querySelector('flow-binding-editor');
assert.ok(editor, 'the binding editor of the property');
const select = editor.shadowRoot.querySelector('[data-source]');
assert.match(select.selectedOptions[0].textContent, /Choose a value/);
// Choosing a value makes it the value of the property.
messages.length = 0;
select.value = '0';
select.dispatchEvent(new Event('change', {bubbles:true}));
const chosen = JSON.parse(messages.at(-1).value);
assert.deepEqual(chosen.source, local.source);
assert.equal(messages.at(-1).valid, true);
dom.window.close();
console.log('binding editor empty host: an empty binding opens empty and valid, a chosen value is set');
