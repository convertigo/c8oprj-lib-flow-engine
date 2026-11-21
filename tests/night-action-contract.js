var source=String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(arguments[0],'modules/flow-tree-service.js'),'UTF-8'));
var start=source.indexOf('function descriptorPropertyContract('),end=source.indexOf('\n\tfunction ',start+10);
var descriptorPropertyContract=eval('('+source.substring(start,end).trim()+')');
function normalizeTree(value){return JSON.parse(JSON.stringify(value));}
var fields={value:{kind:'binding',type:'binding'}};
// An action value and If.test take an expression in braces too (frontbuilder 973b12c, 76db082, 06e295c): composed from the
// visible sources in actions, free in visual content, as the description of the property says.
for each(var traits in [['ui.action'],['ui.action.variable'],['ui.control'],['ui.component']]){
 var contract=descriptorPropertyContract(fields,{tag:traits[0]==='ui.control'?'If':'',traits:traits});
 if(contract.value.intents.join('|')!=='literal|expression|source')throw Error('A binding takes a literal, an expression or a source: '+JSON.stringify(contract));
}
if(descriptorPropertyContract({label:{kind:'text',type:'string'}},{traits:['ui.action']}).label.intents.join('|')!=='literal')throw Error('A text property takes a literal');
print('night-action-contract OK');
