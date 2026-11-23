/* Vitame admin portal: data, helpers and hand-made SVG charts (no libraries, so it always matches the site's look). */
(function () {
  'use strict';
  var D = document, W = window;
  function $(s, r) { return (r || D).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || D).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var FL = [
    { id: 'orange', name: 'Orange Riot', c: '#ff8a2a' },
    { id: 'beet', name: 'Beet & Berry', c: '#e03442' },
    { id: 'green', name: 'Green Machine', c: '#4aae4d' },
    { id: 'yuzu', name: 'Yuzu Ginger', c: '#ffdc52' }
  ];
  var STATUS = ['Placed', 'Packed', 'Out for delivery', 'Delivered', 'Cancelled'];
  var STC = { 'Placed': '#ffdc52', 'Packed': '#ff8a2a', 'Out for delivery': '#4a8ea3', 'Delivered': '#4aae4d', 'Cancelled': '#e03442' };
  var WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var IST = 19800000, DAY = 86400000;
  var LOW = 10; // bottles at or below this count as low stock

  /* ---------- formatting */
  var nf = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
  function inr(n) { n = Number(n) || 0; return '₹' + (Math.abs(n % 1) > 0.004 ? n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : nf.format(n)); }
  function inrc(n) { n = Number(n) || 0; var a = Math.abs(n); if (a >= 1e7) return '₹' + (n / 1e7).toFixed(1).replace(/\.0$/, '') + 'Cr'; if (a >= 1e5) return '₹' + (n / 1e5).toFixed(1).replace(/\.0$/, '') + 'L'; if (a >= 1e4) return '₹' + (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k'; return '₹' + nf.format(n); }
  function num(n) { return nf.format(Number(n) || 0); }
  function pct(a, b) { return b ? Math.round(a / b * 1000) / 10 : 0; }
  function dayKey(ms) { return new Date(ms + IST).toISOString().slice(0, 10); }
  function hourOf(ms) { return new Date(ms + IST).getUTCHours(); }
  function dowOf(ms) { return new Date(ms + IST).getUTCDay(); }
  function todayStart() { var n = Date.now(); return Math.floor((n + IST) / DAY) * DAY - IST; }
  function fmtDay(key) { var p = key.split('-'); return Number(p[2]) + ' ' + MON[Number(p[1]) - 1]; }
  function fmtDate(ms) { if (!ms) return '-'; var d = new Date(ms + IST); return d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }
  function fmtTime(ms) { if (!ms) return ''; var d = new Date(ms + IST), h = d.getUTCHours(), m = d.getUTCMinutes(); return ((h % 12) || 12) + ':' + (m < 10 ? '0' : '') + m + ' ' + (h < 12 ? 'AM' : 'PM'); }
  function fmtDT(ms) { return ms ? fmtDate(ms) + ', ' + fmtTime(ms) : '-'; }
  function ago(ms) {
    var s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 45) return 'just now'; if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago'; var d = Math.round(s / 86400); return d + (d === 1 ? ' day ago' : ' days ago');
  }
  function initials(n) { n = String(n || '?').trim().split(/\s+/); return ((n[0] || '?')[0] + (n[1] ? n[1][0] : '')).toUpperCase(); }
  function flav(id) { for (var i = 0; i < FL.length; i++) if (FL[i].id === id) return FL[i]; return { id: id, name: id, c: '#999' }; }
  function bottles(o) { var d = o.drinks || {}; return (d.orange || 0) + (d.beet || 0) + (d.green || 0) + (d.yuzu || 0); }
  function active(o) { return o.status === 'Placed' || o.status === 'Packed' || o.status === 'Out for delivery'; }

  /* ---------- range handling */
  var RANGES = { today: { label: 'Today', days: 1 }, '7d': { label: '7 days', days: 7 }, '30d': { label: '30 days', days: 30 }, '90d': { label: '90 days', days: 90 }, all: { label: 'All time', days: 0 } };
  function rangeWindow(orders, key) {
    var r = RANGES[key], end = todayStart() + DAY, days = r.days;
    if (!days) {
      var first = orders.length ? Math.min.apply(null, orders.map(function (o) { return o.placedAt || end; })) : end;
      days = Math.max(1, Math.min(730, Math.ceil((end - first) / DAY)));
      if (days < 7) days = 7;
    }
    var start = end - days * DAY;
    return { start: start, end: end, days: days, prevStart: start - days * DAY, all: !r.days };
  }
  function within(o, a, b) { return o.placedAt >= a && o.placedAt < b; }
  function revenueOf(list) { return list.reduce(function (s, o) { return s + (o.status === 'Cancelled' ? 0 : o.total); }, 0); }
  function liveOnly(list) { return list.filter(function (o) { return o.status !== 'Cancelled'; }); }

  /* daily (or weekly) bucket series for a window */
  function buckets(orders, win, step) {
    step = step || 1;
    var out = [], n = Math.ceil(win.days / step);
    for (var i = 0; i < n; i++) {
      var a = win.start + i * step * DAY, b = Math.min(win.end, a + step * DAY);
      out.push({ a: a, b: b, key: dayKey(a), orders: [], label: step === 1 ? fmtDay(dayKey(a)) : fmtDay(dayKey(a)) });
    }
    orders.forEach(function (o) {
      if (o.placedAt < win.start || o.placedAt >= win.end) return;
      var idx = Math.floor((o.placedAt - win.start) / (step * DAY)); if (out[idx]) out[idx].orders.push(o);
    });
    return out;
  }
  function sma(vals, n) { return vals.map(function (_, i) { var a = Math.max(0, i - n + 1), s = 0; for (var k = a; k <= i; k++) s += vals[k]; return s / (i - a + 1); }); }
  function regress(vals) {
    var n = vals.length; if (n < 2) return { m: 0, b: vals[0] || 0, f: function () { return vals[0] || 0; } };
    var sx = 0, sy = 0, sxy = 0, sxx = 0, i; for (i = 0; i < n; i++) { sx += i; sy += vals[i]; sxy += i * vals[i]; sxx += i * i; }
    var m = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1), b = (sy - m * sx) / n; return { m: m, b: b, f: function (x) { return b + m * x; } };
  }
  function niceMax(v) { if (v <= 4) return 4; var q = v / 4, e = Math.pow(10, Math.floor(Math.log10(q))), f = q / e, st = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10], k = 0; while (k < st.length - 1 && st[k] < f - 1e-9) k++; var step = st[k] * e; if (e >= 1 && step % 1) step = Math.ceil(step); return step * 4; }

  /* ---------- tooltip */
  var tipEl = null;
  function tip(html, x, y) {
    if (!tipEl) tipEl = $('#tip');
    if (!html) { tipEl.classList.remove('on'); return; }
    tipEl.innerHTML = html; tipEl.classList.add('on');
    var w = tipEl.offsetWidth, h = tipEl.offsetHeight, nx = x + 14, ny = y - h - 12;
    if (nx + w > W.innerWidth - 8) nx = x - w - 14; if (ny < 8) ny = y + 16;
    tipEl.style.left = Math.max(8, nx) + 'px'; tipEl.style.top = ny + 'px';
  }

  /* ---------- charts */
  var uid = 0;
  function smoothPath(pts) {
    if (pts.length < 2) return pts.length ? 'M' + pts[0][0] + ',' + pts[0][1] : '';
    var d = 'M' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1);
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2, t = 0.18;
      var c1x = p1[0] + (p2[0] - p0[0]) * t, c1y = p1[1] + (p2[1] - p0[1]) * t, c2x = p2[0] - (p3[0] - p1[0]) * t, c2y = p2[1] - (p3[1] - p1[1]) * t;
      d += 'C' + c1x.toFixed(1) + ',' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ',' + c2y.toFixed(1) + ' ' + p2[0].toFixed(1) + ',' + p2[1].toFixed(1);
    }
    return d;
  }

  /** Line / area chart with several series, hover tooltip and optional dashed lines (moving average, trend). */
  function lineChart(el, o) {
    var Wd = Math.max(280, el.clientWidth || 600), H = o.height || 260, m = { l: 46, r: 12, t: 12, b: 28 };
    var n = o.labels.length, iw = Wd - m.l - m.r, ih = H - m.t - m.b, id = 'lc' + (++uid);
    var max = 0; o.series.forEach(function (s) { s.values.forEach(function (v) { if (v > max) max = v; }); });
    max = niceMax(max * 1.05 || 1);
    var X = function (i) { return m.l + (n === 1 ? iw / 2 : iw * i / (n - 1)); }, Y = function (v) { return m.t + ih - ih * Math.min(v, max) / max; };
    var s = '<svg viewBox="0 0 ' + Wd + ' ' + H + '" height="' + H + '" role="img" aria-label="' + esc(o.aria || 'Trend chart') + '"><defs>';
    o.series.forEach(function (se, i) { if (se.fill) s += '<linearGradient id="' + id + 'g' + i + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + se.color + '" stop-opacity=".55"/><stop offset="1" stop-color="' + se.color + '" stop-opacity="0"/></linearGradient>'; });
    s += '</defs>';
    for (var g = 0; g <= 4; g++) { var gv = max * g / 4, gy = Y(gv); s += '<line class="gl" x1="' + m.l + '" x2="' + (Wd - m.r) + '" y1="' + gy + '" y2="' + gy + '"/><text x="' + (m.l - 8) + '" y="' + (gy + 4) + '" text-anchor="end">' + esc(o.yfmt ? o.yfmt(gv) : num(gv)) + '</text>'; }
    var every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 62))));
    for (var i = 0; i < n; i += every) s += '<text x="' + X(i) + '" y="' + (H - 8) + '" text-anchor="' + (i === 0 ? 'start' : 'middle') + '">' + esc(o.labels[i]) + '</text>';
    o.series.forEach(function (se, k) {
      var pts = se.values.map(function (v, i) { return [X(i), Y(v)]; }), d = smoothPath(pts);
      if (se.fill && pts.length > 1) s += '<path class="fadein" d="' + d + 'L' + X(n - 1) + ',' + (m.t + ih) + 'L' + X(0) + ',' + (m.t + ih) + 'Z" fill="url(#' + id + 'g' + k + ')"/>';
      if (pts.length > 1) s += '<path class="ln ' + (se.dash ? 'fadein' : 'draw') + '" pathLength="1" d="' + d + '" stroke="' + se.color + '" stroke-width="' + (se.width || 3) + '"' + (se.dash ? ' stroke-dasharray="6 6" style="stroke-dasharray:6 6"' : '') + '/>';
      else if (pts.length === 1) s += '<circle cx="' + pts[0][0] + '" cy="' + pts[0][1] + '" r="5" fill="' + se.color + '"/>';
    });
    s += '<line id="' + id + 'v" class="gl" y1="' + m.t + '" y2="' + (m.t + ih) + '" stroke="#1a1410" stroke-width="1.5" style="opacity:0"/>';
    o.series.forEach(function (se, k) { if (!se.nodot) s += '<circle id="' + id + 'd' + k + '" r="5.5" fill="' + se.color + '" stroke="#1a1410" stroke-width="2.5" style="opacity:0"/>'; });
    s += '<rect id="' + id + 'o" x="' + m.l + '" y="' + m.t + '" width="' + iw + '" height="' + ih + '" fill="transparent"/></svg>';
    el.innerHTML = s;
    var ov = $('#' + id + 'o', el), vl = $('#' + id + 'v', el);
    function move(e) {
      var r = ov.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, i = Math.max(0, Math.min(n - 1, Math.round(px * (n - 1))));
      vl.setAttribute('x1', X(i)); vl.setAttribute('x2', X(i)); vl.style.opacity = 1;
      var rows = '';
      o.series.forEach(function (se, k) { var dd = $('#' + id + 'd' + k, el); if (dd) { dd.setAttribute('cx', X(i)); dd.setAttribute('cy', Y(se.values[i])); dd.style.opacity = 1; } if (!se.hideTip) rows += '<div class="tr"><span><i class="dot" style="background:' + se.color + ';width:9px;height:9px"></i>' + esc(se.name) + '</span><b>' + esc(o.tfmt ? o.tfmt(se.values[i], se) : num(se.values[i])) + '</b></div>'; });
      tip('<b>' + esc(o.tlabels ? o.tlabels[i] : o.labels[i]) + '</b>' + rows, e.clientX, e.clientY);
    }
    function leave() { vl.style.opacity = 0; $$('circle[id^="' + id + 'd"]', el).forEach(function (c) { c.style.opacity = 0; }); tip(null); }
    ov.addEventListener('mousemove', move); ov.addEventListener('mouseleave', leave);
    ov.addEventListener('touchstart', function (e) { move(e.touches[0]); }, { passive: true }); ov.addEventListener('touchmove', function (e) { move(e.touches[0]); }, { passive: true });
  }

  /** Column chart; stacks optional. */
  function colChart(el, o) {
    var Wd = Math.max(260, el.clientWidth || 500), H = o.height || 230, m = { l: 44, r: 8, t: 10, b: 28 }, n = o.labels.length, iw = Wd - m.l - m.r, ih = H - m.t - m.b;
    var stacks = o.stacks || [{ name: o.name || '', color: o.color || '#ff8a2a', values: o.values }];
    var totals = o.labels.map(function (_, i) { return stacks.reduce(function (s, k) { return s + (k.values[i] || 0); }, 0); });
    var max = niceMax(Math.max.apply(null, totals.concat([1])) * 1.05), slot = iw / n, bw = Math.max(3, Math.min(46, slot * 0.7)), Y = function (v) { return m.t + ih - ih * v / max; };
    var s = '<svg viewBox="0 0 ' + Wd + ' ' + H + '" height="' + H + '" role="img" aria-label="' + esc(o.aria || 'Bar chart') + '">';
    for (var g = 0; g <= 4; g++) { var gv = max * g / 4, gy = Y(gv); s += '<line class="gl" x1="' + m.l + '" x2="' + (Wd - m.r) + '" y1="' + gy + '" y2="' + gy + '"/><text x="' + (m.l - 8) + '" y="' + (gy + 4) + '" text-anchor="end">' + esc(o.yfmt ? o.yfmt(gv) : num(gv)) + '</text>'; }
    var every = n <= 14 ? 1 : Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 54))));
    var maxI = totals.indexOf(Math.max.apply(null, totals));
    o.labels.forEach(function (lb, i) {
      var x = m.l + slot * i + (slot - bw) / 2, yb = m.t + ih, delay = Math.min(i * 18, 500);
      stacks.forEach(function (k, ki) {
        var v = k.values[i] || 0; if (!v) return; var h = ih * v / max;
        yb -= h; var op = o.stacks || !o.hiMax || i === maxI ? 1 : 0.55;
        s += '<rect class="colb" x="' + x.toFixed(1) + '" y="' + yb.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(1.5, h).toFixed(1) + '" rx="' + (o.stacks ? 3 : Math.min(6, bw / 2)) + '" fill="' + k.color + '" stroke="#1a1410" stroke-width="1.6" opacity="' + op + '" style="animation-delay:' + delay + 'ms"/>';
      });
      if (i % every === 0) s += '<text x="' + (x + bw / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(lb) + '</text>';
      s += '<rect data-i="' + i + '" x="' + (m.l + slot * i) + '" y="' + m.t + '" width="' + slot + '" height="' + ih + '" fill="transparent"/>';
    });
    s += '</svg>'; el.innerHTML = s;
    $$('rect[data-i]', el).forEach(function (r) {
      var i = Number(r.getAttribute('data-i'));
      function show(e) { var rows = ''; stacks.slice().reverse().forEach(function (k) { if (k.values[i] || stacks.length === 1) rows += '<div class="tr"><span><i class="dot" style="background:' + k.color + ';width:9px;height:9px"></i>' + esc(k.name || 'Total') + '</span><b>' + esc(o.tfmt ? o.tfmt(k.values[i] || 0) : num(k.values[i] || 0)) + '</b></div>'; }); tip('<b>' + esc(o.tlabels ? o.tlabels[i] : o.labels[i]) + '</b>' + rows, e.clientX, e.clientY); }
      r.addEventListener('mousemove', show); r.addEventListener('mouseleave', function () { tip(null); }); r.addEventListener('touchstart', function (e) { show(e.touches[0]); }, { passive: true });
    });
  }

  /** Donut with centre read-out and legend. items: [{name,value,color}] */
  function donut(el, items, o) {
    o = o || {};
    var total = items.reduce(function (s, i) { return s + i.value; }, 0), r = 15.9155, off = 0, id = 'dn' + (++uid), fmt = o.fmt || num;
    var segs = '';
    if (!total) segs = '<circle cx="21" cy="21" r="' + r + '" stroke="rgba(26,20,16,.1)" stroke-width="6"/>';
    items.forEach(function (it, i) {
      if (!it.value) return; var p = it.value / total * 100, gap = items.filter(function (x) { return x.value; }).length > 1 ? 0.8 : 0;
      segs += '<circle class="seg" data-i="' + i + '" cx="21" cy="21" r="' + r + '" stroke="' + it.color + '" stroke-width="6" stroke-dasharray="' + Math.max(0, p - gap).toFixed(2) + ' ' + (100 - Math.max(0, p - gap)).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" style="animation-delay:' + (i * 120) + 'ms"/>';
      off += p;
    });
    var legend = items.map(function (it, i) { return '<div data-i="' + i + '"><i class="dot" style="background:' + it.color + '"></i><span class="nm">' + esc(it.name) + '</span><span class="pc">' + (total ? Math.round(it.value / total * 100) : 0) + '%</span><b>' + esc(fmt(it.value)) + '</b></div>'; }).join('');
    el.innerHTML = '<div class="donutwrap"><div class="donut"><svg viewBox="0 0 42 42"><circle cx="21" cy="21" r="' + r + '" fill="none" stroke="#1a1410" stroke-width="7.6" opacity=".9"/>' + segs + '</svg><div class="ctr"><b>' + esc(o.centre != null ? o.centre : fmt(total)) + '</b><small>' + esc(o.label || 'Total') + '</small></div></div><div class="legend" style="flex:1;min-width:150px">' + legend + '</div></div>';
    var ctrB = $('.ctr b', el), ctrS = $('.ctr small', el), b0 = ctrB.textContent, s0 = ctrS.textContent;
    function hi(i, on) {
      $$('circle.seg', el).forEach(function (c) { var same = Number(c.getAttribute('data-i')) === i; c.style.opacity = on && !same ? .35 : 1; c.setAttribute('stroke-width', on && same ? 7 : 6); });
      if (on) { ctrB.textContent = fmt(items[i].value); ctrS.textContent = items[i].name; } else { ctrB.textContent = b0; ctrS.textContent = s0; }
    }
    $$('circle.seg,.legend div', el).forEach(function (n) { var i = Number(n.getAttribute('data-i')); n.addEventListener('mouseenter', function () { hi(i, true); }); n.addEventListener('mouseleave', function () { hi(i, false); }); });
  }

  function hbars(el, items, o) {
    o = o || {}; var max = Math.max.apply(null, items.map(function (i) { return i.value; }).concat([1])), fmt = o.fmt || num;
    if (!items.length) { el.innerHTML = '<div class="empty">Nothing to show yet.</div>'; return; }
    el.innerHTML = '<div class="hb">' + items.map(function (i) { return '<div class="r"><span class="n" title="' + esc(i.name) + '">' + esc(i.name) + '</span><span class="bar"><i data-w="' + (i.value / max * 100).toFixed(1) + '" style="--c:' + (i.color || o.color || '#ff8a2a') + '"></i></span><b>' + esc(fmt(i.value)) + '</b></div>'; }).join('') + '</div>';
    requestAnimationFrame(function () { requestAnimationFrame(function () { $$('.bar i', el).forEach(function (b) { b.style.width = b.getAttribute('data-w') + '%'; }); }); });
  }

  function spark(vals, color) {
    var w = 120, h = 40, n = vals.length, max = Math.max.apply(null, vals.concat([1])); if (n < 2) return '';
    var pts = vals.map(function (v, i) { return [w * i / (n - 1), h - 4 - (h - 8) * v / max]; });
    var d = smoothPath(pts);
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true"><path d="' + d + 'L' + w + ',' + h + 'L0,' + h + 'Z" fill="rgba(26,20,16,.1)"/><path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round"/></svg>';
  }

  /** weekday x hour heat map */
  function heat(el, orders) {
    var g = []; for (var d = 0; d < 7; d++) { g.push(new Array(24).fill(0)); }
    orders.forEach(function (o) { g[dowOf(o.placedAt)][hourOf(o.placedAt)]++; });
    var max = Math.max.apply(null, [].concat.apply([], g).concat([1])), html = '<div class="heat"><span></span>';
    for (var h = 0; h < 24; h++) html += '<span class="hx">' + (h % 3 === 0 ? h : '') + '</span>';
    [1, 2, 3, 4, 5, 6, 0].forEach(function (d) {
      html += '<span class="hl">' + WD[d] + '</span>';
      for (var h2 = 0; h2 < 24; h2++) { var v = g[d][h2], a = v ? 0.18 + 0.82 * v / max : 0; html += '<span class="hc" data-t="' + WD[d] + ', ' + h2 + ':00 to ' + ((h2 + 1) % 24) + ':00|' + v + ' order' + (v === 1 ? '' : 's') + '" style="' + (v ? 'background:rgba(255,138,42,' + a.toFixed(2) + ');border-color:#1a1410' : '') + '"></span>'; }
    });
    el.innerHTML = html + '</div>';
    $$('.hc', el).forEach(function (c) { c.addEventListener('mousemove', function (e) { var t = c.getAttribute('data-t').split('|'); tip('<b>' + esc(t[0]) + '</b><br>' + esc(t[1]), e.clientX, e.clientY); }); c.addEventListener('mouseleave', function () { tip(null); }); });
  }
  function hourStrip(el, orders) {
    var h = new Array(24).fill(0); orders.forEach(function (o) { h[hourOf(o.placedAt)]++; }); var max = Math.max.apply(null, h.concat([1]));
    el.innerHTML = '<div class="strip">' + h.map(function (v, i) { return '<span class="hc" data-t="' + i + ':00 to ' + ((i + 1) % 24) + ':00|' + v + ' order' + (v === 1 ? '' : 's') + '" style="' + (v ? 'background:rgba(255,138,42,' + (0.2 + 0.8 * v / max).toFixed(2) + ');border-color:#1a1410' : '') + '"></span>'; }).join('') + '</div><div class="heat" style="grid-template-columns:repeat(24,1fr);margin-top:6px">' + h.map(function (_, i) { return '<span class="hx">' + (i % 3 === 0 ? i : '') + '</span>'; }).join('') + '</div>';
    $$('.hc', el).forEach(function (c) { c.addEventListener('mousemove', function (e) { var t = c.getAttribute('data-t').split('|'); tip('<b>' + esc(t[0]) + '</b><br>' + esc(t[1]), e.clientX, e.clientY); }); c.addEventListener('mouseleave', function () { tip(null); }); });
  }

  function countUp(el, to, fmt, dur) {
    var from = Number(el.getAttribute('data-v') || 0); el.setAttribute('data-v', to);
    if (W.matchMedia && W.matchMedia('(prefers-reduced-motion:reduce)').matches || from === to) { el.textContent = fmt(to); return; }
    var t0 = performance.now(); dur = dur || 900;
    (function f(t) { var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * e); if (k < 1) requestAnimationFrame(f); else el.textContent = fmt(to); })(t0);
  }

  var U = { $: $, $$: $$, esc: esc, FL: FL, STATUS: STATUS, STC: STC, WD: WD, DAY: DAY, IST: IST, LOW: LOW, inr: inr, inrc: inrc, num: num, pct: pct, dayKey: dayKey, hourOf: hourOf, dowOf: dowOf, todayStart: todayStart, fmtDay: fmtDay, fmtDate: fmtDate, fmtTime: fmtTime, fmtDT: fmtDT, ago: ago, initials: initials, flav: flav, bottles: bottles, active: active,
    RANGES: RANGES, rangeWindow: rangeWindow, within: within, revenueOf: revenueOf, liveOnly: liveOnly, buckets: buckets, sma: sma, regress: regress, tip: tip,
    lineChart: lineChart, colChart: colChart, donut: donut, hbars: hbars, spark: spark, heat: heat, hourStrip: hourStrip, countUp: countUp };
  W.AdminKit = U;
})();
/* Vitame admin portal: the app (data loading, live updates, views). */
(function () {
  'use strict';
  var K = W_Kit(), $ = K.$, $$ = K.$$, esc = K.esc, FL = K.FL, inr = K.inr, inrc = K.inrc, num = K.num;
  function W_Kit() { return window.AdminKit; }
  var D = document, W = window;
  var EP = (W.PP && W.PP.ordersEndpoint) || '';
  var DEMO = /[?&]demo=1/.test(location.search);
  var sess = null;
  try { sess = JSON.parse(sessionStorage.getItem('pp-admin') || 'null'); } catch (e) { sess = null; }
  if (!DEMO && (!sess || !sess.token || sess.exp < Date.now())) { try { sessionStorage.removeItem('pp-admin'); } catch (e) { /* ignore */ } location.replace('./auth.html?next=admin.html'); return; }

  var S = { view: 'overview', range: '30d', metric: 'rev', gran: 'day', data: null, rev: '', anim: true, seen: null, page: 1, f: { q: '', status: '', ship: '', pay: '', sort: 'new' }, openId: null, sound: true, lastSync: 0, online: true, polls: 0, cq: '', cs: 'spent', flashIds: {}, pending: 0, pipQ: '' };
  try { S.sound = localStorage.getItem('pp-adm-sound') !== '0'; } catch (e) { /* ignore */ }
  var VIEWS = { overview: ['Over', 'view', 'How Vitame is doing, live.'], orders: ['Or', 'ders', 'Every order, from placed to delivered.'], subs: ['Subscrip', 'tions', 'Boxes on repeat, what is due and what it needs from stock.'], sales: ['Sa', 'les', 'Revenue, trends and what sells.'], stock: ['St', 'ock', 'What is on the shelf and how fast it moves.'], customers: ['Custo', 'mers', 'Who orders, how often and how much.'], games: ['Games ', '& Pip', 'Leaderboards and what people ask Pip.'], store: ['The ', 'store', 'Warehouse, sheets and this portal.'] };
  var ICONS = {
    overview: '<path d="M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z"/>', subs: '<path d="M17 2l4 4-4 4M3 11V9a3 3 0 013-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 01-3 3H3"/>', orders: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4"/>',
    sales: '<path d="M3 3v18h18M7 15l4-5 3 3 5-7"/>', stock: '<path d="M21 8l-9-5-9 5 9 5zM3 8v8l9 5 9-5V8M12 13v8"/>',
    customers: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7M17 4a4 4 0 010 8M22 21c0-3-2-5.500-5-6.500"/>', games: '<rect x="2" y="7" width="20" height="12" rx="5"/><path d="M7 11v4M5 13h4M16 12h.01M18.500 14h.01"/>',
    store: '<path d="M4 9l1-5h14l1 5M4 9v11h16V9M4 9c0 2 2 3 4 3s4-1 4-3c0 2 2 3 4 3s4-1 4-3M10 20v-5h4v5"/>'
  };
  function ico(n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[n] + '</svg>'; }

  /* ================================================================== demo data (only with ?demo=1) */
  var DB = null;
  function demoInit() {
    var seed = 42; function rnd() { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }
    var names = ['Aarav Mehta', 'Diya Sharma', 'Kabir Singh', 'Ananya Rao', 'Vihaan Patel', 'Ishita Jain', 'Rohan Gupta', 'Meera Nair', 'Arjun Reddy', 'Saanvi Iyer', 'Reyansh Das', 'Kiara Shah', 'Advait Joshi', 'Myra Kapoor', 'Vivaan Menon', 'Anika Bose', 'Dhruv Malhotra', 'Navya Pillai', 'Shaurya Verma', 'Tara Khanna', 'Rishabh Jain', 'Priya Desai', 'Karan Bhatia', 'Neha Agarwal'];
    var cities = [['Indore', 30], ['Bhopal', 16], ['Mumbai', 16], ['Pune', 12], ['Delhi', 11], ['Bengaluru', 9], ['Ahmedabad', 6]];
    var o = [], id = 1000, now = Date.now(), day = K.DAY, ts = K.todayStart();
    for (var d = 119; d >= 0; d--) {
      var base = 1.2 + (120 - d) / 120 * 4.8, wd = K.dowOf(ts - d * day + day / 2), mult = (wd === 0 || wd === 6 ? 1.5 : wd === 5 ? 1.25 : 1), cnt = Math.round(base * mult * (0.6 + rnd() * 0.9));
      for (var i = 0; i < cnt; i++) {
        var h = Math.min(23, Math.floor(8 + Math.abs((rnd() + rnd() + rnd()) / 3 - 0.5) * 2 * 16 + (rnd() < 0.35 ? 9 : 0))); var at = ts - d * day + h * 3600000 + Math.floor(rnd() * 3600000);
        if (at > now) continue; o.push(demoOrder(++id, at, rnd, names, cities));
      }
    }
    var stk = [['orange', 'Orange Riot', 0, '20 December 2026'], ['beet', 'Beet & Berry', 14, ''], ['green', 'Green Machine', 29, ''], ['yuzu', 'Yuzu Ginger', 6, '']].map(function (r) { return { id: r[0], name: r[1], qty: r[2], backAt: r[3], status: r[2] > 0 ? 'In stock' : 'Out of stock' }; });
    var board = []; ['slice', 'stack', 'smash'].forEach(function (g, gi) { for (var p = 0; p < 9; p++) board.push({ uid: 'PPU-' + (g === 'slice' ? 'S' : g === 'stack' ? 'T' : 'M') + '0' + p + 'ABCDEF', name: names[(p * 3 + gi) % names.length].split(' ')[0] + ' ' + names[(p * 3 + gi) % names.length].split(' ')[1][0] + '.', game: g, best: Math.round((g === 'slice' ? 900 : g === 'stack' ? 120 : 260) * (0.2 + rnd() * 0.8)), plays: 1 + Math.floor(rnd() * 14), first: now - rnd() * 40 * day, last: now - rnd() * 5 * day, lastScore: 50 }); });
    var qs = ['Which juice has the most vitamin C?', 'Is Orange Riot sold out?', 'How does delivery work?', 'Can I skip a subscription?', 'What goes with a spicy snack?', 'Is there any added sugar?', 'How long does a bottle last?', 'Do you deliver to Bhopal?', 'Which flavour is sweetest?', 'Can I pay with UPI?'];
    var chats = qs.map(function (q, i) { return { at: now - i * 5400000 - rnd() * 3600000, page: ['shop', 'home', 'subscribe', 'checkout'][i % 4], q: q }; });
    var subs = [], fq = [['weekly', 7, 'every week'], ['fortnight', 14, 'every 2 weeks'], ['monthly', 28, 'every 4 weeks']], seen = {};
    o.slice().reverse().forEach(function (x) { if (subs.length >= 16 || seen[x.email]) return; seen[x.email] = 1; var F = fq[Math.floor(rnd() * 3)], size = [6, 6, 12, 18][Math.floor(rnd() * 4)], mix = {}, k; for (k = 0; k < size; k++) { var f = FL[Math.floor(rnd() * 4)].id; mix[f] = (mix[f] || 0) + 1; }
      var price = ({ 6: 260, 12: 496, 18: 720 })[size], st = rnd() < 0.78 ? 'Active' : rnd() < 0.6 ? 'Paused' : 'Cancelled', nextD = new Date(Date.now() + (3 + Math.floor(rnd() * 24)) * 86400000 + 19800000).toISOString().slice(0, 10), prem = rnd() < 0.25;
      subs.push({ id: 'SUB-' + (1001 + subs.length), name: x.name, email: x.email, phone: x.phone, address: x.address, city: x.city, pin: x.pin, size: size, boxes: 1, mix: mix, freq: F[0], freqLabel: F[2], freqDays: F[1], status: st, next: nextD, ship: prem ? 'Premium' : 'Normal', price: price, fee: prem ? 99 : 0, total: price + (prem ? 99 : 0), full: ({ 6: 330, 12: 620, 18: 900 })[size], done: 1 + Math.floor(rnd() * 8), skipped: Math.floor(rnd() * 3), lastOrder: x.id, resume: st === 'Paused' && rnd() < 0.5 ? new Date(Date.now() + 12 * 86400000 + 19800000).toISOString().slice(0, 10) : '', created: x.placedAt, attn: '', notes: '' });
      x.subId = 'SUB-' + (1000 + subs.length); });
    if (subs[0]) subs[0].attn = new Date().toISOString().slice(0, 10) + ': Only 1 Yuzu Ginger left.';
    DB = { orders: o, stock: stk, board: board, chats: chats, subs: subs, rev: String(now), seq: id };
  }
  function demoOrder(n, at, rnd, names, cities) {
    var r = rnd() * 100, ac = 0, city = 'Indore'; for (var c = 0; c < cities.length; c++) { ac += cities[c][1]; if (r < ac) { city = cities[c][0]; break; } }
    var nm = names[Math.floor(rnd() * names.length)], d = { orange: 0, beet: 0, green: 0, yuzu: 0 }, items, sub, pack = rnd() < 0.28, q = 1 + Math.floor(rnd() * 3);
    var w = [0.32, 0.27, 0.22, 0.19];
    function pick() { var x = rnd(), a = 0; for (var i = 0; i < 4; i++) { a += w[i]; if (x < a) return FL[i].id; } return 'orange'; }
    if (pack) { for (var k = 0; k < 6; k++) d[pick()]++; items = '6-pack mix (6 bottles)'; sub = 330; } else { var f = pick(); d[f] = q; items = FL.filter(function (x) { return x.id === f; })[0].name + ' x ' + q + ' (330 ml bottle)'; sub = 60 * q; }
    var subs = rnd() < 0.12; if (subs) items += ' [subscription]'; var disc = subs ? Math.round(sub * 0.2) : 0, prem = rnd() < 0.3, fee = (sub - disc) >= 400 ? 0 : prem ? 99 : 49; if (prem && fee === 0) fee = 0;
    var age = Date.now() - at, st = age > 4 * 86400000 ? 'Delivered' : age > 2 * 86400000 ? (rnd() < 0.8 ? 'Delivered' : 'Out for delivery') : age > 86400000 ? (rnd() < 0.5 ? 'Out for delivery' : 'Packed') : age > 3600000 * 5 ? 'Packed' : 'Placed';
    if (rnd() < 0.04) st = 'Cancelled';
    var email = nm.toLowerCase().replace(/ /g, '.') + '@gmail.com';
    return { id: 'PP-' + n, placedAt: at, name: nm, email: email, phone: '98' + (10000000 + Math.floor(rnd() * 89999999)), address: (10 + Math.floor(rnd() * 90)) + ', Sample Nagar, ' + city, city: city, pin: String(452000 + Math.floor(rnd() * 900)), ship: prem ? 'Premium' : 'Normal', deliveryDate: 'Soon', items: items,
      drinks: d, subtotal: sub, discount: disc, shipFee: fee, total: sub - disc + fee, pay: rnd() < 0.55 ? 'Paid' : 'Pending', payId: '', emailSent: rnd() < 0.97 ? 'sent' : 'failed: quota', smsSent: 'not configured', stockUpd: 'updated', status: st, courier: st === 'Out for delivery' || st === 'Delivered' ? 'Ravi' : '', deliveredAt: st === 'Delivered' ? at + 86400000 * 1.5 : null, dest: null };
  }
  function demoSub(s) { var t = Math.floor(Date.now() / 86400000), n = Math.floor(Date.parse(s.next + 'T00:00:00Z') / 86400000), cu = new Date((n - 4) * 86400000).toISOString().slice(0, 10); return Object.assign({}, s, { daysToNext: n - t, changeUntil: cu, canChange: s.status === 'Active' && t <= n - 4 }); }
  function demoApi(action, b) {
    if (!DB) demoInit();
    return new Promise(function (res) {
      setTimeout(function () {
        if (action === 'admin_sub') {
          if (b.op === 'backfill') { return res({ ok: true, imported: 0 }); }
          if (b.op === 'run') { DB.rev = String(Date.now()); return res({ ok: true, result: { orders: 2, reminders: 3, short: 0, skipped: 0, resumed: 0 } }); }
          var s = DB.subs.filter(function (x) { return x.id === b.id; })[0]; if (!s) return res({ ok: false, error: 'Not found' });
          if (b.op === 'skip') { s.next = new Date((Math.floor(Date.parse(s.next + 'T00:00:00Z') / 86400000) + s.freqDays) * 86400000).toISOString().slice(0, 10); s.skipped++; } else if (b.op === 'pause') { s.status = 'Paused'; } else if (b.op === 'resume') { s.status = 'Active'; if (b.next) s.next = b.next; s.resume = ''; } else if (b.op === 'cancel') { s.status = 'Cancelled'; } else if (b.op === 'next' && b.next) { s.next = b.next; }
          DB.rev = String(Date.now()); return res({ ok: true, sub: demoSub(s) });
        }
        if (action === 'admin_data') {
          if (b.rev && b.rev === DB.rev) return res({ ok: true, unchanged: true, rev: DB.rev });
          return res({ ok: true, rev: DB.rev, serverTime: Date.now(), orders: DB.orders.slice(), subs: DB.subs.map(demoSub), stock: DB.stock.map(function (s) { return Object.assign({}, s); }), board: DB.board, chats: DB.chats, warehouse: { name: 'Vitame Warehouse', address: 'Vijay Nagar, Indore, Madhya Pradesh', lat: 22.75, lng: 75.89 }, statuses: K.STATUS, version: 'demo', orderSeq: DB.seq, links: { orders: '#', stock: '#', board: '#' } });
        }
        if (action === 'admin_status') { DB.orders.forEach(function (o) { if (o.id === b.id) { o.status = b.status; if (b.courier) o.courier = b.courier; if (b.lat != null && b.lng != null) o.loc = { lat: b.lat, lng: b.lng, label: b.locLabel || '', at: Date.now(), src: 'admin' }; if (b.status === 'Delivered') o.deliveredAt = Date.now(); } }); DB.rev = String(Date.now()); return res({ ok: true, mail: b.status === 'Out for delivery' ? 'sent' : undefined }); }
        if (action === 'admin_location') { var lo = DB.orders.filter(function (o) { return o.id === b.id; })[0]; if (!lo) return res({ ok: false, error: 'Order not found.' }); lo.loc = { lat: b.lat, lng: b.lng, label: b.locLabel || '', at: Date.now(), src: 'admin' }; DB.rev = String(Date.now()); return res({ ok: true }); }
        if (action === 'admin_stock') { DB.stock.forEach(function (s) { if (s.id === b.id) { s.qty = b.qty; s.backAt = b.backAt || ''; s.status = b.qty > 0 ? 'In stock' : 'Out of stock'; } }); DB.rev = String(Date.now()); return res({ ok: true }); }
        res({ ok: false, error: 'demo' });
      }, 120);
    });
  }
  function demoTick() {
    if (!DEMO || !DB) return; var seed = Date.now() % 1000; var r = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    var o = demoOrder(++DB.seq, Date.now(), r, ['Aarav Mehta', 'Diya Sharma', 'Kabir Singh', 'Ananya Rao'], [['Indore', 50], ['Pune', 50]]); o.status = 'Placed'; DB.orders.push(o);
    FL.forEach(function (f) { var s = DB.stock.filter(function (x) { return x.id === f.id; })[0]; if (s && o.drinks[f.id]) { s.qty = Math.max(0, s.qty - o.drinks[f.id]); s.status = s.qty > 0 ? 'In stock' : 'Out of stock'; } }); DB.rev = String(Date.now());
  }

  /* ================================================================== api + live loop */
  function api(action, body) {
    if (DEMO) return demoApi(action, body || {});
    var ctl = W.AbortController ? new AbortController() : null, tm = setTimeout(function () { ctl && ctl.abort(); }, 28000);
    return fetch(EP, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ action: action, token: sess.token }, body || {})), signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.json(); }).then(function (j) { clearTimeout(tm); return j; }, function () { clearTimeout(tm); return { ok: false, net: true, error: 'Could not reach the server.' }; });
  }
  function normalize(j) {
    var orders = (j.orders || []).filter(function (o) { return o && o.id && o.placedAt; }).sort(function (a, b) { return b.placedAt - a.placedAt; });
    var stock = FL.map(function (f) { var s = (j.stock || []).filter(function (x) { return x.id === f.id; })[0]; return s ? s : { id: f.id, name: f.name, qty: 0, backAt: '', status: 'Not in sheet', missing: true }; });
    return { orders: orders, stock: stock, board: j.board || [], chats: (j.chats || []).sort(function (a, b) { return (b.at || 0) - (a.at || 0); }), warehouse: j.warehouse || {}, version: j.version, orderSeq: j.orderSeq, links: j.links || {}, serverTime: j.serverTime, subs: j.subs || [] };
  }
  function setOnline(on, msg) {
    S.online = on; var p = $('#live'); if (!p) return;
    p.classList.toggle('off', !on); p.querySelector('span').textContent = on ? (DEMO ? 'Demo data, live' : 'Live') : 'Offline, retrying';
    var e = $('#errbar'); if (e) { e.hidden = on; if (!on) e.textContent = (msg || 'Could not reach the server.') + ' Showing the last data we had.'; }
  }
  function load(force, silent) {
    return api('admin_data', { rev: force ? '' : S.rev }).then(function (j) {
      if (j && j.auth === false) { logout(true); return; }
      if (!j || !j.ok) { setOnline(false, j && j.error); if (!S.data) renderFail(j && j.error); return; }
      setOnline(true); S.lastSync = Date.now(); updateSync();
      if (j.unchanged) return;
      var first = !S.data, prevIds = S.seen; S.rev = j.rev; S.data = normalize(j);
      var fresh = [];
      if (first) { S.seen = {}; S.data.orders.forEach(function (o) { S.seen[o.id] = 1; }); }
      else { S.data.orders.forEach(function (o) { if (!S.seen[o.id]) { S.seen[o.id] = 1; fresh.push(o); } }); }
      fresh.forEach(function (o) { S.flashIds[o.id] = 1; });
      render(first);
      if (fresh.length) newOrders(fresh);
      if (S.openId) drawer(S.openId, true); else if (S.openSub) subDrawer(S.openSub, true);
    });
  }
  function updateSync() { var e = $('#sync'); if (e && S.lastSync) e.textContent = 'Updated ' + K.ago(S.lastSync); }
  function poll() {
    if (D.hidden) return; S.polls++;
    load(S.polls % 8 === 0);
    if (DEMO && S.polls % 5 === 0) demoTick();
  }

  /* ---------- new order alerts */
  var ac = null;
  function chime() {
    if (!S.sound) return;
    try { ac = ac || new (W.AudioContext || W.webkitAudioContext)(); var t = ac.currentTime; [[880, 0], [1318, 0.13]].forEach(function (n) { var o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = n[0]; g.gain.setValueAtTime(0.0001, t + n[1]); g.gain.exponentialRampToValueAtTime(0.18, t + n[1] + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + n[1] + 0.5); o.connect(g); g.connect(ac.destination); o.start(t + n[1]); o.stop(t + n[1] + 0.55); }); } catch (e) { /* no audio */ }
  }
  function toast(o) {
    var w = $('#toasts'), t = D.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status');
    t.innerHTML = '<span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' + ICONS.orders + '</svg></span><div><b>' + esc(o.title) + '</b><span>' + esc(o.text) + '</span></div>';
    t.onclick = function () { t.remove(); if (o.go) o.go(); }; w.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 320); }, 7000);
  }
  function newOrders(list) {
    chime(); if (W.AdminPip) { try { W.AdminPip.onNewOrders(list); } catch (e) { /* ignore */ } }
    if (list.length <= 3) list.forEach(function (o) { toast({ title: 'New order ' + o.id, text: inr(o.total) + ' from ' + o.name + (o.city ? ', ' + o.city : ''), go: function () { S.view = 'orders'; S.page = 1; S.anim = true; render(true); drawer(o.id); } }); });
    else toast({ title: list.length + ' new orders', text: 'Total ' + inr(list.reduce(function (s, o) { return s + o.total; }, 0)), go: function () { S.view = 'orders'; render(true); } });
    if (D.hidden) { S.pending += list.length; D.title = '(' + S.pending + ') New order | VITAME admin'; }
  }

  /* ================================================================== shared view helpers */
  function card(title, sub, body, cls, head) { return '<section class="card ' + (cls || '') + '"><div class="chead"><div><h3>' + title + '</h3>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + '</div><span class="sp"></span>' + (head || '') + '</div>' + body + '</section>'; }
  function stChip(s) { return '<span class="st" style="--c:' + (K.STC[s] || '#999') + '">' + esc(s) + '</span>'; }
  function delta(cur, prev, inv) {
    if (prev == null) return '';
    if (!prev && !cur) return '<span class="delta flat">no change</span>'; if (!prev) return '<span class="delta up">new</span>';
    var p = (cur - prev) / prev * 100, cls = Math.abs(p) < 0.5 ? 'flat' : ((p > 0) !== !!inv ? 'up' : 'down');
    return '<span class="delta ' + cls + '">' + (p > 0.5 ? '▲' : p < -0.5 ? '▼' : '●') + ' ' + Math.abs(Math.round(p)) + '%</span>';
  }
  function stepFor(days) { return days > 180 ? 7 : Math.max(1, Math.ceil(days / 45)); }
  function metricVal(list, m) { var l = K.liveOnly(list); return m === 'orders' ? l.length : m === 'bottles' ? l.reduce(function (s, o) { return s + K.bottles(o); }, 0) : K.revenueOf(list); }
  var MET = { rev: { n: 'Revenue', f: inr, y: inrc, c: '#ff8a2a' }, orders: { n: 'Orders', f: num, y: num, c: '#4a8ea3' }, bottles: { n: 'Bottles', f: num, y: num, c: '#4aae4d' } };
  function slopeText(vals, step, m) {
    var r = K.regress(vals), n = vals.length, mean = vals.reduce(function (s, v) { return s + v; }, 0) / (n || 1);
    var change = mean ? r.m * (n - 1) / mean * 100 : 0, perDay = r.m / step, dir = Math.abs(change) < 4 ? 'flat' : change > 0 ? 'up' : 'down';
    var proj = ''; if (step === 1 && n >= 14) { var s = 0; for (var i = 0; i < 7; i++) s += Math.max(0, r.f(n + i)); proj = ' Projected next 7 days: <b>' + MET[m].f(Math.round(s)) + '</b>.'; }
    return '<b>' + (dir === 'up' ? '▲ Trending up' : dir === 'down' ? '▼ Trending down' : '● Holding steady') + '</b>' + (dir === 'flat' ? '' : ' about ' + Math.abs(Math.round(change)) + '% across this period (' + (perDay >= 0 ? '+' : '-') + MET[m].f(Math.abs(Math.round(perDay * 10) / 10)) + ' a day).') + proj;
  }
  function rangeChips() { return '<div class="chips" role="group" aria-label="Date range">' + Object.keys(K.RANGES).map(function (k) { return '<button type="button" data-range="' + k + '" aria-pressed="' + (S.range === k) + '">' + K.RANGES[k].label + '</button>'; }).join('') + '</div>'; }

  function attention(all, stock) {
    var out = [], now = Date.now();
    var old = all.filter(function (o) { return o.status === 'Placed' && now - o.placedAt > 12 * 3600000; });
    if (old.length) out.push({ c: 'bad', i: '!', t: old.length + ' order' + (old.length > 1 ? 's' : '') + ' placed over 12 hours ago and not packed', go: { view: 'orders', f: { status: 'Placed' } } });
    stock.forEach(function (s) { if (s.missing) return; if (s.qty <= 0) out.push({ c: 'bad', i: '0', t: s.name + ' is sold out' + (s.backAt ? ' (back ' + s.backAt + ')' : ''), go: { view: 'stock' } }); else if (s.qty <= K.LOW) out.push({ c: 'warn', i: s.qty, t: 'Only ' + s.qty + ' ' + s.name + ' left', go: { view: 'stock' } }); });
    var failMail = all.filter(function (o) { return /^failed/i.test(o.emailSent); }); if (failMail.length) out.push({ c: 'warn', i: '@', t: failMail.length + ' confirmation email' + (failMail.length > 1 ? 's' : '') + ' failed to send', go: { view: 'orders', f: { q: 'failed' } } });
    var failStock = all.filter(function (o) { return /^failed/i.test(o.stockUpd); }); if (failStock.length) out.push({ c: 'warn', i: '#', t: failStock.length + ' order' + (failStock.length > 1 ? 's' : '') + ' did not update the stock sheet', go: { view: 'orders' } });
    var unpaid = all.filter(function (o) { return o.pay !== 'Paid' && o.status !== 'Cancelled'; }).length; if (unpaid) out.push({ c: 'info', i: '₹', t: unpaid + ' order' + (unpaid > 1 ? 's' : '') + ' with payment still pending', go: { view: 'orders', f: { pay: 'Pending' } } });
    var subA = subsAll().filter(function (s) { return s.attn && s.status === 'Active'; }); if (subA.length) out.push({ c: 'warn', i: '~', t: subA.length + ' subscription box' + (subA.length > 1 ? 'es' : '') + ' cannot be packed yet (a flavour is short)', go: { view: 'subs' } });
    var plan = packPlan(7), shortF = FL.filter(function (f) { var st = stock.filter(function (x) { return x.id === f.id; })[0]; return plan.need[f.id] > (st ? st.qty : 0); }); if (shortF.length) out.push({ c: 'warn', i: '#', t: 'Subscription boxes due this week need more ' + shortF.map(function (f) { return f.name; }).join(', '), go: { view: 'subs' } });
    if (!out.length) out.push({ c: 'good', i: '✓', t: 'Everything looks good. Nothing needs your attention.' });
    return out;
  }
  function attHtml(list) { return '<div class="att">' + list.map(function (a, i) { return '<button type="button" data-att="' + i + '"' + (a.go ? '' : ' style="cursor:default"') + '><span class="ic ' + a.c + '">' + esc(a.i) + '</span>' + esc(a.t) + '</button>'; }).join('') + '</div>'; }

  /* ================================================================== views */
  var mounts = [];
  function overview() {
    var all = S.data.orders, win = K.rangeWindow(all, S.range), cur = all.filter(function (o) { return K.within(o, win.start, win.end); }), prev = win.all ? null : all.filter(function (o) { return K.within(o, win.prevStart, win.start); });
    var live = K.liveOnly(cur), pl = prev ? K.liveOnly(prev) : null;
    function kp(l) { var r = K.revenueOf(l), n = l.length; return { rev: r, n: n, aov: n ? r / n : 0, bot: l.reduce(function (s, o) { return s + K.bottles(o); }, 0), cust: Object.keys(l.reduce(function (m, o) { m[o.email.toLowerCase()] = 1; return m; }, {})).length }; }
    var c = kp(live), p = pl ? kp(pl) : null, step = stepFor(win.days), bk = K.buckets(live, win, step);
    var activeNow = all.filter(K.active).length, awaiting = all.filter(function (o) { return o.status === 'Placed'; }).length;
    var sRev = bk.map(function (b) { return K.revenueOf(b.orders); }), sOrd = bk.map(function (b) { return b.orders.length; }), sBot = bk.map(function (b) { return b.orders.reduce(function (s, o) { return s + K.bottles(o); }, 0); });
    var h = '<div class="grid g6">';
    h += '<div class="card kpi c1"><span class="lab">Revenue</span><span class="val" data-cu="' + c.rev + '" data-f="inr">' + inr(c.rev) + '</span><span class="foot">' + delta(c.rev, p && p.rev) + '<span>vs previous ' + (win.all ? '' : win.days + ' days') + '</span></span>' + K.spark(sRev, '#1a1410') + '</div>';
    h += '<div class="card kpi c2"><span class="lab">Orders</span><span class="val" data-cu="' + c.n + '" data-f="num">' + num(c.n) + '</span><span class="foot">' + delta(c.n, p && p.n) + '<span>' + awaiting + ' waiting to pack</span></span>' + K.spark(sOrd, '#1a1410') + '</div>';
    h += '<div class="card kpi"><span class="lab">Average order</span><span class="val" data-cu="' + Math.round(c.aov) + '" data-f="inr">' + inr(Math.round(c.aov)) + '</span><span class="foot">' + delta(c.aov, p && p.aov) + '<span>per order</span></span></div>';
    h += '<div class="card kpi"><span class="lab">Bottles sold</span><span class="val" data-cu="' + c.bot + '" data-f="num">' + num(c.bot) + '</span><span class="foot">' + delta(c.bot, p && p.bot) + '<span>' + (c.n ? (c.bot / c.n).toFixed(1) : 0) + ' per order</span></span>' + K.spark(sBot, '#4aae4d') + '</div>';
    h += '<div class="card kpi"><span class="lab">Active orders</span><span class="val" data-cu="' + activeNow + '" data-f="num">' + num(activeNow) + '</span><span class="foot"><span class="tag2 pri">live</span><span>placed, packed or on the road</span></span></div>';
    h += '<div class="card kpi"><span class="lab">Customers</span><span class="val" data-cu="' + c.cust + '" data-f="num">' + num(c.cust) + '</span><span class="foot">' + delta(c.cust, p && p.cust) + '<span>ordering in range</span></span></div>';
    h += '</div>';
    var chips = '<div class="chips" role="group" aria-label="Metric">' + Object.keys(MET).map(function (k) { return '<button type="button" data-metric="' + k + '" aria-pressed="' + (S.metric === k) + '">' + MET[k].n + '</button>'; }).join('') + '</div>';
    h += '<div class="grid g21 mt">' + card('Sales trend', 'With a moving average and a straight-line trend', '<div class="chart" id="c-trend"></div><p class="sub" id="c-trend-note" style="margin-top:10px;font-size:.84rem"></p>', '', chips);
    h += card('Needs attention', 'Tap one to jump to it', attHtml(attention(all, S.data.stock))) + '</div>';
    var flBottles = FL.map(function (f) { return { name: f.name, color: f.c, value: live.reduce(function (s, o) { return s + (o.drinks[f.id] || 0); }, 0) }; });
    var stCount = K.STATUS.map(function (s) { return { name: s, color: K.STC[s], value: cur.filter(function (o) { return o.status === s; }).length }; });
    var ship = ['Normal', 'Premium'].map(function (s, i) { return { name: s + ' delivery', color: i ? '#ff8a2a' : '#4a8ea3', value: live.filter(function (o) { return o.ship === s; }).length }; });
    h += '<div class="grid g3 mt">' + card('Flavour mix', 'Bottles sold', '<div id="c-fl"></div>') + card('Order status', 'Orders in this range', '<div id="c-st"></div>') + card('Delivery type', 'Normal vs premium', '<div id="c-ship"></div>') + '</div>';
    h += '<div class="grid g3 mt">' + card('Top cities', 'Orders by city', '<div id="c-city"></div>') + card('Busiest weekdays', 'Orders by day of the week', '<div class="chart" id="c-wd"></div>') + card('Busiest hours', 'When people order (IST)', '<div id="c-hr"></div><p class="sub" id="c-hr-note" style="margin-top:12px"></p>') + '</div>';
    var recent = all.slice(0, 7);
    h += '<div class="grid g12 mt">' + card('Stock', 'Bottles on the shelf', stockMini()) + card('Latest orders', 'Newest first, updates by itself', '<div class="feed">' + (recent.length ? recent.map(function (o) { return '<button type="button" data-open="' + esc(o.id) + '" class="' + (S.flashIds[o.id] ? 'flash' : '') + '"><span class="av">' + esc(K.initials(o.name)) + '</span><span><b>' + esc(o.name) + '</b><small>' + esc(o.id) + ' · ' + K.ago(o.placedAt) + ' · ' + esc(o.city) + '</small></span><span style="text-align:right"><b class="num">' + inr(o.total) + '</b><br>' + stChip(o.status) + '</span></button>'; }).join('') : '<div class="empty">No orders yet. The first one will pop up here.</div>') + '</div>') + '</div>';
    mounts = [function () {
      var m = MET[S.metric], vals = S.metric === 'rev' ? sRev : S.metric === 'orders' ? sOrd : sBot, ma = K.sma(vals, 7), rg = K.regress(vals);
      var series = [{ name: m.n, color: m.c, values: vals, fill: true }]; if (vals.length >= 8) series.push({ name: '7-point average', color: '#4a8ea3', values: ma, dash: true, width: 2.5, nodot: true }); if (vals.length >= 3) series.push({ name: 'Trend', color: '#1a1410', values: vals.map(function (_, i) { return Math.max(0, rg.f(i)); }), dash: true, width: 2, nodot: true, hideTip: true });
      K.lineChart($('#c-trend'), { labels: bk.map(function (b) { return b.label; }), tlabels: bk.map(function (b) { return step === 1 ? K.fmtDate(b.a) : K.fmtDate(b.a) + ' to ' + K.fmtDate(b.b - 1); }), series: series, yfmt: m.y, tfmt: m.f, aria: m.n + ' over time' });
      $('#c-trend-note').innerHTML = vals.some(function (v) { return v > 0; }) ? slopeText(vals, step, S.metric) : 'No sales in this range yet.';
      K.donut($('#c-fl'), flBottles, { label: 'bottles' }); K.donut($('#c-st'), stCount, { label: 'orders' }); K.donut($('#c-ship'), ship, { label: 'orders' });
      var cm = {}; live.forEach(function (o) { var k = (o.city || 'Unknown').trim() || 'Unknown'; cm[k] = (cm[k] || 0) + 1; });
      K.hbars($('#c-city'), Object.keys(cm).map(function (k) { return { name: k, value: cm[k] }; }).sort(function (a, b) { return b.value - a.value; }).slice(0, 6), { color: '#ff8a2a' });
      var wd = [1, 2, 3, 4, 5, 6, 0].map(function (d) { return live.filter(function (o) { return K.dowOf(o.placedAt) === d; }).length; });
      K.colChart($('#c-wd'), { labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], values: wd, color: '#ffdc52', height: 200, hiMax: true, name: 'Orders', aria: 'Orders by weekday' });
      K.hourStrip($('#c-hr'), live); var hh = new Array(24).fill(0); live.forEach(function (o) { hh[K.hourOf(o.placedAt)]++; }); var pk = hh.indexOf(Math.max.apply(null, hh)); $('#c-hr-note').innerHTML = live.length ? 'Peak hour: <b>' + pk + ':00 to ' + ((pk + 1) % 24) + ':00</b>' : '';
      miniMeters();
    }];
    return h;
  }
  function stockMini() {
    var mx = Math.max.apply(null, S.data.stock.map(function (s) { return s.qty; }).concat([30]));
    return '<div class="hb">' + S.data.stock.map(function (s) { var f = K.flav(s.id); return '<div class="r"><span class="n">' + esc(f.name) + '</span><span class="bar"><i data-w="' + (s.qty / mx * 100).toFixed(1) + '" style="--c:' + f.c + '"></i></span><b>' + (s.missing ? '?' : s.qty <= 0 ? 'Sold out' : s.qty) + '</b></div>'; }).join('') + '</div><p class="sub" style="margin-top:12px">Low-stock alert at ' + K.LOW + ' bottles or fewer.</p>';
  }
  function miniMeters() { requestAnimationFrame(function () { requestAnimationFrame(function () { $$('i[data-w]').forEach(function (b) { b.style.width = b.getAttribute('data-w') + '%'; }); }); }); }

  /* ---------- orders */
  var PAGE = 15;
  function filtered() {
    var f = S.f, q = f.q.trim().toLowerCase(), win = S.range === 'all' ? null : K.rangeWindow(S.data.orders, S.range);
    var l = S.data.orders.filter(function (o) {
      if (win && !K.within(o, win.start, win.end)) return false;
      if (f.status && o.status !== f.status) return false; if (f.ship && o.ship !== f.ship) return false;
      if (f.pay && (f.pay === 'Paid' ? o.pay !== 'Paid' : o.pay === 'Paid')) return false;
      if (q && (o.id + ' ' + o.name + ' ' + o.email + ' ' + o.phone + ' ' + o.city + ' ' + o.pin + ' ' + o.items + ' ' + o.emailSent + ' ' + o.status).toLowerCase().indexOf(q) < 0) return false; return true;
    });
    l.sort(function (a, b) { return f.sort === 'old' ? a.placedAt - b.placedAt : f.sort === 'high' ? b.total - a.total : f.sort === 'low' ? a.total - b.total : b.placedAt - a.placedAt; });
    return l;
  }
  function orders() {
    var l = filtered(), pages = Math.max(1, Math.ceil(l.length / PAGE)); if (S.page > pages) S.page = pages;
    var rows = l.slice((S.page - 1) * PAGE, S.page * PAGE), f = S.f;
    var opt = function (arr, v) { return arr.map(function (a) { return '<option value="' + esc(a[0]) + '"' + (a[0] === v ? ' selected' : '') + '>' + esc(a[1]) + '</option>'; }).join(''); };
    var h = '<div class="tbar"><input type="search" id="f-q" placeholder="Search order, name, email, phone, city" value="' + esc(f.q) + '" aria-label="Search orders">' +
      '<select id="f-status" aria-label="Status">' + opt([['', 'All statuses']].concat(K.STATUS.map(function (s) { return [s, s]; })), f.status) + '</select>' +
      '<select id="f-ship" aria-label="Delivery">' + opt([['', 'Any delivery'], ['Normal', 'Normal'], ['Premium', 'Premium']], f.ship) + '</select>' +
      '<select id="f-pay" aria-label="Payment">' + opt([['', 'Any payment'], ['Paid', 'Paid'], ['Pending', 'Pending']], f.pay) + '</select>' +
      '<select id="f-sort" aria-label="Sort">' + opt([['new', 'Newest first'], ['old', 'Oldest first'], ['high', 'Highest total'], ['low', 'Lowest total']], f.sort) + '</select>' +
      '<button class="btn sec" type="button" id="csv">Export CSV</button></div>';
    var sum = l.reduce(function (s, o) { return s + (o.status === 'Cancelled' ? 0 : o.total); }, 0);
    h += '<p class="sub" style="margin:-4px 0 12px">' + num(l.length) + ' order' + (l.length === 1 ? '' : 's') + ' · ' + inr(sum) + ' (cancelled orders not counted)' + (S.range !== 'all' ? ' · range: ' + K.RANGES[S.range].label : '') + '</p>';
    h += '<div class="twrap"><table><thead><tr><th>Order</th><th>Placed</th><th>Customer</th><th>Items</th><th class="r">Total</th><th>Delivery</th><th>Payment</th><th>Status</th></tr></thead><tbody>' +
      (rows.length ? rows.map(function (o) { return '<tr data-open="' + esc(o.id) + '" class="' + (S.flashIds[o.id] ? 'flash' : '') + '" tabindex="0"><td><b class="num">' + esc(o.id) + '</b></td><td>' + K.fmtDate(o.placedAt) + '<span class="sm">' + K.fmtTime(o.placedAt) + '</span></td><td><b>' + esc(o.name) + '</b><span class="sm">' + esc(o.city) + '</span></td><td style="max-width:230px">' + esc(o.items) + (o.subId ? ' <span class="tag2 warn">' + esc(o.subId) + '</span>' : '') + '</td><td class="r"><b class="num">' + inr(o.total) + '</b></td><td>' + esc(o.ship) + '<span class="sm">' + esc(o.deliveryDate) + '</span></td><td><span class="tag2 ' + (o.pay === 'Paid' ? 'ok' : 'warn') + '">' + esc(o.pay) + '</span></td><td>' + stChip(o.status) + '</td></tr>'; }).join('') : '<tr><td colspan="8"><div class="empty">No orders match these filters.</div></td></tr>') + '</tbody></table></div>';
    h += '<div class="pager"><span>Page ' + S.page + ' of ' + pages + '</span><span class="sp"></span><button class="btn sec sm" type="button" data-pg="-1"' + (S.page <= 1 ? ' disabled' : '') + '>Previous</button><button class="btn sec sm" type="button" data-pg="1"' + (S.page >= pages ? ' disabled' : '') + '>Next</button></div>';
    mounts = []; return h;
  }
  function csvOut() {
    var rows = filtered(), head = ['Order ID', 'Placed at', 'Name', 'Email', 'Phone', 'Address', 'City', 'PIN', 'Delivery', 'Items', 'Subtotal', 'Discount', 'Delivery fee', 'Total', 'Payment', 'Status'];
    var q = function (v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var t = [head.join(',')].concat(rows.map(function (o) { return [o.id, new Date(o.placedAt).toISOString(), o.name, o.email, o.phone, o.address, o.city, o.pin, o.ship, o.items, o.subtotal, o.discount, o.shipFee, o.total, o.pay, o.status].map(q).join(','); })).join('\n');
    var a = D.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'text/csv' })); a.download = 'vitame-orders-' + K.dayKey(Date.now()) + '.csv'; D.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------- sales */
  function sales() {
    var all = S.data.orders, win = K.rangeWindow(all, S.range), cur = all.filter(function (o) { return K.within(o, win.start, win.end); }), live = K.liveOnly(cur);
    var step = S.gran === 'week' ? 7 : stepFor(win.days); if (S.gran === 'day') step = Math.min(step, S.range === 'all' && win.days > 120 ? 7 : step);
    var bk = K.buckets(live, win, step), lab = bk.map(function (b) { return b.label; });
    var rev = bk.map(function (b) { return K.revenueOf(b.orders); }), aov = bk.map(function (b) { return b.orders.length ? Math.round(K.revenueOf(b.orders) / b.orders.length) : 0; });
    var gran = '<div class="chips"><button type="button" data-gran="day" aria-pressed="' + (S.gran === 'day') + '">Auto</button><button type="button" data-gran="week" aria-pressed="' + (S.gran === 'week') + '">Weekly</button></div>';
    var h = '<div class="grid g21">' + card('Revenue', step === 1 ? 'Per day, with trend' : 'Per ' + (step === 7 ? 'week' : step + ' days') + ', with trend', '<div class="chart" id="s-rev"></div><p class="sub" id="s-note" style="margin-top:10px;font-size:.84rem"></p>', '', gran);
    var sub = live.reduce(function (s, o) { return s + o.subtotal; }, 0), dis = live.reduce(function (s, o) { return s + o.discount; }, 0), fee = live.reduce(function (s, o) { return s + o.shipFee; }, 0);
    h += card('Where the money comes from', 'Product sales, savings given, delivery fees', '<div id="s-money"></div><div class="money" style="margin-top:14px"><div><span>Product sales</span><b class="num">' + inr(sub) + '</b></div><div><span>Subscription savings</span><b class="num">-' + inr(dis) + '</b></div><div><span>Delivery fees</span><b class="num">' + inr(fee) + '</b></div><div class="t"><span>Revenue</span><b>' + inr(K.revenueOf(cur)) + '</b></div></div>') + '</div>';
    h += '<div class="grid g2 mt">' + card('Bottles by flavour', 'Stacked per period', '<div class="chart" id="s-fl"></div><div class="legend" style="grid-template-columns:repeat(2,1fr)">' + FL.map(function (f) { return '<div><i class="dot" style="background:' + f.c + '"></i>' + esc(f.name) + '</div>'; }).join('') + '</div>') + card('Average order value', 'Rupees per order', '<div class="chart" id="s-aov"></div>') + '</div>';
    var paid = live.filter(function (o) { return o.pay === 'Paid'; }).length, subs = live.filter(function (o) { return /\[subscription\]/i.test(o.items); }).length;
    var sizes = [['1 bottle', 1, 1], ['2 to 3', 2, 3], ['4 to 5', 4, 5], ['6 (a pack)', 6, 6], ['7 or more', 7, 999]].map(function (r) { return { name: r[0], value: live.filter(function (o) { var b = K.bottles(o); return b >= r[1] && b <= r[2]; }).length }; });
    h += '<div class="grid g3 mt">' + card('Payment', 'Paid online vs pending', '<div id="s-pay"></div>') + card('One-off vs subscription', 'Orders', '<div id="s-sub"></div>') + card('Basket size', 'Bottles per order', '<div id="s-size"></div>') + '</div>';
    h += '<div class="grid mt">' + card('When people order', 'Orders by weekday and hour (IST). Darker means busier.', '<div id="s-heat"></div>') + '</div>';
    mounts = [function () {
      var rg = K.regress(rev); K.lineChart($('#s-rev'), { labels: lab, tlabels: bk.map(function (b) { return K.fmtDate(b.a); }), series: [{ name: 'Revenue', color: '#ff8a2a', values: rev, fill: true }].concat(rev.length >= 3 ? [{ name: 'Trend', color: '#1a1410', values: rev.map(function (_, i) { return Math.max(0, rg.f(i)); }), dash: true, width: 2, nodot: true, hideTip: true }] : []), yfmt: inrc, tfmt: inr, height: 330, aria: 'Revenue' });
      $('#s-note').innerHTML = rev.some(function (v) { return v > 0; }) ? slopeText(rev, step, 'rev') : 'No sales in this range yet.';
      K.donut($('#s-money'), [{ name: 'Product sales', color: '#ff8a2a', value: Math.max(0, sub - dis) }, { name: 'Delivery fees', color: '#4a8ea3', value: fee }, { name: 'Savings given', color: '#e03442', value: dis }], { fmt: inr, label: 'gross' , centre: inr(sub + fee) });
      K.colChart($('#s-fl'), { labels: lab, tlabels: bk.map(function (b) { return K.fmtDate(b.a); }), stacks: FL.map(function (f) { return { name: f.name, color: f.c, values: bk.map(function (b) { return b.orders.reduce(function (s, o) { return s + (o.drinks[f.id] || 0); }, 0); }) }; }), height: 230, aria: 'Bottles by flavour' });
      K.lineChart($('#s-aov'), { labels: lab, tlabels: bk.map(function (b) { return K.fmtDate(b.a); }), series: [{ name: 'Average order', color: '#4aae4d', values: aov, fill: true }], yfmt: inrc, tfmt: inr, height: 230, aria: 'Average order value' });
      K.donut($('#s-pay'), [{ name: 'Paid', color: '#4aae4d', value: paid }, { name: 'Pending', color: '#ffdc52', value: live.length - paid }], { label: 'orders' });
      K.donut($('#s-sub'), [{ name: 'Subscription', color: '#ff8a2a', value: subs }, { name: 'One-off', color: '#4a8ea3', value: live.length - subs }], { label: 'orders' });
      K.hbars($('#s-size'), sizes, { color: '#ffdc52' }); K.heat($('#s-heat'), live);
    }];
    return h;
  }

  /* ---------- stock */
  function stock() {
    var all = S.data.orders, now = Date.now(), l14 = K.liveOnly(all).filter(function (o) { return now - o.placedAt < 14 * K.DAY; }), l7 = l14.filter(function (o) { return now - o.placedAt < 7 * K.DAY; });
    var h = '<div class="grid g4">' + S.data.stock.map(function (s) {
      var f = K.flav(s.id), sold7 = l7.reduce(function (a, o) { return a + (o.drinks[s.id] || 0); }, 0), sold14 = l14.reduce(function (a, o) { return a + (o.drinks[s.id] || 0); }, 0), sold = all.reduce(function (a, o) { return a + (o.status === 'Cancelled' ? 0 : (o.drinks[s.id] || 0)); }, 0);
      var rate = sold14 / 14, left = rate > 0 ? s.qty / rate : null, cls = s.qty <= 0 ? 'bad' : s.qty <= K.LOW ? 'warn' : 'ok', txt = s.missing ? 'Not in sheet' : s.qty <= 0 ? 'Sold out' : s.qty <= K.LOW ? 'Low stock' : 'In stock';
      return '<section class="card stk" style="--c:' + f.c + '"><div class="top2"><span class="bot"><i data-h="' + Math.min(100, s.qty * 2) + '"></i></span><div><h3>' + esc(f.name) + '</h3><span class="tag2 ' + cls + '" style="margin-top:6px">' + txt + '</span></div></div>' +
        '<div class="qty">' + (s.missing ? '?' : num(s.qty)) + '<small>bottles</small></div><div class="meter"><i data-w="' + Math.min(100, s.qty * 2) + '"></i></div>' +
        '<div class="stats"><div>Sold (7 days)<b>' + num(sold7) + '</b></div><div>Sold (all time)<b>' + num(sold) + '</b></div><div>Per day (14d)<b>' + rate.toFixed(1) + '</b></div><div>Runs out in<b>' + (s.qty <= 0 ? 'Sold out' : left == null ? 'n/a' : left < 1 ? '<1 day' : (Math.round(left) === 1 ? '1 day' : Math.round(left) + ' days')) + '</b></div></div>' +
        '<div class="fld"><label for="sq-' + s.id + '">Set stock (bottles)</label><div style="display:flex;gap:6px"><button class="ib" type="button" data-step="' + s.id + '|-1" aria-label="Minus one" style="width:40px;height:40px">−</button><input id="sq-' + s.id + '" type="number" min="0" max="99999" value="' + s.qty + '"><button class="ib" type="button" data-step="' + s.id + '|1" aria-label="Plus one">+</button></div></div>' +
        '<div class="fld"><label for="sb-' + s.id + '">Back in stock at (shown while sold out)</label><input id="sb-' + s.id + '" type="text" placeholder="e.g. 20 November, 12:00PM" value="' + esc(s.backAt) + '"></div>' +
        '<button class="btn" type="button" data-save="' + s.id + '">Save ' + esc(f.name) + '</button><p class="sub" data-msg="' + s.id + '" style="min-height:1.2em"></p></section>';
    }).join('') + '</div>';
    var sold = FL.map(function (f) { return { name: f.name, color: f.c, value: K.liveOnly(all).reduce(function (a, o) { return a + (o.drinks[f.id] || 0); }, 0) }; });
    var left = S.data.stock.map(function (s) { return { name: K.flav(s.id).name, color: K.flav(s.id).c, value: s.qty }; });
    h += '<div class="grid g2 mt">' + card('Sold, all time', 'Bottles per flavour', '<div id="k-sold"></div>') + card('Left on the shelf', 'Bottles per flavour', '<div id="k-left"></div>') + '</div>';
    h += '<p class="sub" style="margin-top:16px">Saving here changes the Stock sheet straight away, and the shop shows or hides the drink within seconds. Orders lower the stock by themselves.</p>';
    mounts = [function () { K.hbars($('#k-sold'), sold); K.hbars($('#k-left'), left); $$('.stk .bot i').forEach(function (b) { requestAnimationFrame(function () { b.style.height = b.getAttribute('data-h') + '%'; }); }); miniMeters(); }];
    return h;
  }

  /* ---------- customers */
  function customers() {
    var m = {}; S.data.orders.forEach(function (o) {
      var k = (o.email || '').toLowerCase(); if (!k) return; var c = m[k] || (m[k] = { email: k, name: o.name, phone: o.phone, city: o.city, orders: 0, live: 0, spent: 0, bottles: 0, first: o.placedAt, last: o.placedAt });
      c.orders++; if (o.status !== 'Cancelled') { c.live++; c.spent += o.total; c.bottles += K.bottles(o); } if (o.placedAt < c.first) c.first = o.placedAt; if (o.placedAt > c.last) { c.last = o.placedAt; c.name = o.name; c.phone = o.phone; c.city = o.city; }
    });
    var list = Object.keys(m).map(function (k) { return m[k]; }), q = S.cq.trim().toLowerCase();
    var rep = list.filter(function (c) { return c.live > 1; }).length, newc = list.length - rep;
    var sorted = list.filter(function (c) { return !q || (c.name + ' ' + c.email + ' ' + c.phone + ' ' + c.city).toLowerCase().indexOf(q) >= 0; }).sort(function (a, b) { return S.cs === 'orders' ? b.live - a.live : S.cs === 'last' ? b.last - a.last : b.spent - a.spent; });
    var h = '<div class="grid g3">' + card('New vs returning', 'Customers with 1 order vs 2 or more', '<div id="u-rep"></div>') + card('Top customers', 'By money spent', '<div id="u-top"></div>') + card('Customers by city', 'Latest delivery city', '<div id="u-city"></div>') + '</div>';
    h += '<div class="mt"></div><div class="tbar"><input type="search" id="c-q" placeholder="Search name, email, phone, city" value="' + esc(S.cq) + '" aria-label="Search customers"><select id="c-s" aria-label="Sort"><option value="spent"' + (S.cs === 'spent' ? ' selected' : '') + '>Most spent</option><option value="orders"' + (S.cs === 'orders' ? ' selected' : '') + '>Most orders</option><option value="last"' + (S.cs === 'last' ? ' selected' : '') + '>Latest order</option></select></div>';
    h += '<div class="twrap"><table><thead><tr><th>Customer</th><th>Contact</th><th>City</th><th class="r">Orders</th><th class="r">Bottles</th><th class="r">Spent</th><th>Last order</th></tr></thead><tbody>' + (sorted.length ? sorted.slice(0, 100).map(function (c) { return '<tr data-cust="' + esc(c.email) + '"><td><b>' + esc(c.name) + '</b>' + (c.live > 1 ? ' <span class="tag2 pri">repeat</span>' : '') + '</td><td>' + esc(c.email) + '<span class="sm">' + esc(c.phone) + '</span></td><td>' + esc(c.city) + '</td><td class="r num">' + c.live + '</td><td class="r num">' + c.bottles + '</td><td class="r"><b class="num">' + inr(c.spent) + '</b></td><td>' + K.fmtDate(c.last) + '<span class="sm">' + K.ago(c.last) + '</span></td></tr>'; }).join('') : '<tr><td colspan="7"><div class="empty">No customers match.</div></td></tr>') + '</tbody></table></div>';
    var cities = {}; list.forEach(function (c) { var k = c.city || 'Unknown'; cities[k] = (cities[k] || 0) + 1; });
    mounts = [function () {
      K.donut($('#u-rep'), [{ name: 'New (1 order)', color: '#ffdc52', value: newc }, { name: 'Returning', color: '#ff8a2a', value: rep }], { label: 'customers' });
      K.hbars($('#u-top'), list.slice().sort(function (a, b) { return b.spent - a.spent; }).slice(0, 5).map(function (c) { return { name: c.name, value: c.spent }; }), { fmt: inrc, color: '#4aae4d' });
      K.hbars($('#u-city'), Object.keys(cities).map(function (k) { return { name: k, value: cities[k] }; }).sort(function (a, b) { return b.value - a.value; }).slice(0, 6), { color: '#4a8ea3' });
    }];
    return h;
  }

  /* ---------- games and Pip */
  var STOP = 'the a an and or of to in is it i my me you your for on at do does can are be this that with what how which any there have has not no yes any'.split(' ');
  function games() {
    var b = S.data.board, games = ['slice', 'stack', 'smash'], names = { slice: 'Slice the Fruit', stack: 'Stack the bottles', smash: 'Smash the shelf' };
    var players = {}; b.forEach(function (r) { players[r.uid] = 1; });
    var plays = b.reduce(function (s, r) { return s + r.plays; }, 0);
    var h = '<div class="grid g4">' + [['Players', Object.keys(players).length], ['Total plays', plays], ['Scores saved', b.length], ['Pip questions', S.data.chats.length]].map(function (k, i) { return '<div class="card kpi' + (i === 0 ? ' c2' : '') + '"><span class="lab">' + k[0] + '</span><span class="val">' + num(k[1]) + '</span></div>'; }).join('') + '</div>';
    h += '<div class="grid g3 mt">' + games.map(function (g) {
      var rows = b.filter(function (r) { return r.game === g; }).sort(function (a, c) { return c.best - a.best; });
      return card(names[g], rows.length + ' player' + (rows.length === 1 ? '' : 's') + ' · ' + rows.reduce(function (s, r) { return s + r.plays; }, 0) + ' plays', rows.length ? '<div class="twrap" style="border-width:2px"><table><thead><tr><th>#</th><th>Player</th><th class="r">Best</th><th class="r">Plays</th></tr></thead><tbody>' + rows.slice(0, 5).map(function (r, i) { return '<tr style="cursor:default"><td class="num">' + (i + 1) + '</td><td>' + esc(r.name) + '<span class="sm">' + esc(r.uid) + '</span></td><td class="r"><b class="num">' + num(r.best) + '</b></td><td class="r num">' + r.plays + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="empty">No scores yet.</div>');
    }).join('') + '</div>';
    var words = {}; S.data.chats.forEach(function (c) { String(c.q).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).forEach(function (w) { if (w.length > 2 && STOP.indexOf(w) < 0) words[w] = (words[w] || 0) + 1; }); });
    h += '<div class="grid g12 mt">' + card('What people ask Pip', 'Most used words', '<div id="g-words"></div>') + card('Latest questions', 'Asked in the chat (the ones the AI handled)', S.data.chats.length ? '<div class="feed">' + S.data.chats.slice(0, 12).map(function (c) { return '<button type="button" style="cursor:default;grid-template-columns:1fr auto"><span><b style="font-weight:600">' + esc(c.q) + '</b><small>' + (c.at ? K.ago(c.at) : '') + '</small></span><span class="tag2">' + esc(c.page || 'site') + '</span></button>'; }).join('') + '</div>' : '<div class="empty">No questions logged yet. They show up once the Zapier agent answers one.</div>') + '</div>';
    mounts = [function () { K.hbars($('#g-words'), Object.keys(words).map(function (k) { return { name: k, value: words[k] }; }).sort(function (a, b2) { return b2.value - a.value; }).slice(0, 8), { color: '#ffdc52' }); }];
    return h;
  }

  /* ---------- store / system */
  function store() {
    var w = S.data.warehouse || {}, L = S.data.links || {};
    var h = '<div class="grid g3">';
    h += card('Warehouse', 'Where orders ship from', '<div class="kv"><span>Name</span><span>' + esc(w.name || '-') + '</span><span>Address</span><span>' + esc(w.address || '-') + '</span><span>Position</span><span class="num">' + (w.lat !== '' && w.lat != null ? esc(w.lat) + ', ' + esc(w.lng) : '-') + '</span></div><p class="sub" style="margin-top:12px">Change it in the Settings tab of the Orders sheet.</p>');
    h += card('Your sheets', 'The data behind this portal', '<div class="acts" style="flex-direction:column;align-items:stretch">' + [['Orders', L.orders], ['Stock', L.stock], ['Leaderboard', L.board]].map(function (x) { return '<a class="btn sec" ' + (x[1] && x[1] !== '#' ? 'href="' + esc(x[1]) + '" target="_blank" rel="noopener"' : 'href="#"') + '>Open ' + x[0] + ' sheet</a>'; }).join('') + '</div>');
    h += card('This portal', 'Connection and account', '<div class="kv"><span>Status</span><span>' + (S.online ? 'Connected' : 'Offline') + '</span><span>Last update</span><span>' + (S.lastSync ? K.ago(S.lastSync) : '-') + '</span><span>Script version</span><span class="num">' + esc(S.data.version || '-') + '</span><span>Orders stored</span><span class="num">' + num(S.data.orders.length) + '</span><span>Last order no.</span><span class="num">PP-' + esc(S.data.orderSeq || '-') + '</span><span>Signed in as</span><span>' + esc(sess ? sess.email : 'demo') + '</span></div><div class="acts" style="margin-top:14px"><button class="btn sec" type="button" id="snd">Sound: ' + (S.sound ? 'on' : 'off') + '</button><button class="btn dark" type="button" id="lo">Log out</button></div>') + '</div>';
    h += '<div class="grid g2 mt">' + card('Order statuses', 'What each status means', '<div class="legend">' + K.STATUS.map(function (s, i) { return '<div>' + stChip(s) + '<span style="opacity:.7">' + ['Order received, waiting to be packed', 'Packed and ready for the courier', 'On its way. The customer sees a live map.', 'Reached the customer', 'Cancelled (stock can be put back)'][i] + '</span></div>'; }).join('') + '</div>') +
      card('Change the admin login', 'The login is checked on the server', '<p class="sub" style="font-size:.88rem;line-height:1.55">Open the Apps Script project, then <b>Project settings > Script properties</b>, and add <b>ADMIN_EMAIL</b> and <b>ADMIN_PASSWORD</b>. They replace the defaults straight away. Pick a long password, because this page shows customer details.</p>') + '</div>';
    mounts = []; return h;
  }

  /* ================================================================== subscriptions */
  var SSC = { Active: '#4aae4d', Paused: '#ffdc52', Cancelled: '#e03442' };
  var CUT = 3; // days before delivery that the order is placed
  function subChip(s) { return '<span class="st" style="--c:' + (SSC[s] || '#999') + '">' + esc(s) + '</span>'; }
  function dn(iso) { return Math.floor(Date.parse(iso + 'T00:00:00Z') / 86400000); }
  function todayIso() { return K.dayKey(Date.now()); }
  function dLabel(iso) { return iso ? K.fmtDay(iso) : '-'; }
  function subsAll() { return (S.data && S.data.subs) || []; }
  function mixShort(s) { return FL.filter(function (f) { return s.mix && s.mix[f.id]; }).map(function (f) { return '<span class="dot" style="background:' + f.c + '"></span> ' + s.mix[f.id]; }).join(' &nbsp;'); }
  /** Orders the daily job places within the next `days` days, for every active subscription (repeat boxes included). */
  function packPlan(days) {
    var t = dn(todayIso()), need = {}, boxes = 0, list = [];
    FL.forEach(function (f) { need[f.id] = 0; });
    subsAll().forEach(function (s) {
      if (s.status !== 'Active' || !s.next) return;
      var n = dn(s.next) - CUT; // the day the order is placed
      while (n <= t + days) {
        if (n >= t) { boxes++; list.push({ s: s, day: n }); FL.forEach(function (f) { need[f.id] += (s.mix[f.id] || 0) * (s.boxes || 1); }); }
        n += s.freqDays || 14;
      }
    });
    return { need: need, boxes: boxes, list: list };
  }
  function monthly(s) { return s.status === 'Active' ? s.total * 30 / (s.freqDays || 14) : 0; }

  function subscriptions() {
    var subs = subsAll(), act = subs.filter(function (s) { return s.status === 'Active'; }), pau = subs.filter(function (s) { return s.status === 'Paused'; }), can = subs.filter(function (s) { return s.status === 'Cancelled'; });
    var mrr = act.reduce(function (a, s) { return a + monthly(s); }, 0), plan = packPlan(7), short = FL.filter(function (f) { var st = S.data.stock.filter(function (x) { return x.id === f.id; })[0]; return plan.need[f.id] > (st ? st.qty : 0); });
    var unlinked = S.data.orders.filter(function (o) { return /\[subscription\]/i.test(o.items) && !o.subId && o.status !== 'Cancelled'; });
    var retention = act.length + can.length ? Math.round(act.length / (act.length + can.length) * 100) : 100;
    var h = unlinked.length ? '<div class="card" style="background:var(--lemon);margin-bottom:18px;display:flex;flex-wrap:wrap;align-items:center;gap:12px"><b>' + unlinked.length + ' order' + (unlinked.length > 1 ? 's' : '') + ' with a subscription ' + (unlinked.length > 1 ? 'have' : 'has') + ' not been set up as a subscription yet</b> <span style="font-size:.86rem">(' + unlinked.slice(0, 4).map(function (o) { return esc(o.id); }).join(', ') + '). They were placed before subscriptions were switched on.</span><span class="sp" style="flex:1"></span><button class="btn sm" type="button" id="bf">Set them up</button></div>' : '';
    h += '<div class="grid g6">';
    h += '<div class="card kpi c1"><span class="lab">Active</span><span class="val" data-cu="' + act.length + '" data-f="num">' + act.length + '</span><span class="foot"><span>boxes on repeat</span></span></div>';
    h += '<div class="card kpi c2"><span class="lab">Per month</span><span class="val" data-cu="' + Math.round(mrr) + '" data-f="inr">' + inr(Math.round(mrr)) + '</span><span class="foot"><span>recurring revenue</span></span></div>';
    h += '<div class="card kpi"><span class="lab">To pack, 7 days</span><span class="val" data-cu="' + plan.boxes + '" data-f="num">' + plan.boxes + '</span><span class="foot"><span>' + FL.reduce(function (a, f) { return a + plan.need[f.id]; }, 0) + ' bottles</span></span></div>';
    h += '<div class="card kpi"><span class="lab">Paused</span><span class="val" data-cu="' + pau.length + '" data-f="num">' + pau.length + '</span><span class="foot"><span>on a break</span></span></div>';
    h += '<div class="card kpi"><span class="lab">Cancelled</span><span class="val" data-cu="' + can.length + '" data-f="num">' + can.length + '</span><span class="foot"><span>' + retention + '% kept</span></span></div>';
    h += '<div class="card kpi"><span class="lab">Skipped</span><span class="val" data-cu="' + subs.reduce(function (a, s) { return a + s.skipped; }, 0) + '" data-f="num">' + subs.reduce(function (a, s) { return a + s.skipped; }, 0) + '</span><span class="foot"><span>deliveries skipped</span></span></div>';
    h += '</div>';
    var run = '<button class="btn dark sm" type="button" id="runjob">Run the daily job now</button>';
    h += '<div class="grid g21 mt">' + card('What is coming', 'Subscription deliveries by date, next 4 weeks', '<div class="chart" id="sb-due"></div><p class="sub" style="margin-top:10px;font-size:.84rem">The job places each order ' + CUT + ' days before delivery, every morning at 7. It also emails the reminders.</p>', '', run);
    var needRows = FL.map(function (f) { var st = S.data.stock.filter(function (x) { return x.id === f.id; })[0], have = st ? st.qty : 0, need = plan.need[f.id]; return '<tr style="cursor:default"><td><i class="dot" style="background:' + f.c + '"></i> ' + esc(f.name) + '</td><td class="r num">' + need + '</td><td class="r num">' + have + '</td><td>' + (need > have ? '<span class="tag2 bad">Short by ' + (need - have) + '</span>' : '<span class="tag2 ok">Covered</span>') + '</td></tr>'; }).join('');
    h += card('Stock for the next 7 days', 'Bottles the subscription orders will need', '<div class="twrap" style="border-width:2px"><table><thead><tr><th>Flavour</th><th class="r">Needed</th><th class="r">In stock</th><th>Status</th></tr></thead><tbody>' + needRows + '</tbody></table></div>' + (short.length ? '<p class="sub" style="margin-top:10px;font-weight:600;color:var(--beet)">Restock ' + short.map(function (f) { return esc(f.name); }).join(', ') + ' so the boxes can be packed.</p>' : '')) + '</div>';
    var fq = { weekly: 0, fortnight: 0, monthly: 0 }; act.concat(pau).forEach(function (s) { fq[s.freq] = (fq[s.freq] || 0) + 1; });
    var sz = {}; act.concat(pau).forEach(function (s) { var k = s.size + ' bottles'; sz[k] = (sz[k] || 0) + 1; });
    h += '<div class="grid g3 mt">' + card('Status', 'All subscriptions', '<div id="sb-st"></div>') + card('Rhythm', 'Active and paused', '<div id="sb-fq"></div>') + card('Box size', 'Active and paused', '<div id="sb-sz"></div>') + '</div>';
    var f = S.sf || (S.sf = { q: '', status: '' });
    var q = f.q.trim().toLowerCase(), rows = subs.filter(function (s) { return (!f.status || s.status === f.status) && (!q || (s.id + ' ' + s.name + ' ' + s.email + ' ' + s.city + ' ' + s.phone).toLowerCase().indexOf(q) >= 0); }).sort(function (a, b) { var o = { Active: 0, Paused: 1, Cancelled: 2 }; return o[a.status] - o[b.status] || (a.next || '').localeCompare(b.next || ''); });
    h += '<div class="mt"></div><div class="tbar"><input type="search" id="sf-q" placeholder="Search subscription, name, email, city" value="' + esc(f.q) + '" aria-label="Search subscriptions"><select id="sf-s" aria-label="Status"><option value="">All statuses</option>' + ['Active', 'Paused', 'Cancelled'].map(function (x) { return '<option' + (f.status === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></div>';
    h += '<div class="twrap"><table><thead><tr><th>Subscription</th><th>Customer</th><th>Box</th><th>Rhythm</th><th>Next delivery</th><th class="r">Per delivery</th><th class="r">Delivered</th><th>Status</th></tr></thead><tbody>' + (rows.length ? rows.map(function (s) {
      return '<tr data-sub-open="' + esc(s.id) + '" tabindex="0"><td><b class="num">' + esc(s.id) + '</b>' + (s.attn ? ' <span class="tag2 bad">Needs attention</span>' : '') + '</td><td><b>' + esc(s.name) + '</b><span class="sm">' + esc(s.city) + '</span></td><td>' + mixShort(s) + '<span class="sm">' + s.size + ' bottles' + (s.boxes > 1 ? ' × ' + s.boxes : '') + '</span></td><td>' + esc(s.freqLabel) + '</td><td>' + (s.status === 'Cancelled' ? '-' : s.status === 'Paused' ? 'Paused' + (s.resume ? '<span class="sm">until ' + dLabel(s.resume) + '</span>' : '') : dLabel(s.next) + '<span class="sm">' + (s.daysToNext === 0 ? 'today' : s.daysToNext === 1 ? 'tomorrow' : 'in ' + s.daysToNext + ' days') + '</span>') + '</td><td class="r"><b class="num">' + inr(s.total) + '</b></td><td class="r num">' + s.done + (s.skipped ? '<span class="sm">' + s.skipped + ' skipped</span>' : '') + '</td><td>' + subChip(s.status) + '</td></tr>';
    }).join('') : '<tr><td colspan="8"><div class="empty">No subscriptions yet. They appear here as soon as a customer subscribes at checkout.</div></td></tr>') + '</tbody></table></div>';
    mounts = [function () {
      var t = dn(todayIso()), days = []; for (var i = 0; i < 28; i++) days.push(t + i);
      var cnt = days.map(function () { return 0; }), bt = days.map(function () { return 0; });
      act.forEach(function (s) { var n = dn(s.next); while (n < t + 28) { if (n >= t) { cnt[n - t]++; bt[n - t] += s.size * (s.boxes || 1); } n += s.freqDays || 14; } });
      var lab = days.map(function (d) { return K.fmtDay(new Date(d * 86400000).toISOString().slice(0, 10)); });
      K.colChart($('#sb-due'), { labels: lab, values: cnt, color: '#ff8a2a', height: 240, hiMax: true, name: 'Deliveries', aria: 'Subscription deliveries by date', tlabels: lab, tfmt: function (v) { return v + (v === 1 ? ' box' : ' boxes'); } });
      K.donut($('#sb-st'), [{ name: 'Active', color: '#4aae4d', value: act.length }, { name: 'Paused', color: '#ffdc52', value: pau.length }, { name: 'Cancelled', color: '#e03442', value: can.length }], { label: 'boxes' });
      K.donut($('#sb-fq'), [{ name: 'Every week', color: '#e03442', value: fq.weekly }, { name: 'Every 2 weeks', color: '#ff8a2a', value: fq.fortnight }, { name: 'Every 4 weeks', color: '#4a8ea3', value: fq.monthly }], { label: 'boxes' });
      var pal = ['#ffdc52', '#ff8a2a', '#4aae4d', '#4a8ea3', '#e03442'];
      K.donut($('#sb-sz'), Object.keys(sz).sort().map(function (k, i) { return { name: k, color: pal[i % pal.length], value: sz[k] }; }), { label: 'boxes' });
    }];
    return h;
  }

  function subDrawer(id, keep) {
    var s = subsAll().filter(function (x) { return x.id === id; })[0], dr = $('#drawer'); if (!s) return;
    if (!keep && (!S.sMsg || S.sMsg.id !== id)) S.sMsg = null;
    S.openSub = id; S.openId = null;
    var related = S.data.orders.filter(function (o) { return o.subId && o.subId.indexOf(id) >= 0; });
    var g = s.status === 'Cancelled', pa = s.status === 'Paused', ac = s.status === 'Active';
    var h = '<div class="dh"><div><small style="font:700 .66rem var(--fp);letter-spacing:.14em;text-transform:uppercase;opacity:.7">Subscription</small><h2>' + esc(s.id) + '</h2></div><span class="sp"></span>' + subChip(s.status) + '<button class="x" type="button" data-close aria-label="Close">×</button></div><div class="db">';
    h += '<div class="box"><h4>Box · ' + s.size + ' bottles' + (s.boxes > 1 ? ' × ' + s.boxes + ' boxes' : '') + '</h4>' + FL.filter(function (f) { return s.mix[f.id]; }).map(function (f) { return '<div class="itm"><i class="dot" style="background:' + f.c + '"></i>' + esc(f.name) + '<b>× ' + s.mix[f.id] + '</b></div>'; }).join('') + '<div class="money" style="margin-top:10px"><div><span>Per delivery</span><b class="num">' + inr(s.price) + '</b></div><div><span>' + esc(s.ship) + ' delivery</span><b class="num">' + (s.fee ? inr(s.fee) : 'Free') + '</b></div><div class="t"><span>Total per delivery</span><b>' + inr(s.total) + '</b></div></div></div>';
    h += '<div class="box"><h4>Schedule</h4><div class="kv"><span>Rhythm</span><span>' + esc(s.freqLabel) + '</span><span>Next delivery</span><span>' + (g ? '-' : pa ? 'Paused' + (s.resume ? ', restarts ' + dLabel(s.resume) : '') : '<b>' + dLabel(s.next) + '</b> (' + (s.daysToNext === 0 ? 'today' : s.daysToNext + ' days') + ')') + '</span><span>Customer can change until</span><span>' + (ac ? dLabel(s.changeUntil) + (s.canChange ? '' : ' (locked)') : '-') + '</span><span>Delivered</span><span>' + s.done + ' (' + s.skipped + ' skipped)</span>' + (s.attn ? '<span>Needs attention</span><span style="color:var(--beet);font-weight:600">' + esc(s.attn) + '</span>' : '') + (s.notes ? '<span>Note</span><span>' + esc(s.notes) + '</span>' : '') + '</div></div>';
    if (!g) h += '<div class="box"><h4>Do something</h4><div class="acts">' + (ac ? '<button class="btn sm" type="button" data-sop="skip">Skip next</button><button class="btn sm sec" type="button" data-sop="pause">Pause</button>' : '') + (pa ? '<button class="btn sm" type="button" data-sop="resume">Resume</button>' : '') + '<button class="btn sm sec" type="button" data-sop="cancel" style="color:#e03442">Cancel</button></div>' +
      '<div class="fld" style="margin-top:12px"><label for="sd-date">Move the next delivery to</label><div style="display:flex;gap:8px"><input id="sd-date" type="date" value="' + esc(s.next || '') + '"><button class="btn sm" type="button" data-sop="next">Move</button></div></div><div id="sd-confirm"></div><p class="sub" id="sd-msg" style="min-height:1.2em;margin-top:8px">' + (S.sMsg && S.sMsg.id === id ? esc(S.sMsg.text) : '') + '</p></div>';
    h += '<div class="box"><h4>Customer</h4><div class="kv"><span>Name</span><span><b>' + esc(s.name) + '</b></span><span>Email</span><span><a href="mailto:' + esc(s.email) + '">' + esc(s.email) + '</a></span><span>Phone</span><span><a href="tel:' + esc(s.phone) + '">' + esc(s.phone) + '</a></span><span>Address</span><span>' + esc(s.address) + ', ' + esc(s.city) + ' ' + esc(s.pin) + '</span></div></div>';
    h += '<div class="box"><h4>Orders from this subscription · ' + related.length + '</h4>' + (related.length ? related.slice(0, 12).map(function (o) { return '<button type="button" data-open="' + esc(o.id) + '" class="itm" style="width:100%;background:none;border:0;border-top:1px dashed var(--line);text-align:left;cursor:pointer"><b class="num" style="margin-left:0">' + esc(o.id) + '</b><span style="color:var(--mut)">' + K.fmtDate(o.placedAt) + '</span>' + stChip(o.status) + '</button>'; }).join('') : '<p class="sub">No orders yet.</p>') + '</div></div>';
    dr.innerHTML = h; dr.classList.add('on'); $('#veil').classList.add('on'); dr.setAttribute('aria-hidden', 'false'); if (!keep) dr.scrollTop = 0;
  }
  function subOp(id, op, extra) {
    var msg = $('#sd-msg'); if (msg) msg.textContent = 'Saving...';
    return api('admin_sub', Object.assign({ id: id, op: op }, extra || {})).then(function (j) {
      if (j && j.auth === false) { logout(true); return j; }
      if (j && j.ok && j.sub) {
        var i = S.data.subs.findIndex(function (x) { return x.id === id; }); if (i >= 0) S.data.subs[i] = Object.assign({}, S.data.subs[i], j.sub);
        S.sMsg = { id: id, text: ({ skip: 'Skipped. Next delivery ' + dLabel(j.sub.next) + '.', pause: 'Paused.', resume: 'Resumed. Next delivery ' + dLabel(j.sub.next) + '.', cancel: 'Cancelled.', next: 'Moved to ' + dLabel(j.sub.next) + '.' })[op] || 'Saved.' };
        S.anim = false; render(); subDrawer(id, true); load(true);
      } else { S.sMsg = { id: id, text: (j && j.error) || 'Could not save.' }; var m2 = $('#sd-msg'); if (m2) m2.textContent = S.sMsg.text; }
      return j;
    });
  }
  function runJob(btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Running...'; }
    return api('admin_sub', { op: 'run' }).then(function (j) {
      if (btn) { btn.disabled = false; btn.textContent = 'Run the daily job now'; }
      if (j && j.auth === false) return logout(true);
      if (j && j.ok) { var r = j.result || {}; toast({ title: 'Daily job done', text: (r.orders || 0) + ' orders placed, ' + (r.reminders || 0) + ' reminders, ' + (r.short || 0) + ' short on stock' + (r.imported ? ', ' + r.imported + ' subscription' + (r.imported > 1 ? 's' : '') + ' set up from earlier orders' : '') }); load(true); }
      else toast({ title: 'Could not run it', text: (j && j.error) || 'Try again.' });
    });
  }

  /* ================================================================== order drawer */
  function drawer(id, keep) {
    var o = (S.data.orders || []).filter(function (x) { return x.id === id; })[0], dr = $('#drawer'); if (!o) return;
    if (!keep && (!S.stMsg || S.stMsg.id !== id)) S.stMsg = null; S.openId = id; var h;
    var steps = ['Placed', 'Packed', 'Out for delivery', 'Delivered'], idx = steps.indexOf(o.status), canc = o.status === 'Cancelled';
    h = '<div class="dh"><div><small style="font:700 .66rem var(--fp);letter-spacing:.14em;text-transform:uppercase;opacity:.7">Order</small><h2>' + esc(o.id) + '</h2></div><span class="sp"></span>' + stChip(o.status) + '<button class="x" type="button" data-close aria-label="Close">×</button></div><div class="db">';
    h += '<div class="box"><h4>Progress</h4>' + (canc ? '<p style="margin:0"><b>This order was cancelled.</b></p>' : '<div class="tl">' + steps.map(function (s, i) { return '<div class="s ' + (i < idx || o.status === 'Delivered' ? 'done' : i === idx ? 'now' : '') + '"><i></i>' + (s === 'Out for delivery' ? 'On the road' : s) + '<small>' + (i === 0 ? K.fmtTime(o.placedAt) : i === 3 && o.deliveredAt ? K.fmtDate(o.deliveredAt) : '') + '</small></div>'; }).join('') + '</div>') + '</div>';
    h += '<div class="box"><h4>Move this order</h4>' + (o.loc && isFinite(o.loc.lat) ? '<p class="lp-now">Shown on the customer\'s map: <b>' + esc(o.loc.label || 'Pinned location') + '</b>' + (o.loc.at ? ' · ' + K.fmtDT(o.loc.at) : '') + '</p>' : '') + '<div class="acts" id="st-acts">' + K.STATUS.filter(function (s) { return s !== o.status; }).map(function (s) { return '<button class="btn sm ' + (s === 'Cancelled' ? 'sec' : '') + '" type="button" data-set="' + esc(s) + '"' + (s === 'Cancelled' ? ' style="color:#e03442"' : '') + '>' + (s === 'Out for delivery' ? 'Send out' : s === 'Cancelled' ? 'Cancel order' : 'Mark ' + s.toLowerCase()) + '</button>'; }).join('') + (K.active(o) ? '<button class="btn sm sec" type="button" data-loc="1">Update location</button>' : '') + '</div><div id="st-confirm"></div><p class="sub" id="st-msg" style="min-height:1.2em;margin-top:8px">' + (S.stMsg && S.stMsg.id === id ? esc(S.stMsg.text) : '') + '</p></div>';
    h += '<div class="box"><h4>Customer</h4><div class="kv"><span>Name</span><span><b>' + esc(o.name) + '</b></span><span>Email</span><span><a href="mailto:' + esc(o.email) + '">' + esc(o.email) + '</a></span><span>Phone</span><span><a href="tel:' + esc(o.phone) + '">' + esc(o.phone) + '</a></span><span>Address</span><span>' + esc(o.address) + ', ' + esc(o.city) + ' ' + esc(o.pin) + ' <a href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(o.address + ', ' + o.city + ' ' + o.pin) + '" target="_blank" rel="noopener">Map</a></span><span>Delivery</span><span>' + esc(o.ship) + ', arriving ' + esc(o.deliveryDate) + '</span>' + (o.courier ? '<span>Courier</span><span>' + esc(o.courier) + '</span>' : '') + '</div></div>';
    var items = FL.filter(function (f) { return o.drinks[f.id]; });
    h += '<div class="box"><h4>Items · ' + K.bottles(o) + ' bottles</h4>' + (items.length ? items.map(function (f) { return '<div class="itm"><i class="dot" style="background:' + f.c + '"></i>' + esc(f.name) + '<b>× ' + o.drinks[f.id] + '</b></div>'; }).join('') : '') + '<p class="sub" style="margin-top:8px">' + esc(o.items) + '</p></div>';
    h += '<div class="box"><h4>Money</h4><div class="money"><div><span>Subtotal</span><b class="num">' + inr(o.subtotal) + '</b></div>' + (o.discount ? '<div><span>Subscription savings</span><b class="num">-' + inr(o.discount) + '</b></div>' : '') + '<div><span>' + esc(o.ship) + ' delivery</span><b class="num">' + (o.shipFee ? inr(o.shipFee) : 'Free') + '</b></div><div class="t"><span>Total</span><b>' + inr(o.total) + '</b></div><div><span>Payment</span><span class="tag2 ' + (o.pay === 'Paid' ? 'ok' : 'warn') + '">' + esc(o.pay) + (o.payId ? ' · ' + esc(o.payId) : '') + '</span></div></div></div>';
    h += '<div class="box"><h4>System</h4><div class="kv"><span>Placed</span><span>' + K.fmtDT(o.placedAt) + '</span><span>Email</span><span>' + esc(o.emailSent || '-') + '</span><span>SMS</span><span>' + esc(o.smsSent || '-') + '</span><span>Stock sheet</span><span>' + esc(o.stockUpd || '-') + '</span></div></div></div>';
    dr.innerHTML = h; dr.classList.add('on'); $('#veil').classList.add('on'); dr.setAttribute('aria-hidden', 'false');
    if (S.lp && S.lp.id === id) lpPaint(); else S.lp = null;
    if (!keep) dr.scrollTop = 0;
  }
  function closeDrawer() { S.lp = null; S.openId = null; S.openSub = null; $('#drawer').classList.remove('on'); $('#veil').classList.remove('on'); $('#drawer').setAttribute('aria-hidden', 'true'); }
  function statusOp(id, status, extra) {
    return api('admin_status', Object.assign({ id: id, status: status }, extra || {})).then(function (j) {
      if (j && j.auth === false) { logout(true); return j; }
      if (j && j.ok) S.data.orders.forEach(function (o) { if (o.id === id) { o.status = status; if (status === 'Delivered') o.deliveredAt = Date.now(); } });
      return j;
    });
  }
  function stockOp(id, qty, backAt) {
    return api('admin_stock', { id: id, qty: qty, backAt: backAt == null ? undefined : backAt }).then(function (j) {
      if (j && j.auth === false) { logout(true); return j; }
      if (j && j.ok) { var s = S.data.stock.filter(function (x) { return x.id === id; })[0]; if (s) { s.qty = qty; if (backAt != null) s.backAt = backAt; s.status = qty > 0 ? 'In stock' : 'Out of stock'; } }
      return j;
    });
  }
  function refreshAfter() { S.anim = false; render(); if (S.openId) drawer(S.openId, true); load(true); }
  function setRange(k) { if (K.RANGES[k]) { S.range = k; S.page = 1; S.anim = true; render(true); } }
  function setStatus(id, status, extra) {
    var msg = $('#st-msg'); if (msg) msg.textContent = 'Saving...'; $$('#st-acts button').forEach(function (b) { b.disabled = true; });
    api('admin_status', Object.assign({ id: id, status: status }, extra || {})).then(function (j) {
      if (j && j.auth === false) return logout(true);
      if (!j || !j.ok) { if (msg) msg.textContent = (j && j.error) || 'Could not save. Try again.'; $$('#st-acts button').forEach(function (b) { b.disabled = false; }); return; }
      S.data.orders.forEach(function (o) { if (o.id === id) { o.status = status; if (extra && extra.courier) o.courier = extra.courier; if (extra && extra.lat != null) o.loc = locOf(extra); if (status === 'Delivered') o.deliveredAt = Date.now(); } });
      var mailTxt = status !== 'Out for delivery' ? '' : j.mail === 'sent' ? ' Customer emailed.' : /^failed/i.test(j.mail || '') ? ' The customer email did not send (' + j.mail + ').' : ' The customer email was not sent: the Apps Script needs the latest Code.gs.';
      S.lp = null; S.stMsg = { id: id, text: 'Saved. Now ' + status.toLowerCase() + (extra && extra.lat != null ? ', at ' + (extra.locLabel || 'the new location') : '') + (j.restocked ? '. Stock put back: ' + j.restocked : '') + '.' + mailTxt }; render(false); drawer(id, true);
      load(true);
    });
  }
  function locOf(x) { return { lat: x.lat, lng: x.lng, label: x.locLabel || '', at: Date.now(), src: 'admin' }; }
  function setLocation(id, extra) {
    var msg = $('#st-msg'); if (msg) msg.textContent = 'Saving...'; $$('#st-acts button, #lp-save, #lp-back').forEach(function (b) { b.disabled = true; });
    api('admin_location', Object.assign({ id: id }, extra)).then(function (j) {
      if (j && j.auth === false) return logout(true);
      if (!j || !j.ok) { if (msg) msg.textContent = (j && j.error) || 'Could not save. Try again.'; $$('#st-acts button, #lp-save, #lp-back').forEach(function (b) { b.disabled = false; }); return; }
      S.data.orders.forEach(function (o) { if (o.id === id) o.loc = locOf(extra); });
      S.lp = null; S.stMsg = { id: id, text: 'Location updated' + (extra.locLabel ? ': ' + extra.locLabel : '') + '. The customer\'s map moves on its next refresh.' }; render(false); drawer(id, true);
      load(true);
    });
  }

  /* ================================================================== location for each step */
  var LP_TITLE = { 'Placed': 'Mark placed', 'Packed': 'Mark packed', 'Out for delivery': 'Send out', 'Delivered': 'Mark delivered' };
  var LP_HINT = { 'Placed': 'Where the order is right now. The customer sees it on their live map.', 'Packed': 'Where the packed order is waiting. The customer sees it on their live map.', 'Out for delivery': 'Where the order is as it leaves. The customer sees it on their live map and is emailed that it is out for delivery.', 'Delivered': 'Where the order was handed over.' };
  function gotCoords(x) { return x && x.lat != null && x.lng != null && x.lat !== '' && x.lng !== '' && isFinite(Number(x.lat)) && isFinite(Number(x.lng)); }
  function whPoint() { var w = (S.data && S.data.warehouse) || {}; return gotCoords(w) ? { lat: Number(w.lat), lng: Number(w.lng), label: w.name || 'Vitame Warehouse' } : null; }
  function destPoint(o) { return o && gotCoords(o.dest) ? { lat: Number(o.dest.lat), lng: Number(o.dest.lng), label: 'Delivery address' } : null; }
  function mapToken() { return (W.PP && W.PP.mapboxToken) || ''; }
  function geoSearch(q, near) {
    var tk = mapToken(); if (!tk || q.length < 3) return Promise.resolve([]);
    var url = 'https://api.mapbox.com/geocoding/v5/mapbox.places/' + encodeURIComponent(q) + '.json?country=in&limit=5&autocomplete=true&access_token=' + encodeURIComponent(tk) + (near ? '&proximity=' + near.lng + ',' + near.lat : '');
    return fetch(url).then(function (r) { return r.json(); }).then(function (j) { return (j.features || []).filter(function (f) { return f && f.center; }).map(function (f) { return { lat: f.center[1], lng: f.center[0], label: String(f.place_name || f.text || '').slice(0, 80) }; }); }).catch(function () { return []; });
  }
  function lpPick(mode) {
    var s = S.lp, o = (S.data.orders || []).filter(function (x) { return x.id === s.id; })[0], p = null; s.mode = mode;
    s.err = ''; if (mode === 'pick') { s.lat = null; s.lng = null; s.label = ''; s.q = ''; s.res = []; s.searched = false; }
    if (mode === 'wh') p = whPoint(); else if (mode === 'dest') p = destPoint(o); else if (mode === 'keep' && o && o.loc) p = null;
    if (p) { s.lat = p.lat; s.lng = p.lng; s.label = p.label; } else if (mode !== 'pick') { s.lat = null; s.lng = null; if (mode === 'keep') s.label = ''; }
    if (mode === 'dest' && !p && o) { s.busy = true; lpPaint(); geoSearch([o.address, o.city, o.pin].filter(Boolean).join(', '), whPoint()).then(function (r) { if (!S.lp || S.lp !== s || s.mode !== 'dest') return; s.busy = false; if (r[0]) { s.lat = r[0].lat; s.lng = r[0].lng; s.label = 'Delivery address'; } else s.err = 'Could not find the address on the map. Use Pick a place.'; lpPaint(); }); return; }
    lpPaint();
  }
  function lpOpen(id, status, only) {
    var o = (S.data.orders || []).filter(function (x) { return x.id === id; })[0]; if (!o) return;
    S.lp = { id: id, status: status, only: !!only, mode: '', lat: null, lng: null, label: '', q: '', res: [], err: '', busy: false, courier: o.courier || '' };
    lpPick(only && o.loc ? 'keep' : status === 'Delivered' ? 'dest' : (whPoint() ? 'wh' : 'pick'));
  }
  function lpPaint() {
    var s = S.lp, c = $('#st-confirm'); if (!s || !c) return;
    var o = (S.data.orders || []).filter(function (x) { return x.id === s.id; })[0] || {}, wh = whPoint(), tk = mapToken();
    var modes = [['wh', 'Warehouse', !!wh], ['dest', 'Customer address', true], ['pick', 'Pick a place', !!tk]]; if (o.loc && gotCoords(o.loc)) modes.unshift(['keep', 'Keep current', true]);
    var h = '<div class="box lp"><b>' + esc(s.only ? 'Update location' : LP_TITLE[s.status] || s.status) + ' · ' + esc(s.id) + '</b><p class="sub" style="margin:6px 0 0">' + esc(s.only ? 'Move the order on the customer\'s live map without changing its status.' : LP_HINT[s.status] || '') + '</p>';
    h += '<div class="chips" role="group" aria-label="Location">' + modes.filter(function (m) { return m[2]; }).map(function (m) { return '<button type="button" data-lpm="' + m[0] + '" aria-pressed="' + (s.mode === m[0]) + '">' + m[1] + '</button>'; }).join('') + '</div>';
    if (s.mode === 'pick') h += '<div class="fld"><label for="lp-q">Search a place</label><input id="lp-q" type="search" autocomplete="off" placeholder="e.g. Indore sorting hub, Vijay Nagar" value="' + esc(s.q) + '"></div><div class="lp-res" id="lp-res">' + lpResHtml(s) + '</div>';
    if (s.busy) h += '<p class="sub" style="margin:10px 0 0">Finding the address...</p>';
    else if (gotCoords(s) && s.mode !== 'keep') h += '<div class="fld"><label for="lp-label">Name shown to the customer</label><input id="lp-label" type="text" maxlength="80" value="' + esc(s.label) + '"></div><p class="sub num" style="margin:6px 0 0">' + Number(s.lat).toFixed(5) + ', ' + Number(s.lng).toFixed(5) + '</p>';
    else if (s.mode === 'keep') h += '<p class="sub" style="margin:10px 0 0">The map stays at <b>' + esc(o.loc && o.loc.label || 'its current pin') + '</b>.</p>';
    else if (s.mode !== 'pick') h += '<p class="sub" style="margin:10px 0 0">' + esc(s.mode === 'wh' ? 'The warehouse position is not set yet. Use Pick a place.' : 'The address is not on the map yet. Use Pick a place.') + '</p>';
    if (s.err) h += '<p class="sub" style="margin:8px 0 0;color:#e03442">' + esc(s.err) + '</p>';
    if (s.status === 'Out for delivery' && !s.only) h += '<div class="fld"><label for="lp-courier">Courier name (optional)</label><input id="lp-courier" type="text" maxlength="40" value="' + esc(s.courier) + '"></div>';
    var go = s.only ? 'Update location' : LP_TITLE[s.status] || 'Save';
    h += '<div class="acts" style="margin-top:12px"><button class="btn sm" type="button" id="lp-save"' + (s.busy || (s.only && !gotCoords(s)) ? ' disabled' : '') + '>' + esc(go) + '</button><button class="btn sm sec" type="button" id="lp-back">Back</button></div></div>';
    c.innerHTML = h;
  }
  function lpResHtml(s) { return (s.res || []).map(function (r, i) { return '<button type="button" data-lpr="' + i + '">' + esc(r.label) + '</button>'; }).join('') || (s.q.length >= 3 && s.searched ? '<p class="sub" style="margin:0">No match. Try a nearby landmark or area.</p>' : ''); }
  function lpSave() {
    var s = S.lp; if (!s) return; var extra = {};
    if (s.status === 'Out for delivery' && !s.only) { var cn = $('#lp-courier'); if (cn && cn.value.trim()) extra.courier = cn.value.trim(); }
    if (s.mode !== 'keep' && gotCoords(s)) { extra.lat = Math.round(Number(s.lat) * 1e6) / 1e6; extra.lng = Math.round(Number(s.lng) * 1e6) / 1e6; extra.locLabel = String(s.label || '').trim().slice(0, 80); }
    if (s.only) { if (extra.lat == null) { s.err = 'Choose a location first.'; return lpPaint(); } return setLocation(s.id, extra); }
    return setStatus(s.id, s.status, extra);
  }

  /* ================================================================== render + events */
  function renderFail(msg) { $('#view').innerHTML = '<div class="err">' + esc(msg || 'Could not load the data.') + (/unknown admin|unknown action/i.test(msg || '') ? ' The Apps Script needs the latest Code.gs, deployed as a new version.' : '') + '</div><button class="btn" type="button" id="retry">Try again</button>'; }
  function render(anim) {
    if (anim === true) S.anim = true; var v = $('#view'), meta = VIEWS[S.view];
    $('#ttl').innerHTML = meta[0] + '<em>' + meta[1] + '</em>'; $('#sub').textContent = meta[2]; D.title = meta[0] + meta[1] + ' | VITAME admin';
    $$('.nav button').forEach(function (b) { b.setAttribute('aria-current', b.dataset.view === S.view ? 'page' : 'false'); });
    var rc = $('#rc'); rc.innerHTML = (S.view === 'stock' || S.view === 'store' || S.view === 'games' || S.view === 'customers' || S.view === 'subs') ? '' : rangeChips();
    var ob = $('#nb-orders'); if (S.data) { var n = S.data.orders.filter(function (o) { return o.status === 'Placed'; }).length; ob.textContent = n; ob.hidden = !n; }
    if (!S.data) return;
    var keepScroll = !S.anim ? W.scrollY : 0;
    D.body.classList.toggle('noanim', !S.anim);
    var focusId = D.activeElement && D.activeElement.id, selStart = D.activeElement && D.activeElement.selectionStart;
    v.innerHTML = ({ overview: overview, orders: orders, subs: subscriptions, sales: sales, stock: stock, customers: customers, games: games, store: store })[S.view]();
    mounts.forEach(function (m) { try { m(); } catch (e) { console.error(e); } });
    $$('[data-cu]', v).forEach(function (el) { var to = Number(el.getAttribute('data-cu')), f = el.getAttribute('data-f') === 'inr' ? inr : num; if (S.anim) { el.setAttribute('data-v', 0); K.countUp(el, to, f); } else el.setAttribute('data-v', to); });
    if (!S.anim) { W.scrollTo(0, keepScroll); }
    if (focusId) { var fe = D.getElementById(focusId); if (fe && fe.tagName === 'INPUT' && fe.type !== 'number') { fe.focus(); try { fe.setSelectionRange(selStart, selStart); } catch (e) { /* ignore */ } } }
    S.anim = false; S.flashIds = {}; updateSync();
  }
  function go(view, f) { S.view = view; if (f) { S.f = Object.assign({ q: '', status: '', ship: '', pay: '', sort: 'new' }, f); S.page = 1; } S.anim = true; closeDrawer(); try { history.replaceState(null, '', '#' + view); } catch (e) { /* ignore */ } render(true); W.scrollTo(0, 0); }
  function logout(expired) {
    if (!DEMO && sess) api('admin_logout', {});
    try { sessionStorage.removeItem('pp-admin'); localStorage.removeItem('pp-session'); } catch (e) { /* ignore */ }
    location.replace('./auth.html?logout=1' + (expired ? '&expired=1' : ''));
  }

  function bind() {
    $('#nav').innerHTML = Object.keys(VIEWS).map(function (k) { return '<button type="button" data-view="' + k + '">' + ico(k === 'games' ? 'games' : k) + '<span>' + ({ overview: 'Overview', orders: 'Orders', subs: 'Subscriptions', sales: 'Sales', stock: 'Stock', customers: 'Customers', games: 'Games & Pip', store: 'Store' })[k] + '</span>' + (k === 'orders' ? '<span class="badge" id="nb-orders" hidden>0</span>' : '') + '</button>'; }).join('');
    $('#who').innerHTML = '<div><small>Signed in as</small><b>' + esc(sess ? sess.email : 'demo@vitame') + '</b></div><button type="button" id="lo2">Log out</button>';
    D.addEventListener('click', function (e) {
      var t = e.target, b;
      if ((b = t.closest('.nav button'))) return go(b.dataset.view);
      if ((b = t.closest('[data-range]'))) { S.range = b.dataset.range; S.page = 1; S.anim = true; return render(true); }
      if ((b = t.closest('[data-metric]'))) { S.metric = b.dataset.metric; S.anim = true; return render(true); }
      if ((b = t.closest('[data-gran]'))) { S.gran = b.dataset.gran; S.anim = true; return render(true); }
      if ((b = t.closest('[data-att]'))) { var a = attention(S.data.orders, S.data.stock)[Number(b.dataset.att)]; if (a && a.go) go(a.go.view, a.go.f); return; }
      if ((b = t.closest('[data-sub-open]'))) return subDrawer(b.dataset.subOpen);
      if ((b = t.closest('[data-sop]'))) {
        var op = b.dataset.sop, sid = S.openSub, dt = $('#sd-date') ? $('#sd-date').value : '';
        if (op === 'cancel') { $('#sd-confirm').innerHTML = '<div class="box" style="margin-top:12px;background:#fff4de"><b>Cancel ' + esc(sid) + '?</b><p class="sub" style="margin:6px 0 10px">The customer is emailed. This cannot be undone.</p><div class="acts"><button class="btn sm" type="button" id="scy" style="background:#e03442;color:#fff">Yes, cancel it</button><button class="btn sm sec" type="button" id="scn">Keep it</button></div></div>'; return; }
        if (op === 'pause') return subOp(sid, 'pause', {});
        if (op === 'resume' || op === 'next') return subOp(sid, op, { next: dt });
        return subOp(sid, op, {});
      }
      if (t.id === 'scy') return subOp(S.openSub, 'cancel', {});
      if (t.id === 'scn') { $('#sd-confirm').innerHTML = ''; return; }
      if (t.id === 'runjob') return runJob(t);
      if (t.id === 'bf') { t.disabled = true; t.textContent = 'Setting up...'; return api('admin_sub', { op: 'backfill' }).then(function (j) { t.disabled = false; t.textContent = 'Set them up'; if (j && j.ok) { toast({ title: 'Subscriptions set up', text: (j.imported || 0) + ' created. The customers were emailed their manage link.' }); load(true); } else toast({ title: 'Could not set them up', text: (j && j.error) || 'Try again.' }); }); }
      if ((b = t.closest('[data-open]'))) return drawer(b.dataset.open);
      if ((b = t.closest('[data-cust]'))) return go('orders', { q: b.dataset.cust });
      if ((b = t.closest('[data-pg]'))) { S.page += Number(b.dataset.pg); S.anim = false; render(); return; }
      if (t.closest('[data-close]') || t.id === 'veil') return closeDrawer();
      if ((b = t.closest('[data-set]'))) {
        var st = b.dataset.set, id = S.openId, c = $('#st-confirm');
        if (st === 'Cancelled') { c.innerHTML = '<div class="box" style="margin-top:12px;background:#fff4de"><b>Cancel ' + esc(id) + '?</b><label style="display:flex;gap:8px;align-items:center;margin:10px 0;font-size:.86rem"><input type="checkbox" id="rs" checked> Put the bottles back in stock</label><div class="acts"><button class="btn sm" type="button" id="cy" style="background:#e03442;color:#fff">Yes, cancel</button><button class="btn sm sec" type="button" id="cn">Keep it</button></div></div>'; return; }
        return lpOpen(id, st, false);
      }
      if ((b = t.closest('[data-loc]'))) { var oo = (S.data.orders || []).filter(function (x) { return x.id === S.openId; })[0]; return oo && lpOpen(oo.id, oo.status, true); }
      if ((b = t.closest('[data-lpm]'))) return lpPick(b.dataset.lpm);
      if ((b = t.closest('[data-lpr]'))) { var rr = S.lp && S.lp.res[Number(b.dataset.lpr)]; if (rr) { S.lp.lat = rr.lat; S.lp.lng = rr.lng; S.lp.label = rr.label; S.lp.err = ''; lpPaint(); } return; }
      if (t.id === 'lp-save') return lpSave();
      if (t.id === 'lp-back') { S.lp = null; $('#st-confirm').innerHTML = ''; return; }
      if (t.id === 'cy') return setStatus(S.openId, 'Cancelled', { restock: !!($('#rs') && $('#rs').checked) });
      if (t.id === 'cn') { $('#st-confirm').innerHTML = ''; return; }
      if (t.id === 'csv') return csvOut();
      if (t.id === 'retry') { $('#view').innerHTML = '<div class="loading"><div><div class="bar"><i></i></div></div></div>'; return load(true); }
      if (t.id === 'lo' || t.id === 'lo2') return logout();
      if (t.id === 'snd') { S.sound = !S.sound; try { localStorage.setItem('pp-adm-sound', S.sound ? '1' : '0'); } catch (x) { /* ignore */ } t.textContent = 'Sound: ' + (S.sound ? 'on' : 'off'); $('#snd2').setAttribute('aria-pressed', S.sound); if (S.sound) chime(); return; }
      if ((b = t.closest('#snd2'))) { S.sound = !S.sound; try { localStorage.setItem('pp-adm-sound', S.sound ? '1' : '0'); } catch (x) { /* ignore */ } b.setAttribute('aria-pressed', S.sound); b.title = 'Sound ' + (S.sound ? 'on' : 'off'); b.style.opacity = S.sound ? 1 : .45; if (S.sound) chime(); return; }
      if ((b = t.closest('#rf'))) { b.classList.add('spin'); setTimeout(function () { b.classList.remove('spin'); }, 800); return load(true); }
      if ((b = t.closest('[data-step]'))) { var p = b.dataset.step.split('|'), inp = $('#sq-' + p[0]); inp.value = Math.max(0, (Number(inp.value) || 0) + Number(p[1])); return; }
      if ((b = t.closest('[data-save]'))) {
        var sid = b.dataset.save, q = Math.floor(Number($('#sq-' + sid).value)), msg = $('[data-msg="' + sid + '"]'); if (!isFinite(q) || q < 0) { msg.textContent = 'Enter a number from 0 up.'; return; }
        b.disabled = true; msg.textContent = 'Saving...';
        api('admin_stock', { id: sid, qty: q, backAt: $('#sb-' + sid).value }).then(function (j) { b.disabled = false; if (j && j.auth === false) return logout(true); if (j && j.ok) { var s = S.data.stock.filter(function (x) { return x.id === sid; })[0]; s.qty = q; s.backAt = $('#sb-' + sid).value; s.status = q > 0 ? 'In stock' : 'Out of stock'; S.anim = false; render(); var m2 = $('[data-msg="' + sid + '"]'); if (m2) m2.textContent = 'Saved. The shop updates within a few seconds.'; load(true); } else msg.textContent = (j && j.error) || 'Could not save.'; });
      }
    });
    D.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); if ((e.key === 'Enter') && e.target.matches && e.target.matches('tr[data-open]')) drawer(e.target.dataset.open); });
    D.addEventListener('input', function (e) {
      var t = e.target; if (t.id === 'sf-q') { (S.sf = S.sf || { q: '', status: '' }).q = t.value; S.anim = false; render(); } else if (t.id === 'f-q') { S.f.q = t.value; S.page = 1; S.anim = false; render(); } else if (t.id === 'c-q') { S.cq = t.value; S.anim = false; render(); }
    });
    var lpTimer = null;
    D.addEventListener('input', function (e) {
      var t = e.target; if (!S.lp) return;
      if (t.id === 'lp-label') S.lp.label = t.value; else if (t.id === 'lp-courier') S.lp.courier = t.value;
      else if (t.id === 'lp-q') { var s = S.lp; s.q = t.value.trim(); s.searched = false; clearTimeout(lpTimer); if (s.q.length < 3) { s.res = []; $('#lp-res').innerHTML = ''; return; } lpTimer = setTimeout(function () { geoSearch(s.q, whPoint()).then(function (r) { if (S.lp !== s || s.mode !== 'pick') return; s.res = r; s.searched = true; var box = $('#lp-res'); if (box) box.innerHTML = lpResHtml(s); }); }, 350); }
    });
    D.addEventListener('change', function (e) {
      var t = e.target, map = { 'f-status': 'status', 'f-ship': 'ship', 'f-pay': 'pay', 'f-sort': 'sort' };
      if (t.id === 'sf-s') { (S.sf = S.sf || { q: '', status: '' }).status = t.value; S.anim = false; render(); } else if (map[t.id]) { S.f[map[t.id]] = t.value; S.page = 1; S.anim = false; render(); } else if (t.id === 'c-s') { S.cs = t.value; S.anim = false; render(); }
    });
    D.addEventListener('visibilitychange', function () { if (!D.hidden) { S.pending = 0; D.title = (VIEWS[S.view][0] + VIEWS[S.view][1]) + ' | VITAME admin'; load(false); } });
    W.addEventListener('resize', (function () { var t; return function () { clearTimeout(t); t = setTimeout(function () { if (S.data) { S.anim = false; render(); } }, 200); }; })());
    W.addEventListener('hashchange', function () { var h = location.hash.slice(1); if (VIEWS[h] && h !== S.view) go(h); });
    setInterval(updateSync, 15000);
  }

  var h0 = location.hash.slice(1); if (VIEWS[h0]) S.view = h0;
  function start() {
    bind(); $('#view').innerHTML = '<div class="loading"><div><div class="bar"><i></i></div><b>Loading the numbers...</b></div></div>';
    if (DEMO) $('#live').classList.add('demo');
    load(true).then(function () { setInterval(poll, DEMO ? 4000 : 5000); });
  }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', start); else start();
  W.__admin = { S: S, load: load, go: go, api: api, statusOp: statusOp, stockOp: stockOp, drawer: drawer, csvOut: csvOut, render: render, refreshAfter: refreshAfter, setRange: setRange, filtered: filtered, attention: attention, DEMO: DEMO, subOp: subOp, runJob: runJob, packPlan: packPlan, subDrawer: subDrawer };
})();
