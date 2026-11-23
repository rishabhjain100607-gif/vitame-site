/* Vitame AutoPay: a window that sends an AutoPay (UPI mandate) request to Google Pay for a subscription box.
 *
 * What it does: the customer picks how often (weekly, every 2 weeks, every 4 weeks), then opens Google Pay (phone) or scans a QR code (computer).
 * Google Pay shows the amount and rhythm and the customer approves with their UPI PIN. It looks like the payment window (pay.css).
 *
 * What it cannot do on its own: a UPI mandate is created and charged through the shop's bank or payment partner. This site has no
 * payment partner connected (no API keys), so the link below follows NPCI's public UPI link format, but it has not been tested with
 * a live Google Pay account and the app may refuse it for a personal UPI ID. For that case the window always offers a plain
 * "pay this box now" UPI link and tells the customer plainly what to expect. Nothing here ever says money was taken.
 *
 * Settings: window.PP.pay.upiId and .payee (the same ones the payment window uses).
 *
 * VitameAutopay.open({ sub: {id, token}, amount, freq: 'weekly'|'fortnight'|'monthly', canChangeFreq, onFreq(sub), onClose() })
 * VitameAutopay.saved(id) -> {freq, amount, at} or null   VitameAutopay.available() -> true when a UPI ID is set
 */
