/* QA — Discovery providers: OpenStreetMap service, provider dispatcher,
   settings selector, and the provider-aware Discovery page. */
"use strict";
const { suite, test, assert, eq, ok, isNull, notNull } = require("./framework");
const { freshApp, refresh, createApp, settle } = require("./harness");

/* jsdom fires DOMContentLoaded on a later tick than the harness evals our
   scripts, so V61.App.init() re-renders the dashboard AFTER a test renders
   its page — overwriting it. settle() waits for that init render first. */
function clickEl(w, el) {
  el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
}

const NOM = [
  {
    place_id: 1, osm_type: "node", osm_id: 111, lat: "5.60", lon: "-0.20",
    class: "amenity", type: "restaurant", display_name: "Kwame's Kitchen, Osu, Accra, Greater Accra, Ghana",
    address: { road: "Osu High Street", suburb: "Osu", city: "Accra", state: "Greater Accra", country: "Ghana" },
  },
  {
    place_id: 2, osm_type: "way", osm_id: 222, lat: "5.55", lon: "-0.19",
    class: "shop", type: "bakery", display_name: "Sole Bakery, East Legon, Accra, Greater Accra, Ghana",
    address: { suburb: "East Legon", town: "Accra", country: "Ghana" },
  },
];

const NOM_GEO = [{
  place_id: 1, lat: "5.60", lon: "-0.20", display_name: "Osu, Accra, Greater Accra, Ghana",
  boundingbox: ["5.55", "5.62", "-0.21", "-0.18"],
}];

const OVERPASS_RES = {
  elements: [
    { type: "node", id: 111, lat: 5.60, lon: -0.20, tags: { name: "Kwame's Kitchen", amenity: "restaurant", phone: "+233 24 100 0001", website: "https://kwames.example", email: "hello@kwames.example", opening_hours: "Mo-Sa 09:00-21:00", "addr:street": "Osu High Street", "addr:city": "Accra" } },
    { type: "way", id: 222, center: { lat: 5.55, lon: -0.19 }, tags: { name: "Sole Bakery", shop: "bakery", "addr:suburb": "East Legon", "addr:city": "Accra" } },
    { type: "node", id: 333, lat: 5.60, lon: -0.19, tags: { amenity: "restaurant" } },
  ],
};

