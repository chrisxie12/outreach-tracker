/* VISION 61 website — structural smoke tests (V2).
   Verifies the public landing page loads, has all core sections, the
   exact pricing catalog, honest example labeling, the contact CTAs,
   and that its JS runs and the form opens WhatsApp. */
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
    ok(/Ghanaian Businesses/i.test(d.title), "title mentions Ghanaian Businesses");
    notNull(d.querySelector('meta[name="description"]'), "meta description present");
    ok(/Ghana/i.test(d.querySelector('meta[name="description"]').content), "description mentions Ghana");
  });

  test("all nine sections render with primary nav anchors", () => {
    const ids = Array.from(d.querySelectorAll("section[id]")).map((s) => s.id);
    eq(ids.length, 9, "nine sections");
    const anchors = Array.from(d.querySelectorAll(".nav-links a")).map((a) => a.getAttribute("href"));
    ["services", "pricing", "audit", "about"].forEach((id) =>
      ok(anchors.indexOf("#" + id) >= 0, "nav links to #" + id)
    );
  });

  test("service catalog has 12 cards with exact pricing and days", () => {
    const cards = Array.from(d.querySelectorAll(".svc-card"));
    eq(cards.length, 12, "twelve service cards");
    cards.forEach((c) => {
      const price = c.querySelector(".price");
      const time = c.querySelector(".time");
      ok(price && /^From GH₵[\d,]+$/.test(price.textContent.trim()), "price is 'From GH₵X'");
      ok(time && /^≈\d+ day[s]?$/.test(time.textContent.trim()), "time is '≈N day(s)'");
    });
  });

  test("website development shows GH₵3,500 and 14 days (not 7)", () => {
    const card = d.querySelector('.svc-card[data-service="website-development"]');
    notNull(card, "website-development card exists");
    eq(card.querySelector(".price").textContent.trim(), "From GH₵3,500", "price GH₵3,500");
    eq(card.querySelector(".time").textContent.trim(), "≈14 days", "14 days");
  });

  test("pricing packages, why cards, process steps and FAQ present", () => {
    eq(d.querySelectorAll(".pkg-card").length, 3, "three pricing packages");
    eq(d.querySelectorAll(".pkg-card.featured").length, 1, "one featured package");
    eq(d.querySelectorAll(".why-card").length, 5, "five why cards");
    eq(d.querySelectorAll(".proc").length, 5, "five process steps");
    eq(d.querySelectorAll(".faq-item").length, 7, "seven FAQ items");
  });

  test("examples are honestly labeled, no fake clients or stats", () => {
    ok(/Example only/.test(html), "example cards labeled");
    ok(/Demo/.test(html) && /Sample/.test(html), "demo/sample markers present");
    ok(!/Aroma Kitchen/.test(html), "no fake testimonial brand");
    ok(!/ShineGlow/.test(html), "no fake testimonial brand");
    ok(!/30\+ businesses audited/.test(html), "no fabricated stat");
  });

  test("who-we-help uses real, honest image cards", () => {
    const cards = Array.from(d.querySelectorAll(".who-card"));
    eq(cards.length, 8, "eight who cards");
    cards.forEach((c) => {
      const img = c.querySelector("img");
      notNull(img, "card has an image");
      ok(/^Illustrative photo/.test(img.getAttribute("alt")), "alt text is honestly illustrative");
      const src = img.getAttribute("src");
      ok(src.startsWith("images/") && fs.existsSync(path.join(siteDir, src)), "image file exists: " + src);
    });
    const note = d.querySelector(".who-note");
    notNull(note, "who note present");
    ok(/not client work/.test(note.textContent), "who note says photos are not client work");
  });

  test("decorative background images exist", () => {
    ok(fs.existsSync(path.join(siteDir, "images", "bg-hero.jpg")), "hero background image exists");
    ok(fs.existsSync(path.join(siteDir, "images", "bg-cta.jpg")), "final CTA background image exists");
  });

  test("contact CTAs link out to WhatsApp and email", () => {
    const wa = d.querySelector('a[href^="https://wa.me/233201599949"]');
    const mail = d.querySelector('a[href^="mailto:hello@vision61studios.com"]');
    notNull(wa, "WhatsApp CTA to real number exists");
    notNull(mail, "mailto CTA to studio email exists");
    ok(/\?text=/.test(wa.getAttribute("href")), "WhatsApp link has a pre-filled message");
  });

  test("page markup contains no garbage tokens", () => {
    assertCleanHTML(html, "website index.html");
  });

  test("website JS runs without errors", () => {
    eq(winErrors.length, 0, "no window JS errors");
  });

  test("burger toggles the mobile menu", () => {
    const burger = d.getElementById("nav-burger");
    const links = d.getElementById("nav-links");
    notNull(burger, "burger button exists");
    burger.dispatchEvent(new dom.window.Event("click", { bubbles: true, cancelable: true }));
    ok(links.classList.contains("open"), "menu opens on click");
    ok(burger.getAttribute("aria-expanded") === "true", "aria-expanded set true");
  });

  test("contact form opens WhatsApp with pre-filled details and no fake backend", () => {
    let opened = null;
    dom.window.open = (url) => { opened = url; return null; };
    const name = d.getElementById("cf-name");
    const message = d.getElementById("cf-message");
    name.value = "Ama";
    message.value = "I need a website";
    d.getElementById("contact-form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    ok(opened, "form submit opened a link");
    ok(/wa\.me\/233201599949/.test(opened), "WhatsApp uses the real number");
    ok(decodeURIComponent(opened).indexOf("Ama") >= 0, "name included in message");
    ok(decodeURIComponent(opened).indexOf("I need a website") >= 0, "message included");
    const status = d.getElementById("form-status");
    notNull(status, "status element exists");
    ok(/Opening WhatsApp/.test(status.textContent), "status confirms WhatsApp open");
    notNull(d.querySelector(".form-fallback"), "mailto fallback link provided");
    notNull(d.querySelector('a[href^="mailto:hello@vision61studios.com"]'), "no fake backend, email used");
  });

  test("footer year is filled in by JS", () => {
    eq(d.getElementById("year").textContent, String(new Date().getFullYear()), "year equals current year");
  });
});
