const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "longDescription": "date.isValid({value:'2026-02-30'}) -> false. Uses exactly the strict date.parse grammar/calendar. Use this before comparisons or persistence. See test_DateCalendar.",
  "description": "True for a strict Gregorian ISO date/date-time; false for missing text or invalid calendar dates such as 2026-02-30.",
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
      "type": "boolean",
    },
  },
  "runtime": "rhino",
  "targets": [
    "backend",
    "frontend",
  ],
  "effects": [],
  "summary": "isValid date",
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
      "file": "isValid.browser.js",
    },
  },
}

(function () { return { run: function(ctx,node) {
 var p=ctx.props(node),input={};
 Object.keys(p).forEach(function(k){ input[k]=ctx.template(p[k]); });
 return ctx.callBlock('date.calendar',{operation:"isValid",input:input,defaults:{timeZone:ctx.read('config.date.timeZone'),locale:ctx.read('config.date.locale')}},{trace:false});
} }; })()
