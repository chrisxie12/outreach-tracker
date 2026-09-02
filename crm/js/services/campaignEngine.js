/* VISION 61 CRM — service: CampaignEngine
   Manages campaign lifecycle, ICP matching, and prospect scoring.
   ICP (Ideal Customer Profile) structure:
   {
     categories: ["restaurant", "salon", ...],   // business categories
     locations: ["Accra", "Kumasi", ...],         // cities/areas
     minScore: 0,                                  // minimum digital score
     maxScore: 100,                                // maximum digital score
     minLeadScore: 0,                              // minimum lead score
     hasWebsite: null,                             // true=no website, false=has website, null=any
     hasEmail: null,                               // true=has email, false=no email, null=any
     hasPhone: null,                               // true=has phone, false=no phone, null=any
     minReviews: 0,                                // minimum Google reviews
     sizes: ["small", "medium", "large"],          // business sizes
     keywords: [],                                 // name/description keywords
   } */
window.V61 = window.V61 || {};

(function () {
  const U = () => V61.Utils;
  const S = () => V61.Store;

  const EMPTY_ICP = {
    categories: [], locations: [], minScore: 0, maxScore: 100, minLeadScore: 0,
    hasWebsite: null, hasEmail: null, hasPhone: null,
    minReviews: 0, sizes: [], keywords: [],
  };

  function normalizeICP(icp) {
    return Object.assign({}, EMPTY_ICP, icp || {});
  }

  /* Score how well a business matches the ICP (0–100). */
  function icpMatchScore(icp, row) {
    const ic = normalizeICP(icp);
    const b = row.business || {};
    const audit = row.audit || {};
    let score = 0;
    let max = 0;

    // Category match (25 pts)
    max += 25;
    if (ic.categories.length) {
      const cat = (b.categoryKey || b.category || "").toLowerCase();
      if (ic.categories.some((c) => cat.indexOf(c.toLowerCase()) >= 0)) score += 25;
    } else score += 25;

    // Location match (20 pts)
    max += 20;
    if (ic.locations.length) {
      const loc = (b.city || b.address || "").toLowerCase();
      if (ic.locations.some((l) => loc.indexOf(l.toLowerCase()) >= 0)) score += 20;
    } else score += 20;

    // Digital score range (15 pts)
    max += 15;
    const ds = row.digitalScore || 0;
    if (ds >= ic.minScore && ds <= ic.maxScore) score += 15;
    else if (ds > 0) score += Math.max(0, 15 - Math.abs(ds - ((ic.minScore + ic.maxScore) / 2)));

    // Lead score minimum (10 pts)
    max += 10;
    if (row.leadScore >= ic.minLeadScore) score += 10;

    // Website presence (10 pts)
    max += 10;
    if (ic.hasWebsite === null) score += 10;
    else if (ic.hasWebsite === true && b.website) score += 10;
    else if (ic.hasWebsite === false && !b.website) score += 10;

    // Email presence (5 pts)
    max += 5;
    if (ic.hasEmail === null) score += 5;
    else if (ic.hasEmail === true && b.email) score += 5;
    else if (ic.hasEmail === false && !b.email) score += 5;

    // Phone presence (5 pts)
    max += 5;
    if (ic.hasPhone === null) score += 5;
    else if (ic.hasPhone === true && (b.phone || b.whatsapp)) score += 5;
    else if (ic.hasPhone === false && !b.phone && !b.whatsapp) score += 5;

    // Reviews minimum (5 pts)
    max += 5;
    if ((b.placeReviews || 0) >= ic.minReviews) score += 5;

    // Size match (5 pts)
    max += 5;
    if (ic.sizes.length) {
      if (ic.sizes.includes(b.size)) score += 5;
    } else score += 5;

    // Keywords (remaining pts split)
    if (ic.keywords.length) {
      const name = (b.name || "").toLowerCase();
      const desc = (b.description || "").toLowerCase();
      const text = name + " " + desc;
      const matched = ic.keywords.filter((kw) => text.indexOf(kw.toLowerCase()) >= 0).length;
      score += Math.round((matched / ic.keywords.length) * 5);
    }

    return max > 0 ? Math.round((score / max) * 100) : 0;
  }

  /* Filter lead rows by ICP and return sorted by match score. */
  function filterByICP(icp, rows) {
    return rows
      .map((r) => Object.assign({}, r, { icpScore: icpMatchScore(icp, r) }))
      .filter((r) => r.icpScore > 0)
      .sort((a, b) => b.icpScore - a.icpScore);
  }

  /* Auto-generate campaign name from ICP. */
  function suggestCampaignName(icp) {
    const ic = normalizeICP(icp);
    const parts = [];
    if (ic.categories.length) parts.push(ic.categories[0]);
    if (ic.locations.length) parts.push(ic.locations[0]);
    if (!parts.length) parts.push("General");
    return parts.join(" — ") + " Campaign";
  }

  /* Validate campaign before starting. */
  function validateCampaign(campaign) {
    const errors = [];
    if (!campaign.name) errors.push("Campaign name is required");
    if (!campaign.sequenceId) errors.push("A sequence must be selected");
    const steps = S().stepsForSequence(campaign.sequenceId);
    if (!steps.length) errors.push("The selected sequence has no steps");
    const emailSteps = steps.filter((s) => s.type === "email");
    if (!emailSteps.length) errors.push("The sequence must have at least one email step");
    return errors;
  }

  V61.CampaignEngine = {
    EMPTY_ICP, normalizeICP, icpMatchScore, filterByICP, suggestCampaignName, validateCampaign,
  };
})();
