/* VISION 61 CRM — service: Scoring
   Deterministic, transparent scores. No AI scores, no fabricated numbers.
   ── Website Score (0–100) ─────────────────────────────────────────────
   Technical   20  https 4 · reachable 4 · viewport 4 · mobile 4 · titleOk 4
   SEO         20  metaDesc 4 · h1 4 · canonical 4 · robots 4 · sitemap 4
   Conversion  25  phone 4 · email 4 · whatsapp 4 · cta 4 · booking 3 · ordering 3 · form 3
   Content     15  businessInfo 5 · servicesListed 5 · contactDetails 5
   Social      10  any social link 5 · links on >=2 platforms +5
   Trust       10  address 4 · businessIdentity 4 · consistentContact 2
   Only facts that are actually Detected/Verified/Manual earn points.
   Unknown facts earn nothing and are not penalised. */
window.V61 = window.V61 || {};

(function () {
  const U = () => V61.Utils;

  const WEBSITE_WEIGHTS = {
    https: 4, reachable: 4, viewport: 4, mobile: 4, titleOk: 4,
    metaDesc: 4, h1: 4, canonical: 4, robots: 4, sitemap: 4,
    phone: 4, email: 4, whatsapp: 4, cta: 4, booking: 3, ordering: 3, form: 3,
    businessInfo: 5, servicesListed: 5, contactDetails: 5,
    address: 4, businessIdentity: 4, consistentContact: 2,
  };

  function websiteScore(signals) {
    const s = signals || {};
    let total = 0;
    for (const k in WEBSITE_WEIGHTS) { if (s[k]) total += WEBSITE_WEIGHTS[k]; }
    const socials = ["instagram", "facebook", "tiktok", "linkedin", "youtube"].filter((k) => s.social && s.social[k]).length;
    if (socials > 0) total += 5;
    if (socials >= 2) total += 5;
    return Math.round(total);
  }

  /* Live website score combining analyzer signals (Detected) with manual website checks (Manual).
     websiteAudit is the stored analysis record (V61.Store.latestWebsiteAudit). */
  function websiteScoreFor(business, audit, websiteAudit) {
    const signals = websiteAudit && websiteAudit.signals ? Object.assign({}, websiteAudit.signals) : {};
    const m = (audit && audit.website) || {};
    if (m.https) signals.https = true;
    if (m.mobile) signals.mobile = true;
    if (m.cta) signals.cta = true;
    if (m.contact) { signals.contactDetails = true; signals.phone = signals.phone || true; signals.address = signals.address || true; }
    if (m.seo) signals.metaDesc = signals.metaDesc || true;
    if (m.exists && websiteAudit && websiteAudit.status === "not_available") {
      signals.reachable = true;
    }
    return websiteScore(signals);
  }

  /* 0–100 sub-scores for the audit detail page. A category only reports a score
     when it has enough real data (an applied manual check or an analyzer signal). */
  function scoreBreakdown100(audit, websiteAudit) {
    const S = () => V61.Store;
    const s = S();
    const wa = websiteAudit;
    const w = audit || {};
    const hasAny = (obj) => obj && Object.keys(obj).some((k) => !!obj[k]);
    const website100 = (() => {
      if (wa && wa.status === "ok") return wa.score != null ? wa.score : websiteScoreFor(s.businessOf({ businessId: w.businessId }), audit, wa);
      if (hasAny(w.website)) return websiteScoreFor(s.businessOf({ businessId: w.businessId }), audit, wa);
      return null;
    })();
    const category = (cat, maxChecks) => {
      const checks = S().AUDIT_CHECKS[cat] || [];
      const on = checks.filter(([k]) => w[cat] && w[cat][k]).length;
      if (!on) return null;
      return Math.round((on / checks.length) * 100);
    };
    const social = (() => {
      let on = 0;
      S().SOCIAL_PLATFORMS.forEach((pl) => {
        const c = w.social && w.social[pl];
        if (c) { ["exists", "active", "quality", "consistency"].forEach((k) => { if (c[k]) on++; }); }
      });
      if (!on) return null;
      return Math.round((on / (S().SOCIAL_PLATFORMS.length * 4)) * 100);
    })();
    return [
      { key: "website", label: "Website", score: website100 },
      { key: "google", label: "Google Presence", score: category("google") },
      { key: "social", label: "Social Presence", score: social },
      { key: "conversion", label: "Conversion", score: category("conversion") },
      { key: "branding", label: "Branding", score: category("branding") },
      { key: "seo", label: "SEO", score: category("seo") },
    ].filter((b) => b.score != null);
  }

  /* Data confidence for a given fact, per Part 5. */
  const CONFIDENCE = [
    { key: "verified", label: "Verified", color: "#3f9d5f", desc: "Taken from a trusted configured data source (e.g. Google Places)." },
    { key: "detected", label: "Detected", color: "#335fa8", desc: "Technically detected from the website or another source." },
    { key: "manual", label: "Manual", color: "#e0a53e", desc: "Entered manually by the user." },
    { key: "unknown", label: "Unknown", color: "#8a8a90", desc: "Not verified — do not treat as No." },
  ];
  const confidenceOf = (key) => CONFIDENCE.find((c) => c.key === key) || CONFIDENCE[3];

  /* Build a fact board: label -> confidence, derived from real stored data only. */
  function factBoard(business, audit, websiteAudit) {
    const b = business || {}, a = audit || {}, wa = websiteAudit || {};
    const g = a.google || {};
    const facts = [];
    const add = (label, conf) => facts.push({ label, confidence: conf });
    add("Google rating", b.googlePlaceId || b.placeRating != null ? "verified" : "unknown");
    add("Review count", b.googlePlaceId || b.placeReviews != null ? "verified" : "unknown");
    add("Opening hours", g.hours ? "verified" : (b.googlePlaceId ? "verified" : "unknown"));
    add("Website exists", wa.status === "ok" || wa.status === "blocked" || wa.status === "unreachable" || wa.status === "http_error" ? "detected" : (b.website ? "manual" : "unknown"));
    add("WhatsApp", wa && wa.signals ? (wa.signals.whatsapp ? "detected" : "unknown") : (a.conversion && a.conversion.whatsapp ? "manual" : "unknown"));
    add("Instagram", wa && wa.signals ? (wa.signals.social && wa.signals.social.instagram ? "detected" : "unknown") : (a.social && a.social.instagram && a.social.instagram.exists ? "manual" : "unknown"));
    add("Facebook", wa && wa.signals ? (wa.signals.social && wa.signals.social.facebook ? "detected" : "unknown") : (a.social && a.social.facebook && a.social.facebook.exists ? "manual" : "unknown"));
    add("Online booking", wa && wa.signals ? (wa.signals.booking ? "detected" : "unknown") : (a.conversion && a.conversion.booking ? "manual" : "unknown"));
    add("Online ordering", wa && wa.signals ? (wa.signals.ordering ? "detected" : "unknown") : (a.conversion && a.conversion.ordering ? "manual" : "unknown"));
    add("Contact form", wa && wa.signals ? (wa.signals.form ? "detected" : "unknown") : (a.conversion && a.conversion.form ? "manual" : "unknown"));
    add("Branding quality", a.branding && Object.keys(a.branding).some((k) => a.branding[k]) ? "manual" : "unknown");
    add("Mobile usability", (wa && wa.signals && (wa.signals.mobile || wa.signals.viewport)) ? "detected" : "unknown");
    return facts;
  }

  /* Growth between the two most recent snapshots: { from, to, delta } or null. */
  function growth(snapshots) {
    const snaps = (snapshots || []).filter((x) => x && x.data && x.data.digitalScore != null).slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    if (snaps.length < 2) return null;
    const first = snaps[0].data.digitalScore, last = snaps[snaps.length - 1].data.digitalScore;
    return { from: first, to: last, delta: last - first };
  }

  /* Lead priority badge: HIGH / MEDIUM / LOW, thresholds configurable in settings. */
  function priorityFor(leadScore, oppCount) {
    const p = (V61.Store.db.settings.priority) || { highScore: 75, mediumScore: 55, highOpps: 3 };
    if (leadScore >= p.highScore && oppCount >= p.highOpps) return { key: "high", label: "HIGH", color: "#e5484d" };
    if (leadScore >= p.mediumScore) return { key: "medium", label: "MEDIUM", color: "#e0a53e" };
    return { key: "low", label: "LOW", color: "#8a8a90" };
  }

  V61.Score = { WEBSITE_WEIGHTS, websiteScore, websiteScoreFor, scoreBreakdown100, CONFIDENCE, confidenceOf, factBoard, growth, priorityFor };
})();