/* VISION 61 CRM — service: ContactDiscovery (Phase 6)
   Discovers public contact channels from a business's own website.

   Honesty rules (Phase 6 spec):
   - Deterministic rules only. No AI, no LLM, no fabricated data.
   - No website  -> status "none", nothing scanned.
   - Browser CORS blocks reading -> status "blocked"; never treated as
     "no contact" (blocked != none).
   - Network / HTTP failure -> status "error".
   - Only facts actually found on the live pages are reported. Every channel
     keeps its source URL; confidence is HIGH (explicit link/mailto/tel/wa) or
     MEDIUM (plain text). LOW guesses are never emitted — prefer "not found".
   - Never writes to the business's top-level contact fields. Discovered
     channels live under business.contactDiscovery; applying one to a top-level
     field only happens when that field is empty (manual / Google data wins).
   - Bounded crawl: max 5 same-origin pages per site, queued batches cap at 10.

   channel shape: { value, sourceUrl, confidence } with confidence HIGH|MEDIUM.
   contactForm shape: { url, sourceUrl, confidence }.
   result shape: {
     status: "found"|"partial"|"none"|"blocked"|"error",
     checkedAt, sourceWebsite,
     phone/email/whatsapp/instagram/facebook/tiktok/linkedin, contactForm
   } */
window.V61 = window.V61 || {};

