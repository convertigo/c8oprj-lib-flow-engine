// Existing binary requester attachment contract; no servlet or Java changes.
var root = String(new java.io.File(arguments[0] || "_flow").getAbsolutePath());
var text = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(root, "blocks/file/respond.block.js"), "UTF-8"));
var block = eval(text.substring(text.indexOf("(function")));
var count = 0;
function check(ok, message) { count++; if (!ok) throw new Error(message); }
function run(extra, uri) {
 var p = {content:"\ufeffÉquipe 🧪",filename:"été.csv",mimeType:"text/csv;charset=utf-8",maxBytes:100,status:200};
 Object.keys(extra || {}).forEach(function(k){p[k]=extra[k];});
 var doc = Packages.javax.xml.parsers.DocumentBuilderFactory.newInstance().newDocumentBuilder().newDocument();
 doc.appendChild(doc.createElement("document"));
 var headers = {}, status = null;
 var context = {outputDocument:doc,httpServletRequest:{getRequestURI:function(){return uri || "/project/.bin";}},setResponseHeader:function(k,v){headers[k]=v;},setResponseStatus:function(v){status=v;}};
 var out = block.run({props:function(){return p;},template:function(v){return v;},convertigoContext:function(){return context;},throwFlow:function(e){throw e;}},{});
 return {out:out,doc:doc,headers:headers,status:status};
}
var b=run();
check(b.out.size===15 && b.status===200,"UTF-8 bytes and HTTP status");
var attachment=b.doc.getDocumentElement().getFirstChild();
check(String(attachment.getAttribute("type"))==="attachment" && String(attachment.getAttribute("encoding"))==="base64","native attachment envelope");
var decoded=String(new java.lang.String(java.util.Base64.getDecoder().decode(String(attachment.getTextContent())),java.nio.charset.StandardCharsets.UTF_8));
check(decoded==="\ufeffÉquipe 🧪","bytes roundtrip, including BOM and emoji");
check(b.headers["Content-Disposition"].indexOf("filename*=UTF-8''%C3%A9t%C3%A9.csv")>=0,"UTF-8 filename");
check(b.headers["Cache-Control"]==="no-store" && b.headers["X-Content-Type-Options"]==="nosniff","response headers");
var json=run({},"/project/.json");
check(!json.doc.getDocumentElement().hasChildNodes() && json.status===null && json.out.size===15,"JSON/MCP do not leak a base64 attachment");
check(run({status:413}).status===413,"bounded failure facade keeps its HTTP status");
check(run({filename:"../bad\r\n.csv"}).out.filename===".._bad__.csv","filename controls and path separators");
[{maxBytes:2,code:"DOWNLOAD_TOO_LARGE"},{maxBytes:0,code:"DOWNLOAD_BOUNDS"},{mimeType:"text/csv\r\nInjected: x",code:"DOWNLOAD_MIME_INVALID"},{status:600,code:"DOWNLOAD_STATUS_INVALID"},{content:{},code:"DOWNLOAD_CONTENT_INVALID"}].forEach(function(item){
 var expected=item.code; delete item.code; var caught=null;try{run(item);}catch(e){caught=e;}
 check(caught && caught.code===expected,"structured rejection: "+expected);
});
print("file.respond: "+count+" assertions passed");
