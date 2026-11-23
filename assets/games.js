/* Vitame games: five little games starring our bottles. No libraries, no build step. */
(function () {
  "use strict";
  var W = window, D = document;
  if (W.ppGames) return;

  var TAU = Math.PI * 2;
  var rand = function (a, b) { return a + Math.random() * (b - a); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var pick = function (a) { return a[(Math.random() * a.length) | 0]; };
  var easeOut = function (t) { return 1 - Math.pow(1 - t, 3); };
  var easeBack = function (t) { var c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  var dist = function (x0, y0, x1, y1) { return Math.hypot(x1 - x0, y1 - y0); };
  var reduce = W.matchMedia && W.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var FONT_D = "'Anton','Impact',sans-serif", FONT_T = "'Inter',system-ui,sans-serif", FONT_P = "'Space Grotesk','Inter',sans-serif";
  var C = { ink: "#1a1410", cream: "#fff7eb", tangerine: "#ff8a2a", lemon: "#ffdc52", beet: "#e03442", leaf: "#4aae4d" };
  var FLAV = ["orange", "beet", "green", "yuzu"];
  var NAME = { orange: "Orange Riot", beet: "Beet & Berry", green: "Green Machine", yuzu: "Yuzu Ginger" };
  var BG = { orange: "#ff8c2e", beet: "#d82c3d", green: "#4aae4e", yuzu: "#ffe049" };
  var JUICE = { orange: ["#ffb02e", "#ff8c2e", "#ffdc52"], beet: ["#e03442", "#a81d2e", "#ee5468"], green: ["#8fd44a", "#4aae4d", "#c6f27a"], yuzu: ["#ffec70", "#ffe049", "#fff3a8"] };
  var LIQ = { orange: [255, 140, 43], beet: [200, 36, 58], green: [88, 184, 76], yuzu: [255, 224, 73] };

  var store = {
    get: function (k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
  };
  var best = store.get("pp-game-best", {});
  function saveBest(game, score) {
    var isNew = score > (best[game] || 0);
    if (isNew) { best[game] = score; store.set("pp-game-best", best); }
    return isNew;
  }

  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };

  /* ------------------------------------------------------------ player identity + leaderboard */
  var EP = (W.PP && W.PP.ordersEndpoint) || "";
  var LB_GAMES = { slice: 1, stack: 1, smash: 1 }; // Holi and Mix the Colours have no leaderboard
  var UID_RE = /^PPU-[A-HJ-NP-Z2-9]{8}$/;
  function makeUid() {
    var A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", r = new Uint8Array(8), id = "PPU-";
    if (W.crypto && W.crypto.getRandomValues) W.crypto.getRandomValues(r); else for (var i = 0; i < 8; i++) r[i] = Math.random() * 256;
    for (var k = 0; k < 8; k++) id += A[r[k] % A.length];
    return id;
  }
  /** The signed-in player: a permanent ID per email (made at login; made here for accounts that pre-date it). */
  function player() {
    var s = store.get("pp-session", null) || {}, email = String(s.email || "").toLowerCase(), uid = s.uid;
    if (!UID_RE.test(uid || "")) {
      var map = store.get("pp-uids", {});
      uid = map[email || "guest"];
      if (!UID_RE.test(uid || "")) { uid = makeUid(); map[email || "guest"] = uid; store.set("pp-uids", map); }
      if (s.email) { s.uid = uid; store.set("pp-session", s); }
    }
    return { uid: uid, name: String(s.nick || s.name || "Player").slice(0, 20) };
  }
  function jfetch(url, opts, ms) {
    var ctl = W.AbortController ? new AbortController() : null, t = ctl && setTimeout(function () { ctl.abort(); }, ms || 12000);
    opts = opts || {}; opts.redirect = "follow"; if (ctl) opts.signal = ctl.signal;
    return fetch(url, opts).then(function (r) { return r.json(); }).then(function (j) { clearTimeout(t); return j; }, function (e) { clearTimeout(t); throw e; });
  }
  var QKEY = "pp-score-queue";
  function postScore(game, score, p) {
    return jfetch(EP, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "score", uid: p.uid, name: p.name, game: game, score: score }) });
  }
  function submitScore(game, score) {
    if (!EP || !LB_GAMES[game]) return Promise.resolve(null);
    var p = player();
    return postScore(game, score, p).then(function (j) { return j && j.ok ? j : null; }, function () {
      var q = store.get(QKEY, []); q.push({ game: game, score: score }); store.set(QKEY, q.slice(-20)); return null;
    });
  }
  function flushQueue() {
    if (!EP) return;
    var q = store.get(QKEY, []); if (!q.length) return;
    store.set(QKEY, []);
    var p = player();
    q.forEach(function (it) { postScore(it.game, it.score, p).catch(function () { var a = store.get(QKEY, []); a.push(it); store.set(QKEY, a.slice(-20)); }); });
  }
  function fetchBoard(game, limit) {
    if (!EP) return Promise.resolve(null);
    var p = player();
    return jfetch(EP + "?action=board&game=" + game + "&uid=" + encodeURIComponent(p.uid) + "&limit=" + limit + "&_=" + Date.now()).then(function (j) { return j && j.ok ? j : null; }, function () { return null; });
  }
  function lbHtml(top, me, total) {
    if (!top || !top.length) return '<p class="gm-lb-empty">No scores yet. Be the first on the board.</p>';
    var h = '<ol class="gm-lb">' + top.map(function (r) {
      return '<li class="' + (r.you ? "you " : "") + (r.rank <= 3 ? "top" : "") + '"><b>' + r.rank + "</b><span>" + esc(r.name) + (r.you ? " (you)" : "") + "</span><em>" + r.score + "</em></li>";
    }).join("") + "</ol>";
    if (me && !top.some(function (r) { return r.you; })) h += '<p class="gm-lb-me">You are #' + me.rank + " of " + total + " with " + me.score + "</p>";
    return h;
  }

  /* ------------------------------------------------------------ images */
  var IMG = {};
  var FRUITS = { // sprite files already shipped with the site
    orange: ["orange-0", "orange-2", "orange-3", "orange-4"],
    beet: ["beet-0", "beet-1", "beet-2", "beet-7", "beet-8"],
    green: ["green-0", "green-2"],
    yuzu: ["yuzu-0", "yuzu-1", "yuzu-2"]
  };
  var ALLFRUIT = [];
  Object.keys(FRUITS).forEach(function (k) { FRUITS[k].forEach(function (n) { ALLFRUIT.push({ flav: k, key: "f-" + n, src: "media/fruit-" + n + ".webp" }); }); });
  var assetsP = null;
  function loadAssets() {
    if (assetsP) return assetsP;
    var jobs = [];
    FLAV.forEach(function (f) { jobs.push(["b-" + f, "media/game/bottle-" + f + ".webp"]); });
    ALLFRUIT.forEach(function (a) { jobs.push([a.key, a.src]); });
    assetsP = Promise.all(jobs.map(function (j) {
      return new Promise(function (res) {
        var im = new Image();
        im.onload = function () { IMG[j[0]] = im; res(); };
        im.onerror = function () { res(); };
        im.src = j[1];
      });
    }));
    return assetsP;
  }
  /** Draws a bottle sprite centred horizontally with its base at (x, y). */
  function drawBottle(ctx, flav, x, y, h, rot, alpha) {
    var im = IMG["b-" + flav];
    if (!im) return;
    var sh = im.height * 0.985, w = h * im.width / sh;
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    if (alpha != null) ctx.globalAlpha = alpha;
    ctx.drawImage(im, 0, 0, im.width, sh, -w / 2, -h, w, h);
    ctx.restore();
  }

  /* ------------------------------------------------------------ audio (tiny synth, no files) */
  var AC = null, muted = store.get("pp-game-mute", false), noiseBuf = null;
  function ac() {
    if (!AC) { var K = W.AudioContext || W.webkitAudioContext; if (K) { try { AC = new K(); } catch (e) { AC = null; } } }
    if (AC && AC.state === "suspended") AC.resume();
    return AC;
  }
  function noise(c) {
    if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate); var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    return noiseBuf;
  }
  function tone(c, f0, f1, dur, type, vol, delay) {
    var t = c.currentTime + (delay || 0), o = c.createOscillator(), g = c.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function hiss(c, dur, vol, f0, f1, type, delay) {
    var t = c.currentTime + (delay || 0), s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noise(c); f.type = type || "bandpass"; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(c.destination); s.start(t); s.stop(t + dur + 0.02);
  }
  var SFX = {
    click: function (c) { tone(c, 520, 760, 0.07, "triangle", 0.12); },
    slice: function (c) { hiss(c, 0.16, 0.22, 3200, 900, "bandpass"); tone(c, 700, 300, 0.1, "triangle", 0.08); },
    pop: function (c) { tone(c, 300, 720, 0.09, "sine", 0.18); },
    smash: function (c) { hiss(c, 0.28, 0.4, 5200, 700, "highpass"); tone(c, 160, 50, 0.22, "square", 0.2); },
    gold: function (c) { [660, 880, 1320].forEach(function (f, i) { tone(c, f, f * 1.01, 0.18, "triangle", 0.14, i * 0.07); }); },
    bad: function (c) { tone(c, 220, 90, 0.35, "sawtooth", 0.18); },
    drop: function (c) { tone(c, 150, 70, 0.12, "sine", 0.3); hiss(c, 0.08, 0.12, 900, 300, "lowpass"); },
    perfect: function (c, a) { var n = Math.min(4, a || 1); for (var i = 0; i <= n; i++) tone(c, 520 * Math.pow(1.122, i * 2), 520 * Math.pow(1.122, i * 2), 0.2, "triangle", 0.15, i * 0.06); },
    topple: function (c) { hiss(c, 0.6, 0.35, 2400, 120, "lowpass"); tone(c, 220, 40, 0.5, "sawtooth", 0.2); },
    pour: function (c) { hiss(c, 0.12, 0.06, 1800, 1400, "bandpass"); },
    found: function (c) { [523, 659, 784, 1046].forEach(function (f, i) { tone(c, f, f, 0.24, "triangle", 0.16, i * 0.09); }); },
    splat: function (c) { hiss(c, 0.14, 0.2, 1400, 300, "lowpass"); tone(c, 240, 90, 0.1, "sine", 0.12); },
    over: function (c) { [440, 370, 311, 247].forEach(function (f, i) { tone(c, f, f * 0.98, 0.25, "triangle", 0.15, i * 0.14); }); },
    win: function (c) { [523, 659, 784, 1046, 1318].forEach(function (f, i) { tone(c, f, f, 0.22, "triangle", 0.16, i * 0.08); }); }
  };
  function sfx(name, a) { if (muted) return; var c = ac(); if (!c) return; try { SFX[name](c, a); } catch (e) { /* audio unavailable */ } }

  /* ------------------------------------------------------------ particles */
  var parts = [];
  function emit(o) {
    var n = o.n || 10;
    for (var i = 0; i < n; i++) {
      var a = (o.angle != null ? o.angle : 0) + rand(-1, 1) * (o.spread != null ? o.spread : TAU / 2), sp = rand(o.min != null ? o.min : 40, o.max != null ? o.max : 220);
      parts.push({
        x: o.x + rand(-1, 1) * (o.jx || 0), y: o.y + rand(-1, 1) * (o.jx || 0), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0, ttl: rand(o.lmin || 0.4, o.lmax || 0.9), size: rand(o.smin || 3, o.smax || 8), grow: o.grow || 0,
        color: Array.isArray(o.color) ? pick(o.color) : o.color, grav: o.grav != null ? o.grav : 700, drag: o.drag != null ? o.drag : 0.5,
        shape: o.shape || "circle", rot: rand(0, TAU), vr: rand(-8, 8), alpha: o.alpha != null ? o.alpha : 1, blend: o.blend || null
      });
    }
    if (parts.length > 900) parts.splice(0, parts.length - 900);
  }
  function stepParts(dt) {
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.life += dt;
      if (p.life >= p.ttl) { parts.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      var k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k; p.vy *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      p.size += p.grow * dt;
    }
  }
  function drawParts(ctx) {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i], f = 1 - p.life / p.ttl;
      ctx.globalAlpha = clamp(f * 1.6, 0, 1) * p.alpha;
      ctx.fillStyle = p.color;
      if (p.blend) ctx.globalCompositeOperation = p.blend;
      if (p.shape === "circle") { ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.5, p.size * (0.6 + f * 0.4)), 0, TAU); ctx.fill(); }
      else if (p.shape === "shard") {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.beginPath(); ctx.moveTo(-p.size, p.size * 0.5); ctx.lineTo(p.size * 0.9, 0); ctx.lineTo(-p.size * 0.2, -p.size); ctx.closePath(); ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(26,20,16,.55)"; ctx.stroke(); ctx.restore();
      } else if (p.shape === "star") {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.beginPath();
        for (var s = 0; s < 8; s++) { var r = s % 2 ? p.size * 0.45 : p.size; ctx.lineTo(Math.cos(s * TAU / 8) * r, Math.sin(s * TAU / 8) * r); }
        ctx.closePath(); ctx.fill(); ctx.restore();
      } else if (p.shape === "conf") {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size); ctx.restore();
      } else if (p.shape === "ring") {
        ctx.lineWidth = 3; ctx.strokeStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.stroke();
      }
      if (p.blend) ctx.globalCompositeOperation = "source-over";
    }
    ctx.globalAlpha = 1;
  }

  /* floating score words */
  var words = [];
  function word(x, y, txt, color, size) { words.push({ x: x, y: y, t: 0, txt: txt, color: color || C.cream, size: size || 30 }); }
  function stepWords(dt) { for (var i = words.length - 1; i >= 0; i--) { words[i].t += dt; if (words[i].t > 1.1) words.splice(i, 1); } }
  function drawWords(ctx) {
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    words.forEach(function (w) {
      var k = w.t / 1.1, s = w.size * (k < 0.15 ? 0.6 + easeBack(k / 0.15) * 0.4 : 1);
      ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      ctx.font = "400 " + s + "px " + FONT_D;
      ctx.lineWidth = 6; ctx.strokeStyle = C.ink; ctx.lineJoin = "round";
      ctx.strokeText(w.txt, w.x, w.y - k * 46); ctx.fillStyle = w.color; ctx.fillText(w.txt, w.x, w.y - k * 46);
    });
    ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------------ engine */
  var E = { root: null, canvas: null, ctx: null, w: 0, h: 0, dpr: 1, game: null, raf: 0, last: 0, shake: 0, key: "", ready: false, acts: null, hubEl: null, stageEl: null, overEl: null };

  function resize() {
    if (!E.canvas) return;
    var w = W.innerWidth, h = W.innerHeight, dpr = Math.min(2, W.devicePixelRatio || 1);
    E.dpr = dpr; E.w = w; E.h = h;
    E.canvas.width = Math.round(w * dpr); E.canvas.height = Math.round(h * dpr);
    E.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (E.game && E.game.resize) E.game.resize(w, h);
  }

  function loop(t) {
    if (!E.game) return;
    E.raf = requestAnimationFrame(loop);
    var dt = Math.min(0.033, (t - (E.last || t)) / 1000);
    E.last = t;
    var ctx = E.ctx;
    ctx.setTransform(E.dpr, 0, 0, E.dpr, 0, 0);
    ctx.save();
    if (E.shake > 0.01 && !reduce) { ctx.translate(rand(-1, 1) * E.shake, rand(-1, 1) * E.shake); E.shake *= Math.pow(0.0006, dt); }
    E.game.update(dt);
    stepParts(dt); stepWords(dt);
    E.game.draw(ctx);
    ctx.restore();
  }

  function pos(e) { var r = E.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  var pressed = false;
  function onDown(e) { if (!E.game) return; ac(); e.preventDefault(); pressed = true; try { E.canvas.setPointerCapture(e.pointerId); } catch (x) { /* no capture */ } var p = pos(e); E.game.down && E.game.down(p.x, p.y, e); }
  function onMove(e) { if (!E.game) return; var p = pos(e); E.game.move && E.game.move(p.x, p.y, pressed, e); }
  function onUp(e) { if (!E.game) return; if (!pressed) return; pressed = false; var p = pos(e); E.game.up && E.game.up(p.x, p.y, e); }
  function onKey(e) {
    if (!E.root || E.root.hidden) return;
    if (e.key === "Escape") { e.preventDefault(); if (E.game) backToHub(); else closeAll(); return; }
    if (E.game && E.game.key) E.game.key(e);
  }

  function setActs(nodes) {
    E.acts.innerHTML = "";
    (nodes || []).forEach(function (n) { E.acts.appendChild(n); });
  }
  function actBtn(label, fn, cls) {
    var b = D.createElement("button");
    b.type = "button"; b.className = "gm-btn " + (cls || ""); b.textContent = label;
    b.addEventListener("click", function () { sfx("click"); fn(b); });
    return b;
  }

  function showOver(o) {
    var el = E.overEl;
    var isNew = o.score != null && saveBest(E.key, o.score);
    el.innerHTML = '<div class="gm-box" role="dialog" aria-modal="true" aria-label="' + o.title + '">' +
      (isNew && o.score > 0 ? '<span class="gm-tag new">New best</span>' : '<span class="gm-tag">' + (o.tag || "Best " + (best[E.key] || 0)) + "</span>") +
      "<h2>" + o.title + "</h2>" +
      (o.score != null ? '<p class="gm-score">' + o.score + "</p>" : "") +
      "<p>" + (o.text || "") + "</p>" +
      (LB_GAMES[E.key] && o.score != null ? '<div class="gm-lbbox" data-lbbox><p class="gm-lb-load">Saving your score...</p></div>' : "") +
      '<div class="gm-btns"><button type="button" class="gm-btn pri" data-again>Play again</button>' +
      '<div class="gm-row"><button type="button" class="gm-btn" data-more>More games</button><button type="button" class="gm-btn dark" data-site>Enter the site</button></div></div></div>';
    el.hidden = false;
    requestAnimationFrame(function () { el.classList.add("on"); });
    sfx(o.win ? "win" : "over");
    var again = el.querySelector("[data-again]");
    again.addEventListener("click", function () { sfx("click"); startGame(E.key); });
    el.querySelector("[data-more]").addEventListener("click", function () { sfx("click"); backToHub(); });
    el.querySelector("[data-site]").addEventListener("click", function () { sfx("click"); closeAll(); });
    again.focus();
    refreshBest();
    var box = el.querySelector("[data-lbbox]");
    if (box) {
      if (!(o.score > 0)) { box.innerHTML = '<p class="gm-lb-empty">Score a point to join the leaderboard.</p>'; return; }
      submitScore(E.key, o.score).then(function (j) {
        if (!box.isConnected) return;
        box.innerHTML = j ? "<h3>Leaderboard</h3>" + lbHtml(j.top, { rank: j.rank, score: j.best }, j.total) + '<p class="gm-lb-me">You are #' + j.rank + " of " + j.total + "</p>"
          : '<p class="gm-lb-empty">The leaderboard is not reachable right now. Your score will be sent when it is.</p>';
      });
    }
  }
  function hideOver() { E.overEl.classList.remove("on"); E.overEl.hidden = true; E.overEl.innerHTML = ""; }

  /* ------------------------------------------------------------ shared drawing helpers */
  function backdrop(ctx, color, bands, stripe, vig) {
    ctx.fillStyle = color; ctx.fillRect(0, 0, E.w, E.h);
    var band = Math.max(80, E.w * 0.08), gap = band * 2.5, off = bands || 0;
    ctx.fillStyle = stripe || "rgba(255,247,235,.10)";
    for (var x = -E.h * 0.5 - gap + (off % gap); x < E.w + gap; x += gap) {
      ctx.beginPath(); ctx.moveTo(x + E.h * 0.5, 0); ctx.lineTo(x + E.h * 0.5 + band, 0); ctx.lineTo(x + band, E.h); ctx.lineTo(x, E.h); ctx.closePath(); ctx.fill();
    }
    var g = ctx.createRadialGradient(E.w / 2, E.h / 2, Math.min(E.w, E.h) * 0.35, E.w / 2, E.h / 2, Math.max(E.w, E.h) * 0.75);
    g.addColorStop(0, "rgba(26,20,16,0)"); g.addColorStop(1, "rgba(0,0,0," + (vig == null ? 0.35 : vig) + ")");
    ctx.fillStyle = g; ctx.fillRect(0, 0, E.w, E.h);
  }
  function text(ctx, str, x, y, size, color, align, stroke) {
    ctx.font = "400 " + size + "px " + FONT_D; ctx.textAlign = align || "left"; ctx.textBaseline = "alphabetic";
    if (stroke !== 0) { ctx.lineWidth = stroke || size * 0.16; ctx.strokeStyle = C.ink; ctx.lineJoin = "round"; ctx.strokeText(str, x, y); }
    ctx.fillStyle = color || C.cream; ctx.fillText(str, x, y);
  }
  function label(ctx, str, x, y, size, color, align) {
    ctx.font = "700 " + size + "px " + FONT_P; ctx.textAlign = align || "left"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = color || C.cream; ctx.fillText(str, x, y);
  }
  function sugarCube(ctx, s, rot) {
    ctx.save(); ctx.rotate(rot || 0);
    ctx.fillStyle = "#fffaf0"; ctx.strokeStyle = C.ink; ctx.lineWidth = Math.max(3, s * 0.07); ctx.lineJoin = "round";
    ctx.beginPath(); ctx.rect(-s / 2, -s / 2, s, s); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(26,20,16,.12)"; ctx.fillRect(-s / 2 + ctx.lineWidth / 2, s * 0.12, s - ctx.lineWidth, s * 0.38 - ctx.lineWidth / 2);
    ctx.fillStyle = C.beet; ctx.font = "400 " + s * 0.46 + "px " + FONT_D; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("SUGAR", 0, -s * 0.02);
    ctx.strokeStyle = C.beet; ctx.lineWidth = Math.max(3, s * 0.07);
    ctx.beginPath(); ctx.moveTo(-s * 0.34, s * 0.32); ctx.lineTo(s * 0.34, -s * 0.32); ctx.stroke();
    ctx.restore();
  }
  function segDist(px, py, x0, y0, x1, y1) {
    var dx = x1 - x0, dy = y1 - y0, l = dx * dx + dy * dy, t = l ? clamp(((px - x0) * dx + (py - y0) * dy) / l, 0, 1) : 0;
    return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t));
  }
  function livesRow(ctx, n, max, x, y, h) {
    for (var i = 0; i < max; i++) drawBottle(ctx, "orange", x - i * (h * 0.52), y, h, 0.1 * (i % 2 ? 1 : -1), i < n ? 1 : 0.22);
  }

  /* ================================================================ 1. Slice the Fruit (fruit-ninja style) */
  function SliceGame() {
    var g = {}, items = [], halves = [], trail = [], stains = [], queue = [];
    var S = 1, score = 0, lives = 3, t = 0, spawnT = 0.6, flash = 0, over = false, overT = 0, gr = 1400, swipeHits = 0, bottlesCut = 0, msgT = 3, frenzy = 0, frenzies = 0;

    function metrics() { S = clamp(Math.min(E.w, E.h) / 640, 0.62, 1.5); gr = 1500 * S; }
    g.resize = metrics;
    g.init = function () { metrics(); };

    function make(kind) {
      var it = { kind: kind, x: 0, y: 0, vx: 0, vy: 0, rot: rand(0, TAU), vr: rand(-4, 4), dead: false };
      if (kind === "bottle") { it.flav = pick(FLAV); it.gold = Math.random() < 0.09; it.h = 150 * S; it.w = it.h * 168 / 440; it.r = it.h * 0.36; }
      else if (kind === "sugar") { it.h = it.w = 74 * S; it.r = 40 * S; }
      else {
        var f = pick(ALLFRUIT), im = IMG[f.key];
        it.flav = f.flav; it.img = im;
        var k = 96 * S * rand(0.95, 1.2) / Math.max(im ? im.width : 100, im ? im.height : 100);
        it.w = (im ? im.width : 100) * k; it.h = (im ? im.height : 100) * k; it.r = Math.max(it.w, it.h) * 0.46;
      }
      it.x = rand(E.w * 0.14, E.w * 0.86); it.y = E.h + it.h * 0.7;
      var apex = rand(E.h * 0.2, E.h * 0.56);
      it.vy = -Math.sqrt(2 * gr * (E.h - apex));
      var flight = 2 * Math.abs(it.vy) / gr;
      it.vx = (E.w / 2 - it.x) * rand(0.3, 0.85) / flight;
      return it;
    }

    function wave() {
      var n = 1 + ((Math.random() * (1.6 + t / 22)) | 0);
      n = Math.min(n, 4);
      for (var i = 0; i < n; i++) {
        var r = Math.random(), sugarP = clamp(0.1 + t / 400, 0.1, 0.22);
        var kind = r < sugarP ? "sugar" : r < sugarP + 0.3 ? "bottle" : "fruit";
        queue.push({ at: t + i * 0.13, kind: kind });
      }
    }

    function cut(it, ang, px, py) {
      it.dead = true;
      var sugar = it.kind === "sugar";
      sfx(sugar ? "bad" : "slice");
      var cols = sugar ? ["#ffffff", "#efe6d6", "#d9cdb8"] : JUICE[it.flav];
      emit({ x: it.x, y: it.y, n: it.kind === "bottle" ? 30 : 18, min: 80 * S, max: 380 * S, color: cols, smin: 3 * S, smax: 9 * S, grav: 950 * S, lmin: 0.4, lmax: 1 });
      if (it.kind === "bottle") emit({ x: it.x, y: it.y, n: 8, min: 60, max: 260, color: "#ffffff", smin: 3, smax: 6, shape: "shard", grav: 800 * S, lmin: .5, lmax: 1 });
      stains.push({ x: it.x, y: it.y, r: rand(34, 58) * S, c: cols[0], a: sugar ? 0.0 : 0.5, t: 0 });
      var nx = -Math.sin(ang), ny = Math.cos(ang);
      [-1, 1].forEach(function (side) {
        halves.push({ kind: it.kind, flav: it.flav, gold: it.gold, img: it.img, w: it.w, h: it.h, x: it.x, y: it.y, vx: it.vx * 0.5 + side * nx * 150 * S, vy: it.vy * 0.3 + side * ny * 150 * S - 40 * S, rot: it.rot, vr: it.vr + side * 3.5, ang: ang - it.rot, side: side, t: 0 });
      });
      if (sugar) {
        lives--; flash = 1; E.shake = 16; word(it.x, it.y, "No added sugar!", "#ffffff", 30 * S);
        if (lives <= 0) { over = true; overT = 0; }
      } else {
        var pts = (it.kind === "bottle" ? 3 : 1) * (frenzy > 0 ? 2 : 1);
        if (it.gold) {
          frenzy = 6; frenzies++; sfx("gold"); E.shake = 8;
          word(E.w / 2, E.h * 0.34, "JUICE FRENZY!", C.lemon, 56 * S);
          emit({ x: it.x, y: it.y, n: 22, min: 120, max: 460, color: [C.lemon, C.cream, "#ffc01a"], shape: "star", smin: 6 * S, smax: 13 * S, grav: 400, lmin: 0.6, lmax: 1.2 });
        }
        swipeHits++; score += pts;
        if (it.kind === "bottle") bottlesCut++;
        word(it.x, it.y, "+" + pts, it.kind === "bottle" ? C.lemon : C.cream, (it.kind === "bottle" ? 38 : 30) * S);
        if (swipeHits === 3) { score += 3; word(px, py - 50 * S, "COMBO +3", C.lemon, 36 * S); if (!it.gold) sfx("perfect", 2); }
        else if (swipeHits > 3) { score += 1; word(px, py - 50 * S, "x" + swipeHits, C.lemon, 30 * S); }
      }
    }

    g.down = function (x, y) { trail.length = 0; trail.push({ x: x, y: y, t: t }); swipeHits = 0; };
    g.move = function (x, y, pressed) {
      if (!pressed || over) return;
      var last = trail[trail.length - 1];
      if (!last) { trail.push({ x: x, y: y, t: t }); return; }
      if (dist(last.x, last.y, x, y) < 3) return;
      var ang = Math.atan2(y - last.y, x - last.x);
      items.forEach(function (it) { if (!it.dead && segDist(it.x, it.y, last.x, last.y, x, y) <= it.r) cut(it, ang, x, y); });
      trail.push({ x: x, y: y, t: t });
    };
    g.up = function () { swipeHits = 0; };

    g.update = function (dt) {
      t += dt; msgT -= dt;
      if (!over) {
        frenzy = Math.max(0, frenzy - dt);
        spawnT -= dt;
        if (spawnT <= 0) { wave(); spawnT = Math.max(0.55, 1.6 - t * 0.012) * rand(0.85, 1.2) * (frenzy > 0 ? 0.45 : 1); }
        for (var q = queue.length - 1; q >= 0; q--) if (queue[q].at <= t) { var it0 = make(queue[q].kind); items.push(it0); queue.splice(q, 1); }
      } else {
        overT += dt;
        if (overT > 0.9 && !g._shown) { g._shown = true; showOver({ title: "Game over", score: score, text: bottlesCut + " bottle" + (bottlesCut === 1 ? "" : "s") + " sliced" + (frenzies ? ", " + frenzies + " frenz" + (frenzies === 1 ? "y" : "ies") : "") + ". Keep an eye on the sugar." }); }
      }
      items.forEach(function (it) {
        it.vy += gr * dt; it.x += it.vx * dt; it.y += it.vy * dt; it.rot += it.vr * dt;
        if (!it.dead && it.y > E.h + it.h && it.vy > 0) {
          it.dead = true;
          if (it.kind === "bottle" && !over) {
            lives--; flash = 0.6; E.shake = 8; sfx("bad"); word(clamp(it.x, 60, E.w - 60), E.h - 80, "Dropped!", C.lemon, 34 * S);
            if (lives <= 0) { over = true; overT = 0; }
          }
        }
      });
      items = items.filter(function (it) { return !it.dead || false; });
      halves.forEach(function (h) { h.vy += gr * dt; h.x += h.vx * dt; h.y += h.vy * dt; h.rot += h.vr * dt; h.t += dt; });
      halves = halves.filter(function (h) { return h.y < E.h + 200 && h.t < 3; });
      for (var i = trail.length - 1; i >= 0; i--) if (t - trail[i].t > 0.22) trail.splice(0, i + 1), i = -1;
      stains.forEach(function (s) { s.t += dt; });
      stains = stains.filter(function (s) { return s.t < 6; });
      flash = Math.max(0, flash - dt * 2.2);
    };

    function drawSprite(ctx, o, clipSide) {
      ctx.save();
      ctx.translate(o.x, o.y); ctx.rotate(o.rot);
      if (clipSide) {
        ctx.save(); ctx.rotate(o.ang); ctx.beginPath(); ctx.rect(-400, clipSide === 1 ? 0 : -400, 800, 400); ctx.restore();
        // clip path was built in the rotated frame; apply it
        ctx.clip();
      }
      if (o.kind === "sugar") sugarCube(ctx, o.w, 0);
      else if (o.kind === "bottle") { var im = IMG["b-" + o.flav]; if (o.gold) { ctx.shadowColor = "#ffdc52"; ctx.shadowBlur = 34; } if (im) ctx.drawImage(im, 0, 0, im.width, im.height * 0.985, -o.w / 2, -o.h / 2, o.w, o.h); }
      else if (o.img) ctx.drawImage(o.img, -o.w / 2, -o.h / 2, o.w, o.h);
      ctx.restore();
    }

    g.draw = function (ctx) {
      backdrop(ctx, "#2b1c14", t * 8, "rgba(255,138,42,.13)", 0.45);
      stains.forEach(function (s) {
        ctx.globalAlpha = s.a * (1 - s.t / 6); ctx.fillStyle = s.c;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
        for (var k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(s.x + Math.cos(k * 1.3 + s.x) * s.r * 0.9, s.y + Math.sin(k * 1.7 + s.y) * s.r * 0.9, s.r * 0.28, 0, TAU); ctx.fill(); }
      });
      ctx.globalAlpha = 1;
      items.forEach(function (it) { drawSprite(ctx, it, 0); });
      halves.forEach(function (h) { drawSprite(ctx, h, h.side); });
      drawParts(ctx);
      // blade
      if (trail.length > 1) {
        for (var pass = 0; pass < 2; pass++) {
          for (var i = 1; i < trail.length; i++) {
            var a = trail[i - 1], b = trail[i], age = (t - b.t) / 0.22, wdt = (1 - age) * 14 * S + 2;
            ctx.lineCap = "round"; ctx.lineWidth = pass ? wdt : wdt + 6; ctx.strokeStyle = pass ? "rgba(255,247,235," + (1 - age) + ")" : "rgba(26,20,16," + (0.9 * (1 - age)) + ")";
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }
      drawWords(ctx);
      if (flash > 0) { ctx.fillStyle = "rgba(224,52,66," + flash * 0.4 + ")"; ctx.fillRect(0, 0, E.w, E.h); }
      if (frenzy > 0) {
        var fg = ctx.createRadialGradient(E.w / 2, E.h / 2, Math.min(E.w, E.h) * 0.3, E.w / 2, E.h / 2, Math.max(E.w, E.h) * 0.7);
        fg.addColorStop(0, "rgba(255,220,82,0)"); fg.addColorStop(1, "rgba(255,220,82," + (0.22 + Math.sin(t * 8) * 0.06) + ")");
        ctx.fillStyle = fg; ctx.fillRect(0, 0, E.w, E.h);
        text(ctx, "FRENZY x2  " + frenzy.toFixed(1) + "s", E.w / 2, 112, 30 * S, C.lemon, "center");
      }
      // HUD
      var pad = 18, top = 74;
      text(ctx, String(score), pad, top + 34 * S, 64 * S, C.cream);
      label(ctx, "BEST " + (best.slice || 0), pad + 4, top + 58 * S, 13, "rgba(255,247,235,.85)");
      livesRow(ctx, lives, 3, E.w - pad - 24, top + 52 * S, 48 * S);
      if (msgT > 0 && !over) {
        ctx.globalAlpha = clamp(msgT, 0, 1);
        text(ctx, "Swipe to slice. Skip the sugar.", E.w / 2, E.h * 0.9, 26 * S, C.cream, "center");
        ctx.globalAlpha = 1;
      }
    };
    g.dbg = function () { return { score: score, lives: lives, items: items.length, halves: halves.length, over: over, list: items.map(function (i) { return { x: Math.round(i.x), y: Math.round(i.y), r: Math.round(i.r), k: i.kind }; }), trail: trail.length }; };
    return g;
  }

  /* ================================================================ 2. Stack the Bottles */
  function StackGame() {
    var g = {}, tower = [], falling = null, debris = [], rings = [];
    var bw = 80, bh = 200, step = 180, cx = 0, groundY = 0, camY = 0, camT = 0;
    var t = 0, score = 0, combo = 0, wob = 0, level = 0, state = "swing", hint = 1, bgCol = [253, 126, 29], over = false, overT = 0, perfectCount = 0, topple = null, swingPhase = 0;
    var nextFlav = "orange", bestH = store.get("pp-stack-best-h", 0), stacked = 0;

    function metrics() {
      bh = clamp(E.h * 0.2, 96, 190); bw = bh * 168 / 440; step = bh * 0.9;
      cx = E.w / 2; groundY = E.h - clamp(E.h * 0.1, 56, 90);
    }
    g.resize = metrics;
    g.init = function () { metrics(); nextFlav = pick(FLAV); };

    function swingNow() {
      var amp = clamp(E.w * 0.3, bw * 1.4, 340);
      return cx + Math.sin(swingPhase) * amp;
    }
    function topWorld() { return tower.length * step; } // world height (up) where the next bottle's base lands
    function sy(wy) { return groundY - wy + camY; }

    function drop() {
      if (state !== "swing" || over) return;
      state = "fall"; hint = 0;
      falling = { x: swingNow(), wy: E.h * 0.2 + bh, vy: 0, rot: 0, flav: nextFlav };
      sfx("pop");
    }

    function land() {
      var base = tower.length ? tower[tower.length - 1].x : cx;
      var dx = falling.x - base, adx = Math.abs(dx);
      if (adx > bw * 0.62) { // missed: it slides off and the run ends
        state = "miss"; falling.vx = dx > 0 ? 160 : -160; falling.vr = dx > 0 ? 3 : -3;
        sfx("bad"); return;
      }
      var perfect = adx < bw * 0.07;
      var x = perfect ? base : falling.x;
      tower.push({ x: x, flav: falling.flav, squash: 0.9, born: t });
      level++; stacked++;
      if (stacked > bestH) { bestH = stacked; store.set("pp-stack-best-h", bestH); }
      if (perfect) {
        combo++; perfectCount++; wob = Math.max(0, wob - 0.8); score += 1 + Math.min(combo, 6);
        sfx("perfect", combo);
        rings.push({ x: x, y: sy((tower.length - 1) * step) - bh * 0.5, t: 0 });
        emit({ x: x, y: sy((tower.length - 1) * step) - bh * 0.1, n: 14, min: 80, max: 260, color: [C.lemon, C.cream, BG[falling.flav]], shape: "star", smin: 5, smax: 10, grav: 500, lmin: 0.5, lmax: 1 });
        word(x, sy(tower.length * step) - bh, combo > 1 ? "PERFECT x" + combo : "PERFECT", C.lemon, 34);
      } else {
        combo = 0; wob += adx / bw * 1.1; score += 1;
        sfx("drop"); E.shake = 5;
        emit({ x: x, y: sy((tower.length - 1) * step), n: 8, min: 30, max: 140, color: JUICE[falling.flav], grav: 500, lmin: 0.3, lmax: 0.6 });
      }
      nextFlav = pick(FLAV.filter(function (f) { return f !== falling.flav; }));
      falling = null; state = "swing";
      if (wob > 3.2) { state = "topple"; topple = { t: 0 }; sfx("topple"); E.shake = 18; over = true; overT = 0; }
    }

    g.down = function () { drop(); };
    g.key = function (e) { if (e.key === " " || e.key === "Enter" || e.key === "ArrowDown") { e.preventDefault(); drop(); } };

    g.update = function (dt) {
      t += dt;
      var speed = 1.5 + Math.min(level, 24) * 0.085;
      if (state === "swing") swingPhase += dt * speed;
      // camera follows the tower
      var target = Math.max(0, topWorld() + E.h * 0.58 - groundY);
      camT = target > camT ? target : camT;
      camY = lerp(camY, camT, 1 - Math.pow(0.0008, dt));
      // colour of the sky follows the bottle in hand
      var tc = hexRgb(BG[state === "fall" && falling ? falling.flav : nextFlav]);
      for (var i = 0; i < 3; i++) bgCol[i] = lerp(bgCol[i], tc[i], 1 - Math.pow(0.02, dt));
      if (falling) {
        falling.vy += 2600 * dt;
        if (state === "fall") {
          falling.wy += falling.vy * dt;           // wy is the screen y of the bottle base while it falls
          var landScreen = sy(topWorld());
          if (falling.wy >= landScreen) { falling.wy = landScreen; land(); }
        } else if (state === "miss") {
          falling.wy += falling.vy * dt; falling.x += falling.vx * dt; falling.rot += falling.vr * dt;
          if (falling.wy > E.h + bh * 1.5) { falling = null; state = "over"; over = true; overT = 0; }
        }
      }
      tower.forEach(function (b) { b.squash = lerp(b.squash, 1, 1 - Math.pow(0.001, dt)); });
      for (var r = rings.length - 1; r >= 0; r--) { rings[r].t += dt; if (rings[r].t > 0.7) rings.splice(r, 1); }
      if (topple) {
        topple.t += dt;
        if (!topple.go) {
          topple.go = true; topple.bits = tower.map(function (b, i) { return { x: b.x, y: sy(i * step), flav: b.flav, vx: rand(-260, 260) + (i - tower.length / 2) * 40, vy: -rand(80, 420), rot: 0, vr: rand(-4, 4) }; });
          tower = [];
        }
        topple.bits.forEach(function (b) { b.vy += 2200 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.rot += b.vr * dt; });
      }
      if (over) { overT += dt; if (overT > 1.1 && !g._shown) { g._shown = true; showOver({ title: state === "topple" ? "Timber!" : "Missed!", score: score, text: tower.length + (state === "topple" ? " bottles toppled over." : " bottles stacked.") + (perfectCount ? " " + perfectCount + " perfect drops." : "") }); } }
    };

    function hexRgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }

    g.draw = function (ctx) {
      backdrop(ctx, "rgb(" + (bgCol[0] | 0) + "," + (bgCol[1] | 0) + "," + (bgCol[2] | 0) + ")", t * 6);
      var gy = sy(0);
      // podium
      ctx.fillStyle = C.ink; ctx.fillRect(0, gy + 10, E.w, E.h - gy);
      ctx.fillStyle = C.cream; ctx.fillRect(0, gy + 10, E.w, 6);
      var pw = bw * 2.1;
      ctx.fillStyle = C.cream; ctx.strokeStyle = C.ink; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.rect(cx - pw / 2, gy - 8, pw, 24); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.tangerine; ctx.fillRect(cx - pw / 2 + 4, gy - 4, pw - 8, 8);
      // tower with sway
      var ang = tower.length ? Math.sin(t * 2.3) * Math.min(0.05, wob * 0.013) : 0;
      ctx.save(); ctx.translate(cx, gy); ctx.rotate(ang); ctx.translate(-cx, -gy);
      tower.forEach(function (b, i) {
        drawBottle(ctx, b.flav, b.x, sy(i * step), bh * b.squash);
      });
      ctx.restore();
      rings.forEach(function (r) {
        ctx.globalAlpha = 1 - r.t / 0.7; ctx.strokeStyle = C.lemon; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.ellipse(r.x, r.y, bw * (0.7 + r.t * 1.4), bh * (0.3 + r.t * 0.6), 0, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
      });
      // the best tower so far, as a dashed line to beat
      if (bestH > tower.length && bestH > 1) {
        var ly = sy(bestH * step) - bh * 0.1;
        if (ly > 80 && ly < E.h) {
          ctx.save(); ctx.setLineDash([14, 10]); ctx.strokeStyle = "rgba(255,247,235,.85)"; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(E.w, ly); ctx.stroke(); ctx.restore();
          label(ctx, "YOUR BEST TOWER: " + bestH, E.w - 14, ly - 8, 13, C.cream, "right");
        }
      }
      // crane
      var sx = state === "swing" || !falling ? swingNow() : falling.x;
      if (state === "swing" && !over) {
        var hy = E.h * 0.2;
        ctx.fillStyle = C.ink; ctx.fillRect(0, 70, E.w, 8);
        ctx.strokeStyle = C.ink; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(sx, 78); ctx.lineTo(sx, hy + 6); ctx.stroke();
        ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(sx, hy + 2, 8, 0, TAU); ctx.fill();
        drawBottle(ctx, nextFlav, sx, hy + bh, bh, Math.sin(swingPhase) * 0.05);
      }
      if (falling) drawBottle(ctx, falling.flav, falling.x, falling.wy, bh, falling.rot || 0);
      if (topple) topple.bits.forEach(function (b) { drawBottle(ctx, b.flav, b.x, b.y, bh, b.rot); });
      drawParts(ctx); drawWords(ctx);
      // HUD
      text(ctx, String(score), 18, 108, 64, C.cream);
      label(ctx, "BEST " + (best.stack || 0), 22, 134, 13, "rgba(255,247,235,.9)");
      if (combo > 1) { text(ctx, "x" + combo, E.w - 18, 108, 48, C.lemon, "right"); }
      if (hint) { ctx.globalAlpha = 0.6 + Math.sin(t * 5) * 0.4; text(ctx, "Tap to drop", E.w / 2, E.h * 0.9, 34, C.cream, "center"); ctx.globalAlpha = 1; }
    };
    g.dbg = function () { return { score: score, tower: tower.length, state: state, wob: wob, combo: combo, over: over, swing: swingNow(), cx: cx, bw: bw }; };
    return g;
  }

  /* ================================================================ 3. Smash the Shelf (whack-a-bottle) */
  function SmashGame() {
    var g = {}, slots = [], splats = [];
    var cols = 3, rows = 3, rowH = 100, bh = 120, bw = 46, lip = 22, shelfX0 = 0, shelfX1 = 0;
    var t = 0, timeLeft = 45, score = 0, combo = 0, hits = 0, whiffs = 0, spawnT = 0.5, flash = 0, over = false, overT = 0, golds = 0;
    var mal = { x: 0, y: 0, vis: false, swing: 1, fade: 0 };
    var top = 120;

    function layout() {
      var wide = E.w / E.h > 1.35;
      cols = wide ? 4 : 3; rows = wide ? 2 : 3;
      top = 118; var bottom = 26, gh = E.h - top - bottom;
      rowH = gh / rows;
      var slotW = Math.min(E.w * 0.94 / cols, 250);
      bh = Math.min(rowH * 0.8, slotW * 1.9); bw = bh * 168 / 440; lip = clamp(rowH * 0.13, 14, 30);
      shelfX0 = E.w / 2 - slotW * cols / 2; shelfX1 = E.w / 2 + slotW * cols / 2;
      var old = slots; slots = [];
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
        var prev = old[r * cols + c] || {};
        slots.push({ x: E.w / 2 + (c - (cols - 1) / 2) * slotW, y: top + rowH * (r + 1) - lip, state: prev.state || "idle", t: prev.t || 0, dur: prev.dur || 1, kind: prev.kind || "n", flav: prev.flav || "orange", f: prev.f || 0, r: r });
      }
    }
    g.resize = layout;
    g.init = function () { layout(); };

    function spawn() {
      var idle = slots.filter(function (s) { return s.state === "idle"; });
      if (!idle.length) return;
      var s = pick(idle), r = Math.random();
      s.state = "up"; s.t = 0; s.f = 0;
      s.dur = clamp(1.5 - t * 0.017, 0.62, 1.5) * rand(0.9, 1.15);
      s.kind = r < 0.1 ? "sugar" : r < 0.18 ? "gold" : "n";
      s.flav = pick(FLAV);
      sfx("pop");
    }

    function smash(s) {
      s.state = "idle"; s.f = 0;
      var mult = 1 + Math.min(3, Math.floor(combo / 5));
      var by = s.y - bh * 0.5;
      if (s.kind === "sugar") {
        score = Math.max(0, score - 3); combo = 0; flash = 1; E.shake = 14; sfx("bad");
        emit({ x: s.x, y: by, n: 24, min: 60, max: 300, color: ["#ffffff", "#efe6d6", "#d9cdb8"], smin: 3, smax: 8, grav: 700, lmin: .4, lmax: .9 });
        word(s.x, by, "Sugar! -3", "#ffffff", 34);
        return;
      }
      var gold = s.kind === "gold", pts = (gold ? 5 : 1) * mult;
      score += pts; combo++; hits++; if (gold) golds++;
      sfx(gold ? "gold" : "smash"); E.shake = gold ? 14 : 10;
      emit({ x: s.x, y: by, n: 18, min: 100, max: 420, color: ["rgba(255,255,255,.85)", "rgba(200,235,255,.8)", JUICE[s.flav][0]], shape: "shard", smin: 5, smax: 11, grav: 1100, lmin: 0.6, lmax: 1.2 });
      emit({ x: s.x, y: by, n: 26, min: 80, max: 380, color: JUICE[s.flav], smin: 3, smax: 9, grav: 900, lmin: 0.4, lmax: 1 });
      if (gold) emit({ x: s.x, y: by, n: 14, min: 100, max: 300, color: [C.lemon, C.cream], shape: "star", smin: 6, smax: 12, grav: 300, lmin: .6, lmax: 1.2 });
      splats.push({ x: s.x, y: s.y - bh * 0.3, r: rand(40, 70), c: JUICE[s.flav][0], t: 0 });
      word(s.x, by, gold ? "GOLDEN +" + pts : "+" + pts, gold ? C.lemon : C.cream, gold ? 40 : 34);
      if (combo === 5 || combo === 10 || combo === 15) word(E.w / 2, E.h * 0.45, "COMBO x" + (1 + Math.floor(combo / 5)), C.lemon, 56);
    }

    function hit(x, y) {
      var best = null, bd = 1e9;
      slots.forEach(function (s) {
        if (s.state !== "up" || s.f < 0.3) return;
        var topY = s.y - bh * s.f, dx = Math.abs(x - s.x);
        if (dx < bw * 0.7 + 10 && y > topY - 12 && y < s.y + 8) { var d = dx + Math.abs(y - (s.y - bh * 0.4)) * 0.2; if (d < bd) { bd = d; best = s; } }
      });
      return best;
    }

    g.down = function (x, y) {
      if (over) return;
      mal.x = x; mal.y = y; mal.vis = true; mal.swing = 0; mal.fade = 0;
      var s = hit(x, y);
      if (s) smash(s);
      else {
        combo = 0; whiffs++;
        emit({ x: x, y: y, n: 8, min: 20, max: 110, color: "rgba(255,247,235,.8)", smin: 3, smax: 7, grav: -60, lmin: .3, lmax: .5, drag: 3 });
      }
    };
    g.move = function (x, y) { mal.x = x; mal.y = y; mal.vis = true; mal.fade = 0; };
    g.key = function () { };

    g.update = function (dt) {
      t += dt; mal.swing = Math.min(1, mal.swing + dt / 0.16); mal.fade += dt;
      if (!over) {
        timeLeft -= dt;
        if (timeLeft <= 0) { timeLeft = 0; over = true; overT = 0; }
        spawnT -= dt;
        var busy = slots.filter(function (s) { return s.state === "up"; }).length, cap = 1 + Math.min(3, Math.floor(t / 11));
        if (spawnT <= 0 && busy < cap) { spawn(); spawnT = clamp(0.75 - t * 0.008, 0.3, 0.75) * rand(0.8, 1.2); }
      } else {
        overT += dt;
        if (overT > 0.8 && !g._shown) {
          g._shown = true;
          var acc = hits + whiffs ? Math.round(hits / (hits + whiffs) * 100) : 0;
          showOver({ title: "Time's up", score: score, text: hits + " bottles smashed, " + acc + "% accuracy" + (golds ? ", " + golds + " golden." : ".") });
        }
      }
      slots.forEach(function (s) {
        if (s.state !== "up") return;
        s.t += dt;
        var rise = 0.14, fall = 0.18;
        if (s.t < rise) s.f = easeBack(s.t / rise);
        else if (s.t < s.dur - fall) s.f = 1;
        else if (s.t < s.dur) s.f = 1 - (s.t - (s.dur - fall)) / fall;
        else { s.state = "idle"; s.f = 0; }
      });
      splats.forEach(function (p) { p.t += dt; });
      splats = splats.filter(function (p) { return p.t < 4; });
      flash = Math.max(0, flash - dt * 2.4);
    };

    function mallet(ctx) {
      if (!mal.vis || mal.fade > 1.6) return;
      var sw = mal.swing, ang = sw < 1 ? lerp(-1.0, 0.55, easeOut(sw)) : lerp(0.55, -0.55, Math.min(1, (mal.fade - 0.16) * 2.5));
      ctx.save();
      ctx.globalAlpha = mal.fade > 1.1 ? 1 - (mal.fade - 1.1) / 0.5 : 1;
      ctx.translate(mal.x, mal.y); ctx.rotate(ang);
      var hl = clamp(E.h * 0.11, 62, 100);
      ctx.fillStyle = "#e9c28a"; ctx.strokeStyle = C.ink; ctx.lineWidth = 5; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.rect(-7, -hl, 14, hl); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.tangerine;
      ctx.beginPath(); ctx.rect(-hl * 0.4, -hl - 22, hl * 0.8, 38); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.cream; ctx.fillRect(-hl * 0.4 + 5, -hl - 15, hl * 0.8 - 10, 6);
      ctx.restore();
    }

    g.draw = function (ctx) {
      backdrop(ctx, BG.yuzu, t * 6);
      splats.forEach(function (p) {
        ctx.globalAlpha = 0.45 * (1 - p.t / 4); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
      });
      ctx.globalAlpha = 1;
      // shelf rows
      for (var r = 0; r < rows; r++) {
        var yb = top + rowH * (r + 1) - lip;
        ctx.fillStyle = C.ink; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(shelfX0, yb - bh * 1.12, shelfX1 - shelfX0, bh * 1.12 + lip, 14) : ctx.rect(shelfX0, yb - bh * 1.12, shelfX1 - shelfX0, bh * 1.12 + lip); ctx.fill();
        ctx.fillStyle = "rgba(255,247,235,.06)"; ctx.fillRect(shelfX0 + 8, yb - bh * 1.12 + 8, shelfX1 - shelfX0 - 16, bh * 0.14);
      }
      // bottles, clipped so they rise out of the board
      slots.forEach(function (s) {
        if (s.state !== "up") return;
        ctx.save();
        ctx.beginPath(); ctx.rect(s.x - bh, s.y - bh * 1.3, bh * 2, bh * 1.3 + 2); ctx.clip();
        var by = s.y + (1 - s.f) * bh * 1.02;
        if (s.kind === "gold") {
          var gl = ctx.createRadialGradient(s.x, by - bh * 0.5, 4, s.x, by - bh * 0.5, bh * 0.8);
          gl.addColorStop(0, "rgba(255,220,82,.95)"); gl.addColorStop(1, "rgba(255,220,82,0)");
          ctx.fillStyle = gl; ctx.fillRect(s.x - bh, by - bh * 1.4, bh * 2, bh * 1.6);
        }
        if (s.kind === "sugar") { ctx.translate(s.x, by - bh * 0.45); sugarCube(ctx, bh * 0.55, Math.sin(t * 6 + s.x) * 0.12); }
        else drawBottle(ctx, s.flav, s.x, by, bh, Math.sin(t * 10 + s.x) * 0.02 * s.f);
        ctx.restore();
        if (s.kind === "gold") {
          ctx.fillStyle = C.lemon;
          for (var k = 0; k < 3; k++) { var a = t * 3 + k * 2.1; ctx.beginPath(); ctx.arc(s.x + Math.cos(a) * bw * 0.9, s.y - bh * 0.55 * s.f + Math.sin(a) * bh * 0.3, 5, 0, TAU); ctx.fill(); }
        }
      });
      // board lips
      for (var r2 = 0; r2 < rows; r2++) {
        var y2 = top + rowH * (r2 + 1) - lip;
        ctx.fillStyle = C.cream; ctx.strokeStyle = C.ink; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.rect(shelfX0 - 8, y2, shelfX1 - shelfX0 + 16, lip); ctx.fill(); ctx.stroke();
        ctx.fillStyle = C.tangerine; ctx.fillRect(shelfX0 - 4, y2 + lip * 0.55, shelfX1 - shelfX0 + 8, lip * 0.25);
      }
      drawParts(ctx); drawWords(ctx);
      mallet(ctx);
      if (flash > 0) { ctx.fillStyle = "rgba(224,52,66," + flash * 0.4 + ")"; ctx.fillRect(0, 0, E.w, E.h); }
      // HUD
      text(ctx, String(score), 18, 100, 60, C.cream);
      label(ctx, "BEST " + (best.smash || 0), 22, 120, 13, "rgba(255,247,235,.9)");
      var mult = 1 + Math.min(3, Math.floor(combo / 5));
      if (combo > 2) text(ctx, (mult > 1 ? "x" + mult + "  " : "") + combo + " in a row", E.w - 18, 90, 28, C.lemon, "right");
      var bwid = Math.min(260, E.w * 0.4), bx = E.w - 18 - bwid;
      ctx.fillStyle = C.ink; ctx.fillRect(bx - 3, 100 - 3, bwid + 6, 16);
      ctx.fillStyle = timeLeft < 10 ? C.beet : C.lemon; ctx.fillRect(bx, 100, bwid * (timeLeft / 45), 10);
      label(ctx, Math.ceil(timeLeft) + "s", E.w - 18, 134, 14, "rgba(255,247,235,.95)", "right");
    };
    g.dbg = function () { return { score: score, time: timeLeft, combo: combo, hits: hits, up: slots.filter(function (s) { return s.state === "up"; }).map(function (s) { return { x: s.x, y: s.y, f: s.f, kind: s.kind, bh: bh }; }), over: over }; };
    return g;
  }

  /* ================================================================ 4. Mix the Colours */
  var COMBOS = [
    { key: "orange+beet", name: "Sunset Riot" }, { key: "orange+green", name: "Mango Mint Mash" }, { key: "orange+yuzu", name: "Golden Hour" },
    { key: "beet+green", name: "Forest Berry" }, { key: "beet+yuzu", name: "Rosé Zing" }, { key: "green+yuzu", name: "Lime Zinger" },
    { key: "orange+beet+green", name: "Mystery Machine" }, { key: "orange+beet+yuzu", name: "Peach Burst" },
    { key: "orange+green+yuzu", name: "Sunny Meadow" }, { key: "beet+green+yuzu", name: "Berry Garden" },
    { key: "orange+beet+green+yuzu", name: "Rainbow Riot" }
  ];
  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0, d = mx - mn;
    if (d) { s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
    return [h, s, l];
  }
  function hsl2rgb(h, s, l) {
    function f(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }
    if (!s) return [l * 255, l * 255, l * 255];
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255];
  }
  function mixOf(amts) {
    var tot = 0, r = 0, g = 0, b = 0;
    FLAV.forEach(function (f) { var a = amts[f] || 0; tot += a; r += LIQ[f][0] * a; g += LIQ[f][1] * a; b += LIQ[f][2] * a; });
    if (!tot) return [255, 243, 226];
    var hsl = rgb2hsl(r / tot, g / tot, b / tot);
    return hsl2rgb(hsl[0], Math.min(1, hsl[1] * 1.12), hsl[2]);
  }
  var rgbStr = function (c, a) { return "rgba(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + "," + (a == null ? 1 : a) + ")"; };
  function comboRgb(key) { var amts = {}; key.split("+").forEach(function (f) { amts[f] = 1; }); return mixOf(amts); }

  function MixGame() {
    var g = {}, found = store.get("pp-mix-found", {}), segs = [], bots = [], toast = null, card = null, lastSig = "", mixF = 1, pourIdx = -1, drain = 0, stirT = 0, t = 0, finished = false;
    var glass = { x: 0, w: 200, h: 220, base: 0 }, bh = 130, bw = 50, GL = 100;

    function total() { return segs.reduce(function (a, s) { return a + s.amt; }, 0); }
    function amounts() { var o = {}; segs.forEach(function (s) { o[s.flav] = (o[s.flav] || 0) + s.amt; }); return o; }
    function foundCount() { return COMBOS.filter(function (c) { return found[c.key]; }).length; }

    function layout() {
      bh = clamp(E.h * 0.19, 88, 168); bw = bh * 168 / 440;
      glass.w = clamp(E.w * 0.42, 160, 270); glass.h = clamp(E.h * 0.3, 170, 290); glass.x = E.w / 2; glass.base = E.h - clamp(E.h * 0.13, 84, 118);
      var spread = Math.min(E.w * 0.92, bw * 4 * 1.7), baseY = glass.base - glass.h - bh * 0.7 - 20;
      baseY = Math.max(baseY, 118 + bh);
      var old = bots; bots = [];
      FLAV.forEach(function (f, i) {
        var x = E.w / 2 + (i - 1.5) * (spread / 4);
        var o = old[i] || { x: x, y: baseY, rot: 0, lift: 0 };
        o.hx = x; o.hy = baseY; o.flav = f; bots.push(o);
      });
    }
    g.resize = layout;
    g.init = function () {
      layout();
      E.setActs([
        E.actBtn("Stir", function () { if (total() > 0) { stirT = 0.9; mixF = Math.max(mixF, 0.55); sfx("pour"); } }, ""),
        E.actBtn("Empty glass", function () { if (total() > 0) { drain = 1; lastSig = ""; } }, "dark")
      ]);
    };

    function pourPose(b, i) {
      var left = b.hx < glass.x, ang = left ? 1.82 : -1.82;
      var rimY = glass.base - glass.h;
      var mx = glass.x + (left ? -glass.w * 0.12 : glass.w * 0.12), my = rimY - 26;
      // the bottle's mouth (top of sprite) should sit just above the rim
      return { x: mx - Math.sin(ang) * bh, y: my + Math.cos(ang) * bh, rot: ang, mx: mx, my: my };
    }

    g.down = function (x, y) {
      if (finished) return;
      for (var i = 0; i < bots.length; i++) {
        var b = bots[i];
        if (Math.abs(x - b.hx) < bw * 0.75 && y > b.hy - bh * 1.1 && y < b.hy + 14) { pourIdx = i; sfx("click"); return; }
      }
    };
    g.up = function () { pourIdx = -1; };
    g.key = function (e) {
      var n = parseInt(e.key, 10);
      if (n >= 1 && n <= 4 && !e.repeat) { pourIdx = n - 1; }
    };
    D.addEventListener("keyup", keyUp);
    function keyUp(e) { var n = parseInt(e.key, 10); if (n >= 1 && n <= 4) pourIdx = -1; }
    g.destroy = function () { D.removeEventListener("keyup", keyUp); };

    function evaluate() {
      var am = amounts(), set = FLAV.filter(function (f) { return (am[f] || 0) >= 6; });
      var sig = set.join("+");
      if (sig === lastSig || !set.length) return;
      lastSig = sig;
      if (set.length === 1) { toast = { t: 0, txt: "That is just " + NAME[set[0]] + ". Add another colour!" }; return; }
      var c = COMBOS.filter(function (k) { return k.key === sig; })[0];
      if (!c) return;
      if (found[c.key]) { toast = { t: 0, txt: "Already found: " + c.name }; return; }
      found[c.key] = true; store.set("pp-mix-found", found);
      var n = foundCount(); best.mix = Math.max(best.mix || 0, n); store.set("pp-game-best", best);
      var col = mixOf(am);
      card = { t: 0, name: c.name, col: col, n: n };
      sfx("found");
      for (var k = 0; k < 3; k++) emit({ x: E.w / 2, y: E.h * 0.45, n: 24, min: 120, max: 520, color: [rgbStr(col), C.lemon, C.cream], shape: k ? "conf" : "star", smin: 5, smax: 11, grav: 520, lmin: 0.9, lmax: 1.8 });
      if (n === COMBOS.length) { finished = true; setTimeout(function () { showOver({ title: "Colour master!", score: null, tag: n + " of " + COMBOS.length, text: "You found every colour in the Vitame range.", win: true }); }, 2200); }
    }

    g.update = function (dt) {
      t += dt; stirT = Math.max(0, stirT - dt);
      // bottle poses
      bots.forEach(function (b, i) {
        var active = i === pourIdx && !drain && total() < GL;
        var tx = b.hx, ty = b.hy, tr = 0;
        if (i === pourIdx) { var p = pourPose(b, i); tx = p.x; ty = p.y; tr = p.rot; b.mx = p.mx; b.my = p.my; }
        var k = 1 - Math.pow(0.0004, dt);
        b.x = lerp(b.x, tx, k); b.y = lerp(b.y, ty, k); b.rot = lerp(b.rot, tr, k);
        b.pouring = active && Math.abs(b.rot - tr) < 0.32 && i === pourIdx;
      });
      var pb = bots[pourIdx];
      if (pb && pb.pouring) {
        var add = Math.min(GL - total(), 26 * dt);
        if (add > 0) {
          var last = segs[segs.length - 1];
          if (last && last.flav === pb.flav) last.amt += add; else segs.push({ flav: pb.flav, amt: add });
          mixF = Math.min(mixF, 0.15);
          if (Math.random() < dt * 14) sfx("pour");
          var sy = glass.base - (total() / GL) * (glass.h - 16);
          emit({ x: pb.mx + rand(-3, 3), y: sy, n: 1, angle: -Math.PI / 2, spread: 0.9, min: 60, max: 160, color: rgbStr(LIQ[pb.flav]), smin: 2, smax: 4, grav: 700, lmin: .25, lmax: .5 });
          lastSig = "";
        }
        if (total() >= GL - 0.01 && !toast) toast = { t: 0, txt: "The glass is full!" };
      } else if (total() > 0 && !drain) {
        mixF = Math.min(1, mixF + dt / (stirT > 0 ? 0.5 : 1.5));
        if (mixF >= 1) evaluate();
      }
      if (drain) {
        drain = Math.max(0, drain - dt * 1.6);
        segs.forEach(function (s) { s.amt *= 1 - dt * 2.5; });
        if (Math.random() < 0.5) emit({ x: glass.x + rand(-glass.w * 0.3, glass.w * 0.3), y: glass.base - 6, n: 1, angle: Math.PI / 2, spread: 0.3, min: 60, max: 200, color: rgbStr(mixOf(amounts())), smin: 2, smax: 5, grav: 900, lmin: .3, lmax: .6 });
        if (drain <= 0) { segs = []; mixF = 1; if (!toast) toast = { t: 0, txt: "Fresh glass. Pour away!" }; }
      }
      if (toast) { toast.t += dt; if (toast.t > 2.2) toast = null; }
      if (card) { card.t += dt; if (card.t > 3.2) card = null; }
    };

    function glassPath(ctx, inset) {
      var w = glass.w - inset * 2, topW = w, botW = w * 0.8, x = glass.x, yb = glass.base - inset, yt = glass.base - glass.h + inset;
      ctx.beginPath();
      ctx.moveTo(x - topW / 2, yt); ctx.lineTo(x + topW / 2, yt);
      ctx.lineTo(x + botW / 2, yb - 16); ctx.quadraticCurveTo(x + botW / 2, yb, x + botW / 2 - 16, yb);
      ctx.lineTo(x - botW / 2 + 16, yb); ctx.quadraticCurveTo(x - botW / 2, yb, x - botW / 2, yb - 16); ctx.closePath();
    }

    g.draw = function (ctx) {
      var mixc = mixOf(amounts()), tint = total() ? mixc : [255, 243, 226];
      backdrop(ctx, "rgb(" + (lerp(59, tint[0], 0.35) | 0) + "," + (lerp(139, tint[1], 0.35) | 0) + "," + (lerp(61, tint[2], 0.35) | 0) + ")", t * 6);
      // collection tray
      var chip = clamp(E.w / 16, 22, 34), gap = 5, tw = COMBOS.length * (chip + gap) - gap, x0 = E.w / 2 - tw / 2, y0 = 76;
      label(ctx, "COLOURS FOUND " + foundCount() + "/" + COMBOS.length, E.w / 2, y0 - 8, 12, "rgba(255,247,235,.95)", "center");
      COMBOS.forEach(function (c, i) {
        var x = x0 + i * (chip + gap), f = found[c.key];
        ctx.fillStyle = f ? rgbStr(comboRgb(c.key)) : "rgba(26,20,16,.35)";
        ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x + chip / 2, y0 + chip / 2, chip / 2, 0, TAU); ctx.fill(); ctx.stroke();
        if (!f) { var parts = c.key.split("+"); parts.forEach(function (p, k) { ctx.fillStyle = rgbStr(LIQ[p]); ctx.beginPath(); ctx.arc(x + chip / 2 + (k - (parts.length - 1) / 2) * 6, y0 + chip / 2, 2.4, 0, TAU); ctx.fill(); }); }
      });
      // shelf
      var sh = bots[0] ? bots[0].hy : 200;
      ctx.fillStyle = C.ink; ctx.fillRect(E.w * 0.04, sh + 4, E.w * 0.92, 10);
      ctx.fillStyle = C.cream; ctx.fillRect(E.w * 0.04, sh + 14, E.w * 0.92, 6);
      // bottles that are not being poured
      bots.forEach(function (b, i) {
        if (i === pourIdx) return;
        var hov = Math.sin(t * 2 + i) * 2;
        drawBottle(ctx, b.flav, b.x, b.y + hov * (b.rot ? 0 : 1), bh, b.rot);
        label(ctx, (i + 1) + "", b.hx, sh + 40, 12, "rgba(255,247,235,.8)", "center");
      });
      // glass
      var tot = total(), fill = tot / GL;
      ctx.save(); glassPath(ctx, 5); ctx.clip();
      ctx.fillStyle = "rgba(255,255,255,.22)"; ctx.fillRect(glass.x - glass.w, glass.base - glass.h, glass.w * 2, glass.h);
      var avg = mixOf(amounts()), y = glass.base - 5, inner = glass.h - 10;
      segs.forEach(function (s, i) {
        var hgt = (s.amt / GL) * inner;
        if (hgt <= 0.2) return;
        var col = LIQ[s.flav], c = [lerp(col[0], avg[0], mixF), lerp(col[1], avg[1], mixF), lerp(col[2], avg[2], mixF)];
        ctx.fillStyle = rgbStr(c); ctx.fillRect(glass.x - glass.w, y - hgt, glass.w * 2, hgt + 1); y -= hgt;
      });
      if (tot > 0) {
        // surface ripple + swirl while mixing
        var surf = glass.base - 5 - fill * inner;
        ctx.fillStyle = rgbStr(avg, 0.5 + mixF * 0.2); ctx.beginPath(); ctx.moveTo(glass.x - glass.w / 2, surf + 6);
        for (var xx = -glass.w / 2; xx <= glass.w / 2; xx += 8) ctx.lineTo(glass.x + xx, surf + Math.sin(t * (pourIdx >= 0 ? 9 : 3) + xx * 0.08) * (pourIdx >= 0 ? 3 : 1.2));
        ctx.lineTo(glass.x + glass.w / 2, surf + 12); ctx.closePath(); ctx.fill();
        if (mixF < 1) {
          ctx.strokeStyle = "rgba(255,247,235," + (0.22 * (1 - mixF)) + ")"; ctx.lineWidth = 3; ctx.lineCap = "round";
          for (var s2 = 0; s2 < 2; s2++) { ctx.beginPath(); ctx.ellipse(glass.x, surf + (glass.base - surf) * (0.3 + s2 * 0.3), glass.w * (0.22 + s2 * 0.08), 7, 0, t * 5 + s2 * 3, t * 5 + s2 * 3 + Math.PI * 0.8); ctx.stroke(); }
        }
        if (stirT > 0) for (var q = 0; q < 2; q++) emit({ x: glass.x + rand(-40, 40), y: surf + rand(0, 30), n: 1, angle: -Math.PI / 2, spread: 0.6, min: 40, max: 120, color: rgbStr(avg, 0.9), smin: 2, smax: 4, grav: 300, lmin: .3, lmax: .6 });
      }
      ctx.restore();
      glassPath(ctx, 0); ctx.strokeStyle = C.ink; ctx.lineWidth = 6; ctx.lineJoin = "round"; ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(glass.x - glass.w * 0.38, glass.base - glass.h + 24); ctx.lineTo(glass.x - glass.w * 0.3, glass.base - 34); ctx.stroke();
      // the pouring bottle and its stream
      var pb = bots[pourIdx];
      if (pb) {
        if (pb.pouring && total() < GL) {
          var surf2 = glass.base - 5 - (total() / GL) * (glass.h - 10), col2 = LIQ[pb.flav];
          ctx.strokeStyle = rgbStr(col2); ctx.lineCap = "round";
          for (var w = 0; w < 2; w++) {
            ctx.lineWidth = w ? 3 : 8; ctx.globalAlpha = w ? 0.9 : 1; ctx.strokeStyle = w ? rgbStr([255, 255, 255], .5) : rgbStr(col2);
            ctx.beginPath(); ctx.moveTo(pb.mx, pb.my + 4); ctx.quadraticCurveTo(pb.mx + (pb.hx < glass.x ? 6 : -6), (pb.my + surf2) / 2, pb.mx, surf2); ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
        drawBottle(ctx, pb.flav, pb.x, pb.y, bh, pb.rot);
      }
      // base of the glass
      ctx.fillStyle = C.ink; ctx.fillRect(glass.x - glass.w * 0.5, glass.base, glass.w, 10);
      drawParts(ctx); drawWords(ctx);
      if (!tot && !card && !toast) { ctx.globalAlpha = 0.65 + Math.sin(t * 4) * 0.35; text(ctx, "Hold a bottle to pour", E.w / 2, glass.base - glass.h - bh * 0.2 + 8 < sh + 80 ? sh + 90 : glass.base - glass.h - 12, 26, C.cream, "center"); ctx.globalAlpha = 1; }
      if (toast) { ctx.globalAlpha = Math.min(1, (2.2 - toast.t) * 2); text(ctx, toast.txt, E.w / 2, glass.base + 60 > E.h - 70 ? E.h - 78 : glass.base + 60, 24, C.cream, "center"); ctx.globalAlpha = 1; }
      if (card) {
        var k = Math.min(1, card.t / 0.35), e = easeBack(k), fade = card.t > 2.7 ? 1 - (card.t - 2.7) / 0.5 : 1, cw = Math.min(E.w * 0.86, 360), ch = 240, cx = E.w / 2, cy = E.h * 0.42;
        ctx.save(); ctx.globalAlpha = fade; ctx.translate(cx, cy); ctx.scale(e, e);
        ctx.fillStyle = C.cream; ctx.strokeStyle = C.ink; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.rect(-cw / 2 + 8, -ch / 2 + 8, cw, ch); ctx.fillStyle = C.ink; ctx.fill();
        ctx.beginPath(); ctx.rect(-cw / 2, -ch / 2, cw, ch); ctx.fillStyle = C.cream; ctx.fill(); ctx.stroke();
        ctx.fillStyle = rgbStr(card.col); ctx.beginPath(); ctx.arc(0, -ch / 2 + 78, 52, 0, TAU); ctx.fill(); ctx.stroke();
        text(ctx, "NEW COLOUR", 0, -ch / 2 + 172 - 12, 22, C.tangerine, "center", 0);
        text(ctx, card.name.toUpperCase(), 0, -ch / 2 + 214 - 10, 40, C.ink, "center", 0);
        label(ctx, card.n + " of " + COMBOS.length + " found", 0, ch / 2 - 8, 13, "rgba(26,20,16,.7)", "center");
        ctx.restore();
      }
    };
    g.dbg = function () { return { found: foundCount(), total: total(), segs: segs.length, mixF: mixF, bots: bots.map(function (b) { return { x: b.hx, y: b.hy }; }), bh: bh }; };
    return g;
  }

  /* ================================================================ 5. Holi Splash */
  var HOLI = { orange: "#ff8a2a", beet: "#ee3348", green: "#4fc65a", yuzu: "#ffdc52" };

  function HoliGame() {
    var g = {}, paint = null, pctx = null, wall = null, drops = [], puffs = [];
    var sel = "rain", t = 0, cover = 0, covT = 0, celebrated = false, hint = 6, lastX = 0, lastY = 0, lastSpray = 0, sc = 1, palBtns = [], banner = 0;
    var PS = 1; // paint layer scale

    function colour() { return sel === "rain" ? HOLI[pick(FLAV)] : HOLI[sel]; }

    function buildWall() {
      wall = D.createElement("canvas"); wall.width = Math.round(E.w); wall.height = Math.round(E.h);
      var w = wall.getContext("2d");
      w.fillStyle = "#fff7eb"; w.fillRect(0, 0, wall.width, wall.height);
      w.fillStyle = "rgba(26,20,16,.07)";
      for (var y = 14; y < wall.height; y += 22) for (var x = ((y / 22) % 2 ? 11 : 0) + 8; x < wall.width; x += 22) { w.beginPath(); w.arc(x, y, 1.6, 0, TAU); w.fill(); }
      var fs = Math.min(wall.width * 0.42, wall.height * 0.34);
      w.font = "400 " + fs + "px " + FONT_D; w.textAlign = "center"; w.textBaseline = "middle";
      w.lineWidth = 5; w.strokeStyle = "rgba(26,20,16,.18)"; w.strokeText("HOLI", wall.width / 2, wall.height * 0.46);
      w.font = "400 " + fs * 0.2 + "px " + FONT_D; w.strokeText("VITAME", wall.width / 2, wall.height * 0.46 + fs * 0.52);
    }
    function ensurePaint() {
      var nw = Math.round(E.w * PS), nh = Math.round(E.h * PS);
      if (paint && paint.width === nw && paint.height === nh) return;
      var old = paint;
      paint = D.createElement("canvas"); paint.width = nw; paint.height = nh; pctx = paint.getContext("2d");
      if (old) pctx.drawImage(old, 0, 0, nw, nh);
    }
    g.resize = function () { PS = Math.min(E.dpr, 1.5); buildWall(); ensurePaint(); };

    function splat(x, y, size, col, alpha) {
      pctx.save(); pctx.scale(PS, PS);
      pctx.globalCompositeOperation = "multiply"; pctx.globalAlpha = alpha == null ? 0.62 : alpha * 0.8; pctx.fillStyle = col; pctx.strokeStyle = col;
      pctx.beginPath(); pctx.arc(x, y, size, 0, TAU); pctx.fill();
      var n = 7 + ((size / 9) | 0);
      for (var i = 0; i < n; i++) {
        var a = Math.random() * TAU, d = size * rand(0.7, 1.7), r = size * rand(0.1, 0.32);
        pctx.beginPath(); pctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r, 0, TAU); pctx.fill();
        if (Math.random() < 0.5) { pctx.lineWidth = r * 0.7; pctx.beginPath(); pctx.moveTo(x + Math.cos(a) * size * 0.6, y + Math.sin(a) * size * 0.6); pctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); pctx.stroke(); }
      }
      if (size > 26 && Math.random() < 0.7) { // a drip
        var dx = x + rand(-size * 0.5, size * 0.5), len = rand(size * 0.8, size * 2.2);
        pctx.lineWidth = rand(3, 6); pctx.lineCap = "round"; pctx.beginPath(); pctx.moveTo(dx, y + size * 0.4); pctx.lineTo(dx, y + size * 0.4 + len); pctx.stroke();
        pctx.beginPath(); pctx.arc(dx, y + size * 0.4 + len, pctx.lineWidth * 0.9, 0, TAU); pctx.fill();
      }
      pctx.restore();
    }

    function burst(x, y) {
      var col = colour();
      sfx("splat");
      emit({ x: x, y: y, n: 34, min: 90, max: 420, color: col, smin: 14, smax: 40, grow: 60, grav: -20, drag: 2.6, lmin: 0.7, lmax: 1.4, alpha: 0.55 });
      emit({ x: x, y: y, n: 40, min: 140, max: 560, color: col, smin: 2, smax: 6, grav: 500, drag: 0.8, lmin: 0.5, lmax: 1 });
      splat(x, y, rand(34, 58), col);
      for (var i = 0; i < 6; i++) { var a = rand(0, TAU), d = rand(60, 150); splat(x + Math.cos(a) * d, y + Math.sin(a) * d, rand(6, 16), col, 0.8); }
    }

    function spray(x, y, dx, dy) {
      var sp = Math.hypot(dx, dy) || 1, col = colour();
      for (var i = 0; i < 4; i++) {
        var a = Math.atan2(dy, dx) + rand(-0.5, 0.5), v = rand(220, 620);
        drops.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, ttl: rand(0.22, 0.6), s: rand(3, 8), c: col });
      }
      emit({ x: x, y: y, n: 1, angle: Math.atan2(dy, dx), spread: 0.8, min: 60, max: 200, color: col, smin: 12, smax: 26, grow: 50, grav: 0, drag: 3, lmin: 0.4, lmax: 0.8, alpha: 0.4 });
      if (drops.length > 400) drops.splice(0, drops.length - 400);
      if (t - lastSpray > 0.12) { lastSpray = t; sfx("pour"); }
    }

    g.down = function (x, y) { hint = 0; lastX = x; lastY = y; g._moved = 0; burst(x, y); };
    g.move = function (x, y, pressed) {
      if (!pressed) return;
      var d = dist(lastX, lastY, x, y);
      g._moved += d;
      if (g._moved > 16 && d > 2) { spray(x, y, x - lastX, y - lastY); }
      lastX = x; lastY = y;
    };
    g.key = function () { };

    g.init = function () {
      PS = Math.min(E.dpr, 1.5); buildWall(); ensurePaint();
      var row = [];
      FLAV.concat(["rain"]).forEach(function (f) {
        var b = D.createElement("button"); b.type = "button"; b.className = "gm-pal" + (f === "rain" ? " rain" : ""); b.setAttribute("aria-label", f === "rain" ? "Rainbow mix" : NAME[f] + " colour");
        b.setAttribute("aria-pressed", String(f === sel));
        b.innerHTML = f === "rain" ? "MIX" : '<img alt="" src="media/game/bottle-' + f + '.webp">';
        b.addEventListener("click", function () { sel = f; sfx("click"); palBtns.forEach(function (p) { p.b.setAttribute("aria-pressed", String(p.f === f)); }); });
        palBtns.push({ b: b, f: f }); row.push(b);
      });
      row.push(E.actBtn("Clear wall", function () { pctx.clearRect(0, 0, paint.width, paint.height); cover = 0; celebrated = false; parts.length = 0; sfx("click"); }, "dark sm"));
      row.push(E.actBtn("Save poster", savePoster, "pri sm"));
      E.setActs(row);
    };

    function savePoster() {
      var c = D.createElement("canvas"), w = Math.round(E.w), h = Math.round(E.h);
      c.width = w * 1.5; c.height = h * 1.5; var x = c.getContext("2d"); x.scale(1.5, 1.5);
      x.drawImage(wall, 0, 0, w, h); x.globalCompositeOperation = "multiply"; x.drawImage(paint, 0, 0, w, h); x.globalCompositeOperation = "source-over";
      x.fillStyle = C.ink; x.fillRect(0, h - 56, w, 56);
      x.font = "400 30px " + FONT_D; x.fillStyle = C.cream; x.textAlign = "left"; x.textBaseline = "middle"; x.fillText("VITAME", 20, h - 28);
      x.font = "700 13px " + FONT_P; x.textAlign = "right"; x.fillStyle = C.lemon; x.fillText("HAPPY HOLI", w - 20, h - 28);
      c.toBlob(function (blob) {
        if (!blob) return;
        var a = D.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "vitame-holi.png"; D.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      }, "image/png");
      word(E.w / 2, E.h * 0.3, "Poster saved", C.lemon, 40);
    }

    function measure() {
      var c = D.createElement("canvas"); c.width = 48; c.height = 30; var x = c.getContext("2d");
      x.drawImage(paint, 0, 0, 48, 30);
      var d = x.getImageData(0, 0, 48, 30).data, n = 0;
      for (var i = 3; i < d.length; i += 4) if (d[i] > 90) n++;
      return n / (48 * 30);
    }

    g.update = function (dt) {
      t += dt; hint = Math.max(0, hint - dt); banner = Math.max(0, banner - dt);
      for (var i = drops.length - 1; i >= 0; i--) {
        var d = drops[i]; d.t += dt; d.vy += 900 * dt; d.x += d.vx * dt; d.y += d.vy * dt;
        if (d.t >= d.ttl) { splat(d.x, d.y, d.s * 1.5, d.c, 0.78); drops.splice(i, 1); }
      }
      covT += dt;
      if (covT > 0.6) {
        covT = 0; cover = measure();
        if (cover > 0.7 && !celebrated) {
          celebrated = true; banner = 3; sfx("win");
          for (var k = 0; k < 3; k++) emit({ x: E.w * (0.25 + k * 0.25), y: E.h * 0.5, n: 30, min: 150, max: 600, color: [HOLI.orange, HOLI.beet, HOLI.green, HOLI.yuzu], shape: "conf", smin: 5, smax: 10, grav: 480, lmin: 1, lmax: 2 });
        }
      }
    };

    g.draw = function (ctx) {
      ctx.drawImage(wall, 0, 0, E.w, E.h);
      ctx.globalCompositeOperation = "multiply"; ctx.drawImage(paint, 0, 0, E.w, E.h); ctx.globalCompositeOperation = "source-over";
      drops.forEach(function (d) { ctx.fillStyle = d.c; ctx.beginPath(); ctx.arc(d.x, d.y, d.s, 0, TAU); ctx.fill(); });
      drawParts(ctx); drawWords(ctx);
      // HUD
      var bwid = Math.min(240, E.w * 0.4), bx = E.w - 18 - bwid;
      label(ctx, "WALL PAINTED " + Math.min(100, Math.round(cover / 0.7 * 100)) + "%", E.w - 18, 96, 13, C.ink, "right");
      ctx.fillStyle = C.ink; ctx.fillRect(bx - 3, 104 - 3, bwid + 6, 16);
      ctx.fillStyle = C.tangerine; ctx.fillRect(bx, 104, bwid * Math.min(1, cover / 0.7), 10);
      if (hint > 0) { ctx.globalAlpha = Math.min(1, hint); text(ctx, "Tap to throw colour. Drag to spray.", E.w / 2, E.h * 0.2, Math.min(34, E.w / 12), C.ink, "center", 0); ctx.globalAlpha = 1; }
      if (banner > 0) { var k = Math.min(1, (3 - banner) / 0.3); ctx.save(); ctx.translate(E.w / 2, E.h * 0.38); ctx.scale(easeBack(k), easeBack(k)); text(ctx, "HAPPY HOLI!", 0, 0, Math.min(110, E.w / 5), C.lemon, "center"); ctx.restore(); }
    };
    g.dbg = function () { return { cover: cover, drops: drops.length }; };
    return g;
  }

  /* ================================================================ hub, engine control and boot */
  E.setActs = setActs; E.actBtn = actBtn;
  var GAMES = [
    { key: "slice", name: "Slice the Fruit", cls: "c-beet", desc: "Swipe through flying bottles and fruit. Skip the sugar cubes.", art: ["beet", "orange"], make: SliceGame },
    { key: "stack", name: "Stack the Bottles", cls: "c-orange", desc: "Time your drop and build the tallest tower of juice.", art: ["orange", "yuzu"], make: StackGame },
    { key: "smash", name: "Smash the Shelf", cls: "c-yuzu", desc: "Whack the bottles that pop up. Golden ones score big.", art: ["yuzu", "beet"], make: SmashGame },
    { key: "mix", name: "Mix the Colours", cls: "c-green", desc: "Pour our juices together and discover 11 new colours.", art: ["green", "orange"], make: MixGame },
    { key: "holi", name: "Holi Splash", cls: "c-holi", desc: "Throw and spray colour on the wall, then save your poster.", art: ["orange", "beet", "green", "yuzu"], make: HoliGame }
  ];
  var byKey = {}; GAMES.forEach(function (g) { byKey[g.key] = g; });

  function bestLabel(key) {
    if (key === "mix") { var f = store.get("pp-mix-found", {}), n = Object.keys(f).length; return n ? n + " of " + COMBOS.length + " found" : "11 colours to find"; }
    if (key === "holi") return "Free play";
    return best[key] ? "Best " + best[key] : "Be the first";
  }
  function refreshBest() {
    if (!E.root) return;
    GAMES.forEach(function (g) { var el = E.root.querySelector('[data-best="' + g.key + '"]'); if (el) el.textContent = bestLabel(g.key); });
  }

  function build() {
    var r = D.createElement("div");
    r.className = "gm"; r.hidden = true; r.setAttribute("role", "dialog"); r.setAttribute("aria-modal", "true"); r.setAttribute("aria-label", "Play games");
    r.innerHTML =
      '<div class="gm-bg"></div>' +
      '<div class="gm-hub" data-hub>' +
        '<div class="gm-top"><span class="gm-logo"><img class="logo-img" src="./media/vitame-ink.webp" alt="Vitame" width="111" height="30"></span>' +
        '<div class="gm-top-r"><button type="button" class="gm-btn sm" data-mute aria-pressed="false"></button><button type="button" class="gm-btn pri sm" data-skip>Skip to the juice &rarr;</button></div></div>' +
        '<div class="gm-hero"><span class="gm-chip">Warm-up round</span><h1>Game <em>time</em></h1>' +
        '<p>Five quick games with our bottles. Pick one, or skip straight to the juice.</p><p class="gm-id" data-id></p></div>' +
        '<div class="gm-grid">' + GAMES.map(function (g, i) {
          return '<div class="gm-cell"><button type="button" class="gm-card ' + g.cls + '" data-game="' + g.key + '"><span class="num">0' + (i + 1) + '</span>' +
            '<span class="art' + (g.art.length === 2 ? " duo" : g.art.length > 2 ? " quad" : "") + '">' + g.art.map(function (f) { return '<img alt="" src="media/game/bottle-' + f + '.webp">'; }).join("") + "</span>" +
            "<h2>" + g.name + "</h2><p>" + g.desc + '</p><span class="gm-best" data-best="' + g.key + '"></span></button>' +
            (LB_GAMES[g.key] ? '<button type="button" class="gm-lbbtn" data-board="' + g.key + '" aria-label="Open the ' + g.name + ' leaderboard">Leaderboard</button>' : "") + "</div>";
        }).join("") + "</div>" +
        '<div class="gm-skiprow"><span>No time? The full menu is one tap away.</span><button type="button" class="gm-btn dark" data-skip>Skip to the juice &rarr;</button></div>' +
      "</div>" +
      '<div class="gm-over" data-board-modal hidden></div>' +
      '<div class="gm-stage" data-stage hidden><canvas></canvas>' +
        '<div class="gm-bar"><button type="button" class="gm-btn sm" data-back>&larr; Games</button><span class="gm-title" data-title></span><span class="gm-sp"></span>' +
        '<button type="button" class="gm-btn sm" data-mute aria-pressed="false"></button><button type="button" class="gm-btn pri sm" data-skip>Skip to site &rarr;</button></div>' +
        '<div class="gm-acts" data-acts></div><div class="gm-over" data-over hidden></div></div>';
    D.body.appendChild(r);
    E.root = r; E.hubEl = r.querySelector("[data-hub]"); E.stageEl = r.querySelector("[data-stage]"); E.overEl = r.querySelector("[data-over]"); E.acts = r.querySelector("[data-acts]");
    E.canvas = r.querySelector("canvas"); E.ctx = E.canvas.getContext("2d");

    r.addEventListener("click", function (e) {
      var bb = e.target.closest("[data-board]");
      if (bb) { sfx("click"); openBoard(bb.dataset.board); return; }
      var card = e.target.closest("[data-game]");
      if (card) { sfx("click"); startGame(card.dataset.game); return; }
      if (e.target.closest("[data-skip]")) { closeAll(); return; }
      if (e.target.closest("[data-back]")) { sfx("click"); backToHub(); return; }
      var m = e.target.closest("[data-mute]");
      if (m) { muted = !muted; store.set("pp-game-mute", muted); paintMute(); if (!muted) sfx("click"); }
    });
    ["wheel", "touchmove"].forEach(function (ev) { r.addEventListener(ev, function (e) { e.stopPropagation(); }, { passive: true }); });
    E.stageEl.addEventListener("touchmove", function (e) { e.preventDefault(); }, { passive: false });
    E.canvas.addEventListener("pointerdown", onDown);
    E.canvas.addEventListener("pointermove", onMove);
    E.canvas.addEventListener("pointerup", onUp);
    E.canvas.addEventListener("pointercancel", onUp);
    D.addEventListener("keydown", onKey);
    W.addEventListener("resize", resize);
    paintMute(); refreshBest();
  }
  function openBoard(game) {
    var m = E.root.querySelector("[data-board-modal]"), g = byKey[game];
    m.innerHTML = '<div class="gm-box" role="dialog" aria-modal="true" aria-label="' + g.name + ' leaderboard"><span class="gm-tag">Leaderboard</span><h2>' + g.name + '</h2>' +
      '<div class="gm-lbbox" data-lbbody><p class="gm-lb-load">Loading the top players...</p></div>' +
      '<div class="gm-btns"><button type="button" class="gm-btn pri" data-lb-play>Play now</button><button type="button" class="gm-btn" data-lb-close>Close</button></div></div>';
    m.hidden = false; requestAnimationFrame(function () { m.classList.add("on"); });
    m.querySelector("[data-lb-close]").focus();
    m.querySelector("[data-lb-close]").addEventListener("click", closeBoard);
    m.querySelector("[data-lb-play]").addEventListener("click", function () { closeBoard(); startGame(game); });
    m.addEventListener("click", function (e) { if (e.target === m) closeBoard(); });
    fetchBoard(game, 10).then(function (j) {
      var body = m.querySelector("[data-lbbody]"); if (!body) return;
      body.innerHTML = j ? lbHtml(j.top, j.me, j.total) + (j.me ? "" : '<p class="gm-lb-me">Play a round to get on the board.</p>') : '<p class="gm-lb-empty">The leaderboard is not reachable right now. Try again in a moment.</p>';
    });
  }
  function closeBoard() { var m = E.root.querySelector("[data-board-modal]"); m.classList.remove("on"); m.hidden = true; m.innerHTML = ""; }
  function paintId() {
    var p = player(), el = E.root.querySelector("[data-id]");
    if (el) el.innerHTML = 'Playing as <b>' + esc(p.name) + '</b> &middot; Player ID <code>' + esc(p.uid) + "</code>";
  }
  function paintMute() {
    E.root.querySelectorAll("[data-mute]").forEach(function (b) { b.textContent = muted ? "Sound off" : "Sound on"; b.setAttribute("aria-pressed", String(muted)); });
  }

  function stopGame() {
    cancelAnimationFrame(E.raf);
    if (E.game && E.game.destroy) E.game.destroy();
    E.game = null; pressed = false; parts.length = 0; words.length = 0; E.shake = 0;
    if (E.acts) E.acts.innerHTML = "";
    hideOver();
  }

  function startGame(key) {
    var g = byKey[key];
    if (!g) return;
    stopGame();
    E.key = key; E.hubEl.hidden = true; E.stageEl.hidden = false;
    E.root.querySelector("[data-title]").textContent = g.name;
    var fonts = D.fonts && D.fonts.load ? Promise.all([D.fonts.load("40px Anton"), D.fonts.load("700 14px 'Space Grotesk'")]).catch(function () { }) : Promise.resolve();
    Promise.all([loadAssets(), fonts]).then(function () {
      if (E.key !== key || E.stageEl.hidden) return;
      var cur = E.game = g.make();
      resize();
      E.game.init && E.game.init();
      E.last = 0; E.raf = requestAnimationFrame(loop);
      E.canvas.style.cursor = key === "smash" ? "none" : "crosshair";
      E.canvas.focus && E.canvas.focus();
      if (cur !== E.game) return;
    });
  }

  function backToHub() { stopGame(); E.stageEl.hidden = true; E.hubEl.hidden = false; refreshBest(); var c = E.root.querySelector("[data-game]"); c && c.focus(); }

  var fab = null, lastFocus = null, scrollY0 = 0;
  function open(auto) {
    if (!E.root) build();
    lastFocus = D.activeElement;
    try { sessionStorage.setItem("pp-games-seen", "1"); } catch (e) { /* ignore */ }
    scrollY0 = W.pageYOffset || 0;
    E.root.hidden = false; D.documentElement.classList.add("gm-open");
    stopGame(); E.stageEl.hidden = true; E.hubEl.hidden = false; refreshBest(); paintId(); flushQueue();
    requestAnimationFrame(function () { E.root.classList.add("on"); var s = E.root.querySelector("[data-game]"); s && s.focus({ preventScroll: true }); });
    if (fab) fab.hidden = true;
    loadAssets();
  }
  function closeAll() {
    if (!E.root || E.root.hidden) return;
    stopGame();
    E.root.classList.remove("on");
    setTimeout(function () { if (!E.root.classList.contains("on")) E.root.hidden = true; }, 380);
    D.documentElement.classList.remove("gm-open");
    // the site is hidden while a game is open (so its heavy hero does not slow the game); put it back where it was
    W.scrollTo(0, scrollY0);
    setTimeout(function () { W.dispatchEvent(new Event("resize")); W.scrollTo(0, scrollY0); }, 60);
    if (fab) fab.hidden = false;
    try { lastFocus && lastFocus.focus && lastFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }

  W.ppGames = { open: open, close: closeAll, start: function (k) { if (!E.root || E.root.hidden) open(); startGame(k); }, _E: E };

  function boot() {
    fab = D.createElement("button"); fab.type = "button"; fab.className = "gm-fab"; fab.hidden = true;
    fab.innerHTML = '<img alt="" src="media/game/bottle-orange.webp"><span>Play a game</span>';
    fab.addEventListener("click", function () { open(); });
    D.body.appendChild(fab);
    var seen = false, off = /[?&]nogames\b/.test(location.search);
    try { seen = !!sessionStorage.getItem("pp-games-seen"); } catch (e) { /* ignore */ }
    var loggedIn = true;
    try { loggedIn = !!localStorage.getItem("pp-session"); } catch (e) { /* ignore */ }
    if (!seen && !off && loggedIn) open(true); else fab.hidden = false;
  }
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", boot); else boot();
})();
