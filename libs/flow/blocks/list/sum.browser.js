function (input) {
  return (Array.isArray(input.items) ? input.items : []).reduce(function (total, item) {
    var value = Number(item);
    return Number.isNaN(value) ? total : total + value;
  }, 0);
}
