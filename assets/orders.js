/* My Orders: list, live tracking (Mapbox) and order details. Runs on the shared site shell. */
import { g as gsap, i as initShell, B as brand, m as money, w as cartApi, h as openCart, k as intro, l as reveal, n as countUp, q as subPrice } from "./shell-PN3sp6ph.js";

const CFG = window.PP || {};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const LS = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } },
};

initShell("orders");
document.title = "My orders | " + brand.name;

const dDay = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });
const dTime = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
const fDay = (ms) => (ms ? dDay.format(new Date(ms)) : "");
const fTime = (ms) => (ms ? dTime.format(new Date(ms)).replace(/\b(am|pm)\b/i, (x) => x.toUpperCase()) : "");

const STEPS = [
  { k: "Placed", t: "Order placed", d: "We have your order." },
  { k: "Packed", t: "Packed cold", d: "Bottled, boxed and on ice." },
  { k: "Out for delivery", t: "On the way", d: "Your courier is heading to you." },
  { k: "Delivered", t: "Delivered", d: "Enjoy it while it is cold." },
];
const ACTIVE = ["Placed", "Packed", "Out for delivery"];
const PROGRESS = { Placed: 14, Packed: 40, "Out for delivery": 72, Delivered: 100, Cancelled: 0 };
const STATUS_CLASS = { Placed: "st-placed", Packed: "st-packed", "Out for delivery": "st-out", Delivered: "st-delivered", Cancelled: "st-cancelled" };
const STATUS_LABEL = { Placed: "Order placed", Packed: "Packed", "Out for delivery": "On the way", Delivered: "Delivered", Cancelled: "Cancelled" };
const badge = (st) => `<span class="st ${STATUS_CLASS[st] || ""}"><i></i>${esc(STATUS_LABEL[st] || st)}</span>`;

/* ---------------------------------------------------------------- data */

const session = LS.get("pp-session", {}) || {};
const state = { orders: [], server: new Map(), warehouse: null, skew: 0, filter: "all", openId: null };

function importFromLink() {
  const t = new URLSearchParams(location.search).get("t");
  if (!t) return;
  const dot = t.indexOf(".");
  const id = t.slice(0, dot), token = t.slice(dot + 1);
  if (/^PP-\d+$/.test(id) && token) {
    const all = LS.get("pp-orders", []);
    if (!all.some((o) => o.id === id)) {
      all.push({ id, token, imported: true, at: Date.now(), to: { email: session.email || "" } });
      LS.set("pp-orders", all);
    }
  }
  history.replaceState(null, "", location.pathname + location.hash);
}

/** Boxes the daily subscription job placed for you: add them here so they can be tracked like any order. */
async function importSubOrders() {
  const subs = LS.get("pp-subs", []);
  if (!subs.length || !CFG.ordersEndpoint) return;
  try {
    const j = await api(CFG.ordersEndpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "sub_mine", subs }) });
    if (!j || !j.ok) return;
    const all = LS.get("pp-orders", []);
    let changed = false;
    (j.orders || []).forEach((o) => {
      const have = all.find((x) => x.id === o.id);
      if (!have) { all.push({ id: o.id, token: o.token, imported: true, sub: o.sub, at: o.at, to: { email: session.email || (j.subs[0] && j.subs[0].email) || "" } }); changed = true; }
      else if (!have.sub) { have.sub = o.sub; changed = true; }
    });
    if (changed) LS.set("pp-orders", all);
  } catch { /* offline */ }
}

function localOrders() {
  const me = (session.email || "").toLowerCase();
  return LS.get("pp-orders", []).filter((o) => o.id && (!o.to || !o.to.email || !me || o.to.email.toLowerCase() === me));
}

function firstFlavours(items, drinks) {
  const f = [];
  (items || []).forEach((i) => {
    if (i.flavour) f.push(i.flavour);
    if (i.mix) Object.keys(i.mix).forEach((k) => i.mix[k] > 0 && f.push(k));
  });
  if (!f.length && drinks) Object.keys(drinks).forEach((k) => drinks[k] > 0 && f.push(k));
  return [...new Set(f)];
}

function itemsText(o) {
  if (o.items && o.items.length) return o.items.map((i) => (i.qty > 1 ? i.qty + " × " : "") + i.name).join(", ");
  return o.itemsServer || "Your order";
}

function bottleCount(o) {
  if (o.drinks) return Object.values(o.drinks).reduce((a, b) => a + (Number(b) || 0), 0);
  return (o.items || []).reduce((n, i) => n + (i.kind === "pack" ? (parseInt(i.name, 10) || 6) * i.qty : i.qty), 0);
}

