/* VISION 61 website — multi-department studio structure tests.
   Verifies the expanded homepage (new hero, departments grid, dropdown nav)
   and the six department pages: meta/canonical on the custom domain, GA4 tag,
   per-department services, illustrative placeholder galleries, the shared
   process, WhatsApp/email CTAs, and that script.js runs cleanly on each page. */
"use strict";
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const { suite, test, ok, eq, notNull, assertCleanHTML } = require("./framework");

const siteDir = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(siteDir, "index.html"), "utf8");
const css = fs.readFileSync(path.join(siteDir, "styles.css"), "utf8");
const js = fs.readFileSync(path.join(siteDir, "script.js"), "utf8");

const DEPTS = [
  { slug: "web", name: "Web & Digital", services: ["Website Design & Development", "Landing Pages", "Business Websites", "UI/UX Design", "Website Maintenance"] },
  { slug: "content", name: "Content Creation", services: ["Social Media Content", "Brand Content", "Promotional Content", "Short-form Video", "Content Strategy"] },
  { slug: "photography", name: "Photography", services: ["Portrait Photography", "Event Photography", "Product Photography", "Mobile Photography", "Lifestyle Photography"] },
  { slug: "videography", name: "Videography", services: ["Event Videography", "Promotional Videos", "Social Media Reels", "Mobile Videography", "Interviews & Brand Stories"] },
  { slug: "design", name: "Graphic Design", services: ["Logos & Brand Identity", "Social Media Designs", "Flyers & Posters", "Business Cards", "Digital Marketing Graphics"] },
  { slug: "branding", name: "Brand & Social", services: ["Social Media Management", "Personal Branding", "Digital Marketing", "Creative Direction", "Tech & Digital Solutions"] },
];

function loadPage(slug, withGtag) {
  const file = path.join(siteDir, slug, "index.html");
  const pageHtml = fs.readFileSync(file, "utf8");
  const dom = new JSDOM(pageHtml, { runScripts: "outside-only", pretendToBeVisual: true });
  dom.window.document.head.insertAdjacentHTML("beforeend", "<style>" + css + "</style>");
  const winErrors = [];
  dom.window.addEventListener("error", (e) => winErrors.push(String((e && e.message) || e)));
  if (withGtag) dom.window.gtag = () => {};
  dom.window.eval(js);
  return { html: pageHtml, dom, winErrors };
}

