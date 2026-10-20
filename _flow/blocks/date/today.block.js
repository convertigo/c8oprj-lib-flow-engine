const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "longDescription": "date.today({timeZone:'Europe/Paris'}) -> yyyy-MM-dd. Empty timeZone reads config.date.timeZone on the server (UTC fallback). A page passes the same public setting explicitly. at optionally freezes an ISO instant with Z/offset for tests. See sample_DatePca and test_DateCalendar.",
  "description": "Today's ISO yyyy-MM-dd in an explicit timeZone or config.date.timeZone (UTC fallback). Optional at freezes the reference instant.",
  "icon": "mdi:calendar-clock-outline",
  "private": false,
  "properties": {
    "timeZone": {
      "kind": "value",
      "type": "string",
      "label": "Time zone",
      "description": "IANA zone. Empty reads config.date.timeZone on the server, otherwise UTC; pass the same setting to a page.",
      "default": "",
    },
    "at": {
      "kind": "value",
      "type": "string",
      "label": "Reference instant",
      "description": "Optional strict ISO timestamp with Z or an offset for reproducible runs; empty reads the clock.",
      "default": "",
    },
  },
  "outputs": {
    "out": {
      "type": "string",
    },
  },
  "runtime": "rhino",
  "targets": [
    "backend",
    "frontend",
  ],
  "effects": [],
  "summary": "today date",
  "tags": [
    "date",
    "time",
    "calendar",
    "portable",
  ],
  "implementations": {
    "backend": {
      "runtime": "rhino",
    },
    "frontend": {
      "runtime": "browser",
      "file": "today.browser.js",
    },
  },
}

(function () { return { run: function(ctx,node) {
 var p=ctx.props(node),input={};
 Object.keys(p).forEach(function(k){ input[k]=ctx.template(p[k]); });
 return ctx.callBlock('date.calendar',{operation:"today",input:input,defaults:{timeZone:ctx.read('config.date.timeZone'),locale:ctx.read('config.date.locale')}},{trace:false});
} }; })()
