// Resource boundary tests using real filesystem links, without Convertigo or its JARs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const load = name => vm.runInNewContext(fs.readFileSync(path.join(root, '_flow/modules', name), 'utf8'));
const utils = load('resource-utils.js');
const service = load('resource-service.js');
const paths = { root: '_flow', path: p => '_flow/' + p };

// java.io.File.getCanonicalPath also resolves existing parents of a new file.
function canonical(p) {
  if (fs.existsSync(p)) return fs.realpathSync(p);
  return path.join(canonical(path.dirname(p)), path.basename(p));
}
class File {
  static separator = path.sep;
  constructor(base, child = '') { this.path = path.resolve(String(base), child); }
  toString() { return this.path; }
  getName() { return path.basename(this.path); }
  getAbsolutePath() { return this.path; }
  getParentFile() { return new File(path.dirname(this.path)); }
  isFile() { return fs.existsSync(this.path) && fs.statSync(this.path).isFile(); }
  isDirectory() { return fs.existsSync(this.path) && fs.statSync(this.path).isDirectory(); }
  length() { return fs.statSync(this.path).size; }
  lastModified() { return fs.statSync(this.path).mtimeMs; }
  listFiles() { return this.isDirectory() ? fs.readdirSync(this.path).map(p => new File(this, p)) : null; }
  delete() { fs.unlinkSync(this.path); return true; }
}
function fixture(run, useSources = false) {
  const dir = fs.mkdtempSync(path.join(root, '.resource-path-test-'));
  const base = new File(dir);
  const visited = [], reads = [];
  const write = (p, text = 'boundary marker') => {
    fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
    fs.writeFileSync(path.join(dir, p), text);
  };
  const link = (p, target) => {
    fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
    fs.symlinkSync(path.join(dir, target), path.join(dir, p));
  };
  const read = file => { reads.push(String(file)); return fs.readFileSync(String(file), 'utf8'); };
  const files = file => { visited.push(String(file)); return file.listFiles(); };
  const env = {
    File, Arrays: { asList: files => ({ toArray: () => files }) }, sourcePaths: paths,
    projectDir: () => base, canonicalPath: file => canonical(String(file)),
    raise: (code, message) => { throw Object.assign(new Error(message), { code }); },
    isAllowedResourcePath: p => utils.isAllowedPath(p, paths),
    normalizeResourcePath: p => utils.normalizePath(p, env),
    resourceKind: p => utils.kind(p, paths), resourceName: utils.name,
    resourceMimeType: utils.mimeType, resourceUri: p => utils.uri(p, paths),
    firstMarkdownHeading: utils.firstMarkdownHeading, firstMarkdownParagraph: utils.firstMarkdownParagraph,
    globPatterns: utils.globPatterns, globMatches: utils.globMatches,
    FileUtils: { readFileToString: read, writeStringToFile: (file, text) => fs.writeFileSync(String(file), text) },
    sha256Hex: text => require('node:crypto').createHash('sha256').update(text).digest('hex'),
    intOption: (v, fallback, min = 0, max = Infinity) => v == null ? fallback : Math.max(min, Math.min(max, Number(v))),
    searchNeedle: req => req.query, searchMatches: (text, needle) => text.includes(needle),
    searchSnippet: text => text, responseBudget: () => ({ enabled: false }),
    applyRequestPatch: (old, req) => ({ content: req.content, hunks: 1, appliedHunks: 1 })
  };
  if (useSources) env.sources = { read, files, isFile: f => f.isFile(), isDirectory: f => f.isDirectory() };
  else env.Arrays.asList = listed => ({ toArray: () => { visited.push('listed'); return listed; } });
  try { run({ base, dir, env, write, link, visited, reads }); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
const refused = (operation, code = 'RESOURCE_PATH_NOT_ALLOWED') => assert.throws(operation, e => e.code === code);

test('every resource prefix rechecks canonical targets for reads, patches and deletes', () => fixture(({ env, write, link, reads }) => {
  write('_private/mcp/trace.json');
  write('.git/config');
  const aliases = ['docs/a.md', 'resources/a.json', 'libs/src/A.java', 'libs/jars.yaml', '.httpignore',
    '_flow/engine.yaml', '_flow/blocks/a.block.js', '_flow/fragments/a.fragment.yaml', '_flow/lib/a.js',
    '_flow/resources/a.md', '_flow/frontbuilder/a.front.json', '_flow/types/a.type.yaml', '_flow/types/editors/a.js'];
  for (const alias of aliases) {
    link(alias, '_private/mcp/trace.json');
    for (const method of ['get', 'patch', 'remove']) refused(() => service[method]({ path: alias, content: 'changed' }, env));
  }
  link('docs/git.md', '.git/config');
  refused(() => service.get({ path: 'docs/git.md' }, env));
  assert.equal(reads.length, 0, 'denied targets must never be read');
}));

for (const useSources of [false, true]) {
  test('listing/search refuse linked roots, cross-prefix directories and cycles; sources=' + useSources, () => fixture(({ env, write, link, visited }) => {
    write('_flow/resources/kept.md');
    write('_private/mcp/trace.json');
    write('resources/public.json');
    link('_flow/resources/private', '_private/mcp');
    link('_flow/resources/public', 'resources');
    link('_flow/resources/cycle', '_flow/resources');
    link('_flow/lib', '_private/mcp');
    for (const p of ['.httpignore', '_flow/engine.yaml', 'libs/jars.yaml']) link(p, '_private/mcp/trace.json');
    const listed = service.list({ pattern: '**/*' }, env).resources.map(e => e.path);
    assert.deepEqual(Array.from(listed).sort(), ['_flow/resources/kept.md', 'resources/public.json']);
    const found = service.search({ query: 'boundary marker' }, env).resources.map(e => e.path);
    assert.deepEqual(Array.from(found).sort(), ['_flow/resources/kept.md', 'resources/public.json']);
    if (useSources) assert(!visited.some(p => /\/(private|public|cycle)$/.test(p) || p.endsWith('/_flow/lib')), 'do not enumerate an escaping link');
  }, useSources));
}

test('allowed canonical resources remain readable and writable, including new files', () => fixture(({ env, write, link }) => {
  write('docs/target.md', 'before');
  link('docs/alias.md', 'docs/target.md');
  assert.equal(service.get({ path: 'docs/alias.md' }, env).content, 'before');
  service.patch({ path: 'docs/alias.md', content: 'after', validate: false }, env);
  assert.equal(service.get({ path: 'docs/target.md' }, env).content, 'after');
  assert(service.patch({ path: 'docs/new.md', content: 'new', validate: false }, env).created);
  assert(service.remove({ path: 'docs/new.md' }, env).deleted);
}));
