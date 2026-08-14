/* VISION 61 CRM — service: OpenStreetMap (free discovery, no API key).
   Google Places returns ratings + reviews; OpenStreetMap is the no-cost
   alternative. It returns real businesses (name, address, category, location,
   and — via Overpass — phone/website/hours when mapped). It never provides
   ratings or review counts, so the CRM simply shows none.

   APIs:
   - Nominatim search: https://nominatim.openstreetmap.org/search
   - Overpass tags:    https://overpass-api.de/api/interpreter
   Both are CORS-open and need no key. Light usage only (the CRM does one
   search per click and one detail fetch per added lead). */
window.V61 = window.V61 || {};

(function () {
  const NOMINATIM = "https://nominatim.openstreetmap.org/search";
  const OVERPASS = "https://overpass-api.de/api/interpreter";

  function norm(q, loc) { return (q + " in " + loc).trim(); }

  const CAT_MAP = {
    "amenity/restaurant": "Restaurant", "amenity/fast_food": "Restaurant", "amenity/cafe": "Cafe",
    "amenity/bar": "Bar", "amenity/pub": "Bar", "amenity/clinic": "Clinic", "amenity/dentist": "Dentist",
    "amenity/pharmacy": "Pharmacy", "amenity/hospital": "Hospital", "amenity/beauty_salon": "Beauty salon",
    "amenity/bank": "Bank", "amenity/school": "School", "amenity/university": "University",
    "amenity/car_repair": "Auto repair", "amenity/car_wash": "Car wash", "amenity/marketplace": "Market",
    "shop/bakery": "Bakery", "shop/salon": "Salon", "shop/barber": "Barber", "shop/hairdresser": "Hair salon",
    "shop/beauty": "Beauty salon", "shop/convenience": "Convenience store", "shop/supermarket": "Supermarket",
    "shop/electronics": "Electronics store", "shop/clothes": "Clothing store", "shop/furniture": "Furniture store",
    "shop/optician": "Optician", "shop/pharmacy": "Pharmacy", "shop/florist": "Florist",
    "shop/jewelry": "Jewellery", "shop/shoes": "Shoe store", "shop/pet": "Pet store",
    "shop/books": "Book store", "shop/laundry": "Laundry", "shop/mall": "Shopping mall",
    "tourism/hotel": "Hotel", "tourism/hostel": "Hostel", "tourism/camp_site": "Camp site",
    "leisure/gym": "Gym", "leisure/fitness_centre": "Gym", "leisure/spa": "Spa", "leisure/sports_centre": "Sports centre",
    "craft/electrician": "Electrician", "craft/plumber": "Plumber", "craft/photographer": "Photographer",
    "craft/accountant": "Accountant", "craft/travel_agent": "Travel agency",
    "office/accountant": "Accountant", "office/lawyer": "Law firm", "office/travel_agent": "Travel agency",
    "office/insurance": "Insurance agency", "office/estate_agent": "Real estate",
    "healthcare/physiotherapist": "Physiotherapist", "healthcare/clinic": "Clinic",
    "amenity/veterinary": "Veterinary", "amenity/place_of_worship": "Church",
  };

  function normalizeCategory(cls, type) {
    const key = cls + "/" + type;
    if (CAT_MAP[key]) return CAT_MAP[key];
    return String(type || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "";
  }

  function osmIdOf(o) {
    return o && o.osm_type && o.osm_id ? o.osm_type + "/" + o.osm_id : "";
  }

  function addressOf(o) {
    const a = o.address || {};
    const parts = [a.road || a.pedestrian || a.hamlet || "", a.suburb || "", a.city || a.town || a.village || ""].filter(Boolean);
    return (o.display_name && o.display_name.split(",")[0]) || parts.join(", ") || "";
  }

  function cityOf(o) {
    const a = o.address || {};
    return a.city || a.town || a.village || a.municipality || a.state || "";
  }

  /* Nominatim text search — real OSM businesses by query + location. */
  function discoverySearch(query, location) {
    const url = NOMINATIM + "?format=json&addressdetails=1&limit=10&q=" + encodeURIComponent(norm(query, location));
    return window.fetch(url, { headers: { "Accept": "application/json" } }).then((res) => {
      if (!res.ok) throw new Error("OpenStreetMap search failed (" + res.status + ")");
      return res.json();
    }).then((list) => (list || []).map((o) => ({
      osmId: osmIdOf(o),
      name: (o.display_name && o.display_name.split(",")[0]) || o.name || "",
      address: addressOf(o),
      city: cityOf(o),
      category: normalizeCategory(o.class, o.type),
      rating: null, reviews: null, openNow: null,
      lat: o.lat != null ? Number(o.lat) : null,
      lng: o.lon != null ? Number(o.lon) : null,
      source: "osm-discovery",
    })));
  }

  /* Overpass: fetch OSM tags (phone, website, email, hours) for one element.
     Only fields actually mapped on OpenStreetMap are returned — nothing is
     invented, and no rating/review claims are ever made. */
  function placeDetails(osmId) {
    const m = /^(node|way|relation)\/(\d+)$/.exec(osmId || "");
    if (!m) return Promise.reject(new Error("Invalid OpenStreetMap reference."));
    const type = m[1], id = m[2];
    const url = OVERPASS + "?data=" + encodeURIComponent("[out:json];" + type + "(" + id + ");out tags;");
    return window.fetch(url, { headers: { "Accept": "application/json" } }).then((res) => {
      if (!res.ok) throw new Error("OpenStreetMap details failed (" + res.status + ")");
      return res.json();
    }).then((data) => {
      const el = data && data.elements && data.elements[0];
      if (!el || !el.tags) return {};
      const t = el.tags;
      const cls = t.amenity ? "amenity" : t.shop ? "shop" : t.tourism ? "tourism" : t.leisure ? "leisure" : t.craft ? "craft" : t.office ? "office" : "";
      const typeName = t.amenity || t.shop || t.tourism || t.leisure || t.craft || t.office || "";
      const d = {
        phone: t.phone || t["contact:phone"] || "",
        website: t.website || t["contact:website"] || t["contact:web"] || "",
        email: t.email || t["contact:email"] || "",
        hours: !!(t.opening_hours),
      };
      if (t.name) d.name = t.name;
      if (t["addr:street"]) d.address = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
      const cat = normalizeCategory(cls, typeName);
      if (cat) d.category = cat;
      return d;
    });
  }

  /* Same category hints as Google so both providers share the datalist. */
  function catMetaOptions() {
    return V61.GooglePlaces ? V61.GooglePlaces.catMetaOptions() : "";
  }

  V61.OpenStreetMap = { discoverySearch, placeDetails, normalizeCategory, catMetaOptions };
})();