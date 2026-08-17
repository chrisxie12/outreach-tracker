/* QA Phase 6 — Contact Discovery & Public Business Contact Enrichment.
   Deterministic website scanner: phone/WhatsApp/email/social/contact-form
   extraction with source URLs + confidence, Ghana normalization, bounded
   crawl, honest blocked/error statuses, no fabrication, no overwriting of
   manual/Google data. */
"use strict";
const { suite, test, assert, eq, ok, isNull, notNull, approx } = require("./framework");
const { freshApp } = require("./harness");

const page = (body) => ({ ok: true, status: 200, text: async () => body });

function stubFetch(app, handler) {
  app.window.fetch = (url, opts) => {
    if (opts && opts.mode === "no-cors") {
      return handler.noCors ? handler.noCors(String(url)) : Promise.resolve({ ok: true, status: 0 });
    }
    return handler.fetch(String(url));
  };
}

function extract(app, html) {
  return app.V61.ContactDiscovery.extractFromHtml(html, "https://b.example/", "Biz");
}

function analyzeStub(app, html) {
  app.window.fetch = (url, opts) => {
    if (opts && opts.mode === "no-cors") return Promise.resolve({ ok: true, status: 0 });
    return Promise.resolve(page(html));
  };
}

suite("Phase 6 — Contact Discovery: extraction rules", () => {
  test("tel: link gives a HIGH-confidence normalized phone", () => {
    const app = freshApp();
    const r = extract(app, '<a href="tel:+233 24 111 1111">Call</a>');
    notNull(r.channels.phone);
    eq(r.channels.phone.value, "233241111111");
    eq(r.channels.phone.confidence, "HIGH");
  });

  test("mailto: link gives a HIGH-confidence email", () => {
    const app = freshApp();
    const r = extract(app, '<a href="mailto:hello@biz.gh">Email</a>');
    notNull(r.channels.email);
    eq(r.channels.email.value, "hello@biz.gh");
    eq(r.channels.email.confidence, "HIGH");
  });

  test("wa.me link gives a WhatsApp channel", () => {
    const app = freshApp();
    const r = extract(app, '<a href="https://wa.me/233241111111">Chat</a>');
    notNull(r.channels.whatsapp);
    eq(r.channels.whatsapp.value, "233241111111");
  });

  test("api.whatsapp.com/send?phone= gives a WhatsApp channel", () => {
    const app = freshApp();
    const r = extract(app, '<a href="https://api.whatsapp.com/send?phone=233241111111">WA</a>');
    notNull(r.channels.whatsapp);
    eq(r.channels.whatsapp.value, "233241111111");
  });

  test("Instagram profile link is detected", () => {
    const app = freshApp();
    const r = extract(app, '<a href="https://www.instagram.com/bizgh/">IG</a>');
    notNull(r.channels.instagram);
    ok(/bizgh/.test(r.channels.instagram.handle));
  });

  test("Facebook page is detected but sharer links are ignored", () => {
    const app = freshApp();
    const r = extract(app, '<a href="https://facebook.com/sharer.php">share</a><a href="https://www.facebook.com/BizGH">page</a>');
    notNull(r.channels.facebook);
    eq(r.channels.facebook.value, "https://www.facebook.com/BizGH");
  });

  test("TikTok @handle is detected", () => {
    const app = freshApp();
    const r = extract(app, '<a href="https://www.tiktok.com/@bizgh">TT</a>');
    notNull(r.channels.tiktok);
    eq(r.channels.tiktok.value, "https://www.tiktok.com/@bizgh");
  });

  test("LinkedIn company profile is detected", () => {
    const app = freshApp();
    const r = extract(app, '<a href="https://www.linkedin.com/company/bizgh">LI</a>');
    notNull(r.channels.linkedin);
    eq(r.channels.linkedin.value, "https://www.linkedin.com/company/bizgh");
  });

  test("a real <form> is detected as a contact form with an absolute URL", () => {
    const app = freshApp();
    const r = extract(app, '<form action="/contact"><textarea></textarea></form>');
    notNull(r.contactForm);
    eq(r.contactForm.url, "https://b.example/contact");
    eq(r.contactForm.confidence, "HIGH");
  });

  test("an explicit contact-page link is a MEDIUM-confidence contact form", () => {
    const app = freshApp();
    const r = extract(app, '<a href="/contact-us">Contact us</a>');
    notNull(r.contactForm);
    eq(r.contactForm.url, "https://b.example/contact-us");
    eq(r.contactForm.confidence, "MEDIUM");
  });

  test("multiple channels are extracted from one page", () => {
    const app = freshApp();
    const r = extract(app,
      '<a href="tel:+233241111111">C</a><a href="mailto:info@biz.gh">M</a>' +
      '<a href="https://wa.me/233241111111">W</a><a href="https://instagram.com/bizgh">IG</a>' +
      '<form action="#"><input type="email"></form>');
    notNull(r.channels.phone);
    notNull(r.channels.email);
    notNull(r.channels.whatsapp);
    notNull(r.channels.instagram);
    notNull(r.contactForm);
  });

  test("Ghana phone normalization: national and international forms", () => {
    const app = freshApp();
    const CD = app.V61.ContactDiscovery;
    eq(CD.normalizeGhanaPhone("0241111111"), "233241111111");
    eq(CD.normalizeGhanaPhone("+233 24 111 1111"), "233241111111");
    eq(CD.normalizeGhanaPhone("233241111111"), "233241111111");
    eq(CD.normalizeGhanaPhone("0302111111"), "233302111111");
    eq(CD.normalizeGhanaPhone("0501234567"), "233501234567");
  });

  test("no phone guessing: arbitrary digit runs are never phones", () => {
    const app = freshApp();
    const CD = app.V61.ContactDiscovery;
    isNull(CD.normalizeGhanaPhone("12345678"));
    isNull(CD.normalizeGhanaPhone("9911111111"));
    isNull(CD.normalizeGhanaPhone("1234567890123"));
    const r = extract(app, "<p>Reference #12345678 · total 1234567890</p>");
    isNull(r.channels.phone);
  });

  test("no WhatsApp inference from a phone number", () => {
    const app = freshApp();
    const r = extract(app, '<a href="tel:+233241111111">Call us</a><p>024 111 1111</p>');
    notNull(r.channels.phone);
    isNull(r.channels.whatsapp);
  });

  test("no social guessing from plain text or content links", () => {
    const app = freshApp();
    const text = extract(app, "<p>Follow us on Instagram at instagram.com/something</p>");
    isNull(text.channels.instagram);
    const reel = extract(app, '<a href="https://www.instagram.com/reel/CxYz/">reel</a>');
    isNull(reel.channels.instagram);
  });

  test("every channel keeps its source URL", () => {
    const app = freshApp();
    const r = extract(app, '<a href="https://wa.me/233241111111">W</a>');
    eq(r.channels.whatsapp.sourceUrl, "https://wa.me/233241111111");
    const tel = extract(app, '<a href="tel:+233241111111">C</a>');
    eq(tel.channels.phone.sourceUrl, "https://b.example/");
  });

  test("confidence is HIGH for explicit links, MEDIUM for plain text", () => {
    const app = freshApp();
    const tel = extract(app, '<a href="tel:+233241111111">C</a>');
    eq(tel.channels.phone.confidence, "HIGH");
    const text = extract(app, "<p>Call 024 111 1111</p>");
    eq(text.channels.phone.confidence, "MEDIUM");
  });

  test("no fabricated placeholder emails", () => {
    const app = freshApp();
    const r = extract(app, "<p>Email us at user@example.com or send image@2x.png</p>");
    isNull(r.channels.email);
  });
});

