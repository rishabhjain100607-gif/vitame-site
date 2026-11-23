/* Vitame Pay: the payment window that opens from checkout.
 *
 * No payment provider is connected, so this window is honest about what it can do:
 *   - UPI to the shop's own UPI ID (QR code and app buttons) and Cash on delivery are real. The order is saved with the payment
 *     "Pending", and the shop confirms the UPI reference against the bank before it ships.
 *   - Cards, wallets, pay later and EMI are a TEST-MODE simulation (config pay.mode = 'demo'). No money moves, only
 *     well-known test card numbers are accepted, no card data is sent or stored, and nothing is ever saved as "Paid".
 *   - With pay.mode = 'live' the simulated methods are greyed out ("Soon") until a real provider is connected.
 *
 * Settings come from window.PP.pay (assets/config.js, filled from Vercel environment variables by build-config.js):
 *   mode 'demo' | 'live', upiId (the shop's UPI ID), payee (name shown in the UPI app), emiMin (rupees),
 *   methods: which options customers see. Default ['upi']. Any of 'upi', 'cod', 'card', 'wallet', 'later', 'emi', or 'all'.
 *   The card, wallet, pay later and EMI options are test-mode simulations, so only switch them on in mode 'demo'.
 *
 * VitamePay.open({ amount, ref, customer: {name, email, phone}, onSuccess(result) -> Promise<{ok, error?}>, onClose({completed, result}) })
 */
