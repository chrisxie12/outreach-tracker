/* VISION 61 CRM — data layer: store, scoring, seed, CSV */
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
    settings: { profileName: "Christian", company: "Vision 61 Studios", theme: "dark", sidebarCollapsed: false, currency: "GHS" },
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
    db = migrated || seed();
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

  /* ── Seed data ── */
  function seed() {
    const d = emptyDb();
    const now = U().now();
    const DAY = 86400000;
    const ago = (days) => now - days * DAY;
    const inDays = (days) => now + days * DAY;

    d.services = [
      { id: "svc-website", name: "Website Development", description: "Fast, mobile-first business website with your brand, services and contact capture.", price: 2500, deliveryDays: 14, active: true },
      { id: "svc-gbp", name: "Google Business Profile", description: "Setup, verification and optimisation of your Google Business Profile for local visibility.", price: 600, deliveryDays: 5, active: true },
      { id: "svc-seo", name: "Local SEO", description: "Rank higher on Google Maps and local search with targeted keywords and citations.", price: 900, deliveryDays: 21, active: true },
      { id: "svc-social", name: "Social Media Management", description: "Monthly content calendar, design and posting across Instagram and Facebook.", price: 1200, deliveryDays: 30, active: true },
      { id: "svc-branding", name: "Branding", description: "Logo, colour system and brand identity that makes your business memorable.", price: 1800, deliveryDays: 21, active: true },
      { id: "svc-content", name: "Content Creation", description: "Photos, reels and copy for your channels — shot and written for you.", price: 800, deliveryDays: 14, active: true },
      { id: "svc-wa", name: "WhatsApp Business", description: "WhatsApp Business setup, catalogue and automated greeting for instant response.", price: 500, deliveryDays: 4, active: true },
      { id: "svc-ecom", name: "E-commerce", description: "Online store with payments, delivery tracking and order management.", price: 4000, deliveryDays: 30, active: true },
      { id: "svc-marketing", name: "Digital Marketing", description: "Run targeted ads and campaigns that bring real customers through the door.", price: 1500, deliveryDays: 30, active: true },
      { id: "svc-automation", name: "Business Automation", description: "Automate bookings, follow-ups and enquiries so you never miss a customer.", price: 1600, deliveryDays: 21, active: true },
      { id: "svc-analytics", name: "Analytics", description: "Dashboards that show exactly where your customers come from and what converts.", price: 700, deliveryDays: 7, active: true },
      { id: "svc-maintenance", name: "Website Maintenance", description: "Updates, backups, security and tweaks — we keep your site fast and safe.", price: 400, deliveryDays: 30, active: true },
    ];

    const B = (o) => {
      const biz = { id: U().uid("b"), createdAt: ago(o.created), updatedAt: ago(o.created), notes: o.notes || "", size: o.size || "small", categoryKey: o.categoryKey || "" };
      Object.keys(o).forEach((k) => { if (k !== "created" && k !== "notes" && k !== "size" && k !== "categoryKey") biz[k] = o[k]; });
      d.businesses.push(biz);
      return biz;
    };
    const C = (businessId, name, role, c) => { d.contacts.push(Object.assign({ id: U().uid("c"), businessId, name, role, createdAt: now }, c || {})); };
    const A = (businessId, o) => {
      const a = Object.assign({ id: U().uid("aud"), businessId, createdAt: now }, o);
      d.audits.push(a);
      return a;
    };
    const L = (businessId, o) => {
      const lead = Object.assign({ id: U().uid("l"), businessId, stage: "new", temperature: "cold", estimatedValue: 0, source: "maps", lastContacted: null, notes: "", scoreOverride: null, createdAt: ago(o.created), updatedAt: ago(o.created) }, o);
      delete lead.created;
      d.leads.push(lead);
      pushActivity(d, lead.id, "lead", "Lead discovered on Google Maps during outreach research.");
      return lead;
    };
    const O = (leadId, channel, status, message, when, notes) => {
      d.outreach.push({ id: U().uid("o"), leadId, channel, status, message: message || "", contactedAt: when, notes: notes || "" });
    };
    const F = (leadId, title, dueDays, priority, notes) => {
      d.followups.push({ id: U().uid("f"), leadId, title, dueDate: inDays(dueDays), priority: priority || "medium", status: "pending", notes: notes || "" });
    };
    const T = (leadId, title, dueDays, priority, status) => {
      d.tasks.push({ id: U().uid("t"), leadId, title, dueDate: dueDays ? inDays(dueDays) : null, priority: priority || "medium", status: status || "todo" });
    };
    const N = (leadId, content, daysAgo) => { d.notes.push({ id: U().uid("n"), leadId, content, createdAt: ago(daysAgo) }); pushActivity(d, leadId, "note", "Note added: " + content); };

    /* 1. Accra Heights Restaurant — weak presence, hot lead */
    const b1 = B({ name: "Accra Heights Restaurant", category: "Restaurant", categoryKey: "restaurant", address: "12 Osu Badu Street", city: "Accra", region: "Greater Accra", phone: "+233 24 111 2233", whatsapp: "+233 24 111 2233", email: "hello@accraheights.com", website: "", googleProfileUrl: "https://maps.google.com/?q=Accra+Heights+Restaurant", instagramUrl: "https://instagram.com/accraheights", facebookUrl: "", size: "medium", created: 12 });
    C(b1.id, "Kwame Mensah", "Owner", { phone: "+233 24 111 2233", whatsapp: "+233 24 111 2233", email: "kwame@accraheights.com" });
    C(b1.id, "Ama Boateng", "Marketing Manager", { phone: "+233 20 555 6677", email: "ama@accraheights.com" });
    A(b1.id, { website: { exists: false, mobile: false, https: false, modern: false, speed: false, cta: false, contact: false, seo: false }, google: { exists: true, verified: true, category: true, photos: true, reviews: 11, rating: true, hours: true, description: true, website_linked: false, phone: true }, social: { instagram: { exists: true, active: true, quality: true, consistency: false }, facebook: { exists: true, active: false, quality: false, consistency: false }, tiktok: { exists: false, active: false, quality: false, consistency: false }, linkedin: { exists: false, active: false, quality: false, consistency: false } }, branding: { logo: true, colors: true, name_consistency: true, signage: true, packaging: true }, conversion: { whatsapp: false, booking: false, ordering: false, form: false, cta: false }, seo: { maps: true, reviews: true, keywords: false, backlinks: false, citations: true } });
    const l1 = L(b1.id, { stage: "responded", estimatedValue: 6000, created: 12, lastContacted: ago(3) });
    O(l1.id, "WhatsApp", "replied", buildMessage(b1.name, "restaurant"), ago(3), "Owner replied, asked for pricing.");
    O(l1.id, "WhatsApp", "contacted", buildMessage(b1.name, "restaurant"), ago(5));
    F(l1.id, "Send pricing options", 1, "high", "Kwame asked for website + WhatsApp pricing.");
    T(l1.id, "Audit Google profile", -1, "high", "done");
    T(l1.id, "Send proposal draft", 0, "high");
    N(l1.id, "Owner interested in redesigning website and adding online ordering.", 2);

    /* 2. East Legon Dental Centre — has site, needs SEO/social */
    const b2 = B({ name: "East Legon Dental Centre", category: "Dental Clinic", categoryKey: "clinic", address: "88 Boundary Road, East Legon", city: "Accra", region: "Greater Accra", phone: "+233 30 277 4455", whatsapp: "+233 55 222 8899", email: "care@eastlegondental.com", website: "eastlegondental.com", googleProfileUrl: "https://maps.google.com/?q=East+Legon+Dental+Centre", instagramUrl: "", facebookUrl: "https://facebook.com/eastlegondental", size: "large", created: 9 });
    C(b2.id, "Dr. Nana Adjei", "Director", { phone: "+233 30 277 4455", email: "nana@eastlegondental.com" });
    A(b2.id, { website: { exists: true, mobile: false, https: true, modern: false, speed: false, cta: true, contact: true, seo: false }, google: { exists: true, verified: true, category: true, photos: true, reviews: 24, rating: true, hours: true, description: true, website_linked: true, phone: true }, social: { instagram: { exists: false, active: false, quality: false, consistency: false }, facebook: { exists: true, active: true, quality: true, consistency: false }, tiktok: { exists: false, active: false, quality: false, consistency: false }, linkedin: { exists: false, active: false, quality: false, consistency: false } }, branding: { logo: true, colors: true, name_consistency: true, signage: true, packaging: false }, conversion: { whatsapp: true, booking: false, ordering: false, form: true, cta: true }, seo: { maps: true, reviews: true, keywords: false, backlinks: false, citations: true } });
    const l2 = L(b2.id, { stage: "qualified", estimatedValue: 12000, created: 9, lastContacted: ago(6) });
    O(l2.id, "Email", "interested", "Redesign proposal requested after initial call.", ago(6), "Director wants modern site + booking system.");
    F(l2.id, "Present redesign proposal", 3, "high", "Prepare proposal: website redesign, booking, local SEO.");
    T(l2.id, "Gather site content list", 2, "medium");

    /* 3. Osu Creative Hub — agency, strong, small potential */
    const b3 = B({ name: "Osu Creative Hub", category: "Creative Agency", categoryKey: "agency", address: "5 Oxford Street", city: "Accra", region: "Greater Accra", phone: "+233 24 999 0001", email: "team@osucreativehub.com", website: "osucreativehub.com", googleProfileUrl: "", instagramUrl: "https://instagram.com/osucreativehub", facebookUrl: "https://facebook.com/osucreativehub", size: "medium", created: 7 });
    C(b3.id, "Efua Ankrah", "Founder", { phone: "+233 24 999 0001", email: "efua@osucreativehub.com" });
    A(b3.id, { website: { exists: true, mobile: true, https: true, modern: true, speed: true, cta: true, contact: true, seo: true }, google: { exists: false, verified: false, category: false, photos: false, reviews: 0, rating: false, hours: false, description: false, website_linked: false, phone: false }, social: { instagram: { exists: true, active: true, quality: true, consistency: true }, facebook: { exists: true, active: true, quality: true, consistency: true }, tiktok: { exists: false, active: false, quality: false, consistency: false }, linkedin: { exists: true, active: true, quality: true, consistency: false } }, branding: { logo: true, colors: true, name_consistency: true, signage: false, packaging: true }, conversion: { whatsapp: true, booking: false, ordering: false, form: true, cta: true }, seo: { maps: false, reviews: false, keywords: true, backlinks: true, citations: false } });
    const l3 = L(b3.id, { stage: "contacted", estimatedValue: 3000, created: 7, lastContacted: ago(4) });
    O(l3.id, "Instagram", "contacted", buildMessage(b3.name, "creative agency"), ago(4), "Messaged via Instagram DM.");

    /* 4. Accra Prime Properties — big value, no site */
    const b4 = B({ name: "Accra Prime Properties", category: "Real Estate", categoryKey: "real_estate", address: "Airport Residential", city: "Accra", region: "Greater Accra", phone: "+233 20 333 4455", whatsapp: "+233 20 333 4455", email: "info@accraprime.com", website: "", googleProfileUrl: "https://maps.google.com/?q=Accra+Prime+Properties", facebookUrl: "https://facebook.com/accraprimeproperties", size: "large", created: 20 });
    C(b4.id, "Yaw Darko", "Managing Director", { phone: "+233 20 333 4455", whatsapp: "+233 20 333 4455", email: "yaw@accraprime.com" });
    A(b4.id, { website: { exists: false, mobile: false, https: false, modern: false, speed: false, cta: false, contact: false, seo: false }, google: { exists: true, verified: true, category: true, photos: true, reviews: 8, rating: true, hours: true, description: true, website_linked: false, phone: true }, social: { instagram: { exists: false, active: false, quality: false, consistency: false }, facebook: { exists: true, active: true, quality: false, consistency: false }, tiktok: { exists: false, active: false, quality: false, consistency: false }, linkedin: { exists: false, active: false, quality: false, consistency: false } }, branding: { logo: true, colors: true, name_consistency: true, signage: true, packaging: false }, conversion: { whatsapp: false, booking: false, ordering: false, form: false, cta: false }, seo: { maps: true, reviews: true, keywords: false, backlinks: false, citations: false } });
    const l4 = L(b4.id, { stage: "contacted", estimatedValue: 20000, created: 20, lastContacted: ago(8) });
    O(l4.id, "Phone", "contacted", "Called office — asked them to check their website gap.", ago(8), "Spoke with reception, sent intro via WhatsApp.");

    /* 5. Spintex Auto Care — hot, no online presence */
    const b5 = B({ name: "Spintex Auto Care", category: "Auto Care", categoryKey: "auto", address: "Spintex Road", city: "Accra", region: "Greater Accra", phone: "+233 55 777 8899", whatsapp: "+233 55 777 8899", email: "", website: "", googleProfileUrl: "https://maps.google.com/?q=Spintex+Auto+Care", instagramUrl: "", facebookUrl: "", size: "small", created: 4 });
    C(b5.id, "Kojo Asante", "Owner", { phone: "+233 55 777 8899", whatsapp: "+233 55 777 8899" });
    A(b5.id, { website: { exists: false, mobile: false, https: false, modern: false, speed: false, cta: false, contact: false, seo: false }, google: { exists: true, verified: false, category: true, photos: false, reviews: 3, rating: true, hours: true, description: false, website_linked: false, phone: true }, social: { instagram: { exists: false, active: false, quality: false, consistency: false }, facebook: { exists: false, active: false, quality: false, consistency: false }, tiktok: { exists: false, active: false, quality: false, consistency: false }, linkedin: { exists: false, active: false, quality: false, consistency: false } }, branding: { logo: false, colors: false, name_consistency: true, signage: true, packaging: false }, conversion: { whatsapp: false, booking: false, ordering: false, form: false, cta: false }, seo: { maps: true, reviews: false, keywords: false, backlinks: false, citations: false } });
    const l5 = L(b5.id, { stage: "new", estimatedValue: 4500, created: 4 });
    N(b5.id, "Owner spends weekdays at shop; best time to call is after 4pm.", 3);

    /* 6. Cantonments Fitness — active social, needs site */
    const b6 = B({ name: "Cantonments Fitness", category: "Gym", categoryKey: "gym", address: "14 Cantonments Road", city: "Accra", region: "Greater Accra", phone: "+233 20 111 2233", whatsapp: "+233 20 111 2233", email: "fit@cantonmentsgym.com", website: "", googleProfileUrl: "https://maps.google.com/?q=Cantonments+Fitness", instagramUrl: "https://instagram.com/cantonmentsfitness", facebookUrl: "https://facebook.com/cantonmentsfitness", size: "medium", created: 15 });
    C(b6.id, "Abena Osei", "Manager", { phone: "+233 20 111 2233", whatsapp: "+233 20 111 2233", email: "abena@cantonmentsgym.com" });
    A(b6.id, { website: { exists: false, mobile: false, https: false, modern: false, speed: false, cta: false, contact: false, seo: false }, google: { exists: true, verified: true, category: true, photos: true, reviews: 31, rating: true, hours: true, description: true, website_linked: false, phone: true }, social: { instagram: { exists: true, active: true, quality: true, consistency: true }, facebook: { exists: true, active: true, quality: true, consistency: false }, tiktok: { exists: true, active: false, quality: false, consistency: false }, linkedin: { exists: false, active: false, quality: false, consistency: false } }, branding: { logo: true, colors: true, name_consistency: true, signage: true, packaging: true }, conversion: { whatsapp: true, booking: true, ordering: false, form: false, cta: false }, seo: { maps: true, reviews: true, keywords: false, backlinks: false, citations: true } });
    const l6 = L(b6.id, { stage: "meeting", estimatedValue: 9000, created: 15, lastContacted: ago(2) });
    O(l6.id, "Instagram", "meeting_booked", "DM intro; manager asked for a call.", ago(2), "Meeting scheduled for this week.");
    F(l6.id, "Attend meeting re: website & bookings", 2, "high");

    /* 7. Tesano Learning Centre */
    const b7 = B({ name: "Tesano Learning Centre", category: "Education", categoryKey: "school", address: "Tesano", city: "Accra", region: "Greater Accra", phone: "+233 30 244 5566", whatsapp: "+233 55 111 2222", email: "admin@tesanolearning.edu.gh", website: "tesanolearning.edu.gh", googleProfileUrl: "", facebookUrl: "https://facebook.com/tesanolearning", size: "medium", created: 25 });
    C(b7.id, "Mrs. Akosua Frimpong", "Headmistress", { phone: "+233 30 244 5566", email: "akosua@tesanolearning.edu.gh" });
    A(b7.id, { website: { exists: true, mobile: true, https: true, modern: false, speed: false, cta: false, contact: true, seo: true }, google: { exists: false, verified: false, category: false, photos: false, reviews: 0, rating: false, hours: false, description: false, website_linked: false, phone: false }, social: { instagram: { exists: false, active: false, quality: false, consistency: false }, facebook: { exists: true, active: true, quality: false, consistency: false }, tiktok: { exists: false, active: false, quality: false, consistency: false }, linkedin: { exists: false, active: false, quality: false, consistency: false } }, branding: { logo: true, colors: true, name_consistency: true, signage: true, packaging: true }, conversion: { whatsapp: true, booking: true, ordering: false, form: false, cta: false }, seo: { maps: true, reviews: false, keywords: false, backlinks: false, citations: false } });
    const l7 = L(b7.id, { stage: "researching", estimatedValue: 7000, created: 25 });

    /* 8. Labone Beauty Bar */
    const b8 = B({ name: "Labone Beauty Bar", category: "Beauty Salon", categoryKey: "salon", address: "Labone", city: "Accra", region: "Greater Accra", phone: "+233 20 444 5566", whatsapp: "+233 20 444 5566", email: "", website: "", googleProfileUrl: "https://maps.google.com/?q=Labone+Beauty+Bar", instagramUrl: "https://instagram.com/labonebeautybar", facebookUrl: "", size: "small", created: 2 });
    C(b8.id, "Serwaa Addo", "Founder", { phone: "+233 20 444 5566", whatsapp: "+233 20 444 5566" });
    A(b8.id, { website: { exists: false, mobile: false, https: false, modern: false, speed: false, cta: false, contact: false, seo: false }, google: { exists: true, verified: true, category: true, photos: true, reviews: 17, rating: true, hours: true, description: true, website_linked: false, phone: true }, social: { instagram: { exists: true, active: true, quality: true, consistency: true }, facebook: { exists: false, active: false, quality: false, consistency: false }, tiktok: { exists: false, active: false, quality: false, consistency: false }, linkedin: { exists: false, active: false, quality: false, consistency: false } }, branding: { logo: true, colors: true, name_consistency: true, signage: true, packaging: false }, conversion: { whatsapp: true, booking: false, ordering: false, form: false, cta: true }, seo: { maps: true, reviews: true, keywords: false, backlinks: false, citations: false } });
    const l8 = L(b8.id, { stage: "new", estimatedValue: 3500, created: 2 });

    /* 9. Madina Tailors & Fashion */
    const b9 = B({ name: "Madina Tailors & Fashion", category: "Fashion", categoryKey: "fashion", address: "Madina", city: "Accra", region: "Greater Accra", phone: "+233 55 333 4455", whatsapp: "+233 55 333 4455", email: "", website: "", googleProfileUrl: "", instagramUrl: "https://instagram.com/madinatailors", facebookUrl: "https://facebook.com/madinatailors", size: "small", created: 6 });
    C(b9.id, "Aisha Mohammed", "Owner", { phone: "+233 55 333 4455", whatsapp: "+233 55 333 4455" });
    A(b9.id, { website: { exists: false, mobile: false, https: false, modern: false, speed: false, cta: false, contact: false, seo: false }, google: { exists: false, verified: false, category: false, photos: false, reviews: 0, rating: false, hours: false, description: false, website_linked: false, phone: false }, social: { instagram: { exists: true, active: true, quality: true, consistency: false }, facebook: { exists: true, active: false, quality: false, consistency: false }, tiktok: { exists: false, active: false, quality: false, consistency: false }, linkedin: { exists: false, active: false, quality: false, consistency: false } }, branding: { logo: false, colors: false, name_consistency: true, signage: true, packaging: true }, conversion: { whatsapp: false, booking: false, ordering: false, form: false, cta: false }, seo: { maps: false, reviews: false, keywords: false, backlinks: false, citations: false } });
    const l9 = L(b9.id, { stage: "new", estimatedValue: 2800, created: 6 });

    /* 10. Dansoman Pharmacy */
    const b10 = B({ name: "Dansoman Pharmacy", category: "Pharmacy", categoryKey: "pharmacy", address: "Dansoman", city: "Accra", region: "Greater Accra", phone: "+233 30 233 4455", whatsapp: "+233 55 444 5566", email: "care@dansomanpharmacy.com", website: "dansomanpharmacy.com", googleProfileUrl: "https://maps.google.com/?q=Dansoman+Pharmacy", instagramUrl: "", facebookUrl: "", size: "medium", created: 30 });
    C(b10.id, "Dr. Kofi Asiedu", "Pharmacist", { phone: "+233 30 233 4455", email: "kofi@dansomanpharmacy.com" });
    A(b10.id, { website: { exists: true, mobile: true, https: true, modern: true, speed: true, cta: true, contact: true, seo: true }, google: { exists: true, verified: true, category: true, photos: true, reviews: 42, rating: true, hours: true, description: true, website_linked: true, phone: true }, social: { instagram: { exists: false, active: false, quality: false, consistency: false }, facebook: { exists: false, active: false, quality: false, consistency: false }, tiktok: { exists: false, active: false, quality: false, consistency: false }, linkedin: { exists: false, active: false, quality: false, consistency: false } }, branding: { logo: true, colors: true, name_consistency: true, signage: true, packaging: false }, conversion: { whatsapp: true, booking: false, ordering: false, form: true, cta: true }, seo: { maps: true, reviews: true, keywords: false, backlinks: false, citations: true } });
    const l10 = L(b10.id, { stage: "won", estimatedValue: 5000, created: 30, lastContacted: ago(10) });
    O(l10.id, "Email", "won", "Website redesign proposal accepted.", ago(10), "Signed off — website + maintenance.");
    d.clients.push({ id: U().uid("cl"), businessId: b10.id, leadId: l10.id, status: "active", createdAt: ago(10), services: [{ serviceId: "svc-website", status: "in_progress", startDate: ago(10) }] });
    d.payments.push({ id: U().uid("p"), clientId: d.clients[0].id, amount: 2500, status: "paid", kind: "project", date: ago(8), reference: "Invoice #INV-001" });
    d.payments.push({ id: U().uid("p"), clientId: d.clients[0].id, amount: 1250, status: "pending", kind: "project", date: inDays(6), reference: "Invoice #INV-002" });

    /* 11. Adenta Electrical Solutions — recently won */
    const b11 = B({ name: "Adenta Electrical Solutions", category: "Electrical Services", categoryKey: "electrical", address: "Adenta", city: "Accra", region: "Greater Accra", phone: "+233 24 556 7788", whatsapp: "+233 24 556 7788", email: "jobs@adentaelectrical.com", website: "", googleProfileUrl: "https://maps.google.com/?q=Adenta+Electrical+Solutions", facebookUrl: "https://facebook.com/adentaelectrical", size: "small", created: 40 });
    C(b11.id, "Michael Tetteh", "Owner", { phone: "+233 24 556 7788", whatsapp: "+233 24 556 7788", email: "michael@adentaelectrical.com" });
    A(b11.id, { website: { exists: false, mobile: false, https: false, modern: false, speed: false, cta: false, contact: false, seo: false }, google: { exists: true, verified: true, category: true, photos: true, reviews: 6, rating: true, hours: true, description: false, website_linked: false, phone: true }, social: { instagram: { exists: false, active: false, quality: false, consistency: false }, facebook: { exists: true, active: true, quality: false, consistency: false }, tiktok: { exists: false, active: false, quality: false, consistency: false }, linkedin: { exists: false, active: false, quality: false, consistency: false } }, branding: { logo: false, colors: false, name_consistency: true, signage: true, packaging: false }, conversion: { whatsapp: true, booking: false, ordering: false, form: false, cta: false }, seo: { maps: true, reviews: false, keywords: false, backlinks: false, citations: false } });
    const l11 = L(b11.id, { stage: "won", estimatedValue: 4000, created: 40, lastContacted: ago(20) });
    O(l11.id, "WhatsApp", "won", "Accepted website + WhatsApp business package.", ago(20), "Started site build.");
    d.clients.push({ id: U().uid("cl"), businessId: b11.id, leadId: l11.id, status: "active", createdAt: ago(20), services: [{ serviceId: "svc-website", status: "in_progress", startDate: ago(20) }, { serviceId: "svc-wa", status: "done", startDate: ago(18) }] });
    d.payments.push({ id: U().uid("p"), clientId: d.clients[1].id, amount: 3000, status: "paid", kind: "project", date: ago(18), reference: "Invoice #INV-003" });

    /* 12. West Hills Bakery — cold/declined example */
    const b12 = B({ name: "West Hills Bakery", category: "Bakery", categoryKey: "bakery", address: "Weija", city: "Accra", region: "Greater Accra", phone: "+233 20 778 9900", whatsapp: "+233 20 778 9900", email: "", website: "", googleProfileUrl: "https://maps.google.com/?q=West+Hills+Bakery", instagramUrl: "https://instagram.com/weishillsbakery", facebookUrl: "", size: "small", created: 50 });
    C(b12.id, "Grace Mensimah", "Owner", { phone: "+233 20 778 9900", whatsapp: "+233 20 778 9900" });
    A(b12.id, { website: { exists: false, mobile: false, https: false, modern: false, speed: false, cta: false, contact: false, seo: false }, google: { exists: true, verified: true, category: true, photos: true, reviews: 12, rating: true, hours: true, description: true, website_linked: false, phone: true }, social: { instagram: { exists: true, active: true, quality: true, consistency: true }, facebook: { exists: false, active: false, quality: false, consistency: false }, tiktok: { exists: false, active: false, quality: false, consistency: false }, linkedin: { exists: false, active: false, quality: false, consistency: false } }, branding: { logo: true, colors: true, name_consistency: true, signage: true, packaging: true }, conversion: { whatsapp: true, booking: false, ordering: false, form: false, cta: false }, seo: { maps: true, reviews: true, keywords: false, backlinks: false, citations: true } });
    const l12 = L(b12.id, { stage: "lost", estimatedValue: 2500, created: 50, lastContacted: ago(25) });
    O(l12.id, "WhatsApp", "not_interested", "Sent intro; owner said budget is tight this year.", ago(25));

    /* Notifications system event */
    d.activity.push({ id: U().uid("act"), leadId: null, type: "system", text: "Welcome to Vision 61 CRM. Sample data loaded — you can delete it any time from Settings.", createdAt: now });

    return d;
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
    nextFollowup, nextTask,
    pipelineValue, wonRevenue, outstandingPayments, mrr,
    leadRows, clientRows,
    exportLeadsCSV, exportClientsCSV, importCSV,
    load, save, on, persist,
  };
})();