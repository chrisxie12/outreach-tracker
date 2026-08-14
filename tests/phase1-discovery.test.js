/* QA Phase 1 — Discovery: Google Places flow, add-to-CRM, dedupe, missing data */
"use strict";
const { suite, test, assert, eq, ok, isNull, notNull } = require("./framework");
const { freshApp, refresh, createApp } = require("./harness");

suite("Phase 1 — Discovery", () => {
  test("addDiscoveredBusiness creates business + lead preserving Google data", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const place = {
      placeId: "Gx123", name: "Kofi's Kitchen", category: "Restaurant",
      address: "12 Oxford St", city: "Accra", phone: "0241000001",
      website: "https://kofis.example", rating: 4.5, reviews: 32,
      lat: 5.6, lng: -0.2,
    };
    const { business, lead, created } = S.addDiscoveredBusiness(place);
    ok(created);
    eq(business.name, "Kofi's Kitchen");
    eq(business.googlePlaceId, "Gx123");
    eq(business.website, "https://kofis.example");
    eq(business.phone, "0241000001");
    eq(business.placeRating, 4.5);
    eq(business.placeReviews, 32);
    eq(business.placeLat, 5.6);
    eq(business.placeLng, -0.2);
    eq(lead.businessId, business.id);
    notNull(lead.id);
  });

  test("duplicate place with same googlePlaceId is NOT recreated", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const place = { placeId: "Gx123", name: "Kofi's Kitchen", category: "Restaurant" };
    const a = S.addDiscoveredBusiness(place);
    const b = S.addDiscoveredBusiness(place);
    eq(a.created, true);
    eq(b.created, false);
    eq(b.business.id, a.business.id);
    eq(S.db.businesses.length, 1);
    eq(S.db.leads.length, 1);
  });

  test("duplicate by name when no googlePlaceId is not recreated", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const a = S.addDiscoveredBusiness({ name: "Sole Bakery" });
    const b = S.addDiscoveredBusiness({ name: "SOLE BAKERY" });
    eq(a.created, true);
    eq(b.created, false);
    eq(S.db.businesses.length, 1);
  });

  test("missing optional Google data does not crash and stores clean values", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const { business, lead } = S.addDiscoveredBusiness({ placeId: "Gx9", name: "Minimal Place" });
    eq(business.category, "");
    eq(business.website, "");
    eq(business.placeRating, null);
    eq(business.placeReviews, null);
    notNull(lead);
  });

  test("business without a name gets a safe fallback, not undefined", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const { business } = S.addDiscoveredBusiness({ placeId: "Gx1" });
    notNull(business.name);
    assert(String(business.name).length > 0);
  });

  test("discovered data persists across refresh", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const { business, lead } = S.addDiscoveredBusiness({ placeId: "Gx77", name: "Persist Shop", phone: "0241112222" });
    S.save();
    const app2 = refresh(app);
    const S2 = app2.V61.Store;
    eq(S2.db.businesses.length, 1);
    eq(S2.db.businesses[0].id, business.id);
    eq(S2.db.businesses[0].googlePlaceId, "Gx77");
    eq(S2.db.businesses[0].phone, "0241112222");
    eq(S2.db.leads.length, 1);
    eq(S2.db.leads[0].id, lead.id);
  });

  test("businessByGooglePlace finds existing record", () => {
    const app = freshApp();
    const S = app.V61.Store;
    S.addDiscoveredBusiness({ placeId: "Gx555", name: "Find Me" });
    const found = S.businessByGooglePlace("Gx555");
    notNull(found);
    eq(found.name, "Find Me");
  });

  test("re-discovering a place whose business already exists links the existing lead", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const a = S.addDiscoveredBusiness({ placeId: "Gx1", name: "Dup Cafe" });
    const b = S.addDiscoveredBusiness({ placeId: "Gx1", name: "Dup Cafe" });
    eq(b.lead.id, a.lead.id);
    eq(S.db.leads.length, 1);
  });
});