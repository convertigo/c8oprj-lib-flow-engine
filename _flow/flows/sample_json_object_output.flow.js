// c8o: FlowScript spike. Function calls are Flow blocks; named arguments are block properties.
// c8o: Patch with the returned revision. The engine validates and compiles this code back to Flow YAML.

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
