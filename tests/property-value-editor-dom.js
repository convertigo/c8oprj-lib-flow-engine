const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require(process.argv[2] || 'jsdom');
const root = path.join(__dirname, '../_flow');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const types = { value:{type:'unknown',editor:{valueEncoding:'typed',expressions:true}} };
const messages = [];
const dom = new JSDOM('<div id="app"></div><script>window.FlowPropertyValueCodec = '
  + read('modules/property-value-codec.js') + ';window.FlowPropertyValueTypes = ' + JSON.stringify(types) + ';</script>'
  + read('types/editors/literal.html') + read('types/editors/value.html') + '<script>' + read('resources/property-editor.js') + '</script>', {
  runScripts:'dangerously', beforeParse(window) {
    window.HTMLElement.prototype.scrollIntoView = function () {};
    window.flowEditor = {receive(message) {messages.push(JSON.parse(message));}};
  }
});
const {document,Event} = dom.window;
dom.window.receiveFromJava({mode:'property',embedded:true,property:'left',value:'{{ input.n }}',propertyDefinition:{kind:'value',type:'number'}});
const editor = document.querySelector('flow-value-editor');
editor.shadowRoot.querySelector('[data-mode=literal]').click();
const input = editor.shadowRoot.querySelector('flow-literal-editor').shadowRoot.querySelector('[data-number]');
for (const [text,valid] of [['7',true],['',false],['0',true]]) {
  messages.length=0; input.value=text; input.dispatchEvent(new Event('input',{bubbles:true,composed:true}));
  assert.ok(messages.length);
  assert.ok(messages.every(message=>message.valid===valid), JSON.stringify(messages));
  assert.equal(messages.at(-1).value,text);
}
dom.window.receiveFromJava({mode:'picker',singleProperty:true,property:'left',definition:{left:7},info:{propertyDefinitions:{left:{kind:'value',type:'number'}}}});
const picked = document.querySelector('flow-value-editor').shadowRoot.querySelector('flow-literal-editor').shadowRoot.querySelector('[data-number]');
const apply=document.querySelector('[data-apply-picked]');
picked.value=''; picked.dispatchEvent(new Event('input',{bubbles:true,composed:true}));
assert.equal(apply.disabled,true);
assert.match(document.querySelector('[data-value-error]').textContent,/number/);
picked.value='7'; picked.dispatchEvent(new Event('input',{bubbles:true,composed:true}));
assert.equal(apply.disabled,false); apply.click();
assert.equal(messages.at(-1).value,'7');
dom.window.close();
console.log('property value DOM: same codec validates Eclipse property host and web Source Picker');
