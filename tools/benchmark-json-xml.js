// The exact Java JSON/XML utilities used by Flow.runCore and .json, no Java edits.
var thread=java.lang.management.ManagementFactory.getThreadMXBean(),id=java.lang.Thread.currentThread().getId();
if(!thread.isThreadAllocatedMemoryEnabled())thread.setThreadAllocatedMemoryEnabled(true);
var XMLUtils=Packages.com.twinsoft.convertigo.engine.util.XMLUtils, JSONObject=Packages.org.codehaus.jettison.json.JSONObject;
if(Packages.com.twinsoft.convertigo.engine.Engine.logBeans==null)Packages.com.twinsoft.convertigo.engine.Engine.logBeans=Packages.org.apache.log4j.Logger.getLogger('beans');
var JsonRoot=Packages.com.twinsoft.convertigo.engine.enums.JsonOutput.JsonRoot;
function measure(fn){var a=thread.getThreadAllocatedBytes(id),n=java.lang.System.nanoTime(),value=fn();return {value:value,ms:Number(java.lang.System.nanoTime()-n)/1e6,bytes:Number(thread.getThreadAllocatedBytes(id)-a)};}
function fixture(rows,columns){var out=[];for(var i=0;i<rows;i++){if(i%5===4)continue;var r={id:i+1};for(var j=0;j<columns;j++){var value=j%3===0?'<Row '+i+' & cell '+j+'>':j%3===1?i*.25+j:i%2===0;var text=String(value),numeric=/^-?[0-9]+([.][0-9]+)?$/.test(text);if(j%3===1&&numeric)text=Number(value).toFixed(2);if(j%3===2)text=value?'Oui':'Non';r['c'+j]={value:value,text:text.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;'),numeric:numeric};}out.push(r);}return JSON.stringify({rows:out,count:out.length});}
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object'){var o={};Object.keys(v).sort().forEach(function(k){o[k]=canonical(v[k]);});return o;}return v;}
function difference(a,b,path){if(a===b)return '';if(typeof a!==typeof b||a==null||b==null)return path+': '+JSON.stringify(a)+' != '+JSON.stringify(b);if(typeof a!=='object')return path+': '+JSON.stringify(a)+' != '+JSON.stringify(b);var keys=Object.keys(a).concat(Object.keys(b));for(var k=0;k<keys.length;k++){var diff=difference(a[keys[k]],b[keys[k]],path+'.'+keys[k]);if(diff)return diff;}return '';}
['100x12','1000x12'].forEach(function(shape){var s=shape.split('x'),encoded=fixture(Number(s[0]),Number(s[1])),object=new JSONObject(encoded);
 for(var i=0;i<30;i++){
  var toXml=measure(function(){var d=XMLUtils.createDom('java');d.appendChild(d.createElement('document'));XMLUtils.jsonToXml(object,d.getDocumentElement());return d;});
  var toJson=measure(function(){return String(XMLUtils.XmlToJson(toXml.value.getDocumentElement(),true,true,JsonRoot.docNode));});
  var direct=measure(function(){return String(object.toString());});
  var actual=JSON.parse(toJson.value),body=actual.document||actual;
  if(body.attr&&JSON.stringify(body.attr)==='{"type":"object"}')delete body.attr; // XML-generated transport annotation, absent from the business fixture.
  var diff=difference(body,JSON.parse(encoded),'result');if(diff)throw new Error('JSON/XML parity failed: '+diff);
  print('MEASURE '+JSON.stringify({shape:shape,warmup:i<10,pass:i+1,resultBytes:new java.lang.String(encoded).getBytes('UTF-8').length,jsonToXmlMs:toXml.ms,xmlToJsonMs:toJson.ms,roundTripMs:toXml.ms+toJson.ms,roundTripBytes:toXml.bytes+toJson.bytes,directMs:direct.ms,directBytes:direct.bytes}));
 }
});
