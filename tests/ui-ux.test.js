/* QA — UI/UX regression: command navigation, task actions, toast API,
   and a dead-button sweep across every rendered page. */
"use strict";
const { suite, test, eq, ok, notNull } = require("./framework");
const { freshApp, settle } = require("./harness");

function clickEl(w, el) {
  el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
}

/* Seed every module with realistic data so each page renders full content. */
function setupRich(app) {
  const S = app.V61.Store;
  const U = app.V61.Utils;
  const biz = S.addBusiness({ name: "Aroma Coffee House", category: "restaurant", city: "Accra", phone: "024 000 0000", website: "aromagh.com" });
  const lead = S.addLead(biz.id, { firstName: "Ama", lastName: "Mensah" });
  S.db.contacts.push({ id: "c1", leadId: lead.id, firstName: "Kofi", lastName: "Boateng", phone: "020 111 2222", email: "kofi@b.co" });
  S.db.audits.push({ id: "a1", leadId: lead.id, businessId: biz.id, category: "restaurant", date: U.now(), score: 62, items: {}, createdAt: U.now() });
  const cl = S.ensureClient(lead);
  const proj = S.addProject(cl.id, { name: "Website Refresh" });
  const pt = S.addProjectTask(proj.id, { title: "Design homepage", priority: "high" });
  S.db.tasks.push({ id: "lt1", leadId: lead.id, title: "Call gatekeeper", priority: "medium", status: "todo" });
  S.db.followups.push({ id: "f1", leadId: lead.id, dueDate: U.now(), status: "pending", note: "Call", createdAt: U.now() });
  S.db.proposals.push({ id: "p1", leadId: lead.id, businessId: biz.id, title: "Branding Package", amount: 1800, status: "draft", createdAt: U.now() });
  S.db.invoices.push({ id: "i1", clientId: cl.id, number: "INV-001", amount: 1200, status: "sent", createdAt: U.now() });
  S.db.payments.push({ id: "pm1", invoiceId: "i1", amount: 500, date: U.now(), method: "Cash" });
  S.db.meetings.push({ id: "m1", leadId: lead.id, title: "Kickoff", when: U.now() + 86400000, notes: "" });
  S.db.milestones.push({ id: "ms1", projectId: proj.id, title: "M1", dueDate: U.now() + 86400000 * 3 });
  S.save();
  return { S, biz, lead, cl, proj, pt };
}

const ALL_ROUTES = ["dashboard", "leads", "discovery", "audits", "opportunities", "outreach", "followups", "tasks", "pipeline", "proposals", "services", "clients", "projects", "invoices", "reports", "settings", "importexport"];

function renderPage(app, route) {
  const P = app.V61.Pages;
  const fn = typeof P[route] === "function" ? P[route] : (P[route] && P[route].render);
  if (!fn) throw new Error("no renderer for route " + route);
  fn();
}

suite("UI/UX — command wiring", () => {
  test("V61.Toast.info exists and shows a toast", () => {
    const app = freshApp();
    app.V61.Toast.info("just a note");
    const t = app.window.document.querySelector("#toastRoot .toast");
    notNull(t, "toast rendered");
    ok(String(t.textContent).indexOf("just a note") >= 0, "message shown");
  });

  test("command palette navigation works (App.nav resolves)", async () => {
    const app = freshApp();
    await settle(app);
    const w = app.window;
    w.V61.Pages.dashboard();
    const go = w.document.querySelector('[data-cmd="go:#/discovery"]');
    notNull(go, "dashboard quick-action present");
    clickEl(w, go);
    await new Promise((r) => setTimeout(r, 15));
    eq(w.location.hash, "#/discovery", "navigated to discovery");
    ok(w.document.getElementById("content").innerHTML.indexOf("Lead Discovery") >= 0, "discovery page rendered");
  });

  test("editTask opens the edit modal and saves changes", async () => {
    const app = freshApp();
    await settle(app);
    const { S, pt } = setupRich(app);
    const w = app.window;
    w.V61.Pages.tasks();
    const pencil = w.document.querySelector('[data-cmd="editTask:' + pt.id + '"]');
    notNull(pencil, "tasks page renders the edit pencil");
    clickEl(w, pencil);
    const modal = w.document.querySelector("#modalRoot .modal");
    notNull(modal, "edit modal opened");
    const title = modal.querySelector("#t-title");
    notNull(title, "title field present");
    ok(String(title.value).indexOf("Design homepage") >= 0, "pre-filled with current title");
    title.value = "Design homepage + SEO";
    clickEl(w, modal.querySelector("[data-save]"));
    await new Promise((r) => setTimeout(r, 10));
    eq(S.projectTaskOf(pt.id).title, "Design homepage + SEO", "title updated");
  });

  test("completeTask works on project tasks and updates progress", async () => {
    const app = freshApp();
    await settle(app);
    const { S, proj, pt } = setupRich(app);
    eq(S.projectTaskOf(pt.id).status, "todo");
    app.V61.Cmd.completeTask(pt.id);
    eq(S.projectTaskOf(pt.id).status, "done", "project task completed");
    eq(S.projectOf(proj.id).progress, 100, "project progress recalculated");
  });

  test("no rendered data-cmd button is left without a handler", async () => {
    const app = freshApp();
    await settle(app);
    setupRich(app);
    const w = app.window;
    const missing = {};
    for (const route of ALL_ROUTES) {
      renderPage(app, route);
      w.document.querySelectorAll("[data-cmd]").forEach((b) => {
        const base = b.getAttribute("data-cmd").split(":")[0];
        if (!w.V61.Cmd[base]) missing[route] = (missing[route] || []).concat(base);
      });
    }
    ok(Object.keys(missing).length === 0, "dead buttons: " + JSON.stringify(missing));
  });

  test("every rendered data-cmd button clicks without throwing", async () => {
    const app = freshApp();
    await settle(app);
    setupRich(app);
    const w = app.window;
    const errors = [];
    w.addEventListener("error", (e) => errors.push(e.message));
    let clicked = 0;
    for (const route of ALL_ROUTES) {
      renderPage(app, route);
      w.document.querySelectorAll("[data-cmd]").forEach((b) => {
        const base = b.getAttribute("data-cmd").split(":")[0];
        if (!w.V61.Cmd[base]) return;
        try { clickEl(w, b); clicked++; }
        catch (e) { errors.push(route + " " + b.getAttribute("data-cmd") + " -> " + e.message); }
      });
    }
    ok(clicked > 0, "buttons exercised: " + clicked);
    ok(errors.length === 0, "click errors: " + errors.slice(0, 5).join(" | "));
  });
});