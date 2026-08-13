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
      '<div class="audit-live"><div id="audit-ring">' + UI.scoreRing(S().digitalScore(audit), "Digital") + "</div>" +
      '<div class="audit-break" id="audit-break">' + breakdownHtml() + "</div></div>" +
      '<div style="display:flex;align-items:center;gap:16px;margin-bottom:18px;flex-wrap:wrap">' +
      '<div><div style="font-weight:700;font-size:14px">Tap each item that is true for this business.</div>' +
      '<div style="font-size:12.5px;color:var(--text-3)">The Digital Presence Score updates as you go.</div></div>' +
      (biz && biz.googlePlaceId && discoveryKey() ?
        '<button class="btn" id="audit-autofill" style="margin-left:auto">' + I.scan + " Auto-fill from Google</button>" : "") +
      "</div>" +
      sectionHtml("website") + sectionHtml("google") + sectionHtml("social") + sectionHtml("branding") + sectionHtml("conversion") + sectionHtml("seo")
    );
    m.setFoot('<button class="btn" data-cancel>Cancel</button><button class="btn btn-primary" data-save>' + (existing ? "Save Audit" : "Save Audit") + "</button>");

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
    const autofill = m.body.querySelector("#audit-autofill");
    if (autofill) autofill.addEventListener("click", () => {
      autofill.disabled = true; autofill.textContent = "Fetching…";
      placeDetails(biz.googlePlaceId).then((d) => {
        /* Only facts Google genuinely provides are auto-checked; everything else stays manual. */
        audit.website = audit.website || {};
        audit.website.exists = !!d.website;
        audit.website.contact = !!d.phone;
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
        audit.updatedAt = U().now();
        recalc();
        m.body.querySelectorAll(".check-item").forEach((it) => {
          const [cat, key] = it.dataset.check.split(":");
          const target = cat === "social" ? audit.social[key.split(":")[0]] : audit[cat];
          const k = cat === "social" ? key.split(":")[1] : key;
          it.classList.toggle("on", !!target[k]);
          const chip = m.body.querySelector('[data-scorechip="' + cat + '"]');
          if (chip) chip.textContent = m.body.querySelectorAll('[data-check^="' + cat + '"].on').length + "/" + m.body.querySelectorAll('[data-check^="' + cat + '"]').length;
        });
        autofill.disabled = false; autofill.textContent = "Auto-fill from Google";
        V61.Toast.success("Filled from real Google data — review the rest manually");
      }).catch((e) => {
        autofill.disabled = false; autofill.textContent = "Auto-fill from Google";
        V61.Toast.error(e.message || "Could not fetch Google data");
      });
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
  function discoveryKey() { return (S().db.settings.googleMapsApiKey || "").trim(); }

  /* Load Google Places API once. Resolves immediately if already present (allows stubbing). */
  function placesReady() {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.maps && window.google.maps.places && window.google.maps.places.PlacesService) return resolve(window.google.maps.places);
      if (window.__v61PlacesPromise) return window.__v61PlacesPromise;
      window.__v61PlacesPromise = new Promise((res, rej) => {
        const cb = "__v61PlacesReady";
        window[cb] = () => res(window.google.maps.places);
        const s = document.createElement("script");
        s.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(discoveryKey()) + "&libraries=places&callback=" + cb;
        s.async = true; s.onerror = () => { window.__v61PlacesPromise = null; rej(new Error("Failed to load Google Places API")); };
        document.head.appendChild(s);
      });
      window.__v61PlacesPromise.then(resolve, reject);
    });
  }

  function placesService() {
    let host = document.getElementById("places-host");
    if (!host) { host = document.createElement("div"); host.id = "places-host"; host.style.display = "none"; document.body.appendChild(host); }
    return new window.google.maps.places.PlacesService(host);
  }

  function normalizeType(types) {
    const map = {
      restaurant: "Restaurant", cafe: "Cafe", bakery: "Bakery", bar: "Bar",
      gym: "Gym", beauty_salon: "Beauty salon", hair_care: "Hair salon", spa: "Spa",
      clinic: "Clinic", dentist: "Dentist", pharmacy: "Pharmacy", hospital: "Hospital",
      store: "Store", shopping_mall: "Shopping mall", supermarket: "Supermarket", department_store: "Store",
      hotel: "Hotel", lodging: "Lodging", travel_agency: "Travel agency",
      car_dealer: "Car dealer", car_repair: "Auto repair", car_wash: "Car wash", electrician: "Electrician", plumber: "Plumber",
      real_estate_agency: "Real estate", lawyer: "Law firm", accountant: "Accountant", bank: "Bank",
      school: "School", university: "University", gym: "Gym",
      florist: "Florist", clothing_store: "Clothing store", electronics_store: "Electronics store", furniture_store: "Furniture store",
      home_goods_store: "Home goods", shoe_store: "Shoe store", jewelry_store: "Jewellery", book_store: "Book store",
      pet_store: "Pet store", veterinary_care: "Veterinary", church: "Church", mosque: "Mosque",
      local_government_office: "Office", insurance_agency: "Insurance", movie_theater: "Cinema", park: "Park", art_gallery: "Art gallery",
    };
    for (const t of (types || [])) { if (map[t]) return map[t]; }
    return (types && types[0]) ? types[0].replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "";
  }

  /* textSearch: real Google Places results (name, address, rating, reviews, open status). */
  function discoverySearch(query, location) {
    return placesReady().then(() => new Promise((resolve, reject) => {
      const svc = placesService();
      svc.textSearch({ query: (query + " in " + location).trim(), language: "en" }, (results, status) => {
        if (status === "OK" || status === "ZERO_RESULTS") {
          resolve((results || []).map((p) => ({
            placeId: p.place_id, name: p.name || "", address: p.formatted_address || p.vicinity || "",
            city: extractCity(p), category: normalizeType(p.types),
            rating: p.rating || null, reviews: p.user_ratings_total || 0,
            openNow: p.opening_hours ? p.opening_hours.open_now : null,
            lat: p.geometry && p.geometry.location ? p.geometry.location.lat() : null,
            lng: p.geometry && p.geometry.location ? p.geometry.location.lng() : null,
          })));
        } else reject(new Error("Places API error: " + status));
      });
    }));
  }

  function extractCity(p) {
    const comps = (p.address_components || []).map((c) => c.types[0] === "locality" || c.types[0] === "administrative_area_level_1" ? c.long_name : null).filter(Boolean);
    return comps[0] || "";
  }

  /* getDetails: real place details (phone, website, hours, photos) used when adding or auto-filling an audit. */
  function placeDetails(placeId) {
    return placesReady().then(() => new Promise((resolve, reject) => {
      const svc = placesService();
      svc.getDetails({ placeId, fields: ["name", "formatted_address", "formatted_phone_number", "international_phone_number", "website", "rating", "user_ratings_total", "opening_hours", "url", "types", "photos", "address_components", "geometry"] }, (p, status) => {
        if (status === "OK" && p) resolve({
          name: p.name || "", address: p.formatted_address || "",
          phone: p.formatted_phone_number || p.international_phone_number || "",
          website: p.website || "",
          rating: p.rating || null, reviews: p.user_ratings_total || 0,
          hours: !!(p.opening_hours && p.opening_hours.periods && p.opening_hours.periods.length),
          photos: (p.photos && p.photos.length) || 0,
          url: p.url || "", types: p.types || [], category: normalizeType(p.types),
          lat: p.geometry && p.geometry.location ? p.geometry.location.lat() : null,
          lng: p.geometry && p.geometry.location ? p.geometry.location.lng() : null,
        });
        else reject(new Error("Place details error: " + status));
      });
    }));
  }

  function renderDiscovery() {
    const el = document.getElementById("content");
    const hasKey = !!discoveryKey();
    el.innerHTML =
      '<div class="page-head"><div><div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.14em">Prospecting</div>' +
      '<h1 class="page-title">Lead Discovery</h1><p class="page-sub">Find real businesses by location and category, review them, then add the ones you want to prospect.</p></div></div>' +
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
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.search + " Search real businesses" + (hasKey ? '<span class="sub">Google Places</span>' : '<span class="sub">Needs API key</span>') + "</div></div>" +
      '<div class="panel-body">' +
      (hasKey ?
        '<div style="display:flex;gap:9px;flex-wrap:wrap;margin-bottom:12px">' +
        '<input class="input" id="discovery-cat" style="flex:1;min-width:150px" placeholder="Category — e.g. restaurants, salons, clinics" list="disc-cat-list">' +
        '<datalist id="disc-cat-list">' + catMetaOptions() + "</datalist>" +
        '<input class="input" id="discovery-loc" style="width:190px" placeholder="Location — e.g. Osu, Accra">' +
        '<button class="btn btn-primary" id="discovery-go">' + I.search + " Search</button></div>" +
        '<div id="discovery-results"></div>' :
        '<div class="empty" style="padding:22px"><div style="font-size:13px;color:var(--text-3);margin-bottom:10px">Discovery uses the Google Places API to find real businesses. No API key is configured yet — so no results are shown and nothing is fabricated.</div>' +
        '<a class="btn btn-primary" href="#/settings">' + I.settings + " Configure data source</a></div>") +
      "</div></div>" +
      "</div>";
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

    const go = el.querySelector("#discovery-go");
    if (go) go.addEventListener("click", () => runDiscoverySearch(el));
  }

