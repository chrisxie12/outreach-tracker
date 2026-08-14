/* VISION 61 CRM — Projects: dashboard, delivery, tasks, milestones */
window.V61 = window.V61 || {};
V61.Pages = V61.Pages || {};

(function () {
  const U = () => V61.Utils;
  const S = () => V61.Store;
  const I = V61.Icons;
  const UI = V61.UI;

  /* ── PROJECT LIST ── */
  function renderProjects() {
    const el = document.getElementById("content");
    const projs = S().db.projects.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    el.innerHTML =
      '<div class="page-head"><div><div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.14em">Operations</div>' +
      '<h1 class="page-title">Active Projects</h1><p class="page-sub">' + projs.filter(p => !["completed", "cancelled"].includes(p.status)).length + " in progress</p></div>" +
      '<div class="page-actions"><button class="btn btn-primary" data-cmd="addProjectModal">' + I.plus + " Start Project</button></div></div>" +

      (projs.length ? '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:18px">' +
        projs.map((p) => {
          const biz = S().clientBusiness(p.clientId);
          const st = S().projectStatusOf(p.status);
          const tasks = S().projectTasksFor(p.id);
          const done = tasks.filter(t => t.status === 'done').length;
          return '<div class="card project-card" style="display:flex;flex-direction:column;gap:12px;cursor:pointer" onclick="location.hash=\'#/projects/' + p.id + '\'">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start">' +
              '<div><div style="font-size:11px;color:var(--text-3);font-weight:700;text-transform:uppercase">' + U().escapeHtml(biz ? biz.name : "Deleted client") + '</div>' +
              '<div style="font-weight:700;font-size:16px;margin-top:2px">' + U().escapeHtml(p.name) + '</div></div>' +
              UI.badge(st.label, st.color, true) +
            '</div>' +
            '<div style="flex:1;font-size:13px;color:var(--text-3);line-height:1.5">' + U().escapeHtml(p.description || "No description provided.") + '</div>' +
            '<div>' +
              '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px"><span>Progress</span><b>' + p.progress + '%</b></div>' +
              '<div class="score-bar"><i style="width:' + p.progress + '%;background:' + st.color + '"></i></div>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--text-3);padding-top:8px;border-top:1px solid var(--border)">' +
              '<span>' + I.checkSquare + ' ' + done + '/' + tasks.length + ' tasks</span>' +
              '<span>Due ' + (p.dueDate ? U().formatDate(p.dueDate) : '—') + '</span>' +
            '</div>' +
          '</div>';
        }).join("") + "</div>" : UI.emptyState("briefcase", "No projects yet.", "Start your first project to begin delivering services.", '<button class="btn btn-primary" data-cmd="addProjectModal">' + I.plus + " Start Project</button>"));
    UI.bind(el);
  }

  /* ── PROJECT DETAIL ── */
  function renderProjectDetail(id) {
    const p = S().projectOf(id);
    if (!p) { V61.App.nav("#/projects"); return; }
    const cl = S().clientById(p.clientId);
    const biz = cl ? S().clientBusiness(p.clientId) : null;
    const tasks = S().projectTasksFor(p.id);
    const milestones = S().milestonesFor(p.id);
    const st = S().projectStatusOf(p.status);

    const el = document.getElementById("content");

    el.innerHTML =
      '<a href="#/projects" class="btn btn-ghost" style="margin-bottom:14px">' + I.chevronL + " Back to projects</a>" +

      '<div class="panel" style="padding:22px;border-top:4px solid ' + st.color + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px">' +
          '<div>' +
            '<div style="font-size:12px;color:var(--text-3);font-weight:700;text-transform:uppercase">' + (cl ? '<a href="#/clients/' + cl.id + '">' : '') + U().escapeHtml(biz ? biz.name : "Deleted client") + (cl ? "</a>" : "") + '</div>' +
            '<h1 class="page-title" style="margin-top:4px">' + U().escapeHtml(p.name) + '</h1>' +
          '</div>' +
          '<div style="display:flex;gap:8px">' +
            '<button class="btn btn-ghost" data-cmd="editProject:' + p.id + '">' + I.pencil + " Edit</button>" +
            '<button class="btn btn-primary" data-cmd="addTaskModal:' + p.id + '">' + I.plus + " Add Task</button>" +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="kpi-grid" style="margin-top:18px">' +
        '<div class="kpi"><div class="k-label">Status</div><div class="k-value">' + UI.badge(st.label, st.color, true) + '</div></div>' +
        '<div class="kpi"><div class="k-label">Progress</div><div class="k-value">' + p.progress + '%</div></div>' +
        '<div class="kpi"><div class="k-label">Due Date</div><div class="k-value" style="font-size:18px">' + (p.dueDate ? U().formatDate(p.dueDate) : '—') + '</div></div>' +
        '<div class="kpi"><div class="k-label">Value</div><div class="k-value">' + U().formatMoney(p.budget) + '</div></div>' +
      '</div>' +

      '<div class="grid-2-1" style="margin-top:24px">' +
        '<div style="display:flex;flex-direction:column;gap:18px">' +
          '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.checkSquare + ' Tasks (' + tasks.length + ')</div></div>' +
          '<div class="panel-body">' +
            (tasks.length ? '<div class="stack">' + tasks.sort((a,b) => (a.status === 'done' ? 1 : -1)).map(t => {
              const tst = S().taskStatusOf(t.status);
              const isOverdue = t.status !== 'done' && t.dueDate && t.dueDate < U().todayStart();
              return '<div class="row-card" style="padding:12px">' +
                '<input type="checkbox" ' + (t.status === 'done' ? 'checked' : '') + ' data-cmd="toggleTask:' + t.id + '" style="margin-right:12px;width:18px;height:18px">' +
                '<div style="flex:1"><div class="' + (t.status === 'done' ? 'strike' : '') + '"><b>' + U().escapeHtml(t.title) + '</b></div>' +
                '<div class="rc-sub">' + (t.dueDate ? '<span class="' + (isOverdue ? 'overdue' : '') + '">' + I.clock + U().formatDate(t.dueDate) + '</span>' : 'No deadline') + '</div></div>' +
                '<div>' + UI.badge(tst.label, tst.color, true) + '</div>' +
                '<div class="rc-actions"><button class="icon-btn" data-cmd="editTask:' + t.id + '">' + I.pencil + '</button></div>' +
                '</div>';
            }).join("") + '</div>' : UI.emptyState("checkSquare", "No tasks yet.")) +
          '</div></div>' +
        '</div>' +

        '<div style="display:flex;flex-direction:column;gap:18px">' +
          '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.zap + ' Milestones</div><button class="btn btn-sm" data-cmd="addMilestoneModal:' + p.id + '">' + I.plus + '</button></div>' +
          '<div class="panel-body">' +
            (milestones.length ? '<div class="stack">' + milestones.map(m =>
              '<div class="row-card" style="padding:10px"><div><b>' + U().escapeHtml(m.name) + '</b>' +
              '<div class="rc-sub">' + (m.status === 'completed' ? 'Completed ' + U().formatDate(m.completionDate) : 'Due ' + (m.dueDate ? U().formatDate(m.dueDate) : '—')) + '</div></div>' +
              UI.badge(m.status.toUpperCase(), m.status === 'completed' ? "#3f9d5f" : "#8a8a90", true) +
              '</div>'
            ).join("") + '</div>' : '<div class="cell-sub">No milestones defined.</div>') +
          '</div></div>' +

          '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.clock + ' Activity</div></div>' +
          '<div class="panel-body"><div class="timeline">' +
            (S().activityFor(biz.id).length ? S().activityFor(biz.id).slice(0, 5).map(a =>
              '<div class="tl-item"><div class="tl-dot"></div><div class="tl-content"><div class="tl-time">' + U().relativeTime(a.createdAt) + '</div><div class="tl-title">' + U().escapeHtml(a.text) + '</div></div></div>'
            ).join("") : '<div class="cell-sub">No recent activity.</div>') +
          '</div></div></div>' +
        '</div>' +
      '</div>';
    UI.bind(el);
  }

  /* ── MODALS ── */
  function addProjectModal(clientId) {
    const clients = S().db.clients;
    const tpls = S().DEFAULT_PROJECT_TEMPLATES;
    const m = UI.openModal({ title: "Start New Project", icon: I.plus, size: "lg" });

    m.setBody(
      '<div class="field"><label>Select Client *</label><select class="select" id="p-client">' +
        clients.map(c => {
          const b = S().businessOf({ businessId: c.businessId });
          return '<option value="' + c.id + '" ' + (clientId === c.id ? 'selected' : '') + '>' + U().escapeHtml(bizName(b)) + '</option>';
        }).join("") +
      '</select></div>' +
      '<div class="field"><label>Project Name *</label><input class="input" id="p-name" placeholder="e.g. Website Redesign"></div>' +
      '<div class="field"><label>Description</label><textarea class="textarea" id="p-desc" rows="3"></textarea></div>' +
      '<div class="field-row"><div class="field"><label>Budget (GH₵)</label><input class="input" type="number" id="p-budget"></div>' +
      '<div class="field"><label>Due Date</label><input class="input" type="date" id="p-due"></div></div>' +
      '<div class="field"><label>Apply Template (Optional)</label><select class="select" id="p-tpl"><option value="">None</option>' +
        tpls.map(t => '<option value="' + t.id + '">' + U().escapeHtml(t.name) + '</option>').join("") +
      '</select></div>'
    );

    m.setFoot('<button class="btn" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Start Project</button>');

    m.q("[data-save]").addEventListener("click", () => {
      const name = m.body.querySelector("#p-name").value.trim();
      const cid = m.body.querySelector("#p-client").value;
      if (!name || !cid) return;

      const proj = S().addProject(cid, {
        name,
        description: m.body.querySelector("#p-desc").value.trim(),
        budget: Number(m.body.querySelector("#p-budget").value) || 0,
        dueDate: m.body.querySelector("#p-due").value ? new Date(m.body.querySelector("#p-due").value + "T09:00:00").getTime() : null
      });

      const tplId = m.body.querySelector("#p-tpl").value;
      if (tplId) {
        const tpl = tpls.find(t => t.id === tplId);
        if (tpl) {
          tpl.tasks.forEach(t => S().addProjectTask(proj.id, { title: t.title, priority: t.priority }));
        }
      }

      m.close();
      V61.Toast.success("Project started");
      V61.App.nav("#/projects/" + proj.id);
    });
    m.q("[data-cancel]").addEventListener("click", () => m.close());
  }

  function addTaskModal(projectId) {
    const m = UI.openModal({ title: "Add Task", icon: I.checkSquare });
    m.setBody(
      '<div class="field"><label>Task Title *</label><input class="input" id="t-title" placeholder="What needs to be done?"></div>' +
      '<div class="field-row"><div class="field"><label>Priority</label><select class="select" id="t-prio"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></div>' +
      '<div class="field"><label>Due Date</label><input class="input" type="date" id="t-due"></div></div>' +
      '<div class="field"><label>Notes</label><textarea class="textarea" id="t-notes" rows="2"></textarea></div>'
    );
    m.setFoot('<button class="btn" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Add Task</button>');
    m.q("[data-save]").addEventListener("click", () => {
      const title = m.body.querySelector("#t-title").value.trim();
      if (!title) return;
      S().addProjectTask(projectId, {
        title,
        priority: m.body.querySelector("#t-prio").value,
        dueDate: m.body.querySelector("#t-due").value ? new Date(m.body.querySelector("#t-due").value + "T09:00:00").getTime() : null,
        notes: m.body.querySelector("#t-notes").value.trim()
      });
      updateProjectProgress(projectId);
      m.close();
      V61.App.renderRoute();
    });
    m.q("[data-cancel]").addEventListener("click", () => m.close());
  }

  function updateProjectProgress(projectId) {
    const p = S().projectOf(projectId);
    if (!p) return;
    p.progress = S().projectProgress(projectId);
    p.updatedAt = U().now();
    S().save();
  }

  function bizName(b) { return b ? b.name : "Unknown Business"; }

  /* ── COMMANDS ── */
  V61.Cmd = V61.Cmd || {};
  Object.assign(V61.Cmd, {
    addProjectModal,
    addTaskModal,
    toggleTask: (id) => {
      const t = S().projectTaskOf(id);
      if (t) {
        t.status = t.status === 'done' ? 'todo' : 'done';
        t.completedAt = t.status === 'done' ? U().now() : null;
        updateProjectProgress(t.projectId);
        V61.App.renderRoute();
      }
    },
    startProject: (clientId) => addProjectModal(clientId)
  });

  V61.Pages.projects = renderProjects;
  V61.Pages.projectDetail = renderProjectDetail;
})();