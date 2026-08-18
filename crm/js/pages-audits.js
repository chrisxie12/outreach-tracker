/* VISION 61 CRM — Audits: list, batch audit, audit form, audit detail page, opportunities, history */
window.V61 = window.V61 || {};
V61.Pages = V61.Pages || {};

(function () {
  const U = () => V61.Utils;
  const S = () => V61.Store;
  const I = V61.Icons;
  const UI = V61.UI;
  const GP = () => V61.GooglePlaces;
  const D = () => V61.Discovery;
  const Score = () => V61.Score;
  const OE = () => V61.OpportunityEngine;

  function detailsSourceFor(biz) { return (biz && biz.osmId) ? "osm" : "google"; }
  /* Auto-fill audit facts from a real data source. Only facts the source
     genuinely provides are set — nothing is invented. Google gives rating,
     reviews, photos and Google-listing facts; OpenStreetMap gives a real
     website presence and contact info only. */
  function applyDetails(audit, d, source) {
    audit.website = audit.website || {};
    audit.website.exists = !!d.website;
    audit.website.contact = !!d.phone;
    let applied = audit.website.exists + audit.website.contact;
    if (source === "google") {
      audit.google = audit.google || {};
      audit.google.exists = true;
      audit.google.photos = d.photos > 0;
      audit.google.reviews = d.reviews > 0;
      audit.google.rating = (d.rating || 0) >= 4;
      audit.google.hours = !!d.hours;
      audit.google.phone = !!d.phone;
      audit.google.website_linked = !!d.website;
      audit.seo = audit.seo || {};
      audit.seo.maps = true;
      audit.seo.reviews = (d.reviews || 0) >= 15;
      applied += audit.google.exists + audit.google.photos + audit.google.reviews + audit.google.rating + audit.google.hours + audit.google.phone + audit.google.website_linked + audit.seo.maps + audit.seo.reviews;
    }
    return applied;
  }

  const catMeta = {
    website: { label: "Website", weight: 25 },
    google: { label: "Google Profile", weight: 20 },
    social: { label: "Social Media", weight: 20 },
    branding: { label: "Branding", weight: 15 },
    conversion: { label: "Conversion", weight: 10 },
    seo: { label: "SEO", weight: 10 },
  };

  const state = { flt: { digital: 0, lead: 0, opps: 0, website: "all", google: "all", audit: "all", priority: "all", cat: "all", loc: "all" }, high: false, batch: new Set(), sort: "score" };

  function median(arr) {
    if (!arr.length) return "—";
    const s = arr.slice().sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
  }

  function catList() { return [...new Set(S().db.businesses.map((b) => b.category).filter(Boolean))].sort(); }
  function locList() { return [...new Set(S().db.businesses.map((b) => b.city).filter(Boolean))].sort(); }

  function rowOpps(r) { return OE().forRow(r); }

  function filteredRows() {
    let rows = S().leadRows();
    const f = state.flt;
    if (f.digital) rows = rows.filter((r) => r.digitalScore >= f.digital);
    if (f.lead) rows = rows.filter((r) => r.leadScore >= f.lead);
    if (f.opps) rows = rows.filter((r) => rowOpps(r).length >= f.opps);
    if (f.website === "yes") rows = rows.filter((r) => !!(r.business && r.business.website));
    if (f.website === "no") rows = rows.filter((r) => !(r.business && r.business.website));
    if (f.google === "yes") rows = rows.filter((r) => !!(r.business && (r.business.googlePlaceId || (r.audit && r.audit.google && r.audit.google.exists))));
    if (f.google === "no") rows = rows.filter((r) => !(r.business && (r.business.googlePlaceId || (r.audit && r.audit.google && r.audit.google.exists))));
    if (f.audit === "yes") rows = rows.filter((r) => !!r.audit);
    if (f.audit === "no") rows = rows.filter((r) => !r.audit);
    if (f.priority !== "all") rows = rows.filter((r) => Score().priorityFor(r.leadScore, rowOpps(r).length).key === f.priority);
    if (f.cat !== "all") rows = rows.filter((r) => (r.business && r.business.category) === f.cat);
    if (f.loc !== "all") rows = rows.filter((r) => (r.business && r.business.city) === f.loc);
    if (state.high) rows = rows.filter((r) => S().isHighOpportunity(r));
    const key = { score: (r) => -r.leadScore, digital: (r) => -r.digitalScore, opps: (r) => -rowOpps(r).length, name: (r) => (r.business && r.business.name || "").toLowerCase() }[state.sort];
    return rows.slice().sort((a, b) => (key(a) < key(b) ? -1 : 1));
  }

  /* ── Audits list ── */
  function render() {
    const el = document.getElementById("content");
    const rows = filteredRows();
    const allRows = S().leadRows();
    const audited = allRows.filter((r) => r.audit).length;
    const oppCount = allRows.reduce((s, r) => s + rowOpps(r).length, 0);
    el.innerHTML =
      '<div class="page-head"><div><div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.14em">Prospecting</div>' +
      '<h1 class="page-title">Digital Audits</h1><p class="page-sub">' + audited + " of " + allRows.length + " leads audited · median score " + median(allRows.filter((r) => r.audit).map((r) => r.digitalScore)) + " · " + oppCount + " opportunities detected</p></div>" +
      '<div class="page-actions">' +
      (state.batch.size ? '<button class="btn btn-primary" data-cmd="batchAudit">' + I.scan + " Run Digital Audit (" + state.batch.size + ")</button>" : "") +
      '<button class="btn btn-primary" data-cmd="addBusinessAudit">' + I.plus + " Add Business & Audit</button>" +
      '<button class="btn" data-cmd="highOpps">' + (state.high ? I.filter : I.zap) + (state.high ? " All leads" : " High Opportunities") + "</button></div></div>" +
      '<div class="panel" style="margin-bottom:16px"><div class="filterbar">' +
      '<select class="select" id="aud-flt-digital"><option value="0">Any digital score</option>' + [30, 40, 50, 60, 70, 80].map((v) => '<option value="' + v + '"' + (state.flt.digital === v ? " selected" : "") + ">Digital ≥ " + v + "</option>").join("") + "</select>" +
      '<select class="select" id="aud-flt-lead"><option value="0">Any lead score</option>' + [40, 50, 60, 70, 80].map((v) => '<option value="' + v + '"' + (state.flt.lead === v ? " selected" : "") + ">Lead ≥ " + v + "</option>").join("") + "</select>" +
      '<select class="select" id="aud-flt-opps"><option value="0">Any opportunities</option>' + [1, 2, 3, 4, 5].map((v) => '<option value="' + v + '"' + (state.flt.opps === v ? " selected" : "") + ">≥ " + v + " opportunities</option>").join("") + "</select>" +
      '<select class="select" id="aud-flt-website"><option value="all"' + (state.flt.website === "all" ? " selected" : "") + '>Any website</option><option value="yes"' + (state.flt.website === "yes" ? " selected" : "") + '>Has website</option><option value="no"' + (state.flt.website === "no" ? " selected" : "") + '>No website</option></select>' +
      '<select class="select" id="aud-flt-google"><option value="all"' + (state.flt.google === "all" ? " selected" : "") + '>Any Google</option><option value="yes"' + (state.flt.google === "yes" ? " selected" : "") + '>Has Google profile</option><option value="no"' + (state.flt.google === "no" ? " selected" : "") + '>No Google profile</option></select>' +
      '<select class="select" id="aud-flt-audit"><option value="all"' + (state.flt.audit === "all" ? " selected" : "") + '>Audit: any</option><option value="yes"' + (state.flt.audit === "yes" ? " selected" : "") + '>Audited</option><option value="no"' + (state.flt.audit === "no" ? " selected" : "") + '>Not audited</option></select>' +
      '<select class="select" id="aud-flt-priority"><option value="all"' + (state.flt.priority === "all" ? " selected" : "") + '>Any priority</option><option value="high"' + (state.flt.priority === "high" ? " selected" : "") + '>HIGH</option><option value="medium"' + (state.flt.priority === "medium" ? " selected" : "") + '>MEDIUM</option><option value="low"' + (state.flt.priority === "low" ? " selected" : "") + '>LOW</option></select>' +
      '<select class="select" id="aud-flt-cat"><option value="all">All categories</option>' + catList().map((c) => '<option' + (state.flt.cat === c ? " selected" : "") + ">" + U().escapeHtml(c) + "</option>").join("") + "</select>" +
      '<select class="select" id="aud-flt-loc"><option value="all">All locations</option>' + locList().map((c) => '<option' + (state.flt.loc === c ? " selected" : "") + ">" + U().escapeHtml(c) + "</option>").join("") + "</select>" +
      '<select class="select" id="aud-flt-sort"><option value="score"' + (state.sort === "score" ? " selected" : "") + '>Lead score</option><option value="digital"' + (state.sort === "digital" ? " selected" : "") + '>Digital score</option><option value="opps"' + (state.sort === "opps" ? " selected" : "") + '>Opportunities</option><option value="name"' + (state.sort === "name" ? " selected" : "") + '>Name</option></select>' +
      "</div></div>" +
      (rows.length ? '<div class="table-wrap"><table class="data"><thead><tr><th></th><th>Business</th><th>Digital Score</th><th>Lead Score</th><th>Priority</th><th>Opportunities</th><th>Audit</th><th></th></tr></thead><tbody>' +
        rows.map((r) => {
          const opps = rowOpps(r);
          const pri = Score().priorityFor(r.leadScore, opps.length);
          return "<tr data-row='" + r.lead.id + "'>" +
            '<td><label class="checkbox"><input type="checkbox" data-batch="' + r.lead.id + '"' + (state.batch.has(r.lead.id) ? " checked" : "") + "></label></td>" +
            '<td><div class="biz-cell"><div style="width:32px;height:32px;border-radius:9px;background:' + UI.hexA(U().avatarColor(r.business.name || "?"), .15) + ';color:' + U().avatarColor(r.business.name) + ';display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px">' + U().initials(r.business.name) + "</div><div><div class='b-name'><a href='#/audits/" + r.lead.id + "'>" + U().escapeHtml(r.business.name) + "</a></div><div class='b-cat'>" + U().escapeHtml(r.business.category || "") + "</div></div></div></td>" +
            '<td><div style="width:90px">' + UI.scoreBar(r.digitalScore) + '<div style="font-size:12px;font-weight:800;margin-top:3px">' + r.digitalScore + " / 100</div></div></td>" +
            '<td>' + UI.miniScore(r.leadScore) + "</td>" +
            '<td>' + UI.badge(pri.label, pri.color, true) + "</td>" +
            '<td><span class="cell-sub">' + opps.length + " detected</span></td>" +
            '<td><span class="cell-sub">' + (r.audit ? "Audited · " + U().relativeTime(r.audit.updatedAt || r.audit.createdAt) : '<span style="color:var(--warn)">Not audited</span>') + "</span></td>" +
            '<td><button class="btn btn-sm btn-ghost" data-cmd="openAudit:' + r.lead.id + '">' + (r.audit ? I.pencil + " Edit" : I.plus + " Audit") + "</button></td></tr>";
        }).join("") + "</tbody></table></div>" :
        UI.emptyState("scan", "No leads match these filters.", state.high ? "No businesses currently meet the High Opportunity bar." : "Add a business below, then run a digital audit to score its online presence.", '<button class="btn btn-primary" data-cmd="addBusinessAudit">' + I.plus + " Add Business & Audit</button>")) ;
    UI.bind(el);
    bindList();
  }

  function bindList() {
    const el = document.getElementById("content");
    ["aud-flt-digital", "aud-flt-lead", "aud-flt-opps", "aud-flt-website", "aud-flt-google", "aud-flt-audit", "aud-flt-priority", "aud-flt-cat", "aud-flt-loc", "aud-flt-sort"].forEach((id) => {
      const s = el.querySelector("#" + id);
      if (!s) return;
      const key = id.replace("aud-flt-", "");
      s.addEventListener("change", (e) => {
        const v = e.target.value;
        state.flt[key] = key === "digital" || key === "lead" || key === "opps" ? Number(v) || 0 : v;
        if (key === "sort") state.sort = v;
        render();
      });
    });
    el.querySelectorAll("[data-batch]").forEach((cb) => cb.addEventListener("change", () => {
      if (cb.checked) state.batch.add(cb.dataset.batch); else state.batch.delete(cb.dataset.batch);
      render();
    }));
    el.querySelectorAll("[data-row]").forEach((tr) => tr.addEventListener("click", (e) => {
      if (e.target.closest("a") || e.target.closest("input") || e.target.closest("button") || e.target.closest("select")) return;
      V61.App.nav("#/audits/" + tr.dataset.row);
    }));
  }

  /* ── Audit form (unchanged behaviour; stores a snapshot on save) ── */
  function openAudit(leadId) {
    const lead = S().byId("leads", leadId);
    if (!lead) return;
    const biz = S().businessOf(lead);
    let audit = S().auditOf(lead.businessId);
    const existing = !!audit;
    if (!audit) { audit = S().emptyAudit(lead.businessId); S().db.audits.push(audit); }

    const m = UI.openModal({ title: (existing ? "Edit" : "Run") + " Digital Audit — " + (biz ? biz.name : ""), icon: I.scan, size: "modal-xl" });

    function sectionHtml(cat) {
      const meta = catMeta[cat];
      const checks = S().AUDIT_CHECKS[cat];
      if (cat === "social") {
        return '<div class="audit-section"><div class="audit-section-head"><h4>Social Media <span class="tag" style="margin-left:6px">' + meta.weight + " pts</span></h4></div>" +
          '<div class="check-grid">' + S().SOCIAL_PLATFORMS.map((pl) => {
            const c = (audit.social && audit.social[pl]) || {};
            return '<div class="social-check" data-pl="' + pl + '"><div style="font-size:12px;font-weight:700;text-transform:capitalize;margin-bottom:6px">' + pl + "</div>" +
              '<div class="check-grid" style="grid-template-columns:1fr 1fr">' +
              ["exists", "active", "quality", "consistency"].map((k) => '<div class="check-item ' + (c[k] ? "on" : "") + '" data-check="' + pl + ":" + k + '"><span class="box">' + I.check + "</span>" + k + "</div>").join("") +
              "</div></div>";
          }).join("") + "</div></div>";
      }
      const checksOn = (checks || []).filter(([k]) => audit[cat] && audit[cat][k]).length;
      const total = (checks || []).length;
      return '<div class="audit-section"><div class="audit-section-head"><h4>' + meta.label + ' <span class="tag" style="margin-left:6px">' + meta.weight + " pts</span></h4>" +
        '<span class="score-chip" data-scorechip="' + cat + '" style="background:var(--surface-3);color:var(--text-2)">' + checksOn + "/" + total + "</span></div>" +
        '<div class="check-grid">' + (checks || []).map(([k, label]) => '<div class="check-item ' + (audit[cat] && audit[cat][k] ? "on" : "") + '" data-check="' + cat + ":" + k + '"><span class="box">' + I.check + "</span>" + label + "</div>").join("") + "</div></div>";
    }

    m.setBody(
      '<div class="audit-live"><div id="audit-ring">' + UI.scoreRing(S().digitalScore(audit), "Digital") + "</div>" +
      '<div class="audit-break" id="audit-break">' + breakdownHtml() + "</div></div>" +
      '<div style="display:flex;align-items:center;gap:16px;margin-bottom:18px;flex-wrap:wrap">' +
      '<div><div style="font-weight:700;font-size:14px">Tap each item that is true for this business.</div>' +
      '<div style="font-size:12.5px;color:var(--text-3)">The Digital Presence Score updates as you go.</div></div>' +
      (biz && (biz.website || ((biz.googlePlaceId && D().key()) || biz.osmId)) ?
        '<button class="btn" id="audit-autofill" style="margin-left:auto">' + I.scan + " Auto-fill audit</button>" : "") +
      "</div>" +
      sectionHtml("website") + sectionHtml("google") + sectionHtml("social") + sectionHtml("branding") + sectionHtml("conversion") + sectionHtml("seo")
    );
    m.setFoot('<button class="btn" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Save Audit</button>');

    function breakdownHtml() {
      return S().auditBreakdown(audit).map((b) =>
        '<div class="ab-row"><span class="ab-label">' + b.label + "</span><span class='ab-bar'>" + UI.scoreBar(b.score) + "</span><span class='ab-val'>" + b.score + "</span></div>"
      ).join("") +
      '<div class="audit-band">' + UI.badge(S().scoreBand(S().digitalScore(audit)).label, S().scoreBand(S().digitalScore(audit)).color, true) + "</div>";
    }

    function recalc() {
      const ring = m.body.querySelector("#audit-ring");
      if (ring) ring.innerHTML = UI.scoreRing(S().digitalScore(audit), "Digital");
      const br = m.body.querySelector("#audit-break");
      if (br) br.innerHTML = breakdownHtml();
    }
    m.body.querySelectorAll(".check-item").forEach((it) => {
      it.addEventListener("click", () => {
        const [cat, key] = it.dataset.check.split(":");
        const isSocial = !!(audit.social && audit.social[cat]);
        const target = isSocial ? audit.social[cat] : audit[cat];
        const val = !target[key];
        if (isSocial) { audit.social[cat] = audit.social[cat] || {}; audit.social[cat][key] = val; if (!val && key === "exists") { ["active", "quality", "consistency"].forEach((x) => { audit.social[cat][x] = false; }); } }
        else { audit[cat] = audit[cat] || {}; audit[cat][key] = val; if (!val && key === "exists" && cat === "website") { ["mobile", "https", "modern", "speed", "cta", "contact", "seo"].forEach((x) => { audit[cat][x] = false; }); } }
        it.classList.toggle("on", !!target[key]);
        const catChecks = m.body.querySelectorAll('[data-check^="' + cat + '"]');
        const on = m.body.querySelectorAll('[data-check^="' + cat + '"].on').length;
        const chip = m.body.querySelector('[data-scorechip="' + cat + '"]');
        if (chip) chip.textContent = on + "/" + catChecks.length;
        recalc();
      });
    });
    m.q("[data-cancel]").addEventListener("click", () => m.close());
    m.q("[data-save]").addEventListener("click", () => {
      audit.updatedAt = U().now();
      const finalScore = S().digitalScore(audit);
      S().addActivity(lead.id, "note", "Digital audit " + (existing ? "updated" : "completed") + " — score " + finalScore + "/100.");
      S().saveAuditSnapshot(lead.businessId, { digitalScore: finalScore, websiteScore: Score().websiteScoreFor(biz, audit, S().latestWebsiteAudit(lead.businessId)), leadScore: S().leadScore(lead, biz, audit), opportunities: S().opportunities(audit, biz).map((o) => o.title) });
      S().save(); m.close(); V61.Toast.success("Audit saved — Digital Score " + finalScore + "/100");
      V61.App.renderRoute();
    });
    const autofill = m.body.querySelector("#audit-autofill");
    if (autofill) autofill.addEventListener("click", () => {
      const src = detailsSourceFor(biz);
      const label = "Auto-fill audit";
      autofill.disabled = true; autofill.textContent = "Analyzing…";
      let webMsg = "";
      const srcPromise = (biz.osmId || (biz.googlePlaceId && D().key()))
        ? D().details(src === "osm" ? biz.osmId : biz.googlePlaceId)
            .then((d) => { applyDetails(audit, d, src); })
            .catch(() => {})
        : Promise.resolve();
      const webPromise = biz.website
        ? V61.WebsiteAnalyzer.analyze(biz, { timeout: 12000 })
            .then((wa) => {
              S().saveWebsiteAudit(biz.id, wa);
              audit.website = audit.website || {};
              audit.website.exists = wa.status !== "not_available";
              webMsg = wa.status === "ok" ? "website analyzed (" + (wa.score != null ? wa.score + "/100" : "no score") + ")" : (wa.summary || "website analysis incomplete");
            })
            .catch(() => {})
        : Promise.resolve();
      Promise.all([srcPromise, webPromise]).then(() => {
        audit.updatedAt = U().now();
        recalc();
        m.body.querySelectorAll(".check-item").forEach((it) => {
          const [cat, key] = it.dataset.check.split(":");
          const target = (audit.social && audit.social[cat]) ? audit.social[cat] : audit[cat];
          it.classList.toggle("on", !!(target && target[key]));
          const chip = m.body.querySelector('[data-scorechip="' + cat + '"]');
          if (chip) chip.textContent = m.body.querySelectorAll('[data-check^="' + cat + '"].on').length + "/" + m.body.querySelectorAll('[data-check^="' + cat + '"]').length;
        });
        autofill.disabled = false; autofill.textContent = label;
        V61.Toast.success(webMsg ? "Auto-fill done — " + webMsg + ". Review the rest manually." : "Audit auto-filled — review the rest manually.");
      });
    });
  }

  /* ── Quick add: a business by name → add to CRM → run the digital audit ── */
  function placeIdFromInput(input) {
    const s = String(input || "").trim();
    if (!s) return "";
    const m = s.match(/place_id:([A-Za-z0-9_\-]+)/);
    if (m) return m[1];
    if (/^ChI[A-Za-z0-9_\-]+$/.test(s)) return s;
    return "";
  }

  function addBusinessAudit() {
    const m = UI.openModal({ title: "Add Business & Run Audit", icon: I.plus, size: "lg" });
    m.setBody(
      '<div class="field"><label>Business name *</label><input class="input" id="qba-name" placeholder="e.g. Sarfo&rsquo;s Kitchen"></div>' +
      '<div class="field-row"><div class="field"><label>Category</label><input class="input" id="qba-cat" list="qba-cat-list" placeholder="e.g. Restaurant"><datalist id="qba-cat-list">' + GP().catMetaOptions() + "</datalist></div>" +
      '<div class="field"><label>City / Area</label><input class="input" id="qba-city" placeholder="e.g. Osu, Accra"></div></div>' +
      '<div class="field"><label>Website</label><input class="input" id="qba-website" placeholder="e.g. example.com"></div>' +
      '<div class="field"><label>Google Maps URL or Place ID</label><input class="input" id="qba-place" placeholder="Optional — paste a Google Maps link to auto-fill the audit"></div>' +
      '<div class="field-row"><div class="field"><label>Phone / WhatsApp</label><input class="input" id="qba-phone" placeholder="+233 ..."></div>' +
      '<div class="field"><label>Email</label><input class="input" id="qba-email" placeholder=""></div></div>'
    );
    m.setFoot('<button class="btn" data-cancel>Cancel</button><button class="btn btn-primary" data-go>' + I.scan + " Add & Run Audit</button>");
    m.q("[data-cancel]").addEventListener("click", () => m.close());
    m.q("[data-go]").addEventListener("click", () => {
      const name = m.body.querySelector("#qba-name").value.trim();
      if (!name) { V61.Toast.error("Business name is required"); return; }
      const gmaps = m.body.querySelector("#qba-place").value.trim();
      const placeId = placeIdFromInput(gmaps);
      const biz = S().addBusiness({
        name,
        category: m.body.querySelector("#qba-cat").value.trim(),
        city: m.body.querySelector("#qba-city").value.trim(),
        website: m.body.querySelector("#qba-website").value.trim(),
        phone: m.body.querySelector("#qba-phone").value.trim(),
        whatsapp: m.body.querySelector("#qba-phone").value.trim(),
        email: m.body.querySelector("#qba-email").value.trim(),
        googlePlaceId: placeId || "",
        googleProfileUrl: placeId ? "https://www.google.com/maps/place/?q=place_id:" + placeId : gmaps,
      });
      const lead = S().addLead(biz.id, { source: "manual" });
      S().addActivity(lead.id, "note", "Business added — running digital audit.");
      S().save();
      m.close();
      runBusinessAudit(lead.id);
    });
  }

  /* Auto-fill and save an audit for a freshly added business, then open the
     audit detail page. Uses the same real data sources as batch auditing:
     Google/OSM listing facts when a place is known, plus website analysis
     when a URL is provided. Nothing is invented. */
  function runBusinessAudit(leadId) {
    const lead = S().byId("leads", leadId);
    if (!lead || !S().businessOf(lead)) { V61.App.nav("#/audits"); return; }
    const biz = S().businessOf(lead);
    const m = UI.openModal({ title: "Running audit — " + (biz ? biz.name : "Business"), icon: I.scan });
    m.setBody('<div style="font-size:13.5px;color:var(--text-2);margin-bottom:14px">Analyzing <b>' + U().escapeHtml(biz ? biz.name : "") + "</b>…</div>" +
      '<div class="progress"><i id="qba-bar" style="width:0%"></i></div>' +
      '<div id="qba-list" style="margin-top:14px;display:flex;flex-direction:column;gap:6px"></div>');
    const listEl = m.body.querySelector("#qba-list");
    const bar = m.body.querySelector("#qba-bar");
    const rowHtml = (label, status) => '<div style="display:flex;justify-content:space-between;gap:8px;font-size:12.5px"><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + U().escapeHtml(label) + '</span><span style="color:var(--text-3)">' + U().escapeHtml(status) + "</span></div>";
    let audit = S().auditOf(biz.id);
    const existing = !!audit;
    if (!audit) { audit = S().emptyAudit(biz.id); S().db.audits.push(audit); }

    (async () => {
      const srcPromise = (biz.osmId || (biz.googlePlaceId && D().key()))
        ? (listEl.insertAdjacentHTML("beforeend", rowHtml("Listing facts", "fetching…")),
            D().details(biz.osmId || biz.googlePlaceId)
              .then((d) => { applyDetails(audit, d, detailsSourceFor(biz)); listEl.lastElementChild.innerHTML = rowHtml("Listing facts", "filled ✓"); })
              .catch(() => { listEl.lastElementChild.innerHTML = rowHtml("Listing facts", "not available"); }))
        : Promise.resolve();
      const webPromise = biz.website
        ? (listEl.insertAdjacentHTML("beforeend", rowHtml("Website analysis", "fetching…")),
            V61.WebsiteAnalyzer.analyze(biz, { timeout: 12000 })
              .then((wa) => {
                S().saveWebsiteAudit(biz.id, wa);
                audit.website = audit.website || {};
                audit.website.exists = wa.status !== "not_available";
                listEl.lastElementChild.innerHTML = rowHtml("Website analysis", wa.status === "ok" ? "Detected " + wa.score + "/100 ✓" : (wa.summary || wa.status));
              })
              .catch(() => { listEl.lastElementChild.innerHTML = rowHtml("Website analysis", "unavailable"); }))
        : Promise.resolve();
      bar.style.width = "40%";
      await Promise.all([srcPromise, webPromise]);
      audit.updatedAt = U().now();
      const finalScore = S().digitalScore(audit);
      S().saveAuditSnapshot(biz.id, { digitalScore: finalScore, websiteScore: Score().websiteScoreFor(biz, audit, S().latestWebsiteAudit(biz.id)), leadScore: S().leadScore(lead, biz, audit), opportunities: S().opportunities(audit, biz).map((o) => o.title) });
      S().save();
      bar.style.width = "100%";
      m.close();
      V61.Toast.success((existing ? "Audit updated" : "Audit run") + " — Digital Score " + finalScore + "/100");
      V61.App.nav("#/audits/" + leadId);
    })();
  }

  /* ── Batch digital audit (sequential, cancellable, progress) ── */
  function runBatchAudit() {
    const leadIds = [...state.batch];
    if (!leadIds.length) return;
    const m = UI.openModal({ title: "Running Digital Audits", icon: I.scan });
    m.setBody('<div style="font-size:13.5px;color:var(--text-2);margin-bottom:14px">Analyzing <b id="bp-cur">0</b> of <b>' + leadIds.length + "</b>…</div>" +
      '<div class="progress"><i id="bp-bar" style="width:0%"></i></div>' +
      '<div id="bp-list" style="margin-top:14px;display:flex;flex-direction:column;gap:6px"></div>');
    m.setFoot('<button class="btn btn-danger" data-cancel>' + I.x + " Cancel</button>");
    let aborted = false;
    m.q("[data-cancel]").addEventListener("click", () => { aborted = true; m.body.querySelector("#bp-cur").textContent = "cancelling…"; });
    const listEl = m.body.querySelector("#bp-list");
    const bar = m.body.querySelector("#bp-bar");
    const cur = m.body.querySelector("#bp-cur");
    const rowHtml = (label, status) => '<div style="display:flex;justify-content:space-between;gap:8px;font-size:12.5px"><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + U().escapeHtml(label) + '</span><span style="color:var(--text-3)">' + U().escapeHtml(status) + "</span></div>";
    leadIds.forEach((id, i) => { const l = S().byId("leads", id); listEl.insertAdjacentHTML("beforeend", rowHtml((l && S().businessOf(l) && S().businessOf(l).name) || "Lead", "queued")); });

    (async () => {
      let done = 0;
      for (let i = 0; i < leadIds.length; i++) {
        if (aborted) break;
        const lead = S().byId("leads", leadIds[i]);
        const biz = lead ? S().businessOf(lead) : null;
        if (!lead || !biz) { done++; continue; }
        cur.textContent = (done + 1) + "";
        bar.style.width = Math.round(((done + 1) / leadIds.length) * 100) + "%";
        listEl.querySelectorAll("div")[i].innerHTML = rowHtml(biz.name, "analyzing…");
        let audit = S().auditOf(lead.businessId);
        if (!audit) { audit = S().emptyAudit(lead.businessId); S().db.audits.push(audit); }
        if ((biz.googlePlaceId && D().key()) || biz.osmId) {
          try {
            const src = detailsSourceFor(biz);
            const d = await D().details(src === "osm" ? biz.osmId : biz.googlePlaceId);
            applyDetails(audit, d, src);
          } catch (e) {}
        }
        if (biz.website) {
          listEl.querySelectorAll("div")[i].innerHTML = rowHtml(biz.name, "website…");
          try {
            const wa = await V61.WebsiteAnalyzer.analyze(biz, { timeout: 8000 });
            S().saveWebsiteAudit(biz.id, wa);
            audit.website = audit.website || {};
            audit.website.exists = wa.status !== "not_available";
          } catch (e) {}
        }
        audit.updatedAt = U().now();
        const finalScore = S().digitalScore(audit);
        S().saveAuditSnapshot(biz.id, { digitalScore: finalScore, websiteScore: Score().websiteScoreFor(biz, audit, S().latestWebsiteAudit(biz.id)), leadScore: S().leadScore(lead, biz, audit), opportunities: S().opportunities(audit, biz).map((o) => o.title) });
        listEl.querySelectorAll("div")[i].innerHTML = rowHtml(biz.name, "Digital " + finalScore + "/100 ✓");
        done++;
      }
      S().save();
      bar.style.width = "100%";
      cur.textContent = done + "";
      m.setFoot('<button class="btn btn-primary" data-close>Done</button>');
      const closeBtn = m.body.querySelector("[data-close]") || m.foot.querySelector("[data-close]");
      if (closeBtn) closeBtn.addEventListener("click", () => { m.close(); state.batch.clear(); render(); });
      V61.Toast.success(done + " of " + leadIds.length + " audits completed");
    })();
  }

  /* ── Opportunities page (aggregate) ── */
  /* Phase 3: Today's prospect queue — high-opportunity leads ready to work now. */
  function todaysQueue() {
    const rows = S().leadRows()
      .filter((r) => S().isHighOpportunity(r) && !["won", "lost"].includes(r.lead.stage))
      .sort((a, b) => b.leadScore - a.leadScore)
      .slice(0, 6);
    if (!rows.length) return "";
    return '<div class="panel" style="margin-bottom:16px"><div class="panel-head"><div class="panel-title">' + I.rocket + " Today's prospect queue" + '<span class="sub">high opportunities, act now</span></div></div>' +
      '<div class="panel-body"><div class="stack">' + rows.map((r) => {
        const opps = OE().forRow(r);
        const b = r.business || {};
        const wa = b.whatsapp || b.phone;
        return '<div class="row-card" style="padding:12px 14px"><div class="rc-main"><div class="rc-title" style="font-size:13.5px"><a href="#/leads/' + r.lead.id + '" style="color:inherit">' + U().escapeHtml(b.name) + "</a></div>" +
          '<div class="rc-sub">' + U().escapeHtml([b.category, b.city].filter(Boolean).join(" • ")) + (opps[0] ? " · <b style='color:var(--accent)'>" + U().escapeHtml(opps[0].service) + "</b>" : "") + "</div></div>" +
          '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' + UI.miniScore(r.leadScore) +
          (wa ? '<a class="btn btn-sm" target="_blank" rel="noopener" href="' + U().waLink(wa, S().buildMessage(b.name, b.category)) + '" title="WhatsApp">' + I.whatsapp + "</a>" : "") +
          '<button class="btn btn-sm" data-cmd="generateOutreach:' + r.lead.id + '">' + I.send + " Outreach</button></div></div>";
      }).join("") + "</div></div></div>";
  }

  function renderOpportunities() {
    const el = document.getElementById("content");
    const all = [];
    S().leadRows().forEach((r) => {
      const opps = OE().forRow(r);
      opps.forEach((o) => all.push({ opp: o, business: r.business, lead: r.lead, score: r.digitalScore }));
    });
    const counts = {};
    all.forEach((x) => { counts[x.opp.service] = (counts[x.opp.service] || 0) + 1; });
    const byType = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const top = byType.slice(0, 6);

    el.innerHTML =
      '<div class="page-head"><div><div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.14em">Prospecting</div>' +
      '<h1 class="page-title">Opportunities</h1><p class="page-sub">' + all.length + " opportunities detected across " + S().db.leads.length + " leads</p></div></div>" +
      todaysQueue() +
      '<div class="grid-2-1"><div style="display:flex;flex-direction:column;gap:18px">' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.lightbulb + ' Top opportunity types</div></div><div class="panel-body"><div class="stack">' +
      top.map(([title, n]) => {
        const sample = all.find((x) => x.opp.service === title);
        const max = Math.max(1, top[0][1]);
        return '<div class="row-card" style="padding:11px 14px"><div class="opp-item" style="border:none;background:transparent;padding:0;flex:1"><div class="o-icon">' + (I[sample.opp.icon] || I.zap) + '</div><div style="flex:1"><h5 style="font-size:13px">' + U().escapeHtml(title) + ' <span class="tag" style="margin-left:5px">' + n + " leads</span></h5><p>" + U().escapeHtml(sample.opp.reason) + "</p></div></div>" +
        '<div class="progress" style="width:110px;align-self:center"><i style="width:' + Math.round((n / max) * 100) + '%;background:var(--accent)"></i></div></div>';
      }).join("") + "</div></div></div>" +

      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.zap + ' All detected opportunities</div></div><div class="panel-body"><div class="table-wrap" style="border:none"><table class="data" style="min-width:640px"><thead><tr><th>Business</th><th>Opportunity</th><th>Priority</th><th>Digital score</th><th></th></tr></thead><tbody>' +
      all.map((x) => "<tr><td><div class='b-name'><a href='#/leads/" + x.lead.id + "'>" + U().escapeHtml(x.business.name) + "</a></div><div class='b-cat'>" + U().escapeHtml(x.business.category || "") + "</div></td>" +
        '<td><div style="display:flex;gap:8px;align-items:center"><span style="color:var(--accent)">' + (I[x.opp.icon] || I.zap) + "</span>" + U().escapeHtml(x.opp.service) + "</div></td>" +
        "<td>" + UI.badge(x.opp.priority.label, x.opp.priority.color, true) + "</td>" +
        '<td><span class="mini-score cold">' + x.score + "</span></td>" +
        '<td><a class="btn btn-sm btn-ghost" href="#/leads/' + x.lead.id + '">' + I.eye + " Open</a></td></tr>").join("") +
      "</tbody></table></div></div></div></div>" +

      '<div style="display:flex;flex-direction:column;gap:18px">' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.pie + ' Score distribution</div></div><div class="panel-body"><div class="stack">' +
      [["Strong (80–100)", 80, "#3f9d5f"], ["Good (60–79)", 60, "#e0a53e"], ["Needs Improvement (40–59)", 40, "#ed4217"], ["Major Opportunity (0–39)", 0, "#c2362b"]].map(([label, min, color]) => {
        const n = S().leadRows().filter((r) => r.digitalScore >= min).length;
        const max2 = S().db.leads.length || 1;
        return '<div><div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:5px"><span>' + label + '</span><b style="color:' + color + '">' + n + "</b></div><div class='progress'><i style='width:" + Math.round((n / max2) * 100) + "%;background:" + color + "'></i></div></div>";
      }).join("") + "</div></div></div>" +
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.scan + ' Audit coverage</div></div><div class="panel-body">' +
      '<div class="progress" style="margin-bottom:6px"><i style="width:' + Math.round((S().db.audits.length / Math.max(1, S().db.leads.length)) * 100) + '%"></i></div>' +
      '<div style="font-size:12.5px;color:var(--text-3)">' + S().db.audits.length + " of " + S().db.leads.length + " leads have a digital audit.</div></div></div>" +
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.rocket + ' Suggested next actions</div></div><div class="panel-body"><div class="stack" style="font-size:13px;color:var(--text-2)">' +
      '<div>1. Audit the <b style="color:var(--text)">unaudited</b> leads to surface hidden opportunities.</div>' +
      '<div>2. Prioritise <b style="color:var(--text)">hot leads</b> with a website opportunity for your next outreach batch.</div>' +
      '<div>3. Use <b style="color:var(--text)">High Opportunities</b> on the Audits page to shortlist the best prospects.</div></div></div></div>' +
      "</div></div>";
    UI.bind(el);
  }

  /* ═══════════ AUDIT DETAIL PAGE (#/audits/:leadId) ═══════════ */
  function auditDetail(leadId) {
    const lead = S().byId("leads", leadId);
    if (!lead) { V61.App.nav("#/audits"); return; }
    const biz = S().businessOf(lead);
    const audit = S().auditOf(lead.businessId);
    const wa = S().latestWebsiteAudit(lead.businessId);
    const dScore = S().digitalScore(audit);
    const lScore = lead.scoreOverride != null ? U().clamp(Math.round(lead.scoreOverride), 1, 100) : S().leadScore(lead, biz, audit);
    const temp = lead.temperature || S().temperatureFor(lScore);
    const opps = OE().forRow({ lead, business: biz, audit });
    const rec = OE().recommended({ lead, business: biz, audit });
    const breakdown = Score().scoreBreakdown100(audit, wa);
    const snaps = S().auditSnapshotsFor(biz.id);
    const growth = Score().growth(snaps);
    const facts = Score().factBoard(biz, audit, wa);
    const pri = Score().priorityFor(lScore, opps.length);
    const dband = S().scoreBand(dScore);
    const el = document.getElementById("content");

    const confBadge = (c) => UI.badge(c.label, c.color, false);
    const websiteSection = (() => {
      if (!biz.website) {
        return '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.globe + " Website" + "</div></div><div class='panel-body'>" +
          '<div style="font-size:13px;color:var(--text-3)">Website status: <b style="color:var(--text)">Not available</b> — no website URL is associated with this business, so no analysis was attempted.</div></div></div>';
      }
      const status = wa ? wa.status : null;
      let body;
      if (status === "ok" && wa) {
        const sig = wa.signals || {};
        const chips = [
          ["HTTPS", sig.https], ["Viewport/mobile", sig.viewport || sig.mobile], ["Page title", sig.titleOk], ["Meta description", sig.metaDesc],
          ["H1", sig.h1], ["Canonical", sig.canonical], ["robots.txt", sig.robots], ["sitemap.xml", sig.sitemap],
          ["Phone", sig.phone], ["Email", sig.email], ["WhatsApp", sig.whatsapp], ["Contact form", sig.form],
          ["Booking", sig.booking], ["Ordering", sig.ordering], ["Content", sig.businessInfo], ["Services listed", sig.servicesListed],
          ["Address", sig.address], ["Social links", (sig.social && Object.keys(sig.social).filter((k) => sig.social[k]).length) > 0],
        ];
        body = '<div style="font-size:12.5px;color:var(--text-3);margin-bottom:10px">' + U().escapeHtml(wa.summary) + " · <b>" + wa.score + " / 100</b></div>" +
          '<div style="display:flex;flex-wrap:wrap;gap:6px">' + chips.map(([label, on]) =>
            on === true ? '<span class="tag" style="background:var(--accent-soft);color:var(--ok)">' + label + "</span>" :
            on === false ? '<span class="tag" style="color:var(--text-3)">' + label + " —</span>" :
            '<span class="tag" style="color:var(--text-3);opacity:.7" title="Not determinable from the browser">' + label + " ?</span>"
          ).join("") + "</div>" +
          '<div style="margin-top:12px;font-size:12.5px;color:var(--text-3)">Facts above are <b style="color:var(--text-2)">Detected</b> from the live page. Manual audit checks merge in automatically.</div>';
      } else if (status === "blocked") {
        body = '<div style="font-size:12.5px;color:var(--warn);line-height:1.6"><b>Analysis unavailable</b> — ' + U().escapeHtml(wa.message) + "</div>" +
          '<div style="margin-top:8px;font-size:12px;color:var(--text-3)">' + U().escapeHtml(wa.hint) + "</div>";
      } else if (status === "unreachable" || status === "http_error" || status === "error") {
        body = '<div style="font-size:12.5px;color:var(--warn);line-height:1.6"><b>' + U().escapeHtml(wa.summary) + "</b> — " + U().escapeHtml(wa.message) + "</div>";
      } else {
        body = '<div style="font-size:12.5px;color:var(--text-3)">No analysis yet. Run one to detect real website signals.</div>';
      }
      return '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.globe + " Website" + '<span class="sub">' + U().escapeHtml(biz.website) + "</span></div>" +
        '<button class="btn btn-sm" id="audit-run-website">' + I.scan + (wa ? " Re-analyze website" : " Run website analysis") + "</button></div>" +
        '<div class="panel-body">' + body + "</div></div>";
    })();

    el.innerHTML =
      '<a href="#/audits" class="btn btn-ghost" style="margin-bottom:14px">' + I.chevronL + " Back to audits</a>" +
      '<div class="panel" style="padding:22px"><div class="ld-head">' +
      '<div class="avatar big" style="background:' + UI.hexA(U().avatarColor(biz.name), .15) + ';color:' + U().avatarColor(biz.name) + '">' + U().initials(biz.name) + "</div>" +
      '<div style="flex:1;min-width:220px"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><h1 class="ld-title">' + U().escapeHtml(biz.name) + "</h1>" + UI.stageBadge(lead.stage) + UI.tempBadge(temp) + UI.badge(pri.label, pri.color, true) + "</div>" +
      '<div class="ld-sub">' + U().escapeHtml([biz.category, biz.city, biz.address].filter(Boolean).join(" • ") || "No category") + "</div>" +
      '<div class="ld-actions" style="margin-top:12px">' +
      '<button class="btn btn-sm" data-cmd="openAudit:' + lead.id + '">' + (audit ? I.pencil + " Edit Audit" : I.plus + " Run Audit") + "</button>" +
      '<button class="btn btn-sm" data-cmd="aiExplain:' + lead.id + '">' + I.lightbulb + " Explain with AI</button>" +
      '<a class="btn btn-sm btn-ghost" href="#/leads/' + lead.id + '">' + I.eye + " Open lead</a></div></div>" +
      '<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">' +
      UI.scoreRing(dScore, "Digital") +
      '<div style="display:flex;flex-direction:column;gap:4px;align-items:center">' + UI.scoreRing(lScore, temp === "hot" ? "Hot 🔥" : temp === "warm" ? "Warm" : "Cold") + "</div>" +
      '</div></div></div>' +

      '<div class="dash-grid">' +
      '<div style="display:flex;flex-direction:column;gap:18px">' +

      /* sub-scores */
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.pie + ' Score breakdown</div></div><div class="panel-body">' +
      (breakdown.length ? '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 18px">' + breakdown.map((b) =>
        '<div><div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px"><span style="font-weight:600">' + b.label + '</span><b style="font-variant-numeric:tabular-nums">' + b.score + " / 100</b></div>" + UI.scoreBar(b.score) + "</div>"
      ).join("") + "</div>" : '<div style="font-size:12.5px;color:var(--text-3)">No category has enough real data yet — run or edit the audit to populate scores.</div>') +
      '</div></div>' +

      websiteSection +

      /* opportunities */
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.lightbulb + ' Opportunities' + '<span class="sub">' + opps.length + "</span></div></div>" +
      '<div class="panel-body"><div class="stack">' + (opps.length ? opps.map((o) => oppCard(o, lead.id)).join("") :
        '<div style="font-size:12.5px;color:var(--text-3)">No major opportunities detected — this business has a solid digital presence.</div>') +
      "</div>" + (opps.length ? '<p style="margin-top:14px;font-size:12.5px;color:var(--text-2);line-height:1.6;border-left:3px solid var(--accent);padding-left:10px"><b>Summary:</b> ' + U().escapeHtml(OE().summary({ lead, business: biz, audit })) + "</p>" : "") + "</div></div>" +

      /* recommended services */
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.rocket + ' Recommended for this business</div></div><div class="panel-body"><div class="stack">' +
      (rec.length ? rec.map((o) =>
        '<div class="row-card" style="padding:12px 14px"><div class="rc-main"><div class="rc-title" style="font-size:13.5px">' + U().escapeHtml(o.service) + '</div><div class="rc-sub">' + U().escapeHtml(o.reason) + "</div></div>" +
        '<div style="display:flex;align-items:center;gap:8px">' + UI.badge(o.priority.label + " PRIORITY", o.priority.color, true) +
        '<button class="btn btn-sm btn-primary" data-addprop="' + lead.id + '|' + U().escapeHtml(o.service) + '">' + I.plus + " Add to Proposal</button></div></div>"
      ).join("") : '<div style="font-size:12.5px;color:var(--text-3)">Nothing to recommend yet.</div>') +
      "</div></div></div>" +

      /* audit history + growth */
      historySection(snaps, growth, dScore, audit) +

      "</div>" +

      '<div style="display:flex;flex-direction:column;gap:18px">' +

      /* audit evidence / fact board */
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.clipboard + ' Audit evidence & confidence</div></div><div class="panel-body">' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px">' + facts.map((f) =>
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12.5px"><span style="color:var(--text-2)">' + U().escapeHtml(f.label) + "</span>" + confBadge(Score().confidenceOf(f.confidence)) + "</div>"
      ).join("") + "</div>" +
      '<div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:6px">' + Score().CONFIDENCE.map((c) =>
        '<span class="tag" style="font-size:11px">' + c.label + ": " + c.desc + "</span>"
      ).join("") + "</div></div></div>" +

      /* notes */
      (biz.notes ? '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.pencil + " Notes</div></div><div class='panel-body' style='font-size:12.5px;color:var(--text-2);white-space:pre-wrap'>" + U().escapeHtml(biz.notes) + "</div></div>" : "") +

      "</div></div>";

    UI.bind(el);
    const runBtn = el.querySelector("#audit-run-website");
    if (runBtn) runBtn.addEventListener("click", () => runWebsiteAnalysis(lead.id, runBtn));
    el.querySelectorAll("[data-addprop]").forEach((b) => b.addEventListener("click", () => {
      const [lid, svc] = b.dataset.addprop.split("|");
      addToProposal(lid, svc);
    }));
  }

  function oppCard(o, leadId) {
    return '<div class="opp-card"><div class="opp-card-head"><div class="o-icon">' + (I[o.icon] || I.zap) + '</div>' +
      '<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:13.5px">' + U().escapeHtml(o.service) + '</div><div class="disc-sub">' + U().escapeHtml(o.category) + "</div></div>" +
      '<span style="font-size:11px;font-weight:800;color:' + o.priority.color + '">' + (o.priority.key === "high" ? "🔥 " : o.priority.key === "medium" ? "🟠 " : "🔵 ") + o.priority.label + "</span></div>" +
      '<div class="opp-why"><b>Why:</b> ' + U().escapeHtml(o.reason) + "</div>" +
      '<div class="opp-ev"><b>Evidence:</b> ' + U().escapeHtml(o.evidence) + "</div>" +
      '<div style="margin-top:10px"><button class="btn btn-sm btn-primary" data-addprop="' + leadId + '|' + U().escapeHtml(o.service) + '">' + I.plus + " Add to Proposal</button></div></div>";
  }

  function historySection(snaps, growth, dScore, audit) {
    const entries = (snaps || []).slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const html = entries.length ? entries.map((sn) => {
      const d = sn.data || {};
      return '<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px dashed var(--border);font-size:12.5px">' +
        '<span style="width:86px;color:var(--text-3)">' + U().formatDate(sn.createdAt) + "</span>" +
        '<b style="width:70px;font-variant-numeric:tabular-nums">Digital ' + (d.digitalScore != null ? d.digitalScore + "/100" : "—") + "</b>" +
        '<span class="cell-sub">' + (d.websiteScore != null ? "Web " + d.websiteScore : "—") + "</span>" +
        '<span class="cell-sub">' + (d.opportunities ? d.opportunities.length + " opps" : "") + "</span>" +
        '<button class="btn btn-sm btn-ghost" style="margin-left:auto" data-hist-lead="' + U().escapeHtml(String(sn.businessId)) + '">' + I.clock + " Open</button></div>";
    }).join("") : (audit ? '<div style="font-size:12.5px;color:var(--text-3)">Snapshots are captured every time this audit is saved.</div>' : "");
    let growthHtml = "";
    if (growth) {
      const cls = growth.delta >= 0 ? "growth-up" : "growth-down";
      growthHtml = '<div class="growth-card ' + cls + '"><div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-3)">Digital Growth</div>' +
        '<div style="font-size:22px;font-weight:900;font-variant-numeric:tabular-nums">' + growth.from + " → " + growth.to + "</div>" +
        '<div style="font-size:13px;font-weight:700;color:var(--ok)">' + (growth.delta >= 0 ? "+" : "") + growth.delta + " points</div></div>";
    }
    return '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.calendar + " Audit history" + '<span class="sub">' + entries.length + " snapshot" + (entries.length === 1 ? "" : "s") + "</span></div></div>" +
      '<div class="panel-body">' + growthHtml + (html || '<div style="font-size:12.5px;color:var(--text-3)">No audits saved yet. Current Digital Score: ' + dScore + "/100.</div>") + "</div></div>";
  }

  function runWebsiteAnalysis(leadId, btn) {
    const lead = S().byId("leads", leadId);
    const biz = S().businessOf(lead);
    if (!biz || !biz.website) { V61.Toast.warn("No website to analyze"); return; }
    btn.disabled = true; btn.textContent = "Analyzing…";
    V61.WebsiteAnalyzer.analyze(biz).then((wa) => {
      S().saveWebsiteAudit(biz.id, wa);
      S().save();
      V61.Toast.success(wa.status === "ok" ? "Website analyzed — " + wa.score + "/100" : wa.summary);
      auditDetail(leadId);
    }).catch((e) => {
      btn.disabled = false; btn.textContent = "Run website analysis";
      V61.Toast.error(e.message || "Analysis failed");
    });
  }

  /* ── Add to Proposal (Part 12) ── */
  function addToProposal(leadId, serviceName) {
    const lead = S().byId("leads", leadId);
    if (!lead) return;
    const biz = S().businessOf(lead);
    const svc = S().db.services.find((x) => x.active && x.name.toLowerCase() === String(serviceName).toLowerCase());
    if (svc) {
      V61.Pages.sales.createProposal(leadId, svc.name);
      return;
    }
    const m = UI.openModal({ title: "Add manual line item — " + serviceName, icon: I.fileText });
    m.setBody('<div style="font-size:12.5px;color:var(--text-3);margin-bottom:12px">No active catalog service matches \u201c' + U().escapeHtml(serviceName) + '\u201d. Enter a price to create the proposal draft (leave 0 to edit later).</div>' +
      '<div class="field"><label>Service name</label><input class="input" id="pp-name" value="' + U().escapeHtml(serviceName) + '"></div>' +
      '<div class="field"><label>Price (GH₵)</label><input class="input" id="pp-price" type="number" min="0" placeholder="0"></div>');
    m.setFoot('<button class="btn" data-cancel>Cancel</button><button class="btn btn-primary" data-go>Create proposal draft</button>');
    m.q("[data-cancel]").addEventListener("click", () => m.close());
    m.q("[data-go]").addEventListener("click", () => {
      const name = m.body.querySelector("#pp-name").value.trim() || serviceName;
      const price = Number(m.body.querySelector("#pp-price").value) || 0;
      m.close();
      V61.Pages.sales.createProposal(leadId, null, { name, price });
    });
  }

  V61.Pages.audit = Object.assign(V61.Pages.audit || {}, { render, openAudit, renderOpportunities, addBusinessAudit, runBusinessAudit });
  V61.Pages.audits = render;
  V61.Pages.opportunities = renderOpportunities;
  V61.Pages.auditDetail = auditDetail;
  V61.Pages.batchAudit = runBatchAudit;
  V61.Cmd = V61.Cmd || {};
  Object.assign(V61.Cmd, { addBusinessAudit, batchAudit: runBatchAudit, highOpps: () => { state.high = !state.high; render(); }, aiExplain: (leadId) => {
    const row = S().leadRows().find((r) => r.lead.id === leadId);
    if (!row) return;
    V61.AI.explainAudit(row).then((res) => V61.AI.present("audit explanation", res, "AI Audit Explanation — " + ((row.business && row.business.name) || "Business")));
  } });
})();