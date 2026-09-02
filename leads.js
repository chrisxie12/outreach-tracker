/* Vision 61 Studios — Firebase Leads Integration
   Writes lead data to Cloud Firestore from the static marketing site.

   Uses Firebase compat SDK loaded via CDN (no bundler needed).
   Firestore security rules must allow anonymous writes to the leads collection.
   See firebase-rules.txt for the required rules.
*/
(function () {
  "use strict";

  /* ── Wait for Firebase to be available ─────────────────────────────── */
  function onReady(cb) {
    if (typeof firebase !== "undefined" && firebase.firestore) {
      cb();
    } else {
      window.addEventListener("load", cb);
    }
  }

  onReady(function () {
    if (typeof firebase === "undefined" || !firebase.firestore) {
      console.warn("[leads] Firebase SDK not loaded — leads will not be saved.");
      return;
    }

    var app;
    try {
      app = firebase.app();
    } catch (e) {
      console.warn("[leads] Firebase not initialized:", e.message);
      return;
    }

    var db = firebase.firestore();

    /**
     * Write a lead to Firestore.
     * @param {Object} lead
     * @param {string} lead.name - Contact name
     * @param {string} [lead.business_name] - Business name
     * @param {string} [lead.email] - Email address
     * @param {string} [lead.phone] - Phone/WhatsApp number
     * @param {string} [lead.website] - Website URL
     * @param {string} lead.source - audit_funnel | quote_request | pricing_page
     * @param {number} [lead.audit_score_mobile] - Mobile PSI score
     * @param {number} [lead.audit_score_desktop] - Desktop PSI score
     * @param {string} [lead.audit_url] - URL that was audited
     * @param {string} [lead.service_interest] - Service they're interested in
     * @param {string} [lead.message] - Additional message
     * @returns {Promise<{ok: boolean, id?: string, error?: string}>}
     */
    function submitLead(lead) {
      var doc = {
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
        status: "new",
        created_at: firebase.firestore.FieldValue.serverTimestamp()
      };

      return db.collection("leads").add(doc)
        .then(function (ref) {
          return { ok: true, id: ref.id };
        })
        .catch(function (e) {
          console.warn("[leads] Failed to write lead:", e.message);
          return { ok: false, error: e.message };
        });
    }

    // Expose globally
    window.V61Leads = { submit: submitLead };
  });
})();