(function () {
  'use strict';
  var P = (window.PP && window.PP.pay) || {};
  var DEMO = P.mode !== 'live';
  var UPI_ID = String(P.upiId || '').trim();
  var PAYEE = String(P.payee || 'Vitame').trim() || 'Vitame';
  var EMI_MIN = Number(P.emiMin) > 0 ? Number(P.emiMin) : 3000;
  var ALL = ['upi', 'card', 'wallet', 'later', 'emi', 'cod'];
  var WANT = (function () {
    var m = P.methods; if (typeof m === 'string') m = m.split(',');
    if (!Array.isArray(m)) return ['upi'];
    m = m.map(function (x) { return String(x).trim().toLowerCase(); });
    if (m.indexOf('all') > -1) return ALL;
    var r = ALL.filter(function (x) { return m.indexOf(x) > -1; });
    return r.length ? r : ['upi'];
  })();
  var UA = navigator.userAgent || '';
  var MOBILE = /Android|iPhone|iPad|iPod/i.test(UA);
  var IOS = /iPhone|iPad|iPod/i.test(UA);
  var REDUCE = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function money(n) { n = Number(n) || 0; return '₹' + (Math.abs(n % 1) < 0.005 ? Math.round(n).toLocaleString('en-IN') : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })); }
  function rand(n) { var s = '', a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; for (var i = 0; i < n; i++) s += a.charAt(Math.floor(Math.random() * a.length)); return s; }

  var IC = {
    upi: '<path d="M4 7h13l-3-3M20 17H7l3 3"/>',
    card: '<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 10h19M6 15h4"/>',
    wallet: '<path d="M3 7a2 2 0 012-2h13v4M3 7v11a2 2 0 002 2h15V9H5a2 2 0 01-2-2zM16 14.500h.01"/>',
    later: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    emi: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    cod: '<rect x="2.500" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.500"/><path d="M6 9v.01M18 15v.01"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>'
  };
  var svg = function (n, extra) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || '') + '>' + IC[n] + '</svg>'; };

  /* ---------------------------------------------------------------- catalogues */
  var WALLETS = [['Paytm Wallet', 'PTM', 'Paytm'], ['PhonePe Wallet', 'PPE', 'PhonePe'], ['Amazon Pay', 'AMZ', 'Amazon'], ['MobiKwik', 'MBK', 'MobiKwik'], ['Freecharge', 'FC', 'Freecharge'], ['Airtel Money', 'ATL', 'Airtel'], ['JioMoney', 'JIO', 'Jio'], ['Ola Money', 'OLA', 'Ola']];
  var LATER = [['Simpl', 'SMP', 'Pay in 3 parts, no interest'], ['LazyPay', 'LZP', 'Pay on the 15th of next month'], ['ICICI PayLater', 'ICI', 'Pay next month'], ['HDFC FlexiPay', 'HDF', 'Pay later or split'], ['ZestMoney', 'ZST', 'Pay in small parts']];
  var EMI_BANKS = [['HDFC Bank', 'HDFC'], ['ICICI Bank', 'ICICI'], ['State Bank of India', 'SBI'], ['Axis Bank', 'AXIS'], ['Kotak Mahindra Bank', 'KMB'], ['IndusInd Bank', 'IND'], ['RBL Bank', 'RBL'], ['Yes Bank', 'YES']];
  var EMI_RATES = { 3: 13, 6: 14, 9: 15, 12: 15 }; // yearly interest in per cent: example rates for the test mode
  var HANDLES = ['@okhdfcbank', '@okicici', '@oksbi', '@okaxis', '@ybl', '@paytm'];
  // The only card numbers the test mode accepts, so nobody types a real card into a simulated form.
  var TEST_CARDS = [['Visa', '4111 1111 1111 1111'], ['Mastercard', '5555 5555 5555 4444'], ['RuPay', '6521 6900 0000 0004'], ['Amex', '3782 822463 10005'], ['Declined card', '4000 0000 0000 0002']];
  var TEST_OK = { '4111111111111111': 1, '5555555555554444': 1, '6521690000000004': 1, '378282246310005': 1, '4000000000000002': 1 };
  var DECLINE = '4000000000000002';

  /* ---------------------------------------------------------------- state */
  var S = null;
  var COD = { id: 'cod', t: 'Cash on delivery', d: 'Pay the courier when it arrives', ok: true, tag: '' };
  function methods() {
    var live = !DEMO, amt = S ? S.amount : 0;
    var list = [
      { id: 'upi', t: 'UPI', d: 'Google Pay, PhonePe, Paytm, BHIM', ok: DEMO || !!UPI_ID },
      { id: 'card', t: 'Cards', d: 'Credit and debit. Visa, Mastercard, RuPay, Amex', ok: DEMO },
      { id: 'wallet', t: 'Wallets', d: 'Paytm, PhonePe, Amazon Pay and more', ok: DEMO },
      { id: 'later', t: 'Pay Later', d: 'Simpl, LazyPay, ICICI PayLater', ok: DEMO },
      { id: 'emi', t: 'EMI', d: 'Split into monthly payments', ok: DEMO && amt >= EMI_MIN, tag: DEMO && amt < EMI_MIN ? money(EMI_MIN) + '+' : '' },
      COD
    ].filter(function (m) { return WANT.indexOf(m.id) > -1; }).map(function (m) { m.tag = m.tag || (!m.ok && live ? 'Soon' : ''); return m; });
    return list.some(function (m) { return m.ok; }) ? list : [COD]; // if nothing is usable (for example no UPI ID set), never leave checkout with no way to order
  }
  function later(fn, ms) { var id = setTimeout(fn, ms); S.timers.push(id); return id; }
  function clearTimers() { if (!S) return; S.timers.forEach(function (t) { clearTimeout(t); clearInterval(t); }); S.timers = []; }

  function open(o) {
    if (S) return;
    S = { o: o || {}, amount: Number(o && o.amount) || 0, method: '', screen: null, view: 'nav', data: { f: {} }, timers: [], last: document.activeElement, res: null, busy: false };
    var avail = methods(), first = avail.filter(function (m) { return m.ok; })[0];
    S.method = first ? first.id : 'cod';
    S.solo = avail.length === 1; // one option: no menu, just that option
    if (S.solo) S.view = 'pane';
    var root = document.createElement('div');
    root.className = 'vp-veil' + (S.solo ? ' vp-solo' : '');
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'vp-title');
    root.innerHTML =
      '<div class="vp"><header class="vp-h"><img src="./media/vitame-cream.webp" alt="Vitame" width="111" height="30"><span class="vp-sec">' + svg('lock') + 'Secure payment</span>' +
      '<div class="vp-amt"><small>You pay</small><b>' + money(S.amount) + '</b></div><button class="vp-x" type="button" data-a="close" aria-label="Close payment window">&times;</button></header>' +
      (DEMO ? '<div class="vp-demo"><b>Test mode</b><span>No real money is charged. Never enter a real card.</span></div>' : '') +
      '<div class="vp-body" data-view="nav"><nav class="vp-nav" aria-label="Payment methods"><h3>Choose how to pay</h3><div class="vp-list" role="tablist" aria-orientation="vertical" data-nav></div></nav>' +
      '<section class="vp-pane" data-pane tabindex="-1"></section></div>' +
      '<footer class="vp-foot">' + svg('lock') + (DEMO ? 'Vitame Pay test mode. Nothing here is stored or sent.' : 'Your order is saved securely. We never see your bank or card details.') + '</footer></div>';
    document.body.appendChild(root);
    document.documentElement.classList.add('vp-lock');
    S.root = root;
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    document.addEventListener('keydown', onDocKey, true); // on the document so Esc and Tab still work if focus falls to the page
    paint();
    requestAnimationFrame(function () { root.classList.add('on'); });
    // on a wide screen the first method is already open, so put focus on it; on a phone start at the list
    var sel = S.solo ? $('#vp-title', root) : ($('[data-nav] [aria-selected=true]', root) || $('[data-nav] button:not(:disabled)', root));
    if (sel) sel.focus({ preventScroll: true });
  }
  /** Closing from the UPI page after the person started paying asks first, so a paid-but-unrecorded order cannot happen by accident. */
  function requestClose() {
    if (!S || S.busy) return;
    if (!DEMO && S.method === 'upi' && !S.screen && S.data.touched) { setScreen({ t: 'confirmclose' }); return; }
    close(false);
  }

  function onDocKey(e) { if (S) onKey(e); }
  function close(completed) {
    if (!S) return;
    document.removeEventListener('keydown', onDocKey, true);
    clearTimers();
    var s = S; S = null;
    s.root.classList.remove('on');
    setTimeout(function () { if (s.root.parentNode) s.root.parentNode.removeChild(s.root); }, REDUCE ? 0 : 200);
    document.documentElement.classList.remove('vp-lock');
    try { if (s.last && s.last.focus) s.last.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    if (s.o.onClose) s.o.onClose({ completed: !!completed, result: s.res });
  }

  /* ---------------------------------------------------------------- painting */
  function paint() { paintNav(); paintPane(); $('.vp-body', S.root).setAttribute('data-view', S.view); }
  function paintNav() {
    $('[data-nav]', S.root).innerHTML = methods().map(function (m) {
      return '<button class="vp-m" type="button" role="tab" data-a="method" data-v="' + m.id + '" aria-selected="' + (S.method === m.id) + '"' + (m.ok ? '' : ' disabled') + ' id="vp-m-' + m.id + '">' +
        '<span class="vp-ic">' + svg(m.id === 'later' ? 'later' : m.id) + '</span><span><b>' + esc(m.t) + '</b><small>' + esc(m.d) + '</small></span>' + (m.tag ? '<span class="vp-tag">' + esc(m.tag) + '</span>' : '<span></span>') + '</button>';
    }).join('');
  }
  function paintPane(focus) {
    var pane = $('[data-pane]', S.root), keep = pane.scrollTop;
    pane.setAttribute('role', 'tabpanel'); pane.setAttribute('aria-labelledby', 'vp-m-' + S.method);
    pane.innerHTML = '<button class="vp-back" type="button" data-a="back">&larr; All payment methods</button>' + (S.screen ? screenHtml() : formHtml());
    var x = $('.vp-x', S.root); x.disabled = !!S.busy;
    if (S.screen && S.screen.t === 'wait') tickCount();
    if (focus) { var h = $('#vp-title', pane); if (h) h.focus({ preventScroll: true }); }
    else pane.scrollTop = keep;
  }
  var head = function (t, lede) { return '<h2 id="vp-title" tabindex="-1">' + esc(t) + '</h2>' + (lede ? '<p class="vp-lede">' + esc(lede) + '</p>' : ''); };
  var err = function (k) { var e = S.data.errs && S.data.errs[k]; return e ? '<p class="vp-err" role="alert">' + esc(e) + '</p>' : ''; };
  var inv = function (k) { return S.data.errs && S.data.errs[k] ? ' aria-invalid="true"' : ''; };
  var val = function (k) { return esc(S.data.f[k] || ''); };
  var payLabel = function () { return 'Pay ' + money(S.amount); };

  function formHtml() {
    var m = S.method;
    if (m === 'upi') return DEMO ? upiDemoHtml() : upiLiveHtml();
    if (m === 'card') return cardFormHtml('Cards', 'Credit or debit card. We only accept the test cards below.', payLabel());
    if (m === 'wallet') return tilesHtml('Wallets', 'Pay from your wallet balance.', WALLETS.map(function (w) { return [w[0], w[1], '']; }), 'wallet', 'wallet-go');
    if (m === 'later') return tilesHtml('Pay Later', 'Buy now and pay later with one of these.', LATER, 'later', 'later-go');
    if (m === 'emi') return emiHtml();
    return codHtml();
  }

  /* ---------------------------------------------------------------- UPI */
  function upiDemoHtml() {
    var chips = HANDLES.map(function (h) { return '<button class="vp-chip" type="button" data-a="handle" data-v="' + h + '">' + h + '</button>'; }).join('');
    return head('UPI', 'Enter your UPI ID. We send a payment request to your UPI app and you approve it there.') +
      '<div class="vp-f"><div><label class="vp-l" for="vp-vpa">UPI ID</label><input class="vp-in" id="vp-vpa" inputmode="email" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="name@okhdfcbank" value="' + val('vpa') + '"' + inv('vpa') + '>' + err('vpa') +
      '<div class="vp-chips" aria-label="Quick add a bank handle">' + chips + '</div><p class="vp-hint">Test mode: any ID like asha@okhdfcbank works.</p></div></div>' +
      '<div class="vp-acts"><button class="vp-btn full" type="button" data-a="upi-pay">' + esc(payLabel()) + '</button></div>';
  }
  function upiParams() {
    // Only the fields every UPI app accepts for any UPI ID. The merchant-only reference (tr) is left out on purpose: some apps refuse it for personal IDs.
    var enc = encodeURIComponent, ref = S.o.ref || ('VIT' + rand(6));
    return 'pa=' + enc(UPI_ID) + '&pn=' + enc(PAYEE) + '&am=' + S.amount.toFixed(2) + '&cu=INR&tn=' + enc('Vitame ' + ref);
  }
  function qrSvg() {
    try {
      if (typeof qrcode !== 'function') return '';
      var q = qrcode(0, 'M'); q.addData('upi://pay?' + upiParams()); q.make();
      return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    } catch (e) { return ''; }
  }
  function upiLiveHtml() {
    var p = upiParams();
    var apps = [['Google Pay', (IOS ? 'gpay://upi/pay?' : 'tez://upi/pay?') + p], ['PhonePe', 'phonepe://pay?' + p], ['Paytm', 'paytmmp://pay?' + p], ['Any UPI app', 'upi://pay?' + p]];
    var pay = MOBILE
      ? '<div class="vp-step"><i>1</i><div><b>Open your UPI app</b><div class="vp-apps" style="margin-top:10px">' + apps.map(function (a) { return '<a class="vp-app" href="' + esc(a[1]) + '"><span class="vp-ic" style="width:30px;height:30px">' + svg('upi') + '</span>' + esc(a[0]) + '</a>'; }).join('') + '</div><p class="vp-hint">The amount and our UPI ID are filled in for you.</p></div></div>'
      : '<div class="vp-step"><i>1</i><div><b>Scan with any UPI app</b><div class="vp-qr" style="margin-top:10px"><div data-qr>' + qrSvg() + '</div><div><p>Pay <b>' + esc(money(S.amount)) + '</b> to <b>' + esc(PAYEE) + '</b></p><p class="vp-hint" style="margin:0">Or send it to this UPI ID:</p><div class="vp-id"><code>' + esc(UPI_ID) + '</code><button class="vp-chip" type="button" data-a="copy">Copy</button></div></div></div></div></div>';
    return head('UPI', 'Pay straight to ' + PAYEE + ' with any UPI app. No fees.') + '<div class="vp-upi">' + pay +
      '<div class="vp-step"><i>2</i><div><label class="vp-l" for="vp-utr">After paying, enter the UPI reference (UTR, 12 digits)</label><input class="vp-in" id="vp-utr" inputmode="numeric" autocomplete="off" placeholder="412345678901" value="' + val('utr') + '"' + inv('utr') + '>' + err('utr') +
      '<p class="vp-hint">You find it in your UPI app under the payment details. We check it against our bank account, then confirm your order.</p>' +
      '<div class="vp-chips"><button class="vp-chip" type="button" data-a="upi-noutr">I paid but cannot find the reference</button></div></div></div></div>' +
      '<div class="vp-acts"><button class="vp-btn full" type="button" data-a="upi-paid">I have paid ' + esc(money(S.amount)) + '</button></div>';
  }

  /* ---------------------------------------------------------------- cards and EMI */
  function brandOf(n) {
    if (/^3[47]/.test(n)) return 'Amex';
    if (/^4/.test(n)) return 'Visa';
    if (/^(5[1-5]|2[2-7])/.test(n)) return 'Mastercard';
    if (/^(60|65|81|82|508|353|356)/.test(n)) return 'RuPay';
    if (/^3(0[0-5]|[68])/.test(n)) return 'Diners';
    return '';
  }
  function luhn(n) { var s = 0, alt = false; for (var i = n.length - 1; i >= 0; i--) { var d = +n.charAt(i); if (alt) { d *= 2; if (d > 9) d -= 9; } s += d; alt = !alt; } return n.length > 0 && s % 10 === 0; }
  function fmtCard(d) { d = d.slice(0, /^3[47]/.test(d) ? 15 : 19); return /^3[47]/.test(d) ? [d.slice(0, 4), d.slice(4, 10), d.slice(10)].filter(Boolean).join(' ') : d.replace(/(\d{4})(?=\d)/g, '$1 '); }
  function cardFormHtml(title, lede, btn, extra) {
    var chips = TEST_CARDS.map(function (c) { return '<button class="vp-chip" type="button" data-a="testcard" data-v="' + c[1] + '">' + esc(c[0]) + '</button>'; }).join('');
    var b = brandOf((S.data.f.cn || '').replace(/\D/g, ''));
    return head(title, lede) + (extra || '') +
      '<div class="vp-f"><div><label class="vp-l" for="vp-cn">Card number</label><div class="vp-brand"><input class="vp-in" id="vp-cn" inputmode="numeric" autocomplete="off" placeholder="1234 5678 9012 3456" value="' + val('cn') + '"' + inv('cn') + '><i data-brand>' + esc(b) + '</i></div>' + err('cn') +
      '<div class="vp-chips" aria-label="Test cards">' + chips + '</div><p class="vp-hint">Test mode: tap a test card to fill the form. Any future expiry and any CVV work.</p></div>' +
      '<div><label class="vp-l" for="vp-nm">Name on card</label><input class="vp-in" id="vp-nm" autocomplete="off" placeholder="Asha Rao" value="' + val('nm') + '"' + inv('nm') + '>' + err('nm') + '</div>' +
      '<div class="vp-two"><div><label class="vp-l" for="vp-ex">Expiry</label><input class="vp-in" id="vp-ex" inputmode="numeric" autocomplete="off" placeholder="MM/YY" maxlength="5" value="' + val('ex') + '"' + inv('ex') + '>' + err('ex') + '</div>' +
      '<div><label class="vp-l" for="vp-cv">CVV</label><input class="vp-in" id="vp-cv" type="password" inputmode="numeric" autocomplete="off" placeholder="123" maxlength="4" value="' + val('cv') + '"' + inv('cv') + '>' + err('cv') + '</div></div></div>' +
      '<div class="vp-acts"><button class="vp-btn full" type="button" data-a="card-pay">' + esc(btn) + '</button></div>';
  }
  function cardCheck() {
    var f = S.data.f, num = (f.cn || '').replace(/\D/g, ''), e = {};
    var brand = brandOf(num);
    if (!luhn(num) || num.length < 13) e.cn = 'Enter a valid card number.';
    else if (!TEST_OK[num]) e.cn = 'Test mode: use one of the test cards above. Do not enter a real card.';
    if ((f.nm || '').trim().length < 2) e.nm = 'Enter the name on the card.';
    var m = /^(\d{2})\/(\d{2})$/.exec(f.ex || '');
    if (!m || +m[1] < 1 || +m[1] > 12) e.ex = 'Enter the expiry as MM/YY.';
    else { var now = new Date(), yy = now.getFullYear() % 100, mm = now.getMonth() + 1; if (+m[2] < yy || (+m[2] === yy && +m[1] < mm)) e.ex = 'This card has expired.'; }
    if (!/^\d{3,4}$/.test(f.cv || '') || (brand !== 'Amex' && (f.cv || '').length !== 3)) e.cv = brand === 'Amex' ? 'Amex cards have a 4 digit CVV.' : 'Enter the 3 digit CVV.';
    S.data.errs = e;
    return { ok: !Object.keys(e).length, num: num, brand: brand };
  }
  function cardPay(kind) {
    var c = cardCheck();
    if (!c.ok) { paintPane(); var first = $('.vp-in[aria-invalid=true]', S.root); if (first) first.focus(); return; }
    var last4 = c.num.slice(-4), tag = kind === 'emi' ? 'EMI-' + S.data.emi.months + 'M' : 'CARD-' + c.brand.toUpperCase();
    busy('Contacting your bank', 'Checking your card with the bank.', function () {
      if (c.num === DECLINE) return fail('Your bank declined this card. Try another card or another way to pay.');
      otp('Verify with your bank', 'Enter the 6 digit OTP your bank sent to ' + maskPhone() + '.', function () {
        finish({ method: kind === 'emi' ? 'emi' : 'card', paymentId: 'DEMO-' + tag + '-' + last4 + '-' + rand(4), label: 'Test payment' });
      });
    }, 1300);
  }
  function maskPhone() { var p = String((S.o.customer && S.o.customer.phone) || '').replace(/\D/g, ''); return p.length >= 4 ? 'the number ending ' + p.slice(-4) : 'your phone'; }

  function emiPlans() {
    return [3, 6, 9, 12].map(function (n) {
      var r = EMI_RATES[n] / 1200, emi = S.amount * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1), total = emi * n;
      return { n: n, rate: EMI_RATES[n], emi: emi, interest: total - S.amount, total: total };
    });
  }
  function emiHtml() {
    var d = S.data.emi = S.data.emi || { bank: '', months: 0, card: false };
    if (S.amount < EMI_MIN) return head('EMI', 'EMI is available on orders of ' + money(EMI_MIN) + ' and above.');
    if (d.card) {
      var pl = emiPlans().filter(function (p) { return p.n === d.months; })[0];
      return cardFormHtml('EMI on ' + d.bank, d.months + ' months of ' + money(pl.emi) + '. We only accept the test cards below.', 'Pay ' + money(pl.emi) + ' a month', '');
    }
    var tiles = EMI_BANKS.map(function (b) { return '<button class="vp-t" type="button" data-a="emi-bank" data-v="' + esc(b[0]) + '" aria-pressed="' + (d.bank === b[0]) + '"><span class="vp-mono">' + esc(b[1]) + '</span>' + esc(b[0]) + '</button>'; }).join('');
    var plans = emiPlans().map(function (p) {
      return '<button class="vp-plan" type="button" data-a="emi-plan" data-v="' + p.n + '" aria-pressed="' + (d.months === p.n) + '"><span class="vp-dot"></span><span><b>' + money(p.emi) + ' x ' + p.n + ' months</b><small>' + p.rate + '% a year. Interest ' + money(p.interest) + ', total ' + money(p.total) + '</small></span><span></span></button>';
    }).join('');
    return head('EMI', 'Split this order into monthly payments on your credit card. Rates shown are examples in test mode.') +
      '<div class="vp-sub">1. Your card’s bank</div><div class="vp-tiles">' + tiles + '</div>' +
      '<div class="vp-sub">2. How long</div><div class="vp-plans">' + plans + '</div>' +
      '<div class="vp-acts"><button class="vp-btn full" type="button" data-a="emi-go"' + (d.bank && d.months ? '' : ' disabled') + '>Continue with card</button></div>';
  }

  /* ---------------------------------------------------------------- wallets and pay later (tile pickers) */
  function tilesHtml(title, lede, list, key, go) {
    var cur = S.data[key] || '';
    var tiles = list.map(function (b) {
      return '<button class="vp-t" type="button" data-a="pick" data-k="' + key + '" data-v="' + esc(b[0]) + '" aria-pressed="' + (cur === b[0]) + '"><span class="vp-mono">' + esc(b[1]) + '</span><span>' + esc(b[0]) + (b[2] ? '<small>' + esc(b[2]) + '</small>' : '') + '</span></button>';
    }).join('');
    return head(title, lede) + '<div class="vp-tiles" role="group" aria-label="' + esc(title) + '">' + tiles + '</div>' +
      '<div class="vp-acts"><button class="vp-btn full" type="button" data-a="' + go + '"' + (cur ? '' : ' disabled') + '>' + (cur ? 'Pay ' + esc(money(S.amount)) + ' with ' + esc(cur) : 'Choose an option to continue') + '</button></div>';
  }
  function codHtml() {
    return head('Cash on delivery', 'Place your order now and pay the courier when it arrives.') +
      '<div class="vp-frame" style="max-width:none"><header><b>How it works</b></header><div class="vp-fb"><dl><div><dt>Amount to pay at the door</dt><dd>' + esc(money(S.amount)) + '</dd></div><div><dt>Accepted</dt><dd>Cash or UPI</dd></div></dl>' +
      '<p class="vp-hint" style="margin:0">Keep the exact amount ready if you can. We confirm your order by email.</p></div></div>' +
      '<div class="vp-acts"><button class="vp-btn full" type="button" data-a="cod-go">Place order, pay on delivery</button></div>';
  }

  /* ---------------------------------------------------------------- status screens */
  function screenHtml() {
    var s = S.screen;
    if (s.t === 'busy') return '<div class="vp-c" role="status" aria-live="polite"><div class="vp-spin"></div>' + head(s.title, '') + '<p>' + esc(s.text) + '</p></div>';
    if (s.t === 'saving') return '<div class="vp-c" role="status" aria-live="polite"><div class="vp-spin"></div>' + head('Placing your order', '') + '<p>Please keep this window open for a moment.</p></div>';
    if (s.t === 'done') return '<div class="vp-c" role="status" aria-live="polite"><svg class="vp-tick" viewBox="0 0 84 84" aria-hidden="true"><circle cx="42" cy="42" r="38"/><path d="M26 43l11 11 21-23"/></svg>' + head(s.title, '') + '<p>' + esc(s.text) + '</p></div>';
    if (s.t === 'confirmclose') return '<div class="vp-c" role="alertdialog">' + head('Already paid?', '') + '<p>If you have paid, enter your UPI reference first. Without it we cannot match your payment to your order.</p>' +
      '<div class="vp-acts" style="justify-content:center"><button class="vp-btn" type="button" data-a="retry">Enter my reference</button><button class="vp-btn sec" type="button" data-a="forceclose">Close without paying</button></div></div>';
    if (s.t === 'fail') return '<div class="vp-c" role="alert"><svg class="vp-cross" viewBox="0 0 84 84" aria-hidden="true"><circle cx="42" cy="42" r="38"/><path d="M30 30l24 24M54 30L30 54"/></svg>' + head(s.title || 'Payment not completed', '') + '<p>' + esc(s.text) + '</p>' +
      '<div class="vp-acts" style="justify-content:center"><button class="vp-btn" type="button" data-a="retry">Try again</button><button class="vp-btn sec" type="button" data-a="other">' + (S.solo ? 'Start again' : 'Use another method') + '</button></div></div>';
    if (s.t === 'orderfail') return '<div class="vp-c" role="alert"><svg class="vp-cross" viewBox="0 0 84 84" aria-hidden="true"><circle cx="42" cy="42" r="38"/><path d="M30 30l24 24M54 30L30 54"/></svg>' + head('We could not place the order', '') + '<p>' + esc(s.text) + '</p>' +
      '<div class="vp-acts" style="justify-content:center">' + (s.retry ? '<button class="vp-btn" type="button" data-a="resave">Try again</button>' : '') + '<button class="vp-btn sec" type="button" data-a="other">Back</button></div></div>';
    if (s.t === 'wait') return '<div class="vp-c" role="status" aria-live="polite"><div class="vp-spin"></div>' + head('Approve in your UPI app', '') + '<p>We sent a request for <b>' + esc(money(S.amount)) + '</b> to <b>' + esc(s.vpa) + '</b>. Open your UPI app and approve it.</p>' +
      '<div class="vp-count" data-count>3:00</div><div class="vp-ctrl"><b>Test mode</b><span>The request approves itself in a few seconds. Or choose:</span><div><button class="vp-btn sm" type="button" data-a="approve">Approve</button><button class="vp-btn sm sec" type="button" data-a="decline">Decline</button></div></div>' +
      '<div class="vp-acts" style="justify-content:center;margin-top:4px"><button class="vp-btn sm sec" type="button" data-a="cancelreq">Cancel request</button></div></div>';
    if (s.t === 'approve') return '<div class="vp-c"><div class="vp-frame"><header><span class="vp-mono" style="color:var(--vp-ink)">' + esc(s.mono) + '</span><b>' + esc(s.name) + '</b><span>Test page</span></header><div class="vp-fb"><dl><div><dt>Paying</dt><dd>Vitame</dd></div><div><dt>Amount</dt><dd>' + esc(money(S.amount)) + '</dd></div>' +
      s.lines.map(function (l) { return '<div><dt>' + esc(l[0]) + '</dt><dd>' + esc(l[1]) + '</dd></div>'; }).join('') + '</dl><p class="vp-hint" style="margin:0">This is a stand-in for the ' + esc(s.kind) + ' page. It never asks for a password.</p>' +
      '<div class="vp-acts" style="margin-top:6px"><button class="vp-btn sm" type="button" data-a="approve">Approve payment</button><button class="vp-btn sm sec" type="button" data-a="decline">Cancel</button></div></div></div></div>';
    if (s.t === 'otp') return '<div class="vp-c">' + head(s.title, '') + '<p>' + esc(s.text) + '</p><input class="vp-in vp-otp" id="vp-otp" inputmode="numeric" autocomplete="one-time-code" aria-label="6 digit OTP" placeholder="------">' + (s.msg ? '<p class="vp-err" role="alert">' + esc(s.msg) + '</p>' : '') +
      '<p class="vp-hint">Test mode: the OTP is 123456.</p><div class="vp-acts" style="justify-content:center;margin-top:4px"><button class="vp-btn" type="button" data-a="otp-go">Verify and pay</button><button class="vp-btn sec" type="button" data-a="decline">Cancel</button></div></div>';
    return '';
  }
  function setScreen(s, focus) { S.screen = s; paintPane(focus !== false); }
  function busy(title, text, next, ms) {
    var me = { t: 'busy', title: title, text: text }; setScreen(me);
    later(function () { if (S && S.screen === me) next(); }, REDUCE ? 200 : (ms || 1100));
  }
  function fail(text, title) { S.busy = false; setScreen({ t: 'fail', title: title, text: text }); }
  function otp(title, text, onOk) { setScreen({ t: 'otp', title: title, text: text, tries: 3, msg: '', onOk: onOk }); var i = $('#vp-otp', S.root); if (i) i.focus(); }

  /* ---------------------------------------------------------------- finishing: hand the result to checkout and place the order */
  function finish(res) {
    res.demo = DEMO && res.method !== 'cod'; // a test payment is never described as a real one
    S.res = res; S.busy = true; clearTimers();
    setScreen({ t: 'saving' });
    var p;
    try { p = S.o.onSuccess ? S.o.onSuccess(res) : { ok: true }; } catch (e) { p = { ok: false, error: 'Something went wrong. Please try again.' }; }
    Promise.resolve(p).then(function (r) {
      if (!S) return;
      S.busy = false;
      if (r && r.ok === false) return orderFail(res, r.error);
      var cod = res.method === 'cod', upi = res.method === 'upi' && !res.demo;
      setScreen({ t: 'done', title: cod ? 'Order placed' : upi ? 'Reference received' : 'Payment approved', text: cod ? 'Pay the courier when it arrives.' : upi ? 'We will confirm your payment shortly.' : 'This was a test, so no money was charged.' });
      later(function () { close(true); }, REDUCE ? 400 : 1300);
    }, function () { if (S) { S.busy = false; orderFail(res); } });
  }
  function orderFail(res, msg) {
    var t = (msg || 'Something went wrong while saving your order.') + (res.method === 'upi' && !res.demo ? ' If you already paid, keep your UPI reference (' + (S.data.f.utr || '') + ') and contact us.' : ' Nothing was charged.');
    setScreen({ t: 'orderfail', text: t, retry: true });
  }

  /* ---------------------------------------------------------------- events */
  function onClick(e) {
    var b = e.target.closest('[data-a]');
    if (e.target.closest('.vp-app')) S.data.touched = true; // they opened their UPI app, so they may be about to pay
    if (!b) { if (e.target === S.root) requestClose(); return; }
    var a = b.getAttribute('data-a'), v = b.getAttribute('data-v');
    if (a === 'close') return requestClose();
    if (a === 'forceclose') return close(false);
    if (a === 'method') { if (S.busy) return; clearTimers(); S.method = v; S.screen = null; S.data = { f: {} }; S.view = 'pane'; paint(); var h = $('#vp-title', S.root); if (h) h.focus({ preventScroll: true }); return; }
    if (a === 'back') { clearTimers(); S.view = 'nav'; S.screen = null; paint(); var m = $('[data-nav] [aria-selected=true]', S.root); if (m) m.focus(); return; }
    if (a === 'other') { clearTimers(); S.screen = null; S.data = { f: {} }; S.view = S.solo ? 'pane' : 'nav'; paint(); if (S.solo) { var t0 = $('#vp-title', S.root); if (t0) t0.focus({ preventScroll: true }); } return; }
    if (a === 'retry') { clearTimers(); S.screen = null; paintPane(true); return; }
    if (a === 'resave') return finish(S.res);
    if (a === 'handle') { var i = $('#vp-vpa', S.root), cur = (i.value || '').split('@')[0]; i.value = cur + v; S.data.f.vpa = i.value; i.focus(); return; }
    if (a === 'testcard') { S.data.f = Object.assign(S.data.f, { cn: v, nm: (S.data.f.nm && S.data.f.nm.trim().length >= 2) ? S.data.f.nm : ((S.o.customer && S.o.customer.name) || 'Test User'), ex: '12/34', cv: v.indexOf('3782') === 0 ? '1234' : '123' }); S.data.errs = {}; paintPane(); return; }
    if (a === 'copy') { S.data.touched = true; return copyId(b); }
    if (a === 'pick') { S.data[b.getAttribute('data-k')] = v; paintPane(); return; }
    if (a === 'upi-pay') return upiPay();
    if (a === 'upi-paid') return upiPaid();
    if (a === 'upi-noutr') return finish({ method: 'upi', paymentId: 'UPI paid, no UTR', label: 'UPI' });
    if (a === 'card-pay') return cardPay(S.method === 'emi' ? 'emi' : 'card');
    if (a === 'cod-go') return finish({ method: 'cod', paymentId: 'COD', label: 'Cash on delivery' });
    if (a === 'wallet-go') { var w = WALLETS.filter(function (x) { return x[0] === S.data.wallet; })[0]; return redirectTo('wallet', 'wallet', 'WALLET', S.data.wallet, w ? w[1] : 'W', [['Wallet balance', money(Math.max(2500, Math.ceil(S.amount / 500) * 500 + 1200))]], 'wallet'); }
    if (a === 'later-go') { var l = LATER.filter(function (x) { return x[0] === S.data.later; })[0]; return redirectTo('later', 'paylater', 'LATER', S.data.later, l ? l[1] : 'PL', [['Credit limit', money(Math.max(5000, Math.ceil(S.amount / 1000) * 1000 + 2000))], ['Pay by', l ? l[2] : 'Next month']], 'pay later'); }
    if (a === 'emi-bank') { S.data.emi.bank = v; paintPane(); return; }
    if (a === 'emi-plan') { S.data.emi.months = +v; paintPane(); return; }
    if (a === 'emi-go') { S.data.emi.card = true; S.data.f = {}; S.data.errs = {}; paintPane(true); return; }
    if (a === 'approve') return approve();
    if (a === 'decline') return fail(S.screen && S.screen.t === 'otp' ? 'You cancelled the verification.' : 'The payment was cancelled.', 'Payment cancelled');
    if (a === 'cancelreq') return fail('The payment request was cancelled.', 'Request cancelled');
    if (a === 'otp-go') return otpGo();
  }
    function redirectTo(key, method, code, name, mono, lines, kind) {
    if (!name) return;
    busy('Taking you to ' + name, 'Please wait while we open the ' + kind + ' page.', function () {
      setScreen({ t: 'approve', name: name, mono: mono, lines: lines, kind: kind, done: function () { finish({ method: method, paymentId: 'DEMO-' + code + '-' + String(name).replace(/[^A-Za-z]/g, '').slice(0, 6).toUpperCase() + '-' + rand(4), label: 'Test payment' }); } });
    }, 1200);
  }
  function approve() {
    var s = S.screen; if (!s) return;
    if (s.t === 'wait') return finish({ method: 'upi', paymentId: 'DEMO-UPI-' + rand(6), label: 'Test payment' });
    if (s.t === 'approve') return s.done();
  }
  function upiPay() {
    var v = String(S.data.f.vpa || '').trim();
    if (!/^[A-Za-z0-9._\-]{2,64}@[A-Za-z][A-Za-z0-9.\-]{1,30}$/.test(v)) { S.data.errs = { vpa: 'Enter a valid UPI ID, like name@okhdfcbank.' }; paintPane(); var i = $('#vp-vpa', S.root); if (i) i.focus(); return; }
    S.data.errs = {};
    var me = { t: 'wait', vpa: v, until: Date.now() + 180000 };
    setScreen(me);
    var iv = setInterval(function () { if (!S || S.screen !== me) return clearInterval(iv); if (!tickCount()) { clearInterval(iv); fail('The request expired before it was approved.', 'Request expired'); } }, 1000);
    S.timers.push(iv);
    later(function () { if (S && S.screen === me) approve(); }, REDUCE ? 600 : 6000);
  }
  function tickCount() {
    var s = S.screen, el = $('[data-count]', S.root); if (!s || s.t !== 'wait' || !el) return true;
    var left = Math.max(0, Math.round((s.until - Date.now()) / 1000));
    el.textContent = Math.floor(left / 60) + ':' + ('0' + (left % 60)).slice(-2);
    return left > 0;
  }
  /** Copies the UPI ID. If the browser refuses, select the text so the person can copy it themselves, and say so. */
  function copyId(btn) {
    var said = function (t) { btn.textContent = t; setTimeout(function () { if (btn.isConnected) btn.textContent = 'Copy'; }, 2000); };
    var pickText = function () { var code = $('.vp-id code', S.root); if (code && window.getSelection) { var r = document.createRange(); r.selectNodeContents(code); var sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); } said('Press and hold to copy'); };
    var legacy = function () {
      try { var ta = document.createElement('textarea'); ta.value = UPI_ID; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0'; S.root.appendChild(ta); ta.select(); var okc = document.execCommand('copy'); ta.parentNode.removeChild(ta); btn.focus({ preventScroll: true }); okc ? said('Copied') : pickText(); } catch (e) { pickText(); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(UPI_ID).then(function () { said('Copied'); }, legacy); else legacy();
  }
  function upiPaid() {
    var u = String(S.data.f.utr || '').replace(/\s/g, '');
    if (!/^\d{12}$/.test(u)) { S.data.errs = { utr: 'The UPI reference is 12 digits. You find it in your UPI app.' }; paintPane(); var i = $('#vp-utr', S.root); if (i) i.focus(); return; }
    S.data.errs = {}; S.data.f.utr = u;
    finish({ method: 'upi', paymentId: 'UPI UTR ' + u, label: 'UPI' });
  }
  function otpGo() {
    var s = S.screen, i = $('#vp-otp', S.root); if (!s || s.t !== 'otp') return;
    if (i && i.value === '123456') return s.onOk();
    s.tries--;
    if (s.tries <= 0) return fail('Too many wrong OTPs. The payment was stopped.', 'Payment stopped');
    s.msg = 'That OTP is not right. ' + s.tries + (s.tries === 1 ? ' try' : ' tries') + ' left.'; paintPane(); var n = $('#vp-otp', S.root); if (n) n.focus();
  }
  var FIELD = { 'vp-cn': 'cn', 'vp-nm': 'nm', 'vp-ex': 'ex', 'vp-cv': 'cv', 'vp-vpa': 'vpa', 'vp-utr': 'utr' };
  function onInput(e) {
    var t = e.target, id = t.id; if (!S) return;
    if (id === 'vp-cn') { var d = t.value.replace(/\D/g, ''); t.value = fmtCard(d); S.data.f.cn = t.value; var br = $('[data-brand]', S.root); if (br) br.textContent = brandOf(d); }
    else if (id === 'vp-ex') { var x = t.value.replace(/\D/g, '').slice(0, 4); if (x.length >= 3) x = x.slice(0, 2) + '/' + x.slice(2); else if (x.length === 2 && e.inputType !== 'deleteContentBackward') x += '/'; t.value = x; S.data.f.ex = x; }
    else if (id === 'vp-cv') { t.value = t.value.replace(/\D/g, '').slice(0, 4); S.data.f.cv = t.value; }
    else if (id === 'vp-nm') S.data.f.nm = t.value;
    else if (id === 'vp-vpa') S.data.f.vpa = t.value.trim();
    else if (id === 'vp-utr') { t.value = t.value.replace(/\D/g, '').slice(0, 12); S.data.f.utr = t.value; S.data.touched = true; }
    else if (id === 'vp-otp') t.value = t.value.replace(/\D/g, '').slice(0, 6);
    var fk = FIELD[id];
    if (fk && S.data.errs && S.data.errs[fk]) { // the person is fixing it: drop the message
      delete S.data.errs[fk]; t.removeAttribute('aria-invalid');
      var box = t.closest('.vp-f > div, .vp-step > div, div'), er = box && box.querySelector('.vp-err'); if (er) er.remove();
    }
  }
  function onKey(e) {
    if (e.key === 'Escape') { if (!S.busy) { e.preventDefault(); requestClose(); } return; }
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
      var id = e.target.id, map = { 'vp-vpa': 'upi-pay', 'vp-utr': 'upi-paid', 'vp-otp': 'otp-go', 'vp-cn': 'card-pay', 'vp-nm': 'card-pay', 'vp-ex': 'card-pay', 'vp-cv': 'card-pay' };
      if (map[id]) { e.preventDefault(); var btn = $('[data-a="' + map[id] + '"]', S.root); if (btn && !btn.disabled) btn.click(); }
      return;
    }
    if (e.key === 'Tab') { // keep focus inside the window
      var f = [].slice.call(S.root.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]')).filter(function (n) { return n.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.target.getAttribute && e.target.getAttribute('role') === 'tab') { // arrow keys move through the methods
      var tabs = [].slice.call(S.root.querySelectorAll('[data-nav] button:not(:disabled)')), at = tabs.indexOf(e.target);
      if (at > -1) { e.preventDefault(); tabs[(at + (e.key === 'ArrowDown' ? 1 : -1) + tabs.length) % tabs.length].focus(); }
    }
  }

  window.VitamePay = {
    open: open,
    demo: DEMO,
    /** A short line for under the pay button. */
    note: function () {
      if (DEMO) return 'Test mode: the payment window is a demo. No real money is charged.';
      var names = methods().filter(function (m) { return m.ok; }).map(function (m) { return m.id === 'upi' ? 'UPI (Google Pay, PhonePe, Paytm or any UPI app)' : m.t; });
      return 'Pay securely with ' + (names.length > 1 ? names.slice(0, -1).join(', ') + ' or ' + names[names.length - 1] : names[0]) + '.';
    }
  };
})();
