// Resource boundary tests using real filesystem links, without Convertigo or its JARs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const load = name => vm.runInNewContext(fs.readFileSync(path.join(root, '_flow/modules', name), 'utf8'), {java:{lang:{String:class {constructor(s){this.s=s}getBytes(){return Buffer.from(this.s)}}}}});
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
    FileUtils: { readFileToString: read, writeStringToFile: (file, text) => (fs.mkdirSync(path.dirname(String(file)),{recursive:true}), fs.writeFileSync(String(file), text)) },
    atomicWriteResource: (file,text) => env.FileUtils.writeStringToFile(file,text),
    sha256Hex: text => require('node:crypto').createHash('sha256').update(text).digest('hex'),
    intOption: (v, fallback, min = 0, max = Infinity) => v == null ? fallback : Math.max(min, Math.min(max, Number(v))),
    searchNeedle: req => req.query, searchMatches: (text, needle) => text.includes(needle),
    searchSnippet: text => text, responseBudget: () => ({ enabled: false }),
    applyRequestPatch: (old, req) => ({ content: req.content, hunks: 1, appliedHunks: 1 })
  };
  if (useSources) env.sources = { read, files, isFile: f => f.isFile(), isDirectory: f => f.isDirectory() };
  else env.Arrays.asList = listed => ({ toArray: () => { visited.push('listed'); return listed; } });
  try { run({ base, dir, env, write, link, visited, reads }); }
  finally { require('node:child_process').execFileSync('gio', ['trash', dir]); }
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
  refused(() => service.get({ path: 'docs/alias.md' }, env));
  refused(() => service.patch({ path: 'docs/alias.md', content: 'after', validate: false }, env));
  assert.equal(service.get({ path: 'docs/target.md' }, env).content, 'before');
  assert(service.patch({ path: 'docs/new.md', content: 'new', validate: false }, env).created);
  assert(service.remove({ path: 'docs/new.md' }, env).deleted);
}));

for (const target of ['resources', '_flow/resources']) {
  for (const prefix of ['tests', 'docs']) {
    test(prefix + ' refuses existing and new targets through linked parents to ' + target, () => fixture(({env,write,link,dir}) => {
      write(target + '/a.py');write(target + '/a.md');
      link(prefix, target);
      for (const ext of ['py','md']) for (const name of ['a','new']) {
        const p=prefix+'/'+name+'.'+ext;
        assert.throws(()=>service.patch({path:p,content:'changed',validate:false},env));
      }
      assert(!fs.existsSync(path.join(dir,target,'new.md')));
    }));
  }
  test('tests file link into '+target+' is refused', () => fixture(({env,write,link})=>{
    write(target+'/a.py');link('tests/a.py',target+'/a.py');
    refused(()=>service.patch({path:'tests/a.py',content:'changed',validate:false},env));
  }));
}
test('only the specified test text extensions are writable, with rules in place before the first write',()=>fixture(({env,dir})=>{
  const original=env.FileUtils.writeStringToFile;
  let writes=0;
  env.FileUtils.writeStringToFile=(file,text)=>{
    if(String(file).includes('/tests/')){
      const ignore=fs.readFileSync(path.join(dir,'.httpignore'),'utf8');
      for(const rule of ['/_flow/','/tests/','/docs/'])assert(ignore.split('\n').includes(rule));
      writes++;
    }
    return original(file,text);
  };
  for(const ext of ['md','txt','json','yaml','yml','csv','js','mjs','cjs','ts','py','sh'])
    assert(service.patch({path:'tests/x.'+ext,content:'text',validate:false},env).created);
  assert.equal(writes,12);
  for(const ext of ['html','jar','bin','class'])refused(()=>service.patch({path:'tests/x.'+ext,content:'text',validate:false},env));
  refused(()=>service.patch({path:'tests/../x.py',content:'text',validate:false},env),'INVALID_RESOURCE_PATH');
}));
test('docs rule precedes its first write and required rules cannot be removed or reopened',()=>fixture(({env,dir,write})=>{
  write('.httpignore','!docs/**\n!tests/**\n');
  const original=env.FileUtils.writeStringToFile;
  env.FileUtils.writeStringToFile=(file,text)=>{
    if(String(file).endsWith('/docs/first.md'))assert(fs.readFileSync(path.join(dir,'.httpignore'),'utf8').endsWith('/docs/\n'));
    original(file,text);
  };
  service.patch({path:'docs/first.md',content:'notes',validate:false},env);
  const old=fs.readFileSync(path.join(dir,'.httpignore'),'utf8');
  const baseHash=env.sha256Hex(old);
  for(const rule of ['/_flow/','/tests/','/docs/']){
    refused(()=>service.patch({path:'.httpignore',baseHash,content:old.replace(rule+'\n',''),validate:false},env),'RESOURCE_HTTPIGNORE_PROTECTED');
    assert.equal(fs.readFileSync(path.join(dir,'.httpignore'),'utf8'),old);
  }
  refused(()=>service.patch({path:'.httpignore',baseHash,content:old+'!tests/x.py\n',validate:false},env),'RESOURCE_HTTPIGNORE_PROTECTED');
  assert(service.patch({path:'.httpignore',baseHash,content:old+'/extra/\n',validate:false},env).ok);
}));
for(const prefix of ['docs','tests']) test(prefix+' write fails closed if the ignore file cannot be written',()=>fixture(({env,dir})=>{
  env.FileUtils.writeStringToFile=()=>{throw Error('unwritable');};
  refused(()=>service.patch({path:prefix+'/x.md',content:'text',validate:false},env),'RESOURCE_HTTPIGNORE_REQUIRED');
  assert(!fs.existsSync(path.join(dir,prefix)));
}));
test('linked ignore file is refused before writing tests',()=>fixture(({env,write,link,dir})=>{
  write('resources/ignore.txt','unchanged');link('.httpignore','resources/ignore.txt');
  refused(()=>service.patch({path:'tests/x.py',content:'text',validate:false},env));
  assert(!fs.existsSync(path.join(dir,'tests/x.py')));
  assert.equal(fs.readFileSync(path.join(dir,'resources/ignore.txt'),'utf8'),'unchanged');
}));

test('binary controls in a permitted test filename are refused before writing',()=>fixture(({env,dir})=>{
  refused(()=>service.patch({path:'tests/binary.py',content:'\0binary',validate:false},env),'RESOURCE_TEST_TEXT_REQUIRED');
  assert(!fs.existsSync(path.join(dir,'tests/binary.py')));
}));
