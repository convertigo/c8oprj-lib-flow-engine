function (input, execution) {
 input=input||{}; execution=execution||{};
 function fail(code,message){var e=new Error(message);e.code=code;throw e;}
 var hasContent=input.content!==null&&input.content!==undefined,url=String(input.url||"");
 if(hasContent===!!url)fail("DOWNLOAD_SOURCE_INVALID","Supply content or url, never both.");
 var limit=input.maxBytes===undefined?10485760:input.maxBytes;
 if(!Number.isSafeInteger(limit)||limit<1||limit>104857600)fail("DOWNLOAD_BOUNDS","maxBytes must be an integer from 1 to 104857600.");
 var name=String(input.filename||"download.txt").replace(/[\u0000-\u001f\u007f/\\]/g,"_").slice(0,180);
 if(name==="."||name==="..")name="download.txt";
 var mime=String(input.mimeType||"text/plain;charset=utf-8");
 if(/[\r\n]/.test(mime))fail("DOWNLOAD_MIME_INVALID","Invalid MIME type.");
 function finish(blob) {
  if(blob.size>limit)fail("DOWNLOAD_TOO_LARGE","Download exceeds maxBytes.");
  if(execution.canContinue&&execution.canContinue()===false)fail("DOWNLOAD_CANCELLED","Download cancelled.");
  var objectUrl=URL.createObjectURL(blob),link=document.createElement("a");
  link.href=objectUrl;link.download=name;link.style.display="none";
  try {document.body.appendChild(link);link.click();}
  finally {link.remove();setTimeout(function(){URL.revokeObjectURL(objectUrl);},2000);}
  return {filename:name,mimeType:mime,size:blob.size};
 }
 if(hasContent) {
  if(typeof input.content!=="string")fail("DOWNLOAD_CONTENT_INVALID","content must be text.");
  return finish(new Blob([input.content],{type:mime}));
 }
 var target=new URL(url,document.baseURI);
 if(!/^https?:$/.test(target.protocol))fail("DOWNLOAD_URL_INVALID","Use an HTTP(S) URL.");
 return fetch(target.href,{credentials:"same-origin",signal:execution.signal}).then(function(response){
  if(!response.ok)fail("DOWNLOAD_HTTP_ERROR","Download failed with HTTP "+response.status+".");
  if(Number(response.headers.get("content-length"))>limit) {
   if(response.body)response.body.cancel();
   fail("DOWNLOAD_TOO_LARGE","Download exceeds maxBytes.");
  }
  if(!response.body||!response.body.getReader)return response.arrayBuffer().then(function(bytes){return new Blob([bytes],{type:mime});});
  var reader=response.body.getReader(),chunks=[],size=0;
  function read() {return reader.read().then(function(chunk){
   if(chunk.done)return new Blob(chunks,{type:mime});
   size+=chunk.value.byteLength;
   if(size>limit)return reader.cancel().then(function(){fail("DOWNLOAD_TOO_LARGE","Download exceeds maxBytes.");});
   chunks.push(chunk.value);return read();
  });}
  return read().then(function(blob){reader.releaseLock();return blob;},function(error){reader.releaseLock();throw error;});
 }).then(finish);
}
