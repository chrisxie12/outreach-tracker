/* VISION 61 CRM — service: WebsiteAnalyzer
   Analyzes a business's publicly accessible website from the browser.
   Honesty rules:
   - No website  -> status "not_available", no analysis attempted.
   - CORS blocks reading -> status "blocked", never fabricated results.
   - Network fails -> status "unreachable".
   - HTTP error -> status "http_error".
   Only facts actually retrieved from the live page (or merged manual checks) contribute to signals.
   A backend/serverless function can later replace the browser fetch; the result shape is stable. */
window.V61 = window.V61 || {};

(function () {
  const MAX_CONCURRENT = 10;
  const DEFAULT_TIMEOUT = 8000;

  function normalizeUrl(input) {
    let u = String(input || "").trim();
    if (!u) return null;
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    try {
      const url = new URL(u);
      if (!url.hostname || url.hostname.indexOf(".") < 0) return null;
      return { url: url.href, host: url.host, https: url.protocol === "https:", path: url.pathname + url.search };
    } catch (e) { return null; }
  }

  function fetchWithTimeout(url, ms, signal) {
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    if (signal) { if (signal.aborted) ctrl.abort(); else signal.addEventListener("abort", onAbort, { once: true }); }
    const t = setTimeout(() => ctrl.abort(), ms || DEFAULT_TIMEOUT);
    return fetch(url, { mode: "cors", credentials: "omit", redirect: "follow", signal: ctrl.signal })
      .finally(() => { clearTimeout(t); if (signal) signal.removeEventListener("abort", onAbort); });
  }

  /* no-cors probe: an opaque 200 proves the host is reachable even when CORS blocks reading. */
  function probe(url, signal) {
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    if (signal) { if (signal.aborted) ctrl.abort(); else signal.addEventListener("abort", onAbort, { once: true }); }
    const t = setTimeout(() => ctrl.abort(), 6000);
    let p;
    try { p = fetch(url, { method: "GET", mode: "no-cors", credentials: "omit", redirect: "follow", signal: ctrl.signal }); }
    catch (e) { p = Promise.reject(e); }
    return p
      .then((r) => ({ ok: true, status: r.status }))
      .catch(() => ({ ok: false }))
      .finally(() => { clearTimeout(t); if (signal) signal.removeEventListener("abort", onAbort); });
  }

  async function probeFile(host, path, signal) {
    try {
      const r = await fetchWithTimeout("https://" + host + path, 5000, signal);
      if (r.ok) return true;
    } catch (e) {}
    return false;
  }

  function blocked(businessId, url, msg) {
    return { businessId, status: "blocked", score: null, url, signals: null,
      summary: "Website analysis unavailable", message: msg,
      hint: "Website analysis is unavailable from the browser due to cross-origin restrictions. Configure the server-side analyzer to enable deeper analysis." };
  }

  function extractSignals(text, url, bizName, usedHttps) {
    const signals = { https: !!usedHttps, reachable: true };
    let doc = null;
    try { doc = new DOMParser().parseFromString(text, "text/html"); } catch (e) {}
    if (!doc) return signals;
    const title = (doc.querySelector("title") || { textContent: "" }).textContent || "";
    const t = title.trim();
    signals.titleOk = t.length >= 10 && t.length <= 75;
    const metaDesc = doc.querySelector('meta[name="description"]');
    signals.metaDesc = !!(metaDesc && (metaDesc.getAttribute("content") || "").trim());
    signals.h1 = !!doc.querySelector("h1");
    signals.canonical = !!doc.querySelector('link[rel="canonical"]');
    signals.viewport = !!doc.querySelector('meta[name="viewport"]');
    const body = doc.body ? doc.body.innerText || "" : "";
    const words = (body.match(/\S+/g) || []).length;
    signals.contentWords = words >= 80;
    const lower = body.toLowerCase();
    const els = Array.from(doc.querySelectorAll("a,button"));
    const hasTel = !!doc.querySelector('a[href^="tel:"]');
    signals.phone = hasTel || /(\+?\d[\d\s().-]{7,}\d)/.test(body);
    const hasMailto = !!doc.querySelector('a[href^="mailto:"]');
    signals.email = hasMailto || /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(body);
    signals.whatsapp = !!doc.querySelector('a[href*="wa.me"], a[href*="whatsapp.com"]');
    signals.form = !!doc.querySelector("form") || !!doc.querySelector("input[type=email], textarea");
    const bookingKws = /book|booking|appointment|schedule|reserve|calendly/i;
    signals.booking = els.some((el) => bookingKws.test(el.textContent || ""));
    const orderKws = /order|menu|delivery|takeaway|take away|online order/i;
    signals.ordering = els.some((el) => orderKws.test(el.textContent || ""));
    signals.cta = !!(signals.whatsapp || signals.phone || signals.email || signals.booking || signals.ordering || signals.form);
    signals.businessInfo = signals.contentWords || words >= 150;
    signals.servicesListed = /services|products|menu|about|pricing|what we do|our services/i.test(lower);
    signals.contactDetails = !!(signals.phone || signals.email);
    signals.address = !!doc.querySelector('[itemprop="address"], address') || /street|road|avenue|lane|drive|close|boulevard|\baccra\b|\bkumasi\b|\btema\b/i.test(lower);
    signals.businessIdentity = !!(t && bizName && t.toLowerCase().indexOf(bizName.toLowerCase()) >= 0);
    signals.consistentContact = !!(signals.phone && signals.email) || (signals.phone && signals.address);
    const socials = { instagram: /instagram\.com/i, facebook: /facebook\.com|fb\.com/i, tiktok: /tiktok\.com/i, linkedin: /linkedin\.com/i, youtube: /youtube\.com|youtu\.be/i };
    signals.social = {};
    const hrefs = Array.from(doc.querySelectorAll("a[href]"));
    for (const k in socials) signals.social[k] = hrefs.some((a) => socials[k].test(a.href || ""));
    const imgs = Array.from(doc.querySelectorAll("img"));
    signals.imageAlt = imgs.length ? Array.from(imgs).filter((i) => (i.getAttribute("alt") || "").trim()).length / imgs.length : null;
    signals.brokenAnchors = hrefs.some((a) => { const h = (a.getAttribute("href") || "").trim(); return h === "" || h === "#" || /^javascript:/i.test(h); });
    return signals;
  }

  async function analyze(business, opts) {
    opts = opts || {};
    const biz = business || {};
    const raw = (biz.website || "").trim();
    if (!raw) {
      return { businessId: biz.id, status: "not_available", score: null, url: null, signals: null,
        summary: "Website status: Not available", message: "No website URL is associated with this business listing, so no analysis was attempted." };
    }
    const norm = normalizeUrl(raw);
    if (!norm) {
      return { businessId: biz.id, status: "error", score: null, url: raw, signals: null,
        summary: "Invalid website URL", message: "The stored website URL \u201c" + raw + "\u201d is not a valid web address." };
    }
    let usedHttps = norm.https;
    let resp = null;
    try {
      resp = await fetchWithTimeout(norm.url, opts.timeout || DEFAULT_TIMEOUT, opts.signal);
    } catch (e) {
      const reach = await probe(norm.url, opts.signal);
      if (reach.ok) {
        return blocked(biz.id, norm.url, "Cross-origin restrictions prevent this browser from reading " + norm.url + ". The site is reachable but its content can\u2019t be inspected from here.");
      }
      if (norm.https) {
        const httpUrl = "http://" + norm.host + norm.path;
        const reachHttp = await probe(httpUrl, opts.signal);
        if (reachHttp.ok) {
          usedHttps = false;
          try { resp = await fetchWithTimeout(httpUrl, opts.timeout || DEFAULT_TIMEOUT, opts.signal); }
          catch (e2) {
            return blocked(biz.id, norm.url, "Cross-origin restrictions prevent this browser from reading " + norm.url + ".");
          }
        } else {
          return { businessId: biz.id, status: "unreachable", score: null, url: norm.url, signals: null,
            summary: "Website unreachable", message: "Could not reach " + norm.url + ". Check the URL, DNS, or whether the site is online." };
        }
      } else {
        return { businessId: biz.id, status: "unreachable", score: null, url: norm.url, signals: null,
          summary: "Website unreachable", message: "Could not reach " + norm.url + "." };
      }
    }
    if (!resp) return blocked(biz.id, norm.url, "Cross-origin restrictions prevent this browser from reading " + norm.url + ".");
    if (resp.status >= 400) {
      return { businessId: biz.id, status: "http_error", score: null, url: norm.url, httpStatus: resp.status, signals: null,
        summary: "HTTP " + resp.status, message: "The website responded with HTTP " + resp.status + "." };
    }
    const text = await resp.text().catch(() => "");
    const signals = extractSignals(text, norm.url, biz.name, usedHttps);
    const robots = await probeFile(norm.host, "/robots.txt", opts.signal);
    if (robots) signals.robots = true;
    const sitemap = await probeFile(norm.host, "/sitemap.xml", opts.signal);
    if (sitemap) signals.sitemap = true;
    const score = V61.Score.websiteScore(signals);
    return { businessId: biz.id, status: "ok", score, url: norm.url, signals, httpStatus: resp.status,
      summary: "Analyzed " + norm.host + (usedHttps ? "" : " (HTTP)"),
      message: "Analyzed directly from the live page. Facts below are Detected, not assumed." };
  }

  /* Sequential / controlled-concurrency batch. maxConcurrent is hard-capped at 10.
     Returns a Promise of results[]; progress reported via opts.onProgress(done, total). */
  function runBatch(businesses, opts) {
    opts = opts || {};
    const list = (businesses || []).filter(Boolean);
    const results = [];
    const ctrl = new AbortController();
    if (opts.signal) opts.signal.addEventListener("abort", () => ctrl.abort(), { once: true });
    const max = Math.max(1, Math.min(opts.maxConcurrent || MAX_CONCURRENT, MAX_CONCURRENT));
    return new Promise((resolve) => {
      if (!list.length) { resolve(results); return; }
      let cursor = 0, active = 0, completed = 0;
      const done = () => { resolve(results); };
      function pump() {
        if (ctrl.signal.aborted) { if (active === 0) done(); return; }
        while (active < max && cursor < list.length) {
          const i = cursor++;
          active++;
          analyze(list[i], { signal: ctrl.signal, timeout: opts.timeout })
            .then((r) => { results[i] = r; if (opts.onResult) { try { opts.onResult(r, i, list.length); } catch (e) {} } })
            .catch((e) => {
              results[i] = { businessId: list[i].id, status: "error", score: null, signals: null, summary: "Analysis failed", message: String((e && e.message) || e) };
              if (opts.onResult) { try { opts.onResult(results[i], i, list.length); } catch (e2) {} }
            })
            .finally(() => {
              active--; completed++;
              if (opts.onProgress) { try { opts.onProgress(completed, list.length); } catch (e) {} }
              if (ctrl.signal.aborted) { if (active === 0) done(); return; }
              pump();
            });
        }
        if (active === 0 && cursor >= list.length) done();
      }
      pump();
    });
  }

  V61.WebsiteAnalyzer = { normalizeUrl, analyze, runBatch, MAX_CONCURRENT };
})();