suite("Discovery providers — OpenStreetMap", () => {
  test("search geocodes the location and parses Overpass results with contact tags", async () => {
    const app = freshApp();
    app.window.fetch = async (url) => {
      if (String(url).indexOf("/interpreter") >= 0) return { ok: true, status: 200, json: async () => OVERPASS_RES };
      ok(String(url).indexOf("nominatim.openstreetmap.org") >= 0, "uses Nominatim to geocode the location");
      return { ok: true, status: 200, json: async () => NOM_GEO };
    };
    const res = await app.V61.OpenStreetMap.discoverySearch("restaurants", "Osu, Accra");
    eq(res.length, 2);
    eq(res[0].osmId, "node/111");
    eq(res[0].name, "Kwame's Kitchen");
    eq(res[0].city, "Accra");
    eq(res[0].category, "Restaurant");
    eq(res[0].phone, "+233 24 100 0001");
    eq(res[0].website, "https://kwames.example");
    eq(res[0].email, "hello@kwames.example");
    eq(res[0].hours, true);
    eq(res[0].rating, null);
    eq(res[0].reviews, null);
    eq(res[0].openNow, null);
    eq(res[1].osmId, "way/222");
    eq(res[1].category, "Bakery");
    eq(res[1].lat, 5.55);
    eq(res[1].website, "", "no website claimed when not mapped");
  });

  test("unmapped categories fall back to Nominatim text search", async () => {
    const app = freshApp();
    app.window.fetch = async () => ({ ok: true, status: 200, json: async () => NOM });
    const res = await app.V61.OpenStreetMap.discoverySearch("zumba classes", "Kumasi");
    eq(res.length, 2);
    eq(res[0].osmId, "node/111");
    eq(res[0].name, "Kwame's Kitchen");
    eq(res[0].category, "Restaurant");
    eq(res[0].phone, "", "text search carries no contact tags");
    eq(res[0].lat, 5.6);
  });

  test("search rejects when the fallback Nominatim call fails", async () => {
    const app = freshApp();
    app.window.fetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
    let threw = false;
    try { await app.V61.OpenStreetMap.discoverySearch("x", "y"); } catch (e) { threw = true; }
    ok(threw, "must reject on non-OK response");
  });

  test("details parses Overpass tags (phone, website, hours)", async () => {
    const app = freshApp();
    app.window.fetch = async (url) => {
      ok(String(url).indexOf("/interpreter") >= 0, "uses an Overpass mirror");
      return { ok: true, status: 200, json: async () => ({
        elements: [{ type: "node", id: 111, tags: { name: "Kwame's Kitchen", phone: "+233 24 100 0001", website: "https://kwames.example", "opening_hours": "Mo-Sa 09:00-21:00" } }],
      }) };
    };
    const d = await app.V61.OpenStreetMap.placeDetails("node/111");
    eq(d.phone, "+233 24 100 0001");
    eq(d.website, "https://kwames.example");
    eq(d.hours, true);
  });

  test("details with no tags returns an empty object (nothing invented)", async () => {
    const app = freshApp();
    app.window.fetch = async () => ({ ok: true, status: 200, json: async () => ({ elements: [{ tags: {} }] }) });
    const d = await app.V61.OpenStreetMap.placeDetails("node/1");
    eq(d.website, "");
    eq(d.phone, "");
    eq(d.hours, false);
    ok(!("rating" in d) || d.rating === null);
  });

  test("details falls over to the next Overpass mirror when the first is busy", async () => {
    const app = freshApp();
    const hosts = [];
    app.window.fetch = async (url) => {
      hosts.push(String(url));
      const host = String(url).split("/")[2];
      if (host === "overpass.kumi.systems") return { ok: false, status: 504, json: async () => ({}) };
      ok(host !== "overpass-api.de" || hosts.length >= 4, "primary only tried after mirrors");
      return { ok: true, status: 200, json: async () => ({ elements: [{ type: "node", id: 1, tags: { name: "X", phone: "+233 20 000 0001" } }] }) };
    };
    const d = await app.V61.OpenStreetMap.placeDetails("node/1");
    eq(d.phone, "+233 20 000 0001");
    ok(hosts.length >= 2, "tried at least two mirrors (" + hosts.length + ")");
    eq(hosts[0].indexOf("overpass-api.de"), -1, "primary not first — mirrors first");
  });

  test("details rejects with a friendly message when every Overpass mirror fails", async () => {
    const app = freshApp();
    app.window.fetch = async () => ({ ok: false, status: 504, json: async () => ({}) });
    let msg = "";
    try { await app.V61.OpenStreetMap.placeDetails("node/1"); }
    catch (e) { msg = e.message; }
    ok(msg.indexOf("busy") >= 0, "human-readable error: " + msg);
  });

  test("details rejects malformed osmId", async () => {
    const app = freshApp();
    let threw = false;
    try { await app.V61.OpenStreetMap.placeDetails("not-a-ref"); } catch (e) { threw = true; }
    ok(threw, "must reject invalid references");
  });

  test("dispatcher defaults to OpenStreetMap (free, no key needed)", () => {
    const app = freshApp();
    const D = app.V61.Discovery;
    eq(D.provider(), "osm");
    eq(D.ready(), true, "OSM never needs a key");
    eq(D.label(), "OpenStreetMap");
    app.V61.Store.db.settings.discoveryProvider = "google";
    eq(D.provider(), "google");
    eq(D.ready(), false, "Google with no key is not ready");
  });

  test("dispatcher Google is ready when a key is present", () => {
    const app = freshApp();
    app.V61.Store.db.settings.googleMapsApiKey = "AIzaTEST000000000000000000000000";
    app.V61.Store.db.settings.discoveryProvider = "google";
    eq(app.V61.Discovery.ready(), true);
    eq(app.V61.Discovery.label(), "Google Places");
  });

  test("dispatcher search delegates to the active provider", async () => {
    const app = freshApp();
    app.V61.Store.db.settings.discoveryProvider = "osm";
    let called = "";
    app.V61.OpenStreetMap.discoverySearch = async (q, l) => { called = "osm:" + q + ":" + l; return [{ osmId: "node/1", name: "X" }]; };
    const out = await app.V61.Discovery.search("salons", "Kumasi");
    eq(called, "osm:salons:Kumasi");
    eq(out[0].osmId, "node/1");
  });

  test("dispatcher details routes OSM ids to OpenStreetMap and others to Google", async () => {
    const app = freshApp();
    let osmCalled = false, googleCalled = false;
    app.V61.OpenStreetMap.placeDetails = async () => { osmCalled = true; return { phone: "024" }; };
    app.V61.GooglePlaces.placeDetails = async () => { googleCalled = true; return { phone: "020" }; };
    await app.V61.Discovery.details("node/9");
    ok(osmCalled, "OSM id routed to OSM details");
    await app.V61.Discovery.details("ChIJxX123abc");
    ok(googleCalled, "Google place id routed to Google details");
  });

  test("addDiscoveredBusiness stores osmId and dedupes by it (no fake Google URL)", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const a = S.addDiscoveredBusiness({ osmId: "node/111", name: "Kwame's Kitchen", category: "Restaurant", city: "Accra", source: "osm-discovery" });
    eq(a.created, true);
    eq(a.business.osmId, "node/111");
    eq(a.business.googlePlaceId, "");
    eq(a.business.googleProfileUrl, "", "must not fabricate a Google profile URL");
    const b = S.addDiscoveredBusiness({ osmId: "node/111", name: "Kwame's Kitchen" });
    eq(b.created, false);
    eq(b.business.id, a.business.id);
    eq(S.db.businesses.length, 1);
    eq(S.db.leads.length, 1);
  });

  test("businessByOsm finds an existing record", () => {
    const app = freshApp();
    const S = app.V61.Store;
    S.addDiscoveredBusiness({ osmId: "way/9", name: "Sole Bakery" });
    ok(S.businessByOsm("way/9"));
    isNull(S.businessByOsm("way/99"));
    isNull(S.businessByOsm(""));
  });

  test("settings renders a provider selector; OSM selection shows the free status", async () => {
    const app = freshApp();
    await settle(app);
    app.V61.Store.db.settings.discoveryProvider = "osm";
    app.V61.Store.save();
    app.V61.Pages.settings();
    const el = app.window.document.getElementById("content");
    const sel = el.querySelector("#set-provider");
    notNull(sel, "provider select is rendered");
    eq(sel.value, "osm");
    ok(String(el.innerHTML).indexOf("OpenStreetMap") >= 0, "OSM copy shown");
  });

  test("settings saving OpenStreetMap does not require a Google key", async () => {
    const app = freshApp();
    await settle(app);
    app.V61.Pages.settings();
    const el = app.window.document.getElementById("content");
    const sel = el.querySelector("#set-provider");
    sel.value = "osm";
    clickEl(app.window, el.querySelector("#save-gkey"));
    const s = app.V61.Store.db.settings;
    eq(s.discoveryProvider, "osm");
    eq(s.googleMapsApiKey, "");
  });

  test("discovery page gates on the provider: OSM is searchable without a key", async () => {
    const app = freshApp();
    await settle(app);
    app.V61.Store.db.settings.discoveryProvider = "osm";
    app.V61.Store.save();
    app.V61.Pages.discovery();
    notNull(app.window.document.getElementById("content").querySelector("#discovery-go"), "OSM search UI without a key");
    app.V61.Store.db.settings.discoveryProvider = "google";
    app.V61.Store.db.settings.googleMapsApiKey = "";
    app.V61.Store.save();
    app.V61.Pages.discovery();
    isNull(app.window.document.getElementById("content").querySelector("#discovery-go"), "Google without a key shows setup help");
    app.V61.Store.db.settings.googleMapsApiKey = "AIzaTEST000000000000000000000000";
    app.V61.Store.save();
    app.V61.Pages.discovery();
    notNull(app.window.document.getElementById("content").querySelector("#discovery-go"), "Google with a key shows search UI");
  });

  test("discovery OSM search + add flow stores an OSM lead", async () => {
    const app = freshApp();
    await settle(app);
    app.V61.Store.db.settings.discoveryProvider = "osm";
    app.V61.Store.save();
    app.V61.OpenStreetMap.discoverySearch = async () => [{ osmId: "node/555", name: "Bright Salon", category: "Salon", city: "Kumasi", address: "Adum, Kumasi" }];
    app.V61.OpenStreetMap.placeDetails = async () => ({ phone: "0241000555", website: "https://bright.example" });
    app.V61.Pages.discovery();
    const el = app.window.document.getElementById("content");
    const cat = el.querySelector("#discovery-cat"); cat.value = "salons";
    const loc = el.querySelector("#discovery-loc"); loc.value = "Kumasi";
    clickEl(app.window, el.querySelector("#discovery-go"));
    await new Promise((r) => setTimeout(r, 10));
    ok(String(el.innerHTML).indexOf("Bright Salon") >= 0, "result card rendered");
    clickEl(app.window, el.querySelector('[data-add="0"]'));
    await new Promise((r) => setTimeout(r, 20));
    const S = app.V61.Store;
    eq(S.db.businesses.length, 1);
    eq(S.db.businesses[0].name, "Bright Salon");
    eq(S.db.businesses[0].osmId, "node/555");
    eq(S.db.businesses[0].phone, "0241000555");
    eq(S.db.businesses[0].website, "https://bright.example");
    eq(S.db.businesses[0].googlePlaceId, "");
    eq(S.db.leads.length, 1);
  });

  test("discovery pages results with a Show more button", async () => {
    const app = freshApp();
    await settle(app);
    app.V61.Store.db.settings.discoveryProvider = "osm";
    app.V61.Store.save();
    app.V61.OpenStreetMap.discoverySearch = async () => Array.from({ length: 20 }, (_, i) => ({ osmId: "node/" + (1000 + i), name: "Biz " + i, category: "Salon", city: "Kumasi", address: "Adum, Kumasi" }));
    app.V61.Pages.discovery();
    const el = app.window.document.getElementById("content");
    const cat = el.querySelector("#discovery-cat"); cat.value = "salons";
    const loc = el.querySelector("#discovery-loc"); loc.value = "Kumasi";
    clickEl(app.window, el.querySelector("#discovery-go"));
    await new Promise((r) => setTimeout(r, 10));
    ok(el.querySelectorAll(".disc-result").length === 15, "first page shows 15 results");
    const more = el.querySelector("#disc-more");
    notNull(more, "Show more button present");
    clickEl(app.window, more);
    await new Promise((r) => setTimeout(r, 10));
    ok(el.querySelectorAll(".disc-result").length === 20, "second page shows all 20");
    isNull(el.querySelector("#disc-more"), "Show more hidden once everything is revealed");
  });

  test("discovery remembers and pre-fills the last search", async () => {
    const app = freshApp();
    await settle(app);
    app.V61.Store.db.settings.discoveryProvider = "osm";
    app.V61.Store.save();
    app.V61.OpenStreetMap.discoverySearch = async () => [];
    app.V61.Pages.discovery();
    const el = app.window.document.getElementById("content");
    const cat = el.querySelector("#discovery-cat"); cat.value = "salons";
    const loc = el.querySelector("#discovery-loc"); loc.value = "Kumasi";
    clickEl(app.window, el.querySelector("#discovery-go"));
    await new Promise((r) => setTimeout(r, 10));
    eq(app.V61.Store.db.settings.lastDiscovery.cat, "salons");
    eq(app.V61.Store.db.settings.lastDiscovery.loc, "Kumasi");
    app.V61.Pages.discovery();
    const el2 = app.window.document.getElementById("content");
    eq(el2.querySelector("#discovery-cat").value, "salons");
    eq(el2.querySelector("#discovery-loc").value, "Kumasi");
  });

  test("Google discovery cards show a live photo thumbnail and lead view reuses it", async () => {
    const app = freshApp();
    await settle(app);
    app.V61.Store.db.settings.discoveryProvider = "google";
    app.V61.Store.db.settings.googleMapsApiKey = "AIzaTEST000000000000000000000000";
    app.V61.Store.save();
    const gp = app.V61.GooglePlaces;
    gp.discoverySearch = async () => [{ placeId: "ChIJPHOTO1", name: "Photo Salon", category: "Salon", address: "Osu, Accra", photo: "https://maps.example/p1" }];
    gp.placeDetails = async () => ({ phone: "0241000888", photo: "https://maps.example/p1" });
    app.V61.Pages.discovery();
    const el = app.window.document.getElementById("content");
    const cat = el.querySelector("#discovery-cat"); cat.value = "salons";
    const loc = el.querySelector("#discovery-loc"); loc.value = "Accra";
    clickEl(app.window, el.querySelector("#discovery-go"));
    await new Promise((r) => setTimeout(r, 10));
    const img = el.querySelector(".disc-photo");
    notNull(img, "result card has a photo thumbnail");
    eq(img.getAttribute("src"), "https://maps.example/p1");
    clickEl(app.window, el.querySelector('[data-add="0"]'));
    await new Promise((r) => setTimeout(r, 20));
    eq(gp.photoFor("ChIJPHOTO1"), "https://maps.example/p1", "photo cached by placeId when added");
    const lead = app.V61.Store.db.leads[0];
    app.V61.Pages.leads.openLead(lead.id);
    const head = app.window.document.getElementById("content").querySelector(".ld-head .disc-photo");
    notNull(head, "lead header shows the cached photo");
    eq(head.getAttribute("src"), "https://maps.example/p1");
  });

  test("capturePhoto extracts a live photo URL and caches it by placeId", () => {
    const app = freshApp();
    const gp = app.V61.GooglePlaces;
    const fakePlace = { place_id: "ChIJREAL1", photos: [{ getUrl: (opts) => "https://maps.example/real" + (opts && opts.maxWidth) }] };
    eq(gp.capturePhoto(fakePlace), "https://maps.example/real200", "getUrl called with 200px maxWidth");
    eq(gp.photoFor("ChIJREAL1"), "https://maps.example/real200", "photo cached by placeId");
    isNull(gp.capturePhoto({ place_id: "ChIJEMPTY" }), "no photo object yields null");
  });

  test("OSM discovery cards fall back to initials (no photos in OpenStreetMap)", async () => {
    const app = freshApp();
    await settle(app);
    app.V61.Store.db.settings.discoveryProvider = "osm";
    app.V61.Store.save();
    app.V61.OpenStreetMap.discoverySearch = async () => [{ osmId: "node/999", name: "Plain Shop", category: "Store", city: "Accra", address: "Accra" }];
    app.V61.Pages.discovery();
    const el = app.window.document.getElementById("content");
    const cat = el.querySelector("#discovery-cat"); cat.value = "stores";
    const loc = el.querySelector("#discovery-loc"); loc.value = "Accra";
    clickEl(app.window, el.querySelector("#discovery-go"));
    await new Promise((r) => setTimeout(r, 10));
    isNull(el.querySelector(".disc-photo"), "no photo on OSM cards");
    notNull(el.querySelector(".disc-main"), "initials avatar fallback still renders");
  });

  test("audit modal auto-fill uses OpenStreetMap for OSM businesses", async () => {
    const app = freshApp();
    await settle(app);
    const S = app.V61.Store;
    const { business, lead } = S.addDiscoveredBusiness({ osmId: "node/777", name: "Fresh Bakery", phone: "0241000777", website: "https://fresh.example", source: "osm-discovery" });
    app.V61.OpenStreetMap.placeDetails = async () => ({ phone: "0241000777", website: "https://fresh.example" });
    app.V61.Pages.audit.openAudit(lead.id);
    const el = app.window.document;
    const btn = el.querySelector("#audit-autofill");
    notNull(btn, "auto-fill shown for OSM business");
    ok(btn.textContent.indexOf("Auto-fill") >= 0, "labels the action");
    clickEl(app.window, btn);
    await new Promise((r) => setTimeout(r, 20));
    const audit = S.auditOf(business.id);
    notNull(audit);
    eq(audit.website.exists, true);
    eq(audit.website.contact, true);
  });

  test("audit auto-fill works end-to-end through the real Overpass fetch (network mocked only)", async () => {
    const app = freshApp();
    await settle(app);
    const S = app.V61.Store;
    const { business, lead } = S.addDiscoveredBusiness({ osmId: "way/888", name: "Golden Café", source: "osm-discovery" });
    app.window.fetch = async (url) => {
      ok(String(url).indexOf("/interpreter") >= 0, "queries an Overpass interpreter");
      return { ok: true, status: 200, json: async () => ({ elements: [{ type: "way", id: 888, tags: { name: "Golden Café", phone: "0241888888", website: "https://golden.example", "opening_hours": "Mo-Su 08:00-22:00" } }] }) };
    };
    app.V61.Pages.audit.openAudit(lead.id);
    const btn = app.window.document.querySelector("#audit-autofill");
    notNull(btn, "auto-fill button present");
    clickEl(app.window, btn);
    await new Promise((r) => setTimeout(r, 30));
    const audit = S.auditOf(business.id);
    eq(audit.website.exists, true, "website exists filled from Overpass tags");
    eq(audit.website.contact, true, "contact filled from Overpass phone");
  });

  test("auto-fill also runs the website analyzer and saves the analysis", async () => {
    const app = freshApp();
    await settle(app);
    const S = app.V61.Store;
    const { business, lead } = S.addDiscoveredBusiness({ osmId: "node/777", name: "Fresh Bakery", website: "https://fresh.example", phone: "0241000777", source: "osm-discovery" });
    const html = "<html><head><title>Fresh Bakery - Delicious Bread</title><meta name='viewport' content='width=device-width'><link rel='canonical' href='https://fresh.example/'></head><body><h1>Fresh Bakery</h1><p>" + Array(60).join("words ") + "</p><a href='tel:+233241000777'>Call</a><a href='mailto:hi@fresh.example'>Email</a><a href='https://instagram.com/freshbakery'>Instagram</a></body></html>";
    app.window.fetch = async (url) => {
      const u = String(url);
      if (u.indexOf("/interpreter") >= 0) return { ok: true, status: 200, json: async () => ({ elements: [{ type: "node", id: 777, tags: { name: "Fresh Bakery", phone: "0241000777", website: "https://fresh.example" } }] }) };
      return { ok: true, status: 200, text: async () => html };
    };
    app.V61.Pages.audit.openAudit(lead.id);
    const btn = app.window.document.querySelector("#audit-autofill");
    notNull(btn, "auto-fill shown when the business has a website");
    clickEl(app.window, btn);
    await new Promise((r) => setTimeout(r, 40));
    const wa = S.latestWebsiteAudit(business.id);
    notNull(wa, "website analysis saved");
    eq(wa.status, "ok");
    ok(wa.score > 0, "website score computed (" + wa.score + ")");
  });

  test("auto-fill shows for manual leads with only a website (no osm/google id)", async () => {
    const app = freshApp();
    await settle(app);
    const S = app.V61.Store;
    const biz = S.addBusiness({ name: "Manual Shop", website: "https://manual.example" });
    const lead = S.addLead(biz.id);
    app.V61.WebsiteAnalyzer.analyze = async () => ({ status: "ok", score: 70, url: "https://manual.example", signals: { https: true, viewport: true } });
    app.V61.Pages.audit.openAudit(lead.id);
    const btn = app.window.document.querySelector("#audit-autofill");
    notNull(btn, "auto-fill button present for website-only lead");
  });
});