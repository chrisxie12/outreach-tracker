/* jsdom harness: loads the full VISION 61 CRM app in an isolated window. */
"use strict";
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require(path.join(__dirname, "..", "node_modules", "jsdom"));

const ROOT = path.join(__dirname, "..");
const SCRIPTS = require("./scripts.json");
const KEY = "v61crm_v1";

function loadIndex() {
  return fs.readFileSync(path.join(ROOT, "crm", "index.html"), "utf8");
}

/* Build a fresh app window. seed: optional object to store under the DB key
   (simulates an existing persisted database). Returns { window, V61, html } */
function createApp(seed) {
  const html = loadIndex();
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => { if (e.type !== "not-implemented") errors.push("jsdomError: " + e.message); });
  vc.on("log", () => {}); vc.on("warn", () => {}); vc.on("error", () => {}); vc.on("info", () => {});

  const store = {};
  if (seed !== undefined) store[KEY] = typeof seed === "string" ? seed : JSON.stringify(seed);

  const dom = new JSDOM(html, {
    url: "http://localhost/index.html#/dashboard",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      Object.defineProperty(window, "localStorage", {
        value: {
          getItem: (k) => (k in store ? store[k] : null),
          setItem: (k, v) => { store[k] = String(v); },
          removeItem: (k) => { delete store[k]; },
          clear: () => { for (const k of Object.keys(store)) delete store[k]; },
        },
        configurable: true,
      });
      Object.defineProperty(window, "sessionStorage", {
        value: { getItem: () => "1", setItem: () => {}, removeItem: () => {}, clear: () => {} },
        configurable: true,
      });
      window.alert = () => {};
      window.confirm = () => true;
      window.prompt = () => "Test";
      window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
      window.cancelAnimationFrame = (id) => clearTimeout(id);
      /* jsdom does not implement createObjectURL (CSV export / downloads). */
      window.URL.createObjectURL = () => "blob:mock";
      window.URL.revokeObjectURL = () => {};
    },
  });

  const w = dom.window;
  for (const src of SCRIPTS) {
    const file = path.join(ROOT, src);
    try { w.eval(fs.readFileSync(file, "utf8")); }
    catch (e) { errors.push("EVAL " + src + ": " + e.message); }
  }
  return { window: w, V61: w.V61, html, getErrors: () => errors.slice() };
}

/* Fresh empty app with store loaded. */
function freshApp() {
  const app = createApp();
  app.V61.Store.load();
  return app;
}

/* jsdom fires DOMContentLoaded on a later tick, so V61.App.init() re-renders
   the dashboard AFTER tests render a page — overwriting it. settle() waits
   until that init render has happened so tests are deterministic. */
async function settle(app) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const c = app.window.document.getElementById("content");
    if (c && c.innerHTML.indexOf("hero") >= 0) return;
    await new Promise((r) => setTimeout(r, 5));
  }
}

/* Simulate a browser refresh: persist current state, build a brand-new window,
   and load it back. */
function refresh(app) {
  const persisted = app.window.localStorage.getItem(KEY);
  const app2 = createApp(persisted);
  app2.V61.Store.load();
  return app2;
}

module.exports = { createApp, freshApp, refresh, settle, KEY, ROOT };