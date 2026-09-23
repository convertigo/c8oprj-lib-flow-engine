function (input, context) {
  return context.collections.declare(input.path, {type: "object", additionalProperties: input.valueType}, {});
}
