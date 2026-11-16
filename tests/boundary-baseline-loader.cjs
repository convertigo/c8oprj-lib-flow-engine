// Load the same tests against a previous source revision without changing the checkout.
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');
const read=fs.readFileSync,exists=fs.existsSync;
function source(file){if(typeof file!=='string')return null;const rel=path.relative(process.cwd(),path.resolve(file)).replaceAll('\\','/');return rel.startsWith('_flow/')?rel:null;}
if(process.env.BOUNDARY_BASELINE_REF){
 fs.readFileSync=function(file,options){const rel=source(file);if(!rel)return read.apply(this,arguments);const data=cp.execFileSync('git',['show',process.env.BOUNDARY_BASELINE_REF+':'+rel],{stdio:['ignore','pipe','ignore']});return options?data.toString(typeof options==='string'?options:options.encoding):data;};
 fs.existsSync=function(file){const rel=source(file);if(!rel)return exists.apply(this,arguments);try{cp.execFileSync('git',['cat-file','-e',process.env.BOUNDARY_BASELINE_REF+':'+rel],{stdio:'ignore'});return true;}catch{return false;}};
}
