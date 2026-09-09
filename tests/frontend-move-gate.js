const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const engine = path.resolve(__dirname, '../libs/flow');
const provider = process.env.FLOW_SVELTE_PROVIDER_ROOT;
assert.ok(provider, 'Set FLOW_SVELTE_PROVIDER_ROOT to the built Svelte provider directory');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-move-gate-'));
const file = path.join(tmp, 'Example.flow.svelte');
const source = '<FlowComponent id="example"><Events><OnMount id="mount"><Actions>'
  + '<CallSequence id="call" requestable=".fetch" /></Actions></OnMount></Events>'
  + '<Structure><Card id="left"><Text id="text" text="Hello" />'
  + '<Card id="nested"><Text id="inner" text="Nested" /></Card></Card><Card id="right" />'
  + '<Image id="image" src="old.png" /><Button id="button" label="Before" />'
  + '</Structure></FlowComponent>';
try {
  fs.writeFileSync(file, source);
  const result = spawnSync(process.execPath, [path.join(provider, 'provider-dist/frontDocumentCli.mjs'),
    '--source-file', file, '--project-root', tmp, '--resource-root', provider,
    '--reference-root', path.resolve(engine, '../..'), '--project-name', 'MoveTest',
    '--engine-model', '--without-bindings', '--source-tree'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  const marker = '__C8O_FRONT_DOCUMENT__';
  const line = result.stdout.split('\n').find(line => line.startsWith(marker));
  assert.ok(line, result.stdout);
  const document = JSON.parse(line.slice(marker.length));
  const nodes = node => [node, ...(node.children || []).flatMap(nodes)];
  const documents = new Map([[source, document]]);
  function describeSource(text) {
    if (documents.has(text)) return documents.get(text);
    const draft = path.join(tmp, 'description-draft.flow.svelte');
    fs.writeFileSync(draft, text);
    const parsed = spawnSync(process.execPath, [path.join(provider, 'provider-dist/frontDocumentCli.mjs'),
      '--source-file', file, '--source-input', draft, '--project-root', tmp, '--resource-root', provider,
      '--reference-root', path.resolve(engine, '../..'), '--project-name', 'MoveTest',
      '--engine-model', '--without-bindings', '--source-tree'], {encoding: 'utf8', timeout: 30000});
    assert.equal(parsed.status, 0, parsed.stderr);
    const doc = JSON.parse(parsed.stdout.split('\n').find(line => line.startsWith(marker)).slice(marker.length));
    documents.set(text, doc);
    return doc;
  }
  const all = nodes(document.tree);
  const byId = id => { const found = all.filter(n => n.id === id); assert.equal(found.length, 1, id); return found[0]; };
  const left = byId('left'), right = byId('right'), text = byId('text'), nested = byId('nested'), mount = byId('mount');
  const service = vm.runInNewContext(fs.readFileSync(path.join(engine, 'modules/flow-tree-service.js'), 'utf8'));
  const env = { normalizeTree: value => JSON.parse(JSON.stringify(value)), compact: JSON.stringify,
    raise(code, message) { throw Object.assign(new Error(message), { code }); } };
  const engineSource = fs.readFileSync(path.join(engine, 'Engine.js'), 'utf8');
  const start = engineSource.indexOf('function applyOneFlowSvelteSourceMutation(');
  const sourceFile = { getAbsolutePath: () => file };
  const before = JSON.stringify(document);
  assert.equal(engineSource.includes('function applyFrontAstSourceMutation('), false, 'No competing lite serializer remains');
  // Run the complete Engine dispatch and real canonical writer, then reparse.
  let tempCount = 0, canonicalWrites = 0, descriptions = 0, failure, documentOverride;
  const real = vm.createContext({ describeFrontendDocument(request) {
      descriptions++;
      assert.equal(request.sourceTree, true);
      assert.equal(request.includeBindings, false);
      if (failure) throw failure;
      return documentOverride || describeSource(request.source);
    },
    flowTreeService: () => service, flowTreeServiceEnv: () => env, frontendStudioLog() {},
    frontendSvelteResourceRoot: () => provider,
    File: { createTempFile() { const filename = path.join(tmp, `temp-${tempCount++}`);
      return { getAbsolutePath: () => filename, delete() { fs.unlinkSync(filename); } }; } },
    FileUtils: { writeStringToFile(file, text) { fs.writeFileSync(file.getAbsolutePath(), text); } },
    frontendRunProviderOneShot(_root, script, args) {
      assert.equal(script, 'src-builder/sourceMutateCli.ts');
      canonicalWrites++;
      const written = spawnSync(process.execPath, [path.join(provider, 'provider-dist/sourceMutateCli.mjs'), ...args],
        { cwd: provider, encoding: 'utf8', timeout: 30000, env: {...process.env, FLOW_ENGINE_RESOURCE_ROOT: engine} });
      assert.equal(written.status, 0, written.stderr);
      return written.stdout;
    },
    frontendMarkedJson(output, prefix) { return JSON.parse(output.split('\n').find(line => line.startsWith(prefix)).slice(prefix.length)); }
  });
  vm.runInContext(engineSource.slice(start, engineSource.indexOf('\n\tfunction frontendSvelteResourceRoot(', start)), real);
  const moved = real.applyOneFlowSvelteSourceMutation({}, source,
    {op: 'move', from: 'stale.path', fromId: 'text', path: right.sourceMutationPath}, sourceFile, file);
  assert.equal(moved.ok, true);
  assert.equal(moved.mutation.from, text.sourceMutationPath);
  assert.equal(moved.mutation.path, right.slots.children.sourceMutationPath);
  assert.equal(moved.mutation.fromId, undefined, 'Writer cannot choose a different source after validation');
  assert.equal(canonicalWrites, 1, 'Moves must use the canonical writer, never the old lite parser');
  const invoke = mutation => real.applyOneFlowSvelteSourceMutation({}, source, mutation, sourceFile, file);
  assert.throws(() => invoke({op: 'move', from: text.sourceMutationPath, path: mount.slots.actions.sourceMutationPath}),
    {code: 'INCOMPATIBLE_AUTHORING_SLOT'});
  assert.throws(() => invoke({op: 'move', from: left.sourceMutationPath, path: nested.sourceMutationPath}),
    {code: 'INVALID_AUTHORING_MOVE'});
  assert.equal(canonicalWrites, 1, 'Rejected moves must not reach the source writer');
  failure = Object.assign(new Error('Provider unavailable'), {code: 'PROVIDER_DOWN'});
  assert.throws(() => invoke({op: 'move', from: text.sourceMutationPath, path: right.sourceMutationPath}), {code: 'PROVIDER_DOWN'});
  assert.equal(canonicalWrites, 1, 'No fallback mutation on provider failure');
  failure = undefined;
  const priorDescriptions = descriptions;
  invoke({op: 'replace', path: text.sourceMutationPath + '.props.text', value: 'Hello'});
  assert.equal(descriptions, priorDescriptions, 'Property edits do not gain a structural preflight');
  const draft = path.join(tmp, 'draft.flow.svelte');
  fs.writeFileSync(draft, moved.source);
  const reparsed = spawnSync(process.execPath, [path.join(provider, 'provider-dist/frontDocumentCli.mjs'),
    '--source-file', file, '--source-input', draft, '--project-root', tmp, '--resource-root', provider,
    '--reference-root', path.resolve(engine, '../..'), '--project-name', 'MoveTest',
    '--engine-model', '--without-bindings', '--source-tree'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(reparsed.status, 0, reparsed.stderr);
  const after = JSON.parse(reparsed.stdout.split('\n').find(line => line.startsWith(marker)).slice(marker.length));
  const afterNodes = nodes(after.tree);
  const movedText = afterNodes.find(n => n.id === 'text');
  const rightAfter = afterNodes.find(n => n.id === 'right');
  assert.equal(afterNodes.filter(n => n.id === 'text').length, 1);
  assert.equal(movedText.parentSlot.ownerPath, rightAfter.sourceMutationPath);
  assert.equal(movedText.parentSlot.slotId, 'children');
  assert.deepEqual(afterNodes.find(n => n.id === 'inner').props, byId('inner').props);
  for (const id of ['left', 'right', 'nested', 'inner', 'mount', 'call', 'text']) {
    assert.deepEqual(afterNodes.find(n => n.id === id).props, byId(id).props, `Preserve properties of ${id}`);
  }
  assert.equal(JSON.stringify(document), before, 'Full dispatch must also preserve the cached document');
  console.log('frontend-move-gate OK (provider AST + Engine gate + canonical writer + provider reparse)');
  const insert = (value, target = right.sourceMutationPath, options = {}) => real.applyOneFlowSvelteSourceMutation({}, source,
    {op: 'append', path: target, value, ...options}, sourceFile, file);
  const textTemplate = {tag: 'Text', id: 'added', props: {text: 'Added'}};
  const appended = insert(textTemplate);
  const appendedNodes = nodes(describeSource(appended.source).tree);
  assert.equal(appendedNodes.filter(n => n.id === 'added').length, 1);
  assert.equal(appendedNodes.find(n => n.id === 'added').parentSlot.ownerPath, right.sourceMutationPath);
  assert.equal(appended.mutation.path, right.slots.children.sourceMutationPath);
  const indexed = insert(textTemplate, left.sourceMutationPath, {op: 'insert', index: 1});
  const indexedNodes = nodes(describeSource(indexed.source).tree);
  assert.ok(indexedNodes.find(n => n.id === 'added').sourceMutationPath.endsWith('children[1]'));
  assert.deepEqual(indexedNodes.find(n => n.id === 'text').props, text.props);
  assert.deepEqual(indexedNodes.find(n => n.id === 'inner').props, byId('inner').props);
  const pasted = insert({tag: 'Card', id: 'copy', children: [{tag: 'Text', id: 'copyText', props: {text: 'Copy'}}]});
  assert.equal(nodes(describeSource(pasted.source).tree).filter(n => n.id === 'copyText').length, 1);
  const action = insert({tag: 'CallSequence', id: 'callAdded', props: {requestable: '.fetch'}}, mount.slots.actions.sourceMutationPath);
  assert.equal(nodes(describeSource(action.source).tree).filter(n => n.id === 'callAdded').length, 1);
  const writesBeforeBadTarget = canonicalWrites;
  assert.throws(() => insert(textTemplate, text.sourceMutationPath), {code: 'INVALID_AUTHORING_DESTINATION'});
  assert.throws(() => insert(textTemplate, 'frontAst.invented'), {code: 'INVALID_AUTHORING_DESTINATION'});
  assert.equal(canonicalWrites, writesBeforeBadTarget, 'Bad destinations are rejected before serialization');
  assert.throws(() => insert({tag: 'CallSequence', id: 'wrong', traits: ['ui.block'], props: {requestable: '.fetch'}}),
    {code: 'INCOMPATIBLE_AUTHORING_SLOT'}, 'Forged clipboard traits must not bypass the real descriptor');
  assert.throws(() => insert({tag: 'Card', id: 'badCopy', children: [
    {tag: 'CallSequence', id: 'wrongNested', props: {requestable: '.fetch'}}]}),
    {code: 'INCOMPATIBLE_AUTHORING_SLOT'}, 'A compatible root must not hide an incompatible descendant');
  assert.throws(() => insert(textTemplate, mount.slots.actions.sourceMutationPath), {code: 'INCOMPATIBLE_AUTHORING_SLOT'});
  assert.throws(() => insert({tag: 'Text', id: 'badLeaf', children: [textTemplate]}), /Undeclared slot/,
    'A clipboard subtree cannot manufacture children on a declared leaf');
  assert.throws(() => insert({tag: 'Card', id: 'badSlot', slots: {actions: [textTemplate]}}), /Undeclared slot/,
    'A clipboard subtree cannot manufacture a slot absent from the descriptor');
  assert.equal(fs.readFileSync(file, 'utf8'), source, 'Accepted/rejected drafts must not touch the project source');
  assert.equal(JSON.stringify(document), before, 'Insertion must preserve the initial provider tree');
  console.log('frontend-insert-gate OK (append/indexed/pasted subtree, forged traits, nested rejection, no project writes)');
  const mutate = mutation => real.applyOneFlowSvelteSourceMutation({}, source, mutation, sourceFile, file);
  const wrapped = mutate({op: 'wrap', paths: [nested.sourceMutationPath, text.sourceMutationPath],
    value: {tag: 'Card', id: 'wrapper'}, slot: 'children'});
  const wrappedNodes = nodes(describeSource(wrapped.source).tree);
  const wrapper = wrappedNodes.find(n => n.id === 'wrapper');
  assert.ok(wrapper);
  for (const id of ['text', 'nested']) {
    assert.equal(wrappedNodes.find(n => n.id === id).parentSlot.ownerPath, wrapper.sourceMutationPath);
    assert.deepEqual(wrappedNodes.find(n => n.id === id).props, byId(id).props);
  }
  assert.ok(wrappedNodes.find(n => n.id === 'text').sourceMutationPath.endsWith('children[0]'));
  assert.deepEqual(wrappedNodes.find(n => n.id === 'inner').props, byId('inner').props);
  const singleWrapped = mutate({op: 'wrap', from: text.sourceMutationPath, value: {tag: 'Card', id: 'single'}});
  assert.ok(nodes(describeSource(singleWrapped.source).tree).find(n => n.id === 'single'));
  const beforeBadSelection = canonicalWrites;
  assert.throws(() => mutate({op: 'wrap', paths: [text.sourceMutationPath, right.sourceMutationPath], value: {tag: 'Card'}}),
    {code: 'INVALID_AUTHORING_SELECTION'});
  assert.equal(canonicalWrites, beforeBadSelection);
  assert.throws(() => mutate({op: 'wrap', paths: [text.sourceMutationPath], value: {tag: 'Text', id: 'leaf'}, slot: 'children'}),
    /Undeclared slot/);
  assert.throws(() => mutate({op: 'wrap', paths: [text.sourceMutationPath], value: {tag: 'Card', id: 'wrong'}, slot: 'actions'}),
    /Undeclared slot/);
  assert.throws(() => mutate({op: 'wrap', paths: [text.sourceMutationPath], value: {tag: 'OnMount', id: 'wrong'}, slot: 'actions'}),
    {code: 'INCOMPATIBLE_AUTHORING_SLOT'});
  const replaced = mutate({op: 'set', path: nested.sourceMutationPath, value: {tag: 'Text', id: 'replacement', props: {text: 'Replaced'}}});
  const replacedNodes = nodes(describeSource(replaced.source).tree);
  assert.equal(replacedNodes.some(n => n.id === 'nested' || n.id === 'inner'), false);
  assert.equal(replacedNodes.find(n => n.id === 'replacement').parentSlot.ownerPath, left.sourceMutationPath);
  assert.deepEqual(replacedNodes.find(n => n.id === 'text').props, text.props);
  assert.throws(() => mutate({op: 'replace', path: text.sourceMutationPath,
    value: {tag: 'CallSequence', id: 'badReplacement', props: {requestable: '.fetch'}}}), {code: 'INCOMPATIBLE_AUTHORING_SLOT'});
  const beforeProperty = canonicalWrites;
  const edited = mutate({op: 'merge', path: right.sourceMutationPath, value: {padding: '12px'}});
  assert.equal(canonicalWrites, beforeProperty + 1, 'Property edits use the same canonical provider, never the lite model');
  assert.equal(nodes(describeSource(edited.source).tree).find(n => n.id === 'right').props.padding, '12px');
  for (const [suffix, value] of [['.props.text', 'Nested edit'], ['.text', 'Short edit']]) {
    const changed = mutate({op: 'replace', path: text.sourceMutationPath + suffix, value});
    const changedNodes = nodes(describeSource(changed.source).tree);
    assert.deepEqual(changedNodes.find(n => n.id === 'text').props.text, {mode: 'literal', value});
    assert.deepEqual(changedNodes.find(n => n.id === 'inner').props, byId('inner').props);
    assert.deepEqual(changedNodes.find(n => n.id === 'nested').slots, nested.slots);
  }
  const merged = mutate({op: 'merge', path: text.sourceMutationPath, value: {text: 'Merged'}});
  assert.deepEqual(nodes(describeSource(merged.source).tree).find(n => n.id === 'text').props.text, {mode: 'literal', value: 'Merged'});
  const bagReplaced = mutate({op: 'set', path: text.sourceMutationPath, value: {id: 'newText', text: 'Replacement properties'}});
  const bagNodes = nodes(describeSource(bagReplaced.source).tree);
  assert.equal(bagNodes.some(n => n.id === 'text'), false);
  assert.deepEqual(bagNodes.find(n => n.id === 'newText').props.text, {mode: 'literal', value: 'Replacement properties'});
  const binding = {mode: 'source', source: {category: 'route', value: 'route'}, path: [{kind: 'property', name: 'path'}]};
  const picked = mutate({op: 'replace', path: text.sourceMutationPath + '.props.text', value: binding});
  const pickedText = nodes(describeSource(picked.source).tree).find(n => n.id === 'text');
  assert.ok(pickedText.props.text === '@route.path' || pickedText.props.text?.mode === 'source');
  for (const [id, property, value] of [['image', 'src', 'new.png'], ['button', 'label', 'New label']]) {
    const changed = mutate({op: 'replace', path: byId(id).sourceMutationPath + '.props.' + property, value});
    assert.deepEqual(nodes(describeSource(changed.source).tree).find(n => n.id === id).props[property], {mode: 'literal', value});
  }
  assert.throws(() => mutate({op: 'replace', path: text.sourceMutationPath + '.props.text', value: {mode: 'invented'}}),
    /structured FlowValueBinding/, 'Canonical validation failures must not fall back to the old property writer');
  assert.equal(fs.readFileSync(file, 'utf8'), source);
  assert.equal(JSON.stringify(document), before);
  console.log('frontend-wrap-replace-gate OK (canonical selection/subtree validation)');
  console.log('frontend-property-gate OK (implicit children, shorthand, merge/replace bags, picker, no project writes)');
  const removed = mutate({op: 'delete', path: nested.sourceMutationPath});
  const removedNodes = nodes(describeSource(removed.source).tree);
  assert.equal(removedNodes.some(n => ['nested', 'inner'].includes(n.id)), false);
  for (const id of ['left', 'text', 'right', 'mount', 'call', 'image', 'button']) {
    assert.deepEqual(removedNodes.find(n => n.id === id).props, byId(id).props);
  }
  const aliasRemoved = mutate({op: 'remove', path: text.sourceMutationPath});
  assert.equal(nodes(describeSource(aliasRemoved.source).tree).some(n => n.id === 'text'), false);
  const disabled = mutate({op: 'setEnabled', path: nested.sourceMutationPath, enabled: false});
  const disabledNodes = nodes(describeSource(disabled.source).tree);
  assert.equal(disabledNodes.find(n => n.id === 'nested').disabled, true);
  assert.ok(disabledNodes.find(n => n.id === 'inner'), 'Disabled children remain available in the authoring model');
  const disabledAgain = real.applyOneFlowSvelteSourceMutation({}, disabled.source,
    {op: 'setEnabled', path: nested.sourceMutationPath, enabled: false}, sourceFile, file);
  assert.equal(disabledAgain.source, disabled.source, 'Disabling twice is idempotent');
  const enabled = real.applyOneFlowSvelteSourceMutation({}, disabled.source,
    {op: 'setEnabled', path: disabledNodes.find(n => n.id === 'nested').sourceMutationPath, enabled: true}, sourceFile, file);
  const enabledNodes = nodes(describeSource(enabled.source).tree);
  assert.notEqual(enabledNodes.find(n => n.id === 'nested').disabled, true);
  for (const id of ['nested', 'inner', 'left', 'text', 'right', 'mount', 'call']) {
    assert.deepEqual(enabledNodes.find(n => n.id === id).props, byId(id).props);
  }
  const beforeBadEdit = canonicalWrites;
  for (const op of ['delete', 'remove', 'setEnabled']) {
    for (const path of [left.slots.children.sourceMutationPath, 'frontAst.missing', text.sourceMutationPath + '.props']) {
      assert.throws(() => mutate({op, path, enabled: false}), {code: 'INVALID_AUTHORING_SELECTION'});
    }
  }
  assert.equal(canonicalWrites, beforeBadEdit, 'Bad object targets fail before serialization');
  for (const slotReadonly of [false, true]) {
    documentOverride = JSON.parse(JSON.stringify(document));
    const overrideNodes = nodes(documentOverride.tree);
    if (slotReadonly) overrideNodes.find(n => n.id === 'left').slots.children.sourceWritable = false;
    else overrideNodes.find(n => n.id === 'nested').readOnly = true;
    for (const op of ['delete', 'setEnabled']) {
      assert.throws(() => mutate({op, path: nested.sourceMutationPath, enabled: false}), {code: 'READ_ONLY_AUTHORING_TARGET'});
    }
  }
  documentOverride = undefined;
  assert.equal(canonicalWrites, beforeBadEdit, 'Read-only objects/slots fail before serialization');
  failure = Object.assign(new Error('Provider unavailable'), {code: 'PROVIDER_DOWN'});
  assert.throws(() => mutate({op: 'delete', path: nested.sourceMutationPath}), {code: 'PROVIDER_DOWN'});
  assert.equal(canonicalWrites, beforeBadEdit);
  failure = undefined;
  assert.equal(fs.readFileSync(file, 'utf8'), source);
  assert.equal(JSON.stringify(document), before);
  console.log('frontend-delete-enable-gate OK (implicit subtree, alias, disabled descendants, restore, no fallback)');
} finally {
  fs.rmSync(tmp, {recursive: true, force: true});
}
