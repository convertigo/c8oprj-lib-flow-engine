const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:calendar-clock-outline",
  "description": "Formats a date or timestamp with the browser locale.",
  "summary": "format {{value}}",
  "targets": [
    "frontend",
  ],
  "effects": [],
  "implementations": {
    "frontend": {
      "runtime": "browser",
      "file": "format.browser.js",
    },
  },
  "properties": {
    "value": {
      "label": "Value",
      "kind": "value",
      "type": "unknown",
      "description": "Date, ISO text or Unix timestamp to format.",
    },
    "locale": {
      "label": "Locale",
      "kind": "value",
      "type": "string",
      "default": "",
      "description": "Optional locale such as fr-FR. Empty uses the browser locale.",
    },
    "options": {
      "label": "Options",
      "kind": "value",
      "type": "object",
      "default": {},
      "description": "Intl.DateTimeFormat options such as hour, minute and second.",
    },
    "fallback": {
      "label": "Fallback",
      "kind": "value",
      "type": "string",
      "default": "",
      "description": "Text returned when the value is not a valid date.",
    },
  },
  "outputs": {
    "out": {
      "type": "string",
    },
  },
  "tags": [
    "date",
    "time",
    "format",
    "locale",
    "frontend",
    "axiom",
  ],
}

function format({ value, locale, options, fallback }) {
  return fallback || ""
}
