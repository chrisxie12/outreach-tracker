/* Vision 61 Studios — website interactions (V2) */
(function () {
  "use strict";

  var burger = document.getElementById("nav-burger");
  var links = document.getElementById("nav-links");

  if (burger && links) {
    burger.addEventListener("click", function () {
      var open = links.classList.toggle("open");
      burger.classList.toggle("open", open);
      burger.setAttribute("aria-expanded", open ? "true" : "false");
    });
    links.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        links.classList.remove("open");
        burger.classList.remove("open");
        var item = a.closest(".nav-item");
        if (item) item.classList.remove("open");
      });
    });
  }

  var dropToggle = document.querySelector(".drop-toggle");
  if (dropToggle) {
    var dropItem = dropToggle.parentNode;
    dropToggle.addEventListener("click", function (ev) {
      ev.stopPropagation();
      var open = dropItem.classList.toggle("open");
      dropToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.addEventListener("click", function (ev) {
      if (!dropItem.contains(ev.target)) {
        dropItem.classList.remove("open");
        dropToggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  var sections = Array.prototype.slice.call(document.querySelectorAll("section[id]"));
  var navAnchors = Array.prototype.slice.call(
    document.querySelectorAll(".nav-links a[href^='#']:not(.nav-cta)")
  );
  var hasIO = "IntersectionObserver" in window;

  if (hasIO) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          navAnchors.forEach(function (a) {
            a.style.color = a.getAttribute("href") === "#" + e.target.id ? "var(--text)" : "";
          });
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    sections.forEach(function (s) { spy.observe(s); });
  }

  var reduced = false;
  try { reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { /* ignore */ }

  var reveal = Array.prototype.slice.call(
    document.querySelectorAll(".svc-card, .pkg-card, .why-card, .proc, .fact, .example-card, .dept-card, .who-card, .show-card")
  );
  if (hasIO && !reduced) {
    var ro = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          obs.unobserve(e.target);
          setTimeout(function () { e.target.style.transitionDelay = ""; }, 1300);
        }
      });
    }, { threshold: 0.12 });
    reveal.forEach(function (el, i) {
      el.classList.add("reveal");
      if (el.classList.contains("who-card") || el.classList.contains("show-card")) {
        el.style.transitionDelay = ((i % 6) * 70) + "ms";
      }
      ro.observe(el);
    });
  } else {
    reveal.forEach(function (el) { el.classList.add("in"); });
  }

  var yearEl = document.getElementById("year");
  if (yearEl) { yearEl.textContent = String(new Date().getFullYear()); }

  var form = document.getElementById("contact-form");
  if (form) {
    var status = document.getElementById("form-status");
    var WA_NUMBER = "233201599949";
    var EMAIL = "hello@vision61studios.online";

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var val = function (id) {
        var el = document.getElementById(id);
        return el ? el.value.trim() : "";
      };
      var name = val("cf-name");
      var business = val("cf-business");
      var phone = val("cf-phone");
      var email = val("cf-email");
      var type = val("cf-type");
      var need = val("cf-need");
      var message = val("cf-message");

      if (!name && !message) {
        var firstField = document.getElementById("cf-name");
        if (firstField) firstField.focus();
        if (status) status.textContent = "Please add your name or a message.";
        return;
      }

      var lines = [];
      function push(label, value) { if (value) { lines.push(label + ": " + value); } }
      push("Name", name);
      push("Business", business);
      push("Phone / WhatsApp", phone);
      push("Email", email);
      push("Business type", type);
      push("I need help with", need);
      if (message) { lines.push(""); lines.push(message); }
      var body = "Hi Vision 61 Studios! I'd like to talk about my business.\n\n" + lines.join("\n");
      var subject = "Project enquiry" + (name ? " — " + name : "");

      var waUrl = "https://wa.me/" + WA_NUMBER + "?text=" + encodeURIComponent(body);
      var mailtoUrl = "mailto:" + EMAIL + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);

      if (window.trackEvent) {
        window.trackEvent("contact_form_submit", { form_name: "main_contact", method: "whatsapp" });
      }
      window.open(waUrl, "_blank", "noopener");
      if (status) {
        status.textContent = "Opening WhatsApp with your details pre-filled…";
        var fb = document.createElement("a");
        fb.textContent = "WhatsApp didn't open? Send the same message by email instead.";
        fb.href = mailtoUrl;
        fb.className = "form-fallback";
        status.appendChild(document.createElement("br"));
        status.appendChild(fb);
      }
    });
  }
})();

