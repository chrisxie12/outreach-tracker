/* QA — Cloud Sync: Worker Durable Object, gateway routing, frontend service,
   settings panel, merge logic, and security guarantees.
   The Worker is loaded directly in Node (its `export default` is transformed
   to module.exports, and `export class SyncObject` to module.exports.SyncObject)
   and exercised against a fake Durable Object storage. */
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { suite, test, assert, eq, ok, isNull, notNull, assertCleanHTML } = require("./framework");
const { freshApp, settle, KEY, ROOT } = require("./harness");

const GW = "https://vision61-gw.test";
const PROD_ORIGIN = "https://chrisxie12.github.io";
const SHARED_SECRET = "test-shared-secret";
const SYNC_PASS = "correct-horse-battery";
const JSDOM_ORIGIN = "http://localhost";

const WORKER_SRC = path.join(ROOT, "worker", "src", "index.js");
let workerCache = null;
function loadWorker() {
  if (workerCache) return workerCache;
  const tmp = path.join(os.tmpdir(), "v61-sync-worker-" + process.pid + ".cjs");
  let src = fs.readFileSync(WORKER_SRC, "utf8");
  src = src.replace(/export\s+default/, "module.exports =");
  src = src.replace(/export\s+class\s+(\w+)/, "class $1");
  fs.writeFileSync(tmp, src);
  workerCache = require(tmp);
  return workerCache;
}

/* Fake Durable Object storage. */
function fakeStorage() {
  const m = new Map();
  return {
    get: async (k) => (m.has(k) ? m.get(k) : undefined),
    put: async (k, v) => { m.set(k, v); },
    delete: async (k) => { m.delete(k); },
    _raw: m,
  };
}

function workerEnv(over) {
  return Object.assign({ GROQ_API_KEY: "sk-x", V61_SHARED_SECRET: SHARED_SECRET, V61_SYNC_SECRET: SYNC_PASS }, over || {});
}

