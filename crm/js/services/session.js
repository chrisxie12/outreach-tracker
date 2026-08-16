/* VISION 61 CRM — service: gateway session
   Shared session/token plumbing for the AI gateway AND cloud sync, so both
   features talk to the same origin-bound gateway with the same short-lived
   in-memory token.

   Security contract:
   - The session token is kept in memory only — never in localStorage,
     sessionStorage, IndexedDB, or HTML. It disappears on reload.
   - The token is issued by the gateway for THIS browser origin only; the
     gateway rejects any other origin.
   - Nothing here ever sees an API key. Keys are Worker secrets, never sent
     to the browser.

   Precedence for the gateway URL: settings.sync.gatewayUrl (cloud sync) wins
   over settings.aiConfig.gatewayUrl, so one gateway can serve both features. */
window.V61 = window.V61 || {};

(function () {
  const S = () => V61.Store;

  const DEFAULT_MODEL = "openai/gpt-oss-20b";
  const SESSION_TTL_MS = 15 * 60 * 1000;
  let _token = null;
  let _tokenExp = 0;

  function clearSession() { _token = null; _tokenExp = 0; }

  /* ── Config (from settings; gateway URL is user-editable, never a key) ── */
  function aiConfig() {
    const c = (S().db.settings && S().db.settings.aiConfig) || {};
    const envUrl = (typeof window !== "undefined" && window.V61_AI_GATEWAY_URL) || "";
    return {
      provider: c.provider || "groq",
      enabled: !!c.enabled,
      gatewayUrl: (c.gatewayUrl || envUrl || "").trim(),
      model: c.model || DEFAULT_MODEL,
    };
  }

  /* The single gateway base used by AI and sync. Cloud sync owns the
     precedence so one gateway can serve both. */
  function gatewayBase() {
    const s = S().db.settings || {};
    const syncUrl = (s.sync && s.sync.gatewayUrl) || "";
    return (syncUrl || aiConfig().gatewayUrl).replace(/\/+$/, "");
  }

  /* The browser's own origin. The gateway only accepts the approved CRM origin,
     so this must always be the real page origin — never a stored value. */
  function requestOrigin() {
    try {
      if (typeof window !== "undefined" && window.location && window.location.origin) return window.location.origin;
    } catch (e) {}
    return "";
  }

  /* Obtain a session token (reusing the in-memory copy while still fresh).
     Returns { token } or { token: null, code } — never throws. The token is
     only ever kept in this closure, never persisted. */
  async function acquireSession() {
    const base = gatewayBase();
    if (!base) return { token: null, code: "not_configured" };
    const now = Date.now();
    if (_token && _tokenExp - now > 30000) return { token: _token, code: "ok" };
    let res;
    try {
      res = await fetch(base + "/v1/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin: requestOrigin() }),
      });
    } catch (e) {
      clearSession();
      return { token: null, code: "network" };
    }
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (res.ok && data && data.ok && typeof data.token === "string" && data.token) {
      _token = data.token;
      _tokenExp = (typeof data.expiresAt === "number" && data.expiresAt) || (now + SESSION_TTL_MS);
      return { token: _token, code: "ok" };
    }
    clearSession();
    return { token: null, code: (res.status === 401 || res.status === 403) ? "unauthorized" : "gateway_error", status: res.status };
  }

  V61.Session = { aiConfig, gatewayBase, requestOrigin, acquireSession, clearSession, SESSION_TTL_MS, DEFAULT_MODEL };
})();