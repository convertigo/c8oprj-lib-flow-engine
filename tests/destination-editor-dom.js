const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require(process.argv[2] || 'jsdom');
const root = path.join(__dirname, '../_flow');
const contract = fs.readFileSync(path.join(root, 'modules/destination-contract.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'types/editors/path.html'), 'utf8');
const dom = new JSDOM('<script>window.FlowDestinationContract = ' + contract + ';</script>' + html, { runScripts: 'dangerously' });
const { document, Event } = dom.window;
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
const editor = document.createElement('flow-path-editor');
document.body.append(editor);
const context = { scopes: Object.fromEntries(['input', 'config', 'request', 'trace', 'current', 'local', 'result'].map(scope =>
  [scope, { paths: [scope, scope + '.value', scope + '.items[0]', scope + '.__proto__'] }])) };
editor.setState({ propertyDefinition: { kind: 'path', mode: 'write' }, value: 'local..bad', context });
assert.equal(editor.value, 'local..bad', 'existing invalid values must not be normalized to another destination');
assert.equal(editor.valid, false);
const paths = () => Array.from(editor.shadowRoot.querySelectorAll('[data-path]'), button => button.dataset.path);
assert.deepEqual(paths(), ['local.value', 'result.value']);
const events = [];
editor.addEventListener('flow-value', event => events.push(event.detail));
const input = editor.shadowRoot.querySelector('input');
for (const value of ['input.secret', 'local.dict[{{ input.key }}].value', 'local.__proto__.bad', 'local', 'local.ok', '']) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  const expected = dom.window.FlowDestinationContract.validate(value);
  assert.equal(editor.valid, expected.valid);
  assert.equal(events.at(-1).valid, expected.valid);
  assert.equal(editor.shadowRoot.querySelector('[role=alert]').textContent, expected.message || '');
}
editor.shadowRoot.querySelector('[data-path="result.value"]').click();
assert.equal(editor.value, 'result.value');
assert.equal(events.at(-1).valid, true);
editor.setState({ propertyDefinition: { kind: 'path', mode: 'read' }, value: 'input.items[0]', context });
assert.equal(editor.valid, true);
assert.equal(editor.value, 'input.items[0]');
assert.ok(paths().includes('input.value'), 'read pickers retain input/config scopes');
editor.setState({ propertyDefinition: { kind: 'path', mode: 'write' }, value: 'state.value',
  context: { destinationPolicy: { roots: ['state'] }, scopes: { state: { paths: ['state.value'] }, local: { paths: ['local.value'] } } } });
assert.equal(editor.valid, true);
assert.deepEqual(paths(), ['state.value'], 'environment policy is consumed, not a frontend/backend name switch');
editor.setState({propertyDefinition:{kind:'path',mode:'write',targetType:'array',required:true},value:'local.name',
 context:{scopes:{local:{paths:[{path:'local.items',type:'array'},{path:'local.name',type:'string'}]}}}});
assert.equal(editor.valid,false);assert.deepEqual(paths(),['local.items']);
editor.shadowRoot.querySelector('[data-path="local.items"]').click();assert.equal(editor.valid,true);
dom.window.close();
// The production Source Picker host must honor editor validity, including an
// invalid initial value and a programmatically dispatched Apply click.
const messages = [];
const hostScript = fs.readFileSync(path.join(root, 'resources/property-editor.js'), 'utf8');
const host = new JSDOM('<div id="app"></div><script>window.FlowDestinationContract = ' + contract + ';</script>' + html + '<script>' + hostScript + '</script>', {
  runScripts: 'dangerously', beforeParse(window) {
    window.HTMLElement.prototype.scrollIntoView = function () {};
    window.flowEditor = { receive(message) { messages.push(JSON.parse(message)); } };
  }
});
host.window.receiveFromJava({ mode: 'picker', property: 'target', singleProperty: true,
  definition: { target: 'input.bad' }, info: { propertyDefinitions: { target: { kind: 'path', mode: 'write' } } }, context });
const apply = host.window.document.querySelector('[data-apply-picked]');
const hosted = host.window.document.querySelector('flow-path-editor');
assert.equal(apply.disabled, true);
apply.dispatchEvent(new host.window.Event('click', { bubbles: true }));
assert.equal(messages.length, 0);
const hostedInput = hosted.shadowRoot.querySelector('input');
hostedInput.value = 'local.answer';
hostedInput.dispatchEvent(new host.window.Event('input', { bubbles: true }));
assert.equal(apply.disabled, false);
apply.click();
assert.deepEqual(messages.at(-1), { type: 'setProperty', property: 'target', value: 'local.answer' });
host.window.close();
// Real browser inputs cross the shadow boundary (unlike a default synthetic
// input). The generic host must not overwrite the editor's invalid verdict.
const propertyMessages = [];
const propertyHost = new JSDOM('<div id="app"></div><script>window.FlowDestinationContract = ' + contract + ';</script>' + html + '<script>' + hostScript + '</script>', {
  runScripts: 'dangerously', beforeParse(window) {
    window.HTMLElement.prototype.scrollIntoView = function () {};
    window.flowEditor = { receive(message) { propertyMessages.push(JSON.parse(message)); } };
  }
});
propertyHost.window.receiveFromJava({mode:'property', embedded:true, property:'out', value:'local.answer',
  propertyDefinition:{kind:'path',mode:'write'}, context});
const propertyInput = propertyHost.window.document.querySelector('flow-path-editor').shadowRoot.querySelector('input');
for (const [value, valid] of [['input.bad',false],['local.answer',true]]) {
  propertyMessages.length = 0;
  propertyInput.value = value;
  propertyInput.dispatchEvent(new propertyHost.window.Event('input',{bubbles:true,composed:true}));
  assert.ok(propertyMessages.length > 0);
  assert.ok(propertyMessages.every(message => message.valid === valid), 'every host path must preserve editor validity');
}
propertyHost.window.close();
console.log('destination editor DOM: shared policy, filtering, validation, read picker and environment override OK');