function catMetaOptions() {
    const cats = ["Restaurant", "Cafe", "Bakery", "Bar", "Salon", "Barber", "Clinic", "Dentist", "Pharmacy", "Gym", "Fashion store", "Electronics store", "Hotel", "Real estate", "Auto repair", "Car wash", "Electrician", "Plumber", "Cleaning service", "Photographer", "School", "Accountant", "Law firm", "Travel agency", "Web design", "Marketing agency"];
    return cats.map((c) => "<option value='" + c + "'>").join("");
  }

  function runDiscoverySearch(el) {
    const cat = (el.querySelector("#discovery-cat").value || "").trim();
    const loc = (el.querySelector("#discovery-loc").value || "").trim();
    const out = el.querySelector("#discovery-results");
    if (!cat && !loc) { V61.Toast.warn("Enter a category or location to search"); return; }
    out.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-3)">Searching Google Places…</div>';
    discoverySearch(cat, loc).then((results) => {
      if (!results.length) { out.innerHTML = '<div class="empty" style="padding:24px">' + I.search + '<h3>No businesses found</h3><p>Try a different category or location.</p></div>'; return; }
      out.innerHTML = results.map((r, i) => resultCard(r, i)).join("");
      bindResultActions(out, results);
    }).catch((e) => {
      out.innerHTML = '<div class="empty" style="padding:24px">' + I.alert + '<h3>Search failed</h3><p>' + U().escapeHtml(e.message || "Check your API key") + "</p></div>";
    });
  }

  function resultCard(r, i) {
    const existing = r.placeId ? S().businessByGooglePlace(r.placeId) : S().businessByName(r.name);
    const lead = existing ? S().leadOf(existing.id) : null;
    const stars = r.rating != null ? '<span style="color:#e0a53e;display:inline-flex;align-items:center;gap:2px;font-weight:700">' + I.star + " " + r.rating + "</span><span style='color:var(--text-3);font-size:12px'> (" + r.reviews + ")</span>" : "";
    return '<div class="disc-result" data-result="' + i + '">' +
      '<div class="disc-main"><div style="width:38px;height:38px;border-radius:10px;background:' + UI.hexA(U().avatarColor(r.name), .15) + ';color:' + U().avatarColor(r.name) + ';display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0">' + U().initials(r.name) + "</div>" +
      '<div style="flex:1;min-width:0"><div class="disc-name">' + U().escapeHtml(r.name) + "</div>" +
      '<div class="disc-sub">' + (r.category ? U().escapeHtml(r.category) + " · " : "") + U().escapeHtml(r.address) + "</div>" +
      '<div class="disc-meta">' + stars + (r.openNow != null ? '<span class="' + (r.openNow ? "open" : "closed") + '">' + (r.openNow ? "Open now" : "Closed now") + "</span>" : "") + "</div></div></div>" +
      '<div class="disc-actions">' +
      (existing ?
        '<button class="btn btn-sm" data-audit="' + (lead ? lead.id : "") + '">' + I.scan + " Audit</button>" +
        '<a class="btn btn-sm btn-ghost" href="#/leads/' + (lead ? lead.id : "") + '">' + I.eye + " Open</a>" :
        '<button class="btn btn-sm btn-primary" data-add="' + i + '">' + I.plus + " Add to CRM</button>") +
      "</div></div>";
  }

  function bindResultActions(out, results) {
    out.querySelectorAll("[data-add]").forEach((b) => b.addEventListener("click", () => {
      const r = results[Number(b.dataset.add)];
      b.disabled = true; b.textContent = "Adding…";
      (r.placeId ? placeDetails(r.placeId).catch(() => ({})) : Promise.resolve({})).then((d) => {
        const place = Object.assign({}, r, d, { source: "google-discovery", query: (document.getElementById("discovery-cat") ? document.getElementById("discovery-cat").value : "") + " in " + (document.getElementById("discovery-loc") ? document.getElementById("discovery-loc").value : "") });
        const res = S().addDiscoveredBusiness(place);
        S().save();
        if (res.created) { S().addActivity(res.lead.id, "note", "Business discovered via Google Places."); }
        V61.Toast.success(res.created ? "Added " + place.name + " to your CRM" : place.name + " was already in your CRM");
        out.innerHTML = out.innerHTML.replace(b.outerHTML, '<a class="btn btn-sm btn-ghost" href="#/leads/' + res.lead.id + '">' + I.eye + " Open</a>");
        const res2 = S().byId("businesses", res.lead.businessId);
        const refreshed = results.map((x, i) => resultCard(x, i));
        out.innerHTML = refreshed.join("");
        bindResultActions(out, results);
      }).catch((e) => { b.disabled = false; b.textContent = "Add to CRM"; V61.Toast.error(e.message || "Could not add business"); });
    }));
    out.querySelectorAll("[data-audit]").forEach((b) => b.addEventListener("click", () => { if (b.dataset.audit) V61.Pages.audit.openAudit(b.dataset.audit); }));
  }

  V61.Pages.audit = { render, openAudit, renderOpportunities, renderDiscovery };
  V61.Pages.audits = render;
  V61.Pages.opportunities = renderOpportunities;
  V61.Pages.discovery = renderDiscovery;
})();