// A nested CSV aggregation wrote into the read-only loop item. The parser blamed an unrelated brace.
var engineDir = String(new java.io.File(arguments[0]).getAbsolutePath());
var __flowEngineDir = engineDir;
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory('luna-current-write').toFile().getAbsolutePath());
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var engine = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, 'Engine.js'), 'UTF-8')));
var source = String(FileUtils.readFileToString(new java.io.File(engineDir, '../tests/fixtures/luna-current-write.flow.js'), 'UTF-8'));
var response = JSON.parse(engine.flowCodeSet(JSON.stringify({name:'csv_stats', code:source})));
var error = response.error || {};
if (response.ok !== false || error.code !== 'FLOWSCRIPT_WRITE_SCOPE_UNSUPPORTED' ||
    !/current\.count/.test(error.message || '') || !/line 45/.test(error.message || '') ||
    !/read-only/.test(error.hint || '') || !/json\.put/.test(error.hint || '')) {
  throw new Error('write to the loop item needs its own actionable diagnostic: ' + JSON.stringify(error).substring(0, 1100));
}
print('luna-current-write OK');
