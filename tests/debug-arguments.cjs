const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function implementation(name){const source=fs.readFileSync(__dirname+'/../_flow/blocks/'+name+'.block.js','utf8');return vm.runInNewContext(source.substring(source.indexOf('(function () {')), {flowEngineClass:()=>({nanoTime:()=>0})});}
for(const name of ['set','if','return']){
 let evaluations=0,ordinaryEffects=0;let captured;
 const helpers={props:{path:'local.answer',value:'source',condition:'source'},compileValue:()=>()=>++evaluations,compileExpression:()=>()=>++evaluations,
  compileWrite:()=> (_ctx,value)=>{ordinaryEffects++;return value;},debug(runner,resolve,run){Object.defineProperty(runner,'debug',{value:{resolve,run}});return runner;}};
 const ctx={read:()=>null,returnValue:value=>value,runNodes:()=>++ordinaryEffects};
 const node={then:[],else:[]};const runner=implementation(name).prepareNode(node,helpers);
 captured=runner.debug.resolve(ctx,node);assert.equal(evaluations,1);runner.debug.run(ctx,node,captured);assert.equal(evaluations,1,'captured arguments must be consumed without evaluation');
 runner(ctx,node);assert.equal(evaluations,2,'ordinary runner still executes its original resolver');
}
console.log('Prepared set/if/return resolve once, consume captured arguments, and retain the original ordinary runner.');

let checks=0,iterations=0;
const whileBlock=implementation('while');
const loopCtx={stopped:false,props:()=>({condition:'loop',maxIterations:3,timeoutMs:1000}),template:value=>value,canContinue:()=>true,
 runLoopBody(){iterations++;},throwFlow(error){throw error;}};
const loop=whileBlock.prepareNode({nodes:[]},{props:{condition:'loop'},compileExpression:()=>()=>{checks++;return iterations<2;},debug(runner,resolve,run){Object.defineProperty(runner,'debug',{value:{resolve,run}});return runner;}});
const loopArgs=loop.debug.resolve(loopCtx);assert.equal(checks,1);
assert.equal(loop.debug.run(loopCtx,{nodes:[]},loopArgs).iterations,2);
assert.equal(checks,3,'first condition consumed once, later conditions reevaluated per iteration');
assert.equal(loopArgs.condition,false);
console.log('While condition capture consumes its first value once and preserves reevaluation on subsequent iterations.');
