var root=new java.io.File(arguments[0]||'_flow').getAbsoluteFile();
var source=String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(root,'Engine.js'),'UTF-8'));
var cx=Packages.org.mozilla.javascript.Context.getCurrentContext();
var api=Packages.com.twinsoft.convertigo.engine.flow.FlowEngineBridge;
cx.setInterpretedMode(true);
var code='(function(){ var privateCount=0; return { next:function(){return ++privateCount;} }; }())';
var firstScope=cx.initStandardObjects(),secondScope=cx.initStandardObjects();
var a=api.evalSharedModule(cx,firstScope,code,'engine-module-isolation');
var field=java.lang.Class.forName('com.twinsoft.convertigo.engine.flow.FlowEngineBridge').getDeclaredField('compiledModules');
field.setAccessible(true);
var cache=field.get(null),compiled=Number(cache.compilations());
var b=api.evalSharedModule(cx,secondScope,code,'engine-module-isolation');
if(compiled!==Number(cache.compilations()))throw new Error('The same module was recompiled instead of reused');
if(!cx.isInterpretedMode())throw new Error('The caller mode was not restored');
function next(value,scope){return value.next.call(cx,scope,value,[]);}
if(Number(next(a,firstScope))!==1||Number(next(a,firstScope))!==2||Number(next(b,secondScope))!==1)throw new Error('Compiled code sharing leaked evaluated state between scopes');
if(source.indexOf('FlowEngineBridge.evalSharedModule(')<0||source.indexOf('"/modules/"')<0)throw new Error('The engine-module bytecode path is absent');
print('module-bytecode-scope-isolation: shared compilation, independent evaluated closures OK');
