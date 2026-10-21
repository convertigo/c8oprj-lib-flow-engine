const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "description": "Deterministic cell formatting fixture for the Flow engine benchmark.",
  "icon": "mdi:puzzle-outline",
  "private": true,
  "properties": {
    "value": {
      "type": "any",
      "kind": "value",
    },
    "kind": {
      "type": "string",
      "kind": "value",
    },
  },
  "outputs": {
    "out": {
      "type": "object",
      "properties": {
        "value": {
          "type": "any",
        },
        "text": {
          "type": "string",
        },
        "numeric": {
          "type": "boolean",
        },
      },
    },
  },
}

function formatCell({input,local,result}) {
 local.serialized = json.stringify({value:input.value})
 local.text = input.value == null ? "" : String(input.value)
 local.match = text.match({text:local.text,pattern:"^-?[0-9]+([.][0-9]+)?$"})
 if (input.kind === "number" && local.match.matched) {
  local.text = Number(input.value).toFixed(2)
 }
 if (input.kind === "boolean") {
  local.text = input.value ? "Oui" : "Non"
 }
 local.text = local.text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
 return {value:input.value,text:local.text,numeric:local.match.matched}
}
