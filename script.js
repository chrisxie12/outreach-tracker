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
    document.querySelectorAll(".svc-card, .pkg-card, .why-card, .proc, .fact, .example-card, .dept-card")
  );
  if (hasIO && !reduced) {
    var ro = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); obs.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    reveal.forEach(function (el) { el.classList.add("reveal"); ro.observe(el); });
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
  var btn = document.getElementById("ia-btn");
  var statusEl = document.getElementById("ia-status");
  var resultEl = document.getElementById("ia-result");
  var scoreRing = document.getElementById("ia-score-ring");
  var scoreNum = document.getElementById("ia-score-num");
  var gradeEl = document.getElementById("ia-grade");
  var urlLine = document.getElementById("ia-url-line");
  var factsEl = document.getElementById("ia-facts");

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

  function render(r) {
    resultEl.hidden = false;
    urlLine.textContent = r.url || "";
    if (scoreRing) scoreRing.style.setProperty("--p", (r.status === "ok" && r.score != null) ? r.score : 0);
    if (scoreNum) scoreNum.textContent = (r.status === "ok" && r.score != null) ? String(r.score) : "–";
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
    var norm = normalizeUrl(input.value);
    if (!norm) { setStatus("Please enter a valid website address, like www.yourbusiness.com", true); return; }
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
      render(r);
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
