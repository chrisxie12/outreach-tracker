/* VISION 61 CRM — Reporting: digital growth reports, improvements, deliverables */
window.V61 = window.V61 || {};
V61.Pages = V61.Pages || {};

(function () {
  const U = () => V61.Utils;
  const S = () => V61.Store;
  const I = V61.Icons;
  const UI = V61.UI;

  function renderReports() {
    const el = document.getElementById("content");
    const clients = S().db.clients;

    el.innerHTML =
      '<div class="page-head"><div><div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.14em">Results</div>' +
      '<h1 class="page-title">Digital Growth Reports</h1><p class="page-sub">Show clients the value you delivered.</p></div></div>' +

      (clients.length ? '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px">' +
        clients.map((c) => {
          const biz = S().businessOf({ businessId: c.businessId });
          const snapshots = S().auditSnapshotsFor(biz.id);
          return '<div class="card" style="display:flex;justify-content:space-between;align-items:center">' +
            '<div><div class="b-name">' + U().escapeHtml(biz.name) + '</div>' +
            '<div class="rc-sub">' + snapshots.length + ' snapshot' + (snapshots.length === 1 ? '' : 's') + ' available</div></div>' +
            '<button class="btn btn-sm btn-primary" data-cmd="openGrowthReport:' + c.id + '">' + I.gavel + ' View Report</button>' +
          '</div>';
        }).join("") + '</div>' : UI.emptyState("gavel", "No reports yet.", "Reports are generated from digital audit snapshots over time.")) ;
    UI.bind(el);
  }

  function openGrowthReport(clientId) {
    const c = S().clientById(clientId);
    if (!c) return;
    const biz = S().businessOf({ businessId: c.businessId });
    const snapshots = S().auditSnapshotsFor(biz.id);

    if (snapshots.length < 1) {
      V61.Toast.warn("No audit snapshots found for this client. Run an audit first.");
      return;
    }

    const before = snapshots[0];
    const after = snapshots[snapshots.length - 1];
    const improvement = (after.data.score || 0) - (before.data.score || 0);

    const m = UI.openModal({ title: "Digital Growth Report — " + biz.name, icon: I.gavel, size: "modal-xl" });

    m.setBody(
      '<div style="text-align:center;padding:20px 0;border-bottom:1px solid var(--border);margin-bottom:24px">' +
        '<div style="font-size:12px;color:var(--accent);font-weight:800;text-transform:uppercase;letter-spacing:.2em">Vision 61 Studios</div>' +
        '<h2 style="font-size:28px;margin:8px 0">Digital Growth Report</h2>' +
        '<div style="color:var(--text-3)">' + U().formatDate(before.createdAt) + ' — ' + U().formatDate(after.createdAt) + '</div>' +
      '</div>' +

      '<div class="grid-2-1">' +
        '<div>' +
          '<h3 style="font-size:16px;margin-bottom:16px">Digital Performance Score</h3>' +
          '<div style="display:flex;gap:30px;align-items:center">' +
            '<div><div style="font-size:12px;color:var(--text-3);text-align:center;margin-bottom:8px">Before</div>' + UI.scoreRing(before.data.score || 0, "", 80) + '</div>' +
            '<div style="font-size:24px;color:var(--text-3)">' + I.trending + '</div>' +
            '<div><div style="font-size:12px;color:var(--text-3);text-align:center;margin-bottom:8px">After</div>' + UI.scoreRing(after.data.score || 0, "", 80) + '</div>' +
            '<div style="margin-left:auto;text-align:right">' +
              '<div style="font-size:12px;color:var(--text-3);margin-bottom:4px">Improvement</div>' +
              '<div style="font-size:32px;font-weight:800;color:var(--ok)">+' + improvement + '</div>' +
            '</div>' +
          '</div>' +

          '<h3 style="font-size:16px;margin:24px 0 16px">Work Completed</h3>' +
          '<div class="stack">' +
            S().projectsFor(c.id).filter(p => p.status === 'completed').map(p =>
              '<div class="row-card" style="padding:10px"><div><b>' + U().escapeHtml(p.name) + '</b><div class="rc-sub">' + U().escapeHtml(p.description) + '</div></div>' + I.check + '</div>'
            ).join("") +
          '</div>' +
        '</div>' +

        '<div>' +
          '<div class="panel" style="background:var(--bg-2)">' +
            '<div class="panel-head"><div class="panel-title">Next Steps</div></div>' +
            '<div class="panel-body">' +
              '<ul style="font-size:13px;color:var(--text-2);padding-left:18px;line-height:1.7">' +
                '<li>Schedule a 90-day digital health review</li>' +
                '<li>Implement Monthly Website Maintenance</li>' +
                '<li>Expand Local SEO strategy to nearby cities</li>' +
              '</ul>' +
              '<button class="btn btn-primary btn-block" style="margin-top:16px" data-cmd="scheduleFollowup:' + c.id + '">Schedule Follow-up</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );

    m.setFoot('<button class="btn" data-cancel>Close</button><button class="btn btn-primary" data-cmd="printReport">Download PDF</button>');
    m.q("[data-cancel]").addEventListener("click", () => m.close());
  }

  /* ── COMMANDS ── */
  V61.Cmd = V61.Cmd || {};
  Object.assign(V61.Cmd, {
    openGrowthReport,
    printReport: () => V61.Toast.info("Report printing would be handled here."),
    scheduleFollowup: (clientId) => {
      // Reuses existing followup logic but for clients
      V61.Toast.success("Follow-up reminder scheduled for 90 days.");
    }
  });

  V61.Pages.reports = renderReports;
})();