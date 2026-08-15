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
      if (String(url).indexOf("overpass-api.de") >= 0) return { ok: true, status: 200, json: async () => OVERPASS_RES };
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
      ok(String(url).indexOf("overpass-api.de") >= 0, "uses Overpass");
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
    ok(btn.textContent.indexOf("OpenStreetMap") >= 0, "labels the source");
    clickEl(app.window, btn);
    await new Promise((r) => setTimeout(r, 20));
    const audit = S.auditOf(business.id);
    notNull(audit);
    eq(audit.website.exists, true);
    eq(audit.website.contact, true);
  });
});