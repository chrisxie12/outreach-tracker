/* Vision 61 Studios — Supabase Leads Integration
   Writes lead data to the Supabase leads table from the static marketing site.
   Uses Supabase REST API directly — no library needed.

   Security model:
   - SUPABASE_URL and SUPABASE_ANON_KEY are safe to expose in the browser.
   - Row Level Security (RLS) must be configured to allow INSERT only.
   - See supabase-schema.sql for the required table and RLS policies.
*/
(function () {
  "use strict";

  // ── Configuration ──────────────────────────────────────────────────────
  // Replace these with your actual Supabase project values.
  var CONFIG = {
    url: "",    // e.g. "https://your-project.supabase.co"
    anonKey: "" // your Supabase anon/public key
  };

  var TABLE = "leads";

  // ── Public API ─────────────────────────────────────────────────────────
  /**
   * Write a lead to Supabase.
   * @param {Object} lead - Lead data object
   * @param {string} lead.name - Contact name
   * @param {string} [lead.business_name] - Business name
   * @param {string} [lead.email] - Email address
   * @param {string} [lead.phone] - Phone/WhatsApp number
   * @param {string} [lead.website] - Website URL
   * @param {string} lead.source - Lead source (audit_funnel, quote_request, pricing_page)
   * @param {number} [lead.audit_score_mobile] - Mobile PSI score
   * @param {number} [lead.audit_score_desktop] - Desktop PSI score
   * @param {string} [lead.audit_url] - URL that was audited
   * @param {string} [lead.service_interest] - Service they're interested in
   * @param {string} [lead.message] - Additional message
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  function submitLead(lead) {
    if (!CONFIG.url || !CONFIG.anonKey) {
      console.warn("[leads] Supabase not configured — lead not saved:", lead);
      return Promise.resolve({ ok: false, error: "not_configured" });
    }

    var payload = {
      name: lead.name || "",
      business_name: lead.business_name || "",
      email: lead.email || "",
      phone: lead.phone || "",
      website: lead.website || "",
      source: lead.source || "unknown",
      audit_score_mobile: lead.audit_score_mobile || null,
      audit_score_desktop: lead.audit_score_desktop || null,
      audit_url: lead.audit_url || "",
      service_interest: lead.service_interest || "",
      message: lead.message || "",
      created_at: new Date().toISOString(),
      status: "new"
    };

    return fetch(CONFIG.url + "/rest/v1/" + TABLE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": CONFIG.anonKey,
        "Authorization": "Bearer " + CONFIG.anonKey,
        "Prefer": "resolution=merge-duplicates"
      },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (!res.ok) {
        var err = "HTTP " + res.status;
        try { return res.json().then(function (d) { throw new Error(d.message || err); }); }
        catch (e) { throw new Error(err); }
      }
      return { ok: true };
    }).catch(function (e) {
      console.warn("[leads] Failed to write lead:", e.message);
      return { ok: false, error: e.message };
    });
  }

  // Expose globally
  window.V61Leads = { submit: submitLead, config: CONFIG };
})();
