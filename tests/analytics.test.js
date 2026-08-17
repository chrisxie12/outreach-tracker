/* VISION 61 website — GA4 analytics event tracking tests.
   Verifies the Google tag is installed exactly once with the correct
   ID, that events fire on real user actions, that no personal data or
   message contents reach analytics, that nothing double-fires, and
   that the site keeps working when analytics is unavailable. */
"use strict";
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const { suite, test, ok, eq, notNull, assertCleanHTML } = require("./framework");

const siteDir = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(siteDir, "index.html"), "utf8");
const css = fs.readFileSync(path.join(siteDir, "styles.css"), "utf8");
const js = fs.readFileSync(path.join(siteDir, "script.js"), "utf8");

function makeDom(gtagEnabled) {
  const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
  dom.window.document.head.insertAdjacentHTML("beforeend", "<style>" + css + "</style>");
  const winErrors = [];
  dom.window.addEventListener("error", (e) => winErrors.push(String((e && e.message) || e)));
  const events = [];
  if (gtagEnabled !== false) {
    dom.window.gtag = (...args) => events.push(args);
  }
  dom.window.eval(js);
  return { dom, events, winErrors };
}

const ev = (list, name) => list.find((a) => a[0] === "event" && a[1] === name);

suite("website analytics (GA4)", () => {

  test("google tag installed exactly once inside <head> with G-SPVGPEL8W5", () => {
    const url = "https://www.googletagmanager.com/gtag/js?id=G-SPVGPEL8W5";
    eq((html.match(/googletagmanager\.com\/gtag\/js\?id=G-SPVGPEL8W5/g) || []).length, 1, "gtag script exactly once");
    ok(html.indexOf("async src=\"" + url + "\"") >= 0, "loaded asynchronously");
    const head = html.slice(0, html.indexOf("</head>"));
    ok(head.indexOf(url) >= 0, "tag is inside <head>");
    ok(head.indexOf("window.dataLayer = window.dataLayer || []") >= 0, "dataLayer initialized");
    ok(/function gtag\(\)\{dataLayer\.push\(arguments\);\}/.test(head), "gtag() function present");
    eq((html.match(/gtag\('config',\s*'G-SPVGPEL8W5'\)/g) || []).length, 1, "single config init (no second analytics init)");
  });

  test("index.html still contains no garbage tokens with the tag added", () => {
    assertCleanHTML(html, "website index.html");
  });

  test("WhatsApp CTA interaction generates contact_whatsapp once per click", () => {
    const { dom, events } = makeDom(true);
    const wa = dom.window.document.querySelector('a[href^="https://wa.me/"]');
    notNull(wa, "WhatsApp CTA exists");
    wa.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    wa.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    const hits = events.filter((a) => a[0] === "event" && a[1] === "contact_whatsapp");
    eq(hits.length, 2, "one event per click — no double counting");
    eq(hits[0][2].method, "whatsapp", "method whatsapp");
    eq(hits[0][2].location, "contact", "location detected");
  });

  test("mailto interaction generates contact_email once per click", () => {
    const { dom, events } = makeDom(true);
    const mail = dom.window.document.querySelector('a[href^="mailto:hello@vision61studios.online"]');
    notNull(mail, "mailto CTA exists");
    mail.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    mail.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    const hits = events.filter((a) => a[0] === "event" && a[1] === "contact_email");
    eq(hits.length, 2, "one event per click — no double counting");
    eq(hits[0][2].method, "email", "method email");
    eq(hits[0][2].location, "contact", "location detected");
  });

  test("audit_start fires on valid audit submission and audit_complete only after success", async () => {
    const { dom, events } = makeDom(true);
    dom.window.fetch = (url) => {
      if (/robots\.txt|sitemap\.xml/.test(url)) return Promise.reject(new Error("cors"));
      return Promise.resolve({
        ok: true, status: 200,
        text: () => Promise.resolve("<html><head><title>Test Restaurant Accra Ghana</title><meta name='description' content='desc'><meta name='viewport' content='width=device-width'><link rel='canonical' href='https://t.example/'></head><body><h1>Test Restaurant</h1><p>We are a restaurant in Accra serving customers daily.</p><a href='https://wa.me/233201599949'>WhatsApp</a><address>Accra</address></body></html>"),
      });
    };
    dom.window.document.getElementById("ia-url").value = "t.example";
    dom.window.document.getElementById("ia-form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 60));
    const start = ev(events, "audit_start");
    const comp = ev(events, "audit_complete");
    notNull(start, "audit_start fired");
    notNull(comp, "audit_complete fired after successful completion");
    eq(start[2].method, "free_digital_audit", "audit_start method");
    eq(comp[2].method, "free_digital_audit", "audit_complete method");
  });

  test("audit_complete does NOT fire when the audit cannot complete", async () => {
    const { dom, events } = makeDom(true);
    dom.window.fetch = () => Promise.reject(new Error("network down"));
    dom.window.document.getElementById("ia-url").value = "nowhere.example";
    dom.window.document.getElementById("ia-form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 60));
    notNull(ev(events, "audit_start"), "audit_start fired on attempt");
    ok(!ev(events, "audit_complete"), "audit_complete withheld when unreachable");
  });

  test("contact_form_start fires once, not on every keystroke", () => {
    const { dom, events } = makeDom(true);
    const field = dom.window.document.getElementById("cf-name");
    field.dispatchEvent(new dom.window.Event("focusin", { bubbles: true }));
    field.dispatchEvent(new dom.window.Event("focusin", { bubbles: true }));
    field.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    field.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    const hits = events.filter((a) => a[0] === "event" && a[1] === "contact_form_start");
    eq(hits.length, 1, "contact_form_start exactly once");
    eq(hits[0][2].form_name, "main_contact", "form_name main_contact");
  });

  test("contact_form_submit fires only on successful submission", () => {
    const { dom, events } = makeDom(true);
    dom.window.open = () => null;
    const d = dom.window.document;
    d.getElementById("cf-name").value = "Ama";
    d.getElementById("cf-message").value = "I need a website";
    d.getElementById("contact-form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    const hit = ev(events, "contact_form_submit");
    notNull(hit, "contact_form_submit fired");
    eq(hit[2].form_name, "main_contact", "form_name main_contact");
    eq(hit[2].method, "whatsapp", "method whatsapp");
    events.length = 0;
    d.getElementById("cf-name").value = "";
    d.getElementById("cf-message").value = "";
    d.getElementById("contact-form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    ok(!ev(events, "contact_form_submit"), "no submit event on invalid submission");
  });

  test("service_interest uses the publicly displayed service name", () => {
    const { dom, events } = makeDom(true);
    const d = dom.window.document;
    const card = d.querySelector('.svc-card[data-service="website-development"]');
    notNull(card, "service card exists");
    card.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    const hit = ev(events, "service_interest");
    notNull(hit, "service_interest fired");
    eq(hit[2].service_name, "Website Development", "uses displayed card name");
    events.length = 0;
    const seo = d.querySelector('.svc-card[data-service="seo"]');
    seo.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    eq(ev(events, "service_interest")[2].service_name, "SEO Setup & Optimization", "real service name");
  });

  test("no personal form values or message contents reach gtag", () => {
    const { dom, events } = makeDom(true);
    dom.window.open = () => null;
    const d = dom.window.document;
    d.getElementById("cf-name").value = "Alice Secret";
    d.getElementById("cf-business").value = "Alice Ltd";
    d.getElementById("cf-phone").value = "+233 55 000 0000";
    d.getElementById("cf-email").value = "alice@example.com";
    d.getElementById("cf-message").value = "Please call 0550000000 about a website";
    d.getElementById("contact-form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    const mail = d.querySelector('a[href^="mailto:hello@vision61studios.online"]');
    mail.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    ok(events.length >= 2, "events recorded");
    const flat = JSON.stringify(events);
    ["Alice", "Alice Ltd", "alice@example.com", "0550000000", "Please call", "website"].forEach((t) => {
      ok(flat.indexOf(t) < 0, "no personal value in analytics: " + t);
    });
    ok(flat.indexOf("233201599949") < 0, "no WhatsApp number in analytics");
  });

  test("website keeps working when window.gtag is unavailable", () => {
    const { dom, events, winErrors } = makeDom(false);
    const d = dom.window.document;
    let opened = null;
    dom.window.open = (u) => { opened = u; return null; };
    d.getElementById("cf-name").value = "Ama";
    d.getElementById("cf-message").value = "Need a site";
    d.getElementById("contact-form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    ok(opened, "WhatsApp still opens without gtag");
    eq(events.length, 0, "no analytics recorded without gtag");
    eq(winErrors.length, 0, "no window errors when gtag missing");
    const wa = d.querySelector('a[href^="https://wa.me/"]');
    wa.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    eq(winErrors.length, 0, "no errors on outbound click without gtag");
  });

  test("no analytics code or secrets reach the CRM or Worker", () => {
    const crmHtml = fs.readFileSync(path.join(siteDir, "crm", "index.html"), "utf8");
    const crmApp = fs.readFileSync(path.join(siteDir, "crm", "js", "app.js"), "utf8");
    const workerJs = fs.readFileSync(path.join(siteDir, "worker", "src", "index.js"), "utf8");
    ["G-SPVGPEL8W5", "googletagmanager", "contact_whatsapp", "contact_email",
      "audit_start", "audit_complete", "contact_form_start", "contact_form_submit", "service_interest"].forEach((s) => {
      ok(crmHtml.indexOf(s) < 0, "crm/index.html clean of " + s);
      ok(crmApp.indexOf(s) < 0, "crm app clean of " + s);
      ok(workerJs.indexOf(s) < 0, "worker clean of " + s);
    });
    const all = html + js;
    ok(all.indexOf("AIza") < 0, "no Google API key");
    ok(all.indexOf("sk-") < 0, "no secret API key");
    ok(all.indexOf("password") < 0, "no password");
  });
});