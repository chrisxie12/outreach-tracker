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
    return auditCategoryScore(audit, "website") + auditCategoryScore(audit, "google") +
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
    return U().clamp(Math.round(s), 1, 100);
  }
  const temperatureFor = (score) => (score >= 80 ? "hot" : score >= 60 ? "warm" : "cold");

  /* ── Store ── */
  const emptyDb = () => ({
    schema: 1,
    businesses: [], contacts: [], audits: [], leads: [], outreach: [], followups: [],
    tasks: [], notes: [], activity: [], services: [], proposals: [], clients: [], payments: [],
    settings: { profileName: "Christian", company: "Vision 61 Studios", theme: "dark", sidebarCollapsed: false, currency: "GHS", googleMapsApiKey: "", discoveryProvider: "" },
  });

  let db = null;
  const listeners = { change: [] };

  function pushActivity(d, leadId, type, text) {
    d.activity.unshift({ id: U().uid("act"), leadId, type, text, createdAt: U().now() });
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const d = JSON.parse(raw); if (d && d.schema === 1) { db = d; return; } }
    } catch (e) {}
    const migrated = migrateLegacy();
    db = migrated || emptyDb();
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
  function leadOf(businessId) { return db.leads.find((l) => l.businessId === businessId) || null; }
  function contactsFor(businessId) { return db.contacts.filter((c) => c.businessId === businessId); }
  function clientOf(businessId) { return db.clients.find((c) => c.businessId === businessId) || null; }
  function ensureClient(lead) {
    if (!lead || !lead.businessId) return null;
    const existing = clientOf(lead.businessId);
    if (existing) return existing;
    const biz = businessOf(lead);
    if (!biz) return null;
    const c = { id: U().uid("cl"), businessId: biz.id, leadId: lead.id, status: "active", createdAt: U().now(), services: [] };
    db.clients.push(c);
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
      const paid = db.payments.filter((p) => p.clientId === c.id && p.status === "paid").reduce((s, p) => s + (p.amount || 0), 0);
      const outstanding = db.payments.filter((p) => p.clientId === c.id && p.status === "pending").reduce((s, p) => s + (p.amount || 0), 0);
      return { client: c, business: biz, paid, outstanding };
    });
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
    scoreBand, buildMessage,
    AUDIT_WEIGHTS, AUDIT_CHECKS, SOCIAL_PLATFORMS,
    auditCategoryScore, auditSocialScore, digitalScore, auditBreakdown,
    opportunities, opportunitySummary, leadScore, temperatureFor, emptyAudit,
    byId, businessOf, auditOf, leadOf, contactsFor, clientOf, ensureClient, paymentsFor, proposalsFor,
    outreachFor, followupsFor, tasksFor, notesFor, activityFor,
    addActivity, addBusiness, addLead, addContact, upsertAudit,
    addDiscoveredBusiness, businessByGooglePlace, businessByName,
    nextFollowup, nextTask,
    pipelineValue, wonRevenue, outstandingPayments, mrr,
    leadRows, clientRows,
    exportLeadsCSV, exportClientsCSV, importCSV,
    load, save, on, persist,
  };
})();