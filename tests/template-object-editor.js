const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../_flow/types/editors/template.html'), 'utf8');
let Editor;
vm.runInNewContext(html.match(/<script>([\s\S]*)<\/script>/)[1], {
  HTMLElement: class { dispatchEvent(event) { this.lastEvent = event; } },
  CustomEvent: class { constructor(name, options) { this.detail = options.detail; } },
  customElements: { get() {}, define(name, editor) { Editor = editor; } }
});
const editor = new Editor();
editor.setState({ propertyDefinition: { type: 'object' }, value: '' });
assert.equal(editor._entries.length, 0);
editor._entries.push({ name: 'latitude', value: '48.85' }, { name: 'current', value: 'temperature_2m' });
editor.syncEntries();
assert.deepEqual(JSON.parse(editor.value), { latitude: '48.85', current: 'temperature_2m' });
editor.setState({ propertyDefinition: { type: 'object' }, value: editor.value });
assert.equal(editor._entries.length, 2);
editor._entries.push({ name: 'latitude', value: 'other' });
editor.syncEntries();
assert.equal(editor.lastEvent.detail.valid, false);
assert.equal(JSON.parse(editor.value).latitude, '48.85', 'invalid edits must not replace the last valid object');
for (const value of ['{{ input.query }}', '{"nested":{"key":1}}', '{"count":2}', '[1,2]']) {
  editor.setState({ propertyDefinition: { type: 'object' }, value });
  assert.equal(editor._entries, null);
  assert.equal(editor.value, value, 'unsupported structured values must be preserved');
  assert.equal(editor.lastEvent.detail.valid, true);
}
editor.setState({ propertyDefinition: { type: 'string' }, value: 'hello' });
assert.equal(editor._entries, null);
assert.equal(editor.value, 'hello');
console.log('template object editor tests passed');