suite("website departments — homepage expansion", () => {
  const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
  dom.window.document.head.insertAdjacentHTML("beforeend", "<style>" + css + "</style>");
  const winErrors = [];
  dom.window.addEventListener("error", (e) => winErrors.push(String((e && e.message) || e)));
  dom.window.eval(js);
  const d = dom.window.document;

  test("hero has the new headline and Creative. Digital. Visual. tagline", () => {
    const h1 = d.querySelector(".hero h1");
    notNull(h1, "hero h1 present");
    ok(/We build digital experiences/.test(h1.textContent), "new headline present");
    ok(/create visual stories/.test(h1.textContent), "headline covers visual stories");
    ok(/show up better/.test(h1.textContent), "headline covers brands showing up");
    const tag = d.querySelector(".hero .hero-tagline");
    notNull(tag, "tagline element present");
    eq(tag.textContent.trim(), "Creative. Digital. Visual.", "tagline exact");
  });

  test("departments grid has six cards linking to each department page", () => {
    const cards = Array.from(d.querySelectorAll(".dept-card"));
    eq(cards.length, 6, "six department cards");
    DEPTS.forEach((dept) => {
      const card = cards.find((c) => c.getAttribute("href") === dept.slug + "/");
      notNull(card, "card links to " + dept.slug + "/");
      ok(card.textContent.indexOf(dept.name) >= 0, "card labeled " + dept.name);
    });
  });

  test("homepage still has all core sections and catalog (no regression)", () => {
    eq(d.querySelectorAll("section[id]").length, 10, "ten anchor sections preserved");
    eq(d.querySelectorAll(".svc-card").length, 12, "twelve service cards preserved");
    eq(d.querySelectorAll(".pkg-card").length, 3, "three pricing packages preserved");
    eq(d.querySelectorAll(".faq-item").length, 7, "seven FAQ items preserved");
    notNull(d.getElementById("ia-form"), "instant audit tool preserved");
    notNull(d.getElementById("contact-form"), "contact form preserved");
    ok(!/NaN|undefined|Infinity/.test(d.getElementById("ia-result").textContent), "no garbage in results");
  });

  test("nav has a Departments dropdown with all six links", () => {
    const toggle = d.querySelector(".drop-toggle");
    notNull(toggle, "dropdown toggle present");
    const links = Array.from(d.querySelectorAll(".nav-item .drop-menu a")).map((a) => a.getAttribute("href"));
    DEPTS.forEach((dept) => ok(links.indexOf(dept.slug + "/") >= 0, "dropdown links " + dept.slug));
    toggle.dispatchEvent(new dom.window.Event("click", { bubbles: true, cancelable: true }));
    ok(d.querySelector(".nav-item").classList.contains("open"), "dropdown opens on click");
    eq(toggle.getAttribute("aria-expanded"), "true", "aria-expanded reflects open");
    d.dispatchEvent(new dom.window.Event("click", { bubbles: true, cancelable: true }));
    ok(!d.querySelector(".nav-item").classList.contains("open"), "dropdown closes on outside click");
  });

  test("footer links to all six departments", () => {
    const links = Array.from(d.querySelectorAll(".footer-links[aria-label='Departments'] a")).map((a) => a.getAttribute("href"));
    DEPTS.forEach((dept) => ok(links.indexOf(dept.slug + "/") >= 0, "footer links " + dept.slug));
  });

  test("homepage JS still runs cleanly with the dropdown wiring", () => {
    eq(winErrors.length, 0, "no window JS errors");
  });
});

