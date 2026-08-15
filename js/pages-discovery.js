/* VISION 61 CRM — Lead Discovery page (import CSV + Google Places search) */
window.V61 = window.V61 || {};
V61.Pages = V61.Pages || {};

(function () {
  const U = () => V61.Utils;
  const S = () => V61.Store;
  const I = V61.Icons;
  const UI = V61.UI;
  const GP = () => V61.GooglePlaces;
  const D = () => V61.Discovery;

  const PAGE = 15;
  let state = { results: [], shown: 0 };

  function lastQuery() { const q = S().db.settings.lastDiscovery || {}; return q; }
  function saveQuery(cat, loc) { S().db.settings.lastDiscovery = { cat: cat, loc: loc, at: U().now() }; S().save(); }

  function render() {
    const el = document.getElementById("content");
    const ready = D().ready();
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
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.search + " Search real businesses" + (ready ? '<span class="sub">' + D().label() + "</span>" : '<span class="sub">Needs a data source</span>') + "</div></div>" +
      '<div class="panel-body">' +
      (ready ?
        '<div style="display:flex;gap:9px;flex-wrap:wrap;margin-bottom:12px">' +
        '<input class="input" id="discovery-cat" style="flex:1;min-width:150px" placeholder="Category — e.g. restaurants, salons, clinics" list="disc-cat-list" value="' + U().escapeHtml(lastQuery().cat || "") + '">' +
        '<datalist id="disc-cat-list">' + GP().catMetaOptions() + "</datalist>" +
        '<input class="input" id="discovery-loc" style="width:190px" placeholder="Location — e.g. Osu, Accra" value="' + U().escapeHtml(lastQuery().loc || "") + '">' +
        '<button class="btn btn-primary" id="discovery-go">' + I.search + " Search</button></div>" +
        '<div id="discovery-results"></div>' :
        '<div class="empty" style="padding:22px"><div style="font-size:13px;color:var(--text-3);margin-bottom:10px">Discovery searches real businesses from a data source. No source is configured yet — so no results are shown and nothing is fabricated. Use the free OpenStreetMap source (no key needed) or add a Google Places key.</div>' +
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
    if (go) go.addEventListener("click", () => runSearch(el));
  }

  function runSearch(el) {
    const cat = (el.querySelector("#discovery-cat").value || "").trim();
    const loc = (el.querySelector("#discovery-loc").value || "").trim();
    const out = el.querySelector("#discovery-results");
    if (!cat && !loc) { V61.Toast.warn("Enter a category or location to search"); return; }
    saveQuery(cat, loc);
    out.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-3)">Searching ' + D().label() + '…</div>';
    D().search(cat, loc).then((results) => {
      if (!results.length) { out.innerHTML = '<div class="empty" style="padding:24px">' + I.search + '<h3>No businesses found</h3><p>Try a different category or location.</p></div>'; return; }
      state = { results: results, shown: 0 };
      renderResults(out, true);
    }).catch((e) => {
      out.innerHTML = '<div class="empty" style="padding:24px">' + I.alert + '<h3>Search failed</h3><p>' + U().escapeHtml(e.message || "Check your API key") + "</p></div>";
    });
  }

  function renderResults(out, advance) {
    const all = state.results;
    if (advance) state.shown = Math.min(all.length, state.shown + PAGE);
    else state.shown = Math.min(all.length, state.shown || PAGE);
    const slice = all.slice(0, state.shown);
    const more = all.length - state.shown;
    out.innerHTML = slice.map((r, i) => resultCard(r, i)).join("") +
      (more > 0 ? '<button class="btn block" id="disc-more">' + I.download + " Show more (" + more + " more)</button>" : "");
    bindResultActions(out, all);
    const moreBtn = out.querySelector("#disc-more");
    if (moreBtn) moreBtn.addEventListener("click", () => renderResults(out, true));
  }

  function resultCard(r, i) {
    const existing = r.osmId ? S().businessByOsm(r.osmId) : r.placeId ? S().businessByGooglePlace(r.placeId) : S().businessByName(r.name);
    const lead = existing ? S().leadOf(existing.id) : null;
    const stars = r.rating != null ? '<span style="color:#e0a53e;display:inline-flex;align-items:center;gap:2px;font-weight:700">' + I.star + " " + r.rating + "</span><span style='color:var(--text-3);font-size:12px'> (" + r.reviews + ")</span>" : "";
    return '<div class="disc-result" data-result="' + i + '">' +
      '<div class="disc-main">' + (r.photo ?
        '<img class="disc-photo" src="' + U().escapeHtml(r.photo) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' :
        '<div style="width:38px;height:38px;border-radius:10px;background:' + UI.hexA(U().avatarColor(r.name), .15) + ';color:' + U().avatarColor(r.name) + ';display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0">' + U().initials(r.name) + "</div>") + '</div>' +
      '<div style="flex:1;min-width:0"><div class="disc-name">' + U().escapeHtml(r.name) + "</div>" +
      '<div class="disc-sub">' + (r.category ? U().escapeHtml(r.category) + " · " : "") + U().escapeHtml(r.address) + "</div>" +
      '<div class="disc-meta">' + stars + (r.openNow != null ? '<span class="' + (r.openNow ? "open" : "closed") + '">' + (r.openNow ? "Open now" : "Closed now") + "</span>" : "") +
      (r.website ? '<a class="disc-link" href="' + U().escapeHtml(r.website) + '" target="_blank" rel="noopener">' + I.globe + " Website</a>" : "") +
      (r.phone ? '<span class="disc-link">' + I.phone + " " + U().escapeHtml(r.phone) + "</span>" : "") +
      (r.hours ? '<span class="disc-link">' + I.clock + " Hours mapped</span>" : "") + "</div></div></div>" +
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
      (r.osmId ? D().details(r.osmId) : r.placeId ? D().details(r.placeId) : Promise.resolve({})).then((d) => {
        const prov = D().provider();
        const place = Object.assign({}, r, d, { source: prov === "osm" ? "osm-discovery" : "google-discovery", query: (document.getElementById("discovery-cat") ? document.getElementById("discovery-cat").value : "") + " in " + (document.getElementById("discovery-loc") ? document.getElementById("discovery-loc").value : "") });
        if (prov !== "osm" && V61.GooglePlaces && V61.GooglePlaces.cachePhoto && r.placeId && r.photo) V61.GooglePlaces.cachePhoto(r.placeId, r.photo);
        const res = S().addDiscoveredBusiness(place);
        S().save();
        if (res.created) { S().addActivity(res.lead.id, "note", "Business discovered via " + (prov === "osm" ? "OpenStreetMap." : "Google Places.")); }
        V61.Toast.success(res.created ? "Added " + place.name + " to your CRM" : place.name + " was already in your CRM");
        renderResults(out, false);
      }).catch((e) => { b.disabled = false; b.textContent = "Add to CRM"; V61.Toast.error(e.message || "Could not add business"); });
    }));
    out.querySelectorAll("[data-audit]").forEach((b) => b.addEventListener("click", () => { if (b.dataset.audit) V61.Pages.audit.openAudit(b.dataset.audit); }));
  }

  V61.Pages.discovery = render;
  V61.Pages.audit = V61.Pages.audit || {};
  V61.Pages.audit.renderDiscovery = render;
})();