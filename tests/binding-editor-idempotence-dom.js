const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require(process.argv[2] || 'jsdom');
const root = path.join(__dirname, '../_flow/types/editors');
const html = ['literal', 'path', 'binding'].map(name =>
  fs.readFileSync(path.join(root, name + '.html'), 'utf8')).join('');
const dom = new JSDOM(html, { runScripts: 'dangerously' });
dom.window.scrollTo = () => {};
const { document, Event } = dom.window;
dom.window.customElements.define('flow-test-literal-editor', class extends dom.window.HTMLElement {
  setState() {
    this.dispatchEvent(new dom.window.CustomEvent('flow-value', {
      bubbles: true, composed: true, detail: { value: '"Initialization is not an edit"' }
    }));
  }
});
const editor = document.createElement('flow-binding-editor');
document.body.append(editor);
const source = { category: 'route', value: 'route' };
const bindingSources = [{ source, label: 'route', schema: { type: 'object' }, paths: [] }];
let emitted = 0;
editor.addEventListener('flow-value', () => emitted++);
const composed = { mode: 'expression', parts: [
  { kind: 'source', source, path: [{ kind: 'property', name: 'params' }] },
  { kind: 'expression', expression: '+' },
  { kind: 'literal', value: ' details' }
] };
// Rendering an editable representation is not a request to rewrite the stored value.
for (const value of [
  JSON.stringify({ path: [], source, mode: 'source' }, null, 2),
  { mode: 'literal', value: 'Title' },
  { mode: 'expression', expression: '1 + 2' },
  composed,
  'Legacy literal'
]) {
  emitted = 0;
  const original = typeof value === 'string' ? value : JSON.stringify(value);
  editor.setState({ value, bindingSources });
  assert.equal(emitted, 0, 'opening does not emit an edit');
  assert.equal(editor.value, original, 'opening preserves the value, including its representation');
  const mode = typeof value === 'object' ? value.mode
    : value.startsWith('{') ? JSON.parse(value).mode : 'literal';
  editor.shadowRoot.querySelector(`[data-mode="${mode}"]`).click();
  assert.equal(emitted, 0, 'reselecting the current mode is not an edit: ' + original);
  assert.equal(editor.value, original);
  editor.setState({ value, bindingSources: [] });
  assert.equal(editor.value, original, 'catalog refresh does not rewrite the value');
}
editor.setState({ value: composed, bindingSources });
emitted = 0;
editor.shadowRoot.querySelector('[data-part-action="select"]').click();
assert.equal(emitted, 0, 'focusing a composition source is not an edit');
assert.equal(editor.value, JSON.stringify(composed));
// A real author edit still emits the current, typed value.
editor.shadowRoot.querySelector('[data-mode="literal"]').click();
assert.equal(emitted, 1);
const literal = editor.shadowRoot.querySelector('flow-literal-editor');
const input = literal.shadowRoot.querySelector('textarea, input');
input.value = 'Edited title';
input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
assert.ok(emitted > 1);
assert.deepEqual(JSON.parse(editor.value), { mode: 'literal', value: 'Edited title' });
assert.equal(editor.valid, true);
// A plugin editor may notify on initialization: the composite must not treat it
// as an author edit or let that child event escape to its host.
emitted = 0;
const customLiteral = JSON.stringify({ mode: 'literal', value: 'Original title' });
editor.setState({ value: customLiteral,
  propertyDefinition: { literalEditorClass: 'flow-test-literal-editor' } });
editor.render();
assert.equal(emitted, 0, 'programmatic rendering of any child editor is not an author edit');
assert.equal(editor.value, customLiteral);
editor.shadowRoot.querySelector('flow-test-literal-editor').dispatchEvent(new dom.window.CustomEvent('flow-value', {
  bubbles: true, composed: true, detail: { value: '"Actual child edit"' }
}));
assert.equal(emitted, 1, 'a real child edit is still propagated after rendering');
assert.deepEqual(JSON.parse(editor.value), { mode: 'literal', value: 'Actual child edit' });
dom.window.close();
console.log('binding editor idempotence DOM OK: opening, active mode and composition focus preserve the value');