(function () {
  'use strict';
  var P = (window.PP && window.PP.pay) || {};
  var UPI_ID = String(P.upiId || '').trim();
  var PAYEE = String(P.payee || 'Vitame').trim() || 'Vitame';
  var ENDPOINT = (window.PP && window.PP.ordersEndpoint) || '';
  var UA = navigator.userAgent || '';
  var IOS = /iPhone|iPad|iPod/i.test(UA);
  var MOBILE = IOS || /Android/i.test(UA);
  var ANDROID = /Android/i.test(UA);
  var REDUCE = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var KEY = 'pp-autopay';
  var GPAY_ANDROID = 'com.google.android.apps.nbu.paisa.user';

  // rhythm -> label, days, and the NPCI recurrence name. Every 4 weeks is not a calendar month, so it is "as presented".
  var FREQS = [
    { id: 'weekly', label: 'Every week', short: 'every week', days: 7, recur: 'WEEKLY' },
    { id: 'fortnight', label: 'Every 2 weeks', short: 'every 2 weeks', days: 14, recur: 'FORTNIGHTLY' },
    { id: 'monthly', label: 'Every 4 weeks', short: 'every 4 weeks', days: 28, recur: 'ASPRESENTED' }
  ];
  var freqOf = function (id) { return FREQS.filter(function (f) { return f.id === id; })[0] || FREQS[1]; };

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function money(n) { n = Number(n) || 0; return '₹' + (Math.abs(n % 1) < 0.005 ? Math.round(n).toLocaleString('en-IN') : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })); }
  var LS = {
    get: function () { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } },
    set: function (v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
  };
  function saved(id) { var r = LS.get()[id]; return r && typeof r === 'object' ? r : null; }

  /* ---------------------------------------------------------------- the link */
  function ist(offsetDays) { return new Date(Date.now() + 19800000 + (offsetDays || 0) * 86400000); } // India time
  function ddmmyyyy(d) { var p = function (n) { return ('0' + n).slice(-2); }; return p(d.getUTCDate()) + p(d.getUTCMonth() + 1) + d.getUTCFullYear(); }

  /** The mandate part of the link, in NPCI's UPI link format. One place to adjust if a payment partner needs other fields. */
  function mandateParams() {
    var enc = encodeURIComponent, f = freqOf(S.freq), id = S.sub && S.sub.id ? S.sub.id : '';
    var tr = ('VITAP' + id.replace(/\D/g, '') + Date.now().toString(36)).toUpperCase().slice(0, 35);
    return 'pa=' + enc(UPI_ID) + '&pn=' + enc(PAYEE) + '&tr=' + enc(tr) + '&am=' + S.amount.toFixed(2) + '&cu=INR' +
      '&tn=' + enc('Vitame ' + (id || 'subscription') + ' AutoPay') +
      '&txnType=CREATE&recur=' + f.recur + '&amrule=MAX&orgid=000000' +
      '&validitystart=' + ddmmyyyy(ist(0)) + '&validityend=' + ddmmyyyy(ist(365));
  }
  function payParams() { // an ordinary one-off UPI payment, the same fields the checkout window uses
    var enc = encodeURIComponent;
    return 'pa=' + enc(UPI_ID) + '&pn=' + enc(PAYEE) + '&am=' + S.amount.toFixed(2) + '&cu=INR&tn=' + enc('Vitame ' + (S.sub && S.sub.id ? S.sub.id : 'subscription box'));
  }
  function gpayLink(kind, params) { // kind: 'mandate' | 'pay'
    if (IOS) return 'gpay://upi/' + kind + '?' + params;
    if (ANDROID) return 'intent://' + (kind === 'pay' ? 'pay' : kind) + '?' + params + '#Intent;scheme=upi;package=' + GPAY_ANDROID + ';end';
    return 'tez://upi/' + kind + '?' + params;
  }
  function qrSvg(text) {
    try {
      if (typeof qrcode !== 'function') return '';
      var q = qrcode(0, 'M'); q.addData(text); q.make();
      return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    } catch (e) { return ''; }
  }

  /* ---------------------------------------------------------------- window */
  var S = null;
  function available() { return !!UPI_ID; }

  function open(o) {
    if (S) return;
    o = o || {};
    S = { o: o, sub: o.sub || null, amount: Number(o.amount) || 0, freq: freqOf(o.freq).id, screen: 'main', busy: false, msg: '', last: document.activeElement, root: null, touched: false };
    var root = document.createElement('div');
    root.className = 'vp-veil vp-solo vp-ap';
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'ap-title');
    root.innerHTML = '<div class="vp"><header class="vp-h"><img src="./media/vitame-cream.webp" alt="Vitame" width="111" height="30"><span class="vp-sec">AutoPay</span>' +
      '<div class="vp-amt"><small>Each box</small><b data-ap-amt></b></div><button class="vp-x" type="button" data-a="close" aria-label="Close AutoPay window">&times;</button></header>' +
      '<div class="vp-body"><section class="vp-pane" data-pane tabindex="-1"></section></div>' +
      '<footer class="vp-foot">We never see your bank details. You can pause or stop AutoPay any time in your UPI app.</footer></div>';
    document.body.appendChild(root);
    document.documentElement.classList.add('vp-lock');
    S.root = root;
    root.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey, true);
    paint(true);
    requestAnimationFrame(function () { root.classList.add('on'); });
  }
  function close() {
    if (!S) return;
    document.removeEventListener('keydown', onKey, true);
    var s = S; S = null;
    s.root.classList.remove('on');
    setTimeout(function () { if (s.root.parentNode) s.root.parentNode.removeChild(s.root); }, REDUCE ? 0 : 200);
    document.documentElement.classList.remove('vp-lock');
    try { if (s.last && s.last.focus) s.last.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    if (s.o.onClose) s.o.onClose({ saved: s.screen === 'done' });
  }

  function paint(focus) {
    var pane = $('[data-pane]', S.root), keep = pane.scrollTop;
    $('[data-ap-amt]', S.root).textContent = money(S.amount);
    pane.innerHTML = S.screen === 'done' ? doneHtml() : mainHtml();
    $('.vp-x', S.root).disabled = !!S.busy;
    if (focus) { var h = $('#ap-title', pane); if (h) h.focus({ preventScroll: true }); } else pane.scrollTop = keep;
  }

  function chipsHtml() {
    var can = S.o.canChangeFreq !== false && !!S.sub && !!S.sub.token && !!ENDPOINT;
    if (!can) return '<p class="ap-fixed"><b>' + esc(freqOf(S.freq).label) + '</b></p>';
    return '<div class="ap-freqs" role="radiogroup" aria-label="How often">' + FREQS.map(function (f) {
      return '<button type="button" class="ap-f" role="radio" data-a="freq" data-v="' + f.id + '" aria-checked="' + (f.id === S.freq) + '"' + (S.busy ? ' disabled' : '') + '>' + esc(f.label) + '</button>';
    }).join('') + '</div>' +
      '<p class="vp-hint">' + (S.msg ? '<span class="' + (S.msgBad ? 'ap-bad' : '') + '" role="status">' + esc(S.msg) + '</span>' : 'Changing this also changes how often your boxes are delivered, from the box after the next one.') + '</p>';
  }

  function mainHtml() {
    var f = freqOf(S.freq), mand = mandateParams();
    var link = gpayLink('mandate', mand), generic = 'upi://mandate?' + mand;
    var start = MOBILE
      ? '<div class="vp-apps ap-apps"><a class="vp-btn full" data-a="opened" href="' + esc(link) + '">Open Google Pay</a>' +
        '<a class="vp-btn sec full" data-a="opened" href="' + esc(generic) + '">Another UPI app</a></div>' +
        '<p class="vp-hint">Google Pay opens with the amount and how often already filled in. You approve it with your UPI PIN.</p>'
      : '<div class="vp-qr"><div data-qr>' + qrSvg(generic) + '</div><div><p><b>Scan with your phone</b></p><p class="vp-hint" style="margin:0">Use the Google Pay app (Scan any QR) or your phone camera. Google Pay then asks you to approve ' + esc(money(S.amount)) + ' ' + esc(f.short) + '.</p></div></div>';
    var now = '<details class="ap-more"><summary>Google Pay says it cannot set this up?</summary><div>' +
      '<p>Some banks and apps do not accept AutoPay requests yet. Nothing is lost: we email you before every box, and you can pay each one yourself with UPI.</p>' +
      (MOBILE ? '<a class="vp-btn sec sm" data-a="opened" href="' + esc(gpayLink('pay', payParams())) + '">Pay ' + esc(money(S.amount)) + ' now in Google Pay</a>'
        : '<p class="vp-hint" style="margin:0 0 6px">Or send ' + esc(money(S.amount)) + ' to this UPI ID from any UPI app:</p><div class="vp-id"><code>' + esc(UPI_ID) + '</code><button class="vp-chip" type="button" data-a="copy">Copy</button></div>') +
      '</div></details>';
    return '<h2 id="ap-title" tabindex="-1">Set up AutoPay</h2>' +
      '<p class="vp-lede">Send Google Pay an AutoPay request for your box, ' + esc(f.short) + '. Approve it once and you stay in control: pause or stop it whenever you like.</p>' +
      '<div class="vp-step"><i>1</i><div><b>How often?</b><div style="margin-top:8px">' + chipsHtml() + '</div></div></div>' +
      '<div class="ap-sum"><span>' + esc(money(S.amount)) + ' <small>at most, ' + esc(f.short) + '</small></span><small>Valid for 1 year. You can stop it any time.</small></div>' +
      '<div class="vp-step"><i>2</i><div><b>' + (MOBILE ? 'Open Google Pay' : 'Scan to open Google Pay') + '</b><div style="margin-top:10px">' + start + '</div></div></div>' +
      '<div class="vp-step"><i>3</i><div><b>Approved it?</b><div style="margin-top:10px"><button class="vp-btn full" type="button" data-a="done">I have set up AutoPay</button></div><p class="vp-hint">This only tells us you did it. We confirm when the first payment arrives.</p></div></div>' +
      now;
  }

  function doneHtml() {
    var f = freqOf(S.freq);
    return '<div class="vp-c"><svg class="vp-tick" viewBox="0 0 84 84" aria-hidden="true"><circle cx="42" cy="42" r="38"/><path d="M25 43l11 11 23-25"/></svg>' +
      '<h2 id="ap-title" tabindex="-1">AutoPay noted</h2>' +
      '<p>Thank you. We have noted AutoPay for ' + esc(money(S.amount)) + ' ' + esc(f.short) + (S.sub && S.sub.id ? ' on ' + esc(S.sub.id) : '') + '. You find it in Google Pay under Autopay, where you can pause or cancel it any time.</p>' +
      '<p class="vp-hint">If Google Pay did not ask you to approve anything, no AutoPay is active. We still email you before every box so you can pay it yourself.</p>' +
      '<div class="vp-acts"><button class="vp-btn" type="button" data-a="close">Close</button></div></div>';
  }

  /* ---------------------------------------------------------------- actions */
  function onClick(e) {
    var t = e.target;
    if (t === S.root) return close();
    var b = t.closest && t.closest('[data-a]'); if (!b || b.disabled) return;
    var a = b.getAttribute('data-a');
    if (a === 'close') return close();
    if (a === 'freq') return setFreq(b.getAttribute('data-v'));
    if (a === 'opened') { S.touched = true; return; } // the link itself does the work
    if (a === 'copy') return copyId(b);
    if (a === 'done') { var all = LS.get(); all[S.sub && S.sub.id ? S.sub.id : 'x'] = { freq: S.freq, amount: S.amount, at: Date.now() }; LS.set(all); S.screen = 'done'; paint(true); }
  }

  function setFreq(id) {
    if (S.busy || id === S.freq || !S.sub) return;
    var prev = S.freq; S.busy = true; S.msg = 'Saving...'; S.msgBad = false; S.freq = id; paint();
    var ctl = window.AbortController ? new AbortController() : null, t = ctl && setTimeout(function () { ctl.abort(); }, 20000);
    fetch(ENDPOINT, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'sub_update', id: S.sub.id, token: S.sub.token, op: 'freq', freq: id }), signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!S) return;
        if (j && j.ok) { S.msg = 'Saved. Your boxes now come ' + freqOf(id).short + '.'; if (j.sub && typeof j.sub.total === 'number') S.amount = j.sub.total; if (S.o.onFreq) S.o.onFreq(j.sub || null); }
        else { S.freq = prev; S.msgBad = true; S.msg = (j && j.error) || 'Could not change how often. Please try again.'; }
      })
      .catch(function () { if (!S) return; S.freq = prev; S.msgBad = true; S.msg = 'Could not reach the server. Check your connection and try again.'; })
      .then(function () { clearTimeout(t); if (!S) return; S.busy = false; paint(); var c = $('.ap-f[aria-checked=true]', S.root); if (c) c.focus({ preventScroll: true }); });
  }

  function copyId(btn) {
    var done = function (ok) { btn.textContent = ok ? 'Copied' : 'Select and copy'; setTimeout(function () { btn.textContent = 'Copy'; }, 1800); };
    var fallback = function () {
      try { var r = document.createRange(), c = btn.parentNode.querySelector('code'); r.selectNodeContents(c); var s = getSelection(); s.removeAllRanges(); s.addRange(r); done(document.execCommand && document.execCommand('copy')); }
      catch (e) { done(false); }
    };
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(UPI_ID).then(function () { done(true); }, fallback); else fallback(); } catch (e) { fallback(); }
  }

  function onKey(e) {
    if (!S) return;
    if (e.key === 'Escape') { if (!S.busy) { e.preventDefault(); e.stopPropagation(); close(); } return; }
    if (e.key !== 'Tab') return;
    var els = Array.prototype.filter.call(S.root.querySelectorAll('a[href],button:not(:disabled),input,summary,[tabindex="-1"][data-pane]'), function (n) { return n.offsetParent !== null && !(n.getAttribute('data-pane') != null); });
    if (!els.length) return;
    var first = els[0], last = els[els.length - 1], cur = document.activeElement;
    if (!S.root.contains(cur)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && (cur === first || cur === $('[data-pane]', S.root))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus(); }
  }

  window.VitameAutopay = { open: open, saved: saved, available: available, freqs: FREQS };
})();
