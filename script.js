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
    dropToggle.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        var open = dropItem.classList.toggle("open");
        dropToggle.setAttribute("aria-expanded", open ? "true" : "false");
        if (open) {
          var firstLink = dropItem.querySelector(".drop-menu a");
          if (firstLink) firstLink.focus();
        }
      } else if (ev.key === "Escape") {
        dropItem.classList.remove("open");
        dropToggle.setAttribute("aria-expanded", "false");
      }
    });
    var dropMenu = dropItem.querySelector(".drop-menu");
    if (dropMenu) {
      dropMenu.addEventListener("keydown", function (ev) {
        var items = Array.prototype.slice.call(dropMenu.querySelectorAll("a"));
        var idx = items.indexOf(document.activeElement);
        if (ev.key === "ArrowDown") {
          ev.preventDefault();
          items[(idx + 1) % items.length].focus();
        } else if (ev.key === "ArrowUp") {
          ev.preventDefault();
          items[(idx - 1 + items.length) % items.length].focus();
        } else if (ev.key === "Escape") {
          dropItem.classList.remove("open");
          dropToggle.setAttribute("aria-expanded", "false");
          dropToggle.focus();
        }
      });
    }
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
    document.querySelectorAll(".svc-card, .pkg-card, .why-card, .proc, .fact, .example-card, .dept-card, .who-card, .show-card, .trust-card")
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

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var val = function (id) {
        var el = document.getElementById(id);
        return el ? el.value.trim() : "";
      };
      var name = val("cf-name");

      if (!name && !val("cf-message")) {
        var firstField = document.getElementById("cf-name");
        if (firstField) firstField.focus();
        if (status) status.textContent = "Please add your name or a message.";
        return;
      }

      // Collect brief selections
      var briefChecks = form.querySelectorAll('input[name="brief"]:checked');
      var briefValues = [];
      briefChecks.forEach(function (cb) { briefValues.push(cb.value); });
      var timeline = form.querySelector('input[name="timeline"]:checked');
      var timelineVal = timeline ? timeline.value : "";

      var btn = form.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
      if (status) status.textContent = "";

      var fd = new FormData(form);
      // Append brief data to form data
      if (briefValues.length) fd.append("brief_items", briefValues.join(", "));
      if (timelineVal) fd.append("timeline", timelineVal);

      fetch(form.action, { method: "POST", body: fd })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.success) {
            if (status) status.textContent = "Thanks! We'll be in touch shortly.";
            form.reset();
          } else {
            if (status) status.textContent = "Something went wrong. Please try again or contact us directly.";
          }
        })
        .catch(function () {
          if (status) status.textContent = "Network error. Please try again or contact us directly.";
        })
        .finally(function () {
          if (btn) { btn.disabled = false; btn.textContent = "Start my project"; }
        });
    });
  }

  var nlForm = document.getElementById("newsletter-form");
  if (nlForm) {
    var nlStatus = document.getElementById("newsletter-status");
    nlForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var btn = nlForm.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = "Subscribing…"; }
      if (nlStatus) nlStatus.textContent = "";
      var fd = new FormData(nlForm);
      fetch(nlForm.action, { method: "POST", body: fd })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.success) {
            if (nlStatus) nlStatus.textContent = "Thanks for subscribing!";
            nlForm.reset();
          } else {
            if (nlStatus) nlStatus.textContent = "Something went wrong. Please try again.";
          }
        })
        .catch(function () {
          if (nlStatus) nlStatus.textContent = "Network error. Please try again.";
        })
        .finally(function () {
          if (btn) { btn.disabled = false; btn.textContent = "Subscribe"; }
        });
    });
  }
})();

/* ── Service cards — mobile tap-to-expand ────────────────
   On small screens the description is hidden; tapping a card
   expands it. Harmless no-op on larger viewports where the
   description is always visible. */
(function () {
  "use strict";
  var cards = document.querySelectorAll(".svc-card");
  if (!cards.length) return;
  Array.prototype.forEach.call(cards, function (card) {
    card.addEventListener("click", function () {
      card.classList.toggle("expanded");
    });
  });
})();

/* ── Instant website check — PageSpeed Insights API ──────
   Calls Google's free PageSpeed Insights API (no key required for
   low volume). Shows mobile & desktop performance scores in
   circular score rings. Handles no-site, blocked, and error cases. */
