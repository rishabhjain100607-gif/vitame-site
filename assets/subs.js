/* My subscriptions: see your boxes and skip, pause, swap, reschedule or cancel them. Runs on the shared site shell. */
import { i as initShell, B as brand, k as intro, l as reveal, n as countUp } from "./shell-PN3sp6ph.js";

const CFG = window.PP || {};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LS = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } },
};
const money = (n) => "₹" + (Math.abs(n % 1) > 0.004 ? Number(n).toFixed(2) : Math.round(n).toLocaleString("en-IN"));

initShell("subscriptions");
document.title = "My subscriptions | " + brand.name;

const FL = [
  { id: "orange", name: "Orange Riot", c: "#ff8a2a" },
  { id: "beet", name: "Beet & Berry", c: "#e03442" },
  { id: "green", name: "Green Machine", c: "#4aae4d" },
  { id: "yuzu", name: "Yuzu Ginger", c: "#ffdc52" },
];
const FREQS = [
  { id: "weekly", label: "Every week", days: 7 },
  { id: "fortnight", label: "Every 2 weeks", days: 14 },
  { id: "monthly", label: "Every 4 weeks", days: 28 },
];
const session = LS.get("pp-session", {}) || {};
const state = { subs: [], orders: [], rules: null, today: "", err: "", loaded: false };

/* ---------------------------------------------------------------- dates */
const dnum = (iso) => Math.floor(Date.parse(iso + "T00:00:00Z") / 86400000);
const addDays = (iso, n) => new Date((dnum(iso) + n) * 86400000).toISOString().slice(0, 10);
const dayFmt = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const longFmt = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const fd = (iso) => (iso ? dayFmt.format(new Date(iso + "T12:00:00Z")) : "-");
const fl = (iso) => (iso ? longFmt.format(new Date(iso + "T12:00:00Z")) : "-");
const fromNow = (n) => (n == null ? "" : n < 0 ? "overdue" : n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);
function todayLocal() { return state.today || new Date(Date.now() + 19800000).toISOString().slice(0, 10); }

/* ---------------------------------------------------------------- server */
function tokenOf(id) { const x = LS.get("pp-subs", []).find((s) => s.id === id); return x ? x.token : ""; }
async function api(body, ms = 22000) {
  if (!CFG.ordersEndpoint) return { ok: false, error: "The shop is not connected yet." };
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(CFG.ordersEndpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body), signal: ctl.signal, redirect: "follow" });
    return await r.json();
  } catch { return { ok: false, net: true, error: "Could not reach the server. Check your connection and try again." }; } finally { clearTimeout(t); }
}
const friendly = (j) => (/unknown action/i.test((j && j.error) || "") ? "Subscriptions are not switched on yet. Please try again later." : (j && j.error) || "Something went wrong. Please try again.");

function importFromLink() {
  const p = new URLSearchParams(location.search).get("s");
  if (!p) return;
  const dot = p.indexOf("."), id = p.slice(0, dot), token = p.slice(dot + 1);
  if (/^SUB-\d+$/.test(id) && /^[a-f0-9]{10,40}$/.test(token)) {
    const all = LS.get("pp-subs", []);
    if (!all.some((x) => x.id === id)) { all.push({ id, token }); LS.set("pp-subs", all); }
  }
  history.replaceState(null, "", location.pathname + location.hash);
}

/** Orders made by the daily job show up in My Orders too, with live tracking. */
function shareOrders(list, email) {
  if (!list || !list.length) return;
  const all = LS.get("pp-orders", []);
  let changed = false;
  list.forEach((o) => { if (!all.some((x) => x.id === o.id)) { all.push({ id: o.id, token: o.token, imported: true, sub: o.sub, at: o.at, to: { email: session.email || email || "" } }); changed = true; } });
  if (changed) LS.set("pp-orders", all);
}

