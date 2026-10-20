const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "runtime": "rhino",
  "targets": [
    "backend"
  ],
  "description": "Reads bounded UTF-8 CSV text or a file (including an uploaded-file path) into typed rows. RFC4180 quotes/newlines, optional BOM, headers and explicit rowSchema. Parses only; never writes a data source.",
  "properties": {
    "text": {
      "type": "string",
      "kind": "value",
      "description": "CSV text; supply exactly one of text or path."
    },
    "path": {
      "type": "string",
      "kind": "value",
      "description": "CSV file path; relative paths resolve from request.projectDir. Uploaded file paths are accepted."
    },
    "separator": {
      "type": "string",
      "kind": "value",
      "description": "One delimiter character; semicolon by default.",
      "default": ";"
    },
    "header": {
      "type": "boolean",
      "kind": "value",
      "description": "First nonblank record contains column headings.",
      "default": true
    },
    "columns": {
      "type": "array",
      "kind": "value",
      "description": "Optional ordered field names or {field,header} mappings, as data.exportCsv. Required without a header."
    },
    "rowSchema": {
      "type": "object",
      "kind": "value",
      "description": "Flat row JSON schema, or the key/values envelope returned by data.rowSchema. Data contracts return rows as {key,values}; exact decimals/int64 stay text."
    },
    "maxRows": {
      "type": "integer",
      "kind": "value",
      "description": "Maximum data records, 1..100000. Overflow refuses the entire import.",
      "default": 10000
    },
    "maxBytes": {
      "type": "integer",
      "kind": "value",
      "description": "UTF-8 byte limit, 1..16777216, checked before and during file reads.",
      "default": 16777216
    },
    "resource": {
      "type": "object",
      "kind": "value",
      "description": "Optional authoritative data Resource (for example sql.table): supplies readable field labels and logical date formats for data.rowSchema."
    }
  },
  "outputs": {
    "out": {
      "type": "object",
      "properties": {
        "rows": {
          "type": "array",
          "items": {
            "type": "object"
          }
        },
        "rowCount": {
          "type": "integer"
        },
        "columns": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "rowSchema": {
          "type": "object"
        },
        "byteLength": {
          "type": "integer"
        }
      }
    }
  },
  "summary": [
    "parse CSV file {{path}}",
    "parse CSV"
  ],
  "tags": [
    "csv",
    "import",
    "parse",
    "upload",
    "data",
    "RFC4180",
    "UTF-8"
  ]
}