/** One view of an order: what this device saved, overlaid with the latest from the sheet. */
function merge(loc) {
  const s = state.server.get(loc.id) || null;
  const pay = loc.pay || (loc.status === "Paid" || loc.status === "Pending" ? loc.status : "");
  return {
    id: loc.id, token: loc.token || "", hasServer: !!s, sub: loc.sub || "",
    status: s ? s.status : loc.fallbackStatus || "Placed",
    placedAt: (s && s.placedAt) || loc.at || 0,
    items: loc.items || null, itemsServer: s && s.items, drinks: s && s.drinks,
    subtotal: s ? s.subtotal : loc.subtotal, discount: s ? s.discount : loc.discount, shipFee: s ? s.shipFee : loc.shipFee,
    total: s ? s.total : loc.total ?? loc.paid ?? 0,
    ship: s ? s.ship : loc.ship === "premium" ? "Premium" : "Normal",
    deliveryDate: s ? s.deliveryDate : loc.date || "",
    address: s ? s.address : loc.to && loc.to.address, city: s ? s.city : loc.to && loc.to.city, pin: s ? s.pin : loc.to && loc.to.pin,
    name: s ? s.name : loc.to && loc.to.name,
    payStatus: (s && s.payStatus) || pay || "Pending", paymentId: s && s.paymentId,
    dest: (s && s.dest) || LS.get("pp-geo:" + loc.id, null), loc: s && s.loc, courier: s && s.courier, deliveredAt: s && s.deliveredAt,
  };
}

function rebuild() {
  state.orders = localOrders().map(merge).sort((a, b) => b.placedAt - a.placedAt);
}

async function api(url, opts, ms = 15000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal, redirect: "follow" });
    return await r.json();
  } finally { clearTimeout(t); }
}

let syncing = false;
async function sync() {
  if (!CFG.ordersEndpoint || syncing) return false;
  const list = localOrders().filter((o) => o.token).map((o) => ({ id: o.id, token: o.token }));
  if (!list.length) return false;
  syncing = true;
  try {
    const j = await api(CFG.ordersEndpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "mine", orders: list }) });
    if (j && j.ok) {
      j.orders.forEach((o) => state.server.set(o.id, o));
      state.warehouse = j.warehouse || state.warehouse;
      if (j.now) state.skew = j.now - Date.now();
      return true;
    }
  } catch { /* offline: keep what this device has */ } finally { syncing = false; }
  return false;
}

async function syncOne(id) {
  const loc = localOrders().find((o) => o.id === id);
  if (!CFG.ordersEndpoint || !loc || !loc.token) return false;
  try {
    const q = `?action=track&id=${encodeURIComponent(id)}&token=${encodeURIComponent(loc.token)}&_=${Date.now()}`;
    const j = await api(CFG.ordersEndpoint + q, {}, 12000);
    if (j && j.ok) {
      state.server.set(id, j.order);
      state.warehouse = j.warehouse || state.warehouse;
      if (j.now) state.skew = j.now - Date.now();
      return true;
    }
  } catch { /* keep going */ }
  return false;
}

/* ---------------------------------------------------------------- list view */

const thumbsHtml = (o) => {
  const fl = firstFlavours(o.items, o.drinks);
  if (!fl.length) return `<span class="oc-b"><img src="./media/box.webp" alt=""></span>`;
  const shown = fl.slice(0, 4).map((f) => `<span class="oc-b"><img src="./media/bottle-${esc(f)}.webp" alt="" loading="lazy"></span>`).join("");
  return shown + (fl.length > 4 ? `<span class="oc-more">+${fl.length - 4}</span>` : "");
};

function cardHtml(o, i) {
  const active = ACTIVE.includes(o.status), done = o.status === "Delivered";
  const arrive = done ? `Delivered ${fDay(o.deliveredAt) || ""}`.trim() : o.status === "Cancelled" ? "Cancelled" : o.deliveryDate || "Soon";
  return `<article class="oc ${done ? "is-done" : ""}" data-id="${esc(o.id)}" tabindex="0" role="link" aria-label="Order ${esc(o.id)}, ${esc(STATUS_LABEL[o.status] || o.status)}" data-reveal data-reveal-delay="${Math.min(i, 6) * 0.06}">
    <div class="oc-top"><span class="oc-id">${esc(o.id)}${o.sub || /\[subscription\]/i.test(o.itemsServer || "") ? ' <span class="oc-sub">Subscription</span>' : ""}</span>${badge(o.status)}</div>
    <div class="oc-bottles">${thumbsHtml(o)}</div>
    <div class="oc-items">${esc(itemsText(o))}</div>
    <div class="oc-meta"><div><small>Placed</small><b>${fDay(o.placedAt) || "-"}</b></div><div><small>${done ? "Delivered" : "Arriving"}</small><b>${esc(arrive.replace(/^Delivered /, "")) || "-"}</b></div><div><small>Total</small><b>${money(Number(o.total) || 0)}</b></div></div>
    <div class="oc-bar" aria-hidden="true"><i data-w="${PROGRESS[o.status] ?? 0}"></i></div>
    <a class="pill solid" href="#${esc(o.id)}">${active ? "Track live" : "View details"} <span class="arrow" aria-hidden="true">&rarr;</span></a>
    ${o.token ? "" : `<span class="oc-local">Saved on this device only, so live tracking is not available.</span>`}
  </article>`;
}

