/* VISION 61 CRM — data layer: store, scoring, CSV */
(function () {
  const U = () => V61.Utils;
  const KEY = "v61crm_v1";

  /* ── Pipeline stages ── */
  const STAGES = [
    { key: "new", label: "New", color: "#8a8a90" },
    { key: "researching", label: "Researching", color: "#6f8db5" },
    { key: "contacted", label: "Contacted", color: "#ed4217" },
    { key: "responded", label: "Responded", color: "#335fa8" },
    { key: "qualified", label: "Qualified", color: "#e0a53e" },
    { key: "meeting", label: "Meeting", color: "#6b51b5" },
    { key: "proposal", label: "Proposal Sent", color: "#0e7490" },
    { key: "negotiation", label: "Negotiation", color: "#c084fc" },
    { key: "won", label: "Won", color: "#3f9d5f" },
    { key: "lost", label: "Lost", color: "#c2362b" },
  ];
  const stageOf = (key) => STAGES.find((s) => s.key === key) || STAGES[0];

  const CONTACT_STATUS = [
    { key: "not_contacted", label: "Not contacted", color: "#8a8a90" },
    { key: "contacted", label: "Contacted", color: "#ed4217" },
    { key: "replied", label: "Replied", color: "#335fa8" },
    { key: "interested", label: "Interested", color: "#e0a53e" },
    { key: "not_interested", label: "Not interested", color: "#c2362b" },
    { key: "followup", label: "Follow-up", color: "#6b51b5" },
    { key: "meeting_booked", label: "Meeting booked", color: "#0e7490" },
    { key: "proposal_requested", label: "Proposal requested", color: "#c084fc" },
    { key: "won", label: "Won", color: "#3f9d5f" },
    { key: "lost", label: "Lost", color: "#c2362b" },
  ];
  const contactStatusOf = (key) => CONTACT_STATUS.find((s) => s.key === key) || CONTACT_STATUS[0];

  const CHANNELS = ["WhatsApp", "Phone", "Email", "Instagram", "Facebook", "LinkedIn", "In person"];

  /* ── Phase 3: outreach activity types, outcomes, lost reasons, meetings ── */
  const ACTIVITY_TYPES = ["Call", "WhatsApp", "Email", "Instagram", "Facebook", "SMS", "Meeting", "Proposal", "Follow-up", "Note", "Other"];
  const MEETING_TYPES = ["Phone", "WhatsApp", "Zoom", "Google Meet", "In person", "Other"];
  const DEFAULT_OUTCOMES = ["No response", "Interested", "Not interested", "Asked for pricing", "Asked for portfolio", "Asked to call later", "Meeting requested", "Wrong contact", "Already has provider", "Other"];
  const DEFAULT_LOST_REASONS = ["Not interested", "Too expensive", "Already has provider", "No budget", "Bad timing", "Wrong contact", "Could not reach", "Competitor", "Other"];

  const DEFAULT_TEMPLATES = [
    { id: "tpl-wa", channel: "WhatsApp", name: "WhatsApp — first contact", subject: "", active: true,
      message: "Hi {{contactName}}! I'm {{senderName}} from Vision 61 Studios. I came across {{businessName}}{{#location}} in {{location}}{{/location}} and noticed there's room to grow its digital presence{{#category}} as a {{category}} business{{/category}}. We help local businesses get found online — websites, Google Business Profile, WhatsApp and social media. Would you be open to a quick chat? I can also share a free digital audit of your current online presence. No pressure at all — thanks!" },
    { id: "tpl-email", channel: "Email", name: "Email — first contact", subject: "A free digital audit for {{businessName}}", active: true,
      message: "Hi {{contactName}},\n\nI'm {{senderName}} from Vision 61 Studios. I came across {{businessName}}{{#location}} in {{location}}{{/location}} and our team spotted a few ways it could get more customers online{{#category}} (it's a {{category}} business){{/category}}.\n\nWe help local businesses with websites, Google Business Profile, WhatsApp and social media. I'd love to share a free, no-obligation digital audit of {{businessName}}'s current online presence.\n\nWould you be open to a quick call or WhatsApp chat this week?\n\nThanks,\n{{senderName}}\nVision 61 Studios" },
    { id: "tpl-ig", channel: "Instagram", name: "Instagram — first contact (DM)", subject: "", active: true,
      message: "Hi {{contactName}}! Saw {{businessName}} and loved what you're doing. We help local businesses get found online — websites, Google and WhatsApp. Would you be open to a quick chat? No pressure at all." },
    { id: "tpl-li", channel: "LinkedIn", name: "LinkedIn — first contact", subject: "", active: true,
      message: "Hi {{contactName}},\n\nI came across {{businessName}} and noticed some great potential to grow its digital presence online. Vision 61 Studios helps local businesses like yours with websites, Google Business Profile and WhatsApp.\n\nWould you be open to a short call to explore how we could help? Happy to share a free digital audit.\n\nBest regards,\n{{senderName}}" },
  ];

  const TEMPERATURES = [
    { key: "hot", label: "Hot", color: "#ed4217" },
    { key: "warm", label: "Warm", color: "#e0a53e" },
    { key: "cold", label: "Cold", color: "#8a8a90" },
  ];
  const tempOf = (key) => TEMPERATURES.find((t) => t.key === key) || TEMPERATURES[2];

  const scoreBand = (score) => {
    if (score >= 80) return { label: "Strong", color: "#3f9d5f" };
    if (score >= 60) return { label: "Good", color: "#e0a53e" };
    if (score >= 40) return { label: "Needs Improvement", color: "#ed4217" };
    return { label: "Major Opportunity", color: "#c2362b" };
  };

  /* ── Outreach message builder (inherited from Outreach Tracker) ── */
  const buildMessage = (businessName, category) => {
    const profileName = (() => { try { return V61.Store.db.settings.profileName || "Christian"; } catch (e) { return "Christian"; } })();
    return "Hi! I'm " + profileName + " from Vision 61 Studios. I came across " + businessName +
      " and noticed there's room to grow its digital presence" + (category ? " as a " + category + " business" : "") +
      ". We help businesses like yours get found online — websites, Google Business Profile, WhatsApp and social media. A stronger online presence helps customers find you, trust you and reach out. Would you be open to a quick chat? I can also share a free digital audit of your current online presence. No pressure at all — thanks!";
  };

  /* ── Scoring: digital audit ── */
  const AUDIT_WEIGHTS = { website: 25, google: 20, social: 20, branding: 15, conversion: 10, seo: 10 };
  const AUDIT_CHECKS = {
    website: [
      ["exists", "Website exists"], ["mobile", "Mobile friendly"], ["https", "Secure (HTTPS)"],
      ["modern", "Modern design"], ["speed", "Fast loading"], ["cta", "Clear call-to-action"],
      ["contact", "Contact info visible"], ["seo", "SEO basics"],
    ],
    google: [
      ["exists", "Profile exists"], ["verified", "Verified"], ["category", "Correct category"],
      ["photos", "Photos present"], ["reviews", "Has reviews"], ["rating", "Good rating"],
      ["hours", "Opening hours set"], ["description", "Description written"],
      ["website_linked", "Website linked"], ["phone", "Phone number shown"],
    ],
    branding: [
      ["logo", "Has a logo"], ["colors", "Consistent colours"], ["name_consistency", "Consistent naming"],
      ["signage", "Physical signage"], ["packaging", "Packaging / collateral"],
    ],
    conversion: [
      ["whatsapp", "WhatsApp available"], ["booking", "Booking / scheduling"], ["ordering", "Online ordering"],
      ["form", "Contact form / lead capture"], ["cta", "Clear CTA"],
    ],
    seo: [
      ["maps", "Listed on Google Maps"], ["reviews", "Reviews count is healthy"],
      ["keywords", "Targeted keywords used"], ["backlinks", "Local backlinks"],
      ["citations", "Local citations / directories"],
    ],
  };
  const SOCIAL_PLATFORMS = ["instagram", "facebook", "tiktok", "linkedin"];

  const emptyAudit = (businessId) => ({
    id: U().uid("aud"), businessId, createdAt: U().now(),
    website: {}, google: {}, branding: {}, conversion: {}, seo: {},
    social: { instagram: {}, facebook: {}, tiktok: {}, linkedin: {} },
  });

  function auditCategoryScore(audit, cat) {
    const checks = AUDIT_CHECKS[cat];
    if (!checks || !audit) return 0;
    let pass = 0;
    checks.forEach(([k]) => { if (audit[cat] && audit[cat][k]) pass++; });
    return Math.round((pass / checks.length) * AUDIT_WEIGHTS[cat]);
  }
  function auditSocialScore(audit) {
    if (!audit || !audit.social) return 0;
    let pass = 0, total = 0;
    SOCIAL_PLATFORMS.forEach((pl) => {
      const c = audit.social[pl] || {};
      ["exists", "active", "quality", "consistency"].forEach((k) => { total++; if (c[k]) pass++; });
    });
    return Math.round((pass / total) * AUDIT_WEIGHTS.social);
  }
  function digitalScore(audit) {
    if (!audit) return 0;
    /* Website sub-score comes from the live Website Score (analyzer Detected facts + Manual checks)
       when a website analysis record exists; otherwise it falls back to the manual checklist. */
    let websitePts = auditCategoryScore(audit, "website");
    try {
      if (V61.Score) {
        const biz = byId("businesses", audit.businessId);
        const wa = latestWebsiteAudit(audit.businessId);
        websitePts = Math.round(V61.Score.websiteScoreFor(biz, audit, wa) * (AUDIT_WEIGHTS.website / 100));
      }
    } catch (e) {}
    return websitePts + auditCategoryScore(audit, "google") +
      auditSocialScore(audit) + auditCategoryScore(audit, "branding") +
      auditCategoryScore(audit, "conversion") + auditCategoryScore(audit, "seo");
  }
  function auditBreakdown(audit) {
    return [
      { key: "website", label: "Website", score: auditCategoryScore(audit, "website"), max: AUDIT_WEIGHTS.website },
      { key: "google", label: "Google Profile", score: auditCategoryScore(audit, "google"), max: AUDIT_WEIGHTS.google },
      { key: "social", label: "Social Media", score: auditSocialScore(audit), max: AUDIT_WEIGHTS.social },
      { key: "branding", label: "Branding", score: auditCategoryScore(audit, "branding"), max: AUDIT_WEIGHTS.branding },
      { key: "conversion", label: "Conversion", score: auditCategoryScore(audit, "conversion"), max: AUDIT_WEIGHTS.conversion },
      { key: "seo", label: "SEO", score: auditCategoryScore(audit, "seo"), max: AUDIT_WEIGHTS.seo },
    ];
  }

  /* ── Opportunities ── */
  function opportunities(audit, business) {
    const opps = [];
    const a = audit || {};
    const w = a.website || {}, g = a.google || {}, c = a.conversion || {}, s = a.social || {};
    if (!w.exists) opps.push({ icon: "globe", title: "Website opportunity detected", desc: "This business has no website. Build a fast, mobile-friendly site to establish credibility and capture customers." });
    else if (!w.modern || !w.mobile) opps.push({ icon: "refresh", title: "Website redesign opportunity", desc: "The existing website looks dated or isn't mobile-friendly. A modern redesign will improve trust and conversions." });
    if (!g.exists) opps.push({ icon: "mapPin", title: "Google Profile opportunity", desc: "No Google Business Profile found. Optimising one will make the business appear on Maps and local search." });
    else if (!g.verified) opps.push({ icon: "shield", title: "Profile verification opportunity", desc: "Google profile isn't verified. Verification unlocks reviews, photos and better ranking." });
    else if (!g.photos || !g.description) opps.push({ icon: "image", title: "Profile content opportunity", desc: "Google profile is missing photos or a description. Completing these improves discovery and conversion." });
    if (g.reviews && g.reviews < 15) opps.push({ icon: "star", title: "Review growth opportunity", desc: "Only " + (g.reviews || 0) + " reviews found. A review campaign will boost local trust and ranking." });
    if (!c.whatsapp) opps.push({ icon: "whatsapp", title: "WhatsApp conversion opportunity", desc: "No WhatsApp business line. Adding WhatsApp Business lets customers reach them instantly — a proven conversion channel." });
    if (!s.instagram || !s.instagram.exists) opps.push({ icon: "instagram", title: "Social media opportunity", desc: "No active Instagram presence. We can set up and manage a content calendar to attract customers." });
    if (!s.facebook || !s.facebook.exists) opps.push({ icon: "facebook", title: "Facebook presence opportunity", desc: "No Facebook presence detected. Many local customers search there first." });
    if (!c.booking) opps.push({ icon: "calendar", title: "Booking automation opportunity", desc: "No online booking/scheduling. Automating bookings saves time and captures more business." });
    if (!c.form) opps.push({ icon: "checkSquare", title: "Lead capture opportunity", desc: "No contact form or lead capture. Adding one turns visitors into enquiries." });
    if (!g.exists || (g.exists && g.reviews < 5)) opps.push({ icon: "zap", title: "Local SEO opportunity", desc: "Weak local search footprint. Local SEO will put this business in front of nearby customers." });
    return opps;
  }
  function opportunitySummary(opps, business) {
    const name = (business && business.name) || "This business";
    if (!opps.length) return name + " has a solid digital presence. Small optimisations could still sharpen performance and consistency.";
    if (opps.length <= 2) return name + " is close to a strong digital presence. The main opportunities are " + opps.map((o) => o.title.toLowerCase().replace(" opportunity detected", "").replace(" opportunity", "")).join(" and ") + ".";
    return name + " has a weak digital presence relative to its potential. The biggest opportunities are " + opps.slice(0, 3).map((o) => o.title.toLowerCase().replace(" opportunity detected", "").replace(" opportunity", "")).join(", ") + " — a focused engagement would quickly move the needle.";
  }

  /* ── Lead score ── */
  const INDUSTRY = { restaurant: 9, clinic: 7, agency: 8, real_estate: 8, auto: 6, gym: 7, school: 8, salon: 6, fashion: 6, pharmacy: 7, electrical: 5, logistics: 6, bakery: 6, supplies: 6 };
  function leadScore(lead, business, audit) {
    if (lead.scoreOverride != null) return U().clamp(Math.round(lead.scoreOverride), 1, 100);
    const biz = business || {};
    let s = 26; // base
    s += { small: 4, medium: 7, large: 10 }[biz.size] || 5;
    s += INDUSTRY[biz.categoryKey] || 6;
    s += (biz.city ? 5 : 3);
    s += Math.round(((100 - digitalScore(audit)) / 100) * 18);
    s += U().clamp((lead.estimatedValue || 0) / 2000, 0, 10);
    const contacts = V61.Store.contactsFor(business.id);
    const anyC = contacts.some((c) => c.phone || c.whatsapp || c.email);
    if (anyC || biz.phone || biz.whatsapp || biz.email) s += 7;
    const outreach = V61.Store.db.outreach.filter((o) => o.leadId === lead.id);
    s += U().clamp(outreach.length * 2, 0, 6);
    if (outreach.some((o) => ["replied", "interested", "meeting_booked", "proposal_requested"].includes(o.status))) s += 7;
    if (outreach.some((o) => ["meeting_booked", "proposal_requested"].includes(o.status))) s += 5;
    /* Phase 2 factors — all derived from real data. */
    const opps = opportunities(audit, business);
    s += U().clamp(opps.length * 2, 0, 10);
    const wa = latestWebsiteAudit(business && business.id);
    if (wa && wa.score != null) s += wa.score >= 70 ? 2 : wa.score >= 50 ? 3 : 5;
    if (biz.placeRating != null) s += biz.placeRating >= 4.5 ? 4 : biz.placeRating >= 4 ? 2 : 0;
    if (biz.placeReviews != null) s += biz.placeReviews >= 50 ? 4 : biz.placeReviews >= 15 ? 2 : 0;
    return U().clamp(Math.round(s), 1, 100);
  }
  const temperatureFor = (score) => {
    const t = db.settings.leadTemp || { hot: 80, warm: 60 };
    return score >= t.hot ? "hot" : score >= t.warm ? "warm" : "cold";
  };

  /* Phase 2: is this row a HIGH-opportunity prospect? (Part 24) */
  function isHighOpportunity(r) {
    if (!r || !r.lead) return false;
    if (["won", "lost"].includes(r.lead.stage)) return false;
    const b = r.business || {};
    if (!(b.phone || b.whatsapp || b.email)) return false;
    const opps = (V61.OpportunityEngine ? V61.OpportunityEngine.forRow(r) : opportunities(r.audit, b));
    const pri = (V61.Score ? V61.Score.priorityFor(r.leadScore, opps.length) : { key: "low" });
    return pri.key === "high";
  }

  /* ── Store ── */
  const emptyDb = () => ({
    schema: 1,
    businesses: [], contacts: [], audits: [], leads: [], outreach: [], followups: [], tasks: [], notes: [],
    activity: [], services: [], proposals: [], clients: [], payments: [],
    websiteAudits: [], auditSnapshots: [], meetings: [], outreachDrafts: [], outreachTemplates: [], tags: [],
    projects: [], projectTasks: [], milestones: [], invoices: [], invoiceItems: [], approvals: [], revisions: [],
    clientContacts: [],
    settings: { profileName: "Christian", company: "Vision 61 Studios", theme: "dark", sidebarCollapsed: false, currency: "GHS", googleMapsApiKey: "", discoveryProvider: "", reviewThreshold: 15, leadTemp: { hot: 80, warm: 60 }, priority: { highScore: 75, mediumScore: 55, highOpps: 3 }, targetAreas: [], batchLimit: 10, responseOutcomes: DEFAULT_OUTCOMES.slice(), lostReasons: DEFAULT_LOST_REASONS.slice(), aiConfig: { provider: "", enabled: false, gatewayUrl: "", model: "openai/gpt-oss-20b" } },
  });

  const PROJECT_STATUS = [
    { key: "not_started", label: "Not Started", color: "#8a8a90" },
    { key: "onboarding", label: "Onboarding", color: "#6f8db5" },
    { key: "in_progress", label: "In Progress", color: "#335fa8" },
    { key: "waiting_on_client", label: "Waiting on Client", color: "#e0a53e" },
    { key: "in_review", label: "In Review", color: "#6b51b5" },
    { key: "revision", label: "Revision", color: "#c084fc" },
    { key: "completed", label: "Completed", color: "#3f9d5f" },
    { key: "cancelled", label: "Cancelled", color: "#e5484d" },
  ];
  const projectStatusOf = (key) => PROJECT_STATUS.find((s) => s.key === key) || PROJECT_STATUS[0];

  const TASK_STATUS = [
    { key: "todo", label: "Todo", color: "#8a8a90" },
    { key: "in_progress", label: "In Progress", color: "#335fa8" },
    { key: "blocked", label: "Blocked", color: "#e5484d" },
    { key: "waiting_on_client", label: "Waiting on Client", color: "#e0a53e" },
    { key: "in_review", label: "In Review", color: "#6b51b5" },
    { key: "done", label: "Done", color: "#3f9d5f" },
    { key: "cancelled", label: "Cancelled", color: "#8a8a90" },
  ];
  const taskStatusOf = (key) => TASK_STATUS.find((s) => s.key === key) || TASK_STATUS[0];

  const TASK_PRIORITY = [
    { key: "low", label: "Low", color: "#8a8a90" },
    { key: "medium", label: "Medium", color: "#e0a53e" },
    { key: "high", label: "High", color: "#ed4217" },
    { key: "urgent", label: "Urgent", color: "#e5484d" },
  ];

  const INVOICE_STATUS = [
    { key: "draft", label: "Draft", color: "#8a8a90" },
    { key: "sent", label: "Sent", color: "#335fa8" },
    { key: "partially_paid", label: "Partially Paid", color: "#e0a53e" },
    { key: "paid", label: "Paid", color: "#3f9d5f" },
    { key: "overdue", label: "Overdue", color: "#e5484d" },
    { key: "cancelled", label: "Cancelled", color: "#8a8a90" },
  ];
  const invoiceStatusOf = (key) => INVOICE_STATUS.find((s) => s.key === key) || INVOICE_STATUS[0];

  const DEFAULT_PROJECT_TEMPLATES = [
    {
      id: "tpl-proj-web",
      name: "Website Development",
      tasks: [
        { title: "Discovery call", priority: "medium" },
        { title: "Content collection", priority: "medium" },
        { title: "Sitemap", priority: "medium" },
        { title: "Wireframe", priority: "medium" },
        { title: "Homepage design", priority: "high" },
        { title: "Inner pages", priority: "medium" },
        { title: "Responsive development", priority: "high" },
        { title: "Contact form", priority: "medium" },
        { title: "WhatsApp integration", priority: "medium" },
        { title: "SEO basics", priority: "medium" },
        { title: "Testing", priority: "medium" },
        { title: "Client review", priority: "high" },
        { title: "Revisions", priority: "medium" },
        { title: "Deployment", priority: "high" },
        { title: "Handover", priority: "medium" }
      ]
    },
    {
      id: "tpl-proj-gbo",
      name: "Google Business Optimization",
      tasks: [
        { title: "Business information review", priority: "medium" },
        { title: "Category review", priority: "medium" },
        { title: "Description", priority: "medium" },
        { title: "Services", priority: "medium" },
        { title: "Photos", priority: "medium" },
        { title: "Contact information", priority: "medium" },
        { title: "Review strategy", priority: "medium" },
        { title: "Local SEO checks", priority: "medium" },
        { title: "Final verification", priority: "high" }
      ]
    }
  ];

  const SETTINGS_DEFAULTS = { profileName: "Christian", company: "Vision 61 Studios", theme: "dark", sidebarCollapsed: false, currency: "GHS", googleMapsApiKey: "", discoveryProvider: "", reviewThreshold: 15, leadTemp: { hot: 80, warm: 60 }, priority: { highScore: 75, mediumScore: 55, highOpps: 3 }, targetAreas: [], batchLimit: 10, responseOutcomes: DEFAULT_OUTCOMES.slice(), lostReasons: DEFAULT_LOST_REASONS.slice(), aiConfig: { provider: "", enabled: false, gatewayUrl: "", model: "openai/gpt-oss-20b" } };

  /* ── Official Vision 61 Studios launch service catalog ──
     Seed values. Prices are numeric Ghana cedis (no "GH₵" in the field).
     The Digital Audit is a free acquisition mechanism and is intentionally
     NOT a catalog service. No recurring services are included yet. */
  const OFFICIAL_SERVICES = [
    { id: "svc-website-development", name: "Website Development", description: "Professional responsive website designed for small and growing businesses. Includes essential business pages, mobile optimization, contact options, WhatsApp integration, basic SEO, analytics setup, and launch support.", price: 3500, deliveryDays: 14, active: true },
    { id: "svc-landing-page-development", name: "Landing Page Development", description: "High-converting single-page website designed to promote a business, product, service, campaign, or specific offer with clear calls to action.", price: 1500, deliveryDays: 5, active: true },
    { id: "svc-website-redesign", name: "Website Redesign", description: "Modern redesign of an existing website to improve its appearance, mobile experience, usability, performance, and ability to convert visitors into customers.", price: 2500, deliveryDays: 10, active: true },
    { id: "svc-ecommerce-website", name: "E-commerce Website", description: "Custom online store with product listings, shopping cart, checkout, payment integration, order management, mobile optimization, and essential e-commerce configuration. Final pricing depends on store complexity and product volume.", price: 10000, deliveryDays: 30, active: true },
    { id: "svc-gbp-setup", name: "Google Business Profile Setup", description: "Set up and configure a Google Business Profile so customers can discover the business through Google Search and Maps, including essential business information and profile configuration.", price: 500, deliveryDays: 2, active: true },
    { id: "svc-gbp-optimization", name: "Google Business Profile Optimization", description: "Optimize an existing Google Business Profile to improve its completeness, presentation, local visibility, customer information, and conversion opportunities.", price: 750, deliveryDays: 3, active: true },
    { id: "svc-local-seo-setup", name: "Local SEO Setup", description: "Establish the foundations for local search visibility, including local business information, on-page fundamentals, location signals, and essential search configuration.", price: 1000, deliveryDays: 5, active: true },
    { id: "svc-seo-setup-optimization", name: "SEO Setup & Optimization", description: "Improve the technical and on-page foundations of a business website to make it easier for search engines to understand and customers to discover.", price: 1500, deliveryDays: 7, active: true },
    { id: "svc-logo-design", name: "Logo Design", description: "Custom logo design created to give a business a professional and recognizable visual identity across digital and physical platforms.", price: 800, deliveryDays: 5, active: true },
    { id: "svc-basic-brand-identity", name: "Basic Brand Identity", description: "A foundational visual identity package covering the logo direction, typography, color system, and basic brand usage guidelines for a consistent business presence.", price: 1500, deliveryDays: 7, active: true },
    { id: "svc-social-media-setup", name: "Social Media Setup", description: "Set up and professionally configure selected business social media profiles, including profile information, branding elements, contact details, and essential business links.", price: 500, deliveryDays: 2, active: true },
    { id: "svc-business-email-setup", name: "Business Email Setup", description: "Set up professional business email using the client's domain, including account configuration and essential email settings.", price: 400, deliveryDays: 1, active: true },
  ];

  const normalizeServiceName = (name) => String(name || "").trim().toLowerCase();

  /* Seed the official launch catalog into db.services.
     Non-destructive and idempotent: only creates official services that are
     missing (matched by stable id, else exact normalized name). Existing
     services — including user-edited prices/descriptions and intentionally
     deactivated ones — are NEVER overwritten, NEVER reactivated, NEVER
     deleted, and no duplicate is ever created. Only touches db.services.
     Runs on every boot; cheap no-op when everything is already present. */
  function seedOfficialCatalog() {
    if (!db || !Array.isArray(db.services)) return 0;
    let created = 0;
    OFFICIAL_SERVICES.forEach((off) => {
      const exists = db.services.some((s) => s.id === off.id) ||
        db.services.some((s) => normalizeServiceName(s.name) === normalizeServiceName(off.name));
      if (!exists) {
        db.services.push({ id: off.id, name: off.name, description: off.description, price: off.price, deliveryDays: off.deliveryDays, active: off.active });
        created++;
      }
    });
    if (created) save();
    return created;
  }

  let db = null;
  const listeners = { change: [] };

  function pushActivity(d, leadId, type, text) {
    d.activity.unshift({ id: U().uid("act"), leadId, type, text, createdAt: U().now() });
  }

  function migrate(d) {
    d = d || emptyDb();
    const base = emptyDb();
    Object.keys(base).forEach((k) => {
      if (Array.isArray(base[k])) d[k] = Array.isArray(d[k]) ? d[k] : [];
    });
    d.settings = Object.assign({}, SETTINGS_DEFAULTS, d.settings || {});
    d.websiteAudits = d.websiteAudits || [];
    d.auditSnapshots = d.auditSnapshots || [];
    d.meetings = d.meetings || [];
    d.outreachDrafts = d.outreachDrafts || [];
    d.outreachTemplates = (d.outreachTemplates && d.outreachTemplates.length) ? d.outreachTemplates : DEFAULT_TEMPLATES.map((t) => Object.assign({}, t));
    d.tags = d.tags || [];
    d.settings.responseOutcomes = (d.settings.responseOutcomes && d.settings.responseOutcomes.length) ? d.settings.responseOutcomes : DEFAULT_OUTCOMES.slice();
    d.settings.lostReasons = (d.settings.lostReasons && d.settings.lostReasons.length) ? d.settings.lostReasons : DEFAULT_LOST_REASONS.slice();
    d.settings.aiConfig = Object.assign({ provider: "", enabled: false, gatewayUrl: "", model: "openai/gpt-oss-20b" }, d.settings.aiConfig || {});
    return d;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const d = JSON.parse(raw); if (d && d.schema === 1) { db = migrate(d); return; } }
    } catch (e) {}
    const migrated = migrateLegacy();
    db = migrate(migrated);
    persist();
  }

  function migrateLegacy() {
    try {
      const old = JSON.parse(localStorage.getItem("leads") || "null");
      if (!old || !Array.isArray(old) || !old.length) return null;
      if (localStorage.getItem(KEY)) return null;
      const d = emptyDb();
      old.forEach((l, i) => {
        const now = U().now();
        const biz = { id: "b-legacy-" + i, name: l.name || "Business " + (i + 1), category: l.type || "", categoryKey: "", address: l.address || "", city: "", phone: l.phone || "", whatsapp: l.phone || "", email: "", website: "", notes: l.notes || "", createdAt: now, updatedAt: now };
        d.businesses.push(biz);
        const stage = l.status === "contacted" ? "contacted" : l.status === "won" ? "won" : l.status === "declined" ? "lost" : "new";
        d.leads.push({ id: "l-legacy-" + i, businessId: biz.id, stage, temperature: "cold", estimatedValue: 0, source: "legacy", createdAt: now, updatedAt: now, lastContacted: l.lastContacted || null, notes: l.notes || "" });
        d.activity.push({ id: U().uid("act"), leadId: "l-legacy-" + i, type: "note", text: "Imported from Outreach Tracker. " + (l.notes || ""), createdAt: now });
      });
      pushActivity(d, null, "system", "Migrated " + old.length + " lead(s) from Outreach Tracker.");
      localStorage.removeItem("leads");
      return d;
    } catch (e) { return null; }
  }

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {}
  }
  function save() { persist(); emit(); }

  function emit() { listeners.change.forEach((fn) => { try { fn(db); } catch (e) {} }); }
  function on(fn) { listeners.change.push(fn); }

  function byId(col, id) { return db[col].find((x) => x.id === id) || null; }
  function businessByGooglePlace(placeId) { return db.businesses.find((b) => b.googlePlaceId === placeId) || null; }
  function businessByName(name) { return db.businesses.find((b) => b.name.toLowerCase() === String(name || "").toLowerCase()) || null; }
  function businessOf(lead) { return byId("businesses", lead.businessId); }
  function auditOf(businessId) { return db.audits.find((a) => a.businessId === businessId) || null; }
  /* ── Phase 2: website audit records + audit snapshots (history) ── */
  function saveWebsiteAudit(businessId, data) {
    const d = data || {};
    const rec = { id: U().uid("wa"), businessId, createdAt: U().now(), status: d.status || "error", score: d.score != null ? d.score : null, url: d.url || null, signals: d.signals || null, summary: d.summary || "", message: d.message || "", httpStatus: d.httpStatus || null };
    db.websiteAudits.push(rec);
    return rec;
  }
  function latestWebsiteAudit(businessId) {
    let best = null;
    for (const w of db.websiteAudits) {
      if (w.businessId !== businessId) continue;
      // forward iteration: on equal createdAt the later-inserted record wins
      if (!best || (w.createdAt || 0) >= (best.createdAt || 0)) best = w;
    }
    return best;
  }
  function websiteAuditsFor(businessId) {
    return db.websiteAudits.filter((w) => w.businessId === businessId).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }
  function saveAuditSnapshot(businessId, data) {
    const rec = { id: U().uid("snap"), businessId, createdAt: U().now(), data: data || {} };
    db.auditSnapshots.push(rec);
    return rec;
  }
  function auditSnapshotsFor(businessId) {
    return db.auditSnapshots.filter((x) => x.businessId === businessId).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }
  function leadOf(businessId) { return db.leads.find((l) => l.businessId === businessId) || null; }
  function contactsFor(businessId) { return db.contacts.filter((c) => c.businessId === businessId); }
  function clientOf(businessId) { return db.clients.find((c) => c.businessId === businessId) || null; }
  function clientById(clientId) { return db.clients.find((c) => c.id === clientId) || null; }
  function clientBusiness(clientId) {
    const cl = clientById(clientId);
    return cl ? businessOf({ businessId: cl.businessId }) : null;
  }
  function ensureClient(lead) {
    if (!lead || !lead.businessId) return null;
    const existing = clientOf(lead.businessId);
    if (existing) return existing;
    const biz = businessOf(lead);
    if (!biz) return null;
    const c = {
      id: U().uid("cl"),
      businessId: biz.id,
      leadId: lead.id,
      status: "active",
      createdAt: U().now(),
      services: [],
      contacts: [],
      notes: []
    };
    db.clients.push(c);

    // Also copy contacts from business to client contacts if any
    const bizContacts = contactsFor(biz.id);
    bizContacts.forEach(bc => {
      db.clientContacts.push({
        id: U().uid("cc"),
        clientId: c.id,
        name: bc.name,
        role: bc.role,
        phone: bc.phone,
        email: bc.email,
        preferredChannel: bc.whatsapp ? "WhatsApp" : (bc.email ? "Email" : "Phone"),
        createdAt: U().now()
      });
    });

    addActivity(lead.id, "proposal", "Lead converted to client.");
    return c;
  }
  function paymentsFor(clientId) { return db.payments.filter((p) => p.clientId === clientId); }
  function proposalsFor(leadId) { return db.proposals.filter((p) => p.leadId === leadId); }
  function outreachFor(leadId) { return db.outreach.filter((o) => o.leadId === leadId).sort((a, b) => (b.contactedAt || 0) - (a.contactedAt || 0)); }
  function followupsFor(leadId) { return db.followups.filter((f) => f.leadId === leadId); }
  function tasksFor(leadId) { return db.tasks.filter((t) => t.leadId === leadId); }
  function notesFor(leadId) { return db.notes.filter((n) => n.leadId === leadId); }
  function activityFor(leadId) { return db.activity.filter((a) => a.leadId === leadId).sort((a, b) => b.createdAt - a.createdAt); }

  function addActivity(leadId, type, text) {
    db.activity.unshift({ id: U().uid("act"), leadId, type, text, createdAt: U().now() });
  }

  function addBusiness(data) {
    const now = U().now();
    const biz = Object.assign({ id: U().uid("b"), createdAt: now, updatedAt: now, notes: "" }, data);
    db.businesses.push(biz);
    return biz;
  }
  function addLead(businessId, data) {
    const now = U().now();
    const lead = Object.assign({ id: U().uid("l"), businessId, stage: "new", temperature: "cold", estimatedValue: 0, source: "manual", lastContacted: null, notes: "", scoreOverride: null, createdAt: now, updatedAt: now }, data || {});
    db.leads.push(lead);
    addActivity(lead.id, "lead", "Lead added from " + (lead.source || "manual") + ".");
    return lead;
  }

  /* Add a business discovered from an external source (e.g. Google Places).
     Returns { business, lead } reusing an existing record when already in the CRM. */
  function addDiscoveredBusiness(place) {
    const p = place || {};
    const gid = p.googlePlaceId || p.placeId || "";
    const existing = gid ? businessByGooglePlace(gid) : businessByName(p.name);
    if (existing) {
      const lead = leadOf(existing.id) || addLead(existing.id, { source: p.source || "discovery" });
      return { business: existing, lead, created: false };
    }
    const biz = addBusiness({
      name: p.name || "Untitled business",
      category: p.category || "",
      categoryKey: p.categoryKey || "",
      address: p.address || "",
      city: p.city || "",
      phone: p.phone || "",
      whatsapp: p.whatsapp || "",
      email: p.email || "",
      website: p.website || "",
      googleProfileUrl: p.googleProfileUrl || (gid ? "https://www.google.com/maps/place/?q=place_id:" + gid : ""),
      instagramUrl: p.instagramUrl || "",
      facebookUrl: p.facebookUrl || "",
      googlePlaceId: gid,
      placeRating: p.rating || null,
      placeReviews: p.reviews || null,
      placeLat: p.lat || null,
      placeLng: p.lng || null,
      discoveryQuery: p.query || "",
      notes: p.notes || "",
    });
    const lead = addLead(biz.id, { source: p.source || "discovery" });
    return { business: biz, lead, created: true };
  }
  function addContact(businessId, data) {
    const c = Object.assign({ id: U().uid("c"), businessId, createdAt: U().now() }, data);
    db.contacts.push(c);
    return c;
  }
  function upsertAudit(businessId, partial) {
    let a = auditOf(businessId);
    if (!a) { a = emptyAudit(businessId); db.audits.push(a); }
    ["website", "google", "branding", "conversion", "seo"].forEach((cat) => {
      if (partial[cat]) a[cat] = Object.assign({}, a[cat], partial[cat]);
    });
    if (partial.social) {
      SOCIAL_PLATFORMS.forEach((pl) => { if (partial.social[pl]) a.social[pl] = Object.assign({}, a.social[pl], partial.social[pl]); });
    }
    a.updatedAt = U().now();
    return a;
  }

  function nextFollowup(leadId) {
    return db.followups
      .filter((f) => f.leadId === leadId && f.status === "pending")
      .sort((a, b) => (a.dueDate || 0) - (b.dueDate || 0))[0] || null;
  }
  function nextTask(leadId) {
    return db.tasks
      .filter((t) => t.leadId === leadId && t.status !== "done")
      .sort((a, b) => (a.dueDate || 0) - (b.dueDate || 0))[0] || null;
  }

  /* ── Phase 3: follow-up states, meetings, drafts, templates, tags ── */
  function followupState(f, nowTs) {
    const now = nowTs || U().now();
    if (!f) return null;
    if (f.status === "done") return { key: "completed", label: "Completed", color: "#3f9d5f" };
    if (f.status === "cancelled") return { key: "cancelled", label: "Cancelled", color: "#8a8a90" };
    const due = f.dueDate || 0;
    if (due && due < U().dayStart(now)) return { key: "overdue", label: "Overdue", color: "#e5484d" };
    if (due && U().dayStart(due) === U().dayStart(now)) return { key: "today", label: "Due today", color: "#e0a53e" };
    return { key: "upcoming", label: "Upcoming", color: "#335fa8" };
  }
  function cancelFollowup(fid) { const f = byId("followups", fid); if (f) { f.status = "cancelled"; f.completedAt = U().now(); } }

  function meetingsFor(leadId) { return db.meetings.filter((m) => m.leadId === leadId).sort((a, b) => (a.date || 0) - (b.date || 0)); }
  function upcomingMeetings() {
    const now = U().now();
    return db.meetings.filter((m) => (m.date || 0) >= U().dayStart(now) && m.status !== "done").sort((a, b) => (a.date || 0) - (b.date || 0));
  }
  function addMeeting(leadId, data) {
    const m = Object.assign({ id: U().uid("m"), leadId, status: "scheduled", createdAt: U().now() }, data);
    db.meetings.push(m);
    return m;
  }

  function outreachDraftsFor(leadId) { return db.outreachDrafts.filter((d) => d.leadId === leadId).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); }
  function saveOutreachDraft(leadId, data) {
    const rec = Object.assign({ id: U().uid("draft"), leadId, createdAt: U().now() }, data);
    db.outreachDrafts.unshift(rec);
    return rec;
  }
  function activeTemplates() { return db.outreachTemplates.filter((t) => t.active !== false); }

  function tagsFor(businessId) {
    return db.tags.filter((t) => t.businessId === businessId);
  }
  function addTag(businessId, label) {
    const existing = db.tags.find((t) => t.businessId === businessId && t.label.toLowerCase() === String(label).toLowerCase());
    if (existing) return existing;
    const t = { id: U().uid("tag"), businessId, label: String(label).trim(), createdAt: U().now() };
    db.tags.push(t);
    return t;
  }
  function removeTag(tagId) { db.tags = db.tags.filter((t) => t.id !== tagId); }

  /* ── Phase 3: lifecycle + lead helpers ── */
  function lifecycleStatus(lead) {
    const stage = lead && lead.stage;
    if (stage === "won") return { key: "won", label: "Won", color: "#3f9d5f", index: 8 };
    if (stage === "lost") return { key: "lost", label: "Lost", color: "#c2362b", index: 8 };
    const map = {
      new: { key: "not_contacted", label: "Not contacted", color: "#8a8a90", index: 0 },
      researching: { key: "not_contacted", label: "Not contacted", color: "#8a8a90", index: 0 },
      contacted: { key: "contacted", label: "Contacted", color: "#ed4217", index: 1 },
      responded: { key: "responded", label: "Responded", color: "#335fa8", index: 2 },
      qualified: { key: "interested", label: "Interested", color: "#e0a53e", index: 3 },
      meeting: { key: "meeting", label: "Meeting scheduled", color: "#6b51b5", index: 4 },
      proposal: { key: "proposal", label: "Proposal sent", color: "#0e7490", index: 5 },
      negotiation: { key: "negotiating", label: "Negotiating", color: "#c084fc", index: 6 },
    };
    return map[stage] || { key: "not_contacted", label: "Not contacted", color: "#8a8a90", index: 0 };
  }
  function contactNameFor(leadId) {
    const lead = byId("leads", leadId);
    if (!lead) return "Unknown contact";
    const c = contactsFor(lead.businessId)[0];
    return (c && c.name) ? c.name : "Unknown contact";
  }
  function recommendedServicesFor(leadId) {
    try {
      const lead = byId("leads", leadId);
      if (!lead) return [];
      const row = { lead, business: businessOf(lead), audit: auditOf(lead.businessId) };
      if (V61.OpportunityEngine && V61.OpportunityEngine.recommended) return V61.OpportunityEngine.recommended(row).map((o) => o.service);
    } catch (e) {}
    return [];
  }
  function lastInteractionFor(leadId) {
    let ts = 0;
    const o = outreachFor(leadId)[0]; if (o) ts = Math.max(ts, o.contactedAt || 0);
    const m = meetingsFor(leadId).slice(-1)[0]; if (m) ts = Math.max(ts, m.date || 0);
    const f = followupsFor(leadId).filter((x) => x.status === "done").sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))[0]; if (f) ts = Math.max(ts, f.completedAt || 0);
    const n = notesFor(leadId).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0]; if (n) ts = Math.max(ts, n.createdAt || 0);
    const p = proposalsFor(leadId).slice(-1)[0]; if (p) ts = Math.max(ts, p.createdAt || 0);
    return ts || null;
  }
  function timeToFirstResponse(leadId) {
    const os = outreachFor(leadId);
    const firstContact = os[os.length - 1];
    if (!firstContact) return null;
    const responded = os.find((o) => ["replied", "interested", "meeting_booked", "proposal_requested"].includes(o.status));
    if (!responded) return null;
    return Math.max(0, (responded.contactedAt || 0) - (firstContact.contactedAt || 0));
  }
  function daysContactToMeeting(leadId) {
    const os = outreachFor(leadId);
    const firstContact = os[os.length - 1];
    if (!firstContact) return null;
    const ms = meetingsFor(leadId).filter((m) => (m.date || 0) >= (firstContact.contactedAt || 0)).sort((a, b) => (a.date || 0) - (b.date || 0))[0];
    if (!ms) return null;
    return Math.round(((ms.date - firstContact.contactedAt) / 86400000) * 10) / 10;
  }
  function daysProposalToWin(leadId) {
    const ps = proposalsFor(leadId).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    if (!ps.length) return null;
    const lead = byId("leads", leadId);
    if (!lead || lead.stage !== "won" || !lead.wonAt) return null;
    return Math.round(((lead.wonAt - ps[0].createdAt) / 86400000) * 10) / 10;
  }

  /* ── Phase 3: won / lost transitions ── */
  function markLost(leadId, reason, notes) {
    const lead = byId("leads", leadId);
    if (!lead) return;
    lead.stage = "lost"; lead.lostReason = reason || ""; lead.lostNotes = notes || ""; lead.updatedAt = U().now();
    addActivity(leadId, "stage", "Lead marked as Lost" + (reason ? " — " + reason : "") + ".");
  }
  function markWon(leadId, data) {
    const lead = byId("leads", leadId);
    if (!lead) return null;
    lead.stage = "won"; lead.wonAt = lead.wonAt || U().now(); lead.updatedAt = U().now();
    if (data) {
      if (data.dealValue != null) lead.estimatedValue = Number(data.dealValue) || 0;
      if (data.notes) lead.wonNotes = data.notes;
      if (data.wonDate) lead.wonAt = new Date(data.wonDate + "T12:00:00").getTime();
    }
    const client = ensureClient(lead);
    if (client && data && data.serviceIds) {
      client.services = client.services || [];
      data.serviceIds.forEach((serviceId) => { if (!client.services.some((s) => s.serviceId === serviceId)) client.services.push({ serviceId, status: "in_progress", startDate: U().now() }); });
    }
    addActivity(leadId, "stage", "Deal won — converted to client.");
    return client;
  }
  function reactivateLead(leadId) {
    const lead = byId("leads", leadId);
    if (!lead) return;
    const wasLost = lead.stage === "lost";
    lead.stage = wasLost ? "contacted" : "new";
    delete lead.lostReason; delete lead.lostNotes; lead.updatedAt = U().now();
    addActivity(leadId, "stage", "Lead reactivated" + (wasLost ? " from Lost." : "."));
  }

  function pipelineValue() {
    let v = 0;
    db.leads.forEach((l) => { if (!["won", "lost"].includes(l.stage)) v += l.estimatedValue || 0; });
    return v;
  }
  function wonRevenue() { return db.leads.filter((l) => l.stage === "won").reduce((s, l) => s + (l.estimatedValue || 0), 0); }
  function outstandingPayments() {
    return db.payments.filter((p) => p.status === "pending").reduce((s, p) => s + (p.amount || 0), 0);
  }
  function mrr() { return db.payments.filter((p) => p.status === "paid" && p.kind === "mrr").reduce((s, p) => s + (p.amount || 0), 0); }

  function leadRows() {
    return db.leads.map((l) => {
      const biz = businessOf(l);
      const audit = auditOf(l.businessId);
      const dScore = digitalScore(audit);
      const lScore = leadScore(l, biz, audit);
      return { lead: l, business: biz, audit, digitalScore: dScore, leadScore: lScore, temperature: l.temperature || temperatureFor(lScore) };
    });
  }
  function clientRows() {
    return db.clients.map((c) => {
      const biz = businessOf({ businessId: c.businessId });
      const projects = projectsFor(c.id);
      const activeProjects = projects.filter(p => !["completed", "cancelled"].includes(p.status)).length;

      const financials = clientFinancialSummary(c.id);

      return {
        client: c,
        business: biz,
        paid: financials.totalPaid,
        outstanding: financials.outstanding,
        activeProjects,
        totalProjectValue: financials.totalProjectValue
      };
    });
  }

  /* ── Phase 4: Projects ── */
  function projectOf(projectId) { return db.projects.find((p) => p.id === projectId) || null; }
  function projectsFor(clientId) { return db.projects.filter((p) => p.clientId === clientId); }
  function projectTasksFor(projectId) { return db.projectTasks.filter((t) => t.projectId === projectId); }
  function milestonesFor(projectId) { return db.milestones.filter((m) => m.projectId === projectId); }
  function invoicesFor(clientId) { return db.invoices.filter((i) => i.clientId === clientId); }
  function invoiceItemsFor(invoiceId) { return db.invoiceItems.filter((item) => item.invoiceId === invoiceId); }
  function approvalsFor(projectId) { return db.approvals.filter((a) => a.projectId === projectId); }
  function revisionsFor(projectId) { return db.revisions.filter((r) => r.projectId === projectId); }

  /* ── Project ── */
  function addProject(clientId, data) {
    const now = U().now();
    const project = Object.assign({ id: U().uid("proj"), clientId, status: "not_started", progress: 0, priority: "medium", createdAt: now, updatedAt: now }, data);
    db.projects.push(project);
    save();
    return project;
  }

  /* ── Project Task ── */
  function projectTaskOf(taskId) { return db.projectTasks.find((t) => t.id === taskId) || null; }
  function addProjectTask(projectId, data) {
    const now = U().now();
    const task = Object.assign({ id: U().uid("ptask"), projectId, status: "todo", priority: "medium", createdAt: now, updatedAt: now }, data);
    db.projectTasks.push(task);
    save();
    return task;
  }

  /* ── Milestone ── */
  function milestoneOf(milestoneId) { return db.milestones.find((m) => m.id === milestoneId) || null; }
  function addMilestone(projectId, data) {
    const now = U().now();
    const m = Object.assign({ id: U().uid("mil"), projectId, name: data.name, description: data.description || "", status: "pending", dueDate: data.dueDate || null, completionDate: null, tasks: [] }, data);
    db.milestones.push(m);
    save();
    return m;
  }

  /* ── Invoice ── */
  function invoiceOf(invoiceId) { return db.invoices.find((i) => i.id === invoiceId) || null; }
  function addInvoice(clientId, data) {
    const now = U().now();
    const inv = Object.assign({ id: U().uid("inv"), clientId, invoiceNumber: U().uid("inv-num"), issueDate: now, dueDate: data.dueDate || now, items: [], subtotal: 0, discount: 0, tax: 0, total: 0, amountPaid: 0, balance: 0, status: "draft", notes: "" }, data);
    db.invoices.push(inv);
    save();
    return inv;
  }

  /* ── Invoice Item ── */
  function invoiceItemOf(itemId) { return db.invoiceItems.find((item) => item.id === itemId) || null; }
  function addInvoiceItem(invoiceId, data) {
    const inv = invoiceOf(invoiceId);
    if (inv && inv.status === "cancelled") return null;
    const now = U().now();
    const qty = Number(data.quantity);
    const price = Number(data.unitPrice);
    const quantity = Number.isFinite(qty) && qty > 0 ? qty : 1;
    const unitPrice = Number.isFinite(price) && price >= 0 ? price : 0;
    const item = Object.assign({ id: U().uid("inv-it"), invoiceId, service: data.service || "", description: data.description || "", quantity, unitPrice, total: quantity * unitPrice }, data);
    item.quantity = quantity;
    item.unitPrice = unitPrice;
    item.total = quantity * unitPrice;
    db.invoiceItems.push(item);
    // Recalculate invoice totals (a cancelled invoice is immutable and never
    // silently flipped back to sent/paid by a recalculation)
    if (inv) {
      const items = invoiceItemsFor(invoiceId);
      inv.subtotal = items.reduce((s, it) => s + it.total, 0);
      inv.discount = 0; // discounts handled at invoice level
      inv.tax = 0; // tax optional/configurable
      inv.total = Math.max(0, inv.subtotal - inv.discount + inv.tax);
      inv.balance = Math.max(0, inv.total - inv.amountPaid);
      inv.status = inv.balance <= 0 ? "paid" : inv.balance > 0 && inv.amountPaid > 0 ? "partially_paid" : inv.balance > 0 ? "sent" : "draft";
      inv.updatedAt = U().now();
      save();
    }
    return item;
  }

  /* ── Approval ── */
  function approvalOf(appId) { return db.approvals.find((a) => a.id === appId) || null; }
  function addApproval(projectId, data) {
    const now = U().now();
    const a = Object.assign({ id: U().uid("app"), projectId, item: data.item || "", status: "pending", date: null, performedBy: "", notes: "" }, data);
    db.approvals.push(a);
    save();
    return a;
  }

  /* ── Revision ── */
  function revisionOf(revId) { return db.revisions.find((r) => r.id === revId) || null; }
  function addRevision(projectId, data) {
    const now = U().now();
    const r = Object.assign({ id: U().uid("rev"), projectId, revisionNumber: data.revisionNumber || 1, requestedDate: data.requestedDate || now, completedDate: null, notes: "" }, data);
    db.revisions.push(r);
    save();
    return r;
  }

  /* ── Audit Snapshots (digital growth) ── */
  function addAuditSnapshot(businessId, data) {
    const rec = { id: U().uid("snap"), businessId, createdAt: U().now(), data: data || {} };
    db.auditSnapshots.push(rec);
    save();
    return rec;
  }
  function auditSnapshotsFor(businessId) {
    return db.auditSnapshots.filter((x) => x.businessId === businessId).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }

  /* ── Project progress calculation ── */
  function projectProgress(projectId) {
    const tasks = projectTasksFor(projectId);
    if (!tasks.length) return 0;
    const completed = tasks.filter((t) => t.status === "done").length;
    return Math.round((completed / tasks.length) * 100);
  }

  /* ── Client financial summary ── */
  function clientFinancialSummary(clientId) {
    const invoices = invoicesFor(clientId);
    let totalInvoiced = 0, totalPaid = 0;
    invoices.forEach((inv) => {
      if (inv.status !== "cancelled") {
        totalInvoiced += inv.total;
        totalPaid += inv.amountPaid;
      }
    });

    // Also include direct payments if any not linked to invoices (future proofing)
    const directPayments = db.payments.filter(p => p.clientId === clientId && !p.invoiceId && p.status === "paid")
      .reduce((s, p) => s + (p.amount || 0), 0);
    totalPaid += directPayments;

    const projects = projectsFor(clientId);
    const totalProjectValue = projects.reduce((s, p) => s + (p.budget || 0), 0);

    return { totalProjectValue, totalInvoiced, totalPaid, outstanding: Math.max(0, totalInvoiced - totalPaid) };
  }

  /* ── CSV export ── */
  function exportLeadsCSV() {
    const header = ["Business","Category","Location","Phone","WhatsApp","Email","Website","Google Profile","Instagram","Facebook","Digital Score","Lead Score","Stage","Deal Value","Next Follow-up","Notes"];
    const rows = leadRows().map((r) => {
      const b = r.business || {};
      const fu = nextFollowup(r.lead.id);
      return [b.name, b.category, [b.city, b.address].filter(Boolean).join(", "), b.phone, b.whatsapp, b.email, b.website,
        b.googleProfileUrl, b.instagramUrl, b.facebookUrl, r.digitalScore, r.leadScore,
        stageOf(r.lead.stage).label, r.lead.estimatedValue || "", fu ? U().formatDate(fu.dueDate) : "", r.lead.notes || b.notes || ""];
    });
    const csv = [header, ...rows].map((r) => r.map(U().csvEscape).join(",")).join("\n");
    U().download("vision61-crm-leads-" + new Date().toISOString().slice(0, 10) + ".csv", "\ufeff" + csv, "text/csv");
    V61.Toast.success("Leads exported");
  }

  function exportClientsCSV() {
    const header = ["Client","Category","Location","Phone","Email","Website","Converted","Paid","Outstanding"];
    const rows = clientRows().map((r) => {
      const b = r.business || {};
      return [b.name, b.category, [b.city, b.address].filter(Boolean).join(", "), b.phone, b.email, b.website,
        U().formatDate(r.client.createdAt), r.paid, r.outstanding];
    });
    const csv = [header, ...rows].map((r) => r.map(U().csvEscape).join(",")).join("\n");
    U().download("vision61-crm-clients-" + new Date().toISOString().slice(0, 10) + ".csv", "\ufeff" + csv, "text/csv");
    V61.Toast.success("Clients exported");
  }

  function parseCSV(text) {
    const rows = [];
    let row = [], field = "", inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
        else field += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = ""; if (row.some((c) => c.trim() !== "")) rows.push(row); row = [];
      } else field += ch;
    }
    row.push(field); if (row.some((c) => c.trim() !== "")) rows.push(row);
    return rows;
  }

  const CSV_MAP = {
    "business name": "name", name: "name", "business": "name",
    "category": "category", type: "category", "business type": "category",
    "location": "city", city: "city", address: "address", area: "address",
    phone: "phone", whatsapp: "whatsapp", email: "email", website: "website",
    "google profile": "googleProfileUrl", "google": "googleProfileUrl", "google business profile": "googleProfileUrl",
    instagram: "instagramUrl", "instagram url": "instagramUrl", facebook: "facebookUrl", "facebook url": "facebookUrl",
    "digital score": "digitalScore", "lead score": "leadScore", stage: "stage", "deal value": "estimatedValue", "deal": "estimatedValue", notes: "notes", "note": "notes",
  };

  function importCSV(text) {
    const rows = parseCSV(text);
    if (!rows.length) { V61.Toast.error("CSV file is empty"); return 0; }
    const header = rows[0].map((h) => String(h).trim().toLowerCase());
    const mapIdx = (name) => header.findIndex((h) => h === name || CSV_MAP[h] === name || CSV_MAP[name] === h);
    let count = 0;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const get = (name) => { const idx = mapIdx(name); return idx >= 0 ? String(r[idx] || "").trim() : ""; };
      const name = get("name");
      if (!name) continue;
      let biz = db.businesses.find((b) => b.name.toLowerCase() === name.toLowerCase());
      if (!biz) biz = addBusiness({ name, category: get("category"), categoryKey: "", address: get("address"), city: get("city"), phone: get("phone"), whatsapp: get("whatsapp"), email: get("email"), website: get("website"), googleProfileUrl: get("googleProfileUrl"), instagramUrl: get("instagram"), facebookUrl: get("facebook"), notes: get("notes") });
      let lead = leadOf(biz.id);
      if (!lead) lead = addLead(biz.id, { source: "csv" });
      const stageRaw = get("stage").toLowerCase();
      if (STAGES.some((s) => s.key === stageRaw)) lead.stage = stageRaw;
      else { const st = STAGES.find((s) => s.label.toLowerCase() === get("stage").toLowerCase()); if (st) lead.stage = st.key; }
      const ds = parseInt(get("digitalScore"), 10); if (!isNaN(ds)) { upsertAudit(biz.id, {}); const a = auditOf(biz.id); a._importedDigitalScore = ds; }
      const ls = parseInt(get("leadScore"), 10); if (!isNaN(ls)) lead.scoreOverride = ls;
      const val = parseInt(get("estimatedValue"), 10); if (!isNaN(val)) lead.estimatedValue = val;
      count++;
    }
    save();
    if (count) V61.Toast.success("Imported " + count + " lead(s)");
    else V61.Toast.error("No rows imported");
    return count;
  }

  V61.Store = {
    get db() { return db; }, get loaded() { return !!db; },
    KEY,
    STAGES, stageOf, CONTACT_STATUS, contactStatusOf, CHANNELS, TEMPERATURES, tempOf,
    ACTIVITY_TYPES, MEETING_TYPES, DEFAULT_OUTCOMES, DEFAULT_LOST_REASONS, DEFAULT_TEMPLATES,
    scoreBand, buildMessage,
    AUDIT_WEIGHTS, AUDIT_CHECKS, SOCIAL_PLATFORMS,
    auditCategoryScore, auditSocialScore, digitalScore, auditBreakdown,
    opportunities, opportunitySummary, leadScore, temperatureFor, emptyAudit,
    isHighOpportunity, saveWebsiteAudit, latestWebsiteAudit, websiteAuditsFor, saveAuditSnapshot, auditSnapshotsFor,
    byId, businessOf, auditOf, leadOf, contactsFor, clientOf, ensureClient, paymentsFor, proposalsFor,
    outreachFor, followupsFor, tasksFor, notesFor, activityFor, projectOf, projectsFor,
    projectTasksFor, milestonesFor, invoicesFor, invoiceItemsFor, approvalsFor, revisionsFor,
    addActivity, addBusiness, addLead, addContact, upsertAudit,
    addDiscoveredBusiness, businessByGooglePlace, businessByName,
    nextFollowup, nextTask, addProject, projectTaskOf, addProjectTask,
    milestoneOf, addMilestone,
    invoiceOf, addInvoice, invoiceItemOf, addInvoiceItem,
    approvalOf, addApproval,
    revisionOf, addRevision,
    addAuditSnapshot, auditSnapshotsFor,
    projectProgress, clientFinancialSummary,
    pipelineValue, wonRevenue, outstandingPayments, mrr,
    leadRows, clientRows, clientById, clientBusiness,
    PROJECT_STATUS, projectStatusOf, TASK_STATUS, taskStatusOf, TASK_PRIORITY, INVOICE_STATUS, invoiceStatusOf, DEFAULT_PROJECT_TEMPLATES,
    exportLeadsCSV, exportClientsCSV, importCSV,
    /* Phase 3 helpers used by pages and services (were defined but not exported) */
    lifecycleStatus, contactNameFor, recommendedServicesFor, lastInteractionFor,
    timeToFirstResponse, daysContactToMeeting, daysProposalToWin,
    markLost, markWon, reactivateLead,
    seedOfficialCatalog, OFFICIAL_SERVICES,
    tagsFor, addTag, removeTag,
    outreachDraftsFor, saveOutreachDraft, activeTemplates,
    followupState, cancelFollowup, meetingsFor, upcomingMeetings, addMeeting,
    load, save, on, persist,
  };
})();