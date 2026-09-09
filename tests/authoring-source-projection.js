const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../libs/flow/modules/flow-tree-service.js'), 'utf8');
const start = source.indexOf('function authoringSourceTreeRequest(');
const end = source.indexOf('\n\tfunction authoringBuilderName(', start);
const project = vm.runInNewContext('(' + source.slice(start, end) + ')', {
  File: class { constructor(value) { this.path = value; } getAbsoluteFile() { return this; }
    toPath() { return {normalize: () => path.resolve(this.path)}; } },
  normalizeTree: value => JSON.parse(JSON.stringify(value)),
  addFrontendAuthoringNode(parent, node, rootPath) { parent.children.push({...node, path: rootPath}); }
});
const target = '/fixture/Source.flow.svelte';
const root = {kind: 'provider.CustomSource', sourcePath: target, sourceMutationPath: 'document',
  label: 'My source', children: [{sourcePath: target, sourceMutationPath: 'document.items[0]'}]};
const request = {sourcePath: '/fixture/./Source.flow.svelte', authoringRootPath: 'any.visual.anchor'};
const app = {children: [{kind: 'folder', children: [root]}]};
const before = JSON.stringify(app);
const result = project({...request, document: {tree: app}});
assert.equal(result.ok, true);
assert.equal(result.children[0].path, request.authoringRootPath);
assert.equal(result.children[0].kind, root.kind);
assert.equal(result.children[0].label, root.label);
assert.equal(JSON.stringify(app), before, 'projection must not mutate the cached provider tree');
assert.equal(project({...request, document: {tree: {children: []}, sourceRoots: [root]}}).ok, true);
const other = {...root, children: [], sourcePath: '/fixture/Other.flow.svelte', kind: 'frontendPage'};
assert.equal(project({...request, authoringRootPath: 'app.routes.home', document: {tree: {children: [other]}}}).ok, false,
  'the old page score must never select a different file');
assert.equal(project({...request, document: {tree: {children: [other]}, sourceRoots: [root]}}).ok, true);
assert.equal(project({...request, document: {tree: {children: [root, {...root}]}, sourceRoots: [root]}}).ok, false,
  'ambiguous roots must not select the first match or fall back silently');
assert.equal(project({...request, document: {sourceRoots: [root, {...root}]}}).ok, false);
assert.equal(project({...request, document: {sourceRoots: [other]}}).ok, false);
assert.equal(project({document: {tree: app}}).ok, false, 'a missing source identity must fail closed');
console.log('authoring-source-projection OK');