/* Independent re-implementation of the token format so tests mint their own. */
function b64url(str) {
  return Buffer.from(str, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function hmacHex(secret, data) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function mintTestToken(secret, origin) {
  const payload = b64url(JSON.stringify({ v: 1, iat: Date.now(), exp: Date.now() + 900000, origin }));
  return payload + "." + await hmacHex(secret, payload);
}

async function callSync(obj, env, opts) {
  opts = opts || {};
  const origin = opts.origin !== undefined ? opts.origin : PROD_ORIGIN;
  const headers = {};
  if (origin) headers.Origin = origin;
  if (opts.token !== null) {
    if (opts.token) headers.Authorization = "Bearer " + opts.token;
    else headers.Authorization = "Bearer " + await mintTestToken(env.V61_SHARED_SECRET, origin);
  }
  if (opts.passcode !== undefined) headers["X-Sync-Pass"] = opts.passcode;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const req = new Request("https://gw.test/v1/sync", {
    method: opts.method || "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  return obj.fetch(req);
}

/* ─────────────── Cloudflare Worker Durable Object (/v1/sync) ─────────────── */
suite("sync — Worker Durable Object", () => {
  test("GET /v1/sync without a session token returns 401", async () => {
    const obj = new (loadWorker()).SyncObject({ storage: fakeStorage() }, workerEnv());
    const res = await callSync(obj, workerEnv(), { token: null });
    eq(res.status, 401);
    eq((await res.json()).code, "missing_token");
  });

  test("GET /v1/sync rejects a request from a disallowed origin with 403", async () => {
    const obj = new (loadWorker()).SyncObject({ storage: fakeStorage() }, workerEnv());
    const res = await callSync(obj, workerEnv(), { origin: "https://evil.example" });
    eq(res.status, 403);
    eq((await res.json()).error, "forbidden_origin");
  });

  test("GET /v1/sync with a valid token but wrong passcode returns 401", async () => {
    const obj = new (loadWorker()).SyncObject({ storage: fakeStorage() }, workerEnv());
    const res = await callSync(obj, workerEnv(), { passcode: "wrong-passcode" });
    eq(res.status, 401);
    eq((await res.json()).code, "invalid_passcode");
  });

  test("GET /v1/sync fails closed when the passcode secret is not set (503)", async () => {
    const obj = new (loadWorker()).SyncObject({ storage: fakeStorage() }, workerEnv({ V61_SYNC_SECRET: "" }));
    const res = await callSync(obj, workerEnv({ V61_SYNC_SECRET: "" }), { passcode: SYNC_PASS });
    eq(res.status, 503);
    eq((await res.json()).error, "not_configured");
  });

  test("GET /v1/sync with valid token + passcode returns rev 0 with no data", async () => {
    const obj = new (loadWorker()).SyncObject({ storage: fakeStorage() }, workerEnv());
    const res = await callSync(obj, workerEnv(), { passcode: SYNC_PASS });
    eq(res.status, 200);
    const d = await res.json();
    eq(d.ok, true);
    eq(d.rev, 0);
    eq(d.data, null);
  });

  test("PUT /v1/sync creates rev 1 and returns the stored copy on GET", async () => {
    const storage = fakeStorage();
    const obj = new (loadWorker()).SyncObject({ storage }, workerEnv());
    const payload = { expectedRev: 0, data: { businesses: [{ id: "b1", name: "Ama's Kitchen", updatedAt: 1 }] } };
    const put = await callSync(obj, workerEnv(), { method: "PUT", passcode: SYNC_PASS, body: payload });
    eq(put.status, 200);
    eq((await put.json()).rev, 1);
    const get = await callSync(obj, workerEnv(), { passcode: SYNC_PASS });
    const d = await get.json();
    eq(d.rev, 1);
    eq(d.data.businesses.length, 1);
  });

  test("PUT /v1/sync rejects a stale expectedRev with 409 and the current rev", async () => {
    const storage = fakeStorage();
    const obj = new (loadWorker()).SyncObject({ storage }, workerEnv());
    await callSync(obj, workerEnv(), { method: "PUT", passcode: SYNC_PASS, body: { expectedRev: 0, data: { businesses: [] } } });
    const stale = await callSync(obj, workerEnv(), { method: "PUT", passcode: SYNC_PASS, body: { expectedRev: 0, data: { businesses: [] } } });
    eq(stale.status, 409);
    const d = await stale.json();
    eq(d.error, "conflict");
    eq(d.currentRev, 1);
  });

  test("PUT /v1/sync requires application/json content type", async () => {
    const obj = new (loadWorker()).SyncObject({ storage: fakeStorage() }, workerEnv());
    const headers = { Origin: PROD_ORIGIN, Authorization: "Bearer " + await mintTestToken(SHARED_SECRET, PROD_ORIGIN), "X-Sync-Pass": SYNC_PASS };
    const req = new Request("https://gw.test/v1/sync", { method: "PUT", headers: Object.assign({}, headers, { "Content-Type": "text/plain" }), body: JSON.stringify({ expectedRev: 0, data: {} }) });
    const r2 = await obj.fetch(req);
    eq(r2.status, 400);
  });

  test("PUT /v1/sync rejects a body over the size cap with 400", async () => {
    const obj = new (loadWorker()).SyncObject({ storage: fakeStorage() }, workerEnv());
    const res = await callSync(obj, workerEnv(), { method: "PUT", passcode: SYNC_PASS, body: { expectedRev: 0, data: { big: "x".repeat(3 * 1024 * 1024) } } });
    eq(res.status, 400);
  });

  test("OPTIONS on the Durable Object returns 204 and permits the sync headers", async () => {
    const obj = new (loadWorker()).SyncObject({ storage: fakeStorage() }, workerEnv());
    const req = new Request("https://gw.test/v1/sync", { method: "OPTIONS", headers: { Origin: PROD_ORIGIN } });
    const res = await obj.fetch(req);
    eq(res.status, 204);
    ok((res.headers.get("Access-Control-Allow-Headers") || "").includes("X-Sync-Pass"), "CORS must permit X-Sync-Pass");
  });
});

/* ─────────────── Gateway routing of /v1/sync ─────────────── */
suite("sync — gateway routing", () => {
  test("main worker forwards /v1/sync to the Durable Object binding", async () => {
    const worker = loadWorker();
    const forwarded = { ok: true, forwardedTo: "sync-object" };
    const ns = {
      idFromName: () => "crm-main",
      get: () => ({ fetch: async (r) => new Response(JSON.stringify(forwarded), { status: 200, headers: { "Content-Type": "application/json" } }) }),
    };
    const env = workerEnv({ SYNC_SERVICE: ns });
    const token = await mintTestToken(SHARED_SECRET, PROD_ORIGIN);
    const req = new Request("https://gw.test/v1/sync", { headers: { Origin: PROD_ORIGIN, Authorization: "Bearer " + token } });
    const res = await worker.fetch(req, env);
    eq(res.status, 200);
    eq((await res.json()).forwardedTo, "sync-object");
  });

  test("main worker returns 503 when no sync binding is configured", async () => {
    const worker = loadWorker();
    const token = await mintTestToken(SHARED_SECRET, PROD_ORIGIN);
    const req = new Request("https://gw.test/v1/sync", { headers: { Origin: PROD_ORIGIN, Authorization: "Bearer " + token } });
    const res = await worker.fetch(req, workerEnv({ SYNC_SERVICE: undefined }));
    eq(res.status, 503);
    eq((await res.json()).error, "not_configured");
  });
});

/* ─────────────── Frontend sync service ─────────────── */
function unlock(app) {
  const sc = app.V61.Sync.config();
  sc.enabled = true;
  sc.gatewayUrl = GW;
  app.V61.Sync.setPasscode(SYNC_PASS);
  return app;
}

/* Window fetch stub that drives the REAL Worker Durable Object. */
function cloudFetch(obj, env, origin) {
  return async (url, opts) => {
    if (String(url).includes("/v1/session")) {
      const token = await mintTestToken(env.V61_SHARED_SECRET, origin);
      return { ok: true, status: 200, json: async () => ({ ok: true, token, expiresAt: Date.now() + 900000 }) };
    }
    const headers = Object.assign({}, (opts && opts.headers) || {}, { Origin: origin });
    const req = new Request(url, Object.assign({}, opts, { headers }));
    return obj.fetch(req);
  };
}

suite("sync — frontend service", () => {
  test("V61.Session and V61.Sync are exposed and locked by default", () => {
    const app = freshApp();
    notNull(app.V61.Session, "V61.Session missing");
    notNull(app.V61.Sync, "V61.Sync missing");
    eq(app.V61.Sync.enabled(), false, "sync must be locked until passcode + enabled");
  });

  test("sync unlocks only with passcode AND enabled config", () => {
    const app = freshApp();
    const sc = app.V61.Sync.config();
    sc.enabled = false;
    app.V61.Sync.setPasscode(SYNC_PASS);
    eq(app.V61.Sync.enabled(), false, "enabled flag off → locked");
    sc.enabled = true;
    eq(app.V61.Sync.enabled(), true, "both on → unlocked");
    app.V61.Sync.setPasscode("");
    eq(app.V61.Sync.enabled(), false, "passcode cleared → locked");
  });

  test("merge unions by id and prefers the newer record (updatedAt then createdAt)", () => {
    const app = freshApp();
    const M = app.V61.Sync.merge;
    const base = { businesses: [
      { id: "a", name: "Old", updatedAt: 100 },
      { id: "b", name: "Local only", updatedAt: 200 },
    ], leads: [] };
    const overlay = { businesses: [
      { id: "a", name: "New", updatedAt: 300 },
      { id: "c", name: "Cloud only", createdAt: 50 },
    ], leads: [] };
    const out = M(base, overlay);
    const names = out.businesses.map((b) => b.name);
    ok(names.includes("New"), "newer duplicate must win");
    ok(names.includes("Local only"), "local-only record must survive");
    ok(names.includes("Cloud only"), "cloud-only record must survive");
    eq(out.businesses.length, 3, "no duplicate ids");
  });

  test("first sync adopts the cloud copy onto an empty device", async () => {
    const storage = fakeStorage();
    const env = workerEnv({ ALLOWED_ORIGIN: JSDOM_ORIGIN });
    const obj = new (loadWorker()).SyncObject({ storage }, env);
    const cloudDb = { businesses: [{ id: "b-c1", name: "Cloud Kitchen", phone: "0241", createdAt: 1, updatedAt: 1 }], leads: [] };
    await storage.put("db", { rev: 3, data: cloudDb, updatedAt: 10 });

    const app = freshApp();
    await settle(app);
    app.window.fetch = cloudFetch(obj, env, JSDOM_ORIGIN);
    unlock(app);
    const r = await app.V61.Sync.pullOnLoad();
    ok(r.ok && r.adopted, "should adopt the cloud copy");
    eq(app.V61.Store.db.businesses.length, 1);
    eq(app.V61.Store.db.businesses[0].name, "Cloud Kitchen");
    eq(app.V61.Sync.config().lastRev, 3);
  });

  test("first sync merges local records with the cloud copy (nothing lost)", async () => {
    const storage = fakeStorage();
    const env = workerEnv({ ALLOWED_ORIGIN: JSDOM_ORIGIN });
    const obj = new (loadWorker()).SyncObject({ storage }, env);
    const cloudDb = { businesses: [{ id: "b-c1", name: "Cloud Kitchen", updatedAt: 1 }], leads: [] };
    await storage.put("db", { rev: 5, data: cloudDb, updatedAt: 10 });

    const app = freshApp();
    await settle(app);
    app.V61.Store.addBusiness({ name: "Local Spot", phone: "0242", category: "Cafe", city: "Accra" });
    app.window.fetch = cloudFetch(obj, env, JSDOM_ORIGIN);
    unlock(app);
    await app.V61.Sync.pullOnLoad();
    const names = app.V61.Store.db.businesses.map((b) => b.name);
    ok(names.includes("Cloud Kitchen"), "cloud record present");
    ok(names.includes("Local Spot"), "local record preserved");
  });

  test("save() pushes to the cloud once sync is unlocked", async () => {
    const storage = fakeStorage();
    const env = workerEnv({ ALLOWED_ORIGIN: JSDOM_ORIGIN });
    const obj = new (loadWorker()).SyncObject({ storage }, env);
    const app = freshApp();
    await settle(app);
    app.window.fetch = cloudFetch(obj, env, JSDOM_ORIGIN);
    unlock(app);
    await new Promise((r) => setTimeout(r, 20));
    app.V61.Store.addBusiness({ name: "Push Test", phone: "0243", category: "Shop", city: "Accra" });
    app.V61.Store.save();
    let current = null;
    for (let i = 0; i < 50 && !current; i++) { await new Promise((r) => setTimeout(r, 20)); current = await storage.get("db"); }
    notNull(current, "cloud must now hold a copy");
    ok(current.rev >= 1, "a revision must exist after push");
    const names = current.data.businesses.map((b) => b.name);
    ok(names.includes("Push Test"), "pushed business must reach the cloud");
  });

  test("save() does not push while sync is locked", async () => {
    const storage = fakeStorage();
    const env = workerEnv({ ALLOWED_ORIGIN: JSDOM_ORIGIN });
    const obj = new (loadWorker()).SyncObject({ storage }, env);
    const app = freshApp();
    await settle(app);
    app.window.fetch = cloudFetch(obj, env, JSDOM_ORIGIN);
    app.V61.Store.addBusiness({ name: "No Push", phone: "0244", category: "Shop", city: "Accra" });
    await new Promise((r) => setTimeout(r, 60));
    const current = await storage.get("db");
    isNull(current, "nothing should be uploaded while locked");
  });

  test("flush reports a conflict when the cloud moved ahead of this device", async () => {
    const storage = fakeStorage();
    const env = workerEnv({ ALLOWED_ORIGIN: JSDOM_ORIGIN });
    const obj = new (loadWorker()).SyncObject({ storage }, env);
    await storage.put("db", { rev: 7, data: { businesses: [], leads: [] }, updatedAt: 1 });
    const app = freshApp();
    await settle(app);
    app.window.fetch = cloudFetch(obj, env, JSDOM_ORIGIN);
    unlock(app);
    const r = await app.V61.Sync.flush(true);
    eq(r.error, "conflict");
  });

  test("fingerprint excludes sync settings so config saves never look like data changes", () => {
    const app = freshApp();
    const before = app.V61.Sync.fingerprint();
    const sc = app.V61.Sync.config();
    sc.enabled = true;
    sc.lastRev = 99;
    sc.gatewayUrl = GW;
    eq(app.V61.Sync.fingerprint(), before, "changing sync config must not change the fingerprint");
    app.V61.Store.db.settings.profileName = "Changed";
    ok(app.V61.Sync.fingerprint() !== before, "a real data change must change the fingerprint");
  });

  test("replaceDb preserves this device's sync config while adopting cloud settings", async () => {
    const app = freshApp();
    unlock(app);
    const cloud = {
      settings: { profileName: "Christian", aiConfig: { provider: "groq", enabled: true, gatewayUrl: GW, model: "m" } },
      businesses: [{ id: "b-x", name: "X", updatedAt: 1 }],
    };
    app.V61.Sync.replaceDb(cloud);
    eq(app.V61.Store.db.settings.profileName, "Christian", "cloud settings adopted");
    ok(app.V61.Store.db.settings.sync && app.V61.Store.db.settings.sync.gatewayUrl === GW, "local sync config preserved");
  });
});

/* ─────────────── Settings panel UI ─────────────── */
suite("sync — settings panel", () => {
  test("settings render a Cloud Sync panel with security copy", () => {
    const app = freshApp();
    app.V61.Pages.settings();
    const h = app.window.document.getElementById("content").innerHTML;
    ok(h.includes("Cloud Sync"), "missing Cloud Sync panel");
    ok(h.includes("set-sync-url"), "missing gateway URL input");
    ok(h.includes("set-sync-pass"), "missing passcode input");
    ok(h.includes("set-sync-enable"), "missing enable checkbox");
    ok(h.includes("sync-now"), "missing Sync now button");
    ok(h.includes("save-sync"), "missing save/unlock button");
    ok(h.includes("Kept in memory only"), "missing in-memory passcode notice");
    assertCleanHTML(h, "settings");
  });

  test("Save & unlock with a passcode connects and enables sync", async () => {
    const storage = fakeStorage();
    const env = workerEnv({ ALLOWED_ORIGIN: JSDOM_ORIGIN });
    const obj = new (loadWorker()).SyncObject({ storage }, env);
    const app = freshApp();
    await settle(app);
    app.window.fetch = cloudFetch(obj, env, JSDOM_ORIGIN);
    app.V61.Pages.settings();
    const el0 = app.window.document.getElementById("content");
    el0.querySelector("#set-sync-url").value = GW;
    el0.querySelector("#set-sync-pass").value = SYNC_PASS;
    el0.querySelector("#set-sync-enable").checked = true;
    el0.querySelector("#save-sync").click();
    await new Promise((r) => setTimeout(r, 60));
    const sc = app.V61.Store.db.settings.sync;
    eq(sc.enabled, true);
    eq(sc.gatewayUrl, GW);
    ok(app.V61.Sync.enabled(), "sync must be unlocked after save");
  });

  test("Save & unlock without a passcode refuses to enable sync", async () => {
    const app = freshApp();
    await settle(app);
    app.window.fetch = async () => { throw new Error("must not call the network"); };
    app.V61.Pages.settings();
    const el = app.window.document.getElementById("content");
    el.querySelector("#set-sync-url").value = GW;
    el.querySelector("#set-sync-enable").checked = true;
    el.querySelector("#save-sync").click();
    await new Promise((r) => setTimeout(r, 20));
    eq(app.V61.Store.db.settings.sync.enabled, false, "must not enable without a passcode");
    eq(app.V61.Sync.enabled(), false);
  });

  test("Sync now merges the cloud copy when this device is stale", async () => {
    const storage = fakeStorage();
    const env = workerEnv({ ALLOWED_ORIGIN: JSDOM_ORIGIN });
    const obj = new (loadWorker()).SyncObject({ storage }, env);
    await storage.put("db", { rev: 2, data: { businesses: [{ id: "b-n1", name: "Phone Saved", updatedAt: 2 }], leads: [] }, updatedAt: 2 });

    const app = freshApp();
    await settle(app);
    app.V61.Store.addBusiness({ name: "Local Saved", phone: "0245", category: "Shop", city: "Accra" });
    app.window.fetch = cloudFetch(obj, env, JSDOM_ORIGIN);
    app.V61.Pages.settings();
    let el = app.window.document.getElementById("content");
    el.querySelector("#set-sync-url").value = GW;
    el.querySelector("#set-sync-pass").value = SYNC_PASS;
    el.querySelector("#set-sync-enable").checked = true;
    el.querySelector("#save-sync").click();
    await new Promise((r) => setTimeout(r, 40));
    el = app.window.document.getElementById("content");
    el.querySelector("#sync-now").click();
    await new Promise((r) => setTimeout(r, 80));
    const names = app.V61.Store.db.businesses.map((b) => b.name);
    ok(names.includes("Phone Saved"), "cloud business merged in");
    ok(names.includes("Local Saved"), "local business preserved");
  });
});

/* ─────────────── Security guarantees ─────────────── */
suite("sync — security", () => {
  test("the passcode and secret name never appear in the frontend source", () => {
    const files = [];
    files.push(path.join(ROOT, "crm", "index.html"));
    (function walk(dir) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".js")) files.push(p);
      }
    })(path.join(ROOT, "crm", "js"));
    const forbidden = ["V61_SYNC_SECRET", SYNC_PASS];
    for (const f of files) {
      const text = fs.readFileSync(f, "utf8");
      for (const tok of forbidden) ok(!text.includes(tok), f + " contains forbidden token: " + tok);
    }
  });

  test("the passcode never lands in localStorage or the database", async () => {
    const storage = fakeStorage();
    const env = workerEnv({ ALLOWED_ORIGIN: JSDOM_ORIGIN });
    const obj = new (loadWorker()).SyncObject({ storage }, env);
    const app = freshApp();
    await settle(app);
    app.window.fetch = cloudFetch(obj, env, JSDOM_ORIGIN);
    unlock(app);
    app.V61.Store.addBusiness({ name: "Secret Test", phone: "0246", category: "Shop", city: "Accra" });
    await new Promise((r) => setTimeout(r, 60));
    const persisted = app.window.localStorage.getItem(KEY);
    ok(!persisted.includes(SYNC_PASS), "passcode must not be persisted");
    ok(!("passcode" in app.V61.Store.db.settings.sync), "settings.sync must hold no passcode");
  });

  test("sync requests carry the passcode as a header, never in the body", async () => {
    let seen = null;
    const env = workerEnv({ ALLOWED_ORIGIN: JSDOM_ORIGIN });
    const obj = new (loadWorker()).SyncObject({ storage: fakeStorage() }, env);
    const app = freshApp();
    await settle(app);
    app.window.fetch = async (url, opts) => {
      if (String(url).includes("/v1/session")) {
        const token = await mintTestToken(env.V61_SHARED_SECRET, JSDOM_ORIGIN);
        return { ok: true, status: 200, json: async () => ({ ok: true, token, expiresAt: Date.now() + 900000 }) };
      }
      seen = { body: opts.body, headers: opts.headers };
      return obj.fetch(new Request(url, Object.assign({}, opts, { headers: Object.assign({}, opts.headers, { Origin: JSDOM_ORIGIN }) })));
    };
    unlock(app);
    await app.V61.Sync.flush(true);
    notNull(seen, "a sync request must have been made");
    eq(seen.headers["X-Sync-Pass"], SYNC_PASS, "passcode sent as header");
    ok(!(seen.body || "").includes(SYNC_PASS), "passcode must not appear in the body");
  });
});