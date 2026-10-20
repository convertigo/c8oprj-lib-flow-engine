const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "longDescription": "date.diff({from:'2026-03-14',to:'2026-03-15',unit:'days'}) -> 1. days compares civil dates in timeZone, independent of 23/25-hour DST days. Other units truncate elapsed milliseconds toward zero; offset timestamps retain their instant, unzoned date-times use a floating UTC clock. Invalid values -> null.",
  "description": "Signed difference from -> to. days counts civil calendar dates (DST safe); hours/minutes/seconds/milliseconds count whole elapsed units for offset timestamps. Invalid input gives null.",
  "icon": "mdi:calendar-clock-outline",
  "private": false,
  "properties": {
    "from": {
      "kind": "value",
      "type": "string",
      "label": "From",
      "description": "Strict ISO date or date-time; invalid calendar values are refused, never normalized.",
      "default": "",
    },
    "to": {
      "kind": "value",
      "type": "string",
      "label": "To",
      "description": "Strict ISO date or date-time; invalid calendar values are refused, never normalized.",
      "default": "",
    },
    "unit": {
      "kind": "value",
      "type": "string",
      "label": "Unit",
      "description": "days counts calendar dates; other units truncate toward zero.",
      "default": "days",
      "enum": [
        "days",
        "hours",
        "minutes",
        "seconds",
        "milliseconds",
      ],
    },
    "timeZone": {
      "kind": "value",
      "type": "string",
      "label": "Time zone",
      "description": "IANA zone. Empty reads config.date.timeZone on the server, otherwise UTC; pass the same setting to a page.",
      "default": "",
    },
  },
  "outputs": {
    "out": {
      "type": "number",
      "nullable": true,
    },
  },
  "runtime": "rhino",
  "targets": [
    "backend",
    "frontend",
  ],
  "effects": [],
  "summary": "diff date",
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
      "file": "diff.browser.js",
    },
  },
}

(function () { return { run: function(ctx,node) {
 var p=ctx.props(node),input={};
 Object.keys(p).forEach(function(k){ input[k]=ctx.template(p[k]); });
 return ctx.callBlock('date.calendar',{operation:"diff",input:input,defaults:{timeZone:ctx.read('config.date.timeZone'),locale:ctx.read('config.date.locale')}},{trace:false});
} }; })()
