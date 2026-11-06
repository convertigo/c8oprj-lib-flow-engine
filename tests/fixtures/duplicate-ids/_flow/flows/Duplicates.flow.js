// c8o: FlowScript written before 0.2.20, when repeated $$id values were accepted.
const _flow = {
  "inputs": {
    "ok": {
      "type": "boolean",
      "default": true,
    },
  },
  "sourceVersion": 2,
}

function Duplicates({ input, config, result }) {
  set({
    $$id: "names",
    $$comment: "set({ $$id: \"names\" }) inside a string stays as it is",
    path: "local.names",
    value: ["a", "b"],
  })
  // set({ $$id: "names" }) inside a comment stays as it is
  if({
    $$id: "if11",
    condition: input.ok,
    $$then: function () {
      set({
        $$id: "names",
        path: "result.names",
        value: local.names,
      })
      set({
        $$id: "count",
        path: "result.count",
        value: local.names.length / 1,
      })
    },
    $$else: function () {
      set({
        $$id: "names",
        path: "result.names",
        value: [],
      })
      set({
        $$id: "count",
        path: "result.count",
        value: 0,
      })
      set({
        $$id: "names2",
        path: "result.empty",
        value: true,
      })
    },
  })
  if({
    $$id: "if11",
    condition: result.count > 1,
    $$then: function () {
      set({
        $$id: "many",
        path: "result.many",
        value: true,
      })
    },
  })
}
