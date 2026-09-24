const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require(process.argv[2] || 'jsdom');
const root = path.join(__dirname, '../_flow/types/editors');
const html = ['literal', 'path', 'binding'].map(name =>
  fs.readFileSync(path.join(root, name + '.html'), 'utf8')).join('');
const dom = new JSDOM(html, { runScripts: 'dangerously' });
const { document, Event } = dom.window;
const editor = document.createElement('flow-binding-editor');
document.body.append(editor);
const property = name => ({ kind: 'property', name });
const saved = { mode: 'source', source: { category: 'local', name: 'copy', scopeId: 'page' },
  path: ['details', 'listInteractions', 'swipeTitle'].map(property) };
const date = { source: { category: 'local', name: 'startDate', scopeId: 'page' },
  label: 'local.startDate', schema: { type: 'string' }, paths: [] };
const current = { source: saved.source, label: 'local.copy', schema: { type: 'object' },
  paths: [{ path: 'details.listInteractions.swipeTitle', type: 'string' }] };
function selected() { return editor.shadowRoot.querySelector('[data-source]'); }
function pathEditor() { return editor.shadowRoot.querySelector('flow-path-editor'); }
let emitted = 0;
editor.addEventListener('flow-value', () => emitted++);
// Both hosts share the editor: object state (property editor) and JSON text (picker).
for (const value of [saved, JSON.stringify(saved)]) {
  editor.setState({ value, bindingSources: [date], context: { scopes: { input: { paths: ['input.unrelated'] } } } });
  assert.equal(emitted, 0, 'opening must never mutate the value');
  assert.deepEqual(JSON.parse(editor.value), saved);
  assert.equal(selected().value, '', 'never select the first unrelated available source');
  assert.match(selected().selectedOptions[0].textContent, /local.copy.details.listInteractions.swipeTitle.*unavailable/);
  assert.equal(pathEditor().shadowRoot.querySelector('[data-path-input]').classList.contains('hidden'), false);
  assert.equal(pathEditor().shadowRoot.querySelector('input').value, 'details.listInteractions.swipeTitle');
  assert.equal(pathEditor().shadowRoot.querySelector('.picker').textContent.includes('input.unrelated'), false,
    'global scope paths must not become relative fields of a missing source');
}
// An asynchronous catalog update restores selection without replacing the stored binding.
editor.setState({ value: saved, bindingSources: [date, current] });
assert.equal(selected().value, '1');
assert.deepEqual(JSON.parse(editor.value), saved);
const input = pathEditor().shadowRoot.querySelector('input');
input.value = 'details.listInteractions.title';
input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
assert.equal(JSON.parse(editor.value).path.at(-1).name, 'title');
assert.equal(saved.path.at(-1).name, 'swipeTitle', 'the editor must not mutate its host state');
assert.ok(emitted > 0);
selected().value = '0';
selected().dispatchEvent(new Event('change', { bubbles: true }));
assert.deepEqual(JSON.parse(editor.value).source, date.source);
assert.deepEqual(JSON.parse(editor.value).path, []);
editor.setState({ value: saved, bindingSources: [] });
assert.match(selected().selectedOptions[0].textContent, /local.copy.*unavailable/);
assert.deepEqual(JSON.parse(editor.value), saved);
const shadow = { ...current, source: { ...current.source, scopeId: 'otherLayout' } };
editor.setState({ value: saved, bindingSources: [shadow, current] });
assert.equal(selected().value, '1', 'same-name variables from different owners remain distinct');
// Composition also keeps a missing source; literal values are unaffected.
const composed = { mode: 'expression', parts: [{ kind: 'literal', value: 'Title: ' },
  { kind: 'source', source: saved.source, path: saved.path }] };
editor.setState({ value: composed, bindingSources: [date] });
assert.deepEqual(JSON.parse(editor.value), composed);
assert.match(selected().selectedOptions[0].textContent, /local.copy.*unavailable/);
editor.setState({ value: { mode: 'literal', value: 'Text' }, bindingSources: [date] });
assert.deepEqual(JSON.parse(editor.value), { mode: 'literal', value: 'Text' });
dom.window.close();
console.log('binding editor selection DOM OK: preserved source, honest selection, editable path, asynchronous sources');
