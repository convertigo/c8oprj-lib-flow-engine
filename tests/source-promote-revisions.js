// A missing revision selects one target draft, never a supplied payload or a
// draft changed while validation was running. No Java/Studio fixture required.
var engineDir = new java.io.File(arguments[0]);
var service = eval(String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir,'modules/flow-code-service.js'),'UTF-8')));
var working, saved, validations, mutate, valid, altered, checks=0;
function assert(value,message){checks++;if(!value)throw new Error(message);}
var env={
  currentProjectName:function(){return 'Proof';},
  normalizeFlowScriptFunctionSyntax:function(code){return code;},
  normalizeFlowScriptCode:function(code){return code;},
  stripFlowScriptMirrorHeader:function(code){return code;},
  sha256Hex:function(code){return 'hash:'+code;},
  flowScriptCorrectSource:function(blocks,code){return {code:code,fixes:[]};},
  readProjectFlowWorkingCode:function(name){return working && name === 'Sample' ? {code:working.code,revision:working.revision}:null;},
  flowScriptValidateRequest:function(){validations++;if(mutate)working={code:'new',revision:'r2'};return {ok:valid,source:JSON.stringify({nodes:[{block:'set',props:{value:altered && validations>1?2:1}}]}),definition:{},diagnostics:valid?[]:[{severity:'error',code:'INVALID_EXPRESSION'}]};},
  setProjectFlow:function(blocks,name,source,request){saved={name:name,code:request.code};working=null;return {codeRevision:'saved'};},
  renderFlowScript:function(){return 'checked';},
  parseSource:JSON.parse,
  sourceChangedLines:function(a,b){return a===b?0:2;}
};
function reset(){working={code:'checked',revision:'r1'};saved=null;validations=0;mutate=false;valid=true;altered=false;}
function promote(request){return service.flowCodePromoteRequest({},Object.assign({name:'Sample'},request||{}),env);}
reset();var stale=promote({revision:'r0'});
assert(!stale.ok && stale.error.code==='FLOW_CODE_DRAFT_REVISION_MISMATCH' && !saved && validations===0,'Explicit stale revision must fail before validation');
assert(stale.error.message.indexOf('r0')>=0 && stale.error.message.indexOf('r1')>=0 && !/changed since/.test(stale.error.message) &&
 stale.error.details.receivedRevision==='r0' && stale.error.details.currentRevision==='r1','An unrecognized revision must name both revisions without inventing a concurrent change');
reset();mutate=true;var raced=promote();
assert(!raced.ok && raced.error.code==='FLOW_CODE_DRAFT_REVISION_MISMATCH' && raced.revision==='r2' && !saved,'Changed draft was promoted after validation');
reset();var selected=promote();
assert(selected.ok && selected.promoted && validations===2 && saved.code==='checked','Unique current draft must be validated and saved');
assert(!selected.fixes && selected.draftRevision==='r1' && !selected.linted,'Selecting the checked draft must not fabricate a source correction');
reset();var explicit=promote({revision:'r1'});
assert(explicit.ok && !explicit.fixes,'Explicit correct revision must not produce a fabricated correction');
reset();var supplied=promote({code:'client payload'});
assert(!supplied.ok && supplied.error.code==='FLOW_CODE_REVISION_REQUIRED' && !saved && validations===0,'A payload is not the unique checked working copy');
reset();valid=false;var invalid=promote();
assert(!invalid.ok && !saved,'Invalid current draft must not be saved');
reset();working=null;var missing=promote();
assert(!missing.ok && missing.error.code==='FLOW_CODE_DRAFT_MISSING' && !saved,'No target draft must not select another Flow');
reset();assert(promote({code:null}).ok,'Null code is an omitted payload');
reset();altered=true;var unsafe=promote({revision:'r1'});
assert(!unsafe.ok && unsafe.error.code==='FLOWSCRIPT_FORMAT_CHANGED_PROGRAM' && !saved && working.code==='checked','Formatter program change must preserve draft and refuse every write');
reset();var unchanged=promote({revision:'r1'});
assert(!unchanged.linted && unchanged.changedLines===0,'Unchanged promotion reports no changed lines');
print('source-promote-revisions OK ('+checks+' checks)');
