/* VISION 61 CRM — app shell: router, sidebar, topbar, palette, notifications, quick add */
(function () {
  const U = () => V61.Utils;
  const S = () => V61.Store;
  const I = V61.Icons;

  const NAV = [
    { group: "Overview", items: [{ id: "dashboard", label: "Dashboard", icon: "dashboard", route: "#/dashboard" }] },
    { group: "Prospecting", items: [
      { id: "leads", label: "Leads", icon: "users", route: "#/leads" },
      { id: "discovery", label: "Lead Discovery", icon: "scan", route: "#/discovery" },
      { id: "audits", label: "Digital Audits", icon: "clipboard", route: "#/audits" },
      { id: "opportunities", label: "Opportunities", icon: "lightbulb", route: "#/opportunities" },
    ] },
    { group: "Outreach", items: [
      { id: "outreach", label: "Outreach", icon: "send", route: "#/outreach" },
      { id: "followups", label: "Follow-ups", icon: "calendar", route: "#/followups" },
    ] },
    { group: "Operations", items: [
      { id: "tasks", label: "My Tasks", icon: "checkSquare", route: "#/tasks" },
      { id: "projects", label: "Projects", icon: "briefcase", route: "#/projects" },
    ] },
    { group: "Sales", items: [
      { id: "pipeline", label: "Pipeline", icon: "columns", route: "#/pipeline" },
      { id: "proposals", label: "Proposals", icon: "fileText", route: "#/proposals" },
      { id: "clients", label: "Clients", icon: "users", route: "#/clients" },
    ] },
    { group: "Business", items: [
      { id: "services", label: "Services", icon: "package", route: "#/services" },
      { id: "invoices", label: "Invoices", icon: "credit", route: "#/invoices" },
      { id: "reports", label: "Growth Reports", icon: "gavel", route: "#/reports" },
    ] },
    { group: "System", items: [
      { id: "settings", label: "Settings", icon: "settings", route: "#/settings" },
      { id: "importexport", label: "Import / Export", icon: "upload", route: "#/importexport" },
    ] },
  ];

  const App = { theme: "dark", collapsed: false, current: "" };

  const APP_VER = "1.1";

  function logoImg() {
    return '<img class="logo" src="images/Vision 61 Logo.jpeg" alt="Vision 61 Studios logo">';
  }

  function renderShell() {
    const sidebar = document.getElementById("sidebar");
    const s = S().db.settings;
    const overdueFollowups = S().db.followups.filter((f) => f.status === "pending" && (f.dueDate || 0) < U().todayStart()).length;
    const dueTodayFollowups = S().db.followups.filter((f) => f.status === "pending" && U().dayStart(f.dueDate) === U().todayStart()).length;
    const overdueTasks = S().db.projectTasks.filter((t) => t.status !== "done" && t.dueDate && t.dueDate < U().todayStart()).length;
    const badgeCount = overdueFollowups + dueTodayFollowups + overdueTasks;

    sidebar.innerHTML =
      '<div class="brand">' + logoImg() +
      '<div class="brand-text"><span class="brand-name">VISION <b>61</b></span><span class="brand-sub">STUDIOS</span></div>' +
      '<button class="side-collapse" data-collapse title="Toggle sidebar">' + I.chevronL + "</button></div>" +
      '<nav class="nav">' + NAV.map((g) =>
        '<div class="nav-group">' + g.group + "</div>" +
        g.items.map((it) => {
          const active = App.current === it.id || (it.id === "leads" && App.current === "lead");
          let badge = 0;
          if (it.id === "followups") badge = overdueFollowups + dueTodayFollowups;
          if (it.id === "tasks") badge = S().db.projectTasks.filter((t) => t.status !== "done").length;
          if (it.id === "invoices") badge = S().db.invoices.filter(i => i.status === 'overdue').length;

          return '<a class="nav-item' + (active ? " active" : "") + '" href="' + it.route + '" data-nav="' + it.id + '">' + (I[it.icon] || I.plus) +
            "<span>" + it.label + "</span>" + (badge ? '<span class="nav-badge">' + badge + "</span>" : "") + "</a>";
        }).join("")
      ).join("") + "</nav>" +
      '<div class="side-foot"><div class="side-user"><div class="avatar">' + U().initials(s.profileName || "C") + "</div>" +
      '<div><div class="u-name">' + U().escapeHtml(s.profileName || "Christian") + '</div><div class="u-role">' + U().escapeHtml(s.company || "Vision 61 Studios") + "</div></div></div>" +
      '<div class="side-ver">v' + APP_VER + " · local-first CRM</div></div>";

    const topbar = document.getElementById("topbar");
    topbar.innerHTML =
      '<button class="burger" data-burger title="Menu">' + I.menu + "</button>" +
      '<div class="search-trigger" data-palette>' + I.search + "<span>Search...</span><span class='kbd'>Ctrl K</span></div>" +
      '<div class="topbar-actions">' +
      '<button class="icon-btn mob-hide" data-palette title="Search (Ctrl K)">' + I.search + "</button>" +
      '<button class="icon-btn narrow-hide" data-quick title="Quick add (N)">' + I.plus + "</button>" +
      '<button class="icon-btn" data-theme title="Toggle theme">' + (App.theme === "dark" ? I.moon : I.sun) + "</button>" +
      '<button class="icon-btn" data-notif title="Notifications">' + I.bell + (badgeCount ? '<span class="dot"></span>' : "") + "</button>" +
      '<button class="icon-btn narrow-hide" data-user title="Profile">' + I.users + "</button></div>";

    sidebar.querySelectorAll("[data-nav]").forEach((a) => a.addEventListener("click", (e) => {
      closeDrawer();
      const id = a.dataset.nav;
      if (App.current === id || (id === "leads" && App.current === "lead")) e.preventDefault();
    }));
    const cc = sidebar.querySelector("[data-collapse]");
    if (cc) cc.addEventListener("click", () => toggleCollapse());
    document.querySelectorAll("[data-burger]").forEach((b) => b.addEventListener("click", () => {
      const sb = document.getElementById("sidebar");
      const bd = document.getElementById("sidebarBackdrop");
      sb.classList.toggle("open"); bd.classList.toggle("show");
    }));
    document.getElementById("sidebarBackdrop").addEventListener("click", closeDrawer);
    document.querySelectorAll("[data-palette]").forEach((b) => b.addEventListener("click", openPalette));
    const themeBtn = document.querySelector(".topbar [data-theme]");
    if (themeBtn) themeBtn.addEventListener("click", () => setTheme(App.theme === "dark" ? "light" : "dark"));
    document.querySelector("[data-notif]").addEventListener("click", (e) => { e.stopPropagation(); toggleNotifications(e.currentTarget); });
    document.querySelector("[data-quick]").addEventListener("click", (e) => openQuickAdd(e.currentTarget));
    document.querySelector("[data-user]").addEventListener("click", (e) => openUserMenu(e.currentTarget));

    const fab = document.getElementById("fab");
    if (fab) {
      fab.innerHTML = '<button class="fab" title="Quick add (N)">' + I.plus + "</button>";
      fab.querySelector(".fab").addEventListener("click", (e) => openQuickAdd(e.currentTarget));
    }
  }

  function closeDrawer() {
    document.getElementById("sidebar").classList.remove("open");
    document.getElementById("sidebarBackdrop").classList.remove("show");
  }

  function toggleCollapse() {
    App.collapsed = !App.collapsed;
    document.documentElement.dataset.collapsed = App.collapsed ? "true" : "false";
    S().db.settings.sidebarCollapsed = App.collapsed;
    S().persist();
  }

  function setTheme(t) {
    App.theme = t;
    document.documentElement.dataset.theme = t;
    document.querySelector("meta[name=theme-color]").setAttribute("content", t === "dark" ? "#0d0d0f" : "#f4f4f6");
    S().db.settings.theme = t;
    S().persist();
    if (App.current === "settings") V61.Pages.settings();
  }

  /* ═══ Router ═══ */
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, "");
    const parts = h.split("/");
    const route = parts[0] || "dashboard";
    const id = parts[1] || null;
    return { route, id };
  }

  function renderRoute() {
    const { route, id } = parseHash();
    App.current = route;
    document.querySelectorAll(".nav-item").forEach((n) => n.classList.toggle("active", n.dataset.nav === route || (route === "lead" && n.dataset.nav === "leads")));
    document.getElementById("content").scrollTop = 0;
    const P = V61.Pages;
    const routes = {
      dashboard: P.dashboard, leads: P.leads.render, discovery: P.discovery, audits: P.audits,
      opportunities: P.opportunities, outreach: P.outreach, followups: P.followups, tasks: P.tasks,
      pipeline: P.pipeline, proposals: P.proposals, services: P.services, clients: P.clients,
      clientDetail: P.clientDetail, projects: P.projects, projectDetail: P.projectDetail,
      invoices: P.invoices, analytics: P.analytics, reports: P.reports, settings: P.settings, importexport: P.importexport,
    };
    if (route === "leads" && id) { P.leads.openLead(id); return; }
    if (route === "lead" && id) { P.leads.openLead(id); return; }
    if (route === "audits" && id) { P.auditDetail(id); return; }
    if (route === "proposals" && id) { P.sales.proposalDetail(id); return; }
    if (route === "proposal" && id) { P.sales.proposalDetail(id); return; }
    if (route === "clients" && id) { P.clientDetail(id); return; }
    if (route === "client" && id) { P.clientDetail(id); return; }
    if (route === "projects" && id) { P.projectDetail(id); return; }
    if (route === "projects") { P.projects(); return; }
    if (route === "tasks") { P.tasks(); return; }
    if (route === "invoices") { P.invoices(); return; }
    if (route === "reports") { P.reports(); return; }
    if (routes[route]) { routes[route](); return; }
    V61.V61.App.nav("#/dashboard");
  }

  function nav(hash) {
    if (location.hash === hash) renderRoute(); else location.hash = hash;
  }

  V61.Cmd = V61.Cmd || {};
  V61.Cmd.go = (route) => V61.App.nav(route);
  V61.Cmd.goLead = (id) => V61.App.nav("#/leads/" + id);

  /* ═══ Global search / palette ═══ */
  function openPalette() {
    const existing = document.querySelector(".palette-overlay");
    if (existing) existing.remove();
    const root = document.getElementById("paletteRoot");
    const overlay = document.createElement("div");
    overlay.className = "palette-overlay";
    overlay.innerHTML = '<div class="palette"><div class="palette-search">' + I.search +
      '<input id="palette-input" placeholder="Search leads, contacts, notes, tasks, proposals..." autocomplete="off">' +
      '<button class="icon-btn" data-pal-close>' + I.x + "</button></div><div class='palette-results' id='palette-results'></div></div>";
    root.appendChild(overlay);
    const input = overlay.querySelector("#palette-input");
    const results = overlay.querySelector("#palette-results");
    let sel = -1;
    function resultsHtml(q) {
      const s = S();
      const items = [];
      const push = (group, icon, title, sub, action) => items.push({ group, icon, title, sub, action });
      if (!q) {
        push("Actions", "plus", "Add lead", "Open the new lead form", () => V61.Cmd.addLead());
        push("Actions", "scan", "Lead Discovery", "Import or find businesses", () => V61.App.nav("#/discovery"));
        push("Actions", "clipboard", "Run a digital audit", "Score a lead's online presence", () => V61.App.nav("#/audits"));
        push("Actions", "calendar", "Follow-ups", S().db.followups.filter((f) => f.status === "pending").length + " pending", () => V61.App.nav("#/followups"));
        push("Actions", "columns", "Pipeline", "Drag leads through stages", () => V61.App.nav("#/pipeline"));
      } else {
        const ql = q.toLowerCase();
        s.leadRows().filter((r) => {
          const b = r.business || {};
          return [b.name, b.category, b.city, b.phone, b.email].filter(Boolean).some((f) => String(f).toLowerCase().includes(ql));
        }).slice(0, 6).forEach((r) => push("Businesses", "briefcase", r.business.name, r.business.category + " · " + (r.business.city || ""), () => V61.App.nav("#/leads/" + r.lead.id)));
        s.db.contacts.filter((c) => [c.name, c.role, c.phone, c.email].filter(Boolean).some((f) => String(f).toLowerCase().includes(ql))).slice(0, 4).forEach((c) => {
          const lead = s.leadOf(c.businessId);
          push("Contacts", "users", c.name, c.role || "Contact", () => lead && V61.App.nav("#/leads/" + lead.id));
        });
        s.db.notes.filter((n) => n.content.toLowerCase().includes(ql)).slice(0, 4).forEach((n) => {
          const lead = s.byId("leads", n.leadId); const biz = lead ? s.businessOf(lead) : null;
          push("Notes", "pencil", n.content.slice(0, 60), biz ? biz.name : "", () => lead && V61.App.nav("#/leads/" + lead.id));
        });
        s.db.tasks.filter((t) => t.title.toLowerCase().includes(ql) && t.status !== "done").slice(0, 4).forEach((t) => {
          const lead = s.byId("leads", t.leadId);
          push("Tasks", "checkSquare", t.title, lead ? s.businessOf(lead).name : "", () => lead && V61.App.nav("#/leads/" + lead.id));
        });
        s.db.proposals.filter((p) => (p.title || "").toLowerCase().includes(ql)).slice(0, 3).forEach((p) => push("Proposals", "fileText", p.title, U().formatMoney(p.total), () => V61.App.nav("#/proposals/" + p.id)));
        s.db.clients.filter((cl) => { const b = s.businessOf({ businessId: cl.businessId }); return b && b.name.toLowerCase().includes(ql); }).slice(0, 3).forEach((cl) => {
          const b = s.businessOf({ businessId: cl.businessId });
          push("Clients", "briefcase", b.name, "Client since " + U().formatDate(cl.createdAt), () => V61.App.nav("#/clients/" + cl.id));
        });
      }
      if (!items.length) results.innerHTML = '<div class="palette-empty">No results for "' + U().escapeHtml(q) + '"</div>';
      else {
        let html = "", lastGroup = "";
        items.forEach((it, i) => {
          if (it.group !== lastGroup) { html += '<div class="palette-group">' + it.group + "</div>"; lastGroup = it.group; }
          html += '<div class="palette-item" data-i="' + i + '"><div class="p-icon">' + (I[it.icon] || I.search) + '</div><div><div class="p-title">' + U().escapeHtml(it.title) + '</div><div class="p-sub">' + U().escapeHtml(it.sub || "") + "</div></div></div>";
        });
        results.innerHTML = html;
        results.querySelectorAll(".palette-item").forEach((el2, i) => el2.addEventListener("click", () => { items[i].action(); overlay.remove(); }));
        results.querySelectorAll(".palette-item").forEach((el2) => {
          el2.addEventListener("mouseenter", () => {
            sel = Number(el2.dataset.i);
            results.querySelectorAll(".palette-item").forEach((x, i) => x.classList.toggle("sel", i === sel));
          });
        });
      }
    }
    function keynav() {
      const els = results.querySelectorAll(".palette-item");
      if (els.length) { els.forEach((x, i) => x.classList.toggle("sel", i === sel)); if (sel >= 0) els[sel].scrollIntoView({ block: "nearest" }); }
    }
    input.addEventListener("input", () => { sel = -1; resultsHtml(input.value); });
    input.addEventListener("keydown", (e) => {
      const els = results.querySelectorAll(".palette-item");
      if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(sel + 1, els.length - 1); keynav(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(sel - 1, 0); keynav(); }
      else if (e.key === "Enter") { if (sel >= 0) els[sel].click(); }
    });
    function closePal(e) { if (e.key === "Escape") overlay.remove(); }
    document.addEventListener("keydown", closePal);
    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector("[data-pal-close]").addEventListener("click", () => overlay.remove());
    setTimeout(() => input.focus(), 10);
    resultsHtml("");
  }

  /* ═══ Quick add menu (N) ═══ */
  function openQuickAdd(anchor) {
    V61.UI.menuPop(anchor, [
      { label: "Quick add" },
      { text: "Add lead", icon: I.users, action: () => V61.Cmd.addLead() },
      { text: "Add contact", icon: I.users, action: () => { V61.Toast.warn("Open a lead first to add a contact"); } },
      { text: "Add task", icon: I.checkSquare, action: () => { V61.Toast.warn("Open a lead first to add a task"); } },
      { text: "Add note", icon: I.pencil, action: () => { V61.Toast.warn("Open a lead first to add a note"); } },
      { text: "Create proposal", icon: I.fileText, action: () => { V61.Toast.warn("Open a lead first to create a proposal"); } },
      { sep: true },
      { text: "Export leads CSV", icon: I.download, action: () => S().exportLeadsCSV() },
      { text: "Settings", icon: I.settings, action: () => V61.App.nav("#/settings") },
    ]);
  }

  function openUserMenu(anchor) {
    V61.UI.menuPop(anchor, [
      { label: S().db.settings.profileName || "User" },
      { text: "Settings", icon: I.settings, action: () => V61.App.nav("#/settings") },
      { text: "Export leads", icon: I.download, action: () => S().exportLeadsCSV() },
      { sep: true },
      { text: "Toggle theme", icon: App.theme === "dark" ? I.moon : I.sun, action: () => setTheme(App.theme === "dark" ? "light" : "dark") },
    ]);
  }

  /* ═══ Notifications ═══ */
  function notifications() {
    const list = [];
    const s = S();
    const now = U().now(), today = U().todayStart();
    s.db.followups.filter((f) => f.status === "pending").forEach((f) => {
      const lead = s.byId("leads", f.leadId); const biz = lead ? s.businessOf(lead) : null;
      const name = biz ? biz.name : "A lead";
      if (f.dueDate < today) list.push({ icon: "calendar", title: "Follow-up overdue: " + f.title, sub: name + " · " + U().relativeDue(f.dueDate), danger: true, action: () => lead && V61.App.nav("#/leads/" + lead.id) });
      else if (U().dayStart(f.dueDate) === today) list.push({ icon: "calendar", title: "Follow-up due today: " + f.title, sub: name, action: () => lead && V61.App.nav("#/leads/" + lead.id) });
    });
    s.db.projectTasks.filter((t) => t.status !== "done" && t.dueDate && t.dueDate < today).forEach((t) => {
      const p = s.projectOf(t.projectId);
      const cl = p ? s.clientById(p.clientId) : null;
      const biz = cl ? s.businessOf({ businessId: cl.businessId }) : null;
      list.push({ icon: "checkSquare", title: "Overdue task: " + t.title, sub: (biz ? biz.name : "No project"), danger: true, action: () => p && V61.App.nav("#/projects/" + p.id) });
    });
    s.db.invoices.filter(i => i.status === 'overdue').forEach(i => {
      const cl = s.clientById(i.clientId);
      const biz = cl ? s.businessOf({ businessId: cl.businessId }) : null;
      list.push({ icon: "credit", title: "Overdue invoice: #" + i.invoiceNumber, sub: (biz ? biz.name : ""), danger: true, action: () => V61.App.nav("#/invoices") });
    });
    s.db.proposals.filter((p) => p.status === "accepted" && p.notifiedAccepted !== true).slice(0, 5).forEach((p) => {
      const lead = s.byId("leads", p.leadId); const biz = lead ? s.businessOf(lead) : null;
      list.push({ icon: "trophy", title: "Proposal accepted: " + (p.title || "Proposal"), sub: (biz ? biz.name + " · " : "") + U().formatMoney(p.total), action: () => V61.App.nav("#/proposals/" + p.id) });
      p.notifiedAccepted = true;
    });
    s.db.clients.slice(0, 2).forEach((c) => {
      const b = s.businessOf({ businessId: c.businessId });
      if (c.createdAt > now - 2 * 86400000) list.push({ icon: "trophy", title: "Deal won: " + (b ? b.name : ""), sub: "Converted to client", action: () => V61.App.nav("#/clients/" + c.id) });
    });
    if (list.length) s.persist();
    return list;
  }

  function toggleNotifications(anchor) {
    const existing = document.querySelector(".notif-pop");
    if (existing) { existing.remove(); return; }
    const list = notifications();
    const el = document.createElement("div");
    el.className = "notif-pop";
    el.innerHTML = '<div class="n-head"><span>Notifications</span><button class="icon-btn" data-nclose>' + I.x + "</button></div>" +
      '<div class="n-body">' + (list.length ? list.map((n) =>
        '<div class="notif-item" data-n=""><div class="n-icon" style="' + (n.danger ? "background:rgba(229,72,77,.13);color:#e5484d" : "") + '">' + (I[n.icon] || I.bell) + '</div><div><div class="n-title">' + U().escapeHtml(n.title) + '</div><div class="n-time">' + U().escapeHtml(n.sub || "") + "</div></div></div>"
      ).join("") : '<div style="padding:26px;text-align:center;color:var(--text-3);font-size:13px">You&#39;re all caught up.</div>') + "</div>";
    document.body.appendChild(el);
    const rect = anchor.getBoundingClientRect();
    el.style.right = (window.innerWidth - rect.right) + "px";
    el.style.top = "calc(var(--topbar-h) + 8px)";
    el.querySelector("[data-nclose]").addEventListener("click", () => el.remove());
    el.querySelectorAll(".notif-item").forEach((n, i) => n.addEventListener("click", () => { const a = list[i] && list[i].action; if (a) a(); el.remove(); }));
    document.addEventListener("mousedown", function h(e) { if (!el.contains(e.target)) { el.remove(); document.removeEventListener("mousedown", h); } });
  }

  /* ═══ Keyboard shortcuts ═══ */
  function shortcuts() {
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const overlay = document.querySelector(".palette-overlay") || document.querySelector(".modal-overlay") || document.querySelector(".menu-pop") || document.querySelector(".notif-pop");
        if (overlay) { overlay.remove(); return; }
        closeDrawer();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); return; }
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement && document.activeElement.tagName);
      if (!typing && e.key.toLowerCase() === "n") {
        e.preventDefault();
        const qa = document.querySelector("[data-quick]");
        openQuickAdd(qa || document.querySelector("[data-user]") || document.querySelector(".search-trigger"));
      }
    });
  }

  /* ═══ Init ═══ */
  function init() {
    S().load();
    S().seedOfficialCatalog();
    const s = S().db.settings;
    App.theme = s.theme || "dark";
    App.collapsed = !!s.sidebarCollapsed;
    document.documentElement.dataset.theme = App.theme;
    document.documentElement.dataset.collapsed = App.collapsed ? "true" : "false";
    if (!location.hash) history.replaceState(null, "", "#/dashboard");
    renderShell();
    renderRoute();
    window.addEventListener("hashchange", renderRoute);
    S().on(() => { renderShell(); });
    shortcuts();
    V61.Toast.show("Vision 61 CRM ready");
    maybeBackupReminder();
  }

  /* Remind the user to download a backup JSON at most once a week. The CRM
     is browser-only, so a cleared browser means lost data. Only nudges when
     there is data worth backing up. */
  function maybeBackupReminder() {
    const s = S().db.settings;
    const last = s.lastBackupAt || 0;
    if (last && U().now() - last < 7 * 86400000) return;
    if (!S().db.leads.length && !S().db.clients.length) return;
    setTimeout(() => {
      const m = V61.UI.openModal({ title: "Back up your data", icon: I.download });
      m.setBody('<div style="font-size:13px;color:var(--text-2);line-height:1.7">Your CRM data is stored in <b style="color:var(--text)">this browser only</b>. A backup is a single JSON file you can keep anywhere and restore later if your browser data is cleared or lost.<br><br><b style="color:var(--warn)">No backup was downloaded in the last 7 days.</b></div>');
      m.setFoot('<button class="btn" data-skip>Not now</button><button class="btn btn-primary" data-backup>' + I.download + " Back up now</button>");
      m.q("[data-backup]").addEventListener("click", () => {
        const st = S().db.settings;
        st.lastBackupAt = U().now();
        S().save();
        U().download("vision61-crm-backup-" + new Date().toISOString().slice(0, 10) + ".json", JSON.stringify(S().db, null, 2), "application/json");
        V61.Toast.success("Backup downloaded");
        m.close();
      });
      m.q("[data-skip]").addEventListener("click", () => m.close());
    }, 1500);
  }

  document.addEventListener("DOMContentLoaded", init);

  V61.App = { nav, renderRoute, renderShell, setTheme, init, theme: App.theme, collapsed: App.collapsed, openPalette };
})();