(function () {
  const MAX_PAGES = 5;        // hard cap: pages crawled per website
  const MAX_BATCH = 10;       // hard cap: businesses per queue run
  const MAX_CONCURRENT = 3;   // polite concurrency for the queue
  const DEFAULT_TIMEOUT = 8000;

  /* ── URL helpers ── */
  function normalizeUrl(input) {
    let u = String(input || "").trim();
    if (!u) return null;
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    try {
      const url = new URL(u);
      if (!url.hostname || url.hostname.indexOf(".") < 0) return null;
      return { url: url.href, host: url.host, origin: url.origin, protocol: url.protocol, path: url.pathname + url.search };
    } catch (e) { return null; }
  }

  function absUrl(pageUrl, href) {
    try { return new URL(href, pageUrl).href; } catch (e) { return null; }
  }

  function sameOrigin(a, b) {
    try { return new URL(a).origin === new URL(b).origin; } catch (e) { return false; }
  }

  /* ── Ghana phone normalization ──
     Accepts national (0XXXXXXXXX) or international (+233XXXXXXXXX) forms and
     returns E.164 digits (233 + 9 digits) only for real Ghanaian number
     ranges. Returns null for anything else — we never guess. */
  const GH_MOBILE = ["20", "23", "24", "25", "26", "27", "28", "29", "50", "53", "54", "55", "56", "57", "58", "59"];
  function normalizeGhanaPhone(raw) {
    const digits = String(raw == null ? "" : raw).replace(/[^\d]/g, "");
    if (/^233\d{9}$/.test(digits)) {
      if (GH_MOBILE.indexOf(digits.slice(3, 5)) >= 0 || /^3[0-9]{2}$/.test(digits.slice(3, 6))) return digits;
      return null;
    }
    if (/^0\d{9}$/.test(digits)) {
      if (GH_MOBILE.indexOf(digits.slice(1, 3)) >= 0 || /^3[0-9]{2}$/.test(digits.slice(1, 4))) return "233" + digits.slice(1);
      return null;
    }
    return null;
  }

  /* Find phone-looking tokens in text. Only well-formed numbers (10 national /
     12 international digits, optional spaces, dashes, dots, parens) are
     considered — an arbitrary 8+ digit run is never treated as a phone. */
  function findPhoneCandidates(text) {
    const re = /(?<!\d)(?:\+?\s?233[\s.-]?|[+(]?0?)[1253][0-9](?:[\s.-]?[0-9]){7,9}/g;
    const out = [];
    let m;
    while ((m = re.exec(text)) !== null) {
      const norm = normalizeGhanaPhone(m[0]);
      if (norm && out.indexOf(norm) < 0) out.push(norm);
    }
    return out;
  }

  const PLACEHOLDER_DOMAINS = [
    "example.com", "example.org", "example.net", "yourdomain.com", "yourdomain",
    "yoursite.com", "your-email.com", "domain.com", "email.com", "sitename.com",
    "yourwebsite.com", "website.com", "domain.com", "yourname.com", "emailaddress.com",
    "mail.com", "yourmail.com",
  ];
  const ASSET_TLDS = /\.(png|jpe?g|gif|svg|webp|css|js|map|ico|woff2?)$/i;

  function validEmail(candidate) {
    const m = /^([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+)$/.exec(candidate);
    if (!m) return null;
    const local = m[1], domain = m[2];
    if (/^[0-9]+$/.test(local)) return null;                 // "123@foo" is not a name
    if (ASSET_TLDS.test(domain)) return null;                // image@2x.png etc.
    if (PLACEHOLDER_DOMAINS.indexOf(domain.toLowerCase()) >= 0) return null;
    return m[0];
  }

  function findEmails(text) {
    const re = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+/g;
    const out = [];
    let m;
    while ((m = re.exec(text)) !== null) {
      const e = validEmail(m[0]);
      if (e && out.indexOf(e) < 0) out.push(e);
    }
    return out;
  }

  /* ── Social profile extraction ── */
  const SKIP_SEGMENTS = ["explore", "reel", "reels", "p", "stories", "direct", "accounts", "share", "oembed", "sessions", "settings"];
  const FB_SKIP = ["sharer", "sharer.php", "plugins", "share", "l.php", "profile.php", "photo", "photos", "events", "groups", "reel", "reels", "watch", "login", "messages", "stories", "story"];
  const LI_PREFIXES = ["in", "company", "pub"];
  const TT_PREFIXES = ["@", "tag", "share", "search", "video"];

  function firstSegment(pathname) {
    return (pathname || "").split("/").filter(Boolean)[0] || "";
  }

  function detectSocial(anchors, key) {
    const cfg = {
      instagram: { host: /instagram\.com|instagr\.am/i, skip: SKIP_SEGMENTS, requireAt: false },
      facebook: { host: /facebook\.com|fb\.com/i, skip: FB_SKIP, requireAt: false },
      tiktok: { host: /tiktok\.com/i, skip: TT_PREFIXES, requireAt: true },
      linkedin: { host: /linkedin\.com/i, skip: [], requireAt: false },
    }[key];
    if (!cfg) return null;
    for (const a of anchors) {
      const href = a.href || "";
      if (!cfg.host.test(href)) continue;
      try {
        const u = new URL(href);
        const seg = firstSegment(u.pathname);
        if (!seg) continue;
        if (key === "linkedin" && LI_PREFIXES.indexOf(seg.toLowerCase()) < 0) continue;   // only /in/company/pub
        if (cfg.skip.indexOf(seg.toLowerCase()) >= 0) continue;
        if (cfg.requireAt && seg.indexOf("@") !== 0) continue;                            // only @handles
        const slug = decodeURIComponent(seg).replace(/[?#].*$/, "");
        if (!slug) continue;
        return { value: href, handle: slug, sourceUrl: href, confidence: "HIGH" };
      } catch (e) { continue; }
    }
    return null;
  }

  /* ── Per-page extraction: deterministic, no AI ── */
  function extractFromHtml(html, pageUrl, bizName) {
    const out = { phone: null, email: null, whatsapp: null, instagram: null, facebook: null, tiktok: null, linkedin: null, contactForm: null };
    let doc = null;
    try { doc = new DOMParser().parseFromString(html, "text/html"); } catch (e) { return { channels: { phone: null, email: null, whatsapp: null, instagram: null, facebook: null, tiktok: null, linkedin: null }, contactForm: null }; }
    const body = doc.body ? (doc.body.textContent || doc.body.innerText || "") : "";
    const anchors = Array.from(doc.querySelectorAll("a[href]"));

    /* phone: HIGH from tel: links, MEDIUM from well-formed body text */
    const telLinks = anchors.filter((a) => /^tel:/i.test((a.getAttribute("href") || "").trim()));
    for (const a of telLinks) {
      const raw = (a.getAttribute("href") || "").replace(/^tel:/i, "");
      const norm = normalizeGhanaPhone(raw);
      if (norm) { out.phone = { value: norm, sourceUrl: pageUrl, confidence: "HIGH" }; break; }
    }
    if (!out.phone) {
      const found = findPhoneCandidates(body);
      if (found.length) out.phone = { value: found[0], sourceUrl: pageUrl, confidence: "MEDIUM" };
    }

    /* email: HIGH from mailto: links, MEDIUM from body text */
    const mailtos = anchors.filter((a) => /^mailto:/i.test((a.getAttribute("href") || "").trim()));
    for (const a of mailtos) {
      const raw = (a.getAttribute("href") || "").replace(/^mailto:/i, "").split("?")[0];
      const e = validEmail(raw.trim());
      if (e) { out.email = { value: e, sourceUrl: pageUrl, confidence: "HIGH" }; break; }
    }
    if (!out.email) {
      const found = findEmails(body);
      if (found.length) out.email = { value: found[0], sourceUrl: pageUrl, confidence: "MEDIUM" };
    }

    /* whatsapp: wa.me / api.whatsapp.com / chat.whatsapp.com links */
    for (const a of anchors) {
      const href = a.href || "";
      if (/wa\.me\//i.test(href) || /api\.whatsapp\.com\/send/i.test(href) || /chat\.whatsapp\.com/i.test(href)) {
        const u = new URL(href);
        const phoneParam = (u.searchParams.get("phone") || "").replace(/[^\d]/g, "");
        let norm = phoneParam ? normalizeGhanaPhone(phoneParam) : null;
        if (!norm) {
          const fromPath = u.pathname.replace(/[^\d]/g, "").replace(/^0+/, "");
          if (fromPath.length >= 9) norm = normalizeGhanaPhone(fromPath.length === 10 ? "0" + fromPath : fromPath);
        }
        if (norm) { out.whatsapp = { value: norm, sourceUrl: href, confidence: "HIGH" }; break; }
        if (href && /chat\.whatsapp\.com/i.test(href)) {
          out.whatsapp = { value: href, sourceUrl: href, confidence: "MEDIUM" };
          break;
        }
      }
    }

    /* socials from explicit profile links */
    out.instagram = detectSocial(anchors, "instagram");
    out.facebook = detectSocial(anchors, "facebook");
    out.tiktok = detectSocial(anchors, "tiktok");
    out.linkedin = detectSocial(anchors, "linkedin");

    /* contact form: a real <form> (or email/textarea input) or an explicit
       contact page link. Return the absolute URL of the form target when
       known, else the page it was found on. */
    const forms = Array.from(doc.querySelectorAll("form"));
    const hasFormInput = !!doc.querySelector("input[type=email], textarea");
    if (forms.length || hasFormInput) {
      const action = forms.map((f) => (f.getAttribute("action") || "").trim()).filter(Boolean)[0] || null;
      out.contactForm = { url: action ? absUrl(pageUrl, action) || action : pageUrl, sourceUrl: pageUrl, confidence: "HIGH" };
    } else {
      const contactLinks = anchors.filter((a) => {
        const h = (a.getAttribute("href") || "").toLowerCase();
        const t = ((a.textContent || "") + " " + (a.getAttribute("aria-label") || "")).toLowerCase();
        return /contact/.test(h) && !/mailto:|tel:/.test(h) || /contact us|contact-us|get in touch|contact/i.test(t) && !/mailto:|tel:/.test(h);
      });
      if (contactLinks.length) {
        const href = contactLinks[0].getAttribute("href") || "";
        out.contactForm = { url: absUrl(pageUrl, href) || href, sourceUrl: pageUrl, confidence: "MEDIUM" };
      }
    }
    return { channels: { phone: out.phone, email: out.email, whatsapp: out.whatsapp, instagram: out.instagram, facebook: out.facebook, tiktok: out.tiktok, linkedin: out.linkedin }, contactForm: out.contactForm };
  }

  /* ── Merge page extractions (better confidence wins, ties keep first) ── */
  function betterOrNull(cur, next) {
    if (!next) return cur;
    if (!cur) return next;
    const rank = { HIGH: 2, MEDIUM: 1, LOW: 0 };
    return (rank[next.confidence] || 0) > (rank[cur.confidence] || 0) ? next : cur;
  }

  function mergeExtractions(list) {
    const merged = { phone: null, email: null, whatsapp: null, instagram: null, facebook: null, tiktok: null, linkedin: null, contactForm: null };
    for (const ex of list) {
      if (!ex) continue;
      for (const key of ["phone", "email", "whatsapp", "instagram", "facebook", "tiktok", "linkedin"]) {
        if (ex.channels) merged[key] = betterOrNull(merged[key], ex.channels[key]);
      }
      merged.contactForm = betterOrNull(merged.contactForm, ex.contactForm);
    }
    return merged;
  }

  /* ── Status + helpers ── */
  const DIRECT = ["whatsapp", "phone", "email"];
  const SOCIAL = ["instagram", "facebook", "tiktok", "linkedin"];
  const BEST_ORDER = ["whatsapp", "phone", "email", "instagram", "facebook", "contactForm", "linkedin", "tiktok"];

  function presentChannels(discovery) {
    const d = discovery || {};
    const keys = [];
    DIRECT.concat(SOCIAL).forEach((k) => { if (d[k] && d[k].value) keys.push(k); });
    if (d.contactForm && d.contactForm.url) keys.push("contactForm");
    return keys;
  }

  function statusFor(discovery) {
    const keys = presentChannels(discovery);
    if (!keys.length) return "none";
    if (keys.some((k) => DIRECT.indexOf(k) >= 0)) return "found";
    return "partial";
  }

  function bestContact(discovery) {
    const keys = presentChannels(discovery);
    for (const k of BEST_ORDER) { if (keys.indexOf(k) >= 0) return k; }
    return null;
  }

  function channelValue(discovery, key) {
    const d = discovery || {};
    const c = key === "contactForm" ? d.contactForm : d[key];
    if (!c) return null;
    if (key === "contactForm") return c.url;
    return c.value || null;
  }

  /* ── Fetching (browser-only; mirrors websiteAnalyzer honesty) ── */
  function fetchWithTimeout(url, ms, signal) {
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    if (signal) { if (signal.aborted) ctrl.abort(); else signal.addEventListener("abort", onAbort, { once: true }); }
    const t = setTimeout(() => ctrl.abort(), ms || DEFAULT_TIMEOUT);
    return fetch(url, { mode: "cors", credentials: "omit", redirect: "follow", signal: ctrl.signal })
      .finally(() => { clearTimeout(t); if (signal) signal.removeEventListener("abort", onAbort); });
  }

  function probe(url, signal) {
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    if (signal) { if (signal.aborted) ctrl.abort(); else signal.addEventListener("abort", onAbort, { once: true }); }
    const t = setTimeout(() => ctrl.abort(), 6000);
    let p;
    try { p = fetch(url, { method: "GET", mode: "no-cors", credentials: "omit", redirect: "follow", signal: ctrl.signal }); }
    catch (e) { p = Promise.reject(e); }
    return p.then(() => ({ ok: true })).catch(() => ({ ok: false }))
      .finally(() => { clearTimeout(t); if (signal) signal.removeEventListener("abort", onAbort); });
  }

  function blockedResult(bizId, url, msg) {
    return { status: "blocked", checkedAt: Date.now(), sourceWebsite: url, message: msg || "Analysis unavailable — this website blocks browser access." };
  }

  /* ── Bounded crawl ──
     Fetches the homepage, then contact/about links found on it (same-origin),
     capped at MAX_PAGES. Returns { pages: [{url, html}], status, message }.
     blocked/unreachable/http_error only reflect the homepage probe; a failed
     sub-page is simply skipped without fabricating results. */
  async function crawlPages(norm, opts) {
    const pages = [];
    let status = "ok", message = "";
    try {
      const home = await fetchWithTimeout(norm.url, opts.timeout || DEFAULT_TIMEOUT, opts.signal);
      if (home.status >= 400) {
        return { pages, status: "error", message: "The website responded with HTTP " + home.status + "." };
      }
      const text = await home.text().catch(() => "");
      if (text) pages.push({ url: norm.url, html: text });
      let doc = null;
      try { doc = new DOMParser().parseFromString(text, "text/html"); } catch (e) {}
      const cands = [];
      if (doc) {
        const hrefs = Array.from(doc.querySelectorAll("a[href]")).map((a) => (a.getAttribute("href") || "").trim());
        hrefs.forEach((h) => {
          if (!h || /^javascript:|^#/.test(h) || /^(mailto:|tel:|sms:|whatsapp:)/i.test(h)) return;
          const u = absUrl(norm.url, h);
          if (!u || !sameOrigin(u, norm.url)) return;
          if (/contact|about/i.test(u.replace(norm.origin, "")) && cands.indexOf(u) < 0) cands.push(u);
        });
        for (const u of cands) { if (pages.length >= MAX_PAGES) break; if (u === norm.url) continue; try { pages.push({ url: u, html: null, pending: true }); } catch (e) {} }
      }
      for (const pg of pages.slice(1)) {
        if (pages.length > MAX_PAGES) break;
        try {
          const r = await fetchWithTimeout(pg.url, opts.timeout || DEFAULT_TIMEOUT, opts.signal);
          if (r.ok) pg.html = await r.text().catch(() => "");
        } catch (e) { pg.html = null; }  // sub-page failure: skip, never fabricate
      }
    } catch (e) {
      const reach = await probe(norm.url, opts.signal);
      if (reach.ok) status = "blocked";
      else status = "error";
      message = reach.ok
        ? "Analysis unavailable — this website blocks browser access."
        : "Could not reach " + norm.url + ". Check the URL or whether the site is online.";
    }
    return { pages: pages.filter((p) => typeof p.html === "string" && p.html), status, message };
  }

  /* ── analyze: full discovery for one business ── */
  async function analyze(business, opts) {
    opts = opts || {};
    const biz = business || {};
    const raw = (biz.website || "").trim();
    const now = Date.now();
    if (!raw) {
      return { status: "none", checkedAt: now, sourceWebsite: null,
        message: "No website URL is associated with this business, so there is nothing to scan." };
    }
    const norm = normalizeUrl(raw);
    if (!norm) {
      return { status: "error", checkedAt: now, sourceWebsite: raw,
        message: "The stored website URL is not a valid web address." };
    }
    const fetchable = typeof window !== "undefined" && typeof window.fetch === "function";
    if (!fetchable) {
      return { status: "error", checkedAt: now, sourceWebsite: norm.url,
        message: "This environment cannot fetch websites, so discovery is unavailable." };
    }
    const cr = await crawlPages(norm, opts);
    if (cr.status !== "ok") {
      return { status: cr.status, checkedAt: now, sourceWebsite: norm.url,
        message: cr.message || blockedResult(biz.id, norm.url, "").message };
    }
    const extractions = cr.pages.map((p) => extractFromHtml(p.html, p.url, biz.name));
    const merged = mergeExtractions(extractions);
    const result = { status: "none", checkedAt: now, sourceWebsite: norm.url, message: "" };
    for (const key of DIRECT.concat(SOCIAL)) {
      if (merged[key] && merged[key].value) result[key] = merged[key];
    }
    if (merged.contactForm && merged.contactForm.url) result.contactForm = merged.contactForm;
    result.status = statusFor(result);
    if (result.status === "none") {
      result.message = "The website was scanned but no public contact channels were found.";
    } else if (result.status === "partial") {
      result.message = "Found indirect channels only (no direct phone/email/WhatsApp).";
    } else {
      result.message = "Contact channels discovered from the business website.";
    }
    return result;
  }

  /* ── Queue: batch of at most MAX_BATCH, sequential, cancellable ── */
  function runBatch(businesses, opts) {
    opts = opts || {};
    const list = (businesses || []).filter(Boolean).slice(0, MAX_BATCH);
    const ctrl = new AbortController();
    if (opts.signal) { if (opts.signal.aborted) ctrl.abort(); else opts.signal.addEventListener("abort", () => ctrl.abort(), { once: true }); }
    const results = new Array(list.length);
    let cursor = 0, active = 0, completed = 0;
    return new Promise((resolve) => {
      if (!list.length) { resolve(results); return; }
      const S = (typeof window !== "undefined" && window.V61 && V61.Store) || null;
      function pump() {
        if (ctrl.signal.aborted) { if (active === 0) finish(); return; }
        while (active < MAX_CONCURRENT && cursor < list.length) {
          const i = cursor++;
          active++;
          analyze(list[i], { signal: ctrl.signal, timeout: opts.timeout })
            .then((r) => {
              results[i] = r;
              if (S && opts.persist !== false && list[i] && list[i].id) {
                try { S.saveDiscovery(list[i].id, r); } catch (e) {}
              }
              if (opts.onResult) { try { opts.onResult(r, i, list.length, list[i]); } catch (e) {} }
            })
            .catch((e) => {
              const r = { status: "error", checkedAt: Date.now(), sourceWebsite: list[i] && list[i].website || null, message: String((e && e.message) || e) };
              results[i] = r;
              if (S && opts.persist !== false && list[i] && list[i].id) { try { S.saveDiscovery(list[i].id, r); } catch (e2) {} }
              if (opts.onResult) { try { opts.onResult(r, i, list.length, list[i]); } catch (e2) {} }
            })
            .finally(() => {
              active--; completed++;
              if (opts.onProgress) { try { opts.onProgress(completed, list.length); } catch (e) {} }
              if (ctrl.signal.aborted) { if (active === 0) finish(); return; }
              pump();
            });
        }
        if (active === 0 && cursor >= list.length) finish();
      }
      function finish() { resolve(results); }
      pump();
    });
  }

  /* ── Queue candidate selection (used by the Discovery page) ──
     Leads whose business has a website and whose discovery status is not
     already "found" (so re-runs are idempotent and bounded). */
  function candidates(opts) {
    const S = (typeof window !== "undefined" && window.V61 && V61.Store) || null;
    if (!S) return [];
    const rows = S.leadRows();
    const all = rows.map((r) => r.business).filter((b) => b && (b.website || "").trim());
    const scored = all.map((b) => {
      const d = S.discoveryOf(b.id);
      const rank = d ? { found: 3, partial: 0, none: 0, blocked: 0, error: 0, not_checked: 0 }[d.status] || 0 : -1;
      return { b, rank };
    });
    scored.sort((a, b) => a.rank - b.rank);
    return scored.slice(0, MAX_BATCH).map((x) => x.b);
  }

  V61.ContactDiscovery = {
    MAX_PAGES, MAX_BATCH,
    normalizeUrl, normalizeGhanaPhone, validEmail,
    extractFromHtml, mergeExtractions,
    statusFor, bestContact, presentChannels, channelValue,
    analyze, runBatch, candidates,
  };
})();
