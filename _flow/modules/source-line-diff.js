(function () {
  // Number of added + removed physical lines (a replacement counts both), without unchanged lines between hunks.
  function changedLines(before, after) {
    if (before === after) return 0;
    var a = String(before).split('\n'), b = String(after).split('\n');
    var start = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) start++;
    var ae = a.length, be = b.length;
    while (ae > start && be > start && a[ae-1] === b[be-1]) { ae--; be--; }
    var n = ae-start, m = be-start, v = {1:0};
    for (var d = 0; d <= n+m; d++) {
      for (var k = -d; k <= d; k += 2) {
        var x = k === -d || k !== d && v[k-1] < v[k+1] ? v[k+1] : v[k-1]+1;
        var y = x-k;
        while (x < n && y < m && a[start+x] === b[start+y]) { x++; y++; }
        v[k] = x;
        if (x >= n && y >= m) return d;
      }
    }
    return n+m;
  }
  return {changedLines:changedLines};
}())