/* ── Instant website check ───────────────────────────────
   Lightweight, self-contained version of the CRM's Website Analyzer.
   Honesty rules (same as the CRM): never fabricate results. A site that
   blocks browser inspection is reported as "can't inspect", never guessed. */
(function () {
  "use strict";
  var form = document.getElementById("ia-form");
  if (!form) return;

  var input = document.getElementById("ia-url");
  var nameEl = document.getElementById("ia-name");
  var btn = document.getElementById("ia-btn");
  var statusEl = document.getElementById("ia-status");
  var resultEl = document.getElementById("ia-result");
  var scoreRing = document.getElementById("ia-score-ring");
  var scoreNum = document.getElementById("ia-score-num");
  var gradeEl = document.getElementById("ia-grade");
  var urlLine = document.getElementById("ia-url-line");
  var factsEl = document.getElementById("ia-facts");
  var ctaLink = document.getElementById("ia-cta-link");

  var WEIGHTS = {
    https: 4, reachable: 4, viewport: 4, mobile: 4, titleOk: 4,
    metaDesc: 4, h1: 4, canonical: 4, robots: 4, sitemap: 4,
    phone: 4, email: 4, whatsapp: 4, cta: 4, booking: 3, ordering: 3, form: 3,
    businessInfo: 5, servicesListed: 5, contactDetails: 5,
    address: 4, businessIdentity: 4, consistentContact: 2
  };

  var FACTS = [
    ["https", "Secure connection (HTTPS)"],
    ["viewport", "Mobile-friendly design"],
    ["titleOk", "Page title"],
    ["metaDesc", "Meta description"],
    ["h1", "Main heading (H1)"],
    ["canonical", "Canonical URL"],
    ["phone", "Phone number"],
    ["email", "Email address"],
    ["whatsapp", "WhatsApp link"],
    ["booking", "Online booking"],
    ["ordering", "Online ordering"],
    ["form", "Contact form"],
    ["address", "Address shown"],
    ["businessInfo", "Real content"],
    ["robots", "robots.txt"],
    ["sitemap", "sitemap.xml"]
  ];

  function normalizeUrl(raw) {
    var u = String(raw || "").trim();
    if (!u) return null;
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    try {
      var url = new URL(u);
      if (!url.hostname || url.hostname.indexOf(".") < 0) return null;
      return { url: url.href, host: url.host, https: url.protocol === "https:", path: url.pathname + url.search };
    } catch (e) { return null; }
  }

  function fetchWithTimeout(url, ms) {
    var ctrl = ("AbortController" in window) ? new AbortController() : null;
    var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms || 8000);
    var opts = { mode: "cors", credentials: "omit", redirect: "follow" };
    if (ctrl) opts.signal = ctrl.signal;
    var p;
    try { p = Promise.resolve(fetch(url, opts)); }
    catch (e) { p = Promise.reject(e); }
    return p.finally(function () { clearTimeout(t); });
  }

  function probe(url) {
    var p;
    try { p = Promise.resolve(fetch(url, { method: "GET", mode: "no-cors", credentials: "omit", redirect: "follow" })); }
    catch (e) { p = Promise.reject(e); }
    return p.then(function () { return true; }).catch(function () { return false; });
  }

  function probeFile(host, path) {
    return fetchWithTimeout("https://" + host + path, 5000)
      .then(function (r) { return r.ok; })
      .catch(function () { return false; });
  }

  function extract(text, usedHttps) {
    var s = { https: !!usedHttps, reachable: true };
    var doc = null;
    try { doc = new DOMParser().parseFromString(text, "text/html"); } catch (e) {}
    if (!doc) return s;
    var title = (doc.querySelector("title") || { textContent: "" }).textContent || "";
    var t = title.trim();
    s.titleOk = t.length >= 10 && t.length <= 75;
    var metaDesc = doc.querySelector('meta[name="description"]');
    s.metaDesc = !!(metaDesc && (metaDesc.getAttribute("content") || "").trim());
    s.h1 = !!doc.querySelector("h1");
    s.canonical = !!doc.querySelector('link[rel="canonical"]');
    s.viewport = !!doc.querySelector('meta[name="viewport"]');
    var body = doc.body ? (doc.body.innerText || "") : "";
    var words = (body.match(/\S+/g) || []).length;
    s.businessInfo = words >= 80;
    var lower = body.toLowerCase();
    var els = Array.prototype.slice.call(doc.querySelectorAll("a,button"));
    var hasTel = !!doc.querySelector('a[href^="tel:"]');
    s.phone = hasTel || /(\+?\d[\d\s().-]{7,}\d)/.test(body);
    s.email = !!doc.querySelector('a[href^="mailto:"]') || /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(body);
    s.whatsapp = !!doc.querySelector('a[href*="wa.me"], a[href*="whatsapp.com"]');
    s.form = !!doc.querySelector("form") || !!doc.querySelector("input[type=email], textarea");
    var bookingKws = /book|booking|appointment|schedule|reserve|calendly/i;
    s.booking = els.some(function (el) { return bookingKws.test(el.textContent || ""); });
    var orderKws = /order|menu|delivery|takeaway|take away|online order/i;
    s.ordering = els.some(function (el) { return orderKws.test(el.textContent || ""); });
    s.cta = !!(s.whatsapp || s.phone || s.email || s.booking || s.ordering || s.form);
    s.servicesListed = /services|products|menu|about|pricing|what we do|our services/i.test(lower);
    s.contactDetails = !!(s.phone || s.email);
    s.address = !!doc.querySelector('[itemprop="address"], address') || /street|road|avenue|lane|drive|close|boulevard|\baccra\b|\bkumasi\b|\btema\b/i.test(lower);
    s.consistentContact = !!(s.phone && s.email) || (s.phone && s.address);
    var socials = { instagram: /instagram\.com/i, facebook: /facebook\.com|fb\.com/i, tiktok: /tiktok\.com/i, linkedin: /linkedin\.com/i, youtube: /youtube\.com|youtu\.be/i };
    s.social = {};
    var hrefs = Array.prototype.slice.call(doc.querySelectorAll("a[href]"));
    for (var k in socials) s.social[k] = hrefs.some(function (a) { return socials[k].test(a.href || ""); });
    return s;
  }

  function websiteScore(s) {
    var total = 0;
    for (var k in WEIGHTS) { if (s[k]) total += WEIGHTS[k]; }
    var platforms = ["instagram", "facebook", "tiktok", "linkedin", "youtube"];
    var n = 0;
    for (var i = 0; i < platforms.length; i++) { if (s.social && s.social[platforms[i]]) n++; }
    if (n > 0) total += 5;
    if (n >= 2) total += 5;
    return Math.round(total);
  }

  function gradeFor(n) {
    if (n >= 85) return { label: "Strong", color: "var(--ok)" };
    if (n >= 70) return { label: "Good", color: "var(--ok)" };
    if (n >= 50) return { label: "Needs work", color: "var(--warn)" };
    return { label: "Weak", color: "var(--warn)" };
  }

  function setStatus(msg, isErr) {
    statusEl.textContent = msg || "";
    statusEl.classList.toggle("err", !!isErr);
  }

  function showFacts(signals) {
    factsEl.textContent = "";
    FACTS.forEach(function (f) {
      var li = document.createElement("li");
      var label = document.createElement("span");
      label.textContent = f[1];
      var val = document.createElement("b");
      if (signals[f[0]]) { val.textContent = "Yes"; val.className = "on"; }
      else if (f[0] === "robots" || f[0] === "sitemap") { val.textContent = "Couldn't verify"; val.className = "n-a"; }
      else { val.textContent = "Not detected"; val.className = "off"; }
      li.appendChild(label);
      li.appendChild(val);
      factsEl.appendChild(li);
    });
  }

  function showMessage(text) {
    factsEl.textContent = "";
    var li = document.createElement("li");
    li.className = "full";
    li.textContent = text;
    factsEl.appendChild(li);
  }

  function render(r, bizName) {
    resultEl.hidden = false;
    urlLine.textContent = (bizName ? bizName + " — " : "") + (r.url || "");
    if (scoreRing) scoreRing.style.setProperty("--p", (r.status === "ok" && r.score != null) ? r.score : 0);
    if (scoreNum) scoreNum.textContent = (r.status === "ok" && r.score != null) ? String(r.score) : "–";
    if (ctaLink) {
      if (r.status === "ok" && r.score != null && bizName) {
        var follow = "Hi Vision 61 Studios! My business, " + bizName + ", scored " + r.score + "/100 on your free audit. I'd like the full audit.";
        ctaLink.href = "https://wa.me/233201599949?text=" + encodeURIComponent(follow);
        ctaLink.textContent = "Send my result to the studio";
      } else {
        ctaLink.href = "#contact";
        ctaLink.textContent = "Want the full audit? Talk to us";
      }
    }
    if (r.status === "ok" && r.score != null && r.signals) {
      var g = gradeFor(r.score);
      gradeEl.textContent = "Website score: " + r.score + "/100 — " + g.label;
      gradeEl.style.color = g.color;
      showFacts(r.signals);
    } else if (r.status === "blocked") {
      gradeEl.textContent = "Can't inspect from the browser";
      gradeEl.style.color = "var(--warn)";
      showMessage(r.message);
    } else if (r.status === "unreachable") {
      gradeEl.textContent = "Couldn't reach the site";
      gradeEl.style.color = "var(--warn)";
      showMessage(r.message);
    } else {
      gradeEl.textContent = r.summary || "Check couldn't be completed";
      gradeEl.style.color = "var(--warn)";
      factsEl.textContent = "";
    }
  }

  function finalize() {
    if (btn) { btn.disabled = false; btn.textContent = "Check my website"; }
  }

  function analyze(norm) {
    var usedHttps = norm.https;
    var parse = function (resp) {
      if (resp.status >= 400) {
        return { status: "http_error", score: null, url: norm.url, httpStatus: resp.status, summary: "HTTP " + resp.status, message: "The website responded with HTTP " + resp.status + "." };
      }
      return resp.text().catch(function () { return ""; }).then(function (text) {
        var signals = extract(text, usedHttps);
        return probeFile(norm.host, "/robots.txt").then(function (robots) {
          if (robots) signals.robots = true;
          return probeFile(norm.host, "/sitemap.xml").then(function (sitemap) {
            if (sitemap) signals.sitemap = true;
            return { status: "ok", score: websiteScore(signals), url: norm.url, signals: signals, summary: "Analyzed " + norm.host };
          });
        });
      });
    };
    return fetchWithTimeout(norm.url, 8000).then(parse).catch(function () {
      return probe(norm.url).then(function (reachable) {
        if (reachable) {
          return { status: "blocked", score: null, url: norm.url, signals: null, summary: "Can't inspect from the browser", message: "Your site is online, but it blocks browser inspection, so we can't read its content from here. We won't guess — the full audit covers this with a deeper check." };
        }
        if (usedHttps) {
          var httpUrl = "http://" + norm.host + norm.path;
          return probe(httpUrl).then(function (httpReach) {
            if (!httpReach) {
              return { status: "unreachable", score: null, url: norm.url, signals: null, summary: "Couldn't reach the site", message: "Could not reach " + norm.url + ". Check the URL or whether the site is online." };
            }
            return fetchWithTimeout(httpUrl, 8000).then(function (resp) {
              usedHttps = false;
              return parse(resp);
            }).catch(function () {
              return { status: "blocked", score: null, url: norm.url, signals: null, summary: "Can't inspect from the browser", message: "Your site is online, but it blocks browser inspection, so we can't read its content from here. We won't guess — the full audit covers this with a deeper check." };
            });
          });
        }
        return { status: "unreachable", score: null, url: norm.url, signals: null, summary: "Couldn't reach the site", message: "Could not reach " + norm.url + "." };
      });
    });
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (resultEl) resultEl.hidden = true;
    var bizName = nameEl ? nameEl.value.trim() : "";
    var norm = normalizeUrl(input.value);
    if (!norm) {
      if (bizName) {
        var ask = "Hi Vision 61 Studios! Please run a free digital audit for my business: " + bizName + ". I'll share my website details when you reply.";
        var waAsk = "https://wa.me/233201599949?text=" + encodeURIComponent(ask);
        var mailAsk = "mailto:hello@vision61studios.online?subject=" + encodeURIComponent("Free digital audit request — " + bizName) + "&body=" + encodeURIComponent("Please run a free digital audit for my business:\n\nBusiness name: " + bizName);
        if (window.trackEvent) {
          window.trackEvent("audit_start", { method: "manual_audit_request" });
        }
        window.open(waAsk, "_blank", "noopener");
        setStatus("Opening WhatsApp so we can run your audit…");
        var fb = document.createElement("a");
        fb.textContent = "WhatsApp didn't open? Send the request by email instead.";
        fb.href = mailAsk;
        fb.className = "form-fallback";
        statusEl.appendChild(document.createElement("br"));
        statusEl.appendChild(fb);
        return;
      }
      setStatus("Enter a business name or a website address, like www.yourbusiness.com", true);
      return;
    }
    if (window.trackEvent) {
      window.trackEvent("audit_start", { method: "free_digital_audit" });
    }
    setStatus("Checking " + norm.host + "…");
    if (btn) { btn.disabled = true; btn.textContent = "Checking…"; }
    analyze(norm).then(function (r) {
      finalize();
      setStatus("");
      if (r && r.status === "ok" && window.trackEvent) {
        window.trackEvent("audit_complete", { method: "free_digital_audit" });
      }
      render(r, bizName);
    }).catch(function () {
      finalize();
      setStatus("Something went wrong — please try again.", true);
    });
  });
})();

