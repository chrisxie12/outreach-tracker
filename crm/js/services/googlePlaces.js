/* VISION 61 CRM — service: Google Places (loader, textSearch, placeDetails) */
window.V61 = window.V61 || {};

(function () {
  const S = () => V61.Store;

  function discoveryKey() { return (S().db.settings.googleMapsApiKey || "").trim(); }

  /* Session-only photo cache keyed by placeId. Photos are shown live on discovery
     cards and lead views while the browser tab is open, but are never written to
     localStorage (image data would blow past the ~5MB storage budget). */
  const photoCache = {};

  function photoUrl(p) {
    if (!p || !p.photos || !p.photos.length) return null;
    try { return p.photos[0].getUrl({ maxWidth: 200, maxHeight: 200 }); }
    catch (e) { return null; }
  }

  function cachePhoto(placeId, url) { if (placeId && url) photoCache[placeId] = url; }

  function photoFor(placeId) { return (placeId && photoCache[placeId]) || null; }

  function capturePhoto(p) {
    const url = photoUrl(p);
    if (p && p.place_id) cachePhoto(p.place_id, url);
    return url;
  }

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
      school: "School", university: "University",
      florist: "Florist", clothing_store: "Clothing store", electronics_store: "Electronics store", furniture_store: "Furniture store",
      home_goods_store: "Home goods", shoe_store: "Shoe store", jewelry_store: "Jewellery", book_store: "Book store",
      pet_store: "Pet store", veterinary_care: "Veterinary", church: "Church", mosque: "Mosque",
      local_government_office: "Office", insurance_agency: "Insurance", movie_theater: "Cinema", park: "Park", art_gallery: "Art gallery",
    };
    for (const t of (types || [])) { if (map[t]) return map[t]; }
    return (types && types[0]) ? types[0].replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "";
  }

  function extractCity(p) {
    const comps = (p.address_components || []).map((c) => c.types[0] === "locality" || c.types[0] === "administrative_area_level_1" ? c.long_name : null).filter(Boolean);
    return comps[0] || "";
  }

  /* textSearch: real Google Places results (name, address, rating, reviews, open status). */
  function discoverySearch(query, location) {
    return placesReady().then(() => new Promise((resolve, reject) => {
      const svc = placesService();
      svc.textSearch({ query: (query + " in " + location).trim(), language: "en" }, (results, status) => {
        if (status === "OK" || status === "ZERO_RESULTS") {
          resolve((results || []).map((p) => {
            const photo = capturePhoto(p);
            return {
              placeId: p.place_id, name: p.name || "", address: p.formatted_address || p.vicinity || "",
              city: extractCity(p), category: normalizeType(p.types),
              rating: p.rating || null, reviews: p.user_ratings_total || 0,
              openNow: p.opening_hours ? p.opening_hours.open_now : null,
              lat: p.geometry && p.geometry.location ? p.geometry.location.lat() : null,
              lng: p.geometry && p.geometry.location ? p.geometry.location.lng() : null,
              photo: photo,
            };
          }));
        } else reject(new Error("Places API error: " + status));
      });
    }));
  }

  /* getDetails: real place details (phone, website, hours, photos) used when adding or auto-filling an audit. */
  function placeDetails(placeId) {
    return placesReady().then(() => new Promise((resolve, reject) => {
      const svc = placesService();
      svc.getDetails({ placeId, fields: ["name", "formatted_address", "formatted_phone_number", "international_phone_number", "website", "rating", "user_ratings_total", "opening_hours", "url", "types", "photos", "address_components", "geometry"] }, (p, status) => {
        if (status === "OK" && p) {
          const photo = capturePhoto(p);
          resolve({
          name: p.name || "", address: p.formatted_address || "",
          phone: p.formatted_phone_number || p.international_phone_number || "",
          website: p.website || "",
          rating: p.rating || null, reviews: p.user_ratings_total || 0,
          hours: !!(p.opening_hours && p.opening_hours.periods && p.opening_hours.periods.length),
          photos: (p.photos && p.photos.length) || 0,
          url: p.url || "", types: p.types || [], category: normalizeType(p.types),
          city: extractCity(p),
          lat: p.geometry && p.geometry.location ? p.geometry.location.lat() : null,
          lng: p.geometry && p.geometry.location ? p.geometry.location.lng() : null,
          photo: photo,
        });
        }
        else reject(new Error("Place details error: " + status));
      });
    }));
  }

  /* findPlaceFromQuery: resolve a single best-match Google place for a query
     (used when the user pastes a Google Maps link we can't read a place id
     from, or just a business name). Returns { placeId, name } or null when
     Google reports no match — never a fabricated result. */
  function findPlaceFromQuery(query) {
    return placesReady().then(() => new Promise((resolve, reject) => {
      const svc = placesService();
      svc.findPlaceFromQuery({ query, fields: ["place_id", "name", "formatted_address"] }, (results, status) => {
        if (status === "OK" && results && results[0]) {
          resolve({ placeId: results[0].place_id, name: results[0].name || "" });
        } else if (status === "ZERO_RESULTS" || status === "NOT_FOUND") {
          resolve(null);
        } else {
          reject(new Error("Places API error: " + status));
        }
      });
    }));
  }

  function catMetaOptions() {
    const cats = ["Restaurant", "Cafe", "Bakery", "Bar", "Salon", "Barber", "Clinic", "Dentist", "Pharmacy", "Gym", "Fashion store", "Electronics store", "Hotel", "Real estate", "Auto repair", "Car wash", "Electrician", "Plumber", "Cleaning service", "Photographer", "School", "Accountant", "Law firm", "Travel agency", "Web design", "Marketing agency"];
    return cats.map((c) => "<option value='" + c + "'>").join("");
  }

  /* ── Provider dispatcher ──
     Google Places (default): ratings + reviews, needs a browser API key.
     OpenStreetMap: 100% free, no key, but no ratings or reviews.
     The pages only talk to V61.Discovery, never to a provider directly. */
  function discoveryProvider() { return (S().db.settings.discoveryProvider === "osm") ? "osm" : "google"; }
  function discoveryReady() { return discoveryProvider() === "osm" || !!discoveryKey(); }
  function discoveryLabel() { return discoveryProvider() === "osm" ? "OpenStreetMap" : "Google Places"; }
  function discoverySearchAny(query, location) {
    return discoveryProvider() === "osm" ? V61.OpenStreetMap.discoverySearch(query, location) : V61.GooglePlaces.discoverySearch(query, location);
  }
  /* Resolve details for whichever identifier the result carries: OSM ids look
     like "node/123"; Google place ids are any other non-empty string. */
  function discoveryDetails(id) {
    return /^(node|way|relation)\//.test(String(id || "")) ? V61.OpenStreetMap.placeDetails(id) : V61.GooglePlaces.placeDetails(id);
  }
  const Discovery = {
    provider: discoveryProvider, ready: discoveryReady, label: discoveryLabel, key: discoveryKey,
    search: discoverySearchAny, details: discoveryDetails, catMetaOptions,
  };

  V61.GooglePlaces = { discoveryKey, placesReady, placesService, normalizeType, extractCity, discoverySearch, placeDetails, findPlaceFromQuery, catMetaOptions, photoFor, cachePhoto, capturePhoto };
  V61.Discovery = Discovery;
})();