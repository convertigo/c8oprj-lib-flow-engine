const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const traits = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../_flow/modules/trait-composition.js'), 'utf8'));
const plain = value => JSON.parse(JSON.stringify(value));

const catalog = {
  'ui.trigger': { properties: {
    reentrancy: { label: 'When triggered again', kind: 'reentrancy', type: 'string', enum: ['drop', 'latest', 'serial', 'parallel'],
      default: 'parallel', category: 'Expert', description: 'What happens when this event fires again while its actions still run.' },
    debounceMs: { label: 'Debounce (ms)', kind: 'number', type: 'number', default: 0, category: 'Expert', description: 'Waits this long without a new trigger before running.' }
  } },
  'ui.event': { includes: ['ui.trigger'], properties: {} },
  'ui.surface': { properties: { background: { label: 'Background', kind: 'color', type: 'string', role: 'background', description: 'Background of the element.', note: 'Theme tokens follow light and dark modes.' } } },
  'ui.paint': { properties: { background: { label: 'Paint', kind: 'color', type: 'string', description: 'Paint behind the content.' } } },
  'ui.silent': { properties: { hush: { kind: 'boolean', type: 'boolean' } } }
};

// A block composes a trait through another one, changes a default and adds a note.
const click = traits.compose({ properties: { label: { kind: 'text', description: 'Label.' } },
  traits: { 'ui.event': { reentrancy: { default: 'drop', note: 'A button stays disabled meanwhile.' } } } }, catalog);
assert.deepEqual(plain(click.traits), ['ui.trigger', 'ui.event'], 'included traits come first');
assert.deepEqual(Object.keys(click.properties), ['label', 'reentrancy', 'debounceMs'], 'own properties first, then trait properties');
assert.equal(click.properties.reentrancy.default, 'drop', 'the block changes the default');
assert.equal(click.properties.reentrancy.trait, 'ui.trigger');
assert.equal(click.properties.reentrancy.usage, 'What happens when this event fires again while its actions still run.');
assert.equal(click.properties.reentrancy.description, 'What happens when this event fires again while its actions still run. A button stays disabled meanwhile.',
  'usage from the trait, then the block note: nothing is rewritten');
assert.equal(click.properties.debounceMs.default, 0, 'untouched trait property keeps the trait default');
assert.deepEqual(plain(click.diagnostics), []);

// Notes accumulate: trait then block.
const card = traits.compose({ traits: { 'ui.surface': { background: { default: 'surface', note: 'Also colors the header.' } } } }, catalog);
assert.equal(card.properties.background.description, 'Background of the element. Theme tokens follow light and dark modes. Also colors the header.');
assert.deepEqual(plain(card.properties.background.notes), ['Theme tokens follow light and dark modes.', 'Also colors the header.']);
assert.equal(card.properties.background.role, 'background');

// A block cannot change the meaning of a trait property.
const meaning = traits.compose({ traits: { 'ui.surface': { background: { type: 'number', description: 'Another meaning.' } } } }, catalog);
assert.deepEqual(plain(meaning.diagnostics.map(d => d.code + ':' + d.field)), ['TRAIT_MEMBER_MEANING_CHANGED:type', 'TRAIT_MEMBER_MEANING_CHANGED:description']);
assert.equal(meaning.properties.background.type, 'string');
assert.equal(meaning.properties.background.usage, 'Background of the element.');

// Two traits bring the same member: the block must choose.
const diamond = traits.compose({ traits: ['ui.surface', 'ui.paint'] }, catalog);
assert.deepEqual(plain(diamond.diagnostics.map(d => d.code)), ['TRAIT_MEMBER_CONFLICT']);
const chosen = traits.compose({ traits: { 'ui.surface': {}, 'ui.paint': { background: { from: 'ui.surface' } } } }, catalog);
assert.deepEqual(plain(chosen.diagnostics), []);
assert.equal(chosen.properties.background.trait, 'ui.surface');

// A block's own property cannot shadow a trait member.
const shadow = traits.compose({ properties: { background: { kind: 'text', description: 'Mine.' } }, traits: ['ui.surface'] }, catalog);
assert.deepEqual(plain(shadow.diagnostics.map(d => d.code)), ['TRAIT_MEMBER_SHADOWED']);
assert.equal(shadow.properties.background.description, 'Mine.');

// A trait property must say what it is for.
assert.deepEqual(plain(traits.compose({ traits: ['ui.silent'] }, catalog).diagnostics.map(d => d.code)), ['TRAIT_PROPERTY_USAGE_MISSING']);

// Role traits without a definition stay plain names; cycles are reported.
assert.deepEqual(plain(traits.compose({ traits: ['ui.block', 'ui.interactive'] }, catalog).traits), ['ui.block', 'ui.interactive']);
const cycle = traits.compose({ traits: ['a'] }, { a: { includes: ['b'], properties: {} }, b: { includes: ['a'], properties: {} } });
assert.deepEqual(plain(cycle.diagnostics.map(d => d.code)), ['TRAIT_INCLUDE_CYCLE']);
console.log('trait-composition tests passed');
