const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const schema = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../_flow/modules/schema-contract.js'), 'utf8'));
const type = type => ({type});
const array = items => ({type:'array', items});
const map = values => ({type:'object', additionalProperties:values});
const record = {type:'object', properties:{name:type('string'), count:type('number')}, required:['name'], additionalProperties:false};
for (const [expected, actual, status] of [
  [type('number'),type('integer'),'compatible'], [type('integer'),type('number'),'incompatible'],
  [type('string'),type('unknown'),'unknown'], [type('unknown'),type('string'),'unknown'],
  [array(type('number')),array(type('integer')),'compatible'],
  [array(type('number')),array(type('string')),'incompatible'],
  [array(type('number')),array(type('unknown')),'unknown'],
  [map(type('number')),map(type('integer')),'compatible'],
  [map(type('number')),map(type('string')),'incompatible'],
  [record,record,'compatible'], [record,{...record,required:[]},'unknown'],
  [type('string'),{type:'string',nullable:true},'incompatible'],
  [{type:'string',nullable:true},type('null'),'compatible'],
  [{type:'string',enum:['red']},type('string'),'unknown'],
  [{type:'string',enum:['red']},{type:'string',enum:['blue']},'incompatible']
]) assert.equal(schema.compare(expected,actual).status,status, JSON.stringify({expected,actual}));
for (const [expected, value, status] of [
  [array(record),[],'compatible'], [array(record),[{name:'Paris',count:2}],'compatible'],
  [array(record),[{count:2}],'incompatible'], [array(record),[{name:'Paris',extra:true}],'incompatible'],
  [map(type('number')),{},'compatible'], [map(type('number')),{Paris:18.5},'compatible'],
  [map(type('number')),{Paris:'warm'},'incompatible'], [type('number'),NaN,'incompatible'],
  [type('number'),Infinity,'incompatible'], [type('integer'),1.2,'incompatible'],
  [type('unknown'),1,'unknown'], [{type:'string',enum:['x']},'other','incompatible']
]) assert.equal(schema.validate(expected,value).status,status,JSON.stringify({expected,value}));
for (const invalid of [null, {}, {type:'array'}, {type:'string',items:type('number')},
  {type:'object',required:['missing']}, {type:'string',pattern:'.*'}, {type:'object',additionalProperties:'string'},
  {$ref:'somewhere'}, {type:'boolean',enum:[]}]) {
  assert.equal(schema.definition(invalid).valid,false,JSON.stringify(invalid));
  assert.equal(schema.compare(type('string'),invalid).status,'unknown');
}
console.log('schema-contract: compatibility, unknown evidence, nested data, maps, required fields and fail-closed constraints OK');
