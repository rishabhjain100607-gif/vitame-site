/* Pip: a small guide that tags along on every page, nudges you with questions about our juices and answers back.
   Chat answers come from a built-in brain; harder questions go to an AI agent on Zapier (set up in backend/ZAPIER-PIP.md). */
(function () {
  "use strict";
  var W = window, D = document;
  if (W.pip) return;
  var CFG = W.PP || {};
  var TOUCH = !!(W.matchMedia && W.matchMedia("(hover: none)").matches);
  var REDUCE = !!(W.matchMedia && W.matchMedia("(prefers-reduced-motion: reduce)").matches);

  /* ------------------------------------------------------------ which page */
  var file = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  var PAGE = { "index.html": "home", "shop.html": "shop", "subscribe.html": "subscribe", "orders.html": "orders", "subscriptions.html": "subscriptions", "checkout.html": "checkout" }[file];
  if (!PAGE) return; // not on the sign-in or courier pages

  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var rand = function (a, b) { return a + Math.random() * (b - a); };
  var pick = function (a) { return a[(Math.random() * a.length) | 0]; };
  var now = function () { return Date.now(); };
  var rs = function (n) { return "₹" + n; };

  /* ------------------------------------------------------------ memory (per browser tab, so Pip keeps the thread across pages) */
  function jget(store, k, d) { try { var v = JSON.parse(store.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function jset(store, k, v) { try { store.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
  var st = jget(sessionStorage, "pp-pip", null) || {};
  if (!st.cid) st.cid = Array.apply(null, Array(16)).map(function () { return "abcdefghijklmnopqrstuvwxyz0123456789"[(Math.random() * 36) | 0]; }).join("");
  st.msgs = st.msgs || []; st.seen = st.seen || {}; st.interest = st.interest || {}; st.pages = st.pages || [];
  function save() { st.msgs = st.msgs.slice(-40); jset(sessionStorage, "pp-pip", st); }
  var isHidden = function () { try { return localStorage.getItem("pp-pip-hidden") === "1"; } catch (e) { return false; } };

  /* ------------------------------------------------------------ what Pip knows */
  var FL = {
    orange: { name: "Orange Riot", notes: "orange, turmeric and lemon", ing: "Valencia orange (94%), lemon (4%) and turmeric root (2%)", kcal: "138 kcal", sugar: "26 g natural sugar", vitc: "168 mg of vitamin C, which is 210% of your daily need",
      blurb: "Six Valencia oranges, a thumb of turmeric and a squeeze of lemon. Sunshine with the volume up.", taste: "sweet and sunny", hook: "One bottle holds 210% of your daily vitamin C." },
    beet: { name: "Beet & Berry", notes: "beetroot, raspberry and apple", ing: "beetroot (46%), apple (38%), raspberry (14%) and lemon (2%)", kcal: "124 kcal", sugar: "23 g natural sugar", vitc: "68 mg of vitamin C (85% of your daily need)",
      blurb: "Earthy beetroot meets tart raspberry and a hit of apple. Deep red, ridiculously drinkable.", taste: "earthy with a tart berry kick", hook: "It is 46% beetroot, so it is earthier than the colour suggests." },
    green: { name: "Green Machine", notes: "raw mango, apple and mint", ing: "apple (44%), mint (30%), raw mango (22%), lemon (3%) and ginger (1%)", kcal: "96 kcal", sugar: "16 g natural sugar", vitc: "96 mg of vitamin C (120% of your daily need)",
      blurb: "Tangy raw mango, crunchy apple and cool mint, pressed fast and bright. Tastes like a crisp morning.", taste: "crisp, tangy and cool", hook: "Mint is 30% of the bottle, which is why it tastes so crisp." },
    yuzu: { name: "Yuzu Ginger", notes: "yuzu, ginger and pear", ing: "pear (52%), yuzu (24%), apple (14%), ginger root (8%) and lemon (2%)", kcal: "110 kcal", sugar: "21 g natural sugar", vitc: "112 mg of vitamin C (140% of your daily need)",
      blurb: "Fragrant yuzu, fiery ginger and juicy pear. Bright, sharp and a little bit dangerous.", taste: "bright, sharp and gingery", hook: "Yuzu is a citrus that sits somewhere between lemon and mandarin." }
  };
  var IDS = ["orange", "beet", "green", "yuzu"];
  var FLRE = { orange: /orange|riot|turmeric/, beet: /beet|berry|raspberr/, green: /green|machine|mango|mint/, yuzu: /yuzu|ginger/ };

  function stockOut(id) { try { return !!(W.ppStock && W.ppStock.isOut(id)); } catch (e) { return false; } }
  function stockInfo(id) { try { return W.ppStock && W.ppStock.get()[id]; } catch (e) { return null; } }
  function cart() { return jget(localStorage, "pp-cart", []) || []; }
  function cartBottles() { return cart().reduce(function (n, i) { return n + (i.kind === "pack" ? (parseInt(i.name, 10) || 6) * i.qty : i.qty); }, 0); }
  function cartTotal() { return cart().reduce(function (n, i) { return n + (i.sub ? (i.unit === 330 ? 260 : Math.round(i.unit * 0.8)) : i.unit) * i.qty; }, 0); }
  function myOrders() { var me = (jget(localStorage, "pp-session", {}) || {}).email; return (jget(localStorage, "pp-orders", []) || []).filter(function (o) { return o.id && (!o.to || !o.to.email || !me || String(o.to.email).toLowerCase() === String(me).toLowerCase()); }); }
  function viewingId() {
    var h = (location.hash || "").slice(1);
    if (PAGE === "shop" && FL[h]) return h;
    return st.focus || null;
  }

  /* ------------------------------------------------------------ the brain: instant answers from what we know */
  var R = function (text, chips, conf) { return { text: text, chips: chips || [], conf: conf == null ? 0.8 : conf }; };
  var C = function (t, a, cls) { return { t: t, a: a, c: cls }; };
  var TOPICS = function () { return [C("Find my flavour", "quiz", "pri"), C("What is in the bottles?", "ask:What is in your juices?"), C("Prices and packs", "ask:How much does it cost?"), C("Delivery", "ask:How does delivery work?")]; };

  function flavsIn(q) { return IDS.filter(function (id) { return FLRE[id].test(q); }); }
  function flavLine(id) {
    var f = FL[id], out = stockOut(id), info = stockInfo(id);
    var line = f.name + ": " + f.blurb + " " + f.hook;
    if (out) line += "\nHeads up: it is sold out right now" + (info && info.backAt ? " and due back soon." : ".");
    return line;
  }
  function goChip(id) { return C("Open " + FL[id].name, "go:shop.html#" + id); }

  var quiz = null;
  function quizStart() { quiz = { s: 1 }; return R("Two quick ones and I will pick your juice. First: do you like it sweet or sharp?", [C("Sweet", "qz:1:sweet"), C("Sharp", "qz:1:sharp")], 1); }
  function quizStep(a) {
    var p = a.split(":");
    if (p[1] === "1") { quiz = { s: 2, t: p[2] }; return R("Nice. And do you lean fruity or earthy and fresh?", [C("Fruity", "qz:2:fruity"), C("Earthy and fresh", "qz:2:earthy")], 1); }
    var t = quiz && quiz.t || "sweet", id = ({ "sweet:fruity": "orange", "sweet:earthy": "beet", "sharp:fruity": "yuzu", "sharp:earthy": "green" })[t + ":" + p[2]] || "orange";
    quiz = null; st.focus = id; save();
    var alt = stockOut(id) ? IDS.filter(function (x) { return x !== id && !stockOut(x); })[0] : null;
    var txt = "You are a " + FL[id].name + " person: " + FL[id].taste + ". " + FL[id].hook + " It is " + rs(60) + " a bottle, or " + rs(48) + " on a subscription.";
    if (stockOut(id)) txt += "\nIt is sold out at the moment" + (alt ? ", so " + FL[alt].name + " is the next best match." : ".");
    return R(txt, [goChip(alt || id), C("Why this one?", "ask:Tell me about " + FL[id].name), C("Try again", "quiz", "soft")], 1);
  }

  var INTENTS = [
    { re: /^(hi|hello|hey|yo|namaste|hola|hii+)\b/, f: function () { return R(pick(["Hey! I am Pip. Ask me anything about our juices, or let me find your flavour.", "Hi there! Curious about a flavour? I know them all."]), TOPICS(), 0.95); } },
    { re: /thank|thx|awesome|great|nice one|cool/, f: function () { return R(pick(["Anytime! Want me to find your perfect flavour?", "Happy to help. Anything else you are curious about?"]), [C("Find my flavour", "quiz"), C("Prices and packs", "ask:How much does it cost?")], 0.85); } },
    { re: /^(bye|goodbye|see you|later)\b|no thanks/, f: function () { return R("No problem. I will be around if you need me.", [], 0.9); } },
    { re: /most vitamin|compare/, f: function () { return R("Orange Riot wins on vitamin C with 210% of your daily need. Yuzu Ginger is next at 140%, then Green Machine at 120%, and Beet & Berry at 85%.", [goChip("orange"), C("Find my flavour", "quiz")], 0.9); } },
    { re: /recommend|suggest|which (one|flavour|juice) (should|do you|would|is right|is best for me)|what should i|can'?t decide|help me (choose|pick)|find my|best (one|flavour) for|surprise me|pick for me|quiz/, f: function () { return quizStart(); } },
    { re: /ingredient|what'?s in|what is in|made (of|with|from)|contain|inside|recipe|percent|%|nothing else|natural|preservative|concentrate/, f: function (q) {
      var f = flavsIn(q);
      if (f.length === 1) return R(FL[f[0]].name + " is " + FL[f[0]].ing + ". Nothing else. Cold-pressed, never heated.", [goChip(f[0]), C("Nutrition", "ask:Nutrition of " + FL[f[0]].name)], 0.95);
      return R("Only whole fruit and veg, cold-pressed. No concentrate, no added sugar, no preservatives.\nOrange Riot: " + FL.orange.notes + ".\nBeet & Berry: " + FL.beet.notes + ".\nGreen Machine: " + FL.green.notes + ".\nYuzu Ginger: " + FL.yuzu.notes + ".", IDS.map(function (id) { return C(FL[id].name, "ask:Tell me about " + FL[id].name); }), 0.9);
    } },
    { re: /pregnan|diabet|medical|allerg|doctor|kids?|child|baby/, f: function () { return R("I am a juice pal, not a doctor, so please check with your doctor about your own needs. Every bottle is only fruit and veg, and the full ingredient list is on each product page.", [C("See ingredients", "ask:What is in your juices?")], 0.85); } },
    { re: /sugar|calorie|kcal|health|vitamin|protein|nutrition|diet|fat\b|carb|gym|workout/, f: function (q) {
      var f = flavsIn(q);
      if (f.length === 1) { var x = FL[f[0]]; return R(x.name + " per bottle: " + x.kcal + ", " + x.sugar + " and 0 g added sugar, with " + x.vitc + ".", [goChip(f[0]), C("Compare all four", "ask:Compare the juices")], 0.95); }
      return R("Every bottle has 0 g added sugar. Per 330 ml bottle: Orange Riot " + FL.orange.kcal + ", Beet & Berry " + FL.beet.kcal + ", Green Machine " + FL.green.kcal + ", Yuzu Ginger " + FL.yuzu.kcal + ". Green Machine is the lightest.", [C("Which has most vitamin C?", "ask:Which has the most vitamin C?"), C("Find my flavour", "quiz")], 0.9);
    } },
    { re: /(skip|pause|cancel|swap|change|manage|stop|resume|reschedule|edit|move).*(subscri|box|delivery|flavour|rhythm|date|address)|manage.*subscri|my subscri|how do i (skip|pause|cancel)/, f: function () { return R("Open My subscriptions from the menu, or use the Manage button in your email. There you can skip the next delivery, swap flavours, change the date or rhythm, update your address, pause or cancel. You can change things until 3 days before a box ships, then we pack it.", [C("Open My subscriptions", "go:subscriptions.html", "pri"), C("How does it work?", "ask:How does the subscription work?")], 0.95); } },
    { re: /deliver|ship|arrive|how long.*(take|get)|when will|courier|premium|normal|free delivery|cold chain|insulated|dispatch/, f: function () { return R("Normal delivery arrives in about 3 days for " + rs(49) + ", and it is free over " + rs(400) + " or on any subscription. Premium arrives next day for " + rs(99) + ". Everything travels cold in an insulated box.", [C("Track an order", "ask:Where is my order?"), C("Prices", "ask:How much does it cost?")], 0.95); } },
    { re: /price|cost|how much|₹|rupee|\brs\b|cheap|expensive|afford|rate/, f: function () { return R("A 330 ml bottle is " + rs(60) + ". A 6-pack is " + rs(330) + ", a 12-pack " + rs(620) + " and an 18-pack " + rs(900) + ". Subscribe and a 6-pack drops to " + rs(260) + ".", [C("Build a 6-pack", "go:index.html#build"), C("How does subscribing work?", "ask:How does the subscription work?")], 0.95); } },
    { re: /6.?pack|six|box|bundle|offer|discount|deal|\bsave\b|12.?pack|18.?pack|coupon|promo|first order/, f: function () { return R("Mix any six bottles for " + rs(330) + " (that is " + rs(55) + " each instead of " + rs(60) + "). Subscribe on top and it is " + rs(260) + ". New here? Join the drop list for 10% off your first box.", [C("Build a 6-pack", "go:index.html#build"), C("Subscription details", "ask:How does the subscription work?")], 0.9); } },
    { re: /subscri|weekly|fortnight|monthly|recurring|skip|pause|cancel|20%/, f: function () { return R("Subscribe and you save 20% on every box, with free delivery. Pick weekly, every 2 weeks or every 4 weeks. Your first box is the order you place, and after that we email you 6 days before each delivery and pack it 3 days before it ships. Until then you can skip, swap flavours, pause or cancel from My subscriptions.", [C("Open subscribe", "go:subscribe.html"), C("Manage my subscription", "go:subscriptions.html")], 0.95); } },
    { re: /fresh|shelf|last|expire|expiry|store|fridge|refrigerat|how long does a bottle/, f: function () { return R("Unopened and cold, a bottle lasts 12 days from the press date printed on the cap. Once open, drink it within 48 hours. Keep it refrigerated.", [C("Find my flavour", "quiz")], 0.9); } },
    { re: /stock|available|sold out|out of stock|in stock|restock|back soon|availability/, f: function (q) {
      var f = flavsIn(q), out = IDS.filter(stockOut);
      if (f.length === 1) { var i = stockInfo(f[0]); return stockOut(f[0]) ? R(FL[f[0]].name + " is sold out right now" + (i && i.backAt ? ", and the page shows a live countdown to when it is back." : ". We are restocking soon."), [C("Find another flavour", "quiz")], 0.95) : R(FL[f[0]].name + " is in stock and ready to ship.", [goChip(f[0])], 0.95); }
      return out.length ? R("Sold out right now: " + out.map(function (id) { return FL[id].name; }).join(", ") + ". The rest are ready to ship.", [C("Find another flavour", "quiz")], 0.9) : R("All four flavours are in stock right now.", [C("Find my flavour", "quiz")], 0.9);
    } },
    { re: /my order|track|where is|parcel|order status|where.*order|order.*where/, f: function () { var n = myOrders().length; return n ? R("You have " + n + " order" + (n === 1 ? "" : "s") + " with us. Open My Orders and pick one to watch it on the map.", [C("Open My Orders", "go:orders.html", "pri")], 0.95) : R("I do not see any orders on this device yet. Once you order, My Orders shows a live map of where it is.", [C("Find my flavour", "quiz")], 0.9); } },
    { re: /\bpay\b|payment|upi|card|razorpay|cod\b|cash|netbanking|wallet|gpay|phonepe|paytm/, f: function () { return R("At checkout you can pay with UPI, cards, netbanking or wallets through Razorpay.", [C("Delivery options", "ask:How does delivery work?")], 0.9); } },
    { re: /farm|origin|source|sourc|where.*from|grown|organic|valencia|local/, f: function () { return R("We buy from 14 partner farms we can drive to. Oranges come from the Valencia coast and beets from a family field two valleys over. Every crate is logged, and fruit is pressed within 12 hours of picking.", [C("Why cold-pressed?", "ask:Why cold-pressed?")], 0.9); } },
    { re: /cold.?press|juicer|heat|pasteur|raw/, f: function () { return R("Cold-pressing squeezes the fruit without heat, so the flavour and vitamins stay bright. Nothing is heated, ever.", [C("What is in the bottles?", "ask:What is in your juices?")], 0.9); } },
    { re: /glass|recycl|plastic|packag|return/, f: function () { return R("Bottles are glass because it keeps the flavour clean and is endlessly recyclable. Rinse it and recycle it. Return 12 caps and get a free bottle.", [], 0.9); } },
    { re: /game|play|bored|leaderboard|fun/, f: function () { return R("We have five little games with our bottles. Slice them, stack them, smash them, mix colours or throw Holi colours.", [C("Play a game", "games", "pri")], 0.9); } },
    { re: /contact|email|phone|call|human|support|complain|refund|help line/, f: function () { return R("You can reach a person from the Contact us section at the bottom of any page. Quote your order number if you have one.", [], 0.85); } },
    { re: /taste|sweet|sour|tangy|spicy|earthy|zesty|fruity|sharp|crisp|flavour like|taste like|which.*(sweet|sour)/, f: function (q) {
      var fl = flavsIn(q);
      if (fl.length === 1) return R(FL[fl[0]].name + " is " + FL[fl[0]].taste + ". " + FL[fl[0]].hook, [goChip(fl[0]), C("Ingredients", "ask:What is in " + FL[fl[0]].name + "?")], 0.95);
      return R("Orange Riot is sweet and sunny. Beet & Berry is earthy with a tart berry kick. Green Machine is crisp, tangy and cool. Yuzu Ginger is bright, sharp and gingery.", [C("Find my flavour", "quiz", "pri")], 0.9); } },
  ];

  /** Returns the best local answer (with a confidence), or a gentle fallback. */
  function brain(q) {
    var t = String(q || "").toLowerCase().trim();
    if (!t) return R("I am listening.", TOPICS(), 0.5);
    for (var i = 0; i < INTENTS.length; i++) if (INTENTS[i].re.test(t)) return INTENTS[i].f(t);
    var f = flavsIn(t);
    if (f.length === 1) { st.focus = f[0]; save(); return R(flavLine(f[0]), [goChip(f[0]), C("Ingredients", "ask:What is in " + FL[f[0]].name + "?"), C("Nutrition", "ask:Nutrition of " + FL[f[0]].name)], 0.85); }
    if (f.length > 1) return R("Good pair. " + f.map(function (id) { return FL[id].name + " is " + FL[id].taste; }).join(", and ") + ".", [C("Find my flavour", "quiz")], 0.7);
    return R("Good question. I might not have that one memorised. Here is what I can do right away:", TOPICS(), 0.2);
  }

  /* ------------------------------------------------------------ the character and how it moves */
  var SVG = "<svg class=\"pip-svg\" viewBox=\"70 55 365 395\" xmlns=\"http://www.w3.org/2000/svg\" aria-hidden=\"true\" focusable=\"false\"> <ellipse class=\"p-shadow\" cx=\"265\" cy=\"438\" rx=\"88\" ry=\"11\" fill=\"#1a1410\" opacity=\".16\"/> <g class=\"p-foot-l\"><ellipse cx=\"228\" cy=\"412\" rx=\"31\" ry=\"18\" fill=\"#ffdc52\" stroke=\"#1a1410\" stroke-width=\"5\"/><path d=\"M210 405 C216 399 226 398 234 401\" fill=\"none\" stroke=\"#fff6bf\" stroke-width=\"5\" stroke-linecap=\"round\"/></g> <g class=\"p-foot-r\"><ellipse cx=\"302\" cy=\"412\" rx=\"31\" ry=\"18\" fill=\"#ffdc52\" stroke=\"#1a1410\" stroke-width=\"5\"/><path d=\"M284 405 C290 399 300 398 308 401\" fill=\"none\" stroke=\"#fff6bf\" stroke-width=\"5\" stroke-linecap=\"round\"/></g> <g class=\"p-body\"> <path d=\"M243 100 L287 100 L287 150 C287 178 340 176 340 218 L340 352 C340 376 322 394 298 394 L232 394 C208 394 190 376 190 352 L190 218 C190 176 243 178 243 150Z\" fill=\"#fff1dc\" stroke=\"#1a1410\" stroke-width=\"6\" stroke-linejoin=\"round\"/> <path d=\"M194 200 C216 190 240 196 265 202 C290 208 316 192 336 200 L336 352 C336 373 320 390 298 390 L232 390 C210 390 194 373 194 352Z\" fill=\"#ff8a2a\"/> <path d=\"M194 200 C216 190 240 196 265 202 C290 208 316 192 336 200\" fill=\"none\" stroke=\"#ffdc52\" stroke-width=\"7\" stroke-linecap=\"round\"/> <path d=\"M300 214 L336 206 L336 352 C336 372 322 388 302 390 C316 340 316 270 300 214Z\" fill=\"#e8611a\" opacity=\".55\"/> <rect x=\"203\" y=\"214\" width=\"14\" height=\"120\" rx=\"7\" fill=\"#fff\" opacity=\".42\"/> <circle cx=\"210\" cy=\"350\" r=\"5\" fill=\"#fff\" opacity=\".4\"/> <rect x=\"224\" y=\"310\" width=\"82\" height=\"52\" rx=\"12\" fill=\"#fff7eb\" stroke=\"#1a1410\" stroke-width=\"4.5\"/> <text x=\"265\" y=\"345\" text-anchor=\"middle\" font-family=\"Anton,Impact,sans-serif\" font-size=\"28\" fill=\"#1a1410\" letter-spacing=\"1.5\">PIP</text> <path d=\"M247 104 L247 148 M283 104 L283 148\" stroke=\"#fff\" stroke-width=\"4\" stroke-linecap=\"round\" opacity=\".55\"/> </g> <g class=\"p-head\"> <rect x=\"234\" y=\"62\" width=\"62\" height=\"38\" rx=\"9\" fill=\"#1a1410\"/> <rect x=\"234\" y=\"78\" width=\"62\" height=\"8\" fill=\"#ffdc52\"/> <path d=\"M244 66 L244 96 M255 66 L255 96 M275 66 L275 96 M286 66 L286 96\" stroke=\"#3a2c22\" stroke-width=\"3\" stroke-linecap=\"round\"/> <path d=\"M270 62 C270 40 292 30 312 36 C310 56 292 68 270 62Z\" fill=\"#4aae4d\" stroke=\"#1a1410\" stroke-width=\"4\" stroke-linejoin=\"round\"/> <path d=\"M276 58 C288 50 298 46 306 42\" fill=\"none\" stroke=\"#2f8a35\" stroke-width=\"3\" stroke-linecap=\"round\"/> <circle cx=\"236\" cy=\"232\" r=\"25\" fill=\"#fffaf0\" stroke=\"#1a1410\" stroke-width=\"5\"/> <circle cx=\"294\" cy=\"232\" r=\"25\" fill=\"#fffaf0\" stroke=\"#1a1410\" stroke-width=\"5\"/> <g class=\"p-eye-l\"><circle class=\"p-pupil\" cx=\"236\" cy=\"232\" r=\"11\" fill=\"#1a1410\"/><circle cx=\"232\" cy=\"227\" r=\"3.8\" fill=\"#fff\"/></g> <g class=\"p-eye-r\"><circle class=\"p-pupil\" cx=\"294\" cy=\"232\" r=\"11\" fill=\"#1a1410\"/><circle cx=\"290\" cy=\"227\" r=\"3.8\" fill=\"#fff\"/></g> <circle cx=\"209\" cy=\"266\" r=\"9\" fill=\"#e03442\" opacity=\".4\"/> <circle cx=\"321\" cy=\"266\" r=\"9\" fill=\"#e03442\" opacity=\".4\"/> <path class=\"p-mouth\" d=\"M248 272 Q265 292 282 272\" fill=\"none\" stroke=\"#1a1410\" stroke-width=\"5\" stroke-linecap=\"round\"/> </g> <g class=\"p-hand-l\"><path d=\"M194 292 C176 292 158 284 142 270\" fill=\"none\" stroke=\"#1a1410\" stroke-width=\"7\" stroke-linecap=\"round\"/><circle cx=\"134\" cy=\"262\" r=\"17\" fill=\"#ffdc52\" stroke=\"#1a1410\" stroke-width=\"5\"/><path d=\"M126 256 C129 252 134 251 138 253\" fill=\"none\" stroke=\"#fff6bf\" stroke-width=\"4\" stroke-linecap=\"round\"/></g> <g class=\"p-hand-r\"><path d=\"M338 300 C356 302 372 312 384 328\" fill=\"none\" stroke=\"#1a1410\" stroke-width=\"7\" stroke-linecap=\"round\"/><circle cx=\"391\" cy=\"337\" r=\"17\" fill=\"#ffdc52\" stroke=\"#1a1410\" stroke-width=\"5\"/><path d=\"M384 331 C387 327 392 326 396 328\" fill=\"none\" stroke=\"#fff6bf\" stroke-width=\"4\" stroke-linecap=\"round\"/></g> </svg> ";
  var rig = { x: -200, y: -200, vx: 0, vy: 0, mode: "park", size: 92, t: 0, wave: 0, point: null, blinkT: 3, blink: 0, talk: 0, arrive: 0, sleep: false, freeUntil: 0, drag: null, looked: { x: 0, y: 0 } };
  var mouse = { x: -999, y: -999, t: 0, seen: false };
  var lag = { hl: { x: 0, y: 0 }, hr: { x: 0, y: 0 }, fl: { x: 0, y: 0 }, fr: { x: 0, y: 0 }, hd: { x: 0, y: 0 } };
  var VW = W.innerWidth, VH = W.innerHeight;
  var dom = {}; // root, bot, fig, bubble, panel ... filled in at boot
  var P = {};   // svg parts

  function setT(g, s) { if (g) g.setAttribute("transform", s); }
  function parkPos() { return { x: VW - rig.size * 0.62 - 14, y: VH - rig.size * 0.62 - 12 }; }
  function panelRect() { return dom.panel && st.open ? dom.panel.getBoundingClientRect() : null; }

  // Pip lives just off the edge of the screen, and pops out from there now and then
  rig.edge = { side: "r", pos: 0.72 };
  function spotFor(e, out) {
    var s = rig.size, m = s * 0.55 + 10, o = out ? s * 1.35 : 0, x, y;
    if (e.side === "r") { x = VW - m + o; y = clamp(e.pos * VH, s * 0.55 + 70, VH - m); }
    else if (e.side === "l") { x = m - o; y = clamp(e.pos * VH, s * 0.55 + 70, VH - m); }
    else { x = clamp(e.pos * VW, m, VW - m); y = VH - m + o; }
    return { x: x, y: y };
  }
  function pickEdge() {
    var sides = ["r", "l", "b"], tries = 0, e;
    while (tries++ < 8) {
      e = { side: sides[Math.floor(Math.random() * sides.length)], pos: 0.3 + Math.random() * 0.5 };
      var p = spotFor(e, false);
      if (!mouse.seen || Math.hypot(p.x - mouse.x, p.y - mouse.y) > 230) break;
    }
    rig.edge = e;
  }

  function target() {
    var m = rig.mode, s = rig.size;
    if (m === "peek" || m === "away") { var q = spotFor(rig.edge, m === "away"); return { x: q.x, y: q.y, k: m === "peek" ? 44 : 26 }; }
    if (m === "panel") { var pr = panelRect(); if (pr) return { x: pr.left + s * 0.42, y: pr.top - s * 0.06, k: 60 }; }
    if (m === "point" && rig.point && rig.point.el && D.contains(rig.point.el)) {
      var r = rig.point.el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      // sit just outside the element, on whichever side has room
      var room = { r: VW - r.right, l: r.left, t: r.top, b: VH - r.bottom }, tx, ty;
      if (room.t > s * 1.1 && r.top > 90) { tx = clamp(cx + r.width * 0.25, s * 0.6, VW - s * 0.6); ty = r.top - s * 0.5; }
      else if (room.r > s * 1.1) { tx = r.right + s * 0.5; ty = clamp(cy, s * 0.6, VH - s * 0.6); }
      else if (room.l > s * 1.1) { tx = r.left - s * 0.5; ty = clamp(cy, s * 0.6, VH - s * 0.6); }
      else { tx = clamp(cx, s * 0.6, VW - s * 0.6); ty = Math.min(VH - s * 0.6, r.bottom + s * 0.5); }
      rig.point.cx = cx; rig.point.cy = cy;
      return { x: tx, y: clamp(ty, s * 0.55 + 56, VH - s * 0.55), k: 55 };
    }
    var p = parkPos();
    return { x: p.x, y: p.y, k: m === "arrive" ? 70 : 34 };
  }

  function step(dt) {
    if (rig.mode === "drag") return;
    if (rig.mode === "free" && now() > rig.freeUntil) rig.mode = "away";
    if (rig.mode === "free") { rig.vx *= 0.9; rig.vy *= 0.9; return; }
    var tg = target(), k = tg.k, c = 2 * Math.sqrt(k) * 0.72;
    rig.vx += (k * (tg.x - rig.x) - c * rig.vx) * dt;
    rig.vy += (k * (tg.y - rig.y) - c * rig.vy) * dt;
    var sp = Math.hypot(rig.vx, rig.vy);
    if (sp > 2600) { rig.vx *= 2600 / sp; rig.vy *= 2600 / sp; }
    rig.x += rig.vx * dt; rig.y += rig.vy * dt;
  }

  function render(dt) {
    var t = rig.t, u = 395 / rig.size, sp = Math.hypot(rig.vx, rig.vy), asleep = rig.sleep;
    var tilt = clamp(rig.vx * 0.016, -13, 13), stretch = clamp(sp / 3000, 0, 0.16);
    var bob = Math.sin(t * (asleep ? 1.2 : 2.6)) * (rig.mode === "park" || asleep ? 3 : 2);
    var pop = rig.arrive > 0 ? 1 - Math.pow(1 - clamp(1 - rig.arrive / 0.6, 0, 1), 3) * 0 : 1;
    var sc = 1;
    if (rig.arrive > 0) { var a = clamp(1 - rig.arrive / 0.6, 0, 1), c1 = 1.70158; sc = 0.15 + 0.85 * (1 + (c1 + 1) * Math.pow(a - 1, 3) + c1 * Math.pow(a - 1, 2)); }
    dom.bot.style.transform = "translate3d(" + (rig.x - rig.size / 2).toFixed(1) + "px," + (rig.y - rig.size / 2).toFixed(1) + "px,0)";
    dom.fig.style.transform = "translateY(" + bob.toFixed(1) + "px) rotate(" + tilt.toFixed(2) + "deg) scale(" + ((1 - stretch * 0.5) * sc).toFixed(3) + "," + ((1 + stretch) * sc).toFixed(3) + ")";

    // limbs trail behind the body, so it feels like they are floating
    var f = 1 - Math.exp(-dt * 9), ux = -rig.vx * 0.045 * u / 4, uy = -rig.vy * 0.045 * u / 4;
    ["hl", "hr", "fl", "fr", "hd"].forEach(function (k, i) { lag[k].x += (ux * (1 + i * 0.12) - lag[k].x) * f; lag[k].y += (uy * (1 + i * 0.12) - lag[k].y) * f; });
    var wv = rig.wave > 0 ? Math.sin(t * 17) * 24 - 8 : Math.sin(t * 1.7) * 5;
    setT(P.hl, "translate(" + (lag.hl.x * 1.6).toFixed(1) + "," + (lag.hl.y * 1.6).toFixed(1) + ") rotate(" + wv.toFixed(1) + ",195,290)");
    var hr = Math.sin(t * 1.4 + 1) * 4, hsc = 1;
    if (rig.mode === "point" && rig.point && rig.point.cx != null) {
      var ang = Math.atan2(rig.point.cy - rig.y, rig.point.cx - rig.x) * 180 / Math.PI;
      hr = clamp(ang - 32, -150, 150) + Math.sin(t * 9) * 4; hsc = 1.08;
    }
    setT(P.hr, "translate(" + (lag.hr.x * 1.6).toFixed(1) + "," + (lag.hr.y * 1.6).toFixed(1) + ") translate(338,300) scale(" + hsc + ") rotate(" + hr.toFixed(1) + ") translate(-338,-300)");
    var swing = clamp(rig.vx * 0.02, -16, 16) + Math.sin(t * 2.4) * (sp > 60 ? 8 : 2);
    setT(P.fl, "translate(" + lag.fl.x.toFixed(1) + "," + (lag.fl.y * 0.6).toFixed(1) + ") rotate(" + (-swing).toFixed(1) + ",228,395)");
    setT(P.fr, "translate(" + lag.fr.x.toFixed(1) + "," + (lag.fr.y * 0.6).toFixed(1) + ") rotate(" + swing.toFixed(1) + ",302,395)");
    setT(P.hd, "translate(" + (lag.hd.x * 0.8).toFixed(1) + "," + (lag.hd.y * 0.8).toFixed(1) + ") rotate(" + (tilt * 0.5 + Math.sin(t * 1.3) * 1.5).toFixed(1) + ",265,250)");

    // eyes follow the pointer (or whatever Pip is pointing at)
    var lx = mouse.seen ? mouse.x : rig.x + 50, ly = mouse.seen ? mouse.y : rig.y;
    if (rig.mode === "point" && rig.point && rig.point.cx != null) { lx = rig.point.cx; ly = rig.point.cy; }
    var dx = lx - rig.x, dy = ly - rig.y, dl = Math.hypot(dx, dy) || 1, mag = Math.min(11, dl / 30);
    rig.looked.x += (dx / dl * mag - rig.looked.x) * (1 - Math.exp(-dt * 12)); rig.looked.y += (dy / dl * mag - rig.looked.y) * (1 - Math.exp(-dt * 12));
    rig.blinkT -= dt; if (rig.blinkT <= 0) { rig.blink = 0.13; rig.blinkT = rand(2.4, 5.5); } rig.blink = Math.max(0, rig.blink - dt);
    var sy = asleep ? 0.12 : rig.blink > 0 ? 0.1 : 1;
    ["l", "r"].forEach(function (s, i) {
      var cx = i ? 294 : 236;
      setT(P["e" + s], "translate(" + rig.looked.x.toFixed(1) + "," + (rig.looked.y + (asleep ? 6 : 0)).toFixed(1) + ") translate(" + cx + ",232) scale(1," + sy + ") translate(" + -cx + ",-232)");
    });
    var m = rig.talk > 0 ? 0.5 + Math.abs(Math.sin(t * 14)) * 1.3 : 1;
    setT(P.mouth, "translate(265,276) scale(1," + m.toFixed(2) + ") translate(-265,-276)");
  }

  var lastT = 0;
  function frame(ts) {
    W.requestAnimationFrame(frame);
    if (D.hidden || !dom.bot) { lastT = ts; return; }
    var dt = Math.min(0.05, (ts - (lastT || ts)) / 1000); lastT = ts;
    rig.t += dt; rig.wave = Math.max(0, rig.wave - dt); rig.talk = Math.max(0, rig.talk - dt); rig.arrive = Math.max(0, rig.arrive - dt);
    var idle = (now() - lastActive) / 1000;
    var shouldSleep = idle > 75 && !st.open;
    if (shouldSleep !== rig.sleep) { rig.sleep = shouldSleep; dom.bot.classList.toggle("sleep", shouldSleep); }
    step(dt); render(dt);
    if (bubbleOn) layoutBubble();
  }
  var lastActive = now();
  function poke() { lastActive = now(); if (rig.sleep) { rig.sleep = false; dom.bot.classList.remove("sleep"); rig.wave = 1; } }

  /* ------------------------------------------------------------ speech bubble and chat panel */
  var bubbleOn = false, bubbleTimer = 0, bubbleHover = false, typingEl = null;

  function fetchJSON(url, opts, ms) {
    var ctl = W.AbortController ? new AbortController() : null, t = ctl && setTimeout(function () { ctl.abort(); }, ms || 12000);
    opts = opts || {}; opts.redirect = "follow"; if (ctl) opts.signal = ctl.signal;
    return fetch(url, opts).then(function (r) { return r.json(); }).then(function (j) { clearTimeout(t); return j; }, function (e) { clearTimeout(t); throw e; });
  }

  function buildDom() {
    var root = D.createElement("div");
    root.className = "pip"; root.setAttribute("role", "complementary"); root.setAttribute("aria-label", "Pip, your Vitame guide");
    root.innerHTML =
      '<button type="button" class="pip-bot" aria-label="Chat with Pip"><span class="pip-fig">' + SVG + '<span class="pip-zz">zZ</span></span></button>' +
      '<div class="pip-bubble" data-side="left" role="status" aria-live="polite"><button type="button" class="pip-bx" aria-label="Close tip">&times;</button><p></p><div class="pip-chips"></div></div>' +
      '<section class="pip-panel" aria-label="Chat with Pip" aria-hidden="true"><div class="pip-ph"><div><b>Pip</b><small>Your Vitame pal</small></div><span class="sp"></span>' +
      '<button type="button" class="pip-ib" data-min aria-label="Minimise chat">&minus;</button><button type="button" class="pip-ib" data-hide aria-label="Hide Pip" title="Hide Pip">&times;</button></div>' +
      '<div class="pip-msgs" role="log" aria-live="polite"></div><div class="pip-quick"></div>' +
      '<form class="pip-form" autocomplete="off"><input class="pip-in" type="text" maxlength="300" placeholder="Ask Pip about our juices" aria-label="Your message">' +
      '<button class="pip-send" type="submit" aria-label="Send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12l16-8-6 16-3-7-7-1z"/></svg></button></form>' +
      '<div class="pip-note">Pip is an AI helper. Track orders in My Orders.</div></section>' +
      '<button type="button" class="pip-tab" hidden>Bring back Pip</button>';
    D.body.appendChild(root);
    dom.root = root; dom.bot = root.querySelector(".pip-bot"); dom.fig = root.querySelector(".pip-fig");
    dom.bubble = root.querySelector(".pip-bubble"); dom.bubbleP = dom.bubble.querySelector("p"); dom.bubbleChips = dom.bubble.querySelector(".pip-chips");
    dom.panel = root.querySelector(".pip-panel"); dom.msgs = root.querySelector(".pip-msgs"); dom.quick = root.querySelector(".pip-quick");
    dom.form = root.querySelector(".pip-form"); dom.input = root.querySelector(".pip-in"); dom.tab = root.querySelector(".pip-tab");
    P.hl = root.querySelector(".p-hand-l"); P.hr = root.querySelector(".p-hand-r"); P.fl = root.querySelector(".p-foot-l"); P.fr = root.querySelector(".p-foot-r");
    P.hd = root.querySelector(".p-head"); P.el = root.querySelector(".p-eye-l"); P.er = root.querySelector(".p-eye-r"); P.mouth = root.querySelector(".p-mouth");
  }

  function renderChips(box, chips) {
    box.innerHTML = "";
    (chips || []).forEach(function (c) {
      var b = D.createElement("button"); b.type = "button"; b.className = "pip-chip" + (c.c ? " " + c.c : ""); b.textContent = c.t; b.dataset.a = c.a;
      box.appendChild(b);
    });
  }

  function layoutBubble() {
    var b = dom.bubble, w = b.offsetWidth, h = b.offsetHeight, s = rig.size, x = rig.x, y = rig.y, side, left, top, gap = 12;
    if (VW < 560) {
      side = y > h + s + 20 ? "bottom" : "top";
      left = clamp(x - w / 2, 10, VW - w - 10); top = side === "bottom" ? y - s * 0.5 - h - gap : y + s * 0.5 + gap;
      b.style.setProperty("--tp", clamp(x - left - 8, 18, w - 34) + "px");
    } else {
      side = x > VW * 0.55 ? "left" : "right";
      if (side === "left" && x - s / 2 - gap - w < 8) side = "right";
      if (side === "right" && x + s / 2 + gap + w > VW - 8) side = "left";
      left = side === "left" ? x - s / 2 - gap - w : x + s / 2 + gap;
      top = clamp(y - 34, 64, VH - h - 12);
      b.style.setProperty("--tp", clamp(y - top - 8, 16, h - 34) + "px");
    }
    b.dataset.side = side; b.style.left = Math.round(left) + "px"; b.style.top = Math.round(top) + "px";
  }

  function showBubble(text, chips, ttl) {
    if (isHidden()) return;
    dom.bubbleP.textContent = text; renderChips(dom.bubbleChips, chips);
    bubbleOn = true; dom.bubble.classList.add("on"); layoutBubble();
    rig.talk = Math.min(2.4, 0.4 + text.length * 0.028);
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(function expire() { if (bubbleHover) { bubbleTimer = setTimeout(expire, 3000); return; } hideBubble(); }, ttl || 12500);
  }
  function hideBubble() {
    clearTimeout(bubbleTimer); bubbleOn = false; dom.bubble.classList.remove("on");
    if (rig.mode === "peek") { rig.mode = "away"; rig.point = null; }
  }

  /* ---- chat messages */
  function addMsg(role, text, chips, opts) {
    st.msgs.push({ r: role, t: text, ch: role === "bot" ? (chips || []) : [] }); save();
    drawMsg(st.msgs[st.msgs.length - 1], true);
  }
  function drawMsg(m, last) {
    var d = D.createElement("div"); d.className = "pip-m " + (m.r === "you" ? "you" : "bot"); d.textContent = m.t;
    if (m.r === "bot" && m.ch && m.ch.length) { var c = D.createElement("div"); c.className = "pip-chips"; renderChips(c, m.ch); d.appendChild(c); }
    dom.msgs.appendChild(d);
    // only the newest bot message keeps its buttons, older ones go quiet
    $$(".pip-m.bot .pip-chips", dom.msgs).forEach(function (n) { if (n.parentNode !== d) n.remove(); });
    dom.msgs.scrollTop = dom.msgs.scrollHeight;
  }
  function $$(s, r) { return Array.prototype.slice.call((r || D).querySelectorAll(s)); }
  function typing(on) {
    if (on && !typingEl) { typingEl = D.createElement("div"); typingEl.className = "pip-typing"; typingEl.innerHTML = "<i></i><i></i><i></i>"; dom.msgs.appendChild(typingEl); dom.msgs.scrollTop = dom.msgs.scrollHeight; rig.talk = 1; }
    if (!on && typingEl) { typingEl.remove(); typingEl = null; }
  }
  function redrawAll() {
    dom.msgs.innerHTML = "";
    st.msgs.forEach(function (m) { drawMsg(m, false); });
    if (!st.msgs.length) addMsg("bot", "Hi, I am Pip! I pop up while you browse. Ask me anything about our juices, or let me find your flavour.", TOPICS());
    drawQuick();
  }
  function drawQuick() {
    var q = {
      home: [C("Find my flavour", "quiz"), C("What is in the bottles?", "ask:What is in your juices?"), C("Which is sweetest?", "ask:Which one is sweetest?")],
      shop: [C("Find my flavour", "quiz"), C("Compare the four", "ask:Compare the juices"), C("Is anything sold out?", "ask:Is anything sold out?")],
      subscribe: [C("How does it work?", "ask:How does the subscription work?"), C("What does a box cost?", "ask:How much does it cost?"), C("Can I skip?", "ask:Can I skip a delivery?")],
      orders: [C("Where is my order?", "ask:Where is my order?"), C("How does delivery work?", "ask:How does delivery work?")],
      subscriptions: [C("How do I skip a delivery?", "ask:How do I skip a delivery?"), C("Can I swap flavours?", "ask:Can I change the flavours in my box?"), C("Pause my subscription", "ask:How do I pause my subscription?")],
      checkout: [C("Normal or premium?", "ask:How does delivery work?"), C("How can I pay?", "ask:How can I pay?"), C("Any discount?", "ask:Any offers?")]
    }[PAGE] || [];
    renderChips(dom.quick, q);
  }

  function openPanel() {
    st.open = true; save(); poke();
    hideBubble(); dom.panel.classList.add("on"); dom.panel.setAttribute("aria-hidden", "false");
    rig.mode = "panel"; rig.point = null; rig.wave = 1.2;
    if (!dom.msgs.children.length) redrawAll();
    setTimeout(function () { try { dom.input.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 260);
  }
  function closePanel() {
    st.open = false; save();
    dom.panel.classList.remove("on"); dom.panel.setAttribute("aria-hidden", "true");
    if (rig.mode === "panel") rig.mode = "away";
  }

  function botSay(reply, delay) {
    typing(true);
    var d = delay != null ? delay : 420 + Math.min(900, (reply.text || "").length * 7);
    setTimeout(function () { typing(false); addMsg("bot", reply.text, reply.chips); }, d);
  }

  /* ---- AI agent on Zapier (through the Apps Script endpoint). Falls back to the brain when it is not set up. */
  function aiOK() { return !!CFG.ordersEndpoint && st.ai !== false; }
  function ctxString() {
    var parts = ["page=" + PAGE], v = viewingId(); if (v) parts.push("viewing=" + FL[v].name);
    var b = cartBottles(); parts.push("cart=" + (b ? b + " bottles, " + rs(cartTotal()) : "empty"));
    var out = IDS.filter(stockOut).map(function (i) { return FL[i].name; }); if (out.length) parts.push("soldOut=" + out.join("/"));
    var top = Object.keys(st.interest).sort(function (a, b2) { return st.interest[b2] - st.interest[a]; })[0]; if (top && FL[top]) parts.push("mostViewed=" + FL[top].name);
    return parts.join("; ").slice(0, 480);
  }
  function askAI(text) {
    return new Promise(function (resolve) {
      var body = { action: "bot_ask", cid: st.cid, message: text.slice(0, 400), page: PAGE, context: ctxString() };
      fetchJSON(CFG.ordersEndpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) }, 12000).then(function (j) {
        if (!j || !j.ok) { if (j && j.error === "not_configured") { st.ai = false; save(); } return resolve(null); }
        var mid = j.mid, t0 = now();
        (function poll() {
          if (now() - t0 > 32000) return resolve(null);
          fetchJSON(CFG.ordersEndpoint + "?action=bot_poll&cid=" + encodeURIComponent(st.cid) + "&mid=" + encodeURIComponent(mid) + "&_=" + now(), {}, 10000)
            .then(function (r) { if (r && r.ok && r.ready) resolve(String(r.reply || "").slice(0, 1200)); else setTimeout(poll, 1500); }, function () { setTimeout(poll, 2200); });
        })();
      }, function () { resolve(null); });
    });
  }

  function send(text) {
    text = String(text || "").trim(); if (!text) return;
    poke(); addMsg("you", text); typing(true);
    var local = brain(text), useAI = aiOK() && local.conf < 0.6 && text.length > 3;
    if (!useAI) { setTimeout(function () { typing(false); addMsg("bot", local.text, local.chips); }, 450 + Math.min(800, local.text.length * 6)); return; }
    askAI(text).then(function (ai) {
      typing(false);
      if (ai) addMsg("bot", ai, [C("Find my flavour", "quiz"), C("Prices and packs", "ask:How much does it cost?")]);
      else addMsg("bot", local.text, local.chips);
    });
  }

  /* ---- chip actions */
  function go(url) {
    try {
      var u = new URL(url, D.baseURI), here = new URL(location.href);
      if (u.pathname === here.pathname) { if (u.hash && u.hash !== location.hash) location.hash = u.hash; else if (!u.hash) location.reload(); }
      else location.href = u.href;
    } catch (e) { location.href = url; }
  }
  function act(a, label) {
    poke();
    var k = a.split(":")[0];
    if (k === "ask") { openPanel(); setTimeout(function () { send(a.slice(4)); }, 120); }
    else if (k === "go") go(a.slice(3));
    else if (k === "quiz") { openPanel(); setTimeout(function () { addMsg("you", label || "Find my flavour"); botSay(quizStart()); }, 160); }
    else if (k === "qz") { addMsg("you", label || ""); botSay(quizStep(a)); }
    else if (k === "dismiss") { hideBubble(); st.silentUntil = now() + 120000; save(); }
    else if (k === "hide") hidePip();
    else if (k === "games") { if (W.ppGames) W.ppGames.open(); }
    else if (k === "open") openPanel();
  }

  /* ---- hide / bring back */
  function applyHidden() {
    var h = isHidden();
    dom.bot.hidden = h; dom.tab.hidden = !h;
    if (h) { hideBubble(); dom.panel.classList.remove("on"); }
  }
  function hidePip() { try { localStorage.setItem("pp-pip-hidden", "1"); } catch (e) { /* ignore */ } st.open = false; save(); applyHidden(); }
  function showPip() { try { localStorage.setItem("pp-pip-hidden", "0"); } catch (e) { /* ignore */ } applyHidden(); popOut(); rig.wave = 1.5; showBubble("I am back! Click me whenever you are curious.", [C("Chat with me", "open", "pri")], 6000); }

  /* ------------------------------------------------------------ nudges: what Pip says, and when */
  var nud = { last: 0, count: 0, idleCount: 0 };
  function canNudge() { return !isHidden() && !st.open && now() > (st.silentUntil || 0) && now() - nud.last > 13000 && nud.count < 6 && !bubbleOn; }
  function popOut() {
    if (rig.mode === "panel" || rig.mode === "drag" || rig.mode === "free" || rig.mode === "peek") return;
    pickEdge(); rig.arrive = 0.6; rig.mode = "peek";
  }
  function nudge(n, force) {
    if (!n) return false;
    if (!force && !canNudge()) return false;
    if (!force && st.seen[n.key] && now() - st.seen[n.key] < 300000) return false;
    st.seen[n.key] = now(); nud.last = now(); nud.count++; save();
    popOut();
    rig.wave = 1.6;
    showBubble(n.text, (n.chips || []).concat([C("Not now", "dismiss", "soft")]), n.ttl);
    return true;
  }

  var HOOK = {
    orange: { text: "Orange Riot has six Valencia oranges and a thumb of turmeric in every bottle. Guess how much vitamin C that adds up to?", chips: [C("Tell me", "ask:Vitamin C in Orange Riot", "pri"), C("What else is in it?", "ask:What is in Orange Riot?")] },
    beet: { text: "Beet & Berry: earthy beetroot with a tart raspberry kick. Which team are you on, earthy or fruity?", chips: [C("Earthy", "ask:Is Beet & Berry earthy?", "pri"), C("Fruity", "ask:Is Beet & Berry fruity?"), C("What is in it?", "ask:What is in Beet & Berry?")] },
    green: { text: "Green Machine swapped kale for raw mango and mint. Want to know why it tastes so crisp?", chips: [C("Why so crisp?", "ask:Why is Green Machine so crisp?", "pri"), C("Ingredients", "ask:What is in Green Machine?")] },
    yuzu: { text: "Ever tasted yuzu? It sits somewhere between lemon and mandarin. Curious how sharp this bottle gets?", chips: [C("How sharp?", "ask:How sharp is Yuzu Ginger?", "pri"), C("Why ginger?", "ask:What is in Yuzu Ginger?")] }
  };

  function nudgeFor(tg) {
    var id = tg.id, f = FL[id];
    switch (tg.type) {
      case "flavour": {
        if (!f) return null;
        if (stockOut(id)) return { key: "out:" + id, el: tg.el, text: f.name + " just sold out. Want me to find your next best match?", chips: [C("Yes please", "quiz", "pri"), C("When is it back?", "ask:When is " + f.name + " back in stock?")] };
        var h = HOOK[id]; return { key: "fl:" + id, el: tg.el, text: h.text, chips: h.chips };
      }
      case "buy": return f ? { key: "buy:" + id, el: tg.el, text: f.name + " is " + rs(60) + ", or " + rs(48) + " on a subscription. Want me to compare it with another flavour?", chips: [C("Compare", "ask:Compare the juices", "pri"), C("Subscription?", "ask:How does the subscription work?")] } : null;
      case "heroCta": return { key: "hero", el: tg.el, text: "Six bottles for one price: " + rs(330) + ". Can't decide what to mix?", chips: [C("Suggest a mix", "quiz", "pri"), C("Why six?", "ask:Tell me about the 6-pack")] };
      case "pack": return { key: "pack", el: tg.el, text: "Six bottles, " + rs(330) + ". Not sure what to mix? Tell me what you like and I will pick.", chips: [C("Pick for me", "quiz", "pri")] };
      case "box": return { key: "box", el: tg.el, text: "Boxes save you the choosing. Want me to find the right one for you?", chips: [C("Yes", "quiz", "pri"), C("What is the saving?", "ask:What do I save with a 6-pack?")] };
      case "size": { var n = tg.n, price = ({ 6: 330, 12: 620, 18: 900 })[n] || 330, sub = ({ 6: 260, 12: 496, 18: 720 })[n] || 260; return { key: "size:" + n, el: tg.el, text: "A " + n + "-pack on subscription is " + rs(sub) + ". That is " + rs(Math.round(sub / n * 10) / 10) + " a bottle instead of " + rs(60) + ".", chips: [C("How does it work?", "ask:How does the subscription work?", "pri")] }; }
      case "freq": return { key: "freq", el: tg.el, text: "Not sure how often? Most people pick every 2 weeks. You can skip or pause any time.", chips: [C("How do I skip?", "ask:Can I skip a delivery?")] };
      case "cta": return { key: "cta", el: tg.el, text: "Subscribing saves 20% and delivery is free. Want the full deal before you start?", chips: [C("Tell me", "ask:How does the subscription work?", "pri")] };
      case "cart": { var b = cartBottles(), tot = cartTotal(); return b ? { key: "cart", el: tg.el, text: tot < 400 ? "Your box has " + b + " bottle" + (b === 1 ? "" : "s") + ". You are " + rs(400 - tot) + " away from free delivery." : "Your box is " + rs(tot) + ", so delivery is free. Nice.", chips: [C("Build a 6-pack", "go:index.html#build"), C("Delivery info", "ask:How does delivery work?")] } : { key: "cart0", el: tg.el, text: "Your box is empty. Want me to pick your first bottle?", chips: [C("Find my flavour", "quiz", "pri")] }; }
      case "order": return { key: "order:" + tg.id, el: tg.el, text: "Want to see where " + tg.id + " is right now? I will cheer it along.", chips: [C("Open it", "go:orders.html#" + tg.id, "pri")] };
      case "ship": return tg.v === "premium" ? { key: "ship:p", el: tg.el, text: "Premium reaches you tomorrow. Perfect if the party is soon. Normal takes 3 days.", chips: [C("Compare", "ask:How does delivery work?")] } : { key: "ship:n", el: tg.el, text: "Normal takes about 3 days and is free over " + rs(400) + " or on a subscription.", chips: [C("Compare", "ask:How does delivery work?")] };
      case "pay": return { key: "pay", el: tg.el, text: "You can pay with UPI, cards or wallets. Anything you want to double-check before you pay?", chips: [C("Delivery date?", "ask:When will my order arrive?"), C("I am good", "dismiss", "soft")] };
    }
    return null;
  }

  function resolveTarget(n) {
    var t, a;
    if (PAGE === "home" && (t = n.closest("main .pill.solid")) && /6-pack/i.test(t.textContent)) return { el: t, type: "heroCta" };
    if ((t = n.closest("[data-dot]"))) return { el: t, type: "flavour", id: t.dataset.dot };
    if ((t = n.closest(".ptile"))) { if ((a = t.querySelector("[data-add]"))) return { el: t, type: "flavour", id: a.dataset.add }; if (t.classList.contains("box")) return { el: t, type: "box" }; }
    if ((t = n.closest("[data-row]"))) return { el: t, type: "flavour", id: t.dataset.row };
    if ((t = n.closest("[data-buy]"))) return { el: t, type: "buy", id: viewingId() };
    if ((t = n.closest("[data-add-pack]"))) return { el: t, type: "pack" };
    if ((t = n.closest("[data-start]"))) return { el: t, type: "cta" };
    if ((t = n.closest("[data-size]"))) return { el: t, type: "size", n: +t.dataset.size };
    if ((t = n.closest("[data-freq]"))) return { el: t, type: "freq" };
    if ((t = n.closest(".cart-btn"))) return { el: t, type: "cart" };
    if ((t = n.closest(".oc"))) return { el: t, type: "order", id: t.dataset.id };
    if ((t = n.closest(".opt"))) { var i = t.querySelector("input"); return { el: t, type: "ship", v: i && i.value }; }
    if ((t = n.closest("[data-pay]"))) return { el: t, type: "pay" };
    return null;
  }

  var hoverEl = null, hoverT = 0, lastTg = null, pendingN = null;
  function queue(n) { pendingN = { n: n, t: now() }; }
  function onOver(e) {
    if (TOUCH || e.pointerType === "touch" || st.open) return;
    var tg = e.target && e.target.closest ? resolveTarget(e.target) : null;
    if (!tg || tg.el === hoverEl) return;
    if (dom.root.contains(e.target)) return;
    hoverEl = tg.el; clearTimeout(hoverT);
    hoverT = setTimeout(function () {
      if (hoverEl !== tg.el) return;
      var r = tg.el.getBoundingClientRect(); if (r.bottom < 0 || r.top > VH) return;
      if (tg.type === "flavour" && FL[tg.id]) { st.interest[tg.id] = (st.interest[tg.id] || 0) + 1; st.focus = tg.id; save(); }
      lastTg = { tg: tg, t: now() };
    }, 650);
  }
  function onOut(e) { if (hoverEl && e.target && e.target.closest && !hoverEl.contains(e.relatedTarget)) { clearTimeout(hoverT); hoverEl = null; } }

  /* page greetings, idle questions and section nudges */
  var IDLE = {
    home: [
      { key: "i:h1", text: "Still deciding? Tell me what you like and I will pick a bottle for you.", chips: [C("Pick for me", "quiz", "pri")] },
      { key: "i:h2", text: "Quick one: do you drink juice in the morning or after a workout?", chips: [C("Morning", "ask:Which juice is best in the morning?"), C("After a workout", "ask:Which juice is best after a workout?")] },
      { key: "i:h3", text: "Did you know every bottle has 0 g added sugar? Want to see the numbers?", chips: [C("Show me", "ask:Nutrition of all the juices", "pri")] }
    ],
    shop: [
      { key: "i:s1", text: "Which colour is calling you? I can tell you the story behind any bottle.", chips: IDS.map(function (id) { return C(FL[id].name, "ask:Tell me about " + FL[id].name); }) },
      { key: "i:s2", text: "Fun challenge: guess which flavour has the most vitamin C.", chips: [C("Orange", "ask:Which has the most vitamin C?"), C("Yuzu", "ask:Which has the most vitamin C?"), C("Tell me", "ask:Which has the most vitamin C?", "pri")] }
    ],
    subscribe: [
      { key: "i:u1", text: "Fun fact: skipping a week takes one tap. Want to know how pausing works?", chips: [C("How?", "ask:Can I skip a delivery?", "pri")] },
      { key: "i:u2", text: "Wondering what a subscription really saves? I can work it out for you.", chips: [C("Work it out", "ask:What do I save with a subscription?", "pri")] }
    ],
    subscriptions: [
      { key: "i:sb1", text: "Tip: you can swap flavours in your box any time until 3 days before it ships.", chips: [C("How?", "ask:Can I change the flavours in my box?", "pri")] },
      { key: "i:sb2", text: "Going away? Pause your subscription and we will not send a thing.", chips: [C("How do I pause?", "ask:How do I pause my subscription?", "pri")] }
    ],
    orders: [
      { key: "i:o1", text: "Tip: when an order is on its way, its card turns into a live map.", chips: [C("How does tracking work?", "ask:How does delivery work?")] }
    ],
    checkout: [
      { key: "i:c1", text: "Not sure about delivery? Premium is tomorrow, normal is about 3 days. Want my pick?", chips: [C("Help me choose", "ask:How does delivery work?", "pri")] },
      { key: "i:c2", text: "Quick check before you pay: is the address right, including the PIN code?", chips: [C("Looks right", "dismiss", "soft")] }
    ]
  };
  function topInterest() { var k = Object.keys(st.interest).sort(function (a, b) { return st.interest[b] - st.interest[a]; })[0]; return k && FL[k] && st.interest[k] >= 2 ? k : null; }

  function greet() {
    if (isHidden()) return;
    if (!st.intro) {
      st.intro = true; save();
      nudge({ key: "intro", text: "Psst! I am Pip. Click me any time. Want me to find your perfect flavour in two questions?", chips: [C("Yes, find mine", "quiz", "pri"), C("Ask me anything", "open")], ttl: 15000 }, true);
      return;
    }
  }
  function pageNudge() {
    var pk = "page:" + PAGE;
    if (st.seen[pk] && now() - st.seen[pk] < 600000) return null;
    var ti = topInterest(), n = null;
    if (ti && (PAGE === "home" || PAGE === "shop")) n = { key: "g:ti", text: "You keep looking at " + FL[ti].name + ". " + FL[ti].hook + " Want the full story?", chips: [C("Tell me", "ask:Tell me about " + FL[ti].name, "pri"), goChip(ti)] };
    else if (PAGE === "home") n = { key: "g:h", text: "Welcome back! Hover over a bottle and I will tell you what is inside.", chips: [C("Find my flavour", "quiz")] };
    else if (PAGE === "shop") { var v = viewingId(); n = v ? { key: "g:sv:" + v, text: HOOK[v].text, chips: HOOK[v].chips } : { key: "g:s", text: "Four flavours, all cold-pressed. Which colour is calling you?", chips: IDS.map(function (id) { return C(FL[id].name, "ask:Tell me about " + FL[id].name); }) }; }
    else if (PAGE === "subscribe") n = { key: "g:u", text: "Subscribers save 20% and can skip any time. Want me to work out the cost per bottle?", chips: [C("Yes", "ask:How much does it cost?", "pri")] };
    else if (PAGE === "subscriptions") n = { key: "g:sb", text: "Need a break? You can skip a delivery or pause your box in a couple of taps. Want me to show you how?", chips: [C("Show me", "ask:How do I skip a delivery?", "pri")] };
    else if (PAGE === "orders") { var k = myOrders().length; n = k ? { key: "g:o", text: "Click an order and I will show you where it is. Anything on its way turns into a live map.", chips: [] } : { key: "g:o0", text: "No orders yet. Shall I pick a first bottle for you?", chips: [C("Yes please", "quiz", "pri")] }; }
    else if (PAGE === "checkout") n = { key: "g:c", text: "Almost there! Need help choosing between normal and premium delivery?", chips: [C("Compare", "ask:How does delivery work?", "pri"), C("I am good", "dismiss", "soft")] };
    if (n) st.seen[pk] = now();
    return n;
  }

  var TEASE = [
    "Psst! Over here. Click me and I will find your perfect juice.",
    "Hey, got a sec? Click me, I know a few juicy secrets.",
    "I have a question for you. Click me and I will ask it!",
    "Bet you cannot guess which flavour has the most vitamin C. Click me to find out.",
    "Stuck choosing? Click me and I will pick one in two questions."
  ];
  var teaseN = Math.floor(Math.random() * TEASE.length), pops = 0;
  function popContent() {
    var n = null;
    if (!st.intro) { st.intro = true; save(); pageGreeted = true; return { key: "intro", text: "Psst! I am Pip. Click me any time. Want me to find your perfect flavour in two questions?", chips: [C("Yes, find mine", "quiz", "pri"), C("Ask me anything", "open")], ttl: 15000 }; }
    if (pendingN && now() - pendingN.t < 45000) n = pendingN.n; pendingN = null;
    if (!n && lastTg && now() - lastTg.t < 40000) n = nudgeFor(lastTg.tg);
    if (n && st.seen[n.key] && now() - st.seen[n.key] < 300000) n = null;
    if (!n && !pageGreeted) { pageGreeted = true; n = pageNudge(); }
    if (!n && Math.random() < 0.45) { var list = IDLE[PAGE] || [], c0 = list[Math.floor(Math.random() * list.length)]; if (c0 && !(st.seen[c0.key] && now() - st.seen[c0.key] < 300000)) n = c0; }
    if (!n) { var t = TEASE[teaseN++ % TEASE.length]; n = { key: "tease:" + now(), text: t, chips: [C("Chat with me", "open", "pri")] }; }
    return n;
  }
  var pageGreeted = false, popT = 0;
  function scheduleNext(ms) { clearTimeout(popT); popT = setTimeout(popTick, ms); }
  function gamesOpen() { return D.documentElement.classList.contains("gm-open"); }
  var wasGames = false;
  function popTick() {
    if (gamesOpen()) { wasGames = true; if (bubbleOn) hideBubble(); return scheduleNext(1500); }
    if (wasGames) { wasGames = false; return scheduleNext(2500); } // the game menu just closed: say hi shortly after
    if (isHidden() || st.open || D.hidden || bubbleOn || rig.mode !== "away" || now() < (st.silentUntil || 0)) return scheduleNext(3000);
    pops++; nudge(popContent(), true);
    scheduleNext(pops > 10 ? 40000 + Math.random() * 30000 : 9000 + Math.random() * 8000);
  }

  function watchSections() {
    if (PAGE !== "home" || !W.IntersectionObserver) return;
    var map = {
      build: { key: "sec:build", text: "This is the 6-pack builder. Pick any mix for " + rs(330) + ". Want a combo suggestion?", chips: [C("Suggest a mix", "quiz", "pri")] },
      farms: { key: "sec:farms", text: "14 partner farms, pressed within 12 hours of picking. Want to know where the oranges come from?", chips: [C("Tell me", "ask:Where do the fruits come from?", "pri")] }
    };
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting && e.intersectionRatio > 0.45) { var n = map[e.target.id]; if (n) { n.el = null; queue(n); } } });
    }, { threshold: [0.5] });
    Object.keys(map).forEach(function (id) { var s = D.getElementById(id); if (s) io.observe(s); });
  }

  /* ------------------------------------------------------------ wiring */
  function onPointerMove(e) {
    if (e.pointerType && e.pointerType !== "mouse") return;
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.t = now(); mouse.seen = true; poke();
  }
  function boot() {
    if (!D.body) return D.addEventListener("DOMContentLoaded", boot);
    buildDom();
    rig.size = dom.bot.offsetWidth || 92; VW = W.innerWidth; VH = W.innerHeight;
    // pick up where Pip was on the previous page, so it feels like it travelled with you
    var sp = st.pos;
    if (sp && sp.mx != null && now() - sp.t < 120000) { mouse.x = sp.mx; mouse.y = sp.my; mouse.t = now(); mouse.seen = !TOUCH; }
    rig.mode = "away"; var ap = spotFor(rig.edge, true); rig.x = ap.x; rig.y = ap.y;
    applyHidden();

    D.addEventListener("pointermove", onPointerMove, { passive: true });
    D.documentElement.addEventListener("mouseleave", function () { mouse.seen = false; });
    D.addEventListener("mouseover", onOver, { passive: true });
    D.addEventListener("mouseout", onOut, { passive: true });
    ["scroll", "keydown", "touchstart", "wheel"].forEach(function (ev) { W.addEventListener(ev, poke, { passive: true }); });
    W.addEventListener("resize", function () { VW = W.innerWidth; VH = W.innerHeight; rig.size = dom.bot.offsetWidth || rig.size; });
    W.addEventListener("hashchange", function () {
      var v = viewingId(); if (PAGE === "shop" && v && HOOK[v]) queue({ key: "hash:" + v, text: HOOK[v].text, chips: HOOK[v].chips });
    });
    var firstFlavour = true;
    W.addEventListener("flavour", function (e) {
      if (firstFlavour) { firstFlavour = false; if (!e.detail || !e.detail.prev) return; }
      var f = e.detail && e.detail.f; if (f && HOOK[f.id]) { st.interest[f.id] = (st.interest[f.id] || 0) + 1; st.focus = f.id; save(); queue({ key: "dot:" + f.id, text: HOOK[f.id].text, chips: HOOK[f.id].chips }); }
    });
    // remember where we were when you leave, and where you clicked to go
    D.addEventListener("click", function (e) { var a = e.target.closest && e.target.closest("a[href]"); if (a && !dom.root.contains(a)) { st.pos = { x: rig.x, y: rig.y, t: now(), mx: e.clientX, my: e.clientY, mode: rig.mode }; save(); } }, true);
    W.addEventListener("pagehide", function () { st.pos = { x: rig.x, y: rig.y, t: now(), mx: mouse.seen ? mouse.x : null, my: mouse.y, mode: rig.mode }; save(); });

    // clicks inside Pip
    dom.root.addEventListener("click", function (e) {
      var chip = e.target.closest(".pip-chip");
      if (chip) { act(chip.dataset.a, chip.textContent); return; }
      if (e.target.closest(".pip-bx")) { hideBubble(); st.silentUntil = now() + 90000; save(); return; }
      if (e.target.closest("[data-min]")) { closePanel(); return; }
      if (e.target.closest("[data-hide]")) { hidePip(); return; }
      if (e.target.closest(".pip-tab")) { showPip(); return; }
    });
    dom.bubble.addEventListener("mouseenter", function () { bubbleHover = true; });
    dom.bubble.addEventListener("mouseleave", function () { bubbleHover = false; });
    dom.form.addEventListener("submit", function (e) { e.preventDefault(); var v = dom.input.value; dom.input.value = ""; send(v); });
    dom.bot.addEventListener("click", function () { if (dragMoved) { dragMoved = false; return; } poke(); if (st.open) closePanel(); else openPanel(); });

    // drag Pip anywhere
    var drag = null, dragMoved = false;
    dom.bot.addEventListener("pointerdown", function (e) { drag = { sx: e.clientX, sy: e.clientY, ox: rig.x, oy: rig.y, on: false }; try { dom.bot.setPointerCapture(e.pointerId); } catch (x) { /* no capture */ } });
    dom.bot.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!drag.on && Math.hypot(dx, dy) > 8) { drag.on = true; dragMoved = true; rig.mode = "drag"; dom.bot.classList.add("drag"); hideBubble(); }
      if (drag.on) { rig.x = clamp(drag.ox + dx, rig.size * 0.4, VW - rig.size * 0.4); rig.y = clamp(drag.oy + dy, rig.size * 0.4, VH - rig.size * 0.4); rig.vx = dx * 0; rig.vy = 0; }
    });
    var endDrag = function () { if (!drag) return; var was = drag.on; drag = null; dom.bot.classList.remove("drag"); if (was) { rig.mode = "free"; rig.freeUntil = now() + 7000; rig.wave = 1; setTimeout(function () { dragMoved = false; }, 0); } };
    dom.bot.addEventListener("pointerup", endDrag); dom.bot.addEventListener("pointercancel", endDrag);

    if (st.open && !isHidden()) { openPanel(); }
    watchSections();
    dom.bot.addEventListener("mouseenter", function () { bubbleHover = true; });
    dom.bot.addEventListener("mouseleave", function () { bubbleHover = false; });
    if (!st.intro) { scheduleNext(3200); }
    else scheduleNext(4000 + Math.random() * 3000);
    W.requestAnimationFrame(frame);
  }

  W.pip = { open: function () { openPanel(); }, close: closePanel, hide: hidePip, show: showPip, send: send, brain: brain, nudge: nudge, say: showBubble, _rig: rig, _st: st, _mouse: mouse, _dom: dom, _nud: nud };
  boot();
})();
