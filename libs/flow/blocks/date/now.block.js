const _meta = {
  "version": 1,
  "icon": "mdi:clock-outline",
  "description": "Returns the current Unix time in milliseconds.",
  "targets": ["frontend"],
  "effects": [],
  "implementations": {
    "frontend": { "runtime": "browser", "file": "now.browser.js" }
  },
  "properties": {
    "out": {
      "label": "Output",
      "kind": "path",
      "mode": "write",
      "default": "local.now",
      "description": "Path receiving the current Unix time in milliseconds."
    }
  },
  "outputs": {
    "out": { "type": "number" }
  },
  "tags": ["date", "time", "now", "timestamp", "frontend", "axiom"]
}

function now() {
  return 0
}
