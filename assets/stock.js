/* Vitame live stock. Reads the "Vitame Stock" Google Sheet and blocks orders for sold-out drinks. */
(function () {
  "use strict";
  var SHEET_ID = "1MtZ2EmVmS9nlwtn6apKdwyssL2xj6WoW0LLxgkwo7wY";
  var TAB = "Stock";
  var REFRESH_MS = 60000;
  var TZ_OFFSET_MIN = 330; // restock times typed in the sheet are read as India time (IST, UTC+5:30)
  var MSG = "It might be your neighbour which might be drinking it rn, all because you were late, so be on time from the next time";
  var NAMES = { orange: "Orange Riot", beet: "Beet & Berry", green: "Green Machine", yuzu: "Yuzu Ginger" };

  var stock = {}; // id -> { qty, backAt (ms | null), name }
  var modal = null, tick = null, openId = null;

  /* ---------- sheet loading ---------- */
  function parseCsv(t) {
    var rows = [], row = [], f = "", q = false;
    for (var i = 0; i < t.length; i++) {
      var c = t[i];
      if (q) {
        if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(f); f = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
      else f += c;
    }
    if (f !== "" || row.length) { row.push(f); rows.push(row); }
    return rows;
  }

  var MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  function parseWhen(s) {
    s = (s || "").trim();
    if (!s) return null;
    var y, mo, d, h, mi, ap, m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T]+(\d{1,2}):(\d{2})/))) { y = +m[1]; mo = +m[2] - 1; d = +m[3]; h = +m[4]; mi = +m[5]; }
    else {
      m = s.match(/(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s+)?([A-Za-z]{3,})\.?,?\s*(?:(\d{4}),?\s*)?(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
      if (m) { d = +m[1]; mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()); y = m[3] ? +m[3] : null; h = +m[4]; mi = m[5] ? +m[5] : 0; ap = m[6]; }
      else {
        m = s.match(/([A-Za-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(?:(\d{4}),?\s*)?(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
        if (!m) return null;
        mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()); d = +m[2]; y = m[3] ? +m[3] : null; h = +m[4]; mi = m[5] ? +m[5] : 0; ap = m[6];
      }
      if (mo < 0) return null;
      if (ap) { ap = ap.toLowerCase(); if (ap === "pm" && h < 12) h += 12; if (ap === "am" && h === 12) h = 0; }
    }
    var now = Date.now();
    var base = new Date(now + TZ_OFFSET_MIN * 60000).getUTCFullYear();
    var make = function (yy) { return Date.UTC(yy, mo, d, h, mi) - TZ_OFFSET_MIN * 60000; };
    var t = make(y || base);
    if (!y && t < now - 60 * 24 * 3600 * 1000) t = make(base + 1); // "5 January" typed in December means next year
    return isNaN(t) ? null : t;
  }

  function load() {
    var base = "https://docs.google.com/spreadsheets/d/" + SHEET_ID;
    var urls = [base + "/gviz/tq?tqx=out:csv&sheet=" + encodeURIComponent(TAB) + "&_=" + Date.now(), base + "/export?format=csv&gid=0&_=" + Date.now()];
    var get = function (u) { return fetch(u, { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error("sheet " + r.status); return r.text(); }); };
    return get(urls[0]).catch(function () { return get(urls[1]); }).then(function (txt) {
      var rows = parseCsv(txt), next = {};
      for (var i = 1; i < rows.length; i++) {
        var r = rows[i], id = (r[0] || "").trim().toLowerCase();
        if (!id) continue;
        var raw = (r[2] || "").replace(/,/g, "").trim();
        var qty = raw === "" ? NaN : Number(raw);
        if (isNaN(qty)) continue; // unreadable or blank stock: leave the drink on sale
        next[id] = { qty: qty, backAt: parseWhen(r[3]), name: (r[1] || NAMES[id] || id).trim() };
      }
      stock = next;
      paint();
    }).catch(function () { /* keep the last known stock; if there is none every drink stays on sale */ });
  }

  function isOut(id) { var s = stock[id]; return !!s && s.qty <= 0; }
  function nameOf(id) { return (stock[id] && stock[id].name) || NAMES[id] || id; }

  /* ---------- styles ---------- */
  var css = document.createElement("style");
  css.textContent =
    ".pp-badge{position:absolute;z-index:6;top:12px;right:12px;background:#1a1410;color:#fff7eb;font:700 .72rem 'Space Grotesk','Inter',sans-serif;letter-spacing:.12em;text-transform:uppercase;padding:.45em .8em;border-radius:999px;box-shadow:3px 3px 0 #e03442;pointer-events:none}" +
    ".ptile.pp-oos .ptile-stage,.ptile.pp-oos .card-bottle,[data-row].pp-oos>*:not(.pp-badge){opacity:.55;filter:grayscale(.6)}" +
    "[data-row].pp-oos{position:relative}[data-row].pp-oos .pp-badge{top:50%;right:150px;transform:translateY(-50%)}" +
    ".pp-oos-note{margin:0 0 12px;padding:.8em 1em;border:3px solid #1a1410;border-radius:16px;background:#fff7eb;color:#1a1410;font-weight:600;font-size:.92rem;box-shadow:4px 4px 0 #1a1410}" +
    ".pp-oos-note b{font-family:'Space Grotesk','Inter',sans-serif}" +
    "[data-buy].pp-oos{opacity:.6}" +
    ".pp-scrim{position:fixed;inset:0;z-index:1000;background:rgba(26,20,16,.62);display:grid;place-items:center;padding:18px;opacity:0;transition:opacity .25s}" +
    ".pp-scrim.on{opacity:1}" +
    ".pp-card{width:100%;max-width:460px;background:#fff7eb;color:#1a1410;border:3px solid #1a1410;border-radius:28px;box-shadow:8px 8px 0 #1a1410;padding:28px clamp(20px,5vw,34px) 26px;text-align:center;transform:translateY(14px) scale(.97);transition:transform .3s cubic-bezier(.2,.9,.3,1.2);position:relative;font-family:'Inter',system-ui,sans-serif}" +
    ".pp-scrim.on .pp-card{transform:none}" +
    ".pp-x{position:absolute;top:12px;right:14px;width:38px;height:38px;border-radius:50%;border:2px solid #1a1410;background:transparent;font-size:1.3rem;line-height:1;cursor:pointer;color:#1a1410}" +
    ".pp-x:hover{background:#1a1410;color:#fff7eb}" +
    ".pp-tag{display:inline-block;background:#e03442;color:#fff7eb;font:700 .75rem 'Space Grotesk','Inter',sans-serif;letter-spacing:.14em;text-transform:uppercase;padding:.45em .9em;border-radius:999px;margin-bottom:12px}" +
    ".pp-card h2{font:400 clamp(2rem,7vw,2.8rem)/1 'Anton','Impact',sans-serif;text-transform:uppercase;margin:0 0 12px}" +
    ".pp-card p{margin:0 0 18px;font-weight:500;line-height:1.5}" +
    ".pp-label{font:700 .72rem 'Space Grotesk','Inter',sans-serif;letter-spacing:.16em;text-transform:uppercase;opacity:.65;margin-bottom:8px}" +
    ".pp-time{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px}" +
    ".pp-time div{background:#ffdc52;border:3px solid #1a1410;border-radius:16px;padding:10px 4px 8px;box-shadow:3px 3px 0 #1a1410}" +
    ".pp-time b{display:block;font:400 clamp(1.7rem,6vw,2.3rem)/1 'Anton','Impact',sans-serif;font-variant-numeric:tabular-nums}" +
    ".pp-time span{font:700 .62rem 'Space Grotesk','Inter',sans-serif;letter-spacing:.12em;text-transform:uppercase}" +
    ".pp-soon{margin-bottom:20px;padding:14px;border:3px solid #1a1410;border-radius:16px;background:#ffdc52;font-weight:700;box-shadow:3px 3px 0 #1a1410}" +
    ".pp-ok{width:100%;height:52px;border-radius:999px;border:3px solid #1a1410;background:#ff8a2a;color:#1a1410;font:700 1rem 'Inter',sans-serif;cursor:pointer;box-shadow:4px 4px 0 #1a1410;transition:transform .2s,box-shadow .2s}" +
    ".pp-ok:hover{transform:translate(-2px,-2px);box-shadow:6px 6px 0 #1a1410}";
  document.head.appendChild(css);

  /* ---------- countdown modal ---------- */
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function timerHtml(id) {
    var s = stock[id], t = s && s.backAt;
    if (!t) return '<div class="pp-soon">Back soon. We will restock as quickly as we can.</div>';
    var left = t - Date.now();
    if (left <= 0) return '<div class="pp-soon">Restocking any moment now. Check back in a few minutes.</div>';
    var sec = Math.floor(left / 1000), d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60), x = sec % 60;
    return '<div class="pp-time" role="timer" aria-live="off"><div><b>' + pad(d) + '</b><span>Days</span></div><div><b>' + pad(h) + '</b><span>Hours</span></div><div><b>' + pad(m) + '</b><span>Mins</span></div><div><b>' + pad(x) + '</b><span>Secs</span></div></div>';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function closeModal() {
    if (!modal) return;
    var m = modal; modal = null; openId = null; clearInterval(tick);
    m.classList.remove("on");
    setTimeout(function () { m.remove(); }, 250);
    document.removeEventListener("keydown", onKey);
  }
  function onKey(e) { if (e.key === "Escape") closeModal(); }
  function render() {
    if (!modal) return;
    if (!isOut(openId)) { closeModal(); return; } // restocked while the pop-up was open
    modal.querySelector("[data-pp-timer]").innerHTML = timerHtml(openId);
  }
  function showModal(id) {
    if (modal) closeModal();
    openId = id;
    var el = document.createElement("div");
    el.className = "pp-scrim";
    el.innerHTML =
      '<div class="pp-card" role="dialog" aria-modal="true" aria-labelledby="pp-t">' +
      '<button class="pp-x" type="button" aria-label="Close">&times;</button>' +
      '<span class="pp-tag">Sold out</span>' +
      '<h2 id="pp-t">' + esc(nameOf(id)) + ' is gone</h2>' +
      '<p>' + esc(MSG) + '.</p>' +
      '<div class="pp-label">Back in stock in</div>' +
      '<div data-pp-timer>' + timerHtml(id) + '</div>' +
      '<button class="pp-ok" type="button">Got it</button></div>';
    document.body.appendChild(el);
    modal = el;
    requestAnimationFrame(function () { el.classList.add("on"); });
    el.addEventListener("click", function (e) { if (e.target === el || e.target.closest(".pp-x") || e.target.closest(".pp-ok")) closeModal(); });
    document.addEventListener("keydown", onKey);
    el.querySelector(".pp-ok").focus();
    clearInterval(tick);
    tick = setInterval(function () { render(); paintNotes(); }, 1000);
  }

  /* ---------- sold-out marks on the page ---------- */
  function badge() { var b = document.createElement("span"); b.className = "pp-badge"; b.textContent = "Sold out"; return b; }
  function mark(el, out) {
    if (!el) return;
    el.classList.toggle("pp-oos", out);
    var b = el.querySelector(":scope > .pp-badge");
    if (out && !b) el.appendChild(badge());
    if (!out && b) b.remove();
  }
  function paintNotes() {
    var id = (location.hash || "").slice(1);
    var buy = document.querySelector("[data-buy]");
    if (!buy) return;
    var note = document.querySelector(".pp-oos-note");
    if (!isOut(id)) { buy.classList.remove("pp-oos"); if (note) note.remove(); return; }
    buy.classList.add("pp-oos");
    if (!note) { note = document.createElement("p"); note.className = "pp-oos-note"; buy.parentNode.insertBefore(note, buy); }
    var t = stock[id].backAt, left = t ? t - Date.now() : 0, txt;
    if (!t) txt = "<b>Sold out.</b> Back soon.";
    else if (left <= 0) txt = "<b>Sold out.</b> Restocking any moment now.";
    else { var s = Math.floor(left / 1000), d = Math.floor(s / 86400); txt = "<b>Sold out.</b> Back in " + (d ? d + "d " : "") + pad(Math.floor(s % 86400 / 3600)) + "h " + pad(Math.floor(s % 3600 / 60)) + "m " + pad(s % 60) + "s"; }
    if (note.dataset.t !== txt) { note.innerHTML = txt; note.dataset.t = txt; }
  }
  var painting = false;
  function paint() {
    if (painting) return; painting = true;
    try {
      Object.keys(NAMES).forEach(function (id) {
        var out = isOut(id);
        document.querySelectorAll('.ptile:has([data-add="' + id + '"])').forEach(function (t) { mark(t, out); });
        document.querySelectorAll('[data-row="' + id + '"]').forEach(function (r) { mark(r, out); });
      });
      paintNotes();
    } finally { painting = false; }
  }
  var mo = null, queued = false;
  function watch() {
    if (!document.body || mo) return;
    mo = new MutationObserver(function () {
      if (painting || queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; paint(); });
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  /* ---------- blocking orders ---------- */
  function firstOut(ids) { for (var i = 0; i < ids.length; i++) if (isOut(ids[i])) return ids[i]; return null; }
  function block(ids) { var id = firstOut(ids); if (id) { showModal(id); return true; } return false; }
  function cartIds() {
    var out = [];
    try {
      JSON.parse(localStorage.getItem("pp-cart") || "[]").forEach(function (it) {
        if (it.flavour) out.push(it.flavour);
        if (it.mix) Object.keys(it.mix).forEach(function (k) { if (it.mix[k] > 0) out.push(k); });
      });
    } catch (e) {}
    return out;
  }

  document.addEventListener("click", function (e) {
    var t = e.target; if (!t || !t.closest) return;
    var id = null, el;
    if ((el = t.closest("[data-add]"))) id = el.dataset.add; // shop grid: add one bottle
    else if (t.closest("[data-buy]")) id = (location.hash || "").slice(1); // product page
    else if ((el = t.closest('[data-row] button[data-d="1"]'))) id = el.closest("[data-row]").dataset.row; // pack builder: add a drink to the box
    else if (t.closest("[data-checkout]")) { var c = firstOut(cartIds()); if (c) id = c; }
    if (id && isOut(id)) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); showModal(id); }
  }, true);

  window.ppStock = { block: block, isOut: isOut, get: function () { return stock; }, reload: load, parseWhen: parseWhen };

  function start() { watch(); load(); setInterval(load, REFRESH_MS); window.addEventListener("hashchange", function () { setTimeout(paint, 50); }); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
