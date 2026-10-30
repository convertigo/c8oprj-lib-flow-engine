// The fallback implementation must understand the value notation written by FlowScript.
var root=new java.io.File(arguments[0]);
var source=String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(root,"blocks/flow/call.block.js"),"UTF-8"));
var implementation=eval(source.substring(source.indexOf("(function"))),seen,checks=0;
function check(ok,message){checks++;if(!ok)throw Error(message);}
var values={"input.name":"Alice","input.enabled":false,"input.count":0};
var context={
 props:function(node){return node.props;},literal:function(v){return v;},
 input:function(v){return v.value;},
 expr:function(value){if(/^\$\{|^\{\{/.test(value))throw Error("Value notation passed to expression parser");return values[value]!==undefined?values[value]:value;},
 template:function(value){var name=value.replace(/^\$\{|^\{\{|\}\}$|\}$/g,"").trim();return values[name];},
 flowGet:function(){return {source:"child"};},scopes:{config:{}},
 runFlowSource:function(source,config,request){seen=request.input;return {result:seen};}
};
implementation.run(context,{props:{flow:"Child",input:{name:"${input.name}",enabled:"${input.enabled}",count:"${input.count}",nested:{items:["${input.name}"]}}}});
check(seen.name==="Alice","FlowScript input name resolves");
check(seen.enabled===false&&seen.count===0,"Typed false and zero survive");
check(seen.nested.items[0]==="Alice","Nested arrays and objects resolve");
implementation.run(context,{props:{flow:"Child",input:{name:"input.name"}}});
check(seen.name==="Alice","Existing expression input remains compatible");
implementation.run(context,{props:{flow:"Child",input:{name:"{{input.name}}"}}});
check(seen.name==="Alice","Migration notation remains readable");
print("flow-call-value-inputs OK ("+checks+" checks)");
