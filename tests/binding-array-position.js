const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../_flow/types/editors/binding.html'), 'utf8');
let Editor;
vm.runInNewContext(html.match(/<script>([\s\S]*)<\/script>/)[1], {
  HTMLElement: class {},
  customElements: { get() {}, define(name, editor) { Editor = editor; } }
});
const editor = new Editor();
editor.render = () => {};
const property = name => ({ kind: 'property', name });
const iteration = scopeId => ({ category: 'iteration', scopeId, value: 'index' });
const binding = {
  mode: 'source', source: { category: 'requestable', actionId: 'weather' },
  path: [property('weather'), property('body'), { kind: 'index', index: 0, source: iteration('cities') }, property('current'), property('temperature_2m')]
};
editor.setState({ value: binding });
const serialized = editor.value;
const lowered = JSON.parse(serialized);
assert.equal(lowered.mode, 'expression');
assert.equal(editor.valid, true);
assert.deepEqual(lowered.parts.map(part => part.kind), ['source', 'expression', 'source', 'expression']);
assert.equal(lowered.parts[1].expression, '?.[');
assert.equal(lowered.parts[3].expression, ']?.["current"]?.["temperature_2m"]');
function evaluate(parts, data, indices) {
  const args = [], names = [];
  const expression = parts.map(part => {
    if (part.kind === 'expression') return part.expression;
    let value = part.source.category === 'iteration' ? indices[part.source.scopeId] : data;
    for (const segment of part.path || []) value = value?.[segment.kind === 'index' ? segment.index : segment.name];
    names.push('p' + names.length); args.push(value);
    return names.at(-1);
  }).join('');
  return Function(...names, 'return (' + expression + ')')(...args);
}
const response = { weather: { body: [{ current: { temperature_2m: 18 } }, { current: { temperature_2m: 25 } }] } };
assert.equal(evaluate(lowered.parts, response, { cities: 0 }), 18);
assert.equal(evaluate(lowered.parts, response, { cities: 1 }), 25);
assert.equal(evaluate(lowered.parts, undefined, { cities: 0 }), undefined);
assert.equal(evaluate(lowered.parts, response, { cities: 9 }), undefined);
editor.setState({ value: serialized });
assert.equal(editor._binding.mode, 'source', 'reopening keeps the human source editor');
assert.equal(editor._binding.path[2].source.scopeId, 'cities');
assert.equal(editor.value, serialized, 'round trip preserves the persisted contract');
const nested = JSON.parse(JSON.stringify(binding));
nested.path.push({ kind: 'index', index: 0, source: iteration('nested') }, property('quoted"name'));
editor.setState({ value: nested });
const nestedValue = editor.value;
editor.setState({ value: nestedValue });
assert.equal(editor._binding.mode, 'source');
assert.equal(editor.value, nestedValue);
assert.equal(editor._binding.path[5].source.scopeId, 'nested');
const manual = { mode: 'expression', expression: 'local.value + 1' };
editor.setState({ value: manual });
assert.equal(editor._binding.mode, 'expression');
const fallback = { mode: 'source', source: binding.source, path: [property('value')], fallback: 'missing' };
editor.setState({ value: fallback });
assert.deepEqual(JSON.parse(editor.value), fallback);
editor.setState({ value: serialized });
editor.setMode('expression');
assert.equal(editor.valid, true);
assert.equal(editor.value, serialized);
const positions = {};
editor.shadowRoot = { querySelector: () => positions };
editor.setState({ value: serialized, bindingSources: [{ source: iteration('cities'), label: 'Cities' }] });
editor.renderArrayPositions();
assert.match(positions.innerHTML, /data-array-position="2"/);
assert.match(positions.innerHTML, /value="0" selected>Iteration index — Cities/);
editor.setMode('expression');
editor.renderArrayPositions();
assert.equal(positions.innerHTML, '');
assert.match(html, /var category = this.shadowRoot.querySelector\("\[data-category\]"\);\s*var allSources = sources\(this._state\);\s*this.renderArrayPositions\(\);/, 'source render must refresh the array controls, not only the composition preview');
editor.setState({ value: { ...binding, textBefore: 'Temperature: ', textAfter: ' °C' } });
const formatted = editor.value;
assert.equal(editor.valid, true);
assert.equal(JSON.parse(formatted).parts[0].value, 'Temperature: ');
assert.equal(JSON.parse(formatted).parts.at(-1).value, ' °C');
editor.setState({ value: formatted });
assert.equal(editor._binding.mode, 'source');
assert.equal(editor._binding.textBefore, 'Temperature: ');
assert.equal(editor._binding.textAfter, ' °C');
assert.equal(editor.value, formatted);
console.log('binding array position tests passed');