/* ── Analytics (GA4) ─────────────────────────────────────────
   Minimal, privacy-safe event tracking for the marketing site.
   Events never include visitor-entered personal data, message
   contents or URLs. All calls are safe no-ops when Google
   Analytics is unavailable and can never break the website. */
(function () {
  "use strict";

  function trackEvent(eventName, parameters) {
    try {
      if (window.gtag && typeof window.gtag === "function") {
        window.gtag("event", eventName, parameters || {});
      }
    } catch (e) { /* analytics must never break the site */ }
  }
  window.trackEvent = trackEvent;

  function locationOf(el) {
    var node = el;
    while (node && node.nodeType === 1) {
      if (node.classList) {
        if (node.classList.contains("nav")) return "navigation";
        if (node.classList.contains("hero")) return "hero";
      }
      if (node.id === "audit") return "audit";
      if (node.id === "contact") return "contact";
      if (node.tagName === "FOOTER") return "footer";
      node = node.parentNode;
    }
    return "other";
  }

  document.addEventListener("click", function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
    if (!a) return;
    var href = (a.getAttribute("href") || "").trim();
    var loc = locationOf(a);
    if (/^https?:\/\/(wa\.me|api\.whatsapp\.com)\//i.test(href)) {
      trackEvent("contact_whatsapp", { method: "whatsapp", location: loc });
    } else if (/^mailto:/i.test(href)) {
      trackEvent("contact_email", { method: "email", location: loc });
    }
  });

  document.addEventListener("click", function (ev) {
    var card = ev.target && ev.target.closest ? ev.target.closest(".svc-card") : null;
    if (!card) return;
    var h3 = card.querySelector("h3");
    var name = h3 ? h3.textContent.trim() : "";
    if (name) trackEvent("service_interest", { service_name: name });
  });

  var contactForm = document.getElementById("contact-form");
  if (contactForm) {
    var formStartFired = false;
    contactForm.addEventListener("focusin", function () {
      if (!formStartFired) {
        formStartFired = true;
        trackEvent("contact_form_start", { form_name: "main_contact" });
      }
    });
  }
})();