(function () {
  "use strict";
  var form = document.getElementById("ia-form");
  if (!form) return;

  var input = document.getElementById("ia-url");
  var nameEl = document.getElementById("ia-name");
  var btn = document.getElementById("ia-btn");
  var statusEl = document.getElementById("ia-status");
  var resultEl = document.getElementById("ia-result");
  var mobileRing = document.getElementById("ia-mobile-ring");
  var mobileScore = document.getElementById("ia-mobile-score");
  var mobileGrade = document.getElementById("ia-mobile-grade");
  var desktopRing = document.getElementById("ia-desktop-ring");
  var desktopScore = document.getElementById("ia-desktop-score");
  var desktopGrade = document.getElementById("ia-desktop-grade");
  var urlLine = document.getElementById("ia-url-line");
  var factsEl = document.getElementById("ia-facts");
  var waLink = document.getElementById("ia-wa-link");
  var emailLink = document.getElementById("ia-email-link");
  var consultEl = document.getElementById("ia-consult");
  var consultForm = document.getElementById("ia-consult-form");
  var consultStatus = document.getElementById("lc-status");

  // Store last audit results for lead capture
  var lastAudit = { url: "", mobile: null, desktop: null };

  function gradeFor(n) {
    if (n >= 90) return { label: "Good", cls: "ok" };
    if (n >= 50) return { label: "Needs work", cls: "warn" };
    return { label: "Poor", cls: "bad" };
  }

  function setRing(ring, num, grade, score) {
    if (!ring) return;
    ring.style.setProperty("--p", score != null ? score : 0);
    ring.classList.remove("ok", "warn", "bad");
    ring.classList.add(score != null ? grade.cls : "bad");
    if (num) num.textContent = score != null ? String(score) : "–";
    if (grade) {
      grade.textContent = score != null ? score + "/100 — " + grade.label : "–";
      grade.className = "ia-grade";
    }
  }

  function showFacts(categories) {
    factsEl.textContent = "";
    var items = [
      ["accessibility", "Accessibility"],
      ["best-practices", "Best practices"],
      ["seo", "SEO"]
    ];
    items.forEach(function (f) {
      var cat = categories && categories[f[0]];
      var score = cat && cat.score != null ? Math.round(cat.score * 100) : null;
      var li = document.createElement("li");
      var label = document.createElement("span");
      label.textContent = f[1];
      var val = document.createElement("b");
      if (score != null) {
        val.textContent = score + "/100";
        val.className = score >= 90 ? "on" : score >= 50 ? "n-a" : "off";
      } else {
        val.textContent = "N/A";
        val.className = "n-a";
      }
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

  function buildLinks(url, mobile, desktop) {
    var bizName = nameEl ? nameEl.value.trim() : "";
    var mScore = mobile != null ? mobile : "?";
    var dScore = desktop != null ? desktop : "?";
    var msg = "Hi Vision 61! I ran a free check on " + url + " — mobile: " + mScore + ", desktop: " + dScore + ". I'd like the full audit and fix-list.";
    if (waLink) waLink.href = "https://wa.me/233201599949?text=" + encodeURIComponent(msg);
    var subject = "Free website check — " + (bizName || url);
    var body = "Hi Vision 61 Studios,\n\nI ran a free website check:\nURL: " + url + "\nMobile score: " + mScore + "\nDesktop score: " + dScore + "\n\nI'd like the full audit and fix-list.\n\n" + (bizName ? "Business: " + bizName + "\n" : "") + "Thanks!";
    if (emailLink) emailLink.href = "mailto:hello@vision61studios.online?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  }

  function normalizeUrl(raw) {
    var u = String(raw || "").trim();
    if (!u) return null;
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    try {
      var url = new URL(u);
      if (!url.hostname || url.hostname.indexOf(".") < 0) return null;
      return url.href;
    } catch (e) { return null; }
  }

  function runPsipage(url, strategy) {
    var api = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=" + encodeURIComponent(url) + "&category=performance&category=accessibility&category=best-practices&category=seo&strategy=" + strategy;
    return fetch(api).then(function (r) {
      if (!r.ok) throw new Error("API error " + r.status);
      return r.json();
    }).then(function (data) {
      var cats = data.lighthouseResult && data.lighthouseResult.categories;
      var perf = cats && cats.performance;
      return { score: perf && perf.score != null ? Math.round(perf.score * 100) : null, categories: cats };
    });
  }

  function handleNoUrl() {
    var bizName = nameEl ? nameEl.value.trim() : "";
    if (bizName) {
      var msg = "Hi Vision 61 Studios! Please run a free check for my business: " + bizName + ". I'll share my website when you reply.";
      window.open("https://wa.me/233201599949?text=" + encodeURIComponent(msg), "_blank", "noopener");
      setStatus("Opening WhatsApp so we can run your check…");
      return;
    }
    setStatus("Enter a website address like www.yourbusiness.com", true);
  }

  function setStatus(msg, isErr) {
    statusEl.textContent = msg || "";
    statusEl.classList.toggle("err", !!isErr);
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (resultEl) resultEl.hidden = true;
    var url = normalizeUrl(input.value);
    if (!url) { handleNoUrl(); return; }

    setStatus("Checking " + url + "…");
    if (btn) { btn.disabled = true; btn.textContent = "Checking…"; }

    Promise.all([
      runPsipage(url, "mobile").catch(function () { return { score: null, categories: null }; }),
      runPsipage(url, "desktop").catch(function () { return { score: null, categories: null }; })
    ]).then(function (results) {
      var mobile = results[0];
      var desktop = results[1];

      resultEl.hidden = false;
      urlLine.textContent = url;

      setRing(mobileRing, mobileScore, mobileGrade, mobile.score);
      setRing(desktopRing, desktopScore, desktopGrade, desktop.score);

      var cats = mobile.categories || desktop.categories || {};
      showFacts(cats);
      buildLinks(url, mobile.score, desktop.score);

      // Store audit data for lead capture
      lastAudit = { url: url, mobile: mobile.score, desktop: desktop.score };

      // Show consultation CTA
      if (consultEl) consultEl.hidden = false;

      if (window.trackEvent) {
        window.trackEvent("audit_complete", { method: "psi_api", mobile: mobile.score, desktop: desktop.score });
      }
    }).catch(function () {
      resultEl.hidden = false;
      urlLine.textContent = url;
      setRing(mobileRing, mobileScore, mobileGrade, null);
      setRing(desktopRing, desktopScore, desktopGrade, null);
      showMessage("Something went wrong. Check the URL and try again.");
      buildLinks(url, null, null);
    }).finally(function () {
      if (btn) { btn.disabled = false; btn.textContent = "Check my site"; }
      setStatus("");
    });
  });

  // ── Consultation form handler ────────────────────────────────────
  if (consultForm) {
    consultForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var val = function (id) {
        var el = document.getElementById(id);
        return el ? el.value.trim() : "";
      };
      var name = val("lc-name");
      var email = val("lc-email");
      if (!name || !email) {
        if (consultStatus) consultStatus.textContent = "Please enter your name and email.";
        return;
      }

      var btn = consultForm.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = "Booking…"; }
      if (consultStatus) consultStatus.textContent = "";

      // Submit lead to Supabase
      if (window.V61Leads && window.V61Leads.submit) {
        window.V61Leads.submit({
          name: name,
          business_name: val("lc-business"),
          email: email,
          phone: val("lc-phone"),
          website: lastAudit.url,
          source: "audit_funnel",
          audit_score_mobile: lastAudit.mobile,
          audit_score_desktop: lastAudit.desktop,
          audit_url: lastAudit.url,
          message: "Booked consultation from audit funnel"
        });
      }

      // Also submit to Web3Forms as backup
      var fd = new FormData();
      fd.append("access_key", "f8fa4dc3-a198-4d32-a464-f2a3fdc80ebc");
      fd.append("subject", "New consultation booking from audit funnel");
      fd.append("name", name);
      fd.append("business", val("lc-business"));
      fd.append("email", email);
      fd.append("phone", val("lc-phone"));
      fd.append("website", lastAudit.url);
      fd.append("audit_mobile", lastAudit.mobile != null ? String(lastAudit.mobile) : "N/A");
      fd.append("audit_desktop", lastAudit.desktop != null ? String(lastAudit.desktop) : "N/A");
      fd.append("source", "audit_funnel");

      fetch("https://api.web3forms.com/submit", { method: "POST", body: fd })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.success) {
            if (consultStatus) consultStatus.textContent = "Thanks! We'll reach out on WhatsApp within a day.";
            consultForm.reset();
            if (window.trackEvent) {
              window.trackEvent("booking", { source: "audit_funnel", service: "consultation" });
            }
          } else {
            if (consultStatus) consultStatus.textContent = "Something went wrong. Please try WhatsApp instead.";
          }
        })
        .catch(function () {
          if (consultStatus) consultStatus.textContent = "Network error. Please try WhatsApp instead.";
        })
        .finally(function () {
          if (btn) { btn.disabled = false; btn.textContent = "Book my free consultation"; }
        });
    });
  }
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

  /* ── Quote request CTA tracking ────────────────────────────── */
  document.addEventListener("click", function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest("a[href*='wa.me']") : null;
    if (!a) return;
    var text = decodeURIComponent((a.getAttribute("href") || "").split("?text=")[1] || "");
    if (text.toLowerCase().indexOf("interested in") !== -1) {
      var svc = text.split("interested in ")[1];
      if (svc) svc = svc.split(".")[0].split("%20")[0];
      trackEvent("quote_request", { service_name: svc || "unknown", method: "whatsapp" });
    }
  });

  /* ── Pricing page CTA tracking ──────────────────────────────── */
  document.addEventListener("click", function (ev) {
    var btn = ev.target && ev.target.closest ? ev.target.closest(".price-cta a, .addon-card a") : null;
    if (!btn) return;
    var card = btn.closest(".price-card, .addon-card");
    if (!card) return;
    var h3 = card.querySelector("h3, h4");
    var name = h3 ? h3.textContent.trim() : "";
    if (name) trackEvent("quote_request", { service_name: name, method: "whatsapp", source: "pricing_page" });
  });

  /* ── Audit start tracking ──────────────────────────────────── */
  var iaForm = document.getElementById("ia-form");
  if (iaForm) {
    var auditStartFired = false;
    iaForm.addEventListener("focusin", function () {
      if (!auditStartFired) {
        auditStartFired = true;
        trackEvent("audit_start", { tool: "psi_instant" });
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
      problem: "Needed a professional online presence that converts visitors into enquiries for a new digital studio.",
      whatWeDid: "Designed and built a mobile-first marketing site with instant audit tool, portfolio, services catalogue and integrated CRM.",
      result: "A fast, conversion-optimized website with GA4 tracking, lead capture and clear CTAs across every section.",
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
      problem: "Exploring how traditional Ghanaian Kente patterns could translate into a modern brand identity.",
      whatWeDid: "Created a brand direction concept using woven pattern bands, gold and rust accents on a dark canvas.",
      result: "A distinctive visual direction that bridges heritage and modern brand design.",
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
      problem: "Exploring how the energy of Accra after dark could inspire a bold, memorable brand identity.",
      whatWeDid: "Developed a brand direction with strong contrast, confident type and a distinctive night palette.",
      result: "A high-impact visual system that captures the vibrant energy of Accra's nightlife scene.",
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
      problem: "Creating a warm, approachable visual system that feels premium without being pretentious.",
      whatWeDid: "Designed the Solar Minimal system with warm paper tones, a terracotta accent and editorial Fraunces typography.",
      result: "The visual system powering this website \u2014 clean, warm and distinctly African in its palette.",
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
  var modal = null, modalMedia = null, modalCat = null, modalTitle = null, modalFunnel = null, modalOverview = null, modalServices = null, modalCta = null, modalClose = null, lastFocused = null;

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
    modalFunnel = el("div", "portfolio-modal-funnel");
    content.appendChild(modalFunnel);
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
    if (e.key === "Tab" && modal && !modal.hidden) {
      var focusable = modal.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])');
      if (focusable.length === 0) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function openModal(p) {
    buildModal();
    if (modal.hidden !== true) return;
    lastFocused = document.activeElement;
    modalCat.textContent = catLabel(p.category);
    modalTitle.textContent = p.title;
    modalOverview.textContent = p.overview || p.description;

    // Populate funnel format
    modalFunnel.textContent = "";
    if (p.problem || p.whatWeDid || p.result) {
      var funnelSteps = [
        { label: "Problem", text: p.problem },
        { label: "What Vision 61 did", text: p.whatWeDid },
        { label: "Result", text: p.result }
      ];
      funnelSteps.forEach(function (step) {
        if (!step.text) return;
        var stepEl = el("div", "funnel-step");
        stepEl.appendChild(el("span", "funnel-label", step.label));
        stepEl.appendChild(el("p", "funnel-text", step.text));
        modalFunnel.appendChild(stepEl);
      });
    }
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
      var waMsg = "Hi Vision 61! I saw your " + p.title + " project and I'd like something similar for my business.";
      modalCta.href = "https://wa.me/233201599949?text=" + encodeURIComponent(waMsg);
      modalCta.target = "_blank";
      modalCta.rel = "noopener";
      modalCta.textContent = "Need something similar? Start a project";
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
