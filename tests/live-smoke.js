/* Live smoke test for a deployed instance of the VISION 61 CRM.
   Fetches the live index.html, loads every referenced script in order,
   renders every page route in a headless DOM, and fails on any eval
   error, render crash, or "undefined/NaN/Infinity" garbage in output.

   Usage:
     node tests/live-smoke.js                       # default live site
     LIVE_URL=https://example.com/path node tests/live-smoke.js

   Requires jsdom (already present in node_modules for the QA harness). */
"use strict";
const https = require("https");
const { JSDOM, VirtualConsole } = require("../node_modules/jsdom");

const BASE = (process.env.LIVE_URL || "https://chrisxie12.github.io/outreach-tracker/").replace(/\/+$/, "") + "/";
const KEY = "v61crm_v1";

const get = (url) => new Promise((res, rej) => {
  https.get(url, (r) => {
    let d = "";
    r.on("data", (c) => (d += c));
    r.on("end", () => res(d));
  }).on("error", rej);
});

(async () => {
  const html = await get(BASE);
  const scriptTags = html.match(/<script src="([^"]+)"><\/script>/g) || [];
  const scripts = scriptTags.map((t) => t.match(/src="([^"]+)"/)[1]);

  const store = {};
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => { if (e.type !== "not-implemented") errors.push("jsdomError: " + e.message); });
  vc.on("log", () => {}); vc.on("warn", () => {}); vc.on("error", () => {});

  const dom = new JSDOM(html, {
    url: BASE,
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(w) {
      Object.defineProperty(w, "localStorage", {
        value: {
          getItem: (k) => (k in store ? store[k] : null),
          setItem: (k, v) => { store[k] = String(v); },
          removeItem: (k) => { delete store[k]; },
          clear: () => {},
        },
        configurable: true,
      });
      Object.defineProperty(w, "sessionStorage", {
        value: { getItem: () => "1", setItem: () => {}, removeItem: () => {}, clear: () => {} },
        configurable: true,
      });
      w.alert = () => {};
      w.confirm = () => true;
      w.prompt = () => "Test";
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    },
  });

  const w = dom.window;
  for (const src of scripts) {
    const code = await get(BASE + src);
    try { w.eval(code); } catch (e) { errors.push("EVAL " + src + ": " + e.message); }
  }
  w.V61.Store.load();
  w.document.dispatchEvent(new w.Event("DOMContentLoaded"));

  const P = w.V61.Pages;
  const routes = ["dashboard", "leads", "discovery", "audits", "opportunities", "outreach", "followups", "tasks", "pipeline", "proposals", "services", "clients", "projects", "invoices", "reports", "settings", "importexport"];
  let ok = 0;
  for (const r of routes) {
    const fn = typeof P[r] === "function" ? P[r] : (P[r] && P[r].render);
    try {
      fn();
      const h = w.document.getElementById("content").innerHTML;
      if (/undefined|NaN|Infinity/.test(h.replace(/id="[^"]*"/g, ""))) { errors.push("garbage in " + r); }
      ok++;
    } catch (e) { errors.push("render " + r + ": " + e.message); }
  }
  console.log("live smoke: scripts=" + scripts.length + " routes=" + ok + "/" + routes.length + " errors=" + errors.length);
  if (errors.length) { console.log(errors.join("\n")); process.exit(1); }
  console.log("LIVE SMOKE: ALL PASS");
})().catch((e) => { console.error("SMOKE FAIL:", e.message); process.exit(1); });