function renderStats() {
  const real = state.orders.filter((o) => o.status !== "Cancelled");
  const stats = [
    { l: "Orders", v: real.length, p: "" },
    { l: "Bottles", v: real.reduce((n, o) => n + bottleCount(o), 0), p: "" },
    { l: "Spent", v: Math.round(real.reduce((n, o) => n + (Number(o.total) || 0), 0)), p: "₹" },
  ];
  $("[data-stats]").innerHTML = stats.map((s) => `<div class="od-stat"><b data-count="${s.v}" data-prefix="${s.p}">${s.p}0</b><small>${s.l}</small></div>`).join("");
  countUp($("[data-stats]"));
}

function renderList() {
  const list = $("[data-list]"), empty = $("[data-empty]");
  const act = state.orders.filter((o) => ACTIVE.includes(o.status)).length;
  $('[data-n="all"]').textContent = state.orders.length;
  $('[data-n="active"]').textContent = act;
  $('[data-n="done"]').textContent = state.orders.length - act;
  const rows = state.orders.filter((o) => state.filter === "all" || (state.filter === "active" ? ACTIVE.includes(o.status) : !ACTIVE.includes(o.status)));
  list.innerHTML = rows.map(cardHtml).join("");
  const none = !rows.length;
  empty.hidden = !none;
  list.hidden = none;
  if (none) {
    $("[data-empty-title]").textContent = state.orders.length ? (state.filter === "active" ? "Nothing on the way" : "Nothing delivered yet") : "No orders yet";
    $("[data-empty-text]").textContent = state.orders.length ? "Switch the filter to see your other orders." : "When you place an order it shows up here, ready to track.";
  }
  reveal(list);
  requestAnimationFrame(() => $$("[data-w]", list).forEach((el) => { el.style.width = el.dataset.w + "%"; }));
}

$("[data-filters]").addEventListener("click", (e) => {
  const b = e.target.closest("[data-f]");
  if (!b) return;
  state.filter = b.dataset.f;
  $$("[data-f]").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
  renderList();
});

$("[data-list]").addEventListener("click", (e) => {
  const c = e.target.closest(".oc");
  if (c && !e.target.closest("a")) location.hash = c.dataset.id;
});
$("[data-list]").addEventListener("keydown", (e) => {
  const c = e.target.closest(".oc");
  if (c && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); location.hash = c.dataset.id; }
});

/* ---------------------------------------------------------------- shared bits */

const lineHtml = (i) => {
  const th = i.kind === "pack" ? "media/box.webp" : `media/bottle-${esc(i.flavour || "orange")}.webp`;
  const p = (i.sub ? subPrice(i.unit) : i.unit) * i.qty;
  return `<li class="ln"><span class="ln-th"><img src="./${th}" alt=""></span><div><b>${esc(i.name)}${i.qty > 1 ? " × " + i.qty : ""}</b><small>${esc(i.detail || "")}${i.sub ? " · subscription" : ""}</small></div><span class="ln-p">${money(p)}</span></li>`;
};

function summaryHtml(o) {
  const lines = o.items && o.items.length
    ? `<ul class="lines">${o.items.map(lineHtml).join("")}</ul>`
    : `<p class="od-note" style="margin:0 0 14px">${esc(o.itemsServer || "")}</p>`;
  const sub = o.subtotal != null && o.subtotal !== "" ? Number(o.subtotal) : null;
  return `${lines}<dl class="sums">
    ${sub != null ? `<div><dt>Subtotal</dt><dd>${money(sub)}</dd></div>` : ""}
    ${Number(o.discount) > 0 ? `<div class="sv"><dt>Subscribe &amp; save</dt><dd>-${money(Number(o.discount))}</dd></div>` : ""}
    <div><dt>${esc(o.ship)} delivery</dt><dd>${Number(o.shipFee) > 0 ? money(Number(o.shipFee)) : "Free"}</dd></div>
    <div class="tt"><dt>Total</dt><dd>${money(Number(o.total) || 0)}</dd></div></dl>`;
}

function detailsHtml(o) {
  return `<dl class="kv">
    <div><dt>Delivering to</dt><dd>${esc([o.address, o.city, o.pin].filter(Boolean).join(", ")) || "-"}</dd></div>
    <div><dt>Delivery</dt><dd>${esc(o.ship)}${o.deliveryDate ? " · " + esc(o.deliveryDate) : ""}</dd></div>
    <div><dt>Payment</dt><dd>${esc(o.payStatus === "Paid" ? "Paid" : "Payment pending")}${o.paymentId ? " · " + esc(o.paymentId) : ""}</dd></div>
    <div><dt>Placed</dt><dd>${fTime(o.placedAt) || "-"}</dd></div></dl>`;
}

function canReorder(o) { return o.items && o.items.length; }

