const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "runtime": "rhino",
  "targets": [
    "backend",
    "frontend"
  ],
  "effects": [],
  "icon": "mdi:clock-outline",
  "description": "Current Unix milliseconds by default, preserving clocks. format=iso returns yyyy-MM-ddTHH:mm:ss in timeZone; at optionally freezes the instant.",
  "summary": "now",
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
      "file": "now.browser.js"
    }
  },
  "properties": {
    "format": {
      "kind": "value",
      "type": "string",
      "label": "Result format",
      "description": "timestamp preserves existing clocks; iso returns local ISO text without an offset.",
      "default": "timestamp",
      "enum": [
        "timestamp",
        "iso"
      ]
    },
    "timeZone": {
      "kind": "value",
      "type": "string",
      "label": "Time zone",
      "description": "IANA zone. Empty reads config.date.timeZone on the server, otherwise UTC; pass the same setting to a page.",
      "default": ""
    },
    "at": {
      "kind": "value",
      "type": "string",
      "label": "Reference instant",
      "description": "Optional strict ISO timestamp with Z or an offset for reproducible runs; empty reads the clock.",
      "default": ""
    }
  },
  "outputs": {
    "out": {
      "type": "unknown",
      "oneOf": [
        {
          "type": "number"
        },
        {
          "type": "string"
        }
      ]
    }
  },
  "hooks": {
    "file": "now.hooks.js"
  }
};

(function () { return { run: function(ctx,node) {
 var p=ctx.props(node),input={};
 Object.keys(p).forEach(function(k){ input[k]=ctx.template(p[k]); });
 if((input.format===undefined||input.format==='timestamp')&&!input.at)return Date.now();
 return ctx.callBlock('date.calendar',{operation:"now",input:input,defaults:{timeZone:ctx.read('config.date.timeZone'),locale:ctx.read('config.date.locale')}},{trace:false});
} }; })()
