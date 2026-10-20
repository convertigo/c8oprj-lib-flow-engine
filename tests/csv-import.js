var root=new java.io.File(arguments[0]).getCanonicalFile(),files=Packages.org.apache.commons.io.FileUtils;
var project=java.nio.file.Files.createTempDirectory('flow-csv-import-').toFile(),__flowEngineDir=String(root),__flowProjectDir=String(project),checks=0;
function assert(v,m){checks++;if(!v)throw new Error(m);}
try{
 var engine=eval(String(files.readFileToString(new java.io.File(root,'Engine.js'),'UTF-8')));
 function api(m,r){return JSON.parse(engine[m](JSON.stringify(r)));}
 var source='const _flow={inputs:{options:{type:"object"}}}\nfunction Parse({input,result}) {\n result.csv = csv.parse({text:input.options.text,path:input.options.path,separator:default(input.options.separator,";"),header:default(input.options.header,true),columns:input.options.columns,rowSchema:input.options.rowSchema,resource:input.options.resource,maxRows:default(input.options.maxRows,10000),maxBytes:default(input.options.maxBytes,16777216)})\n}';
 var write=api('flowCodeSet',{name:'Parse',code:source});assert(write.ok,'csv.parse must be in catalog: '+JSON.stringify(write));
 function parse(options){return api('flowCodeRun',{name:'Parse',input:{options:options}});}
 var schema={type:'object',additionalProperties:false,required:['id'],properties:{id:{type:'integer',title:'Identifiant'},label:{type:'string',title:'Libellé'},amount:{type:'number',title:'Montant'},active:{type:'boolean',title:'Actif'},due:{type:'string',format:'date',title:'Échéance'}}};
 var text='\ufeffIdentifiant;Libellé;Montant;Actif;Échéance\r\n1;"été; café";3.5;TRUE;2024-02-29\r\n2;"deux ""mots""\nligne";-1;0;2026-03-15\r\n';
 var a=parse({text:text,rowSchema:schema});assert(a.ok,'Typed CSV '+JSON.stringify(a));var rows=a.result.csv.rows;
 assert(rows.length===2&&rows[0].id===1&&rows[0].amount===3.5&&rows[0].active===true,'Typed numbers/boolean');
 assert(rows[0].label==='été; café'&&rows[1].label==='deux "mots"\nligne'&&rows[1].active===false,'BOM, accents, semicolons, doubled quotes, multiline');
 assert(rows[0].due==='2024-02-29'&&a.result.csv.byteLength>text.length,'Strict ISO and UTF-8 byte count');
 assert(a.result.csv.columns.join(',')==='id,label,amount,active,due','Schema title maps to stable field key');
 var dataSchema={type:'object',properties:{key:{type:'object',properties:{id:{type:'string',nullable:false}}},values:{type:'object',properties:{label:{type:'string'},active:{type:'boolean'},amount:{type:'string'}}},revision:{type:'string'}}};
 var resource={identity:['id'],fields:[{name:'id',label:'Identifiant',type:'int64'},{name:'label',label:'Libellé',type:'string'},{name:'active',label:'Actif',type:'boolean'},{name:'amount',label:'Montant',type:'decimal'}]};
 var typedData=parse({text:'Identifiant;Libellé;Actif;Montant\n9007199254740993;été;true;123456789.123456789\n',rowSchema:dataSchema,resource:resource});
 assert(typedData.ok&&typedData.result.csv.rows[0].key.id==='9007199254740993'&&typedData.result.csv.rows[0].values.active===true&&typedData.result.csv.rows[0].values.amount==='123456789.123456789','data.rowSchema envelope, readable labels and exact int64/decimal: '+JSON.stringify(typedData));
 var projectedData=parse({text:'Nom\nété\n',rowSchema:dataSchema,columns:[{field:'label',header:'Nom'}]});
 assert(projectedData.ok&&projectedData.result.csv.rows[0].values.label==='été'&&Object.keys(projectedData.result.csv.rows[0].key).length===0,'Export-compatible field/header selection and empty creation key');
 var imported=new java.io.File(project,'upload.csv');files.writeStringToFile(imported,text,'UTF-8');
 var b=parse({path:String(imported),rowSchema:schema});assert(b.ok&&JSON.stringify(b.result.csv)===JSON.stringify(a.result.csv),'Uploaded absolute path and text have identical contract');
 var relative=parse({path:'upload.csv',rowSchema:schema});assert(relative.ok&&relative.result.csv.rowCount===2,'Project-relative CSV');
 var comma=parse({text:'id,name\n1,a\n',separator:',',columns:['name','id'],rowSchema:{type:'object',properties:{id:{type:'integer'},name:{type:'string'}}}});assert(comma.ok&&comma.result.csv.rows[0].id===1&&comma.result.csv.columns[0]==='name','Explicit order + delimiter');
 var noHeader=parse({text:'1;été\n2;jour\n',header:false,columns:['id','label'],rowSchema:{type:'object',properties:{id:{type:'integer'},label:{type:'string'}}}});assert(noHeader.ok&&noHeader.result.csv.rows[1].id===2,'Explicit columns without header');
 var mapped=parse({text:'3;jour\n',header:'false',columns:[{field:'id'},{field:'label'}],rowSchema:{type:'object',properties:{id:{type:'integer'},label:{type:'string'}}}});assert(mapped.ok&&mapped.result.csv.rows[0].id===3,'Field mappings work without a header, including typed HTTP boolean text');
 var strings=parse({text:'id;value\n001;=1+1\n'});assert(strings.ok&&strings.result.csv.rows[0].id==='001'&&strings.result.csv.rows[0].value==='=1+1','Untyped cells remain strings; parser never executes formulas');
 assert(parse({text:''}).result.csv.rowCount===0,'Empty file');
 assert(parse({text:'a\n""\n\n"x"\n'}).result.csv.rowCount===2,'Quoted empty cell distinct from blank record');
 function refused(options,code){var r=parse(options);assert(!r.ok&&JSON.stringify(r.error).indexOf(code)>=0,'Expected '+code+': '+JSON.stringify(r));assert(!r.result||!r.result.csv,'No partial import on failure');}
 refused({text:'a\n1\n2\n',maxRows:1},'CSV_ROW_LIMIT_EXCEEDED');
 refused({text:'a\nété\n',maxBytes:5},'CSV_BYTE_LIMIT_EXCEEDED');
 refused({path:String(imported),maxBytes:2},'CSV_BYTE_LIMIT_EXCEEDED');
 refused({text:'a\n"unclosed'},'CSV_SYNTAX_INVALID');
 refused({text:'a\n"a"bad'},'CSV_SYNTAX_INVALID');
 refused({text:'a\nx"y'},'CSV_SYNTAX_INVALID');
 refused({text:'a;b\n1\n'},'CSV_COLUMN_COUNT');
 refused({text:'a;a\n1;2\n'},'CSV_HEADER_INVALID');
 refused({text:'__proto__\nx\n'},'CSV_HEADER_INVALID');
 refused({text:'a\n1\n',header:false},'CSV_COLUMNS_REQUIRED');
 refused({text:'a\n1\n',columns:['missing']},'CSV_COLUMN_MISSING');
 refused({text:'a\n1\n',separator:';;'},'CSV_SEPARATOR_INVALID');
 refused({text:'a\n1\n',path:String(imported)},'CSV_SOURCE_INVALID');
 refused({text:'Identifiant;Libellé;Montant;Actif;Échéance\nabc;x;1;true;2026-03-15\n',rowSchema:schema},'CSV_CELL_TYPE_INVALID');
 refused({text:'Identifiant;Libellé;Montant;Actif;Échéance\n1;x;1;true;2026-02-30\n',rowSchema:schema},'CSV_CELL_TYPE_INVALID');
 refused({text:'Identifiant;Libellé;Montant;Actif;Échéance\n;x;1;true;2026-03-15\n',rowSchema:schema},'CSV_CELL_TYPE_INVALID');
 refused({text:'a\n1\n',maxRows:0},'CSV_LIMIT_INVALID');
 refused({text:'label\nmissing id\n',rowSchema:{type:'object',properties:{id:{type:'integer'},label:{type:'string'}},required:['id']}},'CSV_CELL_TYPE_INVALID');
 refused({text:'unknown\nx\n',rowSchema:dataSchema},'CSV_COLUMN_UNKNOWN');
 print('csv-import OK ('+checks+' assertions)');
}finally{files.deleteDirectory(project);}