function reorder(o, btn) {
  (o.items || []).forEach((i) => {
    if (i.kind === "pack" && i.mix) {
      const size = parseInt(i.name, 10) || 6;
      for (let n = 0; n < i.qty; n++) cartApi.addPack({ ...i.mix }, size, !!i.sub, i.freq || "fortnight");
    } else if (i.flavour) cartApi.addBottle(i.flavour, i.qty, !!i.sub, i.freq || "fortnight");
  });
  openCart(btn);
}

/* ---------------------------------------------------------------- geo + tracker */

const rad = (d) => (d * Math.PI) / 180;
function haversine(a, b) {
  const R = 6371000, dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
const fmtDist = (m) => (m < 1000 ? { n: Math.round(m / 10) * 10, u: "m" } : { n: Math.round(m / 100) / 10, u: "km" });

let mapboxLoad = null;
function loadMapbox() {
  if (window.mapboxgl) return Promise.resolve();
  if (!mapboxLoad) {
    mapboxLoad = new Promise((res, rej) => {
      const css = document.createElement("link");
      css.rel = "stylesheet"; css.href = "./assets/vendor/mapbox-gl.css";
      document.head.appendChild(css);
      const s = document.createElement("script");
      s.src = "./assets/vendor/mapbox-gl.js"; s.onload = res; s.onerror = () => rej(new Error("mapbox-gl failed to load"));
      document.head.appendChild(s);
    });
  }
  return mapboxLoad;
}

async function geocodeAddress(o) {
  const q = [o.address, o.city, o.pin].filter(Boolean).join(", ");
  if (!q || !CFG.mapboxToken) return null;
  try {
    const j = await api(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?country=in&limit=1&access_token=${CFG.mapboxToken}`, {}, 10000);
    const c = j && j.features && j.features[0] && j.features[0].center;
    if (c) { const d = { lat: c[1], lng: c[0] }; LS.set("pp-geo:" + o.id, d); return d; }
  } catch { /* no geocode */ }
  return null;
}

async function fetchRoute(from, to) {
  if (!CFG.mapboxToken) return null;
  try {
    const j = await api(`https://api.mapbox.com/directions/v5/mapbox/driving/${from.lng},${from.lat};${to.lng},${to.lat}?geometries=geojson&overview=full&access_token=${CFG.mapboxToken}`, {}, 10000);
    const r = j && j.routes && j.routes[0];
    return r ? { dist: r.distance, dur: r.duration, geometry: r.geometry } : null;
  } catch { return null; }
}

const ICON = {
  house: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
  store: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l2-5h14l2 5"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
};

function mkEl(cls, inner, label) {
  const el = document.createElement("div");
  el.className = "mk " + cls;
  el.innerHTML = inner + (label ? `<span class="mk-label">${esc(label)}</span>` : "");
  return el;
}
/** Mapbox sets its own transform on a marker element, so the styled pin goes inside a plain wrapper. */
function wrapMk(inner) { const w = document.createElement("div"); w.appendChild(inner); return w; }

/** The pin the shop (or the courier's phone) last set for this order, if any. */
const hasLoc = (o) => !!(o && o.loc && o.loc.lat != null && o.loc.lng != null && o.loc.lat !== "" && o.loc.lng !== "" && isFinite(Number(o.loc.lat)) && isFinite(Number(o.loc.lng)));
const whereLabel = (o) => (hasLoc(o) && o.loc.label ? String(o.loc.label) : "");
const sinceTxt = (sec) => (sec < 60 ? "just now" : sec < 3600 ? `${Math.round(sec / 60)} min ago` : sec < 86400 ? `${Math.round(sec / 3600)} h ago` : `${Math.round(sec / 86400)} d ago`);

class Tracker {
  constructor(root, order) {
    this.root = root; this.order = order; this.wh = state.warehouse; this.dest = order.dest;
    this.map = null; this.mode = "init"; this.route = null; this.routeFrom = null; this.routeAt = 0; this.userMoved = false;
    this.cur = null; this.pos = { lng: 0, lat: 0 }; this.dead = false; this.shown = { v: 0 };
    root.innerHTML = `<div class="map" data-map></div><div class="strip" data-strip hidden></div>
      <div class="hud"><div class="hud-main"><small data-h-label>Distance to you</small><div class="hud-dist"><span data-h-num>--</span><em data-h-unit>km</em></div><div class="hud-eta" data-h-eta></div></div><span class="hud-live off" data-h-live><i></i><span data-h-live-t>Connecting</span></span></div>
      <div class="map-tools"><button type="button" class="map-btn" data-recenter aria-label="Show the whole route">${ICON.target}</button></div>
      <div class="map-note" data-h-note hidden></div>`;
    $("[data-recenter]", root).addEventListener("click", () => { this.userMoved = false; this.fit(true); });
    this.tick = setInterval(() => this.paintAge(), 1000);
    this.start();
  }

  async start() {
    if (!this.dest) { this.dest = await geocodeAddress(this.order); if (this.dead) return; }
    if (!this.dest) { this.fallback("We could not place your delivery address on the map yet. We will keep trying."); return; }
    try {
      await loadMapbox();
      if (this.dead) return;
      this.initMap();
    } catch { this.fallback(); }
    this.update(this.order, this.wh);
  }

  initMap() {
    const mb = window.mapboxgl;
    if (!mb || !CFG.mapboxToken || (mb.supported && !mb.supported())) { this.fallback(); return; }
    mb.accessToken = CFG.mapboxToken;
    try {
      this.map = new mb.Map({ container: $("[data-map]", this.root), style: CFG.mapStyle, center: [this.dest.lng, this.dest.lat], zoom: 12, attributionControl: true, logoPosition: "bottom-left" });
    } catch { this.fallback(); return; }
    const map = this.map;
    this.mode = "map";
    map.on("dragstart", () => { this.userMoved = true; });
    map.on("zoomstart", (e) => { if (e.originalEvent) this.userMoved = true; });
    map.on("load", () => {
      this.loaded = true;
      if (map.getLayer("land")) map.setPaintProperty("land", "background-color", "#fff7eb");
      if (map.getLayer("water")) map.setPaintProperty("water", "fill-color", "#bfe3dc");
      map.addSource("route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "route-casing", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#1a1410", "line-width": 10 } });
      map.addLayer({ id: "route-line", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#ff8a2a", "line-width": 5 } });
      this.drawRoute();
      this.fit(true);
    });
    this.failTimer = setTimeout(() => { if (!this.loaded) this.fallback("The map could not load, so here is how far your order is."); }, 12000);
    this.homeMk = new mb.Marker({ element: wrapMk(mkEl("mk-home", ICON.house, "")), anchor: "center" }).setLngLat([this.dest.lng, this.dest.lat]).addTo(map);
    this.whEl = wrapMk(mkEl("mk-wh", ICON.store, ""));
    this.whMk = null;
    const fl = firstFlavours(this.order.items, this.order.drinks)[0] || "orange";
    this.orderEl = mkEl("mk-order", `<img src="./media/bottle-${esc(fl)}.webp" alt="">`, "");
    this.orderMk = new mb.Marker({ element: wrapMk(this.orderEl), anchor: "center" }).setLngLat([this.dest.lng, this.dest.lat]).addTo(map);
    this.orderMk.getElement().style.visibility = "hidden";
  }

  fallback(note) {
    if (this.mode === "strip") { if (note) this.note(note); return; }
    clearTimeout(this.failTimer);
    if (this.map) { try { this.map.remove(); } catch { /* already gone */ } this.map = null; }
    this.mode = "strip";
    $("[data-map]", this.root).hidden = true;
    const s = $("[data-strip]", this.root);
    s.hidden = false;
    s.innerHTML = `<div class="strip-line"><span class="strip-road"></span><span class="strip-fill" data-s-fill></span>${""}</div><p data-s-text></p>`;
    const line = $(".strip-line", s);
    line.insertAdjacentHTML("beforeend", mkEl("mk-wh", ICON.store, "").outerHTML);
    const fl = firstFlavours(this.order.items, this.order.drinks)[0] || "orange";
    line.insertAdjacentHTML("beforeend", mkEl("mk-order", `<img src="./media/bottle-${esc(fl)}.webp" alt="">`, "").outerHTML);
    line.insertAdjacentHTML("beforeend", mkEl("mk-home", ICON.house, "").outerHTML);
    $("[data-recenter]", this.root).hidden = true;
    if (note) this.note(note);
    this.update(this.order, this.wh);
  }

  note(t) { const n = $("[data-h-note]", this.root); n.textContent = t; n.hidden = !t; }

  position(o, wh) {
    const w = wh && wh.lat != null ? { lat: wh.lat, lng: wh.lng } : null;
    return hasLoc(o) ? { lat: Number(o.loc.lat), lng: Number(o.loc.lng) } : w;
  }

  async update(order, wh) {
    if (this.dead) return;
    this.order = order; this.wh = wh || this.wh;
    const here = this.position(order, this.wh);
    const dest = this.dest;
    if (!here || !dest) { this.hud(null); return; }
    const first = !this.cur;
    this.moveTo(here, first);
    // road route: refresh when the order has moved a fair bit or the last one is old
    const moved = this.routeFrom ? haversine(this.routeFrom, here) : Infinity;
    if (moved > 120 || Date.now() - this.routeAt > 60000) {
      this.routeFrom = here; this.routeAt = Date.now();
      const r = await fetchRoute(here, dest);
      if (this.dead) return;
      if (r) { this.route = r; this.drawRoute(); }
      else if (!this.route) this.route = null;
    }
    this.hud(here);
    if (this.mode === "strip") this.paintStrip(here);
    else if (first || !this.userMoved) this.fit(first);
  }

  moveTo(p, instant) {
    if (!this.cur || instant || reduce || this.mode !== "map") { this.cur = { ...p }; this.applyPos(p); return; }
    const from = { ...this.cur };
    gsap.killTweensOf(this.cur);
    gsap.to(from, { lng: p.lng, lat: p.lat, duration: 1.4, ease: "power2.inOut", onUpdate: () => { this.cur = { lat: from.lat, lng: from.lng }; this.applyPos(this.cur); }, onComplete: () => { this.cur = { ...p }; } });
  }

  applyPos(p) {
    if (this.orderMk) { this.orderMk.setLngLat([p.lng, p.lat]); this.orderMk.getElement().style.visibility = "visible"; }
    const out = this.order.status === "Out for delivery";
    if (this.orderEl) this.orderEl.classList.toggle("is-still", !out);
    // show the warehouse pin once the order has left it
    if (this.map && this.wh && this.wh.lat != null && !this.whMk) {
      this.whMk = new window.mapboxgl.Marker({ element: this.whEl, anchor: "center" }).setLngLat([this.wh.lng, this.wh.lat]).addTo(this.map);
    }
  }

  drawRoute() {
    if (!this.map || !this.loaded) return;
    const src = this.map.getSource("route");
    if (!src) return;
    const here = this.cur, dest = this.dest;
    const coords = this.route ? this.route.geometry.coordinates : here && dest ? [[here.lng, here.lat], [dest.lng, dest.lat]] : [];
    src.setData({ type: "FeatureCollection", features: coords.length ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } }] : [] });
  }

  fit(animate) {
    if (!this.map || !this.dest) return;
    const pts = [[this.dest.lng, this.dest.lat]];
    if (this.cur) pts.push([this.cur.lng, this.cur.lat]);
    if (this.wh && this.wh.lat != null && this.order.status !== "Out for delivery") pts.push([this.wh.lng, this.wh.lat]);
    const b = new window.mapboxgl.LngLatBounds(pts[0], pts[0]);
    pts.forEach((p) => b.extend(p));
    const narrow = this.root.clientWidth < 560;
    this.map.fitBounds(b, { padding: { top: narrow ? 190 : 120, bottom: 70, left: 70, right: 70 }, maxZoom: 16, duration: animate && !reduce ? 900 : 0 });
  }

  hud(here) {
    const root = this.root, o = this.order;
    if (!here || !this.dest) { $("[data-h-num]", root).textContent = "--"; return; }
    const out = o.status === "Out for delivery";
    const straight = haversine(here, this.dest);
    const meters = this.route ? this.route.dist : straight;
    const d = fmtDist(meters);
    const where = whereLabel(o);
    $("[data-h-label]", root).textContent = out || where ? "Distance to you" : "Warehouse to you";
    $("[data-h-unit]", root).textContent = d.u;
    const target = d.n;
    if (reduce) $("[data-h-num]", root).textContent = target;
    else gsap.to(this.shown, { v: target, duration: 1, ease: "power2.out", onUpdate: () => { $("[data-h-num]", root).textContent = d.u === "km" ? this.shown.v.toFixed(1) : Math.round(this.shown.v); } });
    const eta = $("[data-h-eta]", root);
    const at = where ? `Now at ${where}` : "";
    if (out && this.route) eta.textContent = `${at ? at + " · " : ""}About ${Math.max(1, Math.round(this.route.dur / 60))} min away`;
    else if (out) eta.textContent = at ? `${at} · On its way` : "On its way";
    else eta.textContent = at || (o.status === "Packed" ? "Packed and waiting for pick up" : "Being packed");
    if (!this.route) this.note(this.mode === "strip" ? $("[data-h-note]", root).textContent : "Distance shown in a straight line for now.");
    else if (this.mode === "map") this.note("");
    this.paintAge();
  }

  paintStrip(here) {
    const s = $("[data-strip]", this.root), wh = this.wh;
    if (!s || !wh || wh.lat == null) return;
    const total = Math.max(1, haversine({ lat: wh.lat, lng: wh.lng }, this.dest));
    const left = haversine(here, this.dest);
    const p = this.order.status === "Delivered" ? 1 : Math.min(1, Math.max(0, 1 - left / total));
    $("[data-s-fill]", s).style.width = `calc((100% - 68px) * ${p})`;
    $(".mk-order", s).style.left = `calc(34px + (100% - 68px) * ${p})`;
    const out = this.order.status === "Out for delivery";
    $(".mk-order", s).classList.toggle("is-still", !out);
    const d = fmtDist(this.route ? this.route.dist : left);
    $("[data-s-text]", s).textContent = out ? `Your order is ${d.n} ${d.u} from you.` : whereLabel(this.order) ? `Your order is at ${whereLabel(this.order)}.` : "Your order is getting ready at our warehouse.";
  }

  paintAge() {
    const live = $("[data-h-live]", this.root), t = $("[data-h-live-t]", this.root);
    if (!live) return;
    const o = this.order;
    const shop = hasLoc(o) && o.loc.src === "admin" && o.loc.at;
    if (shop) { live.classList.remove("off"); t.textContent = `Updated ${sinceTxt(Math.max(0, Math.round((Date.now() + state.skew - o.loc.at) / 1000)))}`; return; }
    if (o.status !== "Out for delivery") { live.classList.add("off"); t.textContent = o.status === "Packed" ? "Packed" : "Preparing"; return; }
    if (!o.loc || !o.loc.at) { live.classList.add("off"); t.textContent = "Waiting for courier"; return; }
    const age = Math.max(0, Math.round((Date.now() + state.skew - o.loc.at) / 1000));
    live.classList.toggle("off", age > 90);
    t.textContent = age < 5 ? "Live now" : age < 90 ? `Live · ${age}s ago` : age < 3600 ? `Last seen ${Math.round(age / 60)} min ago` : "Location paused";
  }

  destroy() {
    this.dead = true;
    clearInterval(this.tick); clearTimeout(this.failTimer);
    if (this.cur) gsap.killTweensOf(this.cur);
    if (this.map) { try { this.map.remove(); } catch { /* ignore */ } }
  }
}

