const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "description": "Private java.time primitive behind the portable date blocks.",
  "icon": "mdi:calendar-clock-outline",
  "private": true,
  "properties": {
    "operation": {
      "kind": "text",
      "type": "string",
      "label": "Operation",
      "description": "Internal date operation.",
    },
    "input": {
      "kind": "literal",
      "type": "object",
      "label": "Decoded input",
      "description": "Already evaluated public values.",
    },
    "defaults": {
      "kind": "literal",
      "type": "object",
      "label": "Date settings",
      "description": "Calling project date defaults.",
    },
  },
  "outputs": {
    "out": {
      "type": "unknown",
    },
  },
  "runtime": "rhino",
  "targets": [
    "backend",
  ],
}

(function () {
 var calendar = /*
 * Calendar primitives for date.*. All JVM values stay internal; the public
 * contract contains ISO text, finite numbers, booleans and null only.
 * Civil arithmetic is java.time; browser peers use the same proleptic
 * Gregorian rules and the shared parity corpus.
 */
(function () {
  var T=Packages.java.time, F=T.format.DateTimeFormatter, Locale=Packages.java.util.Locale;
  var ISO=/^([0-9]{4})-([0-9]{2})-([0-9]{2})(?:T([0-9]{2}):([0-9]{2})(?::([0-9]{2})(\.[0-9]{1,3})?)?(Z|[+-][0-9]{2}:[0-9]{2})?)?$/;
  function text(v){return v===null||v===undefined?"":String(v);}
  function pad(v,n){var s=String(v);while(s.length<n)s="0"+s;return s;}
  function parse(value){
    if(typeof value!=="string")return null;
    var m=ISO.exec(value);if(!m||+m[1]<1)return null;
    try{
      var d=T.LocalDate.of(+m[1],+m[2],+m[3]),hasTime=m[4]!==undefined;
      if(!hasTime)return {date:d,dt:d.atStartOfDay(),offset:null,iso:String(d),hasTime:false};
      var nanos=m[7]?Math.round(Number("0"+m[7])*1000000000):0;
      var dt=T.LocalDateTime.of(+m[1],+m[2],+m[3],+m[4],+m[5],+(m[6]||0),nanos);
      var offset=m[8]?T.ZoneOffset.of(m[8]):null;
      var iso=String(d)+"T"+pad(+m[4],2)+":"+pad(+m[5],2)+":"+pad(+(m[6]||0),2);
      if(nanos)iso+="."+pad(nanos/1000000,3);
      if(offset)iso+=String(offset);
      return {date:d,dt:dt,offset:offset,iso:iso,hasTime:true};
    }catch(e){return null;}
  }
  function zone(input,defaults){
    var value=text(input.timeZone)||text(defaults&&defaults.timeZone)||"UTC";
    try{return T.ZoneId.of(value);}catch(e){throw {code:"DATE_TIME_ZONE_INVALID",message:"Use a valid IANA timeZone such as Europe/Paris or UTC."};}
  }
  function current(input,defaults){
    var z=zone(input,defaults),at=text(input.at),instant;
    if(at==="")instant=T.Instant.now();
    else {var p=parse(at);if(!p||!p.hasTime||!p.offset)throw {code:"DATE_VALUE_INVALID",message:"at must be an ISO timestamp with Z or an explicit offset."};instant=p.dt.toInstant(p.offset);}
    return {instant:instant,local:instant.atZone(z).toLocalDateTime()};
  }
  function local(p,input,defaults){return p.offset?p.dt.toInstant(p.offset).atZone(zone(input,defaults)).toLocalDateTime():p.dt;}
  function localText(dt,withTime){
    var year=Number(dt.getYear());if(year<1||year>9999)return null;
    var s=String(dt.toLocalDate());if(!withTime)return s;
    s+="T"+pad(Number(dt.getHour()),2)+":"+pad(Number(dt.getMinute()),2)+":"+pad(Number(dt.getSecond()),2);
    if(Number(dt.getNano()))s+="."+pad(Number(dt.getNano())/1000000,3);
    return s;
  }
  function amount(input,key){var n=input[key]===undefined?0:input[key];return typeof n==="number"&&Number.isSafeInteger(n)&&Math.abs(n)<=1000000?n:null;}
  function delta(a,b,input,defaults){
    var first=parse(a),second=parse(b);if(!first||!second)return null;
    return {first:first,second:second,a:local(first,input,defaults),b:local(second,input,defaults)};
  }
  function locale(input,defaults){return Locale.forLanguageTag(text(input.locale)||text(defaults&&defaults.locale)||"fr-FR");}
  var token=/^(yyyy|MMMM|MMM|MM|M|dd|d|EEEE|EEE|HH|H|mm|m|ss|s)/;
  function formatPattern(dt,pattern,lang){
    if(pattern==="long")pattern="EEEE d MMMM yyyy";
    if(pattern.length>256)return null;
    var result="",i=0;
    while(i<pattern.length){
      if(pattern.charAt(i)==="'"){
        if(pattern.charAt(i+1)==="'"){result+="'";i+=2;continue;}
        i++;var closed=false;
        while(i<pattern.length){if(pattern.charAt(i)==="'"){if(pattern.charAt(i+1)==="'"){result+="'";i+=2;}else{i++;closed=true;break;}}else result+=pattern.charAt(i++);}
        if(!closed)return null;
      }else{
        var m=pattern.substring(i).match(token);
        if(m){result+=String(dt.format(F.ofPattern(m[1],lang)));i+=m[1].length;}
        else {var c=pattern.charAt(i++);if(/[A-Za-z]/.test(c))return null;result+=c;}
      }
    }
    return result;
  }
  function legacyFormat(dt,input,defaults){
    // Existing browser callers keep Intl options. These common Gregorian
    // selectors also have a server implementation; patterns are the portable
    // spelling for exact cross-host text.
    var o=input.options||{},tag=String(locale(input,defaults).toLanguageTag()),us=/^en-US/i.test(tag),lang=locale(input,defaults);
    var dateKeys=["year","month","day","weekday"],timeKeys=["hour","minute","second"],hasDate=dateKeys.some(function(k){return o[k]!==undefined;}),hasTime=timeKeys.some(function(k){return o[k]!==undefined;});
    if(!hasDate&&!hasTime){o={year:"numeric",month:"numeric",day:"numeric",hour:"numeric",minute:"2-digit",second:"2-digit"};hasDate=hasTime=true;}
    var out="",dateParts=[],timeParts=[];
    if(hasDate){
      if(o.weekday)dateParts.push(String(dt.format(F.ofPattern(o.weekday==="short"?"EEE":"EEEE",lang))));
      if(o.month==="long"||o.month==="short"){
        var month=String(dt.format(F.ofPattern(o.month==="long"?"MMMM":"MMM",lang)));
        var day=o.day?String(Number(dt.getDayOfMonth())):"",year=o.year?String(Number(dt.getYear())):"";
        dateParts.push(us?[month,day+(day&&year?",":""),year].filter(Boolean).join(" "):[day,month,year].filter(Boolean).join(" "));
      }else{
        var y=o.year?String(dt.format(F.ofPattern(o.year==="2-digit"?"yy":"yyyy",lang))):"",m=o.month?String(dt.format(F.ofPattern(o.month==="2-digit"?"MM":"M",lang))):"",d=o.day?String(dt.format(F.ofPattern(o.day==="2-digit"?"dd":us?"d":"dd",lang))):"";
        dateParts.push((us?[m,d,y]:[d,m?(!us&&o.month==="numeric"?pad(Number(dt.getMonthValue()),2):m):"",y]).filter(Boolean).join("/"));
      }
      out=dateParts.filter(Boolean).join(", ");
    }
    if(hasTime){
      var twelve=o.hour12===true||(o.hour12===undefined&&us),hour=Number(dt.getHour());
      if(o.hour)timeParts.push(pad(twelve?(hour%12||12):hour,o.hour==="2-digit"?2:1));
      if(o.minute)timeParts.push(pad(Number(dt.getMinute()),2));
      if(o.second)timeParts.push(pad(Number(dt.getSecond()),2));
      out+=(out?(us?", ":" "):"")+timeParts.join(":")+(twelve&&o.hour?(hour<12?" AM":" PM"):"");
    }
    return out;
  }
  return {
    today:function(input,defaults){return String(current(input,defaults).local.toLocalDate());},
    now:function(input,defaults){
      var format=input.format||"timestamp",c=current(input,defaults);
      if(format==="timestamp")return Number(c.instant.toEpochMilli());
      if(format!=="iso")throw {code:"DATE_FORMAT_INVALID",message:"date.now format is timestamp or iso."};
      return localText(c.local.withNano(0),true);
    },
    parse:function(input){var p=parse(input.value);return p?p.iso:null;},
    isValid:function(input){return parse(input.value)!==null;},
    add:function(input,defaults){
      var p=parse(input.value);if(!p)return null;
      var units=["years","months","days","hours","minutes"],a={};
      for(var i=0;i<units.length;i++){a[units[i]]=amount(input,units[i]);if(a[units[i]]===null)return null;}
      try{
        var dt=local(p,input,defaults).plusYears(a.years).plusMonths(a.months).plusDays(a.days).plusHours(a.hours).plusMinutes(a.minutes);
        return localText(dt,p.hasTime||a.hours!==0||a.minutes!==0);
      }catch(e){if(e.code)throw e;return null;}
    },
    compare:function(input,defaults){
      var first=parse(input.left),second=parse(input.right);if(!first||!second)return null;
      var n=first.offset&&second.offset?Number(first.dt.toInstant(first.offset).compareTo(second.dt.toInstant(second.offset))):Number(local(first,input,defaults).compareTo(local(second,input,defaults)));
      return n<0?-1:n>0?1:0;
    },
    diff:function(input,defaults){
      var d=delta(input.from,input.to,input,defaults);if(!d)return null;
      var unit=input.unit||"days";
      if(unit==="days")return Number(T.temporal.ChronoUnit.DAYS.between(d.a.toLocalDate(),d.b.toLocalDate()));
      var scales={hours:3600000,minutes:60000,seconds:1000,milliseconds:1};
      if(!scales[unit])return null;
      var start=d.first.offset?d.first.dt.toInstant(d.first.offset):d.a.toInstant(T.ZoneOffset.UTC);
      var end=d.second.offset?d.second.dt.toInstant(d.second.offset):d.b.toInstant(T.ZoneOffset.UTC);
      var whole=Math.trunc((Number(end.toEpochMilli())-Number(start.toEpochMilli()))/scales[unit]);
      return whole===0?0:whole;
    },
    format:function(input,defaults){
      var fallback=text(input.fallback),p=parse(input.value),dt;
      if(p)dt=local(p,{timeZone:input.timeZone||(input.options||{}).timeZone},defaults);
      else if(typeof input.value==="number"&&isFinite(input.value))dt=T.Instant.ofEpochMilli(input.value).atZone(zone({timeZone:input.timeZone||(input.options||{}).timeZone},defaults)).toLocalDateTime();
      else return fallback;
      var pattern=text(input.pattern),result=pattern?formatPattern(dt,pattern,locale(input,defaults)):legacyFormat(dt,input,defaults);
      return result===null?fallback:result;
    }
  };
})();
 return {run: function(ctx,node) { var p=ctx.props(node); try { return calendar[p.operation](p.input,p.defaults); } catch(e) { if(e&&e.code)return ctx.throwFlow({code:e.code,message:e.message,status:400},node); throw e; } }};
})()
