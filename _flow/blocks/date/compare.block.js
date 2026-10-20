const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "description": "Compare strict ISO values: -1 when left precedes right, 0 when equal, 1 when later; null for invalid values. Offset values are viewed in timeZone.",
  "icon": "mdi:calendar-clock-outline",
  "private": false,
  "properties": {
    "left": {
      "kind": "value",
      "type": "string",
      "label": "Left",
      "description": "Strict ISO date or date-time; invalid calendar values are refused, never normalized.",
      "default": "",
    },
    "right": {
      "kind": "value",
      "type": "string",
      "label": "Right",
      "description": "Strict ISO date or date-time; invalid calendar values are refused, never normalized.",
      "default": "",
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
  "summary": "compare date",
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
      "file": "compare.browser.js",
    },
  },
}

(function () { return { run: function(ctx,node) {
 var p=ctx.props(node),input={};
 Object.keys(p).forEach(function(k){ input[k]=ctx.template(p[k]); });
 return ctx.callBlock('date.calendar',{operation:"compare",input:input,defaults:{timeZone:ctx.read('config.date.timeZone'),locale:ctx.read('config.date.locale')}},{trace:false});
} }; })()