/* ---------------------------------------------------------------- order view */

let tracker = null, pollTimer = null;
function stopOrderView() {
  clearTimeout(pollTimer); pollTimer = null;
  if (tracker) { tracker.destroy(); tracker = null; }
}

function stepperHtml(o) {
  const idx = STEPS.findIndex((s) => s.k === o.status);
  return `<ol class="od-steps">${STEPS.map((s, n) => {
    const cls = n < idx ? "is-done" : n === idx ? (o.status === "Delivered" ? "is-done" : "now") : "pending";
    const time = s.k === "Placed" ? fTime(o.placedAt) : s.k === "Delivered" ? fTime(o.deliveredAt) : "";
    const where = cls === "now" ? whereLabel(o) : "";
    return `<li class="od-step ${cls}"><span class="od-dot">${cls === "is-done" ? "&#10003;" : n + 1}</span><div><b>${s.t}</b><small>${s.d}</small>${where ? `<small class="od-where">Now at ${esc(where)}</small>` : ""}${time ? `<time>${time}</time>` : ""}</div></li>`;
  }).join("")}</ol>`;
}

function renderTracking(o) {
  const body = $("[data-o-body]");
  body.innerHTML = `<div class="tv-grid">
    <section class="od-card od-map" data-reveal aria-label="Live map"></section>
    <aside>
      <div class="od-card" data-reveal data-reveal-delay=".08"><h3>Where it is</h3><div data-steps>${stepperHtml(o)}</div>
        <p class="od-note" data-eta-note>${o.deliveryDate ? `Expected ${esc(o.deliveryDate)}` : ""}${o.courier ? ` · Courier: ${esc(o.courier)}` : ""}</p></div>
      <div class="od-card" data-reveal data-reveal-delay=".14"><h3>Your box</h3>${summaryHtml(o)}${detailsHtml(o)}</div>
    </aside></div>`;
  reveal(body);
  tracker = new Tracker($(".od-map", body), o);
}