suite("Phase 6 — Contact Discovery: status & best contact", () => {
  test("statusFor: found / partial / none", () => {
    const app = freshApp();
    const CD = app.V61.ContactDiscovery;
    eq(CD.statusFor({ whatsapp: { value: "1" }, email: { value: "a@b.gh" } }), "found");
    eq(CD.statusFor({ instagram: { value: "x" }, contactForm: { url: "y" } }), "partial");
    eq(CD.statusFor({}), "none");
  });

  test("best-contact priority: WhatsApp > Phone > Email > social > form", () => {
    const app = freshApp();
    const CD = app.V61.ContactDiscovery;
    eq(CD.bestContact({ phone: { value: "1" }, whatsapp: { value: "2" }, email: { value: "3" } }), "whatsapp");
    eq(CD.bestContact({ phone: { value: "1" }, email: { value: "3" } }), "phone");
    eq(CD.bestContact({ email: { value: "3" }, instagram: { value: "4" } }), "email");
    eq(CD.bestContact({ facebook: { value: "5" }, tiktok: { value: "6" } }), "facebook");
    eq(CD.bestContact({ contactForm: { url: "c" }, linkedin: { value: "l" } }), "contactForm");
    isNull(CD.bestContact({}));
  });

  test("presentChannels lists only real channels", () => {
    const app = freshApp();
    const CD = app.V61.ContactDiscovery;
    const keys = CD.presentChannels({ whatsapp: { value: "1" }, phone: { value: null }, instagram: { value: "x" }, contactForm: { url: "c" } });
    ok(keys.indexOf("whatsapp") >= 0);
    ok(keys.indexOf("phone") < 0);
    ok(keys.indexOf("instagram") >= 0);
    ok(keys.indexOf("contactForm") >= 0);
  });
});

