const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../_flow/Engine.js'), 'utf8');
const start = source.indexOf('\tfunction frontendReferenceRoots(');
const end = source.indexOf('\n\tfunction frontendReferenceCliArgs(', start);
assert.ok(start >= 0 && end > start);

test('frontend references include the exact engine and portable libraries outside sibling directories', () => {
  const engine = '/isolated/engine';
  const provider = '/isolated/provider';
  const portable = '/external/portable';
  const ui = '/external/ui';
  const context = {
    frontendResourceProjectRoot: () => provider,
    projectNameForRoot: root => root === provider ? 'provider' : root,
    flowProjectRootFromFlowDir: root => path.dirname(root),
    engineDir: () => engine + '/_flow',
    sourcePaths: () => ({ path: suffix => '_flow/' + suffix }),
    projectDir: () => '/app',
    canonicalPath: root => root,
    referencedProjectRoots: suffix => suffix.endsWith('/blocks')
      ? [portable, ui] : [provider, ui]
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  assert.deepEqual(Array.from(context.frontendReferenceRoots('/app', provider)),
    [engine, portable, ui]);
});