function renderReceipt(o) {
  const body = $("[data-o-body]");
  const cancelled = o.status === "Cancelled";
  body.innerHTML = `<div class="rc-banner ${cancelled ? "cancelled" : ""}" data-reveal>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${cancelled ? '<circle cx="12" cy="12" r="9"/><path d="M8 8l8 8M16 8l-8 8"/>' : '<circle cx="12" cy="12" r="9"/><path d="M7.5 12.5l3 3 6-7"/>'}</svg>
      <div><b>${cancelled ? "Order cancelled" : "Delivered"}</b><span>${cancelled ? "This order will not be delivered." : o.deliveredAt ? `Arrived ${esc(fTime(o.deliveredAt))}` : "Your order has arrived."}</span></div></div>
    <div class="rc-grid">
      <section class="od-card" data-reveal data-reveal-delay=".05"><h3>What was in the box</h3>${summaryHtml(o)}
        <div class="row-btns">${canReorder(o) && !cancelled ? `<button type="button" class="pill solid" data-reorder>Order it again</button>` : ""}<a class="pill ghost" href="#" data-back>All orders</a></div></section>
      <aside>
        <div class="od-card" data-reveal data-reveal-delay=".1"><h3>Details</h3>${detailsHtml(o)}</div>
        ${cancelled ? "" : `<div class="od-card" data-reveal data-reveal-delay=".16"><h3>Timeline</h3>${stepperHtml(o)}</div>`}
      </aside></div>`;
  reveal(body);
  const rb = $("[data-reorder]", body);
  if (rb) rb.addEventListener("click", () => reorder(o, rb));
}

