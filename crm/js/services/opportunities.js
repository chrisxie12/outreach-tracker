/* VISION 61 CRM — service: OpportunityEngine
   Deterministic, evidence-based. A service is only recommended when an identifiable,
   real gap exists in the collected data. Every recommendation carries:
   service · priority · reason · evidence · add-to-proposal. */
window.V61 = window.V61 || {};

(function () {
  const U = () => V61.Utils;

  const PRI = { high: { key: "high", label: "HIGH", color: "#e5484d" }, medium: { key: "medium", label: "MEDIUM", color: "#e0a53e" }, low: { key: "low", label: "LOW", color: "#8a8a90" } };

  const BOOKING_CATEGORIES = ["salon", "barber", "spa", "beauty salon", "hair salon", "clinic", "dentist", "gym", "consultant", "law firm", "accountant", "travel agency", "restaurant", "cafe", "hotel", "photographer"];
  const FOOD_CATEGORIES = ["restaurant", "cafe", "bakery", "bar", "food", "fast food", "ice cream"];
  const catLower = (b) => String((b && b.category) || (b && b.categoryKey) || "").toLowerCase();
  const inList = (cat, list) => list.some((x) => cat.indexOf(x) >= 0);

  function reviewThreshold() {
    const s = V61.Store.db.settings;
    return (s && s.reviewThreshold != null) ? s.reviewThreshold : 15;
  }

  function websiteSignal(wa, key) { return !!(wa && wa.signals && wa.signals[key]); }
  function websiteSocial(wa, key) { return !!(wa && wa.signals && wa.signals.social && wa.signals.social[key]); }

  function forBusiness(business, audit, websiteAudit, lead) {
    const b = business || {};
    const a = audit || {};
    const w = a.website || {}, g = a.google || {}, c = a.conversion || {}, s = a.social || {};
    const wa = websiteAudit || {};
    const opps = [];
    const push = (service, category, icon, priority, reason, evidence) =>
      opps.push({ service, category, icon, priority, reason, evidence, title: service, desc: reason, addToProposal: true });

    const hasWebsite = !!(b.website) || w.exists === true || (wa.status === "ok" || wa.status === "blocked" || wa.status === "unreachable" || wa.status === "http_error");
    if (!hasWebsite) {
      push("Website Development", "Website", "globe", PRI.high,
        "Business does not have a detected website.",
        b.googlePlaceId ? "Google Places confirms the business exists, but no website URL is associated with the listing." : "No website URL is recorded for this business.");
    } else {
      const ws = V61.Score.websiteScoreFor(b, a, wa);
      const gaps = [];
      if (!w.mobile && !websiteSignal(wa, "viewport") && !websiteSignal(wa, "mobile")) gaps.push("not mobile-friendly");
      if (!w.https && !websiteSignal(wa, "https")) gaps.push("no HTTPS");
      if (!w.cta && !websiteSignal(wa, "cta")) gaps.push("no clear call-to-action");
      if (!w.contact && !websiteSignal(wa, "contactDetails")) gaps.push("no visible contact info");
      if (!w.seo && (!websiteSignal(wa, "metaDesc") && !websiteSignal(wa, "h1"))) gaps.push("weak SEO basics");
      if (ws != null && ws < 50) {
        push("Website Redesign", "Website", "refresh", ws < 30 ? PRI.high : PRI.medium,
          "Existing website has significant improvement opportunities.",
          "Website Score " + ws + "/100" + (gaps.length ? " — " + gaps.slice(0, 3).join(", ") + "." : "."));
      } else if (gaps.length >= 2) {
        push("Website Redesign", "Website", "refresh", PRI.medium,
          "Existing website could be sharper.",
          "Detected gaps: " + gaps.slice(0, 3).join(", ") + ".");
      }
    }

    if (!g.exists && !b.googlePlaceId) {
      push("Google Business Profile Setup", "Google", "mapPin", PRI.high,
        "No Google Business Profile found.",
        "No Google listing or Maps presence was detected for this business.");
    } else if (g.exists || b.googlePlaceId) {
      const missing = [];
      if (g.verified === false) missing.push("not verified");
      if (!g.photos) missing.push("no photos");
      if (!g.description) missing.push("no description");
      if (!g.hours) missing.push("no opening hours");
      if (!g.website_linked && !b.website) missing.push("no linked website");
      if (missing.length) {
        push("Google Business Profile Optimization", "Google", "shield", missing.length >= 3 ? PRI.high : PRI.medium,
          "Google profile has weak completeness.",
          "Missing or weak fields: " + missing.join(", ") + ".");
      }
    }

    const reviews = b.placeReviews != null ? b.placeReviews : (g.reviews === true ? "many" : null);
    if (typeof reviews === "number" && reviews < reviewThreshold()) {
      push("Review Growth Strategy", "Google", "star", PRI.medium,
        "Review count is low for this business category.",
        "Google Places reports " + reviews + " review" + (reviews === 1 ? "" : "s") + ". A review campaign boosts local trust and ranking.");
    }

    const hasWhatsapp = !!(b.whatsapp || b.phone) || c.whatsapp === true || websiteSignal(wa, "whatsapp");
    if (!hasWhatsapp && (b.category || b.phone || b.googlePlaceId)) {
      push("WhatsApp Business / Conversion Setup", "Conversion", "whatsapp", b.phone ? PRI.high : PRI.medium,
        "Potential opportunity: add a direct WhatsApp customer contact path.",
        "No WhatsApp number or wa.me link was detected for this customer-facing local business.");
    }

    const cat = catLower(b);
    if (inList(cat, BOOKING_CATEGORIES) && c.booking !== true && !websiteSignal(wa, "booking")) {
      push("Online Booking", "Conversion", "calendar", PRI.medium,
        "This business category commonly benefits from appointments, but no booking mechanism was detected.",
        "No booking, scheduling, appointment or reservation path was found on the website or in the profile.");
    }

    if (inList(cat, FOOD_CATEGORIES) && c.ordering !== true && !websiteSignal(wa, "ordering")) {
      push("Digital Ordering / Menu", "Conversion", "checkSquare", PRI.medium,
        "No ordering path detected for a food business.",
        "No online ordering, menu, delivery or takeaway flow was found.");
    }

    const seoWeak = [];
    if (!b.googlePlaceId && !g.exists) seoWeak.push("not listed on Google Maps");
    if (g.exists && g.reviews === false) seoWeak.push("few reviews");
    if (wa && wa.status === "ok") {
      if (!websiteSignal(wa, "metaDesc")) seoWeak.push("missing meta description");
      if (!websiteSignal(wa, "h1")) seoWeak.push("missing heading structure");
      if (!websiteSignal(wa, "canonical")) seoWeak.push("missing canonical tag");
    } else if (a.seo && a.seo.maps === false) seoWeak.push("not listed on Google Maps");
    if (seoWeak.length >= 2) {
      push("Local SEO Setup", "SEO", "zap", seoWeak.length >= 3 ? PRI.high : PRI.medium,
        "Multiple local-search weaknesses detected.",
        "Detected: " + seoWeak.slice(0, 3).join(", ") + ".");
    }

    if (!(b.instagramUrl) && !(s.instagram && s.instagram.exists) && !websiteSocial(wa, "instagram")) {
      push("Social Media Setup", "Social", "instagram", PRI.medium,
        "No active Instagram presence detected.",
        "No Instagram URL, profile mention or social link was found.");
    }
    if (!(b.facebookUrl) && !(s.facebook && s.facebook.exists) && !websiteSocial(wa, "facebook")) {
      push("Social Media Setup", "Social", "facebook", PRI.low,
        "No Facebook presence detected.",
        "No Facebook page or link was found.");
    }

    if (c.form !== true && !websiteSignal(wa, "form")) {
      push("Lead Capture & Forms", "Conversion", "send", PRI.low,
        "No contact form or lead capture mechanism detected.",
        "A simple enquiry form turns visitors into measurable enquiries.");
    }

    return opps;
  }

  function forRow(row) {
    const opps = forBusiness(row.business, row.audit, V61.Store.latestWebsiteAudit(row.lead.businessId), row.lead);
    return opps;
  }

  function recommended(row) {
    const opps = forRow(row);
    const rank = { high: 0, medium: 1, low: 2 };
    const seen = {};
    const out = [];
    opps.forEach((o) => {
      if (!seen[o.service]) { seen[o.service] = true; out.push(o); }
    });
    return out.sort((x, y) => (rank[x.priority.key] - rank[y.priority.key]) || (y.category === "Website" ? 1 : 0) - (x.category === "Website" ? 1 : 0));
  }

  function summary(row) {
    const opps = forRow(row);
    const b = row.business || {};
    const name = b.name || "This business";
    const g = (row.audit && row.audit.google) || {};
    const hasG = !!(b.googlePlaceId || g.exists);
    const hasW = !!(b.website || (row.audit && row.audit.website && row.audit.website.exists));
    const openers = [];
    if (hasG && !hasW) openers.push("has a Google presence but no detected website");
    else if (hasW) openers.push("has a website but a weak digital footprint");
    else if (!hasG) openers.push("has almost no digital footprint");
    else openers.push("has a limited digital presence");
    if (!opps.length) {
      return name + " has a solid digital presence. Small optimisations could still sharpen performance and consistency.";
    }
    const top = opps.slice(0, 4).map((o, i) => (i + 1) + ". " + o.service);
    return "This business " + openers[0] + ". The strongest opportunities are: " + top.join(", ") + ".";
  }

  V61.OpportunityEngine = { forBusiness, forRow, recommended, summary, BOOKING_CATEGORIES, FOOD_CATEGORIES };
})();