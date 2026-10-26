const {spawnSync} = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const run = spawnSync('java', ['-cp', path.join(root, 'libs/build/classes'), path.join(__dirname, 'HttpClientReuseTest.java')], {encoding:'utf8', timeout:60000});
if (run.status !== 0) { console.error('HTTP transport contract failed:', run.error ? run.error.name : run.status); process.exit(1); }
if (!run.stdout.includes('PASS shared HTTP transports')) throw new Error('Missing transport contract result');
console.log(run.stdout.trim());
