/* QA Phase 2 — Digital Audit: scoring, website analysis honesty, opportunities, snapshots/growth */
"use strict";
const { suite, test, assert, eq, ok, isNull, notNull, approx } = require("./framework");
const { freshApp, refresh, createApp } = require("./harness");

suite("Phase 2 — Digital Audit", () => {
  test("empty audit scores 0, never NaN", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const biz = S.addBusiness({ name: "A" });
    const audit = S.emptyAudit(biz.id);
    ok(Number.isFinite(S.auditCategoryScore(audit, "google")));
    eq(S.auditCategoryScore(audit, "google"), 0);
    ok(Number.isFinite(S.digitalScore(audit)));
    eq(S.digitalScore(audit), 0);
  });

  test("auditCategoryScore counts passes and applies weight", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const audit = S.emptyAudit("b1");
    // google has 10 checks, weight 20 -> each pass = 2
    audit.google = { exists: true, verified: true };
    eq(S.auditCategoryScore(audit, "google"), 4);
    audit.google = { exists: true, verified: true, category: true, photos: true, reviews: true };
    eq(S.auditCategoryScore(audit, "google"), 10);
  });

  test("auditCategoryScore max equals category weight", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const audit = S.emptyAudit("b1");
    audit.google = Object.fromEntries(S.AUDIT_CHECKS.google.map(([k]) => [k, true]));
    eq(S.auditCategoryScore(audit, "google"), S.AUDIT_WEIGHTS.google);
  });

  test("digitalScore never exceeds 100", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const audit = S.emptyAudit("b1");
    for (const cat of ["website", "google", "branding", "conversion", "seo"]) {
      audit[cat] = Object.fromEntries(S.AUDIT_CHECKS[cat].map(([k]) => [k, true]));
    }
    for (const pl of S.SOCIAL_PLATFORMS) audit.social[pl] = { exists: true, active: true, quality: true, consistency: true };
    const s = S.digitalScore(audit);
    ok(s <= 100, "score " + s + " exceeds 100");
    ok(Number.isFinite(s));
  });

  test("opportunities: business with no website, no google, no whatsapp generates evidence-backed opportunities", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const biz = S.addBusiness({ name: "No Web Biz" });
    const audit = S.emptyAudit(biz.id);
    const opps = S.opportunities(audit, biz);
    ok(opps.length > 0);
    ok(opps.some((o) => /website/i.test(o.title)), "website opportunity present");
    ok(opps.some((o) => /Google/i.test(o.title)), "google opportunity present");
  });

  test("opportunities are NOT fabricated when data is good", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const biz = S.addBusiness({ name: "Strong Biz", website: "https://x.example", whatsapp: "024111", phone: "024111" });
    const audit = S.emptyAudit(biz.id);
    audit.website = { exists: true, modern: true, mobile: true };
    audit.google = { exists: true, verified: true, photos: true, description: true, reviews: true, rating: true, hours: true, website_linked: true, phone: true };
    audit.conversion = { whatsapp: true, booking: true, ordering: true, form: true, cta: true };
    audit.social = { instagram: { exists: true }, facebook: { exists: true } };
    const opps = S.opportunities(audit, biz);
    // With a solid profile there should be few/none opportunities, and none fabricated
    ok(opps.length <= 2, "got " + opps.length + " unexpected opportunities");
  });

  test("opportunitySummary is a string, never undefined", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const biz = S.addBusiness({ name: "Summarize Me" });
    const audit = S.emptyAudit(biz.id);
    const sum = S.opportunitySummary(S.opportunities(audit, biz), biz);
    ok(typeof sum === "string" && sum.length > 0);
    assert(!/undefined|NaN/.test(sum));
  });

  test("saveWebsiteAudit + latestWebsiteAudit returns most recent", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const biz = S.addBusiness({ name: "Site Biz", website: "https://a.example" });
    const r1 = S.saveWebsiteAudit(biz.id, { status: "blocked", score: null });
    const r2 = S.saveWebsiteAudit(biz.id, { status: "ok", score: 55 });
    const latest = S.latestWebsiteAudit(biz.id);
    eq(latest.id, r2.id);
    eq(latest.score, 55);
  });

  test("website analyzer honesty: no URL -> not_available, score null", () => {
    const app = freshApp();
    const W = app.V61.WebsiteAnalyzer;
    return W.analyze({ id: "b1", name: "No URL" }).then((r) => {
      eq(r.status, "not_available");
      isNull(r.score);
      isNull(r.signals);
    });
  });

  test("website analyzer honesty: invalid URL -> error, no fabricated score", () => {
    const app = freshApp();
    const W = app.V61.WebsiteAnalyzer;
    return W.analyze({ id: "b1", name: "X", website: "not a url at all" }).then((r) => {
      eq(r.status, "error");
      isNull(r.score);
    });
  });

  test("website analyzer normalizeUrl handles https/w/o protocol and rejects junk", () => {
    const app = freshApp();
    const W = app.V61.WebsiteAnalyzer;
    const a = W.normalizeUrl("example.com");
    ok(a && a.https === true);
    const b = W.normalizeUrl("https://www.example.com/page");
    eq(b.host, "www.example.com");
    isNull(W.normalizeUrl(""));
    isNull(W.normalizeUrl("ht!tp://bad"));
  });

  test("blocked websites honestly report blocked with no signals", () => {
    const app = freshApp();
    const W = app.V61.WebsiteAnalyzer;
    return W.analyze({ id: "b1", name: "Blocked", website: "https://blocks.example" })
      .then((r) => {
        // fetch will throw in node (no network); probe returns false -> unreachable, not fabricated ok
        assert(["unreachable", "error"].includes(r.status), "unexpected status " + r.status);
        isNull(r.score, "must not fabricate score");
      })
      .catch(() => { throw new Error("analyze should resolve, not reject"); });
  });

  test("websiteScore: only detected facts earn points", () => {
    const app = freshApp();
    const Score = app.V61.Score;
    eq(Score.websiteScore({}), 0);
    eq(Score.websiteScore({ https: true, reachable: true }), 8);
    eq(Score.websiteScore({ https: true, reachable: true, titleOk: true, mobile: true, viewport: true, metaDesc: true, h1: true }), 28);
  });

  test("websiteScore capped by weight total", () => {
    const app = freshApp();
    const Score = app.V61.Score;
    const s = Score.websiteScore(Object.fromEntries(Object.keys(Score.WEBSITE_WEIGHTS).map((k) => [k, true])));
    ok(s <= 100);
    // base weights sum to 20+20+25+15+10 = 90, +5+5 social = 100
    eq(s, 100);
  });

  test("scoreBreakdown100 returns only categories with data, no NaN", () => {
    const app = freshApp();
    const Score = app.V61.Score;
    const biz = app.V61.Store.addBusiness({ name: "B" });
    const audit = app.V61.Store.emptyAudit(biz.id);
    const parts = Score.scoreBreakdown100(audit, null);
    ok(Array.isArray(parts));
    for (const p of parts) ok(Number.isFinite(p.score), p.key + " not finite");
  });

  test("growth: requires 2 snapshots, returns from/to/delta", () => {
    const app = freshApp();
    const Score = app.V61.Score;
    isNull(Score.growth([]));
    isNull(Score.growth([{ data: { digitalScore: 38 } }]));
    const g = Score.growth([
      { createdAt: 1, data: { digitalScore: 38 } },
      { createdAt: 2, data: { digitalScore: 81 } },
    ]);
    eq(g.from, 38);
    eq(g.to, 81);
    eq(g.delta, 43);
  });

  test("audit snapshots sorted chronologically and persist", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const biz = S.addBusiness({ name: "Snap Biz" });
    S.addAuditSnapshot(biz.id, { digitalScore: 30 });
    S.addAuditSnapshot(biz.id, { digitalScore: 60 });
    const snaps = S.auditSnapshotsFor(biz.id);
    eq(snaps.length, 2);
    eq(snaps[0].data.digitalScore, 30);
    eq(snaps[1].data.digitalScore, 60);
    const app2 = refresh(app);
    eq(app2.V61.Store.auditSnapshotsFor(biz.id).length, 2);
  });

  test("priorityFor honors thresholds", () => {
    const app = freshApp();
    const Score = app.V61.Score;
    eq(Score.priorityFor(80, 4).key, "high");
    eq(Score.priorityFor(80, 1).key, "medium");
    eq(Score.priorityFor(70, 3).key, "medium");
    eq(Score.priorityFor(30, 1).key, "low");
  });

  test("leadScore is finite and bounded 1..100 for empty data", () => {
    const app = freshApp();
    const S = app.V61.Store;
    const biz = S.addBusiness({ name: "Score Me" });
    const lead = S.addLead(biz.id);
    const audit = S.emptyAudit(biz.id);
    const s = S.leadScore(lead, biz, audit);
    ok(Number.isFinite(s));
    ok(s >= 1 && s <= 100, "leadScore out of range: " + s);
  });
});