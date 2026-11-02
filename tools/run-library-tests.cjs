#!/usr/bin/env node
// Shared offline harness. Libraries already depend on the sibling Flow Engine.
const fs = require('node:fs');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
const [suite, rootArg, filter = ''] = process.argv.slice(2);
const root = path.resolve(rootArg || '.');
const siblings = path.dirname(root);
const env = {...process.env};
function fail(message) { console.error(message); process.exit(2); }
function file(p) { return p && fs.existsSync(p); }
function sibling(name) {
  return [name, 'c8oprj-' + name.replaceAll('_', '-')].map(n => path.join(siblings, n)).find(file);
}
function executable(name) {
  const r = spawnSync(name, ['--version'], {encoding: 'utf8'});
  if (r.error || r.status !== 0) fail(`Missing ${name} on PATH.`);
}
function jarIn(dir, prefix) {
  if (!file(dir)) return undefined;
  return fs.readdirSync(dir).filter(n => n.startsWith(prefix) && n.endsWith('.jar') && !/sources|javadoc/.test(n))
    .sort().reverse().map(n => path.join(dir, n))[0];
}
function mavenJar(variable, group, artifact, version) {
  if (env[variable]) {
    if (!file(env[variable])) fail(`${variable} does not name an existing JAR.`);
    return env[variable];
  }
  const home = require('node:os').homedir();
  const caches = [env.GRADLE_USER_HOME, path.join(home, '.gradle')].filter(Boolean);
  for (const cache of caches) {
    const base = path.join(cache, 'caches/modules-2/files-2.1', group, artifact);
    if (!file(base)) continue;
    for (const v of (version ? [version] : fs.readdirSync(base).sort().reverse())) {
      const vd = path.join(base, v);
      if (!file(vd)) continue;
      for (const hash of fs.readdirSync(vd)) {
        const found = jarIn(path.join(vd, hash), artifact + '-');
        if (found) return env[variable] = found;
      }
    }
  }
  const m2 = path.join(home, '.m2/repository', group.replaceAll('.', '/'), artifact);
  if (file(m2)) for (const v of (version ? [version] : fs.readdirSync(m2).sort().reverse())) {
    const found = jarIn(path.join(m2, v), artifact + '-');
    if (found) return env[variable] = found;
  }
  fail(`Missing ${variable}. Set it to ${group}:${artifact}:${version || 'matching runtime version'} (thin JAR).`);
}
const engineProject = env.FLOW_ENGINE_RESOURCE_ROOT ? path.dirname(path.resolve(env.FLOW_ENGINE_RESOURCE_ROOT)) : sibling('lib_flow_engine');
const engine = env.FLOW_ENGINE_RESOURCE_ROOT || (engineProject && path.join(engineProject, '_flow'));
if (!file(engine && path.join(engine, 'Engine.js'))) fail('Missing sibling lib_flow_engine; set FLOW_ENGINE_RESOURCE_ROOT=<engine>/_flow.');
env.FLOW_ENGINE_RESOURCE_ROOT = engine;
const providerProject = sibling('lib_flow_frontbuilder_svelte');
const provider = env.FLOW_FRONTBUILDER_RESOURCE_ROOT || (providerProject && path.join(providerProject, '_flow/frontbuilder/svelte'));
if (['engine', 'mcp', 'frontbuilder'].includes(suite)) {
  if (!file(provider && path.join(provider, 'node_modules/jsdom/package.json')) || !file(path.join(provider, 'provider-dist/provider-manifest.json'))) {
    fail('Missing installed Svelte provider. Set FLOW_FRONTBUILDER_RESOURCE_ROOT; run npm ci in <frontbuilder>/_flow/frontbuilder/svelte first.');
  }
  env.FLOW_FRONTBUILDER_RESOURCE_ROOT = provider;
  env.FLOW_SVELTE_PROVIDER_ROOT = provider;
  executable('npm');
}
let classpath = env.CONVERTIGO_TEST_CLASSPATH;
if (suite !== 'frontbuilder') {
  executable('java');
  const convertigo = env.CONVERTIGO_ROOT || path.join(siblings, 'convertigo');
  const libs = path.join(convertigo, 'engine/build/libs');
  const dependencies = env.CONVERTIGO_DEPENDENCIES_JAR || jarIn(libs, 'dependencies-');
  const engineJar = env.CONVERTIGO_ENGINE_JAR || jarIn(libs, 'convertigo-engine-');
  if (!classpath && file(dependencies) && file(engineJar)) classpath = [engineJar, dependencies, path.join(libs, '*')].join(path.delimiter);
  if (!classpath) fail('Missing complete Convertigo classpath. Build sibling convertigo (:engine:jar :engine:dependenciesJar), or set CONVERTIGO_TEST_CLASSPATH to engine + dependencies/runtime JARs.');
  env.CONVERTIGO_TEST_CLASSPATH = classpath;
  // These Node parity tests use the historical variable as an entire Java -cp,
  // including engine JSON classes, not just the shaded dependencies JAR.
  env.CONVERTIGO_DEPENDENCIES_JAR = classpath;
}
const logRoot = path.resolve(env.FLOW_TEST_LOG_DIR || path.join(root, '_private/test-results', new Date().toISOString().replaceAll(':', '-')));
fs.mkdirSync(logRoot, {recursive: true});
const tmp = path.join(logRoot, 'tmp'); fs.mkdirSync(tmp, {recursive: true});
env.TMPDIR = tmp;
env.JAVA_TOOL_OPTIONS = (env.JAVA_TOOL_OPTIONS || '') + ' -Djava.awt.headless=true -Djava.io.tmpdir=' + JSON.stringify(tmp);
const javaFlags = ['-Djava.awt.headless=true', '-Djava.io.tmpdir=' + tmp];
const main = 'org.mozilla.javascript.tools.shell.Main';
const bootstrap = path.join(logRoot, 'run-rhino.js');
fs.writeFileSync(bootstrap, 'var file = arguments[0]; arguments = Array.prototype.slice.call(arguments, 1);\ntry { if (String(new java.io.File(file).getName()) !== "crypto-password-blocks.js") { Packages.com.twinsoft.convertigo.engine.EnginePropertiesManager.initProperties(); Packages.com.twinsoft.convertigo.engine.EnginePropertiesManager.setProperty(Packages.com.twinsoft.convertigo.engine.EnginePropertiesManager.PropertyName.SERVER_BUILD, "studio"); } load(file); java.lang.System.exit(0); } catch (e) { print(String(e)); if(e.stack) print(e.stack); java.lang.System.exit(1); }\n');
if (suite !== 'frontbuilder') {
  const probe = spawnSync('java', [...javaFlags, '-cp', classpath, main, '-version', '200', '-e',
    'java.lang.Class.forName("com.twinsoft.convertigo.engine.flow.FlowEngineBridge"); Packages.com.twinsoft.convertigo.engine.EnginePropertiesManager.initProperties(); java.lang.System.exit(0);'], {env, encoding: 'utf8', timeout: 30000});
  if (probe.status !== 0) {
    fs.writeFileSync(path.join(logRoot, 'preflight.log'), (probe.stdout || '') + (probe.stderr || ''));
    fail(`Convertigo classpath cannot load FlowEngineBridge/EnginePropertiesManager. See ${logRoot}/preflight.log. Dependencies JAR alone is insufficient.`);
  }
}
function rhino(test, args) { return ['java', ...javaFlags, '-cp', classpath, main, '-version', '200', bootstrap, path.join(root, 'tests', test), ...args]; }
const tasks = [];
function task(name, command, cwd = root) { if (!filter || name.includes(filter)) tasks.push({name, command, cwd}); }
if (suite === 'engine' || suite === 'mcp') {
  const engineFirst = suite === 'mcp' ? new Set(require(path.join(root, 'tools/test-arguments.json')).engineFirst) : null;
  for (const name of fs.readdirSync(path.join(root, 'tests')).sort()) {
    if (!/\.(js|cjs)$/.test(name) || name === 'run-rhino.cjs') continue;
    const source = fs.readFileSync(path.join(root, 'tests', name), 'utf8');
    if (name.endsWith('.cjs') || /\brequire\s*\(/.test(source)) {
      const args = suite === 'engine' && name !== 'frontend-provider-integration.js' ? [path.join(provider, 'node_modules/jsdom')] : [];
      if (suite === 'mcp' && name === 'tool-error-schemas.cjs') args.push(classpath, root);
      task(name, [process.execPath, path.join(root, 'tests', name), ...args]);
    } else {
      let args = suite === 'engine' ? [engine] : engineFirst.has(name) ? [engine, root] : [root, engine];
      if (suite === 'engine' && name === 'source-creation-contract.js') args.push(provider);
      if (suite === 'mcp' && ['mcp-jwt-store-race.js', 'tool-notices.js'].includes(name)) args = [root];
      task(name, rhino(name, args));
    }
  }
  console.log('Offline JS programs only; *.java and HTTP *.mjs harnesses require separate invocations (see TESTING.md).');
} else if (suite === 'frontbuilder') {
  task('provider-build', ['npm', 'run', 'build:provider'], provider);
  task('frontend-tests', ['npm', 'test'], provider);
} else if (suite === 'crud' || suite === 'sql') {
  executable('javac');
  mavenJar('FLOW_RHINO_JAR', 'org.mozilla', 'rhino');
  const version = path.basename(env.FLOW_RHINO_JAR).slice('rhino-'.length, -4);
  mavenJar('FLOW_RHINO_TOOLS_JAR', 'org.mozilla', 'rhino-tools', version);
  if (suite === 'sql') {
    mavenJar('FLOW_QUERYDSL_CORE_JAR', 'io.github.openfeign.querydsl', 'querydsl-core', '7.7');
    mavenJar('FLOW_QUERYDSL_SQL_JAR', 'io.github.openfeign.querydsl', 'querydsl-sql', '7.7');
    mavenJar('FLOW_HSQLDB_JAR', 'org.hsqldb', 'hsqldb', '2.7.4');
    const crud = env.FLOW_CRUD_DATA_DIR || sibling('lib_flow_crud_data');
    if (!file(crud && path.join(crud, 'c8oProject.yaml'))) fail('Missing sibling lib_flow_crud_data; set FLOW_CRUD_DATA_DIR. Flow tests must not be silently skipped.');
    env.FLOW_CRUD_DATA_DIR = crud;
    env.FLOW_ENGINE_DIR = engine;
    env.FLOW_SQL_TEST_CLASSPATH ||= [classpath, env.FLOW_QUERYDSL_CORE_JAR, env.FLOW_QUERYDSL_SQL_JAR].join(path.delimiter);
    task('sql-official-15-programs', ['bash', path.join(root, 'tools/run-sql-tests.sh')]);
    task('query-missing-parameter.cjs', [process.execPath, path.join(root, 'tests/query-missing-parameter.cjs')]);
  } else {
    task('schema-sample-java', ['bash', path.join(root, 'tools/run-java-tests.sh')]);
    for (const name of ['capability-reasons.js', 'csv-provider.js', 'csv-timestamp.js', 'output-contracts.js']) task(name, rhino(name, [engine, root]));
    task('scalar-parameter-diagnostic.js', rhino('scalar-parameter-diagnostic.js', [root]));
  }
} else fail('Unknown suite: ' + suite);
if (!tasks.length) fail('No tests match the filter: ' + filter);
const timeout = Number(env.FLOW_TEST_TIMEOUT_MS || (suite === 'sql' ? 1800000 : suite === 'frontbuilder' ? 900000 : 400000));
const jobs = Number(env.FLOW_TEST_JOBS || (suite === 'frontbuilder' || suite === 'sql' ? 1 : 2));
if (!Number.isInteger(jobs) || jobs < 1 || !Number.isFinite(timeout) || timeout <= 0) fail('FLOW_TEST_JOBS and FLOW_TEST_TIMEOUT_MS must be positive.');
let results = [];
if (env.FLOW_TEST_RESUME === '1') {
  if (!env.FLOW_TEST_LOG_DIR) fail('Resume requires an explicit FLOW_TEST_LOG_DIR.');
  const saved = path.join(logRoot, 'results.json');
  if (!file(saved)) fail('No results.json to resume in ' + logRoot);
  try { results = JSON.parse(fs.readFileSync(saved, 'utf8')); } catch { fail('Cannot read saved results.json.'); }
  if (!Array.isArray(results) || new Set(results.map(r => r.name)).size !== results.length) fail('Invalid saved result list.');
  for (const result of results) {
    const current = tasks.find(t => t.name === result.name);
    if (!current || current.cwd !== result.cwd || JSON.stringify(current.command) !== JSON.stringify(result.command) || !file(result.log)) {
      fail('Resume command/filter or logs changed for ' + result.name + '; choose a new FLOW_TEST_LOG_DIR.');
    }
  }
}
const completed = new Set(results.map(r => r.name));
const pending = tasks.filter(t => !completed.has(t.name));
if (env.FLOW_TEST_RESUME === '1') console.log(`RESUME ${results.length} recorded, ${pending.length} pending (recorded failures remain visible).`);
async function run(t) {
  const log = path.join(logRoot, t.name + '.log');
  const output = fs.openSync(log, 'w');
  const started = Date.now();
  const child = spawn(t.command[0], t.command.slice(1), {cwd: t.cwd, env, stdio: ['ignore', output, output], detached: process.platform !== 'win32'});
  let timedOut = false;
  let spawnError;
  const timer = setTimeout(() => { timedOut = true; try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGKILL'); } catch {} }, timeout);
  const code = await new Promise(resolve => { child.on('error', error => { spawnError = error.message; resolve(127); }); child.on('close', code => resolve(code)); });
  clearTimeout(timer); fs.closeSync(output);
  if (spawnError) fs.appendFileSync(log, spawnError + '\n');
  const text = fs.readFileSync(log, 'utf8');
  const ok = code === 0 && !timedOut && !/^(?:js: )?(?:uncaught|exception|error:)/im.test(text);
  const result = {...t, code, timedOut, ok, elapsedMs: Date.now() - started, log}; results.push(result);
  fs.writeFileSync(path.join(logRoot, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  console.log(`${ok ? 'PASS' : 'FAIL'} ${t.name}${ok ? '' : ' (' + log + ')'}`);
  return ok;
}
(async () => {
  let index = 0;
  async function worker() { while (index < pending.length) { const t = pending[index++]; const ok = await run(t); if (suite === 'frontbuilder' && !ok) return; } }
  await Promise.all(Array.from({length: Math.min(jobs, pending.length)}, worker));
  const passed = results.filter(r => r.ok).length;
  console.log(`${passed} passed, ${results.length - passed} failed; logs: ${logRoot}`);
  process.exitCode = results.length === tasks.length && passed === results.length ? 0 : 1;
})();