// Use Rhino 1.9.0 features: https://mozilla.github.io/rhino/compat/engines.html
(function(){return {run:function(ctx,node){
 var p=ctx.props(node),Files=Packages.java.nio.file.Files,StandardCharsets=Packages.java.nio.charset.StandardCharsets;
 function fail(code,message,row,column){ctx.throwFlow({code:code,message:message,status:400,details:{row:row||0,column:column||''}},node);}
 function limit(key,max){var v=Number(ctx.template(p[key]));if(!isFinite(v)||v<1||v>max||Math.floor(v)!==v)fail('CSV_LIMIT_INVALID',key+' must be an integer from 1 to '+max+'.');return v;}
 var maxRows=limit('maxRows',100000),maxBytes=limit('maxBytes',16777216),text=ctx.template(p.text),path=ctx.template(p.path);
 if((text!==null&&text!==undefined)===(path!==null&&path!==undefined&&String(path)!==''))fail('CSV_SOURCE_INVALID','Supply exactly one of text or path.');
 var bytes;
 if(path!==null&&path!==undefined&&String(path)!==''){
  var file=new java.io.File(String(path));if(!file.isAbsolute())file=new java.io.File(String(ctx.read('request.projectDir')||'.'),String(path));
  if(!file.isFile())fail('CSV_FILE_NOT_FOUND','CSV file does not exist.');
  if(file.length()>maxBytes)fail('CSV_BYTE_LIMIT_EXCEEDED','CSV file exceeds maxBytes.');
  var stream=Files.newInputStream(file.toPath()),out=new java.io.ByteArrayOutputStream(),buffer=java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE,8192),size=0;
  try{var read;while((read=stream.read(buffer,0,Math.min(8192,maxBytes-size+1)))!==-1){if(!ctx.canContinue())fail('FLOW_EXECUTION_CANCELLED','CSV import cancelled.');size+=read;if(size>maxBytes)fail('CSV_BYTE_LIMIT_EXCEEDED','CSV file exceeds maxBytes.');out.write(buffer,0,read);}bytes=out.toByteArray();}finally{stream.close();out.close();}
 }else bytes=new java.lang.String(String(text)).getBytes(StandardCharsets.UTF_8);
 if(bytes.length>maxBytes)fail('CSV_BYTE_LIMIT_EXCEEDED','CSV content exceeds maxBytes.');
 try{text=String(StandardCharsets.UTF_8.newDecoder().onMalformedInput(Packages.java.nio.charset.CodingErrorAction.REPORT).onUnmappableCharacter(Packages.java.nio.charset.CodingErrorAction.REPORT).decode(java.nio.ByteBuffer.wrap(bytes)));}catch(e){fail('CSV_ENCODING_INVALID','CSV must be valid UTF-8.');}
 if(text.charCodeAt(0)===0xfeff)text=text.substring(1);
 var headerInput=ctx.convert(ctx.template(p.header),{type:'boolean',required:true});if(!headerInput.ok)fail('CSV_OPTIONS_INVALID','header must be a boolean.');
 var separator=String(ctx.template(p.separator)),header=headerInput.value,schema=ctx.template(p.rowSchema)||{type:'object',properties:{}},props=schema.properties||{},selected=ctx.template(p.columns),columns=null,headings=null,rows=[],record=[],cell='',quoted=false,closed=false,atStart=true,recordStarted=false,recordNumber=0;
 if(!schema||typeof schema!=='object'||Array.isArray(schema)||schema.type&&schema.type!=='object')fail('CSV_SCHEMA_INVALID','rowSchema must describe a row object.');
 var dataRows=!!(props.key&&props.key.properties&&props.values&&props.values.properties&&props.revision);
 var keyProps=dataRows?props.key.properties:{},valueProps=dataRows?props.values.properties:props,resource=ctx.template(p.resource),fields=resource&&resource.fields||[],fieldMap=Object.create(null);
 if(resource&&(!Array.isArray(fields)||!Array.isArray(resource.identity)))fail('CSV_SCHEMA_INVALID','resource must be a data Resource with fields and identity.');
 fields.forEach(function(f){fieldMap[String(f.name)]=f;});
 if(dataRows)props=Object.assign({},keyProps,valueProps);
 if(separator.length!==1||/["\r\n\ufeff]/.test(separator))fail('CSV_SEPARATOR_INVALID','separator must be one character other than a quote or newline.');
 if(selected!==undefined&&selected!==null&&!Array.isArray(selected))fail('CSV_COLUMNS_INVALID','columns must be an ordered array of keys or {key,header} mappings.');
 function keyValid(key){return key&&key!=='__proto__'&&key!=='prototype'&&key!=='constructor';}
 function setup(names){
  if(names.length>1024)fail('CSV_COLUMN_LIMIT_EXCEEDED','At most 1024 columns are accepted.');
  var seen=Object.create(null);
  headings=names.map(function(name){name=String(name);if(!keyValid(name)||seen[name])fail('CSV_HEADER_INVALID','Empty, duplicate or unsafe column heading: '+name);seen[name]=true;return name;});
  if(selected&&selected.length){columns=selected.map(function(item){var key=typeof item==='string'?item:String(item&&item.field||item&&typeof item.key==='string'&&item.key||'');var label=props[key]&&props[key].title||fieldMap[key]&&fieldMap[key].label||key;var title=typeof item==='string'?label:String(item.header===undefined?label:item.header);var index=header?headings.indexOf(title):-1;if(header&&index<0)index=headings.indexOf(key);if(header&&index<0)fail('CSV_COLUMN_MISSING','Missing CSV heading: '+title,recordNumber,key);return {key:key,index:header?index:0};});if(!header)columns.forEach(function(c,i){c.index=i;});}
  else columns=headings.map(function(name,index){var matches=Object.keys(props).filter(function(k){return k===name||props[k]&&props[k].title===name||fieldMap[k]&&fieldMap[k].label===name;});if(matches.length>1)fail('CSV_HEADER_AMBIGUOUS','Heading maps to several schema fields: '+name,recordNumber,name);return {key:matches[0]||name,index:index};});
  seen=Object.create(null);columns.forEach(function(c){if(!keyValid(c.key)||seen[c.key])fail('CSV_COLUMNS_INVALID','Empty, duplicate or unsafe column key: '+c.key);seen[c.key]=true;if((dataRows||schema.additionalProperties===false)&&!props[c.key])fail('CSV_COLUMN_UNKNOWN','Column not declared in rowSchema: '+c.key,recordNumber,c.key);});
 }
 function emit(){
  var cells=record.concat([cell]);record=[];cell='';atStart=true;closed=false;
  if(!recordStarted){recordStarted=false;return;}recordStarted=false;recordNumber++;
  if(!columns){if(header){setup(cells);return;}if(!selected||!selected.length)fail('CSV_COLUMNS_REQUIRED','header:false requires columns.');setup(selected.map(function(c){return typeof c==='string'?c:c.field||c.key;}));}
  if(cells.length!==headings.length)fail('CSV_COLUMN_COUNT','Record has '+cells.length+' cells; expected '+headings.length+'.',recordNumber);
  if(rows.length>=maxRows)fail('CSV_ROW_LIMIT_EXCEEDED','CSV exceeds maxRows; no partial rows are returned.',recordNumber);
  var row={};columns.forEach(function(c){var definition=Object.assign({},props[c.key]||{type:'string'});var logical=fieldMap[c.key]&&fieldMap[c.key].type;if(logical==='date')definition.format='date';if(logical==='datetime')definition.format='date-time';if((schema.required||[]).indexOf(c.key)>=0)definition.required=true;var converted=ctx.convert(cells[c.index],definition);if(!converted.ok)fail('CSV_CELL_TYPE_INVALID',converted.message||'Cell cannot be converted.',recordNumber,c.key);var value=converted.value;
   if(value!==undefined&&value!==null&&value!==''&&(definition.format==='date'||definition.format==='date-time')){var parsed=ctx.callBlock('date.parse',{value:value},{trace:false});if(parsed===null||definition.format==='date'&&String(parsed).length!==10||definition.format==='date-time'&&String(parsed).indexOf('T')<0)fail('CSV_CELL_TYPE_INVALID','Expected a strict ISO '+definition.format+'.',recordNumber,c.key);value=parsed;}
   if(value!==undefined)row[c.key]=value;
  });
  if(!dataRows)(schema.required||[]).forEach(function(key){if(row[key]===undefined)fail('CSV_CELL_TYPE_INVALID','Required field is missing.',recordNumber,key);});
  if(dataRows){var key={},values={};Object.keys(row).forEach(function(name){if(Object.prototype.hasOwnProperty.call(keyProps,name))key[name]=row[name];else values[name]=row[name];});rows.push({key:key,values:values});}
  else rows.push(row);
 }
 for(var i=0;i<text.length;i++){
  if(i%4096===0&&!ctx.canContinue())fail('FLOW_EXECUTION_CANCELLED','CSV import cancelled.');
  var ch=text.charAt(i);if(ch==='\u0000')fail('CSV_SYNTAX_INVALID','NUL is not allowed.',recordNumber+1);
  if(quoted){if(ch==='"'){if(text.charAt(i+1)==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=ch;continue;}
  if(ch===separator){record.push(cell);if(record.length>=1024)fail('CSV_COLUMN_LIMIT_EXCEEDED','At most 1024 columns are accepted.');cell='';atStart=true;closed=false;recordStarted=true;continue;}
  if(ch==='\r'||ch==='\n'){if(ch==='\r'&&text.charAt(i+1)==='\n')i++;emit();continue;}
  if(closed)fail('CSV_SYNTAX_INVALID','Unexpected text after closing quote.',recordNumber+1);
  if(ch==='"'){if(!atStart)fail('CSV_SYNTAX_INVALID','A quote must start a cell.',recordNumber+1);quoted=true;recordStarted=true;atStart=false;continue;}
  cell+=ch;atStart=false;recordStarted=true;
 }
 if(quoted)fail('CSV_SYNTAX_INVALID','Unclosed quoted cell.',recordNumber+1);
 if(recordStarted||record.length||cell!=='')emit();
 return {rows:rows,rowCount:rows.length,columns:(columns||[]).map(function(c){return c.key;}),rowSchema:schema,byteLength:bytes.length};
}};}())
