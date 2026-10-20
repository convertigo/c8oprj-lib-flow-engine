const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "description": "Download UTF-8 text content or a fetched HTTP(S) URL. Uses a Blob, bounds bytes, sanitizes the filename, and revokes its object URL.",
  "icon": "mdi:download",
  "private": false,
  "properties": {
    "content": {
      "kind": "value",
      "type": "string",
      "label": "Text content",
      "default": null,
      "description": "Text content. Supply content or url, never both.",
      "nullable": true,
    },
    "url": {
      "kind": "value",
      "type": "string",
      "label": "HTTP(S) URL, absolute or relative to the page",
      "default": "",
      "description": "HTTP(S) URL, absolute or relative to the page. Fetched with same-origin credentials.",
    },
    "filename": {
      "kind": "value",
      "type": "string",
      "label": "Suggested filename",
      "default": "download.txt",
      "description": "Suggested filename. Path separators and control characters are replaced.",
    },
    "mimeType": {
      "kind": "value",
      "type": "string",
      "label": "MIME type of the downloaded content",
      "default": "text/plain;charset=utf-8",
      "description": "MIME type of the downloaded content.",
    },
    "maxBytes": {
      "kind": "value",
      "type": "integer",
      "label": "Maximum downloaded bytes, 1 to 104857600",
      "default": 10485760,
      "description": "Maximum downloaded bytes, 1 to 104857600. Exceeding it cancels the fetch.",
    },
  },
  "outputs": {
    "out": {
      "type": "object",
      "properties": {
        "filename": {
          "type": "string",
        },
        "mimeType": {
          "type": "string",
        },
        "size": {
          "type": "integer",
        },
      },
    },
  },
  "tags": [
    "file",
    "download",
  ],
  "effects": [
    "unspecified",
  ],
  "summary": "download {{filename}}",
  "targets": [
    "frontend",
  ],
  "implementations": {
    "frontend": {
      "runtime": "browser",
      "file": "download.browser.js",
    },
  },
}

function download({input}) { return {} }
