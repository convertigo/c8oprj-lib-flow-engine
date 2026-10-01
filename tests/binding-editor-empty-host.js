const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require(process.argv[2] || 'jsdom');
const root = path.join(__dirname, '../_flow');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const types = { binding:{type:'object',editor:{tag:'flow-binding-editor',valueEncoding:'json'}} };
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
// The shared host reads editor.value on opening: it must receive the original value,
// not the editor's normalized rendering or an initialization event from a child.
for (const value of [
  '~/product/77/',
  '@route.params.id',
  'A plain literal',
  '0',
  'false',
  JSON.stringify({value:'Title',mode:'literal'}, null, 2),
  JSON.stringify({mode:'expression',expression:'1 + 2'}),
  JSON.stringify({path:[],source:local.source,mode:'source'})
]) {
  messages.length = 0;
  dom.window.receiveFromJava({mode:'property',embedded:true,property:'text',value,
    propertyDefinition:{kind:'binding',type:'object'},bindingSources:[local]});
  assert.equal(messages.length, 1, 'one initial host value, no child initialization edit');
  assert.equal(messages[0].value, value, 'opening preserves the exact host value');
  assert.equal(messages[0].valid, true);
  const active = document.querySelector('flow-binding-editor').shadowRoot.querySelector('[data-mode].active');
  active.click();
  assert.equal(messages.length, 1, 'reselecting the mode does not mark the host dirty');
}
// Initial native values are not encoded writes. Authored writes still go through
// the transport codec, even when a custom editor claims they are valid.
messages.length = 0;
document.querySelector('flow-binding-editor').dispatchEvent(new dom.window.CustomEvent('flow-value', {
  detail:{value:'not encoded JSON',valid:true},bubbles:true
}));
assert.equal(messages.at(-1).valid, false);
assert.match(messages.at(-1).error, /valid object/);
// Unchanged initialization does not suppress the type editor's own validation.
dom.window.customElements.define('flow-validation-proof-editor', class extends dom.window.HTMLElement {
  setState(state) { this.state = state; }
  get value() { return this.state.value; }
  get valid() { return false; }
  get validationError() { return 'Invalid typed value'; }
});
messages.length = 0;
dom.window.receiveFromJava({mode:'property',embedded:true,property:'proof',value:'reader-native',
  propertyDefinition:{kind:'proof',editorClass:'flow-validation-proof-editor'}});
assert.equal(messages.at(-1).value, 'reader-native');
assert.equal(messages.at(-1).valid, false);
assert.equal(messages.at(-1).error, 'Invalid typed value');
dom.window.receiveFromJava({mode:'property',embedded:true,property:'classes',value:'',
  propertyDefinition:{kind:'binding',type:'object'},bindingSources:[local]});
// Choosing a value makes it the value of the property.
messages.length = 0;
const currentSelect = document.querySelector('flow-binding-editor').shadowRoot.querySelector('[data-source]');
currentSelect.value = '0';
currentSelect.dispatchEvent(new Event('change', {bubbles:true}));
const chosen = JSON.parse(messages.at(-1).value);
assert.deepEqual(chosen.source, local.source);
assert.equal(messages.at(-1).valid, true);
dom.window.close();
console.log('binding editor empty host: an empty binding opens empty and valid, a chosen value is set');
