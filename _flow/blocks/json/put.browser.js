function (input, context) {
  return context.collections.put(input.path, input.key, input.value);
}
