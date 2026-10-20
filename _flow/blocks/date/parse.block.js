const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "longDescription": "date.parse({value:'2024-02-29'}) -> '2024-02-29'; invalid input -> null. Strict ISO date, or date-time with HH:mm, optional seconds and up to three fractional digits, and optional Z or +/-HH:mm. No whitespace, rollover, locale date syntax or epoch guessing. Canonical output includes seconds for a date-time.",
  "description": "Parse a strict Gregorian ISO date/date-time to canonical ISO text, or null. Rejects 2026-02-30, whitespace and non-ISO text.",
  "icon": "mdi:calendar-clock-outline",
  "private": false,
  "properties": {
    "value": {
      "kind": "value",
      "type": "string",
      "label": "ISO value",
      "description": "Strict ISO date or date-time; invalid calendar values are refused, never normalized.",
      "default": "",
    },
  },
  "outputs": {
    "out": {
      "type": "string",
      "nullable": true,
    },
  },
  "runtime": "rhino",
  "targets": [
    "backend",
    "frontend",
  ],
  "effects": [],
  "summary": "parse date",
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
      "file": "parse.browser.js",
    },
  },
}

(function () { return { run: function(ctx,node) {
 var p=ctx.props(node),input={};
 Object.keys(p).forEach(function(k){ input[k]=ctx.template(p[k]); });
 return ctx.callBlock('date.calendar',{operation:"parse",input:input,defaults:{timeZone:ctx.read('config.date.timeZone'),locale:ctx.read('config.date.locale')}},{trace:false});
} }; })()
