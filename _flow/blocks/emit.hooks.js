(function () {
  return {
    displayName: function (node) {
      var props = node.props || node;
      return props.rows === undefined ? "rows" : flowSummary.text(props.rows);
    }
  };
}())
