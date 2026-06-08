function sample_json_object_output({ input, config, result }) {
  var news = {"title":"Flow samples are executable","count":3}
  json.object({ id: "response", out: "result.payload" }) {
    json.field({ id: "title", key: "title", value: news.title })
    json.field({ id: "count", key: "count", value: news.count })
    json.field({ id: "status", key: "status", value: "ok" })
  }
  return result
}