suite("website departments — page structure", () => {
  DEPTS.forEach((dept) => {
    test(dept.name + " page has correct meta, canonical and GA4 tag", () => {
      const { html: pageHtml } = loadPage(dept.slug);
      const url = "https://vision61studios.online/" + dept.slug + "/";
      const dom = new JSDOM(pageHtml, { runScripts: "outside-only" });
      const d = dom.window.document;
      ok(/Vision 61/.test(d.title), "title mentions Vision 61");
      ok(d.title.indexOf(dept.name) >= 0, "title mentions " + dept.name);
      const desc = d.querySelector('meta[name="description"]');
      notNull(desc, "meta description present");
      ok(/Ghana/.test(desc.getAttribute("content")), "description mentions Ghana");
      eq(d.querySelector('link[rel="canonical"]').getAttribute("href"), url, "canonical is custom domain");
      eq(d.querySelector('meta[property="og:url"]').getAttribute("content"), url, "og:url matches canonical");
      ok(/G-SPVGPEL8W5/.test(pageHtml), "GA4 ID present");
      eq((pageHtml.match(/googletagmanager\.com\/gtag\/js\?id=G-SPVGPEL8W5/g) || []).length, 1, "gtag exactly once");
      const head = pageHtml.slice(0, pageHtml.indexOf("</head>"));
      ok(/gtag\('config',\s*'G-SPVGPEL8W5'\)/.test(head), "config call in head");
      ok(pageHtml.indexOf("chrisxie12.github.io") < 0, "no GitHub Pages URL");
    });

    test(dept.name + " page hero, services, gallery, process and CTA", () => {
      const { dom, winErrors } = loadPage(dept.slug);
      const d = dom.window.document;
      eq(d.querySelector(".dept-hero h1").textContent.trim(), dept.name, "hero name");
      ok(d.querySelector(".dept-hero .lede").textContent.trim().length > 20, "one-line description present");

      const cards = Array.from(d.querySelectorAll("#services .svc-card"));
      eq(cards.length, 5, "five services");
      dept.services.forEach((s) => {
        ok(cards.some((c) => c.querySelector("h3").textContent.trim() === s), "service listed: " + s);
      });

      const gallery = Array.from(d.querySelectorAll("#gallery .who-card"));
      eq(gallery.length, 6, "six gallery placeholders");
      gallery.forEach((c) => {
        const img = c.querySelector("img");
        notNull(img, "gallery card has image");
        ok(/^Illustrative photo/.test(img.getAttribute("alt")), "alt honestly illustrative");
        const src = img.getAttribute("src");
        ok(src.startsWith("../images/") && fs.existsSync(path.join(siteDir, src.replace("../", ""))), "image exists: " + src);
      });
      ok(/Illustrative placeholders/.test(d.querySelector("#gallery .who-note").textContent), "placeholders clearly marked");

      const steps = Array.from(d.querySelectorAll("#process .proc h3")).map((h) => h.textContent.trim());
      eq(steps.join(" → "), "Discovery → Concept → Delivery → Support", "process flow exact");

      const wa = d.querySelector('#contact a[href^="https://wa.me/233201599949"]');
      const mail = d.querySelector('#contact a[href^="mailto:hello@vision61studios.online"]');
      notNull(wa, "WhatsApp CTA present");
      notNull(mail, "email CTA present");

      eq(winErrors.length, 0, "script.js runs without errors on the page");
    });

    test(dept.name + " page has clean markup and shared nav/dropdown", () => {
      const { html: pageHtml, dom } = loadPage(dept.slug);
      const d = dom.window.document;
      assertCleanHTML(pageHtml, "department " + dept.slug);
      ok(pageHtml.indexOf('<link rel="stylesheet" href="../styles.css">') >= 0, "reuses shared stylesheet");
      ok(pageHtml.indexOf('<script src="../script.js"></script>') >= 0, "reuses shared script");
      const drop = Array.from(d.querySelectorAll(".nav-item .drop-menu a")).map((a) => a.getAttribute("href"));
      DEPTS.forEach((other) => ok(drop.indexOf("../" + other.slug + "/") >= 0, "dropdown links " + other.slug));
      ok(d.querySelector(".brand").getAttribute("href") === "../", "brand links home");
    });
  });
});

suite("website departments — analytics on department pages", () => {
  test("service card clicks fire service_interest with the displayed name", () => {
    const { dom } = loadPage("web", true);
    const events = [];
    dom.window.gtag = (...args) => events.push(args);
    dom.window.document.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    const card = dom.window.document.querySelector("#services .svc-card");
    card.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    const hit = events.find((a) => a[0] === "event" && a[1] === "service_interest");
    notNull(hit, "service_interest fired");
    eq(hit[2].service_name, "Website Design & Development", "uses displayed service name");
  });

  test("WhatsApp CTA clicks fire contact_whatsapp with location contact", () => {
    const { dom } = loadPage("photography", true);
    const events = [];
    dom.window.gtag = (...args) => events.push(args);
    const wa = dom.window.document.querySelector('#contact a[href^="https://wa.me/233201599949"]');
    wa.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    const hit = events.find((a) => a[0] === "event" && a[1] === "contact_whatsapp");
    notNull(hit, "contact_whatsapp fired");
    eq(hit[2].location, "contact", "location detected as contact");
  });
});

suite("website departments — sitemap", () => {
  test("sitemap lists the homepage and all six department pages", () => {
    const sitemap = fs.readFileSync(path.join(siteDir, "sitemap.xml"), "utf8");
    const urls = Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]);
    eq(urls.length, 7, "seven URLs");
    eq(urls[0], "https://vision61studios.online/", "homepage first");
    DEPTS.forEach((dept) => {
      ok(urls.indexOf("https://vision61studios.online/" + dept.slug + "/") >= 0, "sitemap includes " + dept.slug);
    });
    ok(!/github\.io/.test(sitemap), "no GitHub Pages URLs in sitemap");
  });
});