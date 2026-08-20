/* VISION 61 website — portfolio / Our Work section tests.
   Verifies the #work section, the Work nav link, the data-driven
   portfolio render, featured project, category filtering, the
   project modal, honest labels, real image assets, and that the
   existing site features (nav, WhatsApp, email, audit, GA4) and
   the CRM/Worker stay untouched. */
"use strict";
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const { suite, test, ok, eq, notNull, assertCleanHTML } = require("./framework");

const siteDir = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(siteDir, "index.html"), "utf8");
const css = fs.readFileSync(path.join(siteDir, "styles.css"), "utf8");
const js = fs.readFileSync(path.join(siteDir, "script.js"), "utf8");

function makeDom() {
  const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
  dom.window.document.head.insertAdjacentHTML("beforeend", "<style>" + css + "</style>");
  const winErrors = [];
  dom.window.addEventListener("error", (e) => winErrors.push(String((e && e.message) || e)));
  dom.window.eval(js);
  return { dom, winErrors };
}

function click(w, el) {
  el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
}

const d = makeDom().dom.window.document;

suite("website portfolio — structure", () => {
  test("#work section exists with heading and honest sub note", () => {
    const sec = d.getElementById("work");
    notNull(sec, "#work section present");
    const h2 = sec.querySelector("h2");
    notNull(h2, "heading present");
    ok(/Selected work/.test(h2.textContent), "strong agency-style heading");
    ok(/real/.test(sec.querySelector(".sub").textContent), "sub note is honest about labelling");
  });

  test("navigation contains a Work link to #work", () => {
    const anchors = Array.from(d.querySelectorAll(".nav-links a")).map((a) => a.getAttribute("href"));
    ok(anchors.indexOf("#work") >= 0, "nav links to #work");
    const link = d.querySelector('.nav-links a[href="#work"]');
    ok(/Work/i.test(link.textContent), "nav item labelled Work");
  });

  test("section order places work after services and before pricing", () => {
    const ids = Array.from(d.querySelectorAll("section[id]")).map((s) => s.id);
    eq(ids.length, 10, "ten anchor sections total");
    ok(ids.indexOf("services") < ids.indexOf("work"), "services before work");
    ok(ids.indexOf("work") < ids.indexOf("pricing"), "work before pricing");
  });

  test("portfolio container renders a featured project and grid cards", () => {
    const featured = d.querySelector(".portfolio-featured-card");
    notNull(featured, "featured card rendered");
    ok(/Vision 61 Studios/.test(featured.textContent), "featured project is the studio website");
    eq(d.querySelectorAll(".portfolio-grid .portfolio-card").length, 3, "three grid projects rendered");
    eq(d.querySelectorAll(".portfolio-badge").length, 4, "four projects labelled");
  });

  test("projects are honestly labelled as internal or concept", () => {
    const badges = Array.from(d.querySelectorAll(".portfolio-badge")).map((b) => b.textContent.trim());
    ok(badges.some((t) => /internal/i.test(t)), "internal project labelled");
    ok(badges.filter((t) => t === "Concept").length === 3, "three concept projects labelled Concept");
    ok(!/client/i.test(badges.join(" ")), "no project claimed as client work");
    ok(!/Aroma Kitchen|ShineGlow|30\+/.test(html), "no fabricated clients or stats");
  });

  test("featured project links to the live studio site", () => {
    const cta = d.querySelector(".portfolio-featured-body a[href]");
    notNull(cta, "featured CTA present");
    eq(cta.getAttribute("href"), "https://vision61studios.online/", "featured links to live site");
    ok(cta.getAttribute("rel") === "noopener", "external link is safe");
  });

  test("every portfolio image exists on disk as WebP and is lazy loaded", () => {
    const imgs = Array.from(d.querySelectorAll(".portfolio-card img, .portfolio-featured-card img"));
    ok(imgs.length >= 4, "at least four portfolio images");
    imgs.forEach((img) => {
      const src = img.getAttribute("src");
      ok(src.startsWith("images/portfolio/"), "image inside images/portfolio: " + src);
      ok(fs.existsSync(path.join(siteDir, src)), "image file exists: " + src);
      ok(/\.webp$/.test(src), "image is WebP: " + src);
      ok(img.getAttribute("loading") === "lazy", "portfolio image lazy loads");
      ok(Number(img.getAttribute("width")) > 0 && Number(img.getAttribute("height")) > 0, "width/height present");
      ok(/Screenshot of/.test(img.getAttribute("alt")), "meaningful alt text");
    });
  });

  test("portfolio CTA links to existing contact and audit sections", () => {
    const actions = Array.from(d.querySelectorAll(".portfolio-cta a")).map((a) => a.getAttribute("href"));
    ok(actions.indexOf("#contact") >= 0, "Start a project links to contact");
    ok(actions.indexOf("#audit") >= 0, "Get a free audit links to audit");
  });
});