/* ── Page loader ───────────────────────────────────────────
   Brief, non-blocking intro overlay that fades once the page
   finishes loading (or after a hard cap). Skipped entirely for
   prefers-reduced-motion users. Never blocks interaction. */
(function () {
  "use strict";
  var loader = document.getElementById("page-loader");
  if (!loader) return;
  var reduced = false;
  try { reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { /* ignore */ }
  if (reduced) return;
  var hide = function () { loader.classList.add("done"); };
  loader.classList.add("show");
  if (document.readyState === "complete") {
    hide();
  } else {
    window.addEventListener("load", hide);
    setTimeout(hide, 2000);
  }
})();

/* ── Cookie consent ────────────────────────────────────────
   Privacy-first GA4 consent mode. Analytics cookies stay
   denied until the visitor accepts; the choice is remembered
   in localStorage so the banner shows only once. */
(function () {
  "use strict";
  var banner = document.getElementById("cookie-banner");
  if (!banner) return;
  var KEY = "v61-consent-v1";
  var stored = null;
  try { stored = window.localStorage.getItem(KEY); } catch (e) { /* ignore */ }
  if (stored === "accepted" || stored === "essential") return;

  function setConsent(decision) {
    var granted = decision === "accepted";
    try {
      if (window.gtag && typeof window.gtag === "function") {
        window.gtag("consent", "update", {
          ad_storage: granted ? "granted" : "denied",
          analytics_storage: granted ? "granted" : "denied",
          personalization_storage: granted ? "granted" : "denied",
          functionality_storage: granted ? "granted" : "denied"
        });
      }
    } catch (e) { /* analytics must never break the site */ }
    try { window.localStorage.setItem(KEY, decision); } catch (e) { /* ignore */ }
    if (window.trackEvent) {
      window.trackEvent("cookie_decision", { decision: granted ? "accept_all" : "essential_only" });
    }
    banner.hidden = true;
  }

  banner.hidden = false;
  var accept = document.getElementById("cookie-accept");
  var essential = document.getElementById("cookie-essential");
  if (accept) accept.addEventListener("click", function () { setConsent("accepted"); });
  if (essential) essential.addEventListener("click", function () { setConsent("essential"); });
})();

/* ── Portfolio / Our Work ────────────────────────────────────
   Data-driven portfolio for the #work section. Add a project by
   adding one object to portfolioProjects below — the featured
   block, category filters, cards, modal and CTA update
   automatically. Only real work is listed; internal projects and
   concepts are clearly labelled. */
(function () {
  "use strict";
  var root = document.getElementById("work");
  if (!root) return;
  var featuredEl = document.getElementById("portfolio-featured");
  var filtersEl = document.getElementById("portfolio-filters");
  var gridEl = document.getElementById("portfolio-grid");
  if (!featuredEl || !filtersEl || !gridEl) return;

  var PORTFOLIO_CATEGORY_ORDER = ["websites", "branding", "content", "social media", "digital marketing", "audits"];
  var PORTFOLIO_CATEGORY_LABELS = { websites: "Websites", branding: "Branding", content: "Content", "social media": "Social media", "digital marketing": "Digital marketing", audits: "Audits" };
  var PORTFOLIO_TYPE_LABELS = { internal: "Vision 61 Studios \u2014 internal", concept: "Concept" };

  var portfolioProjects = [
    {
      title: "Vision 61 Studios",
      category: "websites",
      type: "internal",
      image: "images/portfolio/vision61-site.webp",
      imageSmall: "images/portfolio/vision61-site-640.webp",
      width: 1280, height: 800,
      alt: "Screenshot of the Vision 61 Studios website homepage",
      description: "A conversion-focused digital studio website built around a clean, premium visual system.",
      overview: "Designed and built in-house, this is the studio's own public home. It combines the Solar Minimal visual system, a full services catalogue, an instant free digital audit tool and this portfolio \u2014 mobile-first, fast and built to turn attention into enquiries.",
      services: ["Web Design", "Development", "SEO", "Analytics"],
      url: "https://vision61studios.online/",
      cta: "Visit the live site",
      featured: true
    },
    {
      title: "Kente Brand Direction",
      category: "branding",
      type: "concept",
      image: "images/portfolio/kente-direction.webp",
      imageSmall: "images/portfolio/kente-direction-640.webp",
      width: 1280, height: 800,
      alt: "Screenshot of the Kente brand direction concept",
      description: "A woven, heritage-inspired brand direction exploring pattern, gold and rust.",
      overview: "An internal brand direction concept exploring a Kente-inspired identity \u2014 woven pattern bands, gold and rust accents on a dark canvas. Produced by the studio as a creative exploration, not client work.",
      services: ["Brand Strategy", "Art Direction", "Visual Identity"],
      url: null,
      cta: "Concept exploration"
    },
    {
      title: "Accra Nights Brand Direction",
      category: "branding",
      type: "concept",
      image: "images/portfolio/accra-nights-direction.webp",
      imageSmall: "images/portfolio/accra-nights-direction-640.webp",
      width: 1280, height: 800,
      alt: "Screenshot of the Accra Nights brand direction concept",
      description: "A bold, nocturnal brand direction concept with a distinctive evening palette.",
      overview: "An internal brand direction concept built around the energy of Accra after dark \u2014 strong contrast, confident type and a memorable night palette. Produced by the studio as a creative exploration, not client work.",
      services: ["Brand Strategy", "Art Direction", "Visual Identity"],
      url: null,
      cta: "Concept exploration"
    },
    {
      title: "Solar Minimal Brand Direction",
      category: "branding",
      type: "concept",
      image: "images/portfolio/solar-minimal-direction.webp",
      imageSmall: "images/portfolio/solar-minimal-direction-640.webp",
      width: 1280, height: 800,
      alt: "Screenshot of the Solar Minimal brand direction concept",
      description: "The studio's own warm, minimal visual system \u2014 paper, terracotta and Fraunces.",
      overview: "The Solar Minimal system that powers this website, explored as a standalone brand direction. Warm paper tones, a terracotta accent and editorial Fraunces typography. Produced by the studio, not client work.",
      services: ["Brand Strategy", "Art Direction", "Visual Identity"],
      url: null,
      cta: "Concept exploration"
    }
  ];

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  }

  function badgeFor(p) {
    return el("span", "portfolio-badge", PORTFOLIO_TYPE_LABELS[p.type] || p.type);
  }

  function catLabel(c) { return PORTFOLIO_CATEGORY_LABELS[c] || c; }

  function imgFor(p, isLazy) {
    var img = el("img");
    img.src = p.image;
    img.setAttribute("srcset", p.imageSmall + " 640w, " + p.image + " 1280w");
    img.setAttribute("sizes", "(max-width: 640px) 640px, 1280px");
    img.alt = p.alt;
    img.setAttribute("loading", isLazy ? "lazy" : "eager");
    img.setAttribute("width", p.width);
    img.setAttribute("height", p.height);
    return img;
  }

  function tagsFor(p) {
    var wrap = el("div", "portfolio-tags");
    p.services.forEach(function (s) { wrap.appendChild(el("span", null, s)); });
    return wrap;
  }

  function ctaFor(p, cls) {
    var a;
    if (p.url) {
      a = el("a", cls, p.cta);
      a.href = p.url;
      a.target = "_blank";
      a.rel = "noopener";
    } else {
      a = el("a", cls, "Start a project");
      a.href = "#contact";
    }
    return a;
  }

  function mediaWrap(p, cls, isLazy) {
    var media = el("div", cls);
    media.appendChild(imgFor(p, isLazy));
    media.appendChild(badgeFor(p));
    return media;
  }

  function renderFeatured(p) {
    featuredEl.textContent = "";
    var card = el("article", "portfolio-featured-card reveal");
    var media = mediaWrap(p, "portfolio-featured-media", true);
    var img = media.querySelector("img");
    img.setAttribute("sizes", "(max-width: 960px) 100vw, 720px");
    var body = el("div", "portfolio-featured-body");
    body.appendChild(el("span", "portfolio-cat", catLabel(p.category)));
    body.appendChild(el("h3", null, p.title));
    body.appendChild(el("p", null, p.overview));
    body.appendChild(tagsFor(p));
    body.appendChild(ctaFor(p, "btn btn-primary"));
    card.appendChild(media);
    card.appendChild(body);
    featuredEl.appendChild(card);
  }

  function cardFor(p) {
    var card = el("article", "portfolio-card reveal");
    card.setAttribute("data-category", p.category);
    card.setAttribute("data-project", p.title);
    card.appendChild(mediaWrap(p, "portfolio-media", true));
    var body = el("div", "portfolio-body");
    body.appendChild(el("span", "portfolio-cat", catLabel(p.category)));
    body.appendChild(el("h3", null, p.title));
    body.appendChild(el("p", null, p.description));
    body.appendChild(tagsFor(p));
    var view = el("button", "portfolio-view");
    view.type = "button";
    view.appendChild(el("span", null, "View project"));
    view.appendChild(el("span", "pf-arrow", "\u2192"));
    view.addEventListener("click", function () { openModal(p); });
    body.appendChild(view);
    card.appendChild(body);
    return card;
  }

  /* reveal — mirrors the page's existing reveal pattern */
  var reduced = false;
  try { reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { /* ignore */ }
  var hasIO = "IntersectionObserver" in window;
  var revealIO = null;
  if (hasIO && !reduced) {
    revealIO = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); obs.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
  }
  function revealEls(els) {
    if (!revealIO) { els.forEach(function (n) { n.classList.add("in"); }); return; }
    els.forEach(function (n) { revealIO.observe(n); });
  }

  var currentFilter = "all";

  function render() {
    var featured = null;
    portfolioProjects.forEach(function (p) { if (p.featured) featured = p; });
    if (featured && (currentFilter === "all" || currentFilter === featured.category)) {
      renderFeatured(featured);
      featuredEl.hidden = false;
      revealEls(Array.prototype.slice.call(featuredEl.querySelectorAll(".portfolio-featured-card")));
    } else {
      featuredEl.hidden = true;
    }
    gridEl.textContent = "";
    var cards = [];
    portfolioProjects.forEach(function (p) {
      if (p.featured) return;
      if (currentFilter === "all" || currentFilter === p.category) cards.push(cardFor(p));
    });
    cards.forEach(function (c) { gridEl.appendChild(c); });
    gridEl.hidden = cards.length === 0;
    revealEls(cards);
  }

  function setFilter(value, btn) {
    currentFilter = value;
    var buttons = Array.prototype.slice.call(filtersEl.querySelectorAll(".portfolio-filter"));
    buttons.forEach(function (b) {
      var on = b === btn;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    render();
  }

  function buildFilters() {
    filtersEl.textContent = "";
    var present = {};
    portfolioProjects.forEach(function (p) { present[p.category] = true; });
    function makeFilter(label, value, active) {
      var b = el("button", "portfolio-filter" + (active ? " active" : ""), label);
      b.type = "button";
      b.setAttribute("aria-pressed", active ? "true" : "false");
      b.addEventListener("click", function () { setFilter(value, b); });
      return b;
    }
    filtersEl.appendChild(makeFilter("All", "all", true));
    PORTFOLIO_CATEGORY_ORDER.forEach(function (c) {
      if (present[c]) filtersEl.appendChild(makeFilter(catLabel(c), c, false));
    });
  }

  /* modal */
  var modal = null, modalMedia = null, modalCat = null, modalTitle = null, modalOverview = null, modalServices = null, modalCta = null, modalClose = null, lastFocused = null;

  function buildModal() {
    if (document.getElementById("portfolio-modal")) return;
    modal = el("div", "portfolio-modal");
    modal.id = "portfolio-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "portfolio-modal-title");
    modal.hidden = true;
    var backdrop = el("div", "portfolio-modal-backdrop");
    backdrop.addEventListener("click", closeModal);
    modal.appendChild(backdrop);
    var panel = el("div", "portfolio-modal-panel");
    modalClose = el("button", "portfolio-modal-close", "\u00d7");
    modalClose.type = "button";
    modalClose.setAttribute("aria-label", "Close project details");
    modalClose.addEventListener("click", closeModal);
    panel.appendChild(modalClose);
    modalMedia = el("div", "portfolio-modal-media");
    panel.appendChild(modalMedia);
    var content = el("div", "portfolio-modal-content");
    modalCat = el("span", "portfolio-cat");
    content.appendChild(modalCat);
    modalTitle = el("h3", null, "");
    modalTitle.id = "portfolio-modal-title";
    content.appendChild(modalTitle);
    modalOverview = el("p", "portfolio-modal-overview");
    content.appendChild(modalOverview);
    modalServices = el("div", "portfolio-modal-services");
    content.appendChild(modalServices);
    modalCta = el("a", "btn btn-primary portfolio-modal-cta");
    content.appendChild(modalCta);
    panel.appendChild(content);
    modal.appendChild(panel);
    document.body.appendChild(modal);
  }

  function onModalKey(e) {
    if (e.key === "Escape" || e.key === "Esc") { e.preventDefault(); closeModal(); }
  }

  function openModal(p) {
    buildModal();
    if (modal.hidden !== true) return;
    lastFocused = document.activeElement;
    modalCat.textContent = catLabel(p.category);
    modalTitle.textContent = p.title;
    modalOverview.textContent = p.overview || p.description;
    modalMedia.textContent = "";
    var img = imgFor(p, false);
    modalMedia.appendChild(img);
    modalMedia.appendChild(badgeFor(p));
    modalServices.textContent = "";
    modalServices.appendChild(el("b", null, "Services"));
    modalServices.appendChild(tagsFor(p));
    if (p.url) {
      modalCta.href = p.url;
      modalCta.target = "_blank";
      modalCta.rel = "noopener";
      modalCta.textContent = p.cta || "Visit project";
    } else {
      modalCta.href = "#contact";
      modalCta.removeAttribute("target");
      modalCta.removeAttribute("rel");
      modalCta.textContent = "Start a project";
    }
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    if (modalClose) modalClose.focus();
    document.addEventListener("keydown", onModalKey);
    if (window.trackEvent) {
      window.trackEvent("portfolio_project_view", { project_name: p.title, category: catLabel(p.category) });
    }
  }

  function closeModal() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.style.overflow = "";
    document.removeEventListener("keydown", onModalKey);
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  buildFilters();
  render();
})();
