function (input) {
  input=input||{};

  function pad(v,n){var s=String(v);while(s.length<n)s="0"+s;return s;}
  function make(y,m,d,h,mi,s,ms){var x=new Date(0);x.setUTCFullYear(y,m-1,d);x.setUTCHours(h||0,mi||0,s||0,ms||0);return x;}
  function parse(v){
    if(typeof v!=="string")return null;
    var m=/^([0-9]{4})-([0-9]{2})-([0-9]{2})(?:T([0-9]{2}):([0-9]{2})(?::([0-9]{2})(\.[0-9]{1,3})?)?(Z|[+-][0-9]{2}:[0-9]{2})?)?$/.exec(v);
    if(!m||+m[1]<1||+m[2]<1||+m[2]>12||+m[3]<1||+(m[4]||0)>23||+(m[5]||0)>59||+(m[6]||0)>59)return null;
    var ms=m[7]?Math.round(Number("0"+m[7])*1000):0,x=make(+m[1],+m[2],+m[3],+(m[4]||0),+(m[5]||0),+(m[6]||0),ms);
    if(x.getUTCFullYear()!==+m[1]||x.getUTCMonth()!==+m[2]-1||x.getUTCDate()!==+m[3])return null;
    var off=null,z=m[8]||"";
    if(z){off=0;if(z!=="Z"){var h=+z.substring(1,3),mi=+z.substring(4,6);if(h>18||mi>59||(h===18&&mi!==0))return null;off=(h*60+mi)*(z[0]==="-"?-1:1);if(off===0)z="Z";}}
    var iso=localText(x,m[4]!==undefined);if(z)iso+=z;
    return {wall:x,offset:off,epoch:x.getTime()-(off||0)*60000,hasTime:m[4]!==undefined,iso:iso};
  }
  function localText(x,withTime){
    var y=x.getUTCFullYear();if(!isFinite(x.getTime())||y<1||y>9999)return null;
    var s=pad(y,4)+"-"+pad(x.getUTCMonth()+1,2)+"-"+pad(x.getUTCDate(),2);
    if(withTime){s+="T"+pad(x.getUTCHours(),2)+":"+pad(x.getUTCMinutes(),2)+":"+pad(x.getUTCSeconds(),2);if(x.getUTCMilliseconds())s+="."+pad(x.getUTCMilliseconds(),3);}
    return s;
  }
  function zone(input){
    var z=input.timeZone||"UTC";
    try{new Intl.DateTimeFormat("en-US",{timeZone:z}).format(0);return z;}
    catch(e){throw {code:"DATE_TIME_ZONE_INVALID",message:"Use a valid IANA timeZone such as Europe/Paris or UTC."};}
  }
  function inZone(epoch,z){
    var parts=new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn",{timeZone:z,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(new Date(epoch)),o={};
    parts.forEach(function(p){if(p.type!=="literal")o[p.type]=p.value;});
    var ms=((epoch%1000)+1000)%1000;
    return make(+o.year,+o.month,+o.day,+o.hour,+o.minute,+o.second,ms);
  }
  function local(p,input){return p.offset!==null?inZone(p.epoch,zone(input)):p.wall;}
  function current(input){
    var z=zone(input),epoch;
    if(input.at===undefined||input.at===null||input.at==="")epoch=Date.now();
    else{var p=parse(input.at);if(!p||!p.hasTime||p.offset===null)throw {code:"DATE_VALUE_INVALID",message:"at must be an ISO timestamp with Z or an explicit offset."};epoch=p.epoch;}
    return {epoch:epoch,wall:inZone(epoch,z)};
  }
  function amount(input,k){var n=input[k]===undefined?0:input[k];return typeof n==="number"&&Number.isSafeInteger(n)&&Math.abs(n)<=1000000?n:null;}
  function shiftMonth(x,n){
    var y=x.getUTCFullYear(),m=x.getUTCMonth()+n,day=x.getUTCDate(),first=make(y,m+1,1);
    var last=make(first.getUTCFullYear(),first.getUTCMonth()+2,0).getUTCDate();
    x.setUTCDate(1);x.setUTCFullYear(first.getUTCFullYear(),first.getUTCMonth(),Math.min(day,last));return x;
  }
  function patternFormat(x,p,locale){
    if(p==="long")p="EEEE d MMMM yyyy";if(p.length>256)return null;
    var n={yyyy:pad(x.getUTCFullYear(),4),MM:pad(x.getUTCMonth()+1,2),M:String(x.getUTCMonth()+1),dd:pad(x.getUTCDate(),2),d:String(x.getUTCDate()),HH:pad(x.getUTCHours(),2),H:String(x.getUTCHours()),mm:pad(x.getUTCMinutes(),2),m:String(x.getUTCMinutes()),ss:pad(x.getUTCSeconds(),2),s:String(x.getUTCSeconds())};
    ["MMMM","MMM","EEEE","EEE"].forEach(function(t){var o={timeZone:"UTC"};o[t[0]==="M"?"month":"weekday"]=t.length>3?"long":"short";n[t]=new Intl.DateTimeFormat(locale||"fr-FR",o).format(x);});
    var out="",i=0;
    while(i<p.length){
      if(p[i]==="'"){if(p[i+1]==="'"){out+="'";i+=2;continue;}i++;var closed=false;while(i<p.length){if(p[i]==="'"){if(p[i+1]==="'"){out+="'";i+=2;}else{i++;closed=true;break;}}else out+=p[i++];}if(!closed)return null;}
      else {var m=p.substring(i).match(/^(yyyy|MMMM|MMM|MM|M|dd|d|EEEE|EEE|HH|H|mm|m|ss|s)/);if(m){out+=n[m[1]];i+=m[1].length;}else{var c=p[i++];if(/[A-Za-z]/.test(c))return null;out+=c;}}
    }
    return out;
  }

  return localText(current(input).wall,false);
}
