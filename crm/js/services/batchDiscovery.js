/* VISION 61 CRM — service: BatchDiscovery
   ICP-based automated prospect discovery.
   Extends existing Google Places / OSM discovery with ICP filtering
   and batch processing for campaigns. */
window.V61 = window.V61 || {};

(function () {
  const U = () => V61.Utils;
  const S = () => V61.Store;
  const CE = () => V61.CampaignEngine;

  const MAX_BATCH = 20;
  const SEARCH_DELAY = 1500; // ms between searches (polite)

  /* Run a batch discovery for a campaign's ICP.
     Returns { found, added, skipped, errors }. */
  async function runBatch(campaignId, onProgress) {
    const campaign = S().campaignById(campaignId);
    if (!campaign) return { found: 0, added: 0, skipped: 0, errors: ["Campaign not found"] };
    const icp = CE().normalizeICP(campaign.icp);
    const allRows = S().leadRows();
    let found = 0, added = 0, skipped = 0, errors = [];

    // Use existing discovery providers
    const GP = V61.GooglePlaces;
    const OSM = V61.Discovery;
    const provider = S().db.settings.discoveryProvider || "osm";
    const ready = provider === "google" ? (GP && GP.ready && GP.ready()) : (OSM && OSM.ready && OSM.ready());

    if (!ready) {
      return { found: 0, added: 0, skipped: 0, errors: ["No discovery provider configured. Go to Settings."] };
    }

    // Build search queries from ICP
    const categories = icp.categories.length ? icp.categories : [""];
    const locations = icp.locations.length ? icp.locations : [""];
    const queries = [];
    categories.forEach((cat) => {
      locations.forEach((loc) => {
        queries.push({ cat, loc });
      });
    });

    // Limit queries
    const limitedQueries = queries.slice(0, MAX_BATCH);

    for (let i = 0; i < limitedQueries.length; i++) {
      const q = limitedQueries[i];
      if (onProgress) onProgress({ step: i + 1, total: limitedQueries.length, query: q });

      try {
        let results = [];
        if (provider === "google" && GP && GP.search) {
          results = await GP.search(q.cat, q.loc, 20);
        } else if (OSM && OSM.search) {
          results = await OSM.search(q.cat, q.loc, 20);
        }

        found += results.length;

        // Process each result
        for (const place of results) {
          // Check if already in CRM
          const existing = S().businessByName(place.name);
          if (existing) { skipped++; continue; }

          // Add as discovered business
          const { business, lead, created } = S().addDiscoveredBusiness({
            name: place.name,
            category: place.category || q.cat,
            city: place.city || q.loc,
            address: place.address || "",
            phone: place.phone || "",
            email: "",
            website: place.website || "",
            googlePlaceId: place.placeId || "",
            rating: place.rating || null,
            reviews: place.reviews || null,
            lat: place.lat || null,
            lng: place.lng || null,
            source: "campaign_" + campaignId,
            query: q.cat + " " + q.loc,
          });

          if (created) {
            // Score against ICP
            const row = S().leadRows().find((r) => r.lead.id === lead.id);
            if (row) {
              const icpScore = CE().icpMatchScore(icp, row);
              if (icpScore >= 30) { // minimum threshold
                // Add to campaign's prospect list
                let list = S().prospectListsForCampaign(campaignId)[0];
                if (!list) {
                  list = S().addProspectList({ campaignId, name: "Auto-discovered", prospects: [] });
                }
                list.prospects.push({
                  leadId: lead.id,
                  businessId: business.id,
                  icpScore,
                  addedAt: U().now(),
                });
                added++;
              } else {
                skipped++;
              }
            } else {
              skipped++;
            }
          } else {
            skipped++;
          }
        }
      } catch (e) {
        errors.push("Search failed for: " + (q.cat || "any") + " in " + (q.loc || "any"));
      }

      // Polite delay between searches
      if (i < limitedQueries.length - 1) {
        await new Promise((r) => setTimeout(r, SEARCH_DELAY));
      }
    }

    // Update campaign
    S().updateCampaign(campaignId, { updatedAt: U().now() });

    return { found, added, skipped, errors };
  }

  /* Get ICP suggestions based on existing leads. */
  function suggestICP() {
    const rows = S().leadRows();
    const categories = {};
    const locations = {};
    rows.forEach((r) => {
      const b = r.business || {};
      if (b.categoryKey) categories[b.categoryKey] = (categories[b.categoryKey] || 0) + 1;
      if (b.city) locations[b.city] = (locations[b.city] || 0) + 1;
    });
    return {
      categories: Object.entries(categories).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k),
      locations: Object.entries(locations).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k),
    };
  }

  V61.BatchDiscovery = {
    runBatch, suggestICP, MAX_BATCH,
  };
})();