function paintHead(o) {
  $("[data-o-chip]").textContent = "Order";
  $("[data-o-title]").textContent = o.id;
  $("[data-o-status]").className = "st " + (STATUS_CLASS[o.status] || "");
  $("[data-o-status]").innerHTML = `<i></i>${esc(STATUS_LABEL[o.status] || o.status)}`;
  $("[data-o-sub]").textContent = ACTIVE.includes(o.status)
    ? o.status === "Out for delivery" ? "It is on the move. Watch it come to you." : "We are getting it ready. The map goes live when it leaves the warehouse."
    : o.status === "Cancelled" ? "This order was cancelled." : "Here is everything about this order.";
}

function schedulePoll(id) {
  clearTimeout(pollTimer);
  const o = state.orders.find((x) => x.id === id);
  if (!o || !ACTIVE.includes(o.status)) return;
  const wait = o.status === "Out for delivery" ? 8000 : 20000;
  pollTimer = setTimeout(async () => {
    if (state.openId !== id) return;
    if (!document.hidden) {
      const prevStatus = o.status;
      await syncOne(id);
      if (state.openId !== id) return;
      rebuild();
      const now = state.orders.find((x) => x.id === id);
      if (now) {
        paintHead(now);
        if (now.status !== prevStatus && !ACTIVE.includes(now.status)) { stopOrderView(); renderReceipt(now); celebrate(); }
        else if (tracker) {
          $("[data-steps]").innerHTML = stepperHtml(now);
          const n = $("[data-eta-note]");
          if (n) n.textContent = `${now.deliveryDate ? `Expected ${now.deliveryDate}` : ""}${now.courier ? ` · Courier: ${now.courier}` : ""}`;
          tracker.update(now, state.warehouse);
        }
      }
    }
    schedulePoll(id);
  }, wait);
}