async function load(quiet) {
  const list = LS.get("pp-subs", []);
  const ords = LS.get("pp-orders", []).filter((x) => x && x.token && /^PP-\d+$/.test(x.id)).slice(-20).map((x) => ({ id: x.id, token: x.token }));
  if (!list.length && !ords.length) { state.loaded = true; render(); return; }
  const j = await api({ action: "sub_mine", subs: list, orders: ords });
  if (j && j.ok) {
    if (j.claimed && j.claimed.length) { const all = LS.get("pp-subs", []); j.claimed.forEach((x) => { if (!all.some((y) => y.id === x.id)) all.push(x); }); LS.set("pp-subs", all); }
    state.subs = j.subs || []; state.orders = j.orders || []; state.rules = j.rules || state.rules; state.today = j.today || state.today; state.err = "";
    shareOrders(state.orders, state.subs[0] && state.subs[0].email);
  } else if (!state.subs.length) state.err = friendly(j);
  state.loaded = true;
  if (!quiet || !modalEl) render();
}

/* ---------------------------------------------------------------- the cards */
const flavour = (id) => FL.find((f) => f.id === id) || { id, name: id, c: "#999" };
const STATUS = { Active: "is-active", Paused: "is-paused", Cancelled: "is-cancelled" };
function boxHtml(s) {
  return FL.filter((f) => s.mix[f.id]).map((f) => `<span class="sb-fl" style="--c:${f.c}"><img src="./media/bottle-${f.id}.webp" alt="" width="34" height="46"><b>${s.mix[f.id]}×</b> ${esc(f.name)}</span>`).join("");
}
function historyHtml(s) {
  const rows = state.orders.filter((o) => o.sub === s.id);
  if (!rows.length) return "";
  return `<details class="sb-hist"><summary>Past deliveries <b>${rows.length}</b></summary><ul>${rows.map((o) => `<li><a href="./orders.html#${esc(o.id)}"><span>${esc(o.id)}</span><span>${o.at ? fd(new Date(o.at + 19800000).toISOString().slice(0, 10)) : ""}</span><em class="st-mini ${/Delivered/.test(o.status) ? "ok" : /Cancel/.test(o.status) ? "bad" : ""}">${esc(o.status || "Placed")}</em></a></li>`).join("")}</ul></details>`;
}
function cardHtml(s, i) {
  const active = s.status === "Active", paused = s.status === "Paused", gone = s.status === "Cancelled";
  const left = s.daysToNext;
  const locked = active && !s.canChange;
  let note = "";
  if (active && s.canChange) note = `<p class="sb-note">Change, skip or swap until <b>${esc(fd(s.changeUntil))}</b>. After that we pack it.</p>`;
  else if (locked) note = `<p class="sb-note is-lock"><b>Your next box is with our packers.</b> You can change the ones after it.</p>`;
  else if (paused) note = `<p class="sb-note">Paused${s.resume ? ` until <b>${esc(fd(s.resume))}</b>, then it restarts by itself` : ". Resume whenever you like"}. Nothing is sent while it is paused.</p>`;
  else if (gone) note = `<p class="sb-note">Cancelled. No more boxes will be sent.</p>`;
  const alert = s.attn && active ? `<p class="sb-alert"><b>Heads up:</b> ${esc(s.attn.replace(/^[^:]*:\s*/, ""))} Swap that flavour or skip this one, or we will skip it for you.</p>` : "";
  const feeTxt = s.ship === "Premium" ? `+ ${money(s.fee)} premium delivery` : "Free delivery";
  const btn = (act, label, cls = "", dis = false) => `<button type="button" class="sb-btn ${cls}" data-act="${act}" data-id="${esc(s.id)}"${dis ? " disabled" : ""}>${label}</button>`;
  let acts = "";
  if (active) acts = btn("skip", "Skip next", "", !s.canChange) + btn("mix", "Change box", "", !s.canChange) + btn("next", "Change date", "", !s.canChange) + btn("freq", "Rhythm") + btn("pause", "Pause") + btn("details", "Delivery details") + btn("cancel", "Cancel", "is-quiet");
  else if (paused) acts = btn("resume", "Resume", "is-pri") + btn("mix", "Change box") + btn("freq", "Rhythm") + btn("details", "Delivery details") + btn("cancel", "Cancel", "is-quiet");
  else acts = `<a class="pill solid" href="#" data-auth data-go="./subscribe.html" data-plain>Start a new subscription</a>`;
  return `<article class="sb ${STATUS[s.status] || ""}" data-sub="${esc(s.id)}" data-reveal data-reveal-delay="${Math.min(i, 5) * 0.06}">
    <header class="sb-top"><span class="sb-id">${esc(s.id)}</span><span class="sb-st"><i></i>${esc(s.status)}</span></header>
    <div class="sb-box">${boxHtml(s)}</div>
    ${s.boxes > 1 ? `<p class="sb-boxes">${s.boxes} boxes of ${s.size} bottles each delivery</p>` : `<p class="sb-boxes">${s.size}-bottle box</p>`}
    ${gone ? "" : `<div class="sb-next"><small>${paused ? "Restarts" : "Next delivery"}</small><b>${esc(paused ? (s.resume ? fd(s.resume) : "When you resume") : fd(s.next))}</b>${active && left != null ? `<span class="sb-in">${esc(fromNow(left))}</span>` : ""}</div>`}
    <dl class="sb-meta"><div><dt>Rhythm</dt><dd>${esc(s.freqLabel.replace(/^./, (c) => c.toUpperCase()))}</dd></div><div><dt>Per delivery</dt><dd>${money(s.price)}</dd><small>${esc(feeTxt)}</small></div><div><dt>Delivered</dt><dd>${s.done}${s.skipped ? ` <small>(${s.skipped} skipped)</small>` : ""}</dd></div></dl>
    ${alert}${note}
    <div class="sb-acts">${acts}</div>
    ${historyHtml(s)}
  </article>`;
}
function render() {
  const list = $("[data-list]"), empty = $("[data-empty]"), banner = $("[data-banner]");
  const order = { Active: 0, Paused: 1, Cancelled: 2 };
  const subs = state.subs.slice().sort((a, b) => order[a.status] - order[b.status] || (a.next || "").localeCompare(b.next || ""));
  const act = subs.filter((s) => s.status === "Active");
  const soon = act.map((s) => s.next).filter(Boolean).sort()[0];
  const stats = [{ l: "Active", v: act.length }, { l: "Next box", t: soon ? fd(soon) : "-" }, { l: "Delivered", v: subs.reduce((n, s) => n + s.done, 0) }];
  $("[data-stats]").innerHTML = stats.map((s) => `<div class="od-stat"><b${s.v != null ? ` data-count="${s.v}"` : ""}>${s.v != null ? 0 : esc(s.t)}</b><small>${s.l}</small></div>`).join("");
  if (!renderStatsOnce.done) { countUp($("[data-stats]")); renderStatsOnce.done = true; } else $$("[data-count]", $("[data-stats]")).forEach((b) => { b.textContent = b.dataset.count; });
  banner.hidden = !state.err; banner.textContent = state.err;
  list.innerHTML = subs.map(cardHtml).join("");
  const none = !subs.length && state.loaded;
  empty.hidden = !none || !!state.err; list.hidden = !subs.length;
  $("[data-help]").hidden = !!subs.length || !state.loaded;
  reveal(list);
}
const renderStatsOnce = { done: false };

