// forEachChunk on a row cursor: paged JSON rows from a local HTTP server, pulled chunk by chunk, transformed by the
// row kernels and emitted; the same Flow on the same rows given as an array gives the same result.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir);
var project = java.nio.file.Files.createTempDirectory("for-each-chunk-cursor-").toFile();
var __flowProjectDir = String(project);
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function read(path) { return String(files.readFileToString(new java.io.File(engineDir, path), "UTF-8")); }
if (typeof Packages.com.twinsoft.convertigo.engine.flow.rows.RowCursor !== "function") {
  print("for-each-chunk-cursor skipped: the engine has no row cursor");
} else {
  var total = 450, size = 100, requests = 0;
  var all = [];
  for (var i = 1; i <= total; i++) all.push({id: i, Name: "n" + i, Amount: String(i) + ".5", Status: i % 3 ? "open" : null});
  var server = Packages.com.sun.net.httpserver.HttpServer.create(new java.net.InetSocketAddress("127.0.0.1", 0), 0);
  var port = server.getAddress().getPort();
  server.createContext("/rows/", function (exchange) {
    requests++;
    var query = String(exchange.getRequestURI().getRawQuery() || ""), page = Number((/(?:^|&)page=(\d+)/.exec(query) || [0, 1])[1]);
    var start = (page - 1) * size, next = start + size < total ? "http://127.0.0.1:" + port + "/rows/?page=" + (page + 1) : null;
    var body = new java.lang.String(JSON.stringify({count: total, next: next, results: all.slice(start, start + size)})).getBytes("UTF-8");
    exchange.getResponseHeaders().add("Content-Type", "application/json");
    exchange.sendResponseHeaders(200, body.length);
    var out = exchange.getResponseBody(); out.write(body); out.close();
  });
  server.start();
  try {
    var engine = eval(read("Engine.js"));
    function api(method, request) { return JSON.parse(engine[method](JSON.stringify(request))); }
    // a source block of this project: the cursor of the local pages
    var created = api("blockCodeSet", {name: "proof.pages", code: 'const _meta={sourceVersion:2,runtime:"rhino",targets:["backend"],properties:{url:{kind:"value",type:"string"}},outputs:{out:{type:"any"}}};\n'
      + '(function(){return {run:function(ctx,node){return ctx.createRowsCursor({http:{url:ctx.template(ctx.props(node).url),headers:{},redactions:[],dropKeys:["__proto__"],items:"/results",next:"/next",pageParameter:"page",connectTimeout:2000,readTimeout:5000},'
      + 'limits:{pages:100,inputRows:100000,inputBytes:67108864,rowNodes:100000,stringCharacters:262144,depth:64,millis:60000},take:0});}};}())'});
    assert(created.ok, "The source block is created: " + JSON.stringify(created));
    function flow(source) {
      return 'const _flow={sourceVersion:2,inputs:{url:{type:"string"},items:{type:"array"}}}\nfunction Pages({input,result}){\n'
        + 'local.schema=[{name:"Amount",type:"number",number_decimal_places:2}]\nlocal.count=0\n'
        + 'local.source=' + source + '\n'
        + 'local.summary=forEachChunk({source:local.source,size:64,into:"data",$$each:function({chunk}){\n'
        + 'parent.count=parent.count+chunk.rows.length\n'
        + 'local.cells=rows.formatCells({rows:chunk.rows,profile:"table",schema:parent.schema})\n'
        + 'local.selected=rows.select({rows:local.cells,firstColumns:["id"],columns:[{key:"Amount",path:"$[\\"Amount\\"]"},{key:"Status",path:"$[\\"Status\\"]"}]})\n'
        + 'emit({rows:local.selected})\n'
        + '}})\nresult.count=local.count\nresult.chunks=local.summary.chunks\n}';
    }
    function run(code, input) {
      var parsed = api("flowSourceValidate", {code: code});
      assert(parsed.ok, "The source parses: " + JSON.stringify(parsed.errors || parsed.diagnostics || Object.keys(parsed)).slice(0, 1200));
      return api("run", {flowSource: parsed.source, input: input, includeTrace: false});
    }
    var url = "http://127.0.0.1:" + port + "/rows/";
    var cursor = run(flow("proof.pages({url:input.url})"), {url: url});
    assert(cursor.ok, "The cursor Flow runs: " + JSON.stringify(cursor.error));
    assert(cursor.result.count === total && cursor.result.data.length === total && cursor.result.chunks === Math.ceil(total / 64), "Every row once, in chunks of 64: " + JSON.stringify({count: cursor.result.count, chunks: cursor.result.chunks}));
    assert(requests === Math.ceil(total / size), "Each page fetched once: " + requests);
    assert(JSON.stringify(cursor.result.data[0]).indexOf('"value":1,') > 0 && JSON.stringify(cursor.result.data[total - 1]).indexOf('"value":' + total + ',') > 0, "Rows keep the source order: " + JSON.stringify(cursor.result.data[0]));
    var array = run(flow("input.items"), {items: all});
    assert(array.ok && JSON.stringify(array.result.data) === JSON.stringify(cursor.result.data), "The cursor and the array give the same rows");
    // timing on the same machine: the Java chunks against the script arrays, after a warm-up
    function time(input, code) { var t = java.lang.System.nanoTime(); var r = run(code, input); assert(r.ok, "timed run"); return (java.lang.System.nanoTime() - t) / 1e6; }
    var cursorCode = flow("proof.pages({url:input.url})"), arrayCode = flow("input.items");
    for (var w = 0; w < 5; w++) { time({url: url}, cursorCode); time({items: all}, arrayCode); }
    var tc = [], ta = [];
    for (var k = 0; k < 7; k++) { tc.push(time({url: url}, cursorCode)); ta.push(time({items: all}, arrayCode)); }
    tc.sort(function (a, b) { return a - b; }); ta.sort(function (a, b) { return a - b; });
    print("for-each-chunk-cursor OK (" + checks + " checks); median ms: cursor " + tc[3].toFixed(1) + ", array " + ta[3].toFixed(1));
  } finally {
    server.stop(0);
    files.deleteDirectory(project);
  }
}
