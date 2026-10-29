const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require(process.argv[2] || 'jsdom');
const root = path.join(__dirname, '../_flow/types/editors');
const html = ['literal', 'path', 'binding'].map(name =>
  fs.readFileSync(path.join(root, name + '.html'), 'utf8')).join('');
const dom = new JSDOM(html, { runScripts: 'dangerously' });
const { document, Event } = dom.window;
dom.window.scrollTo = () => {};
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
const editor = document.createElement('flow-binding-editor');
document.body.append(editor);

// A lazy picker lists every source with its root type; the paths of a container
// source are asked to the host when the author chooses it.
const copySource = { category: 'local', name: 'copy', scopeId: 'page' };
const querySource = { category: 'local', name: 'query', scopeId: 'page' };
const copyPaths = [{ path: 'title', type: 'string' }, { path: 'items', type: 'array' }, { path: 'items[0]', type: 'string' }];
function lazySources() {
  return [
    { category: 'local', id: 'query', label: 'local.query', source: querySource, schema: { type: 'string' }, paths: [] },
    { category: 'local', id: 'copy', label: 'local.copy', source: copySource, schema: { type: 'object' }, pathsDeferred: true }
  ];
}
const requests = [];
let answer = null;
editor.flowHost = {
  request: () => { throw new Error('a deferred source must be asked asynchronously'); },
  requestAsync: (name, payload, callback) => {
    // Objects made by the editor belong to the DOM realm.
    requests.push({ name, payload: JSON.parse(JSON.stringify(payload)) });
    answer = callback;
  }
};
const selected = () => editor.shadowRoot.querySelector('[data-source]');
const hint = () => editor.shadowRoot.querySelector('[data-source-hint]').textContent;
const pathButtons = () => [...editor.shadowRoot.querySelector('flow-path-editor').shadowRoot
  .querySelectorAll('button[data-path]')].map(button => button.getAttribute('data-path'));

// Opening a literal value asks nothing: the first screen shows no source paths.
editor.setState({ virtualPath: 'frontends.svelte.page.title', property: 'text', value: { mode: 'literal', value: 'Hello' },
  bindingSources: lazySources() });
assert.equal(requests.length, 0, 'opening never asks the paths of a source that is not shown');

// Choosing the deferred source asks its paths once and shows them on the answer.
editor.shadowRoot.querySelector('[data-mode="source"]').click();
selected().value = String([...selected().options].findIndex(option => /local\.copy/.test(option.textContent)));
selected().dispatchEvent(new Event('change', { bubbles: true }));
assert.equal(requests.length, 1, 'the deferred source is asked when chosen');
assert.equal(requests[0].name, 'bindingSourceDetail');
assert.deepEqual(requests[0].payload, { property: 'text', source: copySource });
assert.match(hint(), /Loading the properties/);
assert.deepEqual(pathButtons(), []);
const value = JSON.parse(editor.value);
assert.deepEqual(value.source, copySource, 'the chosen source is the value before its paths are known');
answer({ ok: true, bindingSources: [lazySources()[0],
  { category: 'local', id: 'copy', label: 'local.copy', source: copySource, schema: { type: 'object' }, paths: copyPaths }] });
assert.deepEqual(pathButtons(), ['title', 'items', 'items[0]'], 'the answered paths are listed');
assert.match(hint(), /Choose a property from this source/);
assert.deepEqual(JSON.parse(editor.value), value, 'an answer never changes the value');

// The answer is kept for the target: a new state of the same target asks nothing again.
editor.setState({ virtualPath: 'frontends.svelte.page.title', property: 'text',
  value: { mode: 'source', source: copySource, path: [{ kind: 'property', name: 'title' }] }, bindingSources: lazySources() });
assert.equal(requests.length, 1, 'a source is asked once per target');
assert.deepEqual(pathButtons(), ['title', 'items', 'items[0]']);

// A failed answer shows that the paths are unknown; choosing the source again retries.
editor.setState({ virtualPath: 'frontends.svelte.page.subtitle', property: 'text',
  value: { mode: 'source', source: copySource, path: [] }, bindingSources: lazySources() });
assert.equal(requests.length, 2, 'another target asks its own paths');
answer({ ok: false, error: 'unavailable' });
assert.match(hint(), /could not be loaded/);
assert.deepEqual(JSON.parse(editor.value), { mode: 'source', source: copySource, path: [] });
selected().dispatchEvent(new Event('change', { bubbles: true }));
assert.equal(requests.length, 3, 'choosing the source again retries');
answer({ ok: true, bindingSources: [{ category: 'local', id: 'copy', label: 'local.copy', source: copySource,
  schema: { type: 'object' }, paths: copyPaths }] });
assert.deepEqual(pathButtons(), ['title', 'items', 'items[0]']);

// A host that answers at once is used the same way, within the render.
let syncRequests = 0;
editor.flowHost = {
  request: (name, payload) => {
    syncRequests++;
    return { ok: true, bindingSources: [{ source: payload.source, label: 'local.copy', schema: { type: 'object' }, paths: copyPaths }] };
  }
};
editor.setState({ virtualPath: 'frontends.svelte.page.caption', property: 'text',
  value: { mode: 'source', source: copySource, path: [] }, bindingSources: lazySources() });
assert.equal(syncRequests, 1);
assert.deepEqual(pathButtons(), ['title', 'items', 'items[0]']);
assert.match(hint(), /Choose a property from this source/);

// Fully described sources (any other host) are never asked.
let fullRequests = 0;
editor.flowHost = { request: () => { fullRequests++; return {}; }, requestAsync: () => { fullRequests++; } };
editor.setState({ virtualPath: 'frontends.svelte.page.footer', property: 'text',
  value: { mode: 'source', source: copySource, path: [] },
  bindingSources: [{ category: 'local', id: 'copy', label: 'local.copy', source: copySource, schema: { type: 'object' }, paths: copyPaths }] });
assert.equal(fullRequests, 0);
assert.deepEqual(pathButtons(), ['title', 'items', 'items[0]']);

console.log('binding-editor-deferred-paths-dom OK');
