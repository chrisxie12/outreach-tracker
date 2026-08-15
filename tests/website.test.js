/* VISION 61 website — structural smoke tests.
   Verifies the public landing page loads, has all core sections, the
   contact CTAs, and its JS runs without errors. */
"use strict";
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const { suite, test, ok, eq, notNull, assertCleanHTML } = require("./framework");

const siteDir = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(siteDir, "index.html"), "utf8");
const css = fs.readFileSync(path.join(siteDir, "styles.css"), "utf8");
const js = fs.readFileSync(path.join(siteDir, "script.js"), "utf8");

suite("website landing page", () => {
  const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
  dom.window.document.head.insertAdjacentHTML("beforeend", "<style>" + css + "</style>");
  const winErrors = [];
  dom.window.addEventListener("error", (e) => winErrors.push(String((e && e.message) || e)));
  dom.window.eval(js);
  const d = dom.window.document;

  test("has a real page title and description", () => {
    ok(/Vision 61/i.test(d.title), "title mentions Vision 61");
    notNull(d.querySelector('meta[name="description"]'), "meta description present");
    ok(/Ghana/i.test(d.querySelector('meta[name="description"]').content), "description mentions Ghana");
  });

  test("all five sections render with nav anchors", () => {
    const ids = Array.from(d.querySelectorAll("section[id]")).map((s) => s.id);
    eq(ids.length, 5, "five sections");
    const anchors = Array.from(d.querySelectorAll(".nav-links a")).map((a) => a.getAttribute("href"));
    ids.forEach((id) => ok(anchors.indexOf("#" + id) >= 0, "nav links to #" + id));
  });

  test("service cards, process steps and proof cards present", () => {
    eq(d.querySelectorAll(".card").length, 4, "four service cards");
    eq(d.querySelectorAll(".proc").length, 4, "four process steps");
    eq(d.querySelectorAll(".work-card").length, 2, "two proof cards");
  });

  test("contact CTAs link out to WhatsApp and email", () => {
    const wa = d.querySelector('a[href^="https://wa.me"]');
    const mail = d.querySelector('a[href^="mailto:"]');
    notNull(wa, "WhatsApp CTA exists");
    notNull(mail, "mailto CTA exists");
    ok(/\?text=/.test(wa.getAttribute("href")), "WhatsApp link has a pre-filled message");
  });

  test("page markup contains no garbage tokens", () => {
    assertCleanHTML(html, "website index.html");
  });

  test("website JS runs without errors", () => {
    eq(winErrors.length, 0, "no window JS errors");
  });
});