suite("website portfolio — filters and modal", () => {
  test("category filters match only categories with real projects", () => {
    const labels = Array.from(d.querySelectorAll(".portfolio-filter")).map((b) => b.textContent.trim());
    ok(labels[0] === "All", "first filter is All");
    ok(labels.indexOf("Websites") >= 0, "Websites filter present");
    ok(labels.indexOf("Branding") >= 0, "Branding filter present");
    ok(labels.indexOf("Content") < 0, "no empty Content filter");
    ok(labels.indexOf("Social media") < 0, "no empty Social media filter");
    ok(labels.indexOf("Digital marketing") < 0, "no empty Digital marketing filter");
    ok(labels.indexOf("Audits") < 0, "no empty Audits filter");
  });

  test("filtering by Branding shows the three concepts and hides the featured site", () => {
    const { dom } = makeDom();
    const w = dom.window;
    const branding = w.document.querySelectorAll(".portfolio-filter")[2];
    click(w, branding);
    ok(w.document.getElementById("portfolio-featured").hidden, "featured hidden under Branding");
    eq(w.document.querySelectorAll(".portfolio-grid .portfolio-card").length, 3, "three branding cards");
    ok(!w.document.getElementById("portfolio-grid").hidden, "grid visible");
    const titles = Array.from(w.document.querySelectorAll(".portfolio-card h3")).map((h) => h.textContent);
    ok(titles.every((t) => /Brand Direction/.test(t)), "only brand direction concepts shown");
  });

  test("filtering by Websites keeps the featured site and hides the grid", () => {
    const { dom } = makeDom();
    const w = dom.window;
    const websites = w.document.querySelectorAll(".portfolio-filter")[1];
    click(w, websites);
    ok(!w.document.getElementById("portfolio-featured").hidden, "featured visible under Websites");
    eq(w.document.querySelectorAll(".portfolio-grid .portfolio-card").length, 0, "no grid cards for websites");
    ok(w.document.getElementById("portfolio-grid").hidden, "empty grid hidden");
  });

  test("returning to All restores the full portfolio", () => {
    const { dom } = makeDom();
    const w = dom.window;
    click(w, w.document.querySelectorAll(".portfolio-filter")[2]);
    click(w, w.document.querySelectorAll(".portfolio-filter")[0]);
    ok(!w.document.getElementById("portfolio-featured").hidden, "featured restored");
    eq(w.document.querySelectorAll(".portfolio-grid .portfolio-card").length, 3, "three cards restored");
  });

  test("View project opens the modal with details and Escape closes it", () => {
    const { dom, winErrors } = makeDom();
    const w = dom.window;
    const btn = w.document.querySelector(".portfolio-card .portfolio-view");
    notNull(btn, "View project button present");
    click(w, btn);
    const modal = w.document.getElementById("portfolio-modal");
    notNull(modal, "modal built");
    ok(!modal.hidden, "modal opened");
    ok(/Kente Brand Direction/.test(w.document.getElementById("portfolio-modal-title").textContent), "modal shows project title");
    const modalHtml = modal.innerHTML;
    ok(/Services/.test(modalHtml), "modal lists services");
    ok(/Brand Strategy/.test(modalHtml), "modal lists a real service tag");
    w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    ok(modal.hidden, "modal closed on Escape");
    eq(winErrors.length, 0, "no window errors during modal use");
  });

  test("concept projects in the modal offer Start a project instead of a fake link", () => {
    const { dom } = makeDom();
    const w = dom.window;
    click(w, w.document.querySelector(".portfolio-card .portfolio-view"));
    const cta = w.document.querySelector(".portfolio-modal-cta");
    notNull(cta, "modal CTA present");
    eq(cta.getAttribute("href"), "#contact", "concept CTA links to contact");
    ok(/Start a project/.test(cta.textContent), "concept CTA label is Start a project");
  });
});

suite("website portfolio — no regressions", () => {
  test("mobile burger menu still opens the nav", () => {
    const burger = d.getElementById("nav-burger");
    const links = d.getElementById("nav-links");
    click(d.defaultView, burger);
    ok(links.classList.contains("open"), "menu opens");
    ok(burger.getAttribute("aria-expanded") === "true", "aria-expanded true");
  });

  test("WhatsApp and email CTAs still present and work", () => {
    const wa = d.querySelector('a[href^="https://wa.me/233201599949"]');
    const mail = d.querySelector('a[href^="mailto:hello@vision61studios.online"]');
    notNull(wa, "WhatsApp CTA to real number exists");
    notNull(mail, "email CTA to studio email exists");
    ok(/\?text=/.test(wa.getAttribute("href")), "WhatsApp link pre-filled");
  });

  test("instant audit form and contact form still present", () => {
    notNull(d.getElementById("ia-form"), "instant audit form exists");
    notNull(d.getElementById("contact-form"), "contact form exists");
  });

  test("GA4 tag installed exactly once with the correct ID", () => {
    eq((html.match(/googletagmanager\.com\/gtag\/js\?id=G-SPVGPEL8W5/g) || []).length, 1, "gtag exactly once");
    ok(!/chrisxie12\.github\.io/.test(html), "no old GitHub Pages domain");
  });

  test("portfolio JS runs cleanly and markup stays clean", () => {
    const { winErrors } = makeDom();
    eq(winErrors.length, 0, "no window JS errors");
    assertCleanHTML(html, "website index.html");
    const dom2 = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
    dom2.window.eval(js);
    assertCleanHTML(dom2.window.document.getElementById("work").innerHTML, "portfolio section");
  });

  test("no CRM or Worker files reference the portfolio", () => {
    const crmHtml = fs.readFileSync(path.join(siteDir, "crm", "index.html"), "utf8");
    const crmApp = fs.readFileSync(path.join(siteDir, "crm", "js", "app.js"), "utf8");
    const workerJs = fs.readFileSync(path.join(siteDir, "worker", "src", "index.js"), "utf8");
    ["portfolio-featured", "portfolio-grid", "portfolio-filter", "portfolio_project_view"].forEach((s) => {
      ok(crmHtml.indexOf(s) < 0, "crm/index.html clean of " + s);
      ok(crmApp.indexOf(s) < 0, "crm app clean of " + s);
      ok(workerJs.indexOf(s) < 0, "worker clean of " + s);
    });
  });
});