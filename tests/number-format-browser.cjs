// number.format in a page (format.browser.js, Intl.NumberFormat) writes the texts of fixtures/number-format-cases.json,
// the same as the server (number-format-block.js).
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const format = eval('(' + fs.readFileSync(path.join(root, '_flow/blocks/number/format.browser.js'), 'utf8') + ')');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/number-format-cases.json'), 'utf8'));
for (const item of fixture.cases) {
  if (item.context) globalThis.document = { documentElement: { lang: item.context.pageLang } };
  else delete globalThis.document;
  assert.equal(format(item.input), item.expected, JSON.stringify(item.input));
}
delete globalThis.document;
globalThis.document = {};
assert.equal(format({ value: 1234.5 }), '1 234,5', 'missing documentElement falls back to fr-FR');
delete globalThis.document;
for (const item of fixture.errors) assert.throws(() => format(item.input), (e) => e && e.code === item.error, JSON.stringify(item.input));
console.log(JSON.stringify({ ok: true, cases: fixture.cases.length, errors: fixture.errors.length }));
