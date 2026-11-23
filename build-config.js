/* Runs on Vercel before the site is published. Fills assets/config.js from environment variables, so keys never live in the repository.
   Set these in Vercel: Project > Settings > Environment Variables. Anything left empty keeps the value already in assets/config.js. */
const fs = require("fs");
const path = "assets/config.js";
const src = fs.readFileSync(path, "utf8");
const m = src.match(/window\.PP\s*=\s*(\{[\s\S]*?\});?\s*$/);
let cfg = {};
try { cfg = new Function("return " + m[1])(); } catch (e) { cfg = {}; }
const e = process.env;
const map = { ORDERS_ENDPOINT: "ordersEndpoint", ADMIN_EMAIL: "adminEmail", GOOGLE_CLIENT_ID: "googleClientId", MAPBOX_TOKEN: "mapboxToken", MAPBOX_STYLE: "mapStyle" };
Object.keys(map).forEach((k) => { if (e[k] && e[k].trim()) cfg[map[k]] = e[k].trim(); });
cfg.firebase = cfg.firebase || {};
[["FIREBASE_API_KEY", "apiKey"], ["FIREBASE_AUTH_DOMAIN", "authDomain"], ["FIREBASE_PROJECT_ID", "projectId"]].forEach((p) => { if (e[p[0]] && e[p[0]].trim()) cfg.firebase[p[1]] = e[p[0]].trim(); });
cfg.pay = cfg.pay || {};
[["PAYMENT_MODE", "mode"], ["UPI_ID", "upiId"], ["UPI_PAYEE", "payee"]].forEach((p) => { if (e[p[0]] && e[p[0]].trim()) cfg.pay[p[1]] = e[p[0]].trim(); });
if (cfg.pay.mode !== "live") cfg.pay.mode = "demo";
if (Number(e.EMI_MIN) > 0) cfg.pay.emiMin = Number(e.EMI_MIN);
if (e.PAY_METHODS && e.PAY_METHODS.trim()) cfg.pay.methods = e.PAY_METHODS.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
fs.writeFileSync(path, "/* Generated at deploy time from environment variables. */\nwindow.PP = " + JSON.stringify(cfg, null, 2) + ";\n");
console.log("Payments:", cfg.pay.mode, cfg.pay.upiId ? "| UPI id set" : "| no UPI id", "| methods:", [].concat(cfg.pay.methods || ["upi"]).join(","));
console.log("config.js written. Google sign-in:", cfg.googleClientId ? "on" : "off", "| Firebase:", cfg.firebase.apiKey ? "on" : "off", "| map token:", cfg.mapboxToken ? "set" : "missing");