function celebrate() {
  if (reduce) return;
  const el = $("[data-o-status]");
  gsap.fromTo(el, { scale: 1.4, rotate: -6 }, { scale: 1, rotate: 0, duration: 0.8, ease: "elastic.out(1,.5)" });
}

async function openOrder(id) {
  stopOrderView();
  state.openId = id;
  const view = $('[data-view="order"]'), list = $('[data-view="list"]');
  list.hidden = true; view.hidden = false;
  window.scrollTo(0, 0);
  let o = state.orders.find((x) => x.id === id);
  if (!o) {
    $("[data-o-title]").textContent = id;
    $("[data-o-status]").textContent = "";
    $("[data-o-sub]").textContent = "";
    $("[data-o-body]").innerHTML = `<div class="od-card od-empty" style="box-shadow:7px 7px 0 var(--ink)"><h2>We could not find that order</h2><p>It may belong to another account or another device.</p><a class="pill solid" href="#" data-back>Back to my orders</a></div>`;
    return;
  }
  paintHead(o);
  if (ACTIVE.includes(o.status)) renderTracking(o); else renderReceipt(o);
  if (!reduce) gsap.from("[data-o-title], [data-o-sub], [data-o-status]", { y: 18, opacity: 0, duration: 0.7, stagger: 0.07, ease: "power3.out" });
  // pull the freshest copy straight away, then keep it updated
  if (await syncOne(id)) {
    if (state.openId !== id) return;
    rebuild();
    const fresh = state.orders.find((x) => x.id === id);
    if (fresh) {
      const wasActive = ACTIVE.includes(o.status), nowActive = ACTIVE.includes(fresh.status);
      paintHead(fresh);
      if (wasActive && !nowActive) { stopOrderView(); renderReceipt(fresh); }
      else if (!wasActive && nowActive) { stopOrderView(); renderTracking(fresh); }
      else if (tracker) { $("[data-steps]").innerHTML = stepperHtml(fresh); tracker.update(fresh, state.warehouse); }
      o = fresh;
    }
  }
  schedulePoll(id);
}

function showList() {
  stopOrderView();
  state.openId = null;
  $('[data-view="order"]').hidden = true;
  $('[data-view="list"]').hidden = false;
  renderStats(); renderList();
}

function route() {
  const id = decodeURIComponent(location.hash.replace(/^#/, "")).trim();
  if (id && /^[\w-]+$/.test(id)) openOrder(id); else showList();
  if (id || state.openId === null) window.scrollTo(0, 0);
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-back]");
  if (b) { e.preventDefault(); history.pushState(null, "", location.pathname); route(); }
});
window.addEventListener("hashchange", route);
document.addEventListener("visibilitychange", () => { if (!document.hidden && !state.openId) sync().then(() => { rebuild(); renderList(); }); });

/* ---------------------------------------------------------------- start */

(async function start() {
  importFromLink();
  await importSubOrders();
  rebuild();
  renderStats();
  renderList();
  intro(document);
  const ok = await sync();
  if (ok) { rebuild(); if (!state.openId) { renderStats(); renderList(); } }
  route();
  setInterval(async () => {
    if (state.openId || document.hidden) return;
    await importSubOrders();
    if (await sync()) { rebuild(); renderStats(); renderList(); }
  }, 30000);
})();
