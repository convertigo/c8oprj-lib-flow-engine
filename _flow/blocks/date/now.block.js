const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:clock-outline",
  "description": "Returns the current Unix time in milliseconds.",
  "summary": "now",
  "targets": [
    "backend",
    "frontend",
  ],
  "effects": [],
  "implementations": {
    "backend": {
      "runtime": "rhino",
    },
    "frontend": {
      "runtime": "browser",
      "file": "now.browser.js",
    },
  },
  "properties": {
    "out": {
      "label": "Output",
      "kind": "path",
      "mode": "write",
      "default": "local.now",
      "description": "Path receiving the current Unix time in milliseconds.",
    },
  },
  "outputs": {
    "out": {
      "type": "number",
    },
  },
  "runtime": "rhino",
  "tags": [
    "date",
    "time",
    "now",
    "timestamp",
    "portable",
    "axiom",
  ],
}

(function () {
  return {
    run: function () {
      return Date.now()
    }
  }
}())
