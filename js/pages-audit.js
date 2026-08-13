/* VISION 61 CRM — Digital audits, opportunities, lead discovery */
window.V61 = window.V61 || {};
V61.Pages = V61.Pages || {};

(function () {
  const U = () => V61.Utils;
  const S = () => V61.Store;
  const I = V61.Icons;
  const UI = V61.UI;

  const catMeta = {
    website: { label: "Website", weight: 25 },
    google: { label: "Google Profile", weight: 20 },
    social: { label: "Social Media", weight: 20 },
    branding: { label: "Branding", weight: 15 },
    conversion: { label: "Conversion", weight: 10 },
    seo: { label: "SEO", weight: 10 },
  };

  function auditRow(businessId) {
    const audit = S().auditOf(businessId);
    return { audit, score: S().digitalScore(audit), band: S().scoreBand(S().digitalScore(audit)) };
  }

  /* ── Audits list ── */
  function render() {
    const el = document.getElementById("content");
    const rows = S().leadRows().map((r) => ({ lead: r.lead, business: r.business, audit: r.audit, score: r.digitalScore, band: S().scoreBand(r.digitalScore) }));
    const audited = rows.filter((r) => r.audit).length;
    el.innerHTML =
      '<div class="page-head"><div><div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.14em">Prospecting</div>' +
      '<h1 class="page-title">Digital Audits</h1><p class="page-sub">' + audited + " of " + rows.length + " leads audited · median score " + median(rows.filter((r) => r.audit).map((r) => r.score)) + "</p></div></div>" +
      (rows.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>Business</th><th>Digital Score</th><th>Band</th><th>Audit</th><th>Opportunities</th><th></th></tr></thead><tbody>' +
        rows.map((r) => {
          const opps = S().opportunities(r.audit, r.business);
          return "<tr>" +
            '<td><div class="biz-cell"><div style="width:32px;height:32px;border-radius:9px;background:' + UI.hexA(U().avatarColor(r.business.name || "?"), .15) + ';color:' + U().avatarColor(r.business.name) + ';display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px">' + U().initials(r.business.name) + "</div><div><div class='b-name'><a href='#/leads/" + r.lead.id + "'>" + U().escapeHtml(r.business.name) + "</a></div><div class='b-cat'>" + U().escapeHtml(r.business.category || "") + "</div></div></div></td>" +
            '<td><div style="width:90px">' + UI.scoreBar(r.score) + '<div style="font-size:12px;font-weight:800;margin-top:3px">' + r.score + ' / 100</div></div></td>' +
            '<td>' + UI.badge(r.band.label, r.band.color, true) + "</td>" +
            '<td><span class="cell-sub">' + (r.audit ? "Audited · " + U().relativeTime(r.audit.updatedAt || r.audit.createdAt) : '<span style="color:var(--warn)">Not audited</span>') + "</span></td>" +
            '<td><span class="cell-sub">' + opps.length + " detected</span></td>" +
            '<td><button class="btn btn-sm btn-ghost" data-cmd="openAudit:' + r.lead.id + '">' + (r.audit ? I.pencil + " Edit" : I.plus + " Audit") + "</button></td></tr>";
        }).join("") + "</tbody></table></div>" :
        UI.emptyState("scan", "No leads to audit yet.", "Add leads first, then run digital audits to score their online presence.")) ;
  }

  function median(arr) {
    if (!arr.length) return "—";
    const s = arr.slice().sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
  }

  /* ── Audit form ── */
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
      '<div style="display:flex;align-items:center;gap:16px;margin-bottom:18px;flex-wrap:wrap"><div id="audit-ring">' + UI.scoreRing(S().digitalScore(audit), "Digital") + "</div>" +
      '<div><div style="font-weight:700;font-size:14px">Tap each item that is true for this business.</div>' +
      '<div style="font-size:12.5px;color:var(--text-3)">The Digital Presence Score updates as you go.</div></div></div>' +
      sectionHtml("website") + sectionHtml("google") + sectionHtml("social") + sectionHtml("branding") + sectionHtml("conversion") + sectionHtml("seo")
    );
    m.setFoot('<button class="btn" data-cancel>Cancel</button><button class="btn btn-primary" data-save>' + (existing ? "Save Audit" : "Save Audit") + "</button>");

    function recalc() {
      const ring = m.body.querySelector("#audit-ring");
      if (ring) ring.innerHTML = UI.scoreRing(S().digitalScore(audit), "Digital");
    }
    m.body.querySelectorAll(".check-item").forEach((it) => {
      it.addEventListener("click", () => {
        const [cat, key] = it.dataset.check.split(":");
        const target = cat === "social" ? audit.social[key.split(":")[0]] : audit[cat];
        const k = cat === "social" ? key.split(":")[1] : key;
        const val = !target[k];
        if (cat === "social") { const pl = key.split(":")[0]; audit.social[pl] = audit.social[pl] || {}; audit.social[pl][k] = val; if (!val && k === "exists") { ["active", "quality", "consistency"].forEach((x) => { audit.social[pl][x] = false; }); } }
        else { audit[cat] = audit[cat] || {}; audit[cat][k] = val; if (!val && k === "exists" && cat === "website") { ["mobile", "https", "modern", "speed", "cta", "contact", "seo"].forEach((x) => { audit[cat][x] = false; }); } }
        it.classList.toggle("on", !!target[k]);
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
      S().addActivity(lead.id, "note", "Digital audit " + (existing ? "updated" : "completed") + " — score " + S().digitalScore(audit) + "/100.");
      S().save(); m.close(); V61.Toast.success("Audit saved — Digital Score " + S().digitalScore(audit) + "/100");
      V61.App.renderRoute();
    });
  }

  /* ── Opportunities ── */
  function renderOpportunities() {
    const el = document.getElementById("content");
    const all = [];
    S().leadRows().forEach((r) => {
      const opps = S().opportunities(r.audit, r.business);
      opps.forEach((o) => all.push({ opp: o, business: r.business, lead: r.lead, score: r.digitalScore }));
    });
    const counts = {};
    all.forEach((x) => { counts[x.opp.title] = (counts[x.opp.title] || 0) + 1; });
    const byType = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const top = byType.slice(0, 6);

    el.innerHTML =
      '<div class="page-head"><div><div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.14em">Prospecting</div>' +
      '<h1 class="page-title">Opportunities</h1><p class="page-sub">' + all.length + " opportunities detected across " + S().db.leads.length + " leads</p></div></div>" +
      '<div class="grid-2-1"><div style="display:flex;flex-direction:column;gap:18px">' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.lightbulb + ' Top opportunity types</div></div><div class="panel-body"><div class="stack">' +
      top.map(([title, n]) => {
        const sample = all.find((x) => x.opp.title === title);
        const max = Math.max(1, top[0][1]);
        return '<div class="row-card" style="padding:11px 14px"><div class="opp-item" style="border:none;background:transparent;padding:0;flex:1"><div class="o-icon">' + (I[sample.opp.icon] || I.zap) + '</div><div style="flex:1"><h5 style="font-size:13px">' + U().escapeHtml(title) + ' <span class="tag" style="margin-left:5px">' + n + " leads</span></h5><p>" + U().escapeHtml(sample.opp.desc) + "</p></div></div>" +
        '<div class="progress" style="width:110px;align-self:center"><i style="width:' + Math.round((n / max) * 100) + '%;background:var(--accent)"></i></div></div>';
      }).join("") + "</div></div></div>" +

      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.zap + ' All detected opportunities</div></div><div class="panel-body"><div class="table-wrap" style="border:none"><table class="data" style="min-width:600px"><thead><tr><th>Business</th><th>Opportunity</th><th>Digital score</th><th></th></tr></thead><tbody>' +
      all.map((x) => "<tr><td><div class='b-name'><a href='#/leads/" + x.lead.id + "'>" + U().escapeHtml(x.business.name) + "</a></div><div class='b-cat'>" + U().escapeHtml(x.business.category || "") + "</div></td>" +
        '<td><div style="display:flex;gap:8px;align-items:center"><span style="color:var(--accent)">' + (I[x.opp.icon] || I.zap) + "</span>" + U().escapeHtml(x.opp.title) + "</div></td>" +
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
      '<div>3. Batch WhatsApp outreach to businesses flagged for <b style="color:var(--text)">WhatsApp conversion</b>.</div></div></div></div>' +
      "</div></div>";
    UI.bind(el);
  }

  /* ── Lead Discovery ── */
  function renderDiscovery() {
    const el = document.getElementById("content");
    el.innerHTML =
      '<div class="page-head"><div><div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.14em">Prospecting</div>' +
      '<h1 class="page-title">Lead Discovery</h1><p class="page-sub">Find and import businesses to prospect.</p></div></div>' +
      '<div class="grid-2"><div class="panel"><div class="panel-head"><div class="panel-title">' + I.upload + " Import leads from CSV" + "</div></div>" +
      '<div class="panel-body">' +
      '<div style="border:1.5px dashed var(--border-2);border-radius:12px;padding:28px 18px;text-align:center" id="drop-zone">' +
      '<div style="color:var(--text-3);margin-bottom:12px">' + I.upload + "</div>" +
      '<div style="font-size:14px;font-weight:600">Drop a CSV file here</div>' +
      '<div style="font-size:12.5px;color:var(--text-3);margin:6px 0 16px">or choose a file to import. Columns are matched by header name.</div>' +
      '<input type="file" accept=".csv,text/csv" id="csv-file" style="display:none">' +
      '<button class="btn btn-primary" data-open-file>' + I.upload + " Choose file</button></div>" +
      '<div style="margin-top:14px;font-size:12px;color:var(--text-3);line-height:1.7"><b style="color:var(--text-2)">Recognised headers:</b> Business name, Category, Location, Address, Phone, WhatsApp, Email, Website, Google profile, Instagram, Facebook, Digital score, Lead score, Stage, Deal value, Notes.</div>' +
      "</div></div>" +
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.scan + " Search the web" + '<span class="sub">Coming soon</span></div></div>' +
      '<div class="panel-body"><div style="display:flex;gap:9px;margin-bottom:14px">' +
      '<input class="input" id="discovery-q" placeholder="e.g. restaurants in Osu, Accra">' +
      '<select class="select" style="width:150px"><option>Google Maps</option><option disabled>Facebook</option><option disabled>Instagram</option></select>' +
      '<button class="btn" disabled>' + I.search + " Search</button></div>" +
      '<div class="empty" style="padding:24px"><div style="font-size:13px;color:var(--text-3);margin-bottom:8px">External discovery APIs are planned here.</div>' +
      '<div style="font-size:12px;color:var(--text-2)">The data model already supports importing from any source via CSV. A live search connector can be added later without changing your data.</div></div></div></div>' +
      '</div>';
    UI.bind(el);
    const btn = el.querySelector("[data-open-file]");
    const input = el.querySelector("#csv-file");
    if (btn) btn.addEventListener("click", () => input && input.click());
    if (input) input.addEventListener("change", async () => {
      if (!input.files || !input.files[0]) return;
      const text = await U().readFile(input.files[0]);
      const n = S().importCSV(text);
      if (n) V61.App.nav("#/leads");
      input.value = "";
    });
    const zone = el.querySelector("#drop-zone");
    if (zone) {
      ["dragover", "dragenter"].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.style.borderColor = "var(--accent)"; }));
      ["dragleave", "drop"].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.style.borderColor = "var(--border-2)"; }));
      zone.addEventListener("drop", async (e) => {
        const f = e.dataTransfer.files && e.dataTransfer.files[0];
        if (!f) return;
        const text = await U().readFile(f);
        const n = S().importCSV(text);
        if (n) V61.App.nav("#/leads");
      });
    }
  }

  V61.Pages.audit = { render, openAudit, renderOpportunities, renderDiscovery };
  V61.Pages.audits = render;
  V61.Pages.opportunities = renderOpportunities;
  V61.Pages.discovery = renderDiscovery;
})();