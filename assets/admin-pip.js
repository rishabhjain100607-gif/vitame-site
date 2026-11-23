/* Pip for the admin portal: answers questions about the shop's numbers and does jobs on your behalf (always asking before it changes anything). */
(function () {
  'use strict';
  var K = window.AdminKit, A = window.__admin; if (!K || !A) return;
  var D = document, S = A.S, $ = K.$, esc = K.esc, inr = K.inr, num = K.num, FL = K.FL;
  var SVG = "<svg class=\"ap-svg\" viewBox=\"70 55 365 395\" xmlns=\"http://www.w3.org/2000/svg\" aria-hidden=\"true\" focusable=\"false\"> <ellipse class=\"p-shadow\" cx=\"265\" cy=\"438\" rx=\"88\" ry=\"11\" fill=\"#1a1410\" opacity=\".16\"/> <g class=\"p-foot-l\"><ellipse cx=\"228\" cy=\"412\" rx=\"31\" ry=\"18\" fill=\"#ffdc52\" stroke=\"#1a1410\" stroke-width=\"5\"/><path d=\"M210 405 C216 399 226 398 234 401\" fill=\"none\" stroke=\"#fff6bf\" stroke-width=\"5\" stroke-linecap=\"round\"/></g> <g class=\"p-foot-r\"><ellipse cx=\"302\" cy=\"412\" rx=\"31\" ry=\"18\" fill=\"#ffdc52\" stroke=\"#1a1410\" stroke-width=\"5\"/><path d=\"M284 405 C290 399 300 398 308 401\" fill=\"none\" stroke=\"#fff6bf\" stroke-width=\"5\" stroke-linecap=\"round\"/></g> <g class=\"p-body\"> <path d=\"M243 100 L287 100 L287 150 C287 178 340 176 340 218 L340 352 C340 376 322 394 298 394 L232 394 C208 394 190 376 190 352 L190 218 C190 176 243 178 243 150Z\" fill=\"#fff1dc\" stroke=\"#1a1410\" stroke-width=\"6\" stroke-linejoin=\"round\"/> <path d=\"M194 200 C216 190 240 196 265 202 C290 208 316 192 336 200 L336 352 C336 373 320 390 298 390 L232 390 C210 390 194 373 194 352Z\" fill=\"#ff8a2a\"/> <path d=\"M194 200 C216 190 240 196 265 202 C290 208 316 192 336 200\" fill=\"none\" stroke=\"#ffdc52\" stroke-width=\"7\" stroke-linecap=\"round\"/> <path d=\"M300 214 L336 206 L336 352 C336 372 322 388 302 390 C316 340 316 270 300 214Z\" fill=\"#e8611a\" opacity=\".55\"/> <rect x=\"203\" y=\"214\" width=\"14\" height=\"120\" rx=\"7\" fill=\"#fff\" opacity=\".42\"/> <circle cx=\"210\" cy=\"350\" r=\"5\" fill=\"#fff\" opacity=\".4\"/> <rect x=\"224\" y=\"310\" width=\"82\" height=\"52\" rx=\"12\" fill=\"#fff7eb\" stroke=\"#1a1410\" stroke-width=\"4.5\"/> <text x=\"265\" y=\"345\" text-anchor=\"middle\" font-family=\"Anton,Impact,sans-serif\" font-size=\"28\" fill=\"#1a1410\" letter-spacing=\"1.5\">PIP</text> <path d=\"M247 104 L247 148 M283 104 L283 148\" stroke=\"#fff\" stroke-width=\"4\" stroke-linecap=\"round\" opacity=\".55\"/> </g> <g class=\"p-head\"> <rect x=\"234\" y=\"62\" width=\"62\" height=\"38\" rx=\"9\" fill=\"#1a1410\"/> <rect x=\"234\" y=\"78\" width=\"62\" height=\"8\" fill=\"#ffdc52\"/> <path d=\"M244 66 L244 96 M255 66 L255 96 M275 66 L275 96 M286 66 L286 96\" stroke=\"#3a2c22\" stroke-width=\"3\" stroke-linecap=\"round\"/> <path d=\"M270 62 C270 40 292 30 312 36 C310 56 292 68 270 62Z\" fill=\"#4aae4d\" stroke=\"#1a1410\" stroke-width=\"4\" stroke-linejoin=\"round\"/> <path d=\"M276 58 C288 50 298 46 306 42\" fill=\"none\" stroke=\"#2f8a35\" stroke-width=\"3\" stroke-linecap=\"round\"/> <circle cx=\"236\" cy=\"232\" r=\"25\" fill=\"#fffaf0\" stroke=\"#1a1410\" stroke-width=\"5\"/> <circle cx=\"294\" cy=\"232\" r=\"25\" fill=\"#fffaf0\" stroke=\"#1a1410\" stroke-width=\"5\"/> <g class=\"p-eye-l\"><circle class=\"p-pupil\" cx=\"236\" cy=\"232\" r=\"11\" fill=\"#1a1410\"/><circle cx=\"232\" cy=\"227\" r=\"3.8\" fill=\"#fff\"/></g> <g class=\"p-eye-r\"><circle class=\"p-pupil\" cx=\"294\" cy=\"232\" r=\"11\" fill=\"#1a1410\"/><circle cx=\"290\" cy=\"227\" r=\"3.8\" fill=\"#fff\"/></g> <circle cx=\"209\" cy=\"266\" r=\"9\" fill=\"#e03442\" opacity=\".4\"/> <circle cx=\"321\" cy=\"266\" r=\"9\" fill=\"#e03442\" opacity=\".4\"/> <path class=\"p-mouth\" d=\"M248 272 Q265 292 282 272\" fill=\"none\" stroke=\"#1a1410\" stroke-width=\"5\" stroke-linecap=\"round\"/> </g> <g class=\"p-hand-l\"><path d=\"M194 292 C176 292 158 284 142 270\" fill=\"none\" stroke=\"#1a1410\" stroke-width=\"7\" stroke-linecap=\"round\"/><circle cx=\"134\" cy=\"262\" r=\"17\" fill=\"#ffdc52\" stroke=\"#1a1410\" stroke-width=\"5\"/><path d=\"M126 256 C129 252 134 251 138 253\" fill=\"none\" stroke=\"#fff6bf\" stroke-width=\"4\" stroke-linecap=\"round\"/></g> <g class=\"p-hand-r\"><path d=\"M338 300 C356 302 372 312 384 328\" fill=\"none\" stroke=\"#1a1410\" stroke-width=\"7\" stroke-linecap=\"round\"/><circle cx=\"391\" cy=\"337\" r=\"17\" fill=\"#ffdc52\" stroke=\"#1a1410\" stroke-width=\"5\"/><path d=\"M384 331 C387 327 392 326 396 328\" fill=\"none\" stroke=\"#fff6bf\" stroke-width=\"4\" stroke-linecap=\"round\"/></g> </svg> ";
  var msgs = [], open = false, busy = false, greeted = false, bubbleT = 0;

  /* ---------- reading what the admin typed */
  function norm(s) { return ' ' + String(s).toLowerCase().replace(/[^a-z0-9.:\/\-+ ]/g, ' ').replace(/\s+/g, ' ').trim() + ' '; }
  function orderId(t) { var m = t.match(/pp[\s\-]?(\d{3,7})/) || t.match(/order\s*#?\s*(\d{3,7})/); return m ? 'PP-' + m[1] : null; }
  var SYN = [['orange', 'orange'], ['riot', 'orange'], ['beet', 'beet'], ['berry', 'beet'], ['green machine', 'green'], ['green', 'green'], ['mango', 'green'], ['mint', 'green'], ['machine', 'green'], ['yuzu', 'yuzu'], ['ginger', 'yuzu']];
  function flavourOf(t) { for (var i = 0; i < SYN.length; i++) if (t.indexOf(SYN[i][0]) >= 0) return SYN[i][1]; return null; }
  function statusOf(t) {
    if (/out for delivery|dispatch|ship|send out|sent out|on the road|on its way|handed to|courier/.test(t)) return 'Out for delivery';
    if (/cancel/.test(t)) return 'Cancelled'; if (/pack/.test(t)) return 'Packed'; if (/deliver|complete|done|reached/.test(t)) return 'Delivered'; if (/placed|new order/.test(t)) return 'Placed'; return null;
  }
  function rangeOf(t) {
    if (/\btoday\b|\bso far today\b/.test(t)) return 'today'; if (/all time|overall|ever|lifetime|since the start|total/.test(t)) return 'all';
    if (/90 days|quarter|3 months|three months/.test(t)) return '90d'; if (/30 days|month/.test(t)) return '30d'; if (/7 days|seven days|week/.test(t)) return '7d'; return null;
  }
  var WHEN = { today: 'today', '7d': 'in the last 7 days', '30d': 'in the last 30 days', '90d': 'in the last 90 days', all: 'over all time' };
  function stats(rk) {
    var all = S.data.orders, win = K.rangeWindow(all, rk), cur = all.filter(function (o) { return K.within(o, win.start, win.end); }), live = K.liveOnly(cur), n = live.length, rev = K.revenueOf(cur);
    var bot = live.reduce(function (s, o) { return s + K.bottles(o); }, 0);
    var fl = FL.map(function (f) { return { f: f, n: live.reduce(function (s, o) { return s + (o.drinks[f.id] || 0); }, 0) }; }).sort(function (a, b) { return b.n - a.n; });
    return { rk: rk, win: win, cur: cur, live: live, n: n, rev: rev, aov: n ? rev / n : 0, bot: bot, fl: fl, when: WHEN[rk] };
  }
  function stockOf(id) { return S.data.stock.filter(function (s) { return s.id === id; })[0]; }
  function fname(id) { return K.flav(id).name; }
  function find(id) { return S.data.orders.filter(function (o) { return o.id === id; })[0]; }
  function ob(label, run, pri) { return { l: label, run: run, pri: pri }; }
  function openBtn(o) { return ob('Open ' + o.id, function () { A.go('orders', { q: o.id }); A.drawer(o.id); return null; }); }

  /* ---------- jobs (every one asks first) */
  function statusJob(o, st, courier) {
    var lead = 'Move <b>' + esc(o.id) + '</b> (' + esc(o.name) + ', ' + inr(o.total) + ') from ' + esc(o.status) + ' to <b>' + esc(st) + '</b>?';
    function go(restock) { return A.statusOp(o.id, st, Object.assign(courier ? { courier: courier } : {}, restock ? { restock: true } : {})).then(function (j) { A.refreshAfter(); return j && j.ok ? { t: o.id + ' is now ' + st + '.' + (j.restocked ? ' Bottles put back: ' + j.restocked + '.' : '') } : { t: 'That did not work: ' + ((j && j.error) || 'no reply from the server') }; }); }
    if (st === 'Cancelled') return { confirm: true, html: lead + ' Should the bottles go back into stock?', btns: [ob('Cancel and restock', function () { return go(true); }, true), ob('Cancel only', function () { return go(false); }), ob('Keep it', null)] };
    return { confirm: true, html: lead + (courier ? ' Courier: ' + esc(courier) + '.' : ''), btns: [ob('Yes, do it', function () { return go(false); }, true), ob('No', null)] };
  }
  function bulkJob(list, from, to) {
    var take = list.slice(0, 40);
    return { confirm: true, html: 'Move <b>' + take.length + '</b> ' + esc(from.toLowerCase()) + ' order' + (take.length === 1 ? '' : 's') + ' to <b>' + esc(to) + '</b>?' + (list.length > take.length ? ' (The first 40 of ' + list.length + '.)' : ''), btns: [ob('Yes, move them', function () {
      var done = 0, fail = 0; return take.reduce(function (p, o) { return p.then(function () { return A.statusOp(o.id, to, {}).then(function (j) { if (j && j.ok) done++; else fail++; }); }); }, Promise.resolve()).then(function () { A.refreshAfter(); return { t: 'Done. ' + done + ' order' + (done === 1 ? '' : 's') + ' moved to ' + to + '.' + (fail ? ' ' + fail + ' failed, so try those again.' : '') }; });
    }, true), ob('No', null)] };
  }
  function stockJob(id, qty, backAt, why) {
    var s = stockOf(id), cur = s ? s.qty : 0;
    function go() { return A.stockOp(id, qty, backAt).then(function (j) { A.refreshAfter(); return j && j.ok ? { t: fname(id) + ' is now ' + qty + ' bottles' + (backAt ? ', back in stock ' + backAt : '') + '. The shop updates within seconds.' } : { t: 'That did not work: ' + ((j && j.error) || 'no reply from the server') }; }); }
    return { confirm: true, html: (why || '') + 'Set <b>' + esc(fname(id)) + '</b> stock from ' + cur + ' to <b>' + qty + '</b>' + (backAt ? ' and the back-in-stock date to <b>' + esc(backAt) + '</b>' : '') + '?', btns: [ob('Yes, update', go, true), ob('No', null)] };
  }

  /* ---------- answers */
  var NAVW = [[/overview|dashboard|home/, 'overview'], [/subscriptions?\b|subs\b/, 'subs'], [/orders?\b/, 'orders'], [/sales|revenue|analytics|trend/, 'sales'], [/stock|inventory|shelf/, 'stock'], [/customers?/, 'customers'], [/games?|leaderboard|pip questions|chatbot/, 'games'], [/store|settings|warehouse|sheets?/, 'store']];
  var PAGES = { overview: 'Overview', orders: 'Orders', subs: 'Subscriptions', sales: 'Sales', stock: 'Stock', customers: 'Customers', games: 'Games & Pip', store: 'Store' };
  function topBy(arr, key, n) { return arr.slice().sort(function (a, b) { return b[key] - a[key]; }).slice(0, n); }
  function cityMap(list) { var m = {}; list.forEach(function (o) { var k = (o.city || 'Unknown').trim() || 'Unknown'; m[k] = (m[k] || 0) + 1; }); return Object.keys(m).map(function (k) { return { n: k, c: m[k] }; }).sort(function (a, b) { return b.c - a.c; }); }
  function custMap() {
    var m = {}; S.data.orders.forEach(function (o) { if (o.status === 'Cancelled') return; var k = o.email.toLowerCase(), c = m[k] || (m[k] = { name: o.name, email: k, n: 0, spent: 0 }); c.n++; c.spent += o.total; c.name = o.name; });
    return Object.keys(m).map(function (k) { return m[k]; });
  }
  function summary(rk) {
    var s = stats(rk), all = S.data.orders, placed = all.filter(function (o) { return o.status === 'Placed'; }).length, low = S.data.stock.filter(function (x) { return x.qty <= K.LOW; });
    var t = '<b>' + esc(s.when.charAt(0).toUpperCase() + s.when.slice(1)) + ':</b> ' + num(s.n) + ' order' + (s.n === 1 ? '' : 's') + ', ' + inr(s.rev) + ' revenue (average ' + inr(Math.round(s.aov)) + '), ' + num(s.bot) + ' bottles.';
    if (s.n) t += ' Best seller: ' + esc(s.fl[0].f.name) + ' (' + s.fl[0].n + ').';
    t += '<br>' + (placed ? '<b>' + placed + '</b> order' + (placed === 1 ? ' is' : 's are') + ' waiting to be packed.' : 'Nothing is waiting to be packed.');
    if (low.length) t += '<br>' + low.map(function (x) { return esc(x.name) + (x.qty <= 0 ? ' is sold out' : ' has ' + x.qty + ' left'); }).join('; ') + '.';
    var btns = []; if (placed) btns.push(ob('Show orders to pack', function () { A.go('orders', { status: 'Placed' }); return null; })); btns.push(ob('Open Overview', function () { A.go('overview'); return null; }));
    return { html: t, btns: btns };
  }
  var HELP = '<b>Ask me things</b><br>"How are we doing today?", "revenue last 7 days", "best seller", "who is my top customer", "what is low on stock", "which orders are waiting?"<br><br><b>Subscriptions</b><br>"How many subscriptions?", "what is due this week?", "skip SUB-1001", "pause SUB-1001", "cancel SUB-1001", "run the subscription job".<br><br><b>Tell me to do things</b><br>"Mark PP-1004 as packed", "cancel PP-1004", "pack all new orders", "set orange stock to 40", "add 20 yuzu", "mark beet sold out", "show unpaid orders", "orders from Indore", "go to sales", "export orders".<br><br>I always ask before I change anything.';

  function answer(raw) {
    if (!S.data) return { html: 'I am still loading the numbers. Try again in a second.' };
    var t = norm(raw), id = orderId(t), fl = flavourOf(t), st = statusOf(t), rk = rangeOf(t), nums = (raw.match(/\d+/g) || []).map(Number);
    if (!t.trim()) return { html: 'Type a question or a job, for example "mark PP-1004 as packed".' };
    if (/^ (hi|hello|hey|yo|hola|namaste)\b/.test(t)) return { html: 'Hi! Here is where things stand.<br><br>' + summary('today').html, btns: summary('today').btns };
    if (/^ (thanks|thank you|thx|ok thanks|great|perfect|nice)\b/.test(t)) return { html: 'Any time. Tell me if there is anything else to do.' };
    if (/\b(help|what can you do|commands|how do i use|what do you do)\b/.test(t)) return { html: HELP };

    /* subscriptions */
    var sm = t.match(/\bsub[\s\-]?(\d{3,7})\b/), sid = sm ? 'SUB-' + sm[1] : null, subs = S.data.subs || [];
    if (/\b(run|start|trigger|do)\b.*\b(subscription|daily)\b.*\b(job|run|check)\b|\brun the (daily|subscription) job\b/.test(t)) {
      return { confirm: true, html: 'Run the daily subscription job now? It sends due reminders and places the orders that are ready, the same as the 7am run.', btns: [ob('Yes, run it', function () { return A.runJob().then(function () { return { t: 'Done. I started the daily job. The numbers update in a moment.' }; }); }, true), ob('No', null)] };
    }
    if (sid) {
      var sb = subs.filter(function (x) { return x.id === sid; })[0];
      if (!sb) return { html: 'I cannot find ' + esc(sid) + '.' };
      var vb = /\b(skip|pause|resume|restart|cancel|stop)\b/.exec(t), opw = vb ? ({ skip: 'skip', pause: 'pause', resume: 'resume', restart: 'resume', cancel: 'cancel', stop: 'cancel' })[vb[1]] : null;
      if (opw) {
        var txt = { skip: 'Skip the next delivery of', pause: 'Pause', resume: 'Resume', cancel: 'Cancel' }[opw];
        if (opw === 'skip' && sb.status !== 'Active') return { html: esc(sid) + ' is ' + sb.status.toLowerCase() + ', so there is nothing to skip.' };
        if (opw === 'pause' && sb.status !== 'Active') return { html: esc(sid) + ' is already ' + sb.status.toLowerCase() + '.' };
        if (opw === 'resume' && sb.status !== 'Paused') return { html: esc(sid) + ' is not paused.' };
        if (sb.status === 'Cancelled') return { html: esc(sid) + ' is cancelled and cannot be changed.' };
        return { confirm: true, html: txt + ' <b>' + esc(sid) + '</b> (' + esc(sb.name) + ', ' + esc(sb.freqLabel) + ', ' + inr(sb.total) + ')?' + (opw === 'cancel' ? ' The customer is emailed.' : ''), btns: [ob('Yes, do it', function () { return A.subOp(sid, opw, {}).then(function (j) { return j && j.ok ? { t: sid + ': done. ' + (j.sub ? (j.sub.status === 'Active' ? 'Next delivery ' + j.sub.next + '.' : j.sub.status + '.') : '') } : { t: 'That did not work: ' + ((j && j.error) || 'no reply from the server') }; }); }, true), ob('No', null)] };
      }
      A.go('subs'); A.subDrawer(sid);
      return { html: '<b>' + esc(sb.id) + '</b>: ' + esc(sb.name) + ' in ' + esc(sb.city) + ', ' + esc(sb.size) + ' bottles ' + esc(sb.freqLabel) + ', ' + inr(sb.total) + ' per delivery. Status <b>' + esc(sb.status) + '</b>' + (sb.status === 'Active' ? ', next delivery <b>' + esc(sb.next) + '</b>' : '') + '. I have opened it.' };
    }
    if (/\b(subscriptions?|subscribers?|recurring|on repeat|repeat (boxes|orders|customers))\b/.test(t) && !/\b(show|open|go to|take me)\b/.test(t)) {
      var ac = subs.filter(function (x) { return x.status === 'Active'; }), pa = subs.filter(function (x) { return x.status === 'Paused'; }), ca = subs.filter(function (x) { return x.status === 'Cancelled'; });
      var mrr = ac.reduce(function (a, x) { return a + x.total * 30 / (x.freqDays || 14); }, 0), plan = A.packPlan(7);
      if (/\b(due|coming|upcoming|next|this week|ship|pack|to pack)\b/.test(t)) {
        var soon = ac.filter(function (x) { return x.daysToNext != null && x.daysToNext <= 10; }).sort(function (a, b) { return a.daysToNext - b.daysToNext; });
        return { html: soon.length ? '<b>' + soon.length + '</b> box' + (soon.length === 1 ? '' : 'es') + ' due in the next 10 days:<br>' + soon.slice(0, 6).map(function (x) { return esc(x.id) + ': ' + esc(x.name) + ', ' + esc(x.next) + ' (' + (x.daysToNext === 0 ? 'today' : x.daysToNext + ' days') + ')'; }).join('<br>') + (soon.length > 6 ? '<br>and ' + (soon.length - 6) + ' more.' : '') + '<br>The job packs ' + plan.boxes + ' this week and needs ' + FL.map(function (f) { return plan.need[f.id] + ' ' + f.name; }).join(', ') + '.' : 'No subscription boxes are due in the next 10 days.', btns: [ob('Open Subscriptions', function () { A.go('subs'); return null; })] };
      }
      return { html: '<b>' + ac.length + '</b> active, ' + pa.length + ' paused, ' + ca.length + ' cancelled. Recurring revenue about <b>' + inr(Math.round(mrr)) + '</b> a month. The job packs <b>' + plan.boxes + '</b> boxes in the next 7 days.', btns: [ob('What is due?', function () { return { job: answer('what subscription boxes are due this week') }; }), ob('Open Subscriptions', function () { A.go('subs'); return null; }, true)] };
    }

    /* jobs: change an order's status */
    var verb = /\b(mark|set|move|change|update|make|put|turn|cancel|deliver|dispatch|send|pack|ship|complete|finish)\b/.test(t);
    var bulk = t.match(/\b(?:all|every|each)\b (?:the |of the |my )?(placed|new|pending|waiting|unpacked|packed|out for delivery|on the road)/);
    if (bulk && verb && !id) {
      var fromMap = { placed: 'Placed', 'new': 'Placed', pending: 'Placed', waiting: 'Placed', unpacked: 'Placed', packed: 'Packed', 'out for delivery': 'Out for delivery', 'on the road': 'Out for delivery' }, from = fromMap[bulk[1]];
      var after = t.slice(t.indexOf(bulk[0]) + bulk[0].length), to = statusOf(after) || (st !== from ? st : null);
      if (!to) to = from === 'Placed' ? 'Packed' : from === 'Packed' ? 'Out for delivery' : 'Delivered';
      if (to === from) return { html: 'Those orders are already ' + from.toLowerCase() + '.' };
      var list = S.data.orders.filter(function (o) { return o.status === from; });
      if (!list.length) return { html: 'There are no ' + from.toLowerCase() + ' orders right now.' };
      return bulkJob(list, from, to);
    }
    if (id && st && verb) {
      var o = find(id); if (!o) return { html: 'I cannot find ' + esc(id) + ' in the orders I have loaded. Check the number.' };
      if (o.status === st) return { html: esc(id) + ' is already ' + st.toLowerCase() + '.' };
      var cm = raw.match(/(?:courier|by|with|handed to)\s+([A-Za-z][A-Za-z ]{1,24})$/i);
      return statusJob(o, st, st === 'Out for delivery' && cm ? cm[1].trim() : '');
    }
    /* jobs: stock */
    if (fl && /\b(stock|bottles?|restock|sold out|out of stock|inventory|back in stock|available|add|remove|reduce|decrease|increase|set|damaged|received)\b/.test(t) && !/\b(how many|how much|what|which|is there|do we have|show|list)\b/.test(t.replace(/set|add/g, ''))) {
      var s0 = stockOf(fl), cur = s0 ? s0.qty : 0, n = nums.length ? nums[nums.length - 1] : null;
      if (/\b(sold out|out of stock|no stock|zero)\b/.test(t) && /\b(mark|set|make|put|is)\b/.test(t)) return stockJob(fl, 0, null);
      var dm = raw.match(/(?:back in stock|available|restock(?:ed)? date|expected|returns?)(?:\s+(?:date|on|at|from|by|for|to|is))*\s+(.{3,40})$/i);
      if (dm && /\b(back in stock|restock date|available (on|from)|expected)\b/.test(t) && !/^\d+$/.test(dm[1].trim())) return stockJob(fl, cur, dm[1].trim().replace(/[.!?]+$/, ''), '');
      if (n == null) return { html: 'How many bottles? For example "set ' + fname(fl).toLowerCase() + ' stock to 40" or "add 20 ' + fname(fl).toLowerCase() + '".' };
      if (/\b(remove|reduce|decrease|deduct|less|minus|damaged|spoil\w*|lost|broken)\b/.test(t)) return stockJob(fl, Math.max(0, cur - n), null);
      if (/\b(set|update|change|make|put)\b/.test(t) || /\bto\b/.test(t) || /\bequal\b/.test(t)) return stockJob(fl, n, null);
      return stockJob(fl, cur + n, null);
    }
    /* open one order */
    if (id) {
      var oo = find(id); if (!oo) return { html: 'I cannot find ' + esc(id) + '. It may be older than the 3,000 most recent orders I load.' };
      A.go('orders', { q: id }); A.drawer(id);
      var nx = { Placed: 'Packed', Packed: 'Out for delivery', 'Out for delivery': 'Delivered' }[oo.status];
      return { html: '<b>' + esc(oo.id) + '</b>: ' + esc(oo.name) + ' in ' + esc(oo.city) + ', ' + inr(oo.total) + ' (' + esc(oo.pay) + '), ' + esc(oo.items) + '. Status: <b>' + esc(oo.status) + '</b>. I have opened it for you.', btns: nx ? [ob('Mark ' + nx.toLowerCase(), function () { return { job: statusJob(oo, nx, '') }; }, true)] : [] };
    }
    /* actions on the screen */
    if (/\b(export|download|csv|spreadsheet file)\b/.test(t)) { A.csvOut(); return { html: 'Done. The orders table you are looking at (with its filters) was downloaded as a CSV file.' }; }
    if (/\b(refresh|reload|sync)\b/.test(t)) { A.load(true); return { html: 'Refreshing from the sheets now.' }; }
    var filt = (/\b(show|list|find|display|filter|search|get|see|view|open)\b/.test(t) || /\borders?\s+(from|by|for|of|in)\b/.test(t)) && !/\b(how many|how much|what|which|who)\b/.test(t);
    var cities = cityMap(S.data.orders).map(function (c) { return c.n; }), city = cities.filter(function (c) { return t.indexOf(' ' + c.toLowerCase() + ' ') >= 0 || t.indexOf(' ' + c.toLowerCase() + ' ') >= 0; })[0];
    if (filt && (city || /\b(unpaid|not paid|payment pending|pending payment|paid|premium|normal|cancelled|delivered|packed|placed|out for delivery|on the road|failed)\b/.test(t) || /\b(orders? (from|by|for|of))\b/.test(t))) {
      var f = { q: '', status: '', ship: '', pay: '', sort: 'new' };
      if (/\b(unpaid|not paid|payment pending|pending payment)\b/.test(t)) f.pay = 'Pending'; else if (/\bpaid\b/.test(t)) f.pay = 'Paid';
      if (/\bpremium\b/.test(t)) f.ship = 'Premium'; else if (/\bnormal\b/.test(t)) f.ship = 'Normal';
      var sf = /\b(cancelled|delivered|packed|placed|out for delivery|on the road)\b/.test(t) ? statusOf(t) : (/\b(waiting|new|unpacked|to pack)\b/.test(t) ? 'Placed' : null); if (sf) f.status = sf;
      if (city) f.q = city; var nm = raw.match(/orders?\s+(?:from|by|for|of)\s+(.{2,30})$/i); if (nm && !city) f.q = nm[1].replace(/[.!?]+$/, '').trim();
      if (/\bfailed\b/.test(t)) f.q = 'failed';
      A.S.range = 'all'; A.go('orders', f); var cnt = A.filtered().length; return { html: 'Showing ' + cnt + ' matching order' + (cnt === 1 ? '' : 's') + ' (all time).' };
    }
    var navv = /\b(go to|go|open|show me|show|take me to|take me|view|switch to|navigate to|bring up|see)\b/.test(t);
    if (navv && !/\b(how|what|which|who|why)\b/.test(t)) { for (var i = 0; i < NAVW.length; i++) if (NAVW[i][0].test(t)) { A.go(NAVW[i][1]); return { html: 'Opened <b>' + PAGES[NAVW[i][1]] + '</b>.' }; } }
    if (rk && /\b(show|set|switch|change|use|view|look at|filter)\b/.test(t) && !/\b(how|what|which|who)\b/.test(t)) { A.setRange(rk); return { html: 'Showing ' + WHEN[rk] + '.<br>' + summary(rk).html }; }

    /* questions about the numbers */
    var q = rk || 'today'; if (!rk && /\b(this|these|current|here|range|selected)\b/.test(t)) q = S.range; else if (!rk && !/\btoday\b/.test(t)) q = S.range === 'today' ? 'today' : S.range;
    if (/\b(summary|overview|how are we|how is (the )?(shop|business|store)|how('?s| is) it going|report|status update|catch me up|snapshot|where do we stand)\b/.test(t) || /^ (today|now) $/.test(t)) return summary(rk || 'today');
    if (/\b(low stock|low on|running (low|out)|run out|restock needed|need(s)? restock|what should i restock|almost (out|gone)|shortage)\b/.test(t)) {
      var now = Date.now(), l14 = K.liveOnly(S.data.orders).filter(function (o) { return now - o.placedAt < 14 * K.DAY; });
      var rows = S.data.stock.map(function (s) { var rate = l14.reduce(function (a, o) { return a + (o.drinks[s.id] || 0); }, 0) / 14, days = rate > 0 ? s.qty / rate : null; return { s: s, days: days }; }).filter(function (x) { return x.s.qty <= K.LOW || (x.days != null && x.days < 5); });
      if (!rows.length) return { html: 'Stock looks healthy. Nothing is low or about to run out within 5 days.' };
      return { html: '<b>Needs restocking</b><br>' + rows.map(function (x) { return esc(x.s.name) + ': ' + (x.s.qty <= 0 ? 'sold out' : x.s.qty + ' left' + (x.days != null ? ', about ' + Math.max(1, Math.round(x.days)) + ' day' + (Math.round(x.days) === 1 ? '' : 's') + ' at the current pace' : '')); }).join('<br>'), btns: rows.slice(0, 3).map(function (x) { return ob('Set ' + x.s.name, function () { return { say: 'Tell me the amount, for example "set ' + x.s.name.toLowerCase() + ' stock to 40".' }; }); }).concat([ob('Open Stock', function () { A.go('stock'); return null; })]) };
    }
    if (/\b(stock|inventory|bottles left|left on the shelf|how many bottles|in stock|shelf)\b/.test(t) || (fl && /\b(how many|left|available)\b/.test(t))) {
      var sel = fl ? S.data.stock.filter(function (x) { return x.id === fl; }) : S.data.stock;
      return { html: '<b>Stock</b><br>' + sel.map(function (x) { return esc(x.name) + ': ' + (x.qty <= 0 ? '<b>sold out</b>' + (x.backAt ? ' (back ' + esc(x.backAt) + ')' : '') : '<b>' + x.qty + '</b> bottles' + (x.qty <= K.LOW ? ' (low)' : '')); }).join('<br>'), btns: [ob('Open Stock', function () { A.go('stock'); return null; })] };
    }
    if (/\b(waiting|to pack|unpacked|need(s)? (packing|to be packed)|not (yet )?packed|pending orders?|new orders?|open orders?)\b/.test(t) && !/payment|paid/.test(t)) {
      var pl = S.data.orders.filter(function (o) { return o.status === 'Placed'; });
      if (!pl.length) return { html: 'Nothing is waiting. Every order has been packed or moved on.' };
      return { html: '<b>' + pl.length + '</b> order' + (pl.length === 1 ? ' is' : 's are') + ' waiting to be packed:<br>' + pl.slice(0, 6).map(function (o) { return esc(o.id) + ': ' + esc(o.name) + ', ' + inr(o.total) + ', ' + K.ago(o.placedAt); }).join('<br>') + (pl.length > 6 ? '<br>and ' + (pl.length - 6) + ' more.' : ''), btns: [ob('Pack all ' + pl.length, function () { return { job: bulkJob(pl, 'Placed', 'Packed') }; }, true), ob('Show them', function () { A.go('orders', { status: 'Placed' }); return null; })] };
    }
    if (/\b(on the road|out for delivery|in transit|being delivered|active orders?|with the courier)\b/.test(t)) {
      var ol = S.data.orders.filter(function (o) { return o.status === 'Out for delivery'; }); return { html: ol.length ? '<b>' + ol.length + '</b> order' + (ol.length === 1 ? ' is' : 's are') + ' out for delivery:<br>' + ol.slice(0, 6).map(function (o) { return esc(o.id) + ': ' + esc(o.name) + ', ' + esc(o.city); }).join('<br>') : 'No orders are out for delivery right now.', btns: ol.length ? [ob('Show them', function () { A.go('orders', { status: 'Out for delivery' }); return null; })] : [] };
    }
    if (/\b(unpaid|not paid|payment pending|pending payment|haven.?t paid|outstanding)\b/.test(t)) {
      var up = S.data.orders.filter(function (o) { return o.pay !== 'Paid' && o.status !== 'Cancelled'; }), val = up.reduce(function (s, o) { return s + o.total; }, 0);
      return { html: '<b>' + up.length + '</b> order' + (up.length === 1 ? ' has' : 's have') + ' payment pending, worth ' + inr(val) + '. (Razorpay is not connected yet, so every order shows pending until it is.)', btns: [ob('Show them', function () { A.go('orders', { pay: 'Pending' }); return null; })] };
    }
    if (/\b(best|top|most) (selling|seller|sold|popular|ordered)|which (flavour|flavor|juice|drink) (sells|sold|is (the )?(most )?popular)|bestseller|worst|least (popular|sold|selling)|slowest/.test(t) || (/\bflavou?rs?\b/.test(t) && /\b(sell|sold|popular|rank)\b/.test(t))) {
      var s1 = stats(q), rev = /worst|least|slowest/.test(t), ord = rev ? s1.fl.slice().reverse() : s1.fl;
      return { html: '<b>' + (rev ? 'Slowest' : 'Best') + ' seller ' + esc(s1.when) + ':</b> ' + esc(ord[0].f.name) + ' (' + ord[0].n + ' bottles).<br>' + ord.map(function (x) { return esc(x.f.name) + ': ' + x.n; }).join('<br>') };
    }
    if (/\b(top|best|biggest|loyal|valuable|most) (customers?|buyers?|spenders?)|who (orders|buys|spends)|top spender/.test(t)) {
      var cs = topBy(custMap(), 'spent', 3); return { html: cs.length ? '<b>Top customers by spend</b><br>' + cs.map(function (c, i) { return (i + 1) + '. ' + esc(c.name) + ': ' + inr(c.spent) + ' over ' + c.n + ' order' + (c.n === 1 ? '' : 's'); }).join('<br>') : 'No customers yet.', btns: [ob('Open Customers', function () { A.go('customers'); return null; })] };
    }
    if (/\bhow many customers|number of customers|customer count|returning|repeat customers?|new customers?\b/.test(t)) {
      var cm = custMap(), rp = cm.filter(function (c) { return c.n > 1; }).length; return { html: '<b>' + cm.length + '</b> customer' + (cm.length === 1 ? '' : 's') + ' so far: ' + rp + ' returning and ' + (cm.length - rp) + ' with a single order.' };
    }
    if (/\b(which|top|best|most).*(city|cities|area|place)|where (do|are).*(orders|customers)|cities\b/.test(t)) {
      var cy = cityMap(stats(q).live).slice(0, 5); return { html: cy.length ? '<b>Top cities ' + esc(stats(q).when) + '</b><br>' + cy.map(function (c, i) { return (i + 1) + '. ' + esc(c.n) + ': ' + c.c + ' order' + (c.c === 1 ? '' : 's'); }).join('<br>') : 'No orders in that range yet.' };
    }
    if (/\b(peak|busiest|busy|rush|best time|what time|which day|which hour)\b/.test(t)) {
      var lv = stats(q).live; if (!lv.length) return { html: 'No orders in that range yet.' };
      var hh = new Array(24).fill(0), dd = new Array(7).fill(0); lv.forEach(function (o) { hh[K.hourOf(o.placedAt)]++; dd[K.dowOf(o.placedAt)]++; });
      var ph = hh.indexOf(Math.max.apply(null, hh)), pd = dd.indexOf(Math.max.apply(null, dd)); return { html: 'People order most around <b>' + ph + ':00 to ' + ((ph + 1) % 24) + ':00</b> and busiest on <b>' + ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'][pd] + '</b> (' + esc(stats(q).when) + ', IST).' };
    }
    if (/\b(average order|aov|order value|basket|per order)\b/.test(t)) { var sa = stats(q); return { html: 'Average order value ' + esc(sa.when) + ': <b>' + inr(Math.round(sa.aov)) + '</b>, with ' + (sa.n ? (sa.bot / sa.n).toFixed(1) : 0) + ' bottles per order.' }; }
    if (/\b(trend|trending|growing|growth|going up|going down|forecast|projection|predict|next week)\b/.test(t)) {
      var w = K.rangeWindow(S.data.orders, '30d'), bk = K.buckets(K.liveOnly(S.data.orders), w, 1), vals = bk.map(function (b) { return K.revenueOf(b.orders); }), rg = K.regress(vals), mean = vals.reduce(function (a, b) { return a + b; }, 0) / (vals.length || 1), ch = mean ? rg.m * (vals.length - 1) / mean * 100 : 0, pj = 0; for (var k = 0; k < 7; k++) pj += Math.max(0, rg.f(vals.length + k));
      return { html: 'Over the last 30 days revenue is <b>' + (Math.abs(ch) < 4 ? 'holding steady' : ch > 0 ? 'trending up about ' + Math.round(ch) + '%' : 'trending down about ' + Math.abs(Math.round(ch)) + '%') + '</b>. If that continues, the next 7 days bring roughly <b>' + inr(Math.round(pj)) + '</b>.', btns: [ob('Open Sales', function () { A.go('sales'); return null; })] };
    }
    if (/\b(latest|last|newest|most recent|recent) orders?|what.?s new\b/.test(t)) {
      var lo = S.data.orders.slice(0, 4); return { html: lo.length ? '<b>Latest orders</b><br>' + lo.map(function (o) { return esc(o.id) + ': ' + esc(o.name) + ', ' + inr(o.total) + ', ' + esc(o.status) + ', ' + K.ago(o.placedAt); }).join('<br>') : 'No orders yet.', btns: lo.slice(0, 2).map(openBtn) };
    }
    if (/\b(cancel(l)?ed)\b/.test(t) && /\b(how many|count|number|any)\b/.test(t)) { var cn = S.data.orders.filter(function (o) { return o.status === 'Cancelled'; }); return { html: cn.length + ' cancelled order' + (cn.length === 1 ? '' : 's') + ' (' + inr(cn.reduce(function (s, o) { return s + o.total; }, 0)) + ' not counted in revenue).' }; }
    if (/\b(email|mail|confirmation)\b/.test(t) && /\b(fail|failed|not sent|problem|bounce)\b/.test(t)) { var fm = S.data.orders.filter(function (o) { return /^failed/i.test(o.emailSent); }); return { html: fm.length ? '<b>' + fm.length + '</b> confirmation email' + (fm.length === 1 ? '' : 's') + ' failed. The usual cause is the daily Gmail sending limit.' : 'No confirmation emails have failed.', btns: fm.length ? [ob('Show them', function () { A.go('orders', { q: 'failed' }); return null; })] : [] }; }
    if (/\b(delivery fees?|shipping fees?|discounts?|savings given|subscription savings)\b/.test(t)) { var sd = stats(q); return { html: 'Delivery fees ' + esc(sd.when) + ': <b>' + inr(sd.live.reduce(function (s, o) { return s + o.shipFee; }, 0)) + '</b>. Subscription savings given: <b>' + inr(sd.live.reduce(function (s, o) { return s + o.discount; }, 0)) + '</b>.' }; }
    if (/\b(leaderboard|games?|players?|high ?score)\b/.test(t)) {
      var b = S.data.board, pl2 = {}; b.forEach(function (r2) { pl2[r2.uid] = 1; }); var tops = ['slice', 'stack', 'smash'].map(function (g) { var r3 = b.filter(function (x) { return x.game === g; }).sort(function (a, c) { return c.best - a.best; })[0]; return r3 ? g + ': ' + esc(r3.name) + ' (' + r3.best + ')' : null; }).filter(Boolean);
      return { html: '<b>' + Object.keys(pl2).length + '</b> player' + (Object.keys(pl2).length === 1 ? '' : 's') + ' and ' + b.reduce(function (s, r4) { return s + r4.plays; }, 0) + ' plays so far.' + (tops.length ? '<br>Top scores: ' + tops.join(', ') : ''), btns: [ob('Open Games & Pip', function () { A.go('games'); return null; })] };
    }
    if (/\b(what (do )?(people|customers) ask|pip questions?|chatbot questions?)\b/.test(t)) { var ch2 = S.data.chats.slice(0, 4); return { html: ch2.length ? '<b>Latest questions to Pip</b><br>' + ch2.map(function (c) { return '"' + esc(c.q) + '"'; }).join('<br>') : 'No questions logged yet.', btns: [ob('Open Games & Pip', function () { A.go('games'); return null; })] }; }
    if (/\b(revenue|sales|earn(ed|ings)?|income|money|turnover|made|makes?)\b/.test(t) || /\bhow much\b/.test(t)) {
      var sr = stats(q), paid = sr.live.filter(function (o) { return o.pay === 'Paid'; }).reduce(function (s, o) { return s + o.total; }, 0);
      return { html: 'Revenue ' + esc(sr.when) + ': <b>' + inr(sr.rev) + '</b> from ' + sr.n + ' order' + (sr.n === 1 ? '' : 's') + ' (average ' + inr(Math.round(sr.aov)) + '). Paid online ' + inr(paid) + ', payment pending ' + inr(sr.rev - paid) + '.', btns: [ob('Open Sales', function () { A.go('sales'); return null; })] };
    }
    if (/\b(how many|number of|count of|total)\b.*\borders?\b|\borders?\b.*\b(today|this week|this month|so far)\b/.test(t)) { var sn = stats(q); return { html: '<b>' + sn.n + '</b> order' + (sn.n === 1 ? '' : 's') + ' ' + esc(sn.when) + ', with ' + sn.bot + ' bottles.' }; }
    if (/\b(bottles?|units?)\b.*\b(sold|sell)\b|how many bottles/.test(t)) { var sb = stats(q); return { html: '<b>' + sb.bot + '</b> bottles sold ' + esc(sb.when) + '.<br>' + sb.fl.map(function (x) { return esc(x.f.name) + ': ' + x.n; }).join('<br>') }; }
    /* navigation without a verb: a page name on its own */
    for (var j = 0; j < NAVW.length; j++) if (NAVW[j][0].test(t) && t.trim().split(' ').length <= 3) { A.go(NAVW[j][1]); return { html: 'Opened <b>' + PAGES[NAVW[j][1]] + '</b>.' }; }
    return { html: 'I did not quite get that. Try "how are we doing today?", "pack all new orders", "set orange stock to 40" or "show unpaid orders". Say "help" for the full list.', btns: [ob('Summary', function () { return { job: summary('today') }; }), ob('Help', function () { return { job: { html: HELP } }; })] };
  }

  /* ---------- the little window */
  var root, panel, list, input, launcher, bubble;
  var CSS_ID = 'ap-style';
  function build() {
    root = D.createElement('div'); root.className = 'ap';
    root.innerHTML = '<div class="ap-bubble" hidden><button class="ap-bx" type="button" aria-label="Dismiss">×</button><p></p><div class="ap-btns"></div></div>' +
      '<section class="ap-panel" aria-hidden="true" aria-label="Pip, your admin helper"><header><span class="ap-av">' + SVG + '</span><div><b>Pip</b><small>Your shop helper</small></div><span class="sp"></span><button type="button" class="ap-ib" data-min aria-label="Close">−</button></header><div class="ap-msgs" id="ap-msgs" aria-live="polite"></div><div class="ap-quick" id="ap-quick"></div><form class="ap-form"><input type="text" id="ap-in" placeholder="Ask, or tell me what to do" autocomplete="off" aria-label="Message Pip"><button type="submit" class="ap-send" aria-label="Send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg></button></form></section>' +
      '<button class="ap-launch" type="button" aria-label="Open Pip, your admin helper"><span class="ap-fig">' + SVG + '</span><i class="ap-dot" hidden></i></button>';
    D.body.appendChild(root);
    panel = $('.ap-panel', root); list = $('#ap-msgs', root); input = $('#ap-in', root); launcher = $('.ap-launch', root); bubble = $('.ap-bubble', root);
    launcher.addEventListener('click', function () { toggle(); });
    $('[data-min]', root).addEventListener('click', function () { toggle(false); });
    $('.ap-bx', root).addEventListener('click', function () { hideBubble(); });
    $('.ap-form', root).addEventListener('submit', function (e) { e.preventDefault(); var v = input.value.trim(); input.value = ''; if (v) ask(v); });
    D.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) toggle(false); });
    quick();
  }
  function quick() {
    var q = { overview: ['How are we doing today?', 'Which orders are waiting?', 'What is low on stock?'], orders: ['Which orders are waiting?', 'Pack all new orders', 'Show unpaid orders'], sales: ['Revenue last 7 days', 'Best seller', 'How are sales trending?'], stock: ['What is low on stock?', 'Stock levels', 'Add 20 orange'], customers: ['Top customers', 'How many customers?'], games: ['Leaderboard', 'What do people ask Pip?'], store: ['Help', 'Export orders'] }[S.view] || ['Help'];
    $('#ap-quick', root).innerHTML = q.map(function (x) { return '<button type="button" class="ap-chip" data-q="' + esc(x) + '">' + esc(x) + '</button>'; }).join('');
  }
  function toggle(force) {
    open = force == null ? !open : force; panel.classList.toggle('on', open); panel.setAttribute('aria-hidden', String(!open)); root.classList.toggle('open', open); hideBubble(); $('.ap-dot', root).hidden = true;
    if (open) { if (!greeted) { greeted = true; var s = summary('today'); bot('Hi, I am Pip. I know every number in this portal, and I can do jobs for you. I always check with you first.<br><br>' + s.html, s.btns); } quick(); setTimeout(function () { try { input.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 250); }
  }
  function draw() {
    list.innerHTML = msgs.map(function (m, i) {
      var b = '';
      if (m.btns && m.btns.length) b = '<div class="ap-btns">' + m.btns.map(function (x, k) { return '<button type="button" class="ap-chip' + (x.pri ? ' pri' : '') + '" data-m="' + i + '" data-b="' + k + '"' + (m.used ? ' disabled' : '') + '>' + esc(x.l) + '</button>'; }).join('') + '</div>';
      return '<div class="ap-m ' + (m.r === 'you' ? 'you' : 'bot') + '">' + (m.r === 'you' ? esc(m.t) : m.t) + b + '</div>';
    }).join('') + (busy ? '<div class="ap-typing"><i></i><i></i><i></i></div>' : '');
    list.scrollTop = list.scrollHeight;
  }
  function bot(html, btns, confirm) { msgs.push({ r: 'bot', t: html, btns: btns || [], confirm: !!confirm }); draw(); }
  function show(res) { if (!res) return; if (res.job) return show(res.job); if (res.say) return bot(esc(res.say)); if (res.t) return bot(esc(res.t)); bot(res.html || '', res.btns, res.confirm); }
  function ask(text) {
    msgs.push({ r: 'you', t: text }); busy = true; draw();
    setTimeout(function () {
      var res; try { res = answer(text); } catch (e) { console.error(e); res = { html: 'Sorry, something went wrong while I worked that out. Try again or say "help".' }; }
      busy = false; show(res); quick();
    }, 280);
  }
  function runBtn(mi, bi) {
    var m = msgs[mi], b = m && m.btns[bi]; if (!b || m.used || busy) return;
    if (m.confirm) m.used = true; msgs.push({ r: 'you', t: b.l }); draw();
    if (!b.run) { return bot('Okay, I will leave it as it is.'); }
    busy = true; draw();
    Promise.resolve(b.run()).then(function (res) { busy = false; if (res) show(res); else bot('Done. It is open on the screen behind this chat.'); }, function () { busy = false; bot('Something went wrong. Please try again.'); });
  }
  function showBubble(html, btns, ms) {
    if (open) return; $('p', bubble).innerHTML = html; var bb = $('.ap-btns', bubble); bb.innerHTML = '';
    (btns || []).forEach(function (x, k) { var e = D.createElement('button'); e.type = 'button'; e.className = 'ap-chip' + (x.pri ? ' pri' : ''); e.textContent = x.l; e.onclick = function () { hideBubble(); toggle(true); setTimeout(function () { msgs.push({ r: 'you', t: x.l }); draw(); if (x.run) { busy = true; draw(); Promise.resolve(x.run()).then(function (res) { busy = false; if (res) show(res); else bot('Done. It is open on the screen behind this chat.'); }); } }, 120); }; bb.appendChild(e); });
    bubble.hidden = false; launcher.classList.add('wave'); $('.ap-dot', root).hidden = false; clearTimeout(bubbleT); bubbleT = setTimeout(hideBubble, ms || 14000);
  }
  function hideBubble() { clearTimeout(bubbleT); bubble.hidden = true; launcher.classList.remove('wave'); }
  function onNewOrders(list2) {
    var o = list2[0]; if (!o) return;
    var many = list2.length > 1;
    showBubble(many ? '<b>' + list2.length + ' new orders</b> just came in.' : '<b>New order ' + esc(o.id) + '</b> from ' + esc(o.name) + ', ' + inr(o.total) + '. Want me to pack it?', many ? [ob('Pack them', function () { return { job: bulkJob(list2, 'Placed', 'Packed') }; }, true)] : [ob('Mark packed', function () { return { job: statusJob(o, 'Packed', '') }; }, true), openBtn(o)], 16000);
  }

  D.addEventListener('click', function (e) {
    var c = e.target.closest && e.target.closest('.ap-chip[data-q]'); if (c) { ask(c.getAttribute('data-q')); return; }
    var b = e.target.closest && e.target.closest('.ap-chip[data-m]'); if (b) runBtn(Number(b.getAttribute('data-m')), Number(b.getAttribute('data-b')));
  });
  function start() {
    build();
    setTimeout(function () { if (!S.data || open) return; var placed = S.data.orders.filter(function (o) { return o.status === 'Placed'; }).length; if (placed) showBubble('Hi, I am <b>Pip</b>. <b>' + placed + '</b> order' + (placed === 1 ? ' is' : 's are') + ' waiting to be packed. Want me to take care of it?', [ob('Show me', function () { var pl = S.data.orders.filter(function (o) { return o.status === 'Placed'; }); return { job: { html: '<b>' + pl.length + '</b> waiting:<br>' + pl.slice(0, 6).map(function (o) { return esc(o.id) + ': ' + esc(o.name) + ', ' + inr(o.total); }).join('<br>'), btns: [ob('Pack all ' + pl.length, function () { return { job: bulkJob(pl, 'Placed', 'Packed') }; }, true)] } }; }, true)], 12000); else showBubble('Hi, I am <b>Pip</b>. Ask me anything about the shop, or tell me what to do.', [ob('What can you do?', function () { return { job: { html: HELP } }; })], 9000); }, 3500);
    D.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.nav button')) setTimeout(quick, 50); });
  }
  window.AdminPip = { onNewOrders: onNewOrders, ask: function (t) { toggle(true); ask(t); }, _msgs: msgs, _answer: answer };
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', start); else start();
})();
