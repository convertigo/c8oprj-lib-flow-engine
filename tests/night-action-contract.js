var source=String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(arguments[0],'modules/flow-tree-service.js'),'UTF-8'));
var start=source.indexOf('function descriptorPropertyContract('),end=source.indexOf('\n\tfunction ',start+10);
var descriptorPropertyContract=eval('('+source.substring(start,end).trim()+')');
function normalizeTree(value){return JSON.parse(JSON.stringify(value));}
var fields={value:{kind:'binding',type:'binding'}};
for each(var trait in ['ui.action','ui.action.variable']){
 var contract=descriptorPropertyContract(fields,{traits:[trait]});
 if(contract.value.intents.indexOf('expression')>=0 || contract.value.intents.indexOf('source')<0)throw Error('Action contracts must not advertise free expressions: '+JSON.stringify(contract));
}
if(descriptorPropertyContract(fields,{tag:'If',traits:['ui.control']}).value.intents.indexOf('expression')>=0)throw Error('If shared contract must describe action-safe values');
if(descriptorPropertyContract(fields,{traits:['ui.component']}).value.intents.indexOf('expression')<0)throw Error('Visible bindings retain browser expressions');
print('night-action-contract OK');
