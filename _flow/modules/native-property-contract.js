/* Validate the native DBO contract before any setter, YAML writer or Java input sync.
 * These are authoring properties, not the coercible business inputs of a running Flow.
 * This module has no mutation of beans and never calls compileProperty.
 */
(function () {
 function own(o,k){return o != null && Object.prototype.hasOwnProperty.call(o,k);}
 function clone(v){return JSON.parse(JSON.stringify(v));}
 function show(v){var s=JSON.stringify(v);return s===undefined?String(v):s;}
 function invalid(path,value,expected,code){
  var error=new Error(path+' takes '+expected+', not '+show(value)+'.');
  error.code=code||'NATIVE_PROPERTY_VALUE_INVALID';
  error.details={property:path,value:value,expected:expected};
  throw error;
 }
 function scalar(value,spec,path){
  spec=spec||{};path=String(path||'property');
  var next=value, expected=spec.expected, text=typeof value==='string'?value.trim():null;
  if(spec.type==='boolean'){
   expected=expected||'true or false';
   if(typeof value==='boolean')next=value;
   else if(text!==null&&/^(true|false)$/i.test(text))next=text.toLowerCase()==='true';
   else invalid(path,value,expected,spec.code);
  }else if(spec.type==='integer'||spec.type==='number'){
   var integer=spec.type==='integer',min=spec.min===undefined?(integer?-2147483648:-Number.MAX_VALUE):spec.min;
   var max=spec.max===undefined?(integer?2147483647:Number.MAX_VALUE):spec.max;
   expected=expected||(integer?'a whole number':'a finite number')+' from '+min+' to '+max;
   if(typeof value==='number')next=value;
   else if(text!==null&&(integer?/^[+-]?\d+$/:/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/).test(text))next=Number(text);
   else invalid(path,value,expected,spec.code);
   if(!isFinite(next)||integer&&Math.floor(next)!==next||next<min||next>max)invalid(path,value,expected,spec.code);
  }else if(spec.enum){
   var options=spec.enum.map(function(v){return typeof v==='string'?{name:v,label:v}:v;});
   expected=expected||'one of '+options.map(function(v){return v.name+(v.label&&v.label!==v.name?' ('+v.label+')':'');}).join(', ');
   if(text===null)invalid(path,value,expected,spec.code);
   var exact=[],folded=[];
   options.forEach(function(v){
    if(text===v.name||text===v.label)exact.push(v.name);
    if(text.toLowerCase()===String(v.name).toLowerCase()||text.toLowerCase()===String(v.label||v.name).toLowerCase())folded.push(v.name);
   });
   var hits=exact.length?exact:folded;
   if(hits.length!==1)invalid(path,value,expected,spec.code);
   next=hits[0];
  }else if(spec.type==='string'){
   expected=expected||'text';
   if(typeof value!=='string')invalid(path,value,expected,spec.code);
   next=spec.trim?text:value;
   if(spec.minLength!==undefined&&next.length<spec.minLength||spec.maxLength!==undefined&&next.length>spec.maxLength||spec.singleLine&&/[\r\n]/.test(next))invalid(path,value,expected,spec.code);
  }
  return {value:next,normalizations:value===next?[]:[{code:'NATIVE_PROPERTY_NORMALIZED',property:path,before:value,after:next}]};
 }
 function properties(values,contracts,prefix){
  var out=clone(values||{}),notes=[];
  Object.keys(contracts||{}).forEach(function(key){if(!own(out,key))return;
   var checked=scalar(out[key],contracts[key],prefix?prefix+'.'+key:key);
   out[key]=checked.value;notes=notes.concat(checked.normalizations);
  });
  return {value:out,normalizations:notes};
 }
 var jsonTypes=['string','integer','number','boolean','array','object','any','unknown','null'];
 var aliases={bool:'boolean',int:'integer',double:'number',float:'number'};
 function metadata(raw,conversion){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))invalid('_flow',raw,'a literal object');
  var out=clone(raw),notes=[];
  function check(object,key,spec,path){if(!own(object,key))return;
   var checked=scalar(object[key],spec,path);object[key]=checked.value;notes=notes.concat(checked.normalizations);
  }
  check(out,'accessibility',{enum:['private','hidden','public'],code:'FLOW_ACCESSIBILITY_INVALID'},'_flow.accessibility');
  check(out,'authenticatedContextRequired',{type:'boolean',code:'FLOW_AUTHENTICATION_INVALID'},'_flow.authenticatedContextRequired');
  var which=own(out,'inputs')?'inputs':own(out,'input')?'input':null;
  if(which){
   var inputs=out[which];
   if(!inputs||typeof inputs!=='object'||Array.isArray(inputs))invalid('_flow.'+which,inputs,'an object of named input schemas');
   Object.keys(inputs).forEach(function(name){
    var spec=inputs[name],path='_flow.'+which+'.'+name;
    if(!/^[A-Za-z_$][\w$]*$/.test(name)||/^__/.test(name))invalid(path,name,'an input name without the reserved __ prefix');
    if(!spec||typeof spec!=='object'||Array.isArray(spec))invalid(path,spec,'an input schema object');
    ['required','multi','multiValued','isFileUpload','nullable'].forEach(function(key){
     check(spec,key,{type:'boolean',code:key==='isFileUpload'?'FLOW_INPUT_UPLOAD_INVALID':'FLOW_INPUT_PROPERTY_INVALID'},path+'.'+key);
    });
    check(spec,'visibility',{type:'integer',min:-1,max:15,expected:'-1 or an integer bitmask from 0 to 15',code:'FLOW_INPUT_VISIBILITY_INVALID'},path+'.visibility');
    check(spec,'description',{type:'string',code:'FLOW_INPUT_DESCRIPTION_INVALID'},path+'.description');
    function schemaType(schema,where){
     if(!schema||typeof schema!=='object'||Array.isArray(schema))invalid(where,schema,'a schema object');
     if(own(schema,'type')){
      var before=schema.type,types=Array.isArray(before)?before:[before],normalized=[];
      types.forEach(function(type){
       if(typeof type!=='string')invalid(where+'.type',type,'one of '+jsonTypes.join(', '),'FLOW_INPUT_SCHEMA_INVALID');
       var next=type.trim().toLowerCase();next=aliases[next]||next;
       if(jsonTypes.indexOf(next)<0)invalid(where+'.type',type,'one of '+jsonTypes.join(', '),'FLOW_INPUT_SCHEMA_INVALID');
       normalized.push(next);
      });
      if(!normalized.length)invalid(where+'.type',before,'at least one JSON type','FLOW_INPUT_SCHEMA_INVALID');
      schema.type=Array.isArray(before)?normalized:normalized[0];
      if(show(before)!==show(schema.type))notes.push({code:'NATIVE_PROPERTY_NORMALIZED',property:where+'.type',before:before,after:schema.type});
     }
     if(own(schema,'items'))schemaType(schema.items,where+'.items');
     if(own(schema,'properties')){
      if(!schema.properties||typeof schema.properties!=='object'||Array.isArray(schema.properties))invalid(where+'.properties',schema.properties,'an object of property schemas');
      Object.keys(schema.properties).forEach(function(key){schemaType(schema.properties[key],where+'.properties.'+key);});
     }
    }
    // `kind` is a historical input type alias, not a block property's editor kind.
    if(!own(spec,'type')&&own(spec,'kind')){
     var tmp={type:spec.kind};schemaType(tmp,path);if(tmp.type!==spec.kind){notes.push({code:'NATIVE_PROPERTY_NORMALIZED',property:path+'.kind',before:spec.kind,after:tmp.type});spec.kind=tmp.type;}
    }
    schemaType(spec,path);
    if(own(spec,'schemaType'))invalid(path+'.schemaType',spec.schemaType,'type (the native schemaType is derived)','FLOW_INPUT_SCHEMA_INVALID');
    // Defaults have the declared Flow conversion contract; validate, do not change
    // their representation (objects and symbol references must survive native persistence).
    if(own(spec,'default')&&spec.default!==null&&conversion){
     var symbol=false;
     function hasSymbol(v){if(typeof v==='string'&&v.indexOf('${')>=0)symbol=true;else if(v&&typeof v==='object')Object.keys(v).forEach(function(k){hasSymbol(v[k]);});}
     hasSymbol(spec.default);
     if(!symbol){
      var converted=conversion.convert(spec.default,spec);
      if(!converted.ok)invalid(path+'.default',spec.default,converted.message,'FLOW_INPUT_DEFAULT_INVALID');
      if(Array.isArray(spec.enum)&&spec.enum.indexOf(converted.value)<0)invalid(path+'.default',spec.default,'one of '+spec.enum.map(show).join(', '),'FLOW_INPUT_DEFAULT_INVALID');
     }
    }
   });
  }
  return {value:out,normalizations:notes};
 }
 // AST ranges of static metadata, never a text search for a property name inside
 // comments, defaults or executable statements. Mask the Flow `if({...})` spelling.
 function locations(code){
  var out=Object.create(null),masked=String(code).replace(/"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|\bif\s*(?=\(\s*\{)/g,function(t){return /^if\b/.test(t)?'i_'+t.substring(2):t;});
  function kind(n){return n&&String(n.getClass().getSimpleName());}
  function key(n){return kind(n)==='Name'?String(n.getIdentifier()):kind(n)==='StringLiteral'?String(n.getValue()):'';}
  function walk(n,path){
   out[path]={line:Number(n.getLineno()),start:Number(n.getAbsolutePosition()),end:Number(n.getAbsolutePosition()+n.getLength())};
   if(kind(n)!=='ObjectLiteral')return;
   var list=n.getElements();for(var i=0;i<list.size();i++){var p=list.get(i);walk(p.getValue(),path+'.'+key(p.getKey()));}
  }
  try{
   var options=new Packages.org.mozilla.javascript.CompilerEnvirons();options.setLanguageVersion(200);
   var ast=new Packages.org.mozilla.javascript.Parser(options).parse(masked,'native-property-locations',1);
   ast.visit(new Packages.org.mozilla.javascript.ast.NodeVisitor({visit:function(n){
    if(kind(n)==='VariableInitializer'&&key(n.getTarget())==='_flow'&&kind(n.getParent().getParent())==='AstRoot')walk(n.getInitializer(),'_flow');
    return true;
   }}));
  }catch(_unsupportedDsl){/* existing parser diagnoses syntax; no unsafe source rewrite */}
  return out;
 }
 function sourceMetadata(code,raw,conversion,rewrite){
  var positions,checked;
  function where(path){positions=positions||locations(code);return positions[path]||positions._flow||{line:1};}
  try{checked=metadata(raw,conversion);}catch(e){
   var path=e.details&&e.details.property||'_flow',line=where(path).line;
   e.message+=' at line '+line+'.';
   e.details=[{severity:'error',code:e.code,line:line,path:path,property:path,message:e.message,actual:e.details&&e.details.value,expected:e.details&&e.details.expected}];throw e;
  }
  var fixes=[],edits=[];
  checked.normalizations.forEach(function(note){
   var pos=where(note.property);note.line=pos.line;
   if(rewrite){
    if(!positions[note.property])invalid(note.property,note.before,'canonical '+show(note.after)+' (rewrite this metadata value explicitly)');
    var before=String(code).substring(pos.start,pos.end),after=show(note.after);
    fixes.push({code:note.code,line:pos.line,property:note.property,before:before,after:after});edits.push({start:pos.start,end:pos.end,text:after});
   }
  });
  edits.sort(function(a,b){return b.start-a.start;}).forEach(function(e){code=code.substring(0,e.start)+e.text+code.substring(e.end);});
  return {value:checked.value,normalizations:checked.normalizations,code:code,fixes:fixes};
 }
 return {scalar:scalar,properties:properties,metadata:metadata,sourceMetadata:sourceMetadata,invalid:invalid};
}())
