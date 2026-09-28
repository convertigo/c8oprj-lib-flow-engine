// c8o: Flow source (FlowScript, sourceVersion 2). Calls are Flow blocks; plain keys are business properties, $$ keys are engine attributes and slots.
// c8o: Edit in the Studio or with the Flow MCP code tools; patch with the returned revision.

const _flow = {
  "sourceVersion": 2,
}

function sample_json_object_output({ input, config, result }) {
  set({
    $$id: "news",
    path: "local.news",
    value: {
      title: "Flow samples are executable",
      count: 3,
    },
  })
  result.payload = json.object({
    $$id: "response",
    $$fields: function () {
      json.field({
        $$id: "title",
        key: "title",
        value: local.news.title,
      })
      json.field({
        $$id: "count",
        key: "count",
        value: local.news.count,
      })
      json.field({
        $$id: "status",
        key: "status",
        value: "ok",
      })
    },
  })
}
