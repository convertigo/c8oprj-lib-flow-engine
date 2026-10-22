function (input, control) {
  // Generated from _flow/lib/rows.js; run node tools/build-rows-browser.cjs.
  var rows = /* Whole-array primitives. No request data, compiled paths or results are cached across calls.
 * Browser implementations are generated from this kernel by tools/build-rows-browser.cjs.
 */
(function () {
  var own = Object.prototype.hasOwnProperty;
  function has(o, k) { return o !== null && typeof o === 'object' && own.call(o, k); }
  function put(o, k, v) {
    // Every destination here is a fresh own-data container. Ordinary keys can
    // use assignment; inherited properties (especially __proto__ and setters)
    // still require definition as an own writable data property.
    if (k in Object.prototype) Object.defineProperty(o, k, {value:v, enumerable:true, writable:true, configurable:true});
    else o[k] = v;
  }
  function error(code, message) { throw {code:code, message:message, status:400}; }
  function invalid(message) { error('ROWS_OPTIONS_INVALID', message); }
  function integer(v, fallback, max, name) {
    if (v === undefined) return fallback;
    if (typeof v !== 'number' || !isFinite(v) || Math.floor(v) !== v || v < 1 || v > max) invalid(name + ' takes an integer from 1 to ' + max + '.');
    return v;
  }
  function array(v, name, fallback) {
    if (v === undefined && fallback) return [];
    if (!Array.isArray(v)) invalid(name + ' takes an array.');
    return v;
  }
  function options(v, name) { var a=array(v,name,true);if(a.length>4096)invalid(name+' has at most 4096 entries.');return a; }
  function bool(v, fallback, name) { if (v === undefined) return fallback; if (typeof v !== 'boolean') invalid(name + ' takes true or false.'); return v; }
  function text(v, fallback, name) { if (v === undefined) return fallback; if (typeof v !== 'string') invalid(name + ' takes text.'); return v; }
  function check(input, width, control) {
    var rows = array(input.rows, 'rows'), max = integer(input.maxRows, 100000, 1000000, 'maxRows');
    var work = integer(input.maxCells, 1000000, 10000000, 'maxCells');
    if (rows.length > max || rows.length * Math.max(width, 1) > work) error('ROWS_LIMIT_EXCEEDED', 'Row/cell budget exceeded; filter, project or page the source first.');
    if (control && control.canContinue && !control.canContinue()) error('FLOW_EXECUTION_CANCELLED', 'Row processing was cancelled.');
    return rows;
  }
  function tick(i, control) { if ((i & 63) === 0 && control && control.canContinue && !control.canContinue()) error('FLOW_EXECUTION_CANCELLED', 'Row processing was cancelled.'); }
  function row(o) { if (o === null || typeof o !== 'object' || Array.isArray(o)) error('ROWS_ROW_INVALID', 'Each row must be an object.'); return o; }
  function copy(o) { var r = {}; Object.keys(o).forEach(function(k) { put(r,k,o[k]); }); return r; }

  // Bounded JSON paths, never JavaScript: $, .key, [index], ["quoted.key"], [*].
  // Relative a.b is accepted; a column name is always literal unless it starts with $.
  function path(value) {
    var s = text(value, '$', 'path'), parts = [], i = 0, wildcard = false;
    if (s.length > 2048) invalid('path is limited to 2048 characters.');
    if (s.charAt(0) === '$') i++;
    else if (s.charAt(0) !== '[' && s !== '') s = '.' + s;
    while (i < s.length) {
      var c = s.charAt(i), m;
      if (c === '.') {
        i++; m = /^[^.[\]\s]+/.exec(s.substring(i));
        if (!m) error('ROWS_PATH_INVALID', 'Expected a key in JSON path ' + s + '.');
        parts.push(m[0] === '*' ? null : m[0]); i += m[0].length;
      } else if (c === '[') {
        i++; while (/\s/.test(s.charAt(i)) && i < s.length) i++;
        var q = s.charAt(i), key = '';
        if (q === '"' || q === "'") {
          i++; var closed = false;
          while (i < s.length) {
            c = s.charAt(i++);
            if (c === q) { closed = true; break; }
            if (c === '\\') {
              if (i >= s.length) break;
              c = s.charAt(i++);
              if (c === 'u') { var hex = s.substring(i,i+4); if (!/^[0-9a-fA-F]{4}$/.test(hex)) error('ROWS_PATH_INVALID','Invalid Unicode escape in path.'); key += String.fromCharCode(parseInt(hex,16)); i += 4; continue; }
              var escapes = {'n':'\n','r':'\r','t':'\t','b':'\b','f':'\f'};
              key += has(escapes,c) ? escapes[c] : c;
            } else key += c;
          }
          if (!closed) error('ROWS_PATH_INVALID','Unclosed quoted key in path.');
          parts.push(key);
        } else {
          m = /^(\*|0|[1-9][0-9]*)/.exec(s.substring(i));
          if (!m) error('ROWS_PATH_INVALID','Use a quoted key, nonnegative index or * in a JSON path.');
          parts.push(m[0] === '*' ? null : Number(m[0])); i += m[0].length;
        }
        while (/\s/.test(s.charAt(i)) && i < s.length) i++;
        if (s.charAt(i++) !== ']') error('ROWS_PATH_INVALID','Expected ] in JSON path.');
      } else error('ROWS_PATH_INVALID','Unexpected character in JSON path ' + s + '.');
      if (parts.length > 64) error('ROWS_PATH_INVALID','A JSON path has at most 64 segments.');
      if (parts[parts.length-1] === null) wildcard = true;
    }
    return {parts:parts, wildcard:wildcard};
  }
  function select(value, compiled, budget) {
    var parts = compiled.parts;
    if (!compiled.wildcard) {
      for (var p = 0; p < parts.length; p++) { if (!has(value,parts[p])) return undefined; value = value[parts[p]]; }
      return value;
    }
    var current = [value];
    for (var i = 0; i < parts.length; i++) {
      var next = [], part = parts[i];
      for (var j = 0; j < current.length; j++) {
        var item = current[j];
        if (part === null) {
          if (item !== null && typeof item === 'object') Object.keys(item).forEach(function(k) { next.push(item[k]); if (--budget.remaining < 0) error('ROWS_LIMIT_EXCEEDED','JSON path expansion exceeds maxCells.'); });
        } else if (has(item,part)) next.push(item[part]);
      }
      current = next;
    }
    return current;
  }
  function reader(column) {
    if (typeof column !== 'string') invalid('Column names must be text.');
    if (column.charAt(0) === '$') {
      var p = path(column); if (p.wildcard) invalid('Column paths for distinct/group cannot contain wildcards.');
      return function(o) { return select(o,p); };
    }
    return function(o) { return has(o,column) ? o[column] : undefined; };
  }
  function readers(columns, valueKey) {
    return columns.map(function(c) { var read = reader(c); return function(o) { var v = read(o); return valueKey === '' ? v : (has(v,valueKey) ? v[valueKey] : undefined); }; });
  }
  function canonical(v, depth) {
    if (depth > 64) error('ROWS_VALUE_INVALID','Grouping values have at most 64 levels.');
    if (v === undefined || v === null) return null;
    if (Array.isArray(v)) return v.map(function(x) { return canonical(x,depth+1); });
    if (typeof v === 'object') { var out = {}; Object.keys(v).sort().forEach(function(k) { put(out,k,canonical(v[k],depth+1)); }); return out; }
    return v;
  }
  function signature(o, read) { return JSON.stringify(read.map(function(f) { return canonical(f(o),0); })); }

  function distinct(input, control) {
    var columns = options(input.columns,'columns'), read = readers(columns,text(input.valueKey,'','valueKey'));
    var rows = check(input,columns.length,control), seen = Object.create(null), out = [];
    if (!columns.length) return rows.slice();
    for (var i=0;i<rows.length;i++) { tick(i,control); var r=row(rows[i]), key=signature(r,read); if (!has(seen,key)) { put(seen,key,true); out.push(r); } }
    return out;
  }
  function sanitizer(raw) {
    if(raw===undefined)return function(v){return v;};row(raw);
    var redactions=options(raw.redactions,'sanitize.redactions'),drop=options(raw.dropKeys,'sanitize.dropKeys'),mask=options(raw.maskKeys,'sanitize.maskKeys');
    [redactions,drop,mask].forEach(function(a){a.forEach(function(v){text(v,undefined,'sanitize entries');});});
    var maxNodes=integer(raw.maxNodes,100000,10000000,'sanitize.maxNodes'),maxDepth=integer(raw.maxDepth,50,128,'sanitize.maxDepth');
    return function(root){var visits=0;
      function copy(v,depth){
        if(++visits>maxNodes||depth>maxDepth)error('ROWS_READ_BOUNDS','JSON response exceeds the structural safety limit.');
        if(typeof v==='string'){redactions.forEach(function(secret){if(secret.length&&v.indexOf(secret)!==-1)v=v.split(secret).join('[redacted]');});return v;}
        if(v===null||typeof v!=='object')return v;
        if(Array.isArray(v))return v.map(function(x){return copy(x,depth+1);});
        var out={};Object.keys(v).forEach(function(k){if(mask.indexOf(k.toLowerCase())!==-1)put(out,k,'[redacted]');else if(drop.indexOf(k)===-1)put(out,k,copy(v[k],depth+1));});return out;
      }return copy(root,0);
    };
  }
  function read(input, control) {
    var compiled = path(input.path), rows = check(input,1,control), out = [], skip = bool(input.skipMissing,false,'skipMissing'), clean=sanitizer(input.sanitize);
    var fallback = input.defaultValue === undefined ? null : input.defaultValue;
    var budget = {remaining:integer(input.maxCells,1000000,10000000,'maxCells')};
    for (var i=0;i<rows.length;i++) {
      tick(i,control); var source = rows[i];
      if (typeof source === 'string') { try { source = JSON.parse(source); } catch(e) { error('ROWS_JSON_INVALID','Row ' + i + ' is not valid JSON.'); } }
      var value = select(clean(source),compiled,budget);
      if (value !== undefined) out.push(value); else if (!skip) out.push(fallback);
    }
    return out;
  }
  function selectColumns(input, control) {
    var first=options(input.firstColumns,'firstColumns'), order=options(input.columnsOrder,'columnsOrder');
    var columns=input.columns === undefined ? null : options(input.columns,'columns');
    var budget={remaining:integer(input.maxCells,1000000,10000000,'maxCells')};
    var rename=input.rename === undefined ? {} : row(input.rename), plans=[], outputs=Object.create(null);
    Object.keys(rename).forEach(function(k) { text(rename[k],undefined,'rename.'+k); });
    function add(spec) {
      var name, read, identity;
      if (typeof spec === 'string') { name=has(rename,spec)?rename[spec]:spec; read=reader(spec); identity=spec; }
      else { row(spec); name=text(spec.key,undefined,'columns[].key'); if(name===undefined) invalid('A projected path needs a key.'); var p=path(spec.path); var fallback=spec.defaultValue, nullAsMissing=bool(spec.nullAsMissing,false,'columns[].nullAsMissing'); read=function(o){var v=select(o,p,budget);return v===undefined||(nullAsMissing&&v===null)?fallback:v;}; identity=String(spec.path); }
      if (has(outputs,name)) { if(outputs[name] !== identity) invalid('Two columns write the same output key: '+name); return; }
      put(outputs,name,identity); plans.push({key:name,read:read});
    }
    first.forEach(add); (columns === null ? order : columns).forEach(add);
    var rows=check(input,Math.max(plans.length,1),control), out=[];
    for(var i=0;i<rows.length;i++) {
      tick(i,control); var source=row(rows[i]), target={};
      for(var c=0;c<plans.length;c++) { var v=plans[c].read(source); if(v!==undefined) put(target,plans[c].key,v); }
      if(columns===null) Object.keys(source).forEach(function(k) { if(--budget.remaining<0)error('ROWS_LIMIT_EXCEEDED','Column projection exceeds maxCells.');var key=has(rename,k)?rename[k]:k; if(!has(target,key)) put(target,key,source[k]); else if(!has(outputs,key)||outputs[key]!==k) invalid('Two columns write the same output key: '+key); });
      out.push(target);
    }
    return out;
  }
  function group(input, control) {
    var columns=options(input.groupColumns,'groupColumns'), specs=options(input.aggregations,'aggregations'), valueKey=text(input.valueKey,'','valueKey');
    var read=readers(columns,valueKey), rows=check(input,Math.max(columns.length+specs.length,1),control), map=Object.create(null), groups=[];
    var skip=bool(input.skipInvalid,false,'skipInvalid'), keys=Object.create(null);
    var plans=specs.map(function(s) {
      row(s); var type=text(s.type,undefined,'aggregations[].type'), key=text(s.key,undefined,'aggregations[].key');
      if(['count','sum','avg','min','max'].indexOf(type)<0) invalid('Aggregation type takes count, sum, avg, min or max.');
      if(key===undefined||has(keys,key)) invalid('Each aggregation needs a unique key.'); put(keys,key,true);
      var r=type==='count'?null:reader(text(s.column,undefined,'aggregations[].column'));
      return {type:type,key:key,read:r};
    });
    for(var i=0;i<rows.length;i++) {
      tick(i,control); var r=row(rows[i]), key=signature(r,read), g=map[key];
      if(!has(map,key)) { g={row:copy(r),state:plans.map(function(){return {count:0,sum:0,value:null};})}; put(map,key,g); groups.push(g); }
      for(var a=0;a<plans.length;a++) {
        var p=plans[a], state=g.state[a];
        if(p.type==='count') { state.count++; continue; }
        var v=p.read(r); if(valueKey!=='') v=has(v,valueKey)?v[valueKey]:undefined;
        if(v===undefined||v===null||v==='') continue;
        if(p.type==='sum'||p.type==='avg') {
          var n=typeof v==='number'?v:typeof v==='string'&&v.trim()!==''?Number(v):NaN;
          if(!isFinite(n)) { if(skip)continue; error('ROWS_AGGREGATE_VALUE_INVALID','Column for '+p.key+' needs a finite number at row '+i+'.'); }
          state.sum+=n; if(!isFinite(state.sum)) error('ROWS_AGGREGATE_VALUE_INVALID','Aggregate '+p.key+' exceeds the finite number range.'); state.count++;
        } else {
          if((typeof v!=='string'&&typeof v!=='number')||(typeof v==='number'&&!isFinite(v))||(state.value!==null&&typeof state.value!==typeof v)) { if(skip)continue; error('ROWS_AGGREGATE_VALUE_INVALID','min/max need consistently typed numbers or text for '+p.key+'.'); }
          if(state.value===null||(p.type==='min'?v<state.value:v>state.value)) state.value=v;
        }
      }
    }
    return groups.map(function(g) { plans.forEach(function(p,a) {var s=g.state[a],v=p.type==='count'?s.count:p.type==='sum'?s.sum:p.type==='avg'?(s.count?s.sum/s.count:null):s.value;put(g.row,p.key,v);}); return g.row; });
  }

  var ISO=/^([0-9]{4})-([0-9]{2})-([0-9]{2})(?:T([0-9]{2}):([0-9]{2})(?::([0-9]{2})(\.[0-9]{1,3})?)?(Z|[+-][0-9]{2}:[0-9]{2})?)?$/;
  function pad(v,n) { var s=String(v);while(s.length<n)s='0'+s;return s; }
  function dateFormatter(column) {
    var pattern=text(column.pattern,'dd/MM/yyyy','columns[].pattern'), zone=text(column.timeZone,'UTC','columns[].timeZone'), locale=text(column.locale,'fr-FR','columns[].locale');
    if(pattern==='long')pattern='EEEE d MMMM yyyy';
    var tokens=[], remaining=pattern;
    while(remaining.length) { var t=/^(yyyy|MMMM|MMM|MM|M|dd|d|EEEE|EEE|HH|H|mm|m|ss|s|[^A-Za-z])/.exec(remaining); if(!t)invalid('Unsupported date pattern; use yyyy, MM, dd, HH, mm, ss, MMM/MMMM, EEE/EEEE or punctuation.'); tokens.push(t[0]);remaining=remaining.substring(t[0].length); if(tokens.length>256)invalid('Date pattern is limited to 256 characters.'); }
    var javaTime=typeof Packages!=='undefined', zoner, names=Object.create(null), T;
    try {
      if(javaTime) {T=Packages.java.time;zoner=T.ZoneId.of(zone);}
      else zoner=new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
      tokens.forEach(function(t) { if(['MMMM','MMM','EEEE','EEE'].indexOf(t)<0||has(names,t))return; if(javaTime)names[t]=T.format.DateTimeFormatter.ofPattern(t,Packages.java.util.Locale.forLanguageTag(locale));else{var opt={timeZone:'UTC'};opt[t.charAt(0)==='M'?'month':'weekday']=t.length===4?'long':'short';names[t]=new Intl.DateTimeFormat(locale,opt);} });
    } catch(e) { invalid('Date columns need a valid IANA timeZone and BCP47 locale.'); }
    return function(value) {
      var m=typeof value==='string'?ISO.exec(value):null; if(!m||+m[1]<1)return null;
      var y=+m[1],mo=+m[2],d=+m[3],h=+(m[4]||0),mi=+(m[5]||0),s=+(m[6]||0),x=new Date(0);x.setUTCFullYear(y,mo-1,d);x.setUTCHours(h,mi,s,0);
      if(x.getUTCFullYear()!==y||x.getUTCMonth()!==mo-1||x.getUTCDate()!==d||h>23||mi>59||s>59)return null;
      if(m[8]) { var off=0;if(m[8]!=='Z'){var oh=+m[8].substring(1,3),om=+m[8].substring(4,6);if(oh>18||om>59||(oh===18&&om))return null;off=(oh*60+om)*(m[8].charAt(0)==='-'?-1:1);}var epoch=x.getTime()-off*60000;
        if(javaTime){var z=T.Instant.ofEpochMilli(epoch).atZone(zoner);y=Number(z.getYear());mo=Number(z.getMonthValue());d=Number(z.getDayOfMonth());h=Number(z.getHour());mi=Number(z.getMinute());s=Number(z.getSecond());}
        else {var fields={};zoner.formatToParts(new Date(epoch)).forEach(function(p){if(p.type!=='literal')fields[p.type]=p.value;});y=+fields.year;mo=+fields.month;d=+fields.day;h=+fields.hour;mi=+fields.minute;s=+fields.second;}
        x.setUTCFullYear(y,mo-1,d);x.setUTCHours(h,mi,s,0);
      }
      var v={yyyy:pad(y,4),MM:pad(mo,2),M:String(mo),dd:pad(d,2),d:String(d),HH:pad(h,2),H:String(h),mm:pad(mi,2),m:String(mi),ss:pad(s,2),s:String(s)};
      return tokens.map(function(t) { if(has(v,t))return v[t];if(has(names,t))return javaTime?String(names[t].format(T.LocalDate.of(y,mo,d))):names[t].format(x);return t; }).join('');
    };
  }
  function formatTextCells(input, control) {
    var columns=options(array(input.columns,'columns'),'columns'), keep=options(input.keepColumns,'keepColumns'), seen=Object.create(null);
    var budget={remaining:integer(input.maxCells,1000000,10000000,'maxCells')};
    keep.forEach(function(k){text(k,undefined,'keepColumns[]');});
    var numeric=bool(input.includeNumeric,false,'includeNumeric'), escape=bool(input.escapeHtml,false,'escapeHtml'), valuesOnly=bool(input.valuesOnly,false,'valuesOnly');
    var plans=columns.map(function(c) {
      if(typeof c==='string')c={name:c}; row(c);
      var name=text(c.name,undefined,'columns[].name'); if(name===undefined)invalid('Each column needs a name.');
      var key=text(c.key,name,'columns[].key'); if(has(seen,key)||keep.indexOf(key)>=0)invalid('Duplicate output column '+key+'.');put(seen,key,true);
      var type=text(c.type,c.kind===undefined?'text':c.kind,'columns[].type');
      if(['text','string','number','integer','boolean','date','datetime','json'].indexOf(type)<0)invalid('Column type takes text, string, number, integer, boolean, date, datetime or json.');
      var p=c.path===undefined?null:path(c.path), digits=c.decimals===undefined?2:c.decimals;
      if(typeof digits!=='number'||Math.floor(digits)!==digits||digits<0||digits>20)invalid('decimals takes an integer from 0 to 20.');
      return {key:key,read:p?function(o){return select(o,p,budget);}:reader(name),type:type,digits:digits,nullText:text(c.nullText,'','columns[].nullText'),trueText:text(c.trueText,'Oui','columns[].trueText'),falseText:text(c.falseText,'Non','columns[].falseText'),date:type==='date'||type==='datetime'?dateFormatter(c):null};
    });
    var rows=check(input,plans.length+keep.length,control), out=[];
    for(var i=0;i<rows.length;i++) {
      tick(i,control); var source=row(rows[i]), target={};
      keep.forEach(function(k){if(has(source,k))put(target,k,source[k]);});
      for(var j=0;j<plans.length;j++) {
        tick(j,control);
        var p=plans[j], value=p.read(source), raw=value===undefined?null:value, rendered;
        if(valuesOnly){put(target,p.key,raw);continue;}
        if(raw===null)rendered=p.nullText;
        else if(p.date) {rendered=p.date(raw);if(rendered===null)error('ROWS_DATE_INVALID','Invalid ISO date in column '+p.key+' at row '+i+'.');}
        else if(p.type==='boolean'){if(typeof raw!=='boolean')error('ROWS_VALUE_INVALID','Boolean column '+p.key+' needs true or false at row '+i+'.');rendered=raw?p.trueText:p.falseText;}
        else if(p.type==='number'||p.type==='integer'){var n=typeof raw==='number'?raw:typeof raw==='string'&&raw.trim()!==''?Number(raw):NaN;if(!isFinite(n))error('ROWS_VALUE_INVALID','Numeric column '+p.key+' needs a finite number at row '+i+'.');rendered=n.toFixed(p.type==='integer'?0:p.digits);}
        else rendered=p.type==='json'||typeof raw==='object'?JSON.stringify(raw):String(raw);
        if(escape)rendered=rendered.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
        var cell={value:raw,text:rendered};if(numeric)cell.numeric=/^-?[0-9]+([.][0-9]+)?$/.test(raw===null?'':String(raw));put(target,p.key,cell);
      }
      out.push(target);
    }
    return out;
  }
  // Table-cell compatibility profile. The existing text-cell contract is the default.
  var tableFormatter = (function(){
var colors = {
    "light-blue": "#f0f4fc",
    "light-green": "#ecfcf1",
    "light-cyan": "#cff5fa",
    "light-orange": "#fffbf0",
    "light-yellow": "#fffbf0",
    "light-red": "#fff2f0",
    "light-brown": "#f5e6dc",
    "light-purple": "#f9f1fd",
    "light-pink": "#f7e1f2",
    "light-gray": "#f5f5f5",
    "blue": "#dae4fd",
    "green": "#d0f6dc",
    "cyan": "#a0ebf5",
    "orange": "#fff4da",
    "yellow": "#ffe9b4",
    "red": "#ffdeda",
    "brown": "#f5ceb0",
    "purple": "#dfb9f7",
    "pink": "#f7b2e7",
    "gray": "#d7d8d9",
    "dark-blue": "#acc8f8",
    "dark-green": "#a0eeba",
    "dark-cyan": "#70e0ef",
    "dark-orange": "#ffe9b4",
    "dark-yellow": "#ffdd8f",
    "dark-red": "#ffbdb4",
    "dark-brown": "#f5c098",
    "dark-purple": "#cf96f2",
    "dark-pink": "#f285d9",
    "dark-gray": "#cdcecd",
    "darker-blue": "#689ef1",
    "darker-green": "#41dd75",
    "darker-cyan": "#41d6ea",
    "darker-orange": "#ffd269",
    "darker-yellow": "#ffd269",
    "darker-red": "#ff7b69",
    "darker-brown": "#f5a96e",
    "darker-purple": "#bf73ee",
    "darker-pink": "#ff6dde",
    "darker-gray": "#b5b5b7",
    "deep-dark-green": "#10bf4a",
    "deep-dark-orange": "#ffc744",
    "white": "#fff"
  }
var base_html = "<div style='display:flex; white-space: normal; align-items:center; flex-wrap: wrap'>";
var close_html = '</div>';
var get_base_array_html = (value, color)=>{
	return "<div style=\"background-color: " + (color && colors[color] ? colors[color] : 'lightgrey') + ";border-radius: 10px; padding-left: 10px; padding-top: 4px; padding-bottom: 4px; width: fit-content; padding-right: 10px; margin-top: 3px;\">" +
		value +
	"</div>";
}
var get_base_btn_html = (url, label, color)=>{
	return "<div style=\"background-color: " + (color && colors[color] ? colors[color] : 'lightgrey') + ";border-radius: 10px; padding-left: 10px; padding-top: 4px; padding-bottom: 4px; width: fit-content; padding-right: 10px; margin-top: 3px; cursor:pointer\">" +
		"<a  href=\"" + url + "\" target=\"_blank\">" + label + "</a>"+
	"</div>";
}
var get_base_array_image_html = (url)=>{
	return "<img style='width: 100%; margin-top: 5px; margin-bottom: 5px; border-radius: 3px; box-shadow: 0px 8px 9px -4px rgba(0,0,0,0.73);' src=\"" + url + "\" ></img>";
}
var get_base_array_link_html = (url, visibleName)=>{
	return "<p style='background-color : lightgray;' ><a  href=\"" + url + "\" target=\"_blank\" download=\""+visibleName+"\">" + visibleName + "</a></p>"
}
var escape_base_html = (value)=>{
	return String(value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
var normalize_base_url = (url)=>{
	if (/^(https?:\/\/|mailto:|tel:)/i.test(url)) {
		return url;
	}
	return "https://" + url;
}
var get_base_url_html = (url)=>{
	url = String(url == undefined || url == null ? "" : url).trim();
	if (url.length == 0) {
		return "";
	}
	return "<a href=\"" + escape_base_html(normalize_base_url(url)) + "\" target=\"_blank\" rel=\"noopener noreferrer\">" + escape_base_html(url) + "</a>";
}
var computeAnyType = (element, nested, type)=>{
	var value;
	var innerHtml = "";
	if(Array.isArray(element)){
		value = [];
		element.forEach((arrayItem)=>{
			var result = computeAnyType(arrayItem, true, type);
			value.push(result.value);
			innerHtml += result.innerHtml;
		});
		//innerHtml += close_html;
	}
	else if(typeof element == "object"){
		if(element.value != undefined && typeof element.value == "object"){
			var result = computeAnyType(element.value, true, type);
			innerHtml = result.innerHtml;
			value = result.value;
		}
		else if(element.value != undefined){
			innerHtml = type == "url" ? get_base_url_html(element.value) : get_base_array_html(element.value, element.color); // + close_html;
			value = element;
		}
		else if(element.name != undefined && element.is_image == undefined && element.url == undefined) {
			innerHtml = get_base_array_html(element.name, element.color); // + close_html;
			value = element;
		}
		else if(element.url != undefined && element.label != undefined && element.is_image == undefined){
			innerHtml = get_base_btn_html(element.url, element.label, "light-blue"); // + close_html;
			value = element;
		}
		else if(element.is_image != undefined){
			if(element.is_image == true){
				innerHtml = get_base_array_image_html(element.url); // + close_html;
			}
			else{
				innerHtml = get_base_array_link_html(element.url, element.visible_name); // + close_html;
			}
			value = element;
		}
		else{
			log.warn("type not handled");
		}
	}
	else{
		innerHtml = type == "url" ? get_base_url_html(element) : element; // + close_html;
		value = element;
	}
	return {innerHtml: innerHtml + (nested ? "" : close_html), value: value};
}

return {run:function(ctx,node){
var p=ctx.props(node),rows=ctx.template(p.rows),schema=ctx.template(p.schema),columns=ctx.template(p.columns),hidden=ctx.template(p.hiddenColumns),lean_cells=!!ctx.template(p.valuesOnly),isModelMode=false,defaultTimezone=String(ctx.template(p.defaultTimezone)||"UTC");
if(ctx.rowState && ctx.rowState.formatCells)return ctx.rowState.formatCells(rows,ctx.rowState.pageStart);
var log={warn:function(){}};
var FORMULA_FIELD_TYPES=["formula","count","rollup","lookup"];
var getBrFilterType=function(field){return {type:FORMULA_FIELD_TYPES.indexOf(field.type)!==-1?(field.formula_type==="array"?field.array_formula_type:field.formula_type):field.type};};
var escapeDisplayHtml = function(value) {
	return String(value == undefined || value == null ? "" : value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
};
var isTrueValue = function(value) {
	return value === true || value === 1 || value == "1" || ("" + value).toLowerCase() == "true";
};
var padNumber = function(value, size) {
	var text = "" + value;
	while (text.length < size) {
		text = "0" + text;
	}
	return text;
};
var getFieldOption = function(field, name) {
	return field != null && field[name] != undefined ? "" + field[name] : "";
};
var getResolvedFieldType = function(field) {
	if (field == null) {
		return null;
	}
	try {
		return getBrFilterType(field).type;
	}
	catch (e) {
		return field.type;
	}
};
var getPrimitiveCellValue = function(element) {
	if (element != null && typeof element == "object" && !Array.isArray(element)) {
		if (element.value != undefined && (element.value == null || typeof element.value != "object")) {
			return element.value;
		}
		if (element.name != undefined && element.is_image == undefined && element.url == undefined) {
			return element.name;
		}
	}
	return element;
};
var getDateDisplayTimezone = function(field) {
	var timezone = getFieldOption(field, "date_force_timezone");
	if (timezone == "") {
		timezone = getFieldOption(field, "date_timezone");
	}
	if (timezone == "") {
		timezone = getFieldOption(field, "timezone");
	}
	if (timezone == "") {
		timezone = getFieldOption(field, "date_time_zone");
	}
	if (timezone == "") {
		timezone = defaultTimezone;
	}
	timezone = ("" + timezone).replace(/^\s+|\s+$/g, "");
	if (timezone == "" || timezone.toLowerCase() == "null") {
		timezone = "UTC";
	}
	return timezone;
};
var getDateTimeParts = function(rawDate, field) {
	try {
		var normalizedDate = ("" + rawDate).replace(" ", "T");
		if(typeof java==='undefined') {
			var zone=getDateDisplayTimezone(field), match;
			if(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(normalizedDate)) {
				var instant=new Date(normalizedDate.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
				if(isNaN(instant.getTime()))return null;
				var parts={};new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(instant).forEach(function(p){if(p.type!=='literal')parts[p.type]=p.value;});
				return {year:parts.year,month:parts.month,day:parts.day,hours:Number(parts.hour),minutes:Number(parts.minute)};
			}
			match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(normalizedDate);
			if(!match)return null;
			return {year:match[1],month:match[2],day:match[3],hours:Number(match[4]),minutes:Number(match[5])};
		}
		var zoneId = java.time.ZoneId.of(getDateDisplayTimezone(field));
		if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(normalizedDate)) {
			normalizedDate = normalizedDate.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
			var zonedDate = java.time.OffsetDateTime.parse(normalizedDate).toInstant().atZone(zoneId);
			return {
				year: "" + zonedDate.getYear(),
				month: padNumber(zonedDate.getMonthValue(), 2),
				day: padNumber(zonedDate.getDayOfMonth(), 2),
				hours: zonedDate.getHour(),
				minutes: zonedDate.getMinute()
			};
		}
		var localDate = java.time.LocalDateTime.parse(normalizedDate);
		return {
			year: "" + localDate.getYear(),
			month: padNumber(localDate.getMonthValue(), 2),
			day: padNumber(localDate.getDayOfMonth(), 2),
			hours: localDate.getHour(),
			minutes: localDate.getMinute()
		};
	}
	catch (e) {
		return null;
	}
};
var formatDateValue = function(value, field) {
	if (value == null || value == "") {
		return "";
	}
	var rawDate = "" + value;
	var dateParts = null;
	var dateOnlyMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (dateOnlyMatch != null) {
		dateParts = {
			year: dateOnlyMatch[1],
			month: dateOnlyMatch[2],
			day: dateOnlyMatch[3],
			hours: 0,
			minutes: 0
		};
	}
	else {
		dateParts = getDateTimeParts(rawDate, field);
	}
	if (dateParts == null) {
		var parsedDate = new Date(rawDate);
		if (isNaN(parsedDate.getTime())) {
			return rawDate;
		}
		dateParts = {
			year: "" + parsedDate.getFullYear(),
			month: padNumber(parsedDate.getMonth() + 1, 2),
			day: padNumber(parsedDate.getDate(), 2),
			hours: parsedDate.getHours(),
			minutes: parsedDate.getMinutes()
		};
	}
	var dateFormat = getFieldOption(field, "date_format").toUpperCase();
	var dateText;
	if (dateFormat == "EU" || dateFormat == "EUROPEAN") {
		dateText = dateParts.day + "/" + dateParts.month + "/" + dateParts.year;
	}
	else if (dateFormat == "US") {
		dateText = dateParts.month + "/" + dateParts.day + "/" + dateParts.year;
	}
	else {
		dateText = dateParts.year + "-" + dateParts.month + "-" + dateParts.day;
	}
	var includeTimeOption = field != null ? field.date_include_time : null;
	var includeTime = isTrueValue(includeTimeOption) || (includeTimeOption == null && /[T\s]\d{2}:\d{2}/.test(rawDate));
	if (includeTime) {
		var timeFormat = getFieldOption(field, "date_time_format").toLowerCase();
		if (timeFormat == "12" || timeFormat.indexOf("12") != -1) {
			var suffix = dateParts.hours >= 12 ? "PM" : "AM";
			var hour12 = dateParts.hours % 12;
			if (hour12 == 0) {
				hour12 = 12;
			}
			dateText += " " + hour12 + ":" + padNumber(dateParts.minutes, 2) + " " + suffix;
		}
		else {
			dateText += " " + padNumber(dateParts.hours, 2) + ":" + padNumber(dateParts.minutes, 2);
		}
	}
	return dateText;
};
var formatDurationValue = function(value, field) {
	if (value == null || value == "") {
		return "";
	}
	var durationSource = typeof value == "number" ? "" + value : ("" + value).replace(",", ".");
	if (!/^-?\d+(\.\d+)?$/.test(durationSource)) {
		return "" + value;
	}
	var secondsValue = parseFloat(durationSource);
	if (isNaN(secondsValue)) {
		return "" + value;
	}
	var sign = secondsValue < 0 ? "-" : "";
	var totalMilliseconds = Math.round(Math.abs(secondsValue) * 1000);
	var totalSeconds = Math.floor(totalMilliseconds / 1000);
	var milliseconds = totalMilliseconds % 1000;
	var days = Math.floor(totalSeconds / 86400);
	var hoursTotal = Math.floor(totalSeconds / 3600);
	var hours = Math.floor((totalSeconds % 86400) / 3600);
	var minutes = Math.floor((totalSeconds % 3600) / 60);
	var seconds = totalSeconds % 60;
	var durationFormat = getFieldOption(field, "duration_format");
	if (durationFormat == "") {
		durationFormat = "h:mm:ss";
	}
	if (durationFormat == "d h") {
		return sign + days + "d " + hours + "h";
	}
	if (durationFormat == "d h m") {
		return sign + days + "d " + hours + "h " + minutes + "m";
	}
	if (durationFormat == "d h m s") {
		return sign + days + "d " + hours + "h " + minutes + "m " + seconds + "s";
	}
	var decimals = durationFormat.indexOf(".sss") != -1 ? 3 : (durationFormat.indexOf(".ss") != -1 ? 2 : (durationFormat.indexOf(".s") != -1 ? 1 : 0));
	var secondsText = padNumber(seconds, 2);
	if (decimals > 0) {
		secondsText += "." + padNumber(milliseconds, 3).substring(0, decimals);
	}
	if (durationFormat.indexOf("d h:mm") == 0) {
		var dayClock = days + "d " + hours + ":" + padNumber(minutes, 2);
		if (durationFormat.indexOf(":ss") != -1) {
			dayClock += ":" + secondsText;
		}
		return sign + dayClock;
	}
	var clock = hoursTotal + ":" + padNumber(minutes, 2);
	if (durationFormat.indexOf(":ss") != -1) {
		clock += ":" + secondsText;
	}
	return sign + clock;
};
var formatNumberValue = function(value, field) {
	if (value == null || value == "") {
		return "";
	}
	var numberSource = typeof value == "number" ? "" + value : ("" + value).replace(",", ".");
	if (!/^-?\d+(\.\d+)?$/.test(numberSource)) {
		return "" + value;
	}
	var numberValue = parseFloat(numberSource);
	if (isNaN(numberValue)) {
		return "" + value;
	}
	var decimalPlaces = parseInt(getFieldOption(field, "number_decimal_places"), 10);
	if (isNaN(decimalPlaces)) {
		if (field != null && (field.type == "autonumber" || field.type == "count")) {
			decimalPlaces = 0;
		}
		else {
			return "" + value;
		}
	}
	if (decimalPlaces < 0) {
		decimalPlaces = 0;
	}
	if (decimalPlaces > 20) {
		decimalPlaces = 20;
	}
	return numberValue.toFixed(decimalPlaces);
};
var formatEmailHtml = function(value) {
	var email = String(value == undefined || value == null ? "" : value).replace(/^\s+|\s+$/g, "");
	if (email == "") {
		return "";
	}
	return "<a href=\"mailto:" + escapeDisplayHtml(email) + "\">" + escapeDisplayHtml(email) + "</a>";
};
var formatPhoneHtml = function(value) {
	var phone = String(value == undefined || value == null ? "" : value).replace(/^\s+|\s+$/g, "");
	if (phone == "") {
		return "";
	}
	var phoneHref = phone.replace(/[^\d+]/g, "");
	if (phoneHref == "") {
		return escapeDisplayHtml(phone);
	}
	return "<a href=\"tel:" + escapeDisplayHtml(phoneHref) + "\">" + escapeDisplayHtml(phone) + "</a>";
};
var formatRatingHtml = function(value) {
	var ratingValue = parseInt(value, 10);
	if (isNaN(ratingValue) || ratingValue <= 0) {
		return "";
	}
	var stars = "";
	for (var iRating = 0; iRating < ratingValue; iRating++) {
		stars += "&#9733;";
	}
	return "<span style=\"color:#f59e0b;letter-spacing:1px\">" + stars + "</span>";
};
var formatBooleanHtml = function(value) {
	if (isTrueValue(value)) {
		return "<span style=\"display:inline-flex;width:16px;height:16px;border:1px solid #22c55e;background:#22c55e;border-radius:3px;color:#fff;align-items:center;justify-content:center;font-size:12px;line-height:16px\">&#10003;</span>";
	}
	return "<span style=\"display:inline-flex;width:16px;height:16px;border:1px solid #cbd5e1;background:#fff;border-radius:3px\"></span>";
};
var formatBaserowCell = function(element, field, nested, column) {
	if (Array.isArray(element)) {
		var arrayValue = [];
		var arrayHtml = "";
		for (var iElement = 0; iElement < element.length; iElement++) {
			var arrayResult = formatBaserowCell(element[iElement], field, true, column);
			arrayValue.push(arrayResult.value);
			arrayHtml += arrayResult.innerHtml;
		}
		return { innerHtml: arrayHtml + (nested ? "" : close_html), value: arrayValue };
	}
	var resolvedType = column.resolvedType, kind = column.kind;
	var primitiveValue = getPrimitiveCellValue(element);
	var formattedText;
	if (kind == "rating") {
		return { innerHtml: formatRatingHtml(primitiveValue) + (nested ? "" : close_html), value: primitiveValue };
	}
	if (kind == "boolean") {
		return { innerHtml: formatBooleanHtml(primitiveValue) + (nested ? "" : close_html), value: primitiveValue };
	}
	if (kind == "number") {
		formattedText = formatNumberValue(primitiveValue, field);
		return { innerHtml: (nested ? get_base_array_html(escapeDisplayHtml(formattedText), "light-gray") : escapeDisplayHtml(formattedText)) + (nested ? "" : close_html), value: primitiveValue };
	}
	if (kind == "email") {
		return { innerHtml: formatEmailHtml(primitiveValue) + (nested ? "" : close_html), value: primitiveValue };
	}
	if (kind == "phone_number") {
		return { innerHtml: formatPhoneHtml(primitiveValue) + (nested ? "" : close_html), value: primitiveValue };
	}
	if (kind == "date") {
		formattedText = formatDateValue(primitiveValue, field);
		return { innerHtml: (nested ? get_base_array_html(escapeDisplayHtml(formattedText), "light-gray") : escapeDisplayHtml(formattedText)) + (nested ? "" : close_html), value: primitiveValue };
	}
	if (kind == "duration") {
		formattedText = formatDurationValue(primitiveValue, field);
		return { innerHtml: (nested ? get_base_array_html(escapeDisplayHtml(formattedText), "light-gray") : escapeDisplayHtml(formattedText)) + (nested ? "" : close_html), value: primitiveValue };
	}
	return computeAnyType(element, nested, resolvedType);
};
// lean_cells (asked by the Forms viewer): a cell keeps its value but not its displayValue HTML, which the viewer
// builds from that value and the options of its column, sent once in fields
var leanCells = typeof lean_cells != "undefined" && ("" + lean_cells) == "true" && !isModelMode;
var leanFields = {};
var leanTypedColumns = {};
var isLeanTypedField = function(field) {
	var resolvedType = getResolvedFieldType(field);
	var fieldType = field != null ? field.type : null;
	return resolvedType == "rating" || resolvedType == "boolean" || resolvedType == "number" || resolvedType == "autonumber" ||
		resolvedType == "email" || resolvedType == "phone_number" || resolvedType == "date" || resolvedType == "duration" ||
		fieldType == "number" || fieldType == "autonumber" || fieldType == "count" || fieldType == "email" || fieldType == "phone_number" ||
		fieldType == "date" || fieldType == "created_on" || fieldType == "last_modified" || fieldType == "duration";
};
// the value computeAnyType returns, without its HTML
var leanAnyValue = function(element) {
	if (Array.isArray(element)) {
		var arrayValue = [];
		for (var iLeanAny = 0; iLeanAny < element.length; iLeanAny++) {
			arrayValue.push(leanAnyValue(element[iLeanAny]));
		}
		return arrayValue;
	}
	if (element != null && typeof element == "object") {
		if (element.value != undefined && typeof element.value == "object") {
			return leanAnyValue(element.value);
		}
		if (element.value != undefined || (element.name != undefined && element.is_image == undefined && element.url == undefined) ||
			(element.url != undefined && element.label != undefined && element.is_image == undefined) || element.is_image != undefined) {
			return element;
		}
		log.warn("type not handled");
		return undefined;
	}
	return element;
};
// the value formatBaserowCell returns, without its HTML
var leanCellValue = function(element, typed) {
	if (Array.isArray(element)) {
		var arrayValue = [];
		for (var iLeanCell = 0; iLeanCell < element.length; iLeanCell++) {
			arrayValue.push(leanCellValue(element[iLeanCell], typed));
		}
		return arrayValue;
	}
	return typed ? getPrimitiveCellValue(element) : leanAnyValue(element);
};
// the options of a column that formatBaserowCell reads, as text, with the timezone it would show a date in
var leanFieldOptions = function(field) {
	var options = { type: "" + field.type };
	var resolvedType = getResolvedFieldType(field);
	if (resolvedType != null) {
		options.resolvedType = "" + resolvedType;
	}
	var optionNames = ["date_format", "date_time_format", "duration_format", "number_decimal_places", "date_include_time"];
	for (var iOption = 0; iOption < optionNames.length; iOption++) {
		if (field[optionNames[iOption]] != undefined) {
			options[optionNames[iOption]] = "" + field[optionNames[iOption]];
		}
	}
	if (resolvedType == "date" || field.type == "date" || field.type == "created_on" || field.type == "last_modified") {
		options.timezone = getDateDisplayTimezone(field);
	}
	return options;
};

function array(v){return v==null?null:Array.isArray(v)?v:[v];}
rows=array(rows)||[];schema=array(schema);columns=array(columns);
var fieldsByName=Object.create(null),columnCache=Object.create(null),columnCount=0,out=[];
function putOwn(target,key,value){if(key in Object.prototype)Object.defineProperty(target,key,{value:value,writable:true,enumerable:true,configurable:true});else target[key]=value;}
function columnPlan(key){
 var field=schema&&(columns==null||columns.indexOf(key)!==-1)?fieldsByName[key]:null;
 var type=getResolvedFieldType(field),fieldType=field==null?null:field.type,kind=type;
 if(type!=="rating"&&type!=="boolean"){
  if(type==="number"||type==="autonumber"||fieldType==="number"||fieldType==="autonumber"||fieldType==="count")kind="number";
  else if(type==="email"||fieldType==="email")kind="email";
  else if(type==="phone_number"||fieldType==="phone_number")kind="phone_number";
  else if(type==="date"||fieldType==="date"||fieldType==="created_on"||fieldType==="last_modified")kind="date";
  else if(type==="duration"||fieldType==="duration")kind="duration";
 }
 return {field:field,resolvedType:type,kind:kind,hidden:Array.isArray(hidden)?hidden.indexOf(key)!==-1:typeof hidden==="string"&&hidden.indexOf(key)!==-1};
}
if(schema)for(var f=0;f<schema.length;f++)fieldsByName[String(schema[f].name)]=schema[f];
function formatRows(rows,reset){
if(reset){leanFields={};Object.keys(columnCache).forEach(function(k){delete columnCache[k].typed;});}
rows=array(rows)||[];var out=[];
for(var r=0;r<rows.length;r++){if(!ctx.canContinue())return {rows:[],fields:{}};
var row=rows[r],cells={},keys=Object.keys(row);
for(var k=0;k<keys.length;k++){var key=keys[k];
 var column=columnCache[key];
 if(!column){if(ctx.rowState&&++columnCount>4096)throw new Error("Row column plan limit exceeded");column=columnPlan(key);columnCache[key]=column;}
 var current=row[key],cell={displayName:key,type:"html"};
 if(current==null)cell.value=null;
 else if(lean_cells){if(column.typed===undefined){column.typed=isLeanTypedField(column.field);if(column.field!=null)putOwn(leanFields,key,leanFieldOptions(column.field));}cell.value=leanCellValue(current,column.typed);}
 else{var formatted=formatBaserowCell(current,column.field,false,column);cell.value=formatted.value;cell.displayValue=base_html+formatted.innerHtml;}
 if(column.hidden)cell.hidden=true;
 putOwn(cells,key,cell);
}
out.push(cells);}
return {rows:out,fields:leanFields};
}
if(ctx.rowState)ctx.rowState.formatCells=formatRows;
return formatRows(rows);
}};

}());
  function formatCells(input,control) {
    var profile=text(input.profile,'text','profile');
    if(profile==='text')return formatTextCells(input,control);
    if(profile!=='table')invalid('profile takes text or table.');
    var values=input.rows==null?[]:Array.isArray(input.rows)?input.rows:[input.rows];
    check({rows:values,maxRows:input.maxRows,maxCells:input.maxCells},1,control);
    var remaining=integer(input.maxCells,1000000,10000000,'maxCells');for(var i=0;i<values.length;i++){remaining-=Object.keys(values[i]).length;if(remaining<0)error('ROWS_LIMIT_EXCEEDED','Cell work exceeds maxCells.');}
    var result=tableFormatter.run({props:function(n){return n.props;},template:function(v){return v;},canContinue:function(){return !control||!control.canContinue||control.canContinue();}},
      {props:{rows:values,schema:input.schema,columns:input.columnNames,hiddenColumns:input.hiddenColumns,valuesOnly:input.valuesOnly,defaultTimezone:input.defaultTimezone}});
    return input.includeFields===true?result:result.rows;
  }
  // A producer-local pipeline fuses pure kernels while retaining no source rows.
  // The returned function belongs to that producer and must not be cached globally.
  function preparePipeline(steps) {
    steps=JSON.parse(JSON.stringify(steps));
    return function(values){var fields, result=values;
      steps.forEach(function(step){var options={};Object.keys(step.options).forEach(function(k){put(options,k,step.options[k]);});options.rows=result;
        result=step.operation==='select'?selectColumns(options):step.operation==='formatCells'?formatCells(options):read(options);
        if(!Array.isArray(result)&&result&&has(result,'rows')){fields=result.fields;result=result.rows;}
      });var out={rows:result};if(fields!==undefined)out.fields=fields;return out;
    };
  }
  return {protectedReadVersion:1,tableProfileVersion:1,pipelineVersion:1,read:read,select:selectColumns,distinct:distinct,group:group,formatCells:formatCells,preparePipeline:preparePipeline};
}());
  return rows.group(input || {}, control);
}
