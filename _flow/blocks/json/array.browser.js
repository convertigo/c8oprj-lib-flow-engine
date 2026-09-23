function (input, context) {
  return context.collections.declare(input.path, {type: "array", items: input.itemType}, []);
}
