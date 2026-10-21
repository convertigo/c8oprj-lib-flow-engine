var root=new java.io.File(arguments[0]||'_flow').getAbsoluteFile();
var source=String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(root,'Engine.js'),'UTF-8'));
var cx=Packages.org.mozilla.javascript.Context.getCurrentContext();
var api=Packages.com.twinsoft.convertigo.engine.util.RhinoUtils;
var code='(function(){ var privateCount=0; return { next:function(){return ++privateCount;} }; }())';
var firstScope=cx.initStandardObjects(),secondScope=cx.initStandardObjects();
var a=api.evalCachedJavascript(cx,firstScope,code,'engine-module-isolation',1,null);
var b=api.evalCachedJavascript(cx,secondScope,code,'engine-module-isolation',1,null);
function next(value,scope){return value.next.call(cx,scope,value,[]);}
if(Number(next(a,firstScope))!==1||Number(next(a,firstScope))!==2||Number(next(b,secondScope))!==1)throw new Error('Compiled code sharing leaked evaluated state between scopes');
if(source.indexOf('RhinoUtils.evalCachedJavascript(')<0||source.indexOf('"/modules/"')<0)throw new Error('The engine-module bytecode path is absent');
print('module-bytecode-scope-isolation: shared compilation, independent evaluated closures OK');
