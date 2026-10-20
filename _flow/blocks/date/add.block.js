const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "longDescription": "date.add({value:'2025-12-31',months:2,days:15}) -> '2026-03-15'. Apply years, then months, days, hours and minutes; each amount is an integer, omitted means zero. Civil arithmetic clamps each year/month step. A date stays a date unless hours/minutes are added; a date-time returns local ISO text. Invalid values or year overflow outside 0001..9999 return null.",
  "description": "Calendar arithmetic: years, months, days, hours, then minutes. Short months clamp like LocalDate.plusMonths. Invalid input/overflow returns null.",
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
    "timeZone": {
      "kind": "value",
      "type": "string",
      "label": "Time zone",
      "description": "IANA zone. Empty reads config.date.timeZone on the server, otherwise UTC; pass the same setting to a page.",
      "default": "",
    },
    "years": {
      "kind": "value",
      "type": "integer",
      "label": "Years",
      "description": "Signed calendar years to add; integer from -1000000 to 1000000.",
      "default": 0,
    },
    "months": {
      "kind": "value",
      "type": "integer",
      "label": "Months",
      "description": "Signed calendar months to add; integer from -1000000 to 1000000.",
      "default": 0,
    },
    "days": {
      "kind": "value",
      "type": "integer",
      "label": "Days",
      "description": "Signed calendar days to add; integer from -1000000 to 1000000.",
      "default": 0,
    },
    "hours": {
      "kind": "value",
      "type": "integer",
      "label": "Hours",
      "description": "Signed calendar hours to add; integer from -1000000 to 1000000.",
      "default": 0,
    },
    "minutes": {
      "kind": "value",
      "type": "integer",
      "label": "Minutes",
      "description": "Signed calendar minutes to add; integer from -1000000 to 1000000.",
      "default": 0,
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
  "summary": "add date",
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
      "file": "add.browser.js",
    },
  },
}

(function () { return { run: function(ctx,node) {
 var p=ctx.props(node),input={};
 Object.keys(p).forEach(function(k){ input[k]=ctx.template(p[k]); });
 return ctx.callBlock('date.calendar',{operation:"add",input:input,defaults:{timeZone:ctx.read('config.date.timeZone'),locale:ctx.read('config.date.locale')}},{trace:false});
} }; })()