/* ---------------------------------------------------------------- dialog + toast */
let modalEl = null, lastFocus = null;
function toast(text, bad) {
  let t = $(".sb-toast");
  if (!t) { t = document.createElement("div"); t.className = "sb-toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = text; t.classList.toggle("is-bad", !!bad); t.classList.add("on");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 4800);
}
function closeModal() {
  if (!modalEl) return;
  modalEl.classList.remove("on");
  const m = modalEl; modalEl = null;
  setTimeout(() => m.remove(), 220);
  document.body.classList.remove("sb-lock");
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}
/** o: { title, sub, body, ok, danger, build(root) -> () => body for the server (or null to stop), after(sub) -> message } */
function openModal(o) {
  closeModal();
  lastFocus = document.activeElement;
  const v = document.createElement("div");
  v.className = "sb-veil";
  v.innerHTML = `<div class="sb-modal" role="dialog" aria-modal="true" aria-labelledby="sbm-t"><button type="button" class="sb-x" data-x aria-label="Close">×</button><h2 id="sbm-t">${esc(o.title)}</h2>${o.sub ? `<p class="sb-msub">${o.sub}</p>` : ""}<div class="sb-mbody">${o.body || ""}</div><p class="sb-err" role="alert" data-err></p><div class="sb-mact"><button type="button" class="pill" data-x>${esc(o.no || "Not now")}</button><button type="button" class="pill solid ${o.danger ? "is-danger" : ""}" data-ok>${esc(o.ok || "Save")}</button></div></div>`;
  document.body.appendChild(v); document.body.classList.add("sb-lock");
  modalEl = v;
  requestAnimationFrame(() => v.classList.add("on"));
  const getBody = o.build ? o.build(v) : () => ({});
  const ok = $("[data-ok]", v), err = $("[data-err]", v);
  const setErr = (t) => { err.textContent = t || ""; };
  v.addEventListener("click", async (e) => {
    if (e.target === v || e.target.closest("[data-x]")) return closeModal();
    if (!e.target.closest("[data-ok]") || ok.disabled) return;
    const body = getBody(); if (body === null) return;
    setErr(""); ok.disabled = true; const label = ok.textContent; ok.textContent = "Saving...";
    const j = await api({ action: "sub_update", id: o.sub_id, token: tokenOf(o.sub_id), ...body });
    ok.disabled = false; ok.textContent = label;
    if (j && j.ok) {
      const i = state.subs.findIndex((s) => s.id === j.sub.id); if (i >= 0) state.subs[i] = j.sub;
      closeModal(); render(); toast(o.after ? o.after(j.sub) : "Saved."); load(true);
    } else { setErr(friendly(j)); if (j && j.net === undefined && /cancelled|too late|packed/i.test(j.error || "")) load(true); }
  });
  v.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
  const first = $("input:not([type=hidden]),select,button[data-act],[data-first]", $(".sb-mbody", v)) || ok;
  setTimeout(() => first.focus(), 60);
  return v;
}

/* ---------------------------------------------------------------- actions */
const find = (id) => state.subs.find((s) => s.id === id);
const priceOf = (size, boxes) => { const r = state.rules || {}; const p = r.prices && r.prices[size]; return Math.round((p ? p.sub : size * (r.single || 60) * (r.rate || 0.8)) * boxes * 100) / 100; };
const dateField = (id, min, max, val) => `<label class="sb-fld"><span>Date</span><input type="date" id="${id}" min="${min}" max="${max}" value="${val}"><small data-dl></small></label>`;
function bindDate(root, inp) { const dl = $("[data-dl]", root), up = () => { dl.textContent = inp.value ? fl(inp.value) : ""; }; inp.addEventListener("input", up); up(); }

const ACTIONS = {
  skip(s) {
    const nx = addDays(s.next, s.freqDays);
    openModal({ sub_id: s.id, title: "Skip the next delivery?", sub: `We skip <b>${esc(fl(s.next))}</b>. Your next box is then <b>${esc(fl(nx))}</b>. You can skip as many as you like.`, ok: "Skip it", no: "Keep it", after: (u) => `Skipped. Next box ${fd(u.next)}.`, build: () => () => ({ op: "skip" }) });
  },
  pause(s) {
    const today = todayLocal(), min = state.rules ? state.rules.minNext : addDays(today, 4), max = addDays(today, 180);
    openModal({ sub_id: s.id, title: "Pause this subscription", sub: "Nothing is sent while it is paused. Your box and price stay saved.", ok: "Pause it", after: (u) => (u.resume ? `Paused until ${fd(u.resume)}.` : "Paused. Resume any time."),
      body: `<div class="sb-opts">${[["open", "Until I resume it"], ["14", "For 2 weeks"], ["28", "For 4 weeks"], ["date", "Until a date I pick"]].map(([v, t], i) => `<label class="sb-opt"><input type="radio" name="p" value="${v}"${i === 0 ? " checked" : ""}><span>${t}</span></label>`).join("")}</div><div data-pd hidden>${dateField("pd", min, max, addDays(today, 21))}</div>`,
      build: (r) => { bindDate(r, $("#pd", r)); r.addEventListener("change", (e) => { if (e.target.name === "p") $("[data-pd]", r).hidden = e.target.value !== "date"; }); return () => { const v = $("input[name=p]:checked", r).value; return { op: "pause", until: v === "open" ? "" : v === "date" ? $("#pd", r).value : addDays(today, Number(v)) }; }; } });
  },
  resume(s) {
    const today = todayLocal(), min = state.rules ? state.rules.minNext : addDays(today, 4), max = state.rules ? state.rules.maxNext : addDays(today, 90);
    openModal({ sub_id: s.id, title: "Resume your subscription", sub: "Pick the day you want your next box to arrive.", ok: "Resume", after: (u) => `Welcome back. Next box ${fd(u.next)}.`, body: dateField("rd", min, max, addDays(today, 7) < min ? min : addDays(today, 7)), build: (r) => { bindDate(r, $("#rd", r)); return () => ({ op: "resume", next: $("#rd", r).value }); } });
  },
  next(s) {
    const today = todayLocal(), min = state.rules ? state.rules.minNext : addDays(today, 4), max = state.rules ? state.rules.maxNext : addDays(today, 90);
    openModal({ sub_id: s.id, title: "Change the delivery date", sub: `Now: <b>${esc(fl(s.next))}</b>. Pick any day from ${esc(fd(min))} to ${esc(fd(max))}. Later boxes follow ${esc(s.freqLabel)} from the new date.`, ok: "Move it", after: (u) => `Moved. Next box ${fd(u.next)}.`, body: dateField("nd", min, max, s.next < min ? min : s.next), build: (r) => { bindDate(r, $("#nd", r)); return () => ({ op: "next", next: $("#nd", r).value }); } });
  },
  freq(s) {
    openModal({ sub_id: s.id, title: "How often?", sub: "This applies to the boxes after your next one.", ok: "Save rhythm", after: (u) => `Now ${u.freqLabel}.`,
      body: `<div class="sb-opts">${FREQS.map((f) => `<label class="sb-opt"><input type="radio" name="f" value="${f.id}"${f.id === s.freq ? " checked" : ""}><span>${f.label}</span></label>`).join("")}</div>`,
      build: (r) => () => ({ op: "freq", freq: $("input[name=f]:checked", r).value }) });
  },
  mix(s) {
    const sizes = [6, 12, 18]; if (!sizes.includes(s.size)) sizes.unshift(s.size);
    const cur = { size: s.size, boxes: s.boxes, c: { orange: 0, beet: 0, green: 0, yuzu: 0, ...s.mix } };
    const out = (id) => window.ppStock && window.ppStock.isOut && window.ppStock.isOut(id);
    openModal({ sub_id: s.id, title: "Change your box", sub: "Pick the flavours for every delivery from now on. A box holds 6, 12 or 18 bottles.", ok: "Save box", after: (u) => `Box updated. ${money(u.price)} per delivery.`,
      body: `<div class="sb-sizes" role="radiogroup" aria-label="Box size">${sizes.map((n) => `<button type="button" class="sb-size" role="radio" data-size="${n}" aria-checked="${n === cur.size}">${n}<small>bottles</small></button>`).join("")}</div>
        <div class="sb-mix">${FL.map((f) => `<div class="sb-mixr${out(f.id) ? " is-out" : ""}" style="--c:${f.c}"><img src="./media/bottle-${f.id}.webp" alt="" width="34" height="46"><span>${esc(f.name)}${out(f.id) ? "<em>Sold out</em>" : ""}</span><div class="sb-step"><button type="button" data-d="${f.id}|-1" aria-label="One less ${esc(f.name)}">−</button><b data-n="${f.id}">0</b><button type="button" data-d="${f.id}|1" aria-label="One more ${esc(f.name)}"${out(f.id) ? " disabled" : ""}>+</button></div></div>`).join("")}</div>
        <div class="sb-tot"><span data-need></span><button type="button" class="sb-link" data-rand>Surprise me</button></div>
        <div class="sb-boxrow"><span>Boxes per delivery</span><div class="sb-step"><button type="button" data-bx="-1" aria-label="One box less">−</button><b data-bn>1</b><button type="button" data-bx="1" aria-label="One box more">+</button></div></div>
        <p class="sb-price" data-price></p>`,
      build: (r) => {
        const ok = $("[data-ok]", r);
        const total = () => FL.reduce((n, f) => n + cur.c[f.id], 0);
        const paint = () => {
          FL.forEach((f) => { $(`[data-n="${f.id}"]`, r).textContent = cur.c[f.id]; });
          $$("[data-size]", r).forEach((b) => b.setAttribute("aria-checked", String(Number(b.dataset.size) === cur.size)));
          const t = total(), diff = cur.size - t;
          $("[data-need]", r).innerHTML = diff === 0 ? `<b>Box is full.</b> ${cur.size} of ${cur.size}` : diff > 0 ? `Pick <b>${diff}</b> more (${t} of ${cur.size})` : `Remove <b>${-diff}</b> (${t} of ${cur.size})`;
          $("[data-bn]", r).textContent = cur.boxes;
          $("[data-price]", r).innerHTML = `New price: <b>${money(priceOf(cur.size, cur.boxes))}</b> per delivery${s.ship === "Premium" ? " + premium delivery" : ", free delivery"}`;
          ok.disabled = diff !== 0;
        };
        r.addEventListener("click", (e) => {
          const sz = e.target.closest("[data-size]"), d = e.target.closest("[data-d]"), bx = e.target.closest("[data-bx]");
          if (sz) { cur.size = Number(sz.dataset.size); paint(); }
          if (d) { const [id, k] = d.dataset.d.split("|"); cur.c[id] = Math.max(0, Math.min(48, cur.c[id] + Number(k))); if (Number(k) > 0 && total() > cur.size) cur.c[id]--; paint(); }
          if (bx) { cur.boxes = Math.max(1, Math.min(5, cur.boxes + Number(bx.dataset.bx))); paint(); }
          if (e.target.closest("[data-rand]")) { const pool = FL.filter((f) => !out(f.id)); FL.forEach((f) => { cur.c[f.id] = 0; }); for (let i = 0; i < cur.size; i++) cur.c[pool[Math.floor(Math.random() * pool.length)].id]++; paint(); }
        });
        paint();
        return () => (total() !== cur.size ? null : { op: "mix", mix: { ...cur.c }, boxes: cur.boxes });
      } });
  },
  details(s) {
    openModal({ sub_id: s.id, title: "Delivery details", sub: "Used for every box from now on.", ok: "Save details", after: () => "Details saved.",
      body: `<div class="sb-form">${[["name", "Name", s.name, "name"], ["phone", "Mobile number", s.phone, "tel"], ["address", "Address", s.address, "street-address"], ["city", "City", s.city, "address-level2"], ["pin", "PIN code", s.pin, "postal-code"]].map(([k, l, v, ac]) => `<label class="sb-fld"><span>${l}</span><input id="f-${k}" value="${esc(v)}" autocomplete="${ac}"${k === "phone" || k === "pin" ? ' inputmode="numeric"' : ""}></label>`).join("")}
        <label class="sb-fld"><span>Delivery</span><select id="f-ship"><option value="Normal"${s.ship === "Normal" ? " selected" : ""}>Normal, free</option><option value="Premium"${s.ship === "Premium" ? " selected" : ""}>Premium, next day, +${money((state.rules && state.rules.premiumFee) || 99)}</option></select></label></div>`,
      build: (r) => () => ({ op: "details", name: $("#f-name", r).value, phone: $("#f-phone", r).value, address: $("#f-address", r).value, city: $("#f-city", r).value, pin: $("#f-pin", r).value, ship: $("#f-ship", r).value }) });
  },
  cancel(s) {
    openModal({ sub_id: s.id, title: "Cancel this subscription?", sub: "No more boxes will be sent. Boxes already on the way still arrive. Would a break help instead?", ok: "Cancel subscription", no: "Keep it", danger: true, after: () => "Subscription cancelled.",
      body: `<div class="sb-opts">${["Too many bottles", "Too expensive", "Not for me", "I am moving", "Something else"].map((t, i) => `<label class="sb-opt"><input type="radio" name="c" value="${t}"${i === 0 ? " checked" : ""}><span>${t}</span></label>`).join("")}</div><button type="button" class="sb-link" data-act="pause" data-id="${esc(s.id)}">Pause instead</button>`,
      build: (r) => { r.addEventListener("click", (e) => { const b = e.target.closest("[data-act=pause]"); if (b) { closeModal(); ACTIONS.pause(s); } }); return () => ({ op: "cancel", reason: $("input[name=c]:checked", r).value }); } });
  },
};

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-act][data-id]");
  if (!b || b.closest(".sb-veil") || b.disabled) return;
  const s = find(b.dataset.id);
  if (s && ACTIONS[b.dataset.act]) ACTIONS[b.dataset.act](s);
});

/* ---------------------------------------------------------------- start */
(async function start() {
  importFromLink();
  intro(document);
  render();
  await load();
  setInterval(() => { if (!document.hidden && !modalEl) load(true); }, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !modalEl) load(true); });
})();