suite("Phase 6 — Contact Discovery: live analyze (stubbed fetch)", () => {
  test("business with no website -> status none, nothing scanned", async () => {
    const app = freshApp();
    const r = await app.V61.ContactDiscovery.analyze({ id: "b", name: "X" });
    eq(r.status, "none");
    isNull(r.phone);
    isNull(r.email);
  });

  test("invalid website URL -> status error", async () => {
    const app = freshApp();
    const r = await app.V61.ContactDiscovery.analyze({ id: "b", name: "X", website: "not a url at all!!" });
    eq(r.status, "error");
  });

  test("blocked site -> status blocked, honest message, no fabricated channels", async () => {
    const app = freshApp();
    stubFetch(app, {
      fetch: () => Promise.reject(new TypeError("Failed to fetch")),
      noCors: () => Promise.resolve({ ok: true, status: 0 }),
    });
    const r = await app.V61.ContactDiscovery.analyze({ id: "b", name: "B", website: "https://b.example" });
    eq(r.status, "blocked");
    ok(/blocks browser access|block/i.test(r.message), "message mentions the block");
    isNull(r.phone);
    isNull(r.email);
    isNull(r.whatsapp);
  });

  test("blocked != none: a blocked site is never reported as 'no contact'", async () => {
    const app = freshApp();
    stubFetch(app, {
      fetch: () => Promise.reject(new TypeError("Failed to fetch")),
      noCors: () => Promise.resolve({ ok: true, status: 0 }),
    });
    const r = await app.V61.ContactDiscovery.analyze({ id: "b", name: "B", website: "https://b.example" });
    eq(r.status, "blocked");
    ok(r.status !== "none", "blocked must not collapse to none");
    ok(!/no public contact/.test(r.message), "message must not claim no contacts exist");
  });

  test("unreachable site -> status error", async () => {
    const app = freshApp();
    stubFetch(app, {
      fetch: () => Promise.reject(new TypeError("net::ERR_NAME_NOT_RESOLVED")),
      noCors: () => Promise.reject(new TypeError("net::ERR_NAME_NOT_RESOLVED")),
    });
    const r = await app.V61.ContactDiscovery.analyze({ id: "b", name: "B", website: "https://b.example" });
    eq(r.status, "error");
  });

  test("HTTP 404 -> status error mentioning the code", async () => {
    const app = freshApp();
    app.window.fetch = (url, opts) => {
      if (opts && opts.mode === "no-cors") return Promise.resolve({ ok: true, status: 0 });
      return Promise.resolve({ ok: false, status: 404, text: async () => "not found" });
    };
    const r = await app.V61.ContactDiscovery.analyze({ id: "b", name: "B", website: "https://b.example" });
    eq(r.status, "error");
    ok(/404/.test(r.message));
  });

  test("multi-page crawl merges channels and keeps source pages", async () => {
    const app = freshApp();
    app.window.fetch = (url, opts) => {
      const u = String(url);
      if (opts && opts.mode === "no-cors") return Promise.resolve({ ok: true, status: 0 });
      if (/\/contact/.test(u)) return Promise.resolve(page('<html><body><a href="mailto:sales@x.gh">Mail</a></body></html>'));
      if (/example\.com/.test(u)) return Promise.resolve(page('<html><body><a href="/contact">Contact</a><a href="tel:+233241111111">Call</a></body></html>'));
      return Promise.resolve(page("<html><body>hi</body></html>"));
    };
    const r = await app.V61.ContactDiscovery.analyze({ id: "b", name: "M", website: "https://multi.example.com" });
    eq(r.status, "found");
    eq(r.phone.value, "233241111111");
    eq(r.email.value, "sales@x.gh");
    ok(r.phone.sourceUrl, "phone has a source URL");
    ok(r.email.sourceUrl, "email has a source URL");
  });

  test("scan result never contains NaN/undefined/Infinity", async () => {
    const app = freshApp();
    analyzeStub(app, '<html><body><a href="tel:+233241111111">C</a><a href="mailto:x@y.gh">M</a></body></html>');
    const r = await app.V61.ContactDiscovery.analyze({ id: "b", name: "N", website: "https://n.example" });
    ok(!/NaN|undefined|Infinity/.test(JSON.stringify(r)), "clean JSON output");
  });
});

