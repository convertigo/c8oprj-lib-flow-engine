function (input) { return Array.isArray(input.items) && input.items.length ? input.items[input.items.length - 1] : input.fallback }
