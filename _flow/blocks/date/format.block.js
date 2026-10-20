const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "runtime": "rhino",
  "targets": [
    "backend",
    "frontend"
  ],
  "effects": [],
  "icon": "mdi:calendar-clock-outline",
  "description": "Formats ISO dates/date-times on both runtimes. pattern=dd/MM/yyyy or long gives deterministic text; the existing browser locale/options mode is unchanged.",
  "summary": "format {{value}}",
  "tags": [
    "date",
    "time",
    "calendar",
    "portable"
  ],
  "implementations": {
    "backend": {
      "runtime": "rhino"
    },
    "frontend": {
      "runtime": "browser",
      "file": "format.browser.js"
    }
  },
  "properties": {
    "value": {
      "label": "Value",
      "kind": "value",
      "type": "unknown",
      "description": "Date, ISO text or Unix timestamp to format."
    },
    "locale": {
      "label": "Locale",
      "category": "Expert",
      "kind": "value",
      "type": "string",
      "default": "",
      "description": "Optional locale such as fr-FR. Empty uses the browser locale."
    },
    "options": {
      "label": "Options",
      "category": "Expert",
      "kind": "value",
      "type": "object",
      "default": {},
      "description": "Intl.DateTimeFormat options such as hour, minute and second."
    },
    "fallback": {
      "label": "Fallback",
      "category": "Expert",
      "kind": "value",
      "type": "string",
      "default": "",
      "description": "Text returned when the value is not a valid date."
    },
    "pattern": {
      "kind": "value",
      "type": "string",
      "label": "Pattern",
      "default": "",
      "description": "Portable pattern: yyyy MM dd HH mm ss, MMM/MMMM, EEE/EEEE and single-letter forms; quoted literals; long = EEEE d MMMM yyyy. Empty preserves browser Intl options."
    },
    "timeZone": {
      "kind": "value",
      "type": "string",
      "label": "Time zone",
      "description": "IANA zone. Empty reads config.date.timeZone on the server, otherwise UTC; pass the same setting to a page.",
      "default": ""
    }
  },
  "outputs": {
    "out": {
      "type": "string"
    }
  }
};

(function () { return { run: function(ctx,node) {
 var p=ctx.props(node),input={};
 Object.keys(p).forEach(function(k){ input[k]=ctx.template(p[k]); });
 return ctx.callBlock('date.calendar',{operation:"format",input:input,defaults:{timeZone:ctx.read('config.date.timeZone'),locale:ctx.read('config.date.locale')}},{trace:false});
} }; })()
