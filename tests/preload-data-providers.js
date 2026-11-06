// The preload of a project prepares the blocks named by config.data.providers: data.read calls them by name at run
// time, so no plan reaches them and their first call compiled them (11 to 21 s for sql.table on a loaded host).
var File=java.io.File,Files=java.nio.file.Files,FU=Packages.org.apache.commons.io.FileUtils;
var workspace=Files.createTempDirectory('flow-preload-data-providers-').toFile(),project=new File(workspace,'PreloadProviders');
new File(project,'_flow/blocks/probe').mkdirs();
FU.writeStringToFile(new File(project,'c8oProject.yaml'),'convertigo: 8.5.0.m006\n↓PreloadProviders [core.Project]:\n','UTF-8');
FU.writeStringToFile(new File(project,'_flow/engine.yaml'),'version: 1\npreload:\n  blocks: [probe.table]\nconfig:\n  data:\n    providers:\n      table: {implementation: probe.table}\n      rows: {implementation: probe.rows}\n      again: {implementation: probe.rows}\n      absent: {implementation: probe.absent}\n','UTF-8');
['table','rows'].forEach(function(name){
	FU.writeStringToFile(new File(project,'_flow/blocks/probe/'+name+'.block.js'),'const _meta={runtime:"rhino",properties:{},outputs:{out:{type:"object"}}};\n(function(){return {run:function(){throw Error("preload executed a provider");}};}())','UTF-8');
});
var __flowEngineDir=String(new File(arguments[0]).getCanonicalPath()),__flowProjectDir=String(project),engine=eval(String(FU.readFileToString(new File(__flowEngineDir,'Engine.js'),'UTF-8')));
var answer=JSON.parse(String(engine.preload(JSON.stringify({project:'PreloadProviders',flows:[]}))));
var plans=answer.blockPlans||[],rows=plans.filter(function(plan){return plan.block==='probe.rows';});
function check(ok,name){if(!ok)throw Error(name+': '+JSON.stringify(answer));}
check(answer.ok===true,'preload-answers');
// preload.blocks first (a plan), then each provider implementation once, compiled; an unknown one is left to the config check
check(plans.length===3&&plans[0].block==='probe.table'&&plans[0].provider===undefined&&plans[1].block==='probe.table'&&plans[1].provider===true,'preload-blocks-first-then-providers-once');
check(rows.length===1&&rows[0].ok===true&&rows[0].provider===true,'provider-block-prepared-before-the-first-call');
check(plans.every(function(plan){return plan.block!=='probe.absent';}),'unknown-provider-implementation-not-reported-here');
print(JSON.stringify({passed:true,assertions:4,blockPlans:plans.map(function(plan){return plan.block+(plan.provider?' (provider)':'');})}));FU.deleteQuietly(workspace);java.lang.System.exit(0);
