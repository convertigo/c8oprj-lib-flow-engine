const _flow = { sourceVersion: 3, accessibility: "private" }

function sample_json_object_output({ input, config, result }) {
  local.news = { title: "Flow samples are executable", count: 3 }
  response: json.object({
    $$out: "result.payload",
    $$fields: function () {
      title: json.field({ key: "title", value: local.news.title })
      count: json.field({ key: "count", value: local.news.count })
      status: json.field({ key: "status", value: "ok" })
    },
  })
}
