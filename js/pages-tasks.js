/* VISION 61 CRM — Tasks: my tasks, today, overdue, filtering */
window.V61 = window.V61 || {};
V61.Pages = V61.Pages || {};

(function () {
  const U = () => V61.Utils;
  const S = () => V61.Store;
  const I = V61.Icons;
  const UI = V61.UI;

  function renderMyTasks() {
    const el = document.getElementById("content");
    const tasks = S().db.projectTasks.filter(t => t.status !== 'done');
    const today = U().todayStart();

    const overdue = tasks.filter(t => t.dueDate && t.dueDate < today).sort((a,b) => a.dueDate - b.dueDate);
    const dueToday = tasks.filter(t => t.dueDate && U().dayStart(t.dueDate) === today).sort((a,b) => a.dueDate - b.dueDate);
    const upcoming = tasks.filter(t => t.dueDate && t.dueDate > today + 86400000).sort((a,b) => a.dueDate - b.dueDate);
    const noDate = tasks.filter(t => !t.dueDate);

    el.innerHTML =
      '<div class="page-head"><div><div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.14em">Operations</div>' +
      '<h1 class="page-title">My Tasks Today</h1><p class="page-sub">' + tasks.length + " open tasks across all projects</p></div></div>" +

      '<div class="grid-2-1">' +
        '<div style="display:flex;flex-direction:column;gap:24px">' +
          renderTaskSection("Overdue", overdue, "danger") +
          renderTaskSection("Due Today", dueToday, "warning") +
          renderTaskSection("Upcoming", upcoming, "info") +
          renderTaskSection("No Due Date", noDate, "muted") +
        '</div>' +

        '<div style="display:flex;flex-direction:column;gap:18px">' +
          '<div class="panel"><div class="panel-head"><div class="panel-title">Task Summary</div></div>' +
          '<div class="panel-body">' +
            '<div style="display:flex;flex-direction:column;gap:12px">' +
              summaryItem("Overdue", overdue.length, "var(--danger)") +
              summaryItem("Due Today", dueToday.length, "var(--warning)") +
              summaryItem("Upcoming", upcoming.length, "var(--accent)") +
              summaryItem("Total Open", tasks.length, "var(--text-1)") +
            '</div>' +
          '</div></div>' +
        '</div>' +
      '</div>';
    UI.bind(el);
  }

  function renderTaskSection(title, list, type) {
    const color = { danger: "var(--danger)", warning: "var(--warning)", info: "var(--accent)", muted: "var(--text-3)" }[type];
    return '<div>' +
      '<h3 style="font-size:14px;font-weight:700;margin-bottom:12px;display:flex;align-items:center;gap:8px;color:' + color + '">' +
      '<span style="width:8px;height:8px;border-radius:50%;background:' + color + '"></span>' + title + ' (' + list.length + ')</h3>' +
      (list.length ? '<div class="stack">' + list.map(taskRow).join("") + '</div>' : '<div class="cell-sub" style="padding:12px;background:var(--bg-2);border-radius:8px">No tasks here.</div>') +
    '</div>';
  }

  function taskRow(t) {
    const p = S().projectOf(t.projectId);
    const cl = S().clientById(p.clientId);
    const biz = S().businessOf({ businessId: cl.businessId });
    const prio = S().TASK_PRIORITY.find(x => x.key === t.priority) || S().TASK_PRIORITY[1];

    return '<div class="row-card" style="padding:12px;border-left:3px solid ' + prio.color + '">' +
      '<div style="flex:1">' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<b>' + U().escapeHtml(t.title) + '</b>' +
          UI.badge(t.priority.toUpperCase(), prio.color, false) +
        '</div>' +
        '<div class="rc-sub">' +
          '<a href="#/projects/' + p.id + '">' + U().escapeHtml(p.name) + '</a> · ' +
          U().escapeHtml(biz.name) +
          (t.dueDate ? ' · ' + I.clock + ' ' + U().formatDate(t.dueDate) : '') +
        '</div>' +
      '</div>' +
      '<div class="rc-actions">' +
        '<button class="btn btn-sm btn-primary" data-cmd="completeTask:' + t.id + '">' + I.check + ' Complete</button>' +
        '<button class="icon-btn" data-cmd="editTask:' + t.id + '">' + I.pencil + '</button>' +
      '</div>' +
    '</div>';
  }

  function summaryItem(label, count, color) {
    return '<div style="display:flex;justify-content:space-between;align-items:center">' +
      '<span style="font-size:13px;color:var(--text-3)">' + label + '</span>' +
      '<b style="font-size:15px;color:' + color + '">' + count + '</b>' +
    '</div>';
  }

  V61.Pages.tasks = renderMyTasks;
})();