suite("Phase 6 — Contact Discovery: store integration", () => {
  test("saveDiscovery persists on the business and discoveryOf reads it back", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const biz = S.addBusiness({ name: "X", phone: "0241111111" });
    S.saveDiscovery(biz.id, { status: "found", checkedAt: 123, sourceWebsite: "https://x.example", whatsapp: { value: "233241111111", sourceUrl: "https://x.example", confidence: "HIGH" } });
    const d = S.discoveryOf(biz.id);
    notNull(d);
    eq(d.status, "found");
    eq(d.whatsapp.value, "233241111111");
  });

  test("applyContactChannel fills only empty fields — manual data wins", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const biz = S.addBusiness({ name: "Y", phone: "0242222222", googlePlaceId: "G1" });
    S.saveDiscovery(biz.id, { status: "found", phone: { value: "233241111111", sourceUrl: "https://y.example", confidence: "HIGH" }, email: { value: "new@y.gh", sourceUrl: "https://y.example", confidence: "HIGH" } });
    const appliedPhone = S.applyContactChannel(biz.id, "phone");
    isNull(appliedPhone, "existing phone is never overwritten (Google/manual wins)");
    eq(biz.phone, "0242222222");
    const appliedEmail = S.applyContactChannel(biz.id, "email");
    eq(appliedEmail, "new@y.gh");
    eq(biz.email, "new@y.gh");
  });

  test("applyContactChannel is a no-op when the top-level field already has a value", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const biz = S.addBusiness({ name: "Z", whatsapp: "0243333333" });
    S.saveDiscovery(biz.id, { status: "found", whatsapp: { value: "233241111111", sourceUrl: "https://z.example", confidence: "HIGH" } });
    isNull(S.applyContactChannel(biz.id, "whatsapp"));
    eq(biz.whatsapp, "0243333333");
  });

  test("re-running discovery is idempotent — a single contactDiscovery object, no duplicates", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const biz = S.addBusiness({ name: "I", website: "https://i.example" });
    const d = { status: "found", checkedAt: 1, sourceWebsite: "https://i.example", whatsapp: { value: "233241111111", sourceUrl: "https://i.example", confidence: "HIGH" } };
    S.saveDiscovery(biz.id, d);
    S.saveDiscovery(biz.id, d);
    const cdKeys = Object.keys(biz).filter((k) => k === "contactDiscovery");
    eq(cdKeys.length, 1);
    eq(S.discoveryOf(biz.id).whatsapp.value, "233241111111");
  });

  test("deleted businesses are handled without crashing", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const biz = S.addBusiness({ name: "Del" });
    const id = biz.id;
    S.db.businesses = S.db.businesses.filter((x) => x.id !== id);
    isNull(S.saveDiscovery(id, { status: "found" }));
    isNull(S.discoveryOf(id));
    isNull(S.applyContactChannel(id, "whatsapp"));
  });
});

