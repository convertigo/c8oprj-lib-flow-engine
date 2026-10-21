// One algorithm for Rhino and the browser. --check verifies committed peers.
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, '_flow/lib/rows.js'), 'utf8').trim();
for (const name of ['formatCells', 'distinct', 'group', 'select', 'read']) {
  const file = path.join(root, '_flow/blocks/rows', name + '.browser.js');
  const code = 'function (input, control) {\n  // Generated from _flow/lib/rows.js; run node tools/build-rows-browser.cjs.\n  var rows = ' + source + ';\n  return rows.' + name + '(input || {}, control);\n}\n';
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== code) throw Error('Stale browser peer: ' + file);
  } else fs.writeFileSync(file, code);
}
