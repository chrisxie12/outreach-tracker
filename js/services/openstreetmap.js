/* VISION 61 CRM — service: OpenStreetMap (free discovery, no API key).
   Google Places returns ratings + reviews; OpenStreetMap is the no-cost
   alternative. It returns real businesses (name, address, category, location,
   and — via Overpass — phone/website/email/hours when mapped). It never
   provides ratings or review counts, so the CRM simply shows none.

   Search flow: the location is geocoded with Nominatim, then businesses of
   the requested category are pulled from Overpass inside that bounding box,
   so contact details arrive with the search results. If the category does
   not map to known OSM tags (or geocoding fails), it falls back to a plain
   Nominatim text search.

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

  /* Category word → Overpass tag filters. Keys are matched as substrings, so
     the longest keys are tested first to avoid short words shadowing longer
     ones (e.g. "bar" vs "barber"). */
  const CATEGORY_FILTERS = {
    "restaurant": ["amenity=restaurant", "amenity=fast_food"],
    "cafe": ["amenity=cafe"],
    "bakery": ["shop=bakery"],
    "barber": ["shop=barber"],
    "bar": ["amenity=bar", "amenity=pub"],
    "salon": ["shop=salon", "shop=beauty", "shop=hairdresser", "amenity=beauty_salon"],
    "clinic": ["amenity=clinic", "healthcare=clinic"],
    "dentist": ["amenity=dentist"],
    "pharmacy": ["amenity=pharmacy", "shop=pharmacy"],
    "hospital": ["amenity=hospital"],
    "gym": ["leisure=gym", "leisure=fitness_centre"],
    "spa": ["leisure=spa"],
    "hotel": ["tourism=hotel", "tourism=hostel"],
    "bank": ["amenity=bank"],
    "school": ["amenity=school"],
    "university": ["amenity=university"],
    "real estate": ["office=estate_agent"],
    "estate agent": ["office=estate_agent"],
    "auto repair": ["amenity=car_repair", "shop=car_repair"],
    "car repair": ["amenity=car_repair", "shop=car_repair"],
    "car wash": ["amenity=car_wash"],
    "electrician": ["craft=electrician"],
    "plumber": ["craft=plumber"],
    "photographer": ["craft=photographer"],
    "accountant": ["craft=accountant", "office=accountant"],
    "law firm": ["office=lawyer"],
    "lawyer": ["office=lawyer"],
    "travel agency": ["office=travel_agent", "craft=travel_agent"],
    "insurance": ["office=insurance"],
    "florist": ["shop=florist"],
    "electronics": ["shop=electronics"],
    "clothing": ["shop=clothes"],
    "fashion": ["shop=clothes"],
    "furniture": ["shop=furniture"],
    "supermarket": ["shop=supermarket"],
    "convenience": ["shop=convenience"],
    "laundry": ["shop=laundry"],
    "optician": ["shop=optician"],
    "veterinary": ["amenity=veterinary"],
    "pet store": ["shop=pet"],
    "book store": ["shop=books"],
    "shoe": ["shop=shoes"],
    "jewelry": ["shop=jewelry"],
    "jewellery": ["shop=jewelry"],
    "market": ["amenity=marketplace"],
    "church": ["amenity=place_of_worship"],
    "mosque": ["amenity=place_of_worship"],
    "cleaning": ["craft=cleaning"],
    "web design": ["craft=web_designer", "office=it"],
    "marketing": ["office=marketing"],
    "printing": ["shop=copyshop"],
    "towing": ["amenity=towing"],
  };

  function resolveFilters(q) {
    const s = String(q || "").toLowerCase();
    const keys = Object.keys(CATEGORY_FILTERS).sort((a, b) => b.length - a.length);
    for (const k of keys) { if (s.indexOf(k) >= 0) return CATEGORY_FILTERS[k]; }
    return null;
  }

  /* Nominatim geocode a location into a bounding box for the Overpass query. */
  function geocodeLocation(location) {
    const url = NOMINATIM + "?format=json&limit=1&addressdetails=1&q=" + encodeURIComponent(location);
    return window.fetch(url, { headers: { "Accept": "application/json" } }).then((res) => {
      if (!res.ok) throw new Error("OpenStreetMap geocode failed (" + res.status + ")");
      return res.json();
    }).then((list) => {
      const o = (list || [])[0];
      if (!o || !o.boundingbox) throw new Error("Location not found: " + location);
      const bb = o.boundingbox;
      return { minlat: Number(bb[0]), maxlat: Number(bb[1]), minlon: Number(bb[2]), maxlon: Number(bb[3]) };
    });
  }

  /* Overpass element → discovery result. Only fields actually mapped on
     OpenStreetMap are returned — nothing is invented, and no rating/review
     claims are ever made. */
  function parseElement(el) {
    const t = el.tags || {};
    const cls = t.amenity ? "amenity" : t.shop ? "shop" : t.tourism ? "tourism" : t.leisure ? "leisure" : t.craft ? "craft" : t.office ? "office" : "";
    const typeName = t.amenity || t.shop || t.tourism || t.leisure || t.craft || t.office || "";
    const loc = el.center || el;
    return {
      osmId: el.type + "/" + el.id,
      name: t.name || "",
      address: [t["addr:housenumber"], t["addr:street"], t["addr:suburb"]].filter(Boolean).join(" ") || (t["addr:city"] || ""),
      city: t["addr:city"] || t["addr:town"] || t["addr:village"] || t["addr:suburb"] || "",
      category: normalizeCategory(cls, typeName),
      phone: t.phone || t["contact:phone"] || "",
      website: t.website || t["contact:website"] || t["contact:web"] || "",
      email: t.email || t["contact:email"] || "",
      hours: !!(t.opening_hours),
      rating: null, reviews: null, openNow: null,
      lat: loc ? Number(loc.lat) : null,
      lng: loc ? Number(loc.lon) : null,
      source: "osm-discovery",
    };
  }

  /* Overpass search — real OSM businesses in a location with contact tags. */
  function overpassSearch(query, location, filters) {
    return geocodeLocation(location).then((bb) => {
      const bbox = bb.minlat + "," + bb.minlon + "," + bb.maxlat + "," + bb.maxlon;
      const body = filters.map((f) => "node[" + f + "](" + bbox + ");way[" + f + "](" + bbox + ");").join("");
      const data = "[out:json][timeout:25];(" + body + ");out center tags;";
      const url = OVERPASS + "?data=" + encodeURIComponent(data);
      return window.fetch(url, { headers: { "Accept": "application/json" } }).then((res) => {
        if (!res.ok) throw new Error("OpenStreetMap search failed (" + res.status + ")");
        return res.json();
      }).then((d) => {
        const seen = {}, out = [];
        (d.elements || []).forEach((el) => {
          const r = parseElement(el);
          if (!r.name || !r.osmId || seen[r.osmId] || r.lat == null || r.lng == null) return;
          seen[r.osmId] = true;
          out.push(r);
        });
        return out.slice(0, 30);
      });
    }).catch(() => nominatimSearch(query, location));
  }

  /* Nominatim text search — fallback for unmapped categories / missing location. */
  function nominatimSearch(query, location) {
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
      phone: "", website: "", email: "", hours: false,
      rating: null, reviews: null, openNow: null,
      lat: o.lat != null ? Number(o.lat) : null,
      lng: o.lon != null ? Number(o.lon) : null,
      source: "osm-discovery",
    })));
  }

  /* Search real businesses: Overpass when the category maps to OSM tags,
     otherwise Nominatim text search. */
  function discoverySearch(query, location) {
    const filters = resolveFilters(query);
    if (filters && (location || "").trim()) return overpassSearch(query, location, filters);
    return nominatimSearch(query, location);
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