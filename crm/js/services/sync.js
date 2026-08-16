/* VISION 61 CRM — service: cloud sync
   Keeps one copy of the CRM database in the cloud so all the user's devices
   share the same data (localStorage is per-device).

   How it works
   - The database lives in localStorage (key v61crm_v1) as before. Cloud sync
     mirrors it to the AI gateway's Durable Object via GET/PUT /v1/sync.
   - The gateway keeps a revision number. A PUT only succeeds when it matches
     the expected revision (optimistic concurrency) — if another device changed
     the data first, this device gets a 409 and reloads the cloud copy.
   - On first connect this device merges the cloud data with any local records
     (union by id, newest updatedAt/createdAt wins), so nothing is lost.

   Security contract
   - The sync passcode is kept in memory only — never localStorage. It is sent
     per-request as X-Sync-Pass and validated against a Worker secret. Reload
     the page and the user re-enters the passcode to unlock sync.
   - Requests still use the short-lived origin-bound session token and the
     worker still requires the approved browser Origin.
   - Nothing syncs unless the user explicitly enters the passcode and enables
     Cloud Sync in Settings. */
window.V61 = window.V61 || {};

(function () {
  const S = () => V61.Store;

  let _passcode = "";
  let _pushing = false;
  let _dirty = false;
  let _lastFp = null;
  let _lastResult = null;

  function config() {
    const s = S().db.settings;
    if (!s.sync) s.sync = { enabled: false, gatewayUrl: "", lastRev: 0, lastSyncAt: 0 };
    return s.sync;
  }

  /* Sync is live only when the user enabled it AND entered the passcode this
     session. After a reload the passcode is gone, so sync pauses until the
     user unlocks again — an intentional tradeoff that keeps the passcode out
     of persistent storage. */
  function enabled() {
    const c = config();
    return !!(c.enabled && _passcode);
  }

  function setPasscode(pc) { _passcode = String(pc || ""); return enabled(); }

  function setGatewayUrl(url) {
    const c = config();
    c.gatewayUrl = String(url || "").trim();
    S().save();
  }

  function gatewayBase() { return V61.Session.gatewayBase(); }

  function hasData() {
    const db = S().db;
    return !!(db && ((db.businesses && db.businesses.length) || (db.leads && db.leads.length)));
  }

  /* Stable fingerprint of everything EXCEPT sync settings — so saving the
     passcode/gateway config never looks like a data change that needs a push. */
  function fingerprint() {
    const db = S().db;
    const s = Object.assign({}, db.settings || {});
    s.sync = undefined;
    return JSON.stringify(Object.assign({}, db, { settings: s }));
  }

  function replaceDb(data) {
    if (!data || typeof data !== "object") return;
    const db = S().db;
    for (const k of Object.keys(data)) {
      if (k === "settings") continue;
      db[k] = data[k];
    }
    if (data.settings && typeof data.settings === "object") {
      const base = db.settings;
      const adopted = JSON.parse(JSON.stringify(data.settings));
      if (base && base.sync) adopted.sync = base.sync;   /* keep THIS device's sync config */
      db.settings = adopted;
    }
  }

  /* Union merge: identical ids keep the newer record (updatedAt, else createdAt).
     Never drops a record that exists on only one side. */
  function merge(base, overlay) {
    const out = JSON.parse(JSON.stringify(base || {}));
    const ts = (r) => Math.max(Number(r && r.updatedAt) || 0, Number(r && r.createdAt) || 0);
    for (const col of Object.keys(out)) {
      if (!Array.isArray(out[col])) continue;
      const map = {};
      (Array.isArray(out[col]) ? out[col] : []).forEach((r) => { if (r && r.id) map[String(r.id)] = r; });
      (Array.isArray(overlay && overlay[col]) ? overlay[col] : []).forEach((r) => {
        if (!r || !r.id) return;
        const id = String(r.id);
        const a = map[id];
        if (!a) { map[id] = r; return; }
        if (ts(r) > ts(a)) map[id] = r;
      });
      out[col] = Object.keys(map).map((id) => map[id]);
    }
    return out;
  }

  /* Adopt a cloud copy as the local truth (local sync config is preserved). */
  function adopt(data, rev) {
    replaceDb(data);
    const c = config();
    c.enabled = true;
    c.lastRev = typeof rev === "number" ? rev : (c.lastRev || 0);
    c.lastSyncAt = Date.now();
    _lastFp = fingerprint();
    S().save();
  }

  /* Fetch the cloud copy. Pure — does not mutate config. */
  async function pull() {
    if (!enabled()) return { ok: false, error: "not_enabled", message: "Enter your sync passcode to unlock cloud sync." };
    const base = gatewayBase();
    if (!base) return { ok: false, error: "not_configured", message: "Set the gateway URL first." };
    const s = await V61.Session.acquireSession();
    if (!s.token) return { ok: false, error: s.code || "session", message: "Could not reach the gateway." };
    let res;
    try {
      res = await fetch(base + "/v1/sync", { method: "GET", headers: { "Authorization": "Bearer " + s.token, "X-Sync-Pass": _passcode } });
    } catch (e) {
      return { ok: false, error: "network", message: "Could not reach the gateway — check your connection." };
    }
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.ok) {
      if (res.status === 401) V61.Session.clearSession();
      return { ok: false, error: (data && data.error) || "gateway_error", message: (data && data.message) || "Sync request failed.", status: res.status };
    }
    const rev = typeof data.rev === "number" ? data.rev : 0;
    return { ok: true, rev, data: data.data || null, updatedAt: data.updatedAt || 0 };
  }

  /* Push the current database. Expected revision guards against overwriting
     another device's newer copy. */
  async function push(data, expectedRev) {
    if (!enabled()) return { ok: false, error: "not_enabled", message: "Enter your sync passcode to unlock cloud sync." };
    const base = gatewayBase();
    if (!base) return { ok: false, error: "not_configured", message: "Set the gateway URL first." };
    const s = await V61.Session.acquireSession();
    if (!s.token) return { ok: false, error: s.code || "session", message: "Could not reach the gateway." };
    let res;
    try {
      res = await fetch(base + "/v1/sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + s.token, "X-Sync-Pass": _passcode },
        body: JSON.stringify({ expectedRev, data }),
      });
    } catch (e) {
      return { ok: false, error: "network", message: "Could not reach the gateway — check your connection." };
    }
    const out = await res.json().catch(() => null);
    if (res.status === 401) {
      V61.Session.clearSession();
      return { ok: false, error: "unauthorized", message: (out && out.message) || "Sync session rejected.", status: 401 };
    }
    if (!res.ok || !out || !out.ok) {
      if (res.status === 409) {
        return { ok: false, error: "conflict", message: "Your data changed on another device — press Sync now to merge.", currentRev: out && out.currentRev, status: 409 };
      }
      return { ok: false, error: (out && out.error) || "gateway_error", message: (out && out.message) || "Sync failed.", status: res.status };
    }
    const c = config();
    c.lastRev = typeof out.rev === "number" ? out.rev : (Number(expectedRev) + 1);
    c.lastSyncAt = Date.now();
    return { ok: true, rev: out.rev };
  }

  /* Push local changes when the fingerprint changed. Called by the data layer
     on every save() once sync is unlocked. Safe to call often. */
  async function flush(force) {
    if (!enabled()) return { ok: false, error: "not_enabled", message: "Enter your sync passcode to unlock cloud sync." };
    if (_pushing) { _dirty = true; return { ok: false, error: "busy" }; }
    const fp = fingerprint();
    if (!force && fp === _lastFp) return { ok: true, upToDate: true };
    _pushing = true;
    try {
      const c = config();
      const rev = typeof c.lastRev === "number" ? c.lastRev : 0;
      const res = await push(S().db, rev);
      if (res.ok) { _lastFp = fingerprint(); return { ok: true, rev: res.rev }; }
      return res;
    } finally {
      _pushing = false;
      if (_dirty) { _dirty = false; setTimeout(() => { try { flush(true); } catch (e) {} }, 0); }
    }
  }

  /* Pull latest, adopt if this device is stale, then push local changes.
     Returns a friendly summary for the Settings panel. */
  async function syncNow() {
    if (!enabled()) return { ok: false, error: "not_enabled", message: "Enter your sync passcode to unlock cloud sync." };
    const p = await pull();
    if (!p.ok) return p;
    let adopted = false;
    if (p.data) {
      const localRev = typeof config().lastRev === "number" ? config().lastRev : 0;
      if (p.rev > localRev) {
        const m = (hasData() && localRev === 0) ? merge(p.data, S().db) : p.data;
        adopt(m, p.rev);
        adopted = true;
      }
    }
    const f = await flush(true);
    return { ok: f.ok, error: f.ok ? null : f.error, message: f.ok ? null : f.message, rev: f.ok ? f.rev : (f.currentRev || p.rev), adopted, push: f };
  }

  /* Called when the user unlocks sync (or on app start if already unlocked).
     Pulls the cloud copy and merges/adopts as needed. */
  async function pullOnLoad(render) {
    if (!enabled()) return { ok: false, error: "not_enabled", message: "Enter your sync passcode to unlock cloud sync." };
    const p = await pull();
    if (!p.ok) return p;
    if (!p.data) return { ok: true, rev: 0, data: null, adopted: false };
    const localRev = typeof config().lastRev === "number" ? config().lastRev : 0;
    if (p.rev > localRev) {
      const m = (hasData() && localRev === 0) ? merge(p.data, S().db) : p.data;
      adopt(m, p.rev);
      if (render) { try { render(); } catch (e) {} }
      return { ok: true, rev: p.rev, adopted: true };
    }
    return { ok: true, rev: p.rev, adopted: false };
  }

  function status() {
    const c = config();
    return {
      enabled: !!c.enabled,
      unlocked: !!_passcode,
      gatewayUrl: gatewayBase(),
      lastRev: c.lastRev || 0,
      lastSyncAt: c.lastSyncAt || 0,
      lastResult: _lastResult,
    };
  }

  V61.Sync = { config, enabled, setPasscode, setGatewayUrl, gatewayBase, pull, push, flush, syncNow, pullOnLoad, merge, replaceDb, fingerprint, adopt, status, setLastResult: (r) => { _lastResult = r; } };
})();