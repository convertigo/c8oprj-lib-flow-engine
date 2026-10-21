function (input, control) {
  // Generated from _flow/lib/rows.js; run node tools/build-rows-browser.cjs.
  var rows = /* Whole-array primitives. No request data, compiled paths or results are cached across calls.
 * Browser implementations are generated from this kernel by tools/build-rows-browser.cjs.
 */
(function () {
  var own = Object.prototype.hasOwnProperty;
  function has(o, k) { return o !== null && typeof o === 'object' && own.call(o, k); }
  function put(o, k, v) { Object.defineProperty(o, k, {value:v, enumerable:true, writable:true, configurable:true}); }
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
  function read(input, control) {
    var compiled = path(input.path), rows = check(input,1,control), out = [], skip = bool(input.skipMissing,false,'skipMissing');
    var fallback = input.defaultValue === undefined ? null : input.defaultValue;
    var budget = {remaining:integer(input.maxCells,1000000,10000000,'maxCells')};
    for (var i=0;i<rows.length;i++) {
      tick(i,control); var source = rows[i];
      if (typeof source === 'string') { try { source = JSON.parse(source); } catch(e) { error('ROWS_JSON_INVALID','Row ' + i + ' is not valid JSON.'); } }
      var value = select(source,compiled,budget);
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
      else { row(spec); name=text(spec.key,undefined,'columns[].key'); if(name===undefined) invalid('A projected path needs a key.'); var p=path(spec.path); read=function(o){return select(o,p,budget);}; identity=String(spec.path); }
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
  function formatCells(input, control) {
    var columns=options(input.columns,'columns'), keep=options(input.keepColumns,'keepColumns'), seen=Object.create(null);
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
  return {read:read,select:selectColumns,distinct:distinct,group:group,formatCells:formatCells};
}());
  return rows.group(input || {}, control);
}
