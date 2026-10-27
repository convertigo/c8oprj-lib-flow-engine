// The row kernels on a chunk of Java rows (forEachChunk sources): same results as on a script array, the rows
// staying Java from one kernel to the next; the chunk reads as an array, lazily, and cannot be changed.
var root = arguments.length ? arguments[0] : "_flow";
var IO = Packages.org.apache.commons.io.FileUtils;
function read(file) { return String(IO.readFileToString(new java.io.File(file), "UTF-8")); }
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
var RowChunk = Packages.com.twinsoft.convertigo.engine.flow.rows.RowChunk;
var javaRows = Packages.com.convertigo.libflowengine.Rows;
if (typeof RowChunk !== "function" || typeof javaRows.run !== "function" || !javaRows.available()) {
  print("rows-java-chunks skipped: the engine has no row chunks");
} else {
  var source = read(root + "/lib/rows.js");
  var reference = eval(source.replace(/\s*\/\* JAVA_DISPATCH_BEGIN[\s\S]*?JAVA_DISPATCH_END \*\//, ""));
  var optimized = eval(source);
  var scope = this;
  function chunk(rows) { return new RowChunk(Packages.com.twinsoft.convertigo.engine.util.JsonValues.parse(JSON.stringify(rows)), scope); }
  function plain(value) { return JSON.parse(JSON.stringify(value, function (key, v) { return Array.isArray(v) ? Array.prototype.slice.call(v) : v; })); }
  function canonical(v) {
    if (Array.isArray(v)) return Array.prototype.map.call(v, canonical);
    if (v && typeof v === "object") { var out = {}; Object.keys(v).sort().forEach(function (k) { out[k] = canonical(v[k]); }); return out; }
    return v;
  }
  function isChunk(value) { try { value[0] = null; return false; } catch (readOnly) { return String(readOnly).indexOf("read-only") >= 0; } }

  // the fixtures of the Java kernels, their rows given as a chunk
  var cases = JSON.parse(read(root + "/../tests/fixtures/rows-java.json")), chunked = 0;
  cases.forEach(function (f) {
    if (!f.input || !Array.isArray(f.input.rows) || f.input.rows.some(function (row) { return row === null || typeof row !== "object" || Array.isArray(row); })) return;
    var expected = reference[f.operation](JSON.parse(JSON.stringify(f.input)));
    var input = JSON.parse(JSON.stringify(f.input));
    input.rows = chunk(f.input.rows);
    var actual = optimized[f.operation](input);
    assert(JSON.stringify(canonical(plain(actual))) === JSON.stringify(canonical(expected)), "Chunk parity: " + f.name + " expected " + JSON.stringify(canonical(expected)) + " got " + JSON.stringify(canonical(plain(actual))));
    var rows = Array.isArray(actual) ? actual : actual.rows;
    if (!f.fallback) { assert(isChunk(rows), "The rows of " + f.name + " stay a chunk"); chunked++; }
  });
  assert(chunked > 20, "Most fixtures run on chunks: " + chunked);

  // a chunk reads as an array, row by row, and is read-only
  var rows = chunk([{id: 1, name: "a", tags: ["x"]}, {id: 2, name: "b"}, {id: 3, name: "c", nested: {ok: true}}]);
  assert(Array.isArray(rows) && rows.length === 3 && rows[1].name === "b" && rows[2].nested.ok === true && rows[0].tags[0] === "x", "A chunk reads as an array");
  assert(rows[1] === rows[1], "A row read twice is the same object");
  assert(rows.map(function (row) { return row.id; }).join() === "1,2,3" && Object.keys(rows).join() === "0,1,2", "Array methods and keys work on a chunk");
  assert(rows[3] === undefined && !(3 in rows) && (2 in rows), "Out of range reads are undefined");
  assert(JSON.stringify(plain(rows)) === '[{"id":1,"name":"a","tags":["x"]},{"id":2,"name":"b"},{"id":3,"name":"c","nested":{"ok":true}}]', "A chunk copies as an array: " + JSON.stringify(plain(rows)));
  var refused = 0;
  [function () { rows[0] = {}; }, function () { rows.length = 0; }, function () { rows.push({}); }, function () { delete rows[0]; }].forEach(function (write) {
    try { write(); } catch (readOnly) { if (String(readOnly).indexOf("read-only") >= 0) refused++; }
  });
  assert(refused === 4, "A chunk refuses writes: " + refused);
  rows[0].name = "changed";
  assert(rows[0].name === "changed", "A row read from a chunk is an ordinary object");

  // two kernels in a row: the output of formatCells, still a chunk, feeds select
  var cells = optimized.formatCells({rows: chunk([{id: 1, Amount: "12.5"}, {id: 2, Amount: null}]), profile: "table", schema: [{name: "Amount", type: "number", number_decimal_places: 2}]});
  var selected = optimized.select({rows: cells, firstColumns: ["id"], columns: [{key: "Amount", path: "$[\"Amount\"]"}]});
  var expectedCells = reference.formatCells({rows: [{id: 1, Amount: "12.5"}, {id: 2, Amount: null}], profile: "table", schema: [{name: "Amount", type: "number", number_decimal_places: 2}]});
  var expectedSelected = reference.select({rows: expectedCells, firstColumns: ["id"], columns: [{key: "Amount", path: "$[\"Amount\"]"}]});
  assert(isChunk(cells) && isChunk(selected), "Chained kernels keep a chunk");
  assert(JSON.stringify(canonical(plain(selected))) === JSON.stringify(canonical(expectedSelected)), "Chained kernels match the reference: " + JSON.stringify(plain(selected)));
  print("rows-java-chunks OK (" + checks + " checks, " + chunked + " fixtures on chunks)");
}