suite("Phase 6 — Contact Discovery: queue", () => {
  test("candidates() on an empty DB returns []", () => {
    const app = freshApp();
    eq(app.V61.ContactDiscovery.candidates().length, 0);
  });

  test("candidates() excludes already-found leads and caps at 10", () => {
    const app = freshApp();
    const S = app.V61.Store;
    for (let i = 0; i < 15; i++) {
      const biz = S.addBusiness({ name: "Biz" + i, website: "https://b" + i + ".example" });
      S.addLead(biz.id, {});
      if (i < 3) S.saveDiscovery(biz.id, { status: "found", whatsapp: { value: "1" } });
    }
    const c = app.V61.ContactDiscovery.candidates();
    eq(c.length, 10, "batch capped at 10");
    ok(c.every((b) => !b.contactDiscovery || b.contactDiscovery.status !== "found"), "found leads are not rescanned");
  });

  test("runBatch never processes more than 10 businesses", async () => {
    const app = freshApp();
    analyzeStub(app, "<html><body>ok</body></html>");
    const list = Array.from({ length: 12 }, (_, i) => ({ id: "b" + i, name: "B", website: "https://b.example" }));
    const results = await app.V61.ContactDiscovery.runBatch(list, { persist: false });
    eq(results.length, 10);
  });

  test("runBatch is cancellable mid-batch", async () => {
    const app = freshApp();
    app.window.fetch = (url, opts) => {
      if (opts && opts.mode === "no-cors") return new Promise((res) => setTimeout(() => res({ ok: true, status: 0 }), 50));
      return new Promise((res, rej) => {
        const t = setTimeout(() => res(page("<html><body>slow</body></html>")), 100);
        if (opts && opts.signal) opts.signal.addEventListener("abort", () => { clearTimeout(t); rej(new Error("Aborted")); }, { once: true });
      });
    };
    const list = Array.from({ length: 10 }, (_, i) => ({ id: "b" + i, name: "B", website: "https://b.example" }));
    const ac = new AbortController();
    let progress = 0;
    await app.V61.ContactDiscovery.runBatch(list, {
      persist: false, signal: ac.signal,
      onProgress: (d) => { progress = d; if (d >= 2) ac.abort(); },
    });
    ok(progress < 10, "batch stopped early after cancel (progress " + progress + ")");
  });

  test("runBatch persists results into the store by default", async () => {
    const app = freshApp();
    const S = app.V61.Store;
    const biz = S.addBusiness({ name: "P", website: "https://p.example" });
    analyzeStub(app, '<html><body><a href="tel:+233241111111">C</a></body></html>');
    S.save();
    await app.V61.ContactDiscovery.runBatch([biz]);
    const d = S.discoveryOf(biz.id);
    notNull(d);
    eq(d.status, "found");
    eq(d.phone.value, "233241111111");
  });
});
