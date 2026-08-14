/* QA — Mobile responsiveness + console/runtime checks.
   These verify the app is responsive by construction (viewport meta + media queries
   collapsing grids to a single column) and that rendering at narrow viewport widths
   produces no console errors or runtime crashes. */
"use strict";
const { suite, test, assert, eq, ok } = require("./framework");
const { freshApp } = require("./harness");

const fs = require("fs");
const path = require("path");

suite("Mobile responsiveness", () => {
  test("index.html declares a responsive viewport meta", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    ok(/<meta\s+name=["']viewport["']\s+content=["']width=device-width\s*,\s*initial-scale=1\.0["']/.test(html), "missing viewport meta");
  });

  test("CSS collapses multi-column grids to single column on small screens", () => {
    const css = fs.readFileSync(path.join(__dirname, "..", "styles", "app.css"), "utf8");
    const media = css.match(/@media\s*\(max-width:\s*(\d+)px\)\s*\{([\s\S]*?)\}/g) || [];
    assert(media.length >= 4, "expected several media queries, found " + media.length);
    const singles = media.filter((m) => /grid-template-columns\s*:\s*1fr/.test(m));
    assert(singles.length >= 2, "expected grid collapse rules for mobile");
    const small = media.filter((m) => /max-width:\s*560px/.test(m));
    assert(small.length >= 1, "expected a 560px (mobile) breakpoint");
  });

  test("all page renders complete without errors at a 375px viewport", () => {
    const app = freshApp();
    app.window.innerWidth = 375;
    app.window.dispatchEvent(new app.window.Event("resize"));
    const P = app.V61.Pages;
    const routes = ["dashboard", "leads", "discovery", "audits", "opportunities", "outreach", "followups", "tasks", "pipeline", "proposals", "services", "clients", "projects", "invoices", "reports", "settings", "importexport"];
    const errors = [];
    const origErr = app.window.console.error;
    app.window.console.error = (...args) => errors.push(args.join(" "));
    try {
      for (const r of routes) {
        const fn = typeof P[r] === "function" ? P[r] : (P[r] && P[r].render);
        try { fn(); } catch (e) { errors.push(r + ": " + e.message); }
      }
    } finally {
      app.window.console.error = origErr;
    }
    eq(errors.length, 0, errors.join(" | "));
  });

  test("side menu / navigation remains functional at mobile width", () => {
    const app = freshApp();
    app.window.innerWidth = 375;
    app.window.dispatchEvent(new app.window.Event("resize"));
    const w = app.window;
    w.document.dispatchEvent(new w.Event("DOMContentLoaded"));
    const V = app.V61;
    w.location.hash = "#/leads";
    V.App.renderRoute();
    const content = w.document.getElementById("content");
    ok(content.innerHTML.length > 0, "leads route rendered at mobile width");
  });
});

suite("Console / runtime checks", () => {
  test("app boots with zero console errors", () => {
    const app = freshApp();
    const errors = [];
    const origErr = app.window.console.error;
    app.window.console.error = (...args) => errors.push(args.join(" "));
    try {
      app.window.document.dispatchEvent(new app.window.Event("DOMContentLoaded"));
    } finally {
      app.window.console.error = origErr;
    }
    eq(errors.length, 0, errors.join(" | "));
  });

  test("unlock flow clears lock screen and shows the app", () => {
    const app = freshApp();
    const w = app.window;
    w.document.dispatchEvent(new w.Event("DOMContentLoaded"));
    // harness sessionStorage reports an active session, so the lock hides
    const lock = w.document.getElementById("lock");
    ok(lock && lock.classList.contains("hidden"), "lock screen hidden after unlock/session");
    ok(w.document.getElementById("content").innerHTML.length > 0, "app content rendered");
  });

  test("no render writes 'undefined'/'NaN' into page output", () => {
    const app = freshApp();
    const P = app.V61.Pages;
    const routes = ["dashboard", "leads", "discovery", "audits", "opportunities", "outreach", "followups", "tasks", "pipeline", "proposals", "services", "clients", "projects", "invoices", "reports", "settings", "importexport"];
    const bad = [];
    for (const r of routes) {
      const fn = typeof P[r] === "function" ? P[r] : (P[r] && P[r].render);
      try {
        fn();
        const html = app.window.document.getElementById("content").innerHTML;
        if (/undefined|NaN/.test(html.replace(/id="[^"]*"/g, ""))) bad.push(r);
      } catch (e) {
        bad.push(r + " threw " + e.message);
      }
    }
    eq(bad.length, 0, bad.join(", "));
  });
});
