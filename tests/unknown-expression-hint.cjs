const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(name) {
  return vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../_flow/modules', name), 'utf8'), {
    JSON, Math, Number, Object, String, isNaN
  });
}

const expressions = load('expression-utils.js');
const validation = load('flow-script-validation-service.js');
const templateSyntax = load('template-syntax.js');
const expressionEnv = {
  templateSyntax,
  isScopePath: value => /^(input|config|local|current)(?:\.|$)/.test(String(value)),
  normalizeTree: value => value,
  isRuntimeHandle: () => false,
  raise(code, message, _node, hint) {
    const error = new Error(message);
    error.code = code;
    error.hint = hint;
    throw error;
  }
};
const blocks = {
  set: { catalog: { props: { path: { kind: 'path' }, value: { kind: 'expression' } } } },
  'list.map': { catalog: { props: { items: { kind: 'expression' }, select: { kind: 'expression' } } } }
};
const validationEnv = {
  blockName: node => node.block,
  blockCatalog: block => block.catalog,
  flowScriptSlotNames: () => [],
  flowScriptArgKeys: node => Object.keys(node.props || {}),
  tokenizeExpression: source => expressions.parse(source, expressionEnv),
  templateSyntax
};

function diagnostics(nodes, flow = { inputs: { rows: { type: 'array' } } }) {
  return validation.validateDefinition(blocks, { nodes, flow }, validationEnv)
    .filter(diagnostic => diagnostic.code === 'INVALID_EXPRESSION');
}

const inIteration = diagnostics([{ block: 'list.map', props: { items: 'input.rows', select: 'title' }, out: 'result.titles' }]);
assert.equal(inIteration.length, 1);
assert.match(inIteration[0].hint, /current\.title/);
assert.match(inIteration[0].hint, /quote|quoted|quotes/i);

const withLocal = diagnostics([
  { block: 'set', props: { path: 'local.title', value: '"Ada"' } },
  { block: 'set', props: { value: 'title' }, out: 'result.title' }
]);
assert.equal(withLocal.length, 1);
assert.match(withLocal[0].hint, /local\.title/);
assert.doesNotMatch(withLocal[0].hint, /current\./);

const withInput = diagnostics([{ block: 'set', props: { value: 'title' }, out: 'result.title' }],
  { inputs: { title: { type: 'string' } } });
assert.match(withInput[0].hint, /input\.title/);
assert.doesNotMatch(withInput[0].hint, /current\./);

const withConfig = diagnostics([{ block: 'set', props: { value: 'title' }, out: 'result.title' }],
  { config: { title: 'Ada' } });
assert.match(withConfig[0].hint, /config\.title/);
assert.doesNotMatch(withConfig[0].hint, /current\./);

const unknown = diagnostics([{ block: 'set', props: { value: 'title' }, out: 'result.title' }]);
assert.equal(unknown.length, 1);
assert.match(unknown[0].hint, /quote|quoted|quotes/i);
assert.match(unknown[0].hint, /input\.\*|local\.\*|config\.\*/);
assert.doesNotMatch(unknown[0].hint, /current\./);

for (const name of ['item', 'current0']) {
  let error;
  try { expressions.parse(name, expressionEnv); } catch (caught) { error = caught; }
  assert.equal(error.code, 'INVALID_EXPRESSION');
  assert.doesNotMatch(error.hint, /current\.[A-Za-z_$]/);
}

console.log('unknown expression hint tests passed');
