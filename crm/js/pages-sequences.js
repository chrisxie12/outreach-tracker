/* VISION 61 CRM — Sequences: list + builder */
window.V61 = window.V61 || {};
V61.Pages = V61.Pages || {};

(function () {
  const U = () => V61.Utils;
  const S = () => V61.Store;
  const I = V61.Icons;
  const UI = V61.UI;

  /* ── Sequence List ── */
  function renderList() {
    const el = document.getElementById("content");
    const sequences = S().db.sequences || [];

    el.innerHTML =
      '<div class="page-head"><div><div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.14em">Outreach</div>' +
      '<h1 class="page-title">Sequences</h1><p class="page-sub">Multi-step email sequences for automated outreach campaigns.</p></div>' +
      '<div class="page-actions"><button class="btn btn-primary" data-new-seq>' + I.plus + " New Sequence</button></div></div>" +
      (sequences.length ?
        '<div class="table-wrap"><table class="table"><thead><tr><th>Sequence</th><th>Steps</th><th>Campaigns</th><th>Status</th><th></th></tr></thead><tbody>' +
        sequences.map((seq) => {
          const steps = S().stepsForSequence(seq.id);
          const emailSteps = steps.filter((s) => s.type === "email");
          const campaigns = S().campaignsForSequence(seq.id);
          return '<tr data-open="' + seq.id + '" style="cursor:pointer">' +
            '<td><div style="font-weight:600">' + U().escapeHtml(seq.name) + '</div><div style="font-size:12px;color:var(--text-3)">' + U().escapeHtml(seq.description || "").slice(0, 60) + '</div></td>' +
            '<td>' + emailSteps.length + ' email' + (emailSteps.length !== 1 ? 's' : '') + '</td>' +
            '<td>' + campaigns.length + '</td>' +
            '<td><span class="badge" style="background:' + (seq.active ? '#3f9d5f' : '#8a8a90') + '22;color:' + (seq.active ? '#3f9d5f' : '#8a8a90') + '">' + (seq.active ? 'Active' : 'Inactive') + '</span></td>' +
            '<td><button class="icon-btn" data-menu="' + seq.id + '">' + I.moreH + '</button></td></tr>';
        }).join("") +
        '</tbody></table></div>' :
        '<div class="empty"><div style="font-size:40px;margin-bottom:12px">' + I.mail + '</div><div style="font-size:16px;font-weight:600;margin-bottom:6px">No sequences yet</div><div style="font-size:13px;color:var(--text-3);margin-bottom:16px">Create a sequence to define your multi-step outreach flow.</div><button class="btn btn-primary" data-new-seq>' + I.plus + ' Create Sequence</button></div>');

    UI.bind(el);
    el.querySelectorAll("[data-new-seq]").forEach((b) => b.addEventListener("click", () => renderBuilder()));
    el.querySelectorAll("tr[data-open]").forEach((tr) => tr.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      renderBuilder(tr.dataset.open);
    }));
  }

  /* ── Sequence Builder ── */
  function renderBuilder(editId) {
    const el = document.getElementById("content");
    const sequence = editId ? S().sequenceById(editId) : null;
    const steps = editId ? S().stepsForSequence(editId) : [];

    el.innerHTML =
      '<div class="page-head"><div><div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.14em">' +
      (editId ? 'Edit' : 'New') + ' Sequence</div>' +
      '<h1 class="page-title">' + (editId ? 'Edit Sequence' : 'Create Sequence') + '</h1></div>' +
      '<div class="page-actions"><button class="btn" data-back>' + I.chevronL + ' Back</button></div></div>' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + I.mail + ' Sequence Details</div></div><div class="panel-body">' +
      '<div class="field"><label>Sequence name</label><input class="input" id="seq-name" placeholder="e.g. Cold Outreach — 3 Step" value="' + U().escapeHtml(sequence ? sequence.name : "") + '"></div>' +
      '<div class="field"><label>Description</label><input class="input" id="seq-desc" placeholder="Optional description" value="' + U().escapeHtml(sequence ? sequence.description : "") + '"></div>' +
      '<div class="field"><label><input type="checkbox" id="seq-active"' + (!sequence || sequence.active ? ' checked' : '') + '> Active</label></div>' +
      '</div></div>' +
      '<div class="panel" style="margin-top:16px"><div class="panel-head"><div class="panel-title">' + I.table + ' Sequence Steps</div>' +
      '<button class="btn btn-primary" data-add-step>' + I.plus + ' Add Step</button></div>' +
      '<div class="panel-body"><div id="steps-list">' + renderSteps(steps) + '</div></div></div>' +
      '<div style="display:flex;gap:10px;margin-top:16px"><button class="btn btn-primary" data-save>' + I.check + ' ' + (editId ? 'Update' : 'Create') + ' Sequence</button>' +
      (editId ? '<button class="btn" data-delete style="color:var(--danger)">' + I.trash + ' Delete</button>' : '') + '</div>';

    UI.bind(el);
    el.querySelector("[data-back]").addEventListener("click", () => renderList());
    el.querySelector("[data-save]").addEventListener("click", () => saveSequence(editId));
    el.querySelector("[data-add-step]").addEventListener("click", () => addStep(editId));
    bindStepEvents(el, editId);

    if (editId) {
      el.querySelector("[data-delete]").addEventListener("click", () => {
        if (confirm("Delete this sequence? This cannot be undone.")) {
          S().deleteSequence(editId);
          V61.Toast.success("Sequence deleted");
          renderList();
        }
      });
    }
  }

  function renderSteps(steps) {
    if (!steps.length) {
      return '<div class="empty" style="padding:20px"><div style="color:var(--text-3)">No steps yet. Add your first email step.</div></div>';
    }
    return steps.map((step, i) => {
      if (step.type === "delay") {
        return '<div class="step-card" data-step-id="' + step.id + '">' +
          '<div class="step-header"><span class="step-num">' + (i + 1) + '</span>' +
          '<span class="badge" style="background:#e0a53e22;color:#e0a53e">Delay</span>' +
          '<button class="icon-btn" data-remove-step="' + step.id + '">' + I.x + '</button></div>' +
          '<div class="step-body"><div class="field"><label>Days to wait</label><input class="input step-delay" data-step="' + step.id + '" type="number" min="0" max="30" value="' + (step.delayDays || 1) + '"></div></div></div>';
      }
      return '<div class="step-card" data-step-id="' + step.id + '">' +
        '<div class="step-header"><span class="step-num">' + (i + 1) + '</span>' +
        '<span class="badge" style="background:#335fa822;color:#335fa8">Email' + (step.variant !== "A" ? ' — Variant ' + step.variant : '') + '</span>' +
        '<button class="icon-btn" data-remove-step="' + step.id + '">' + I.x + '</button></div>' +
        '<div class="step-body">' +
        '<div class="field"><label>Subject line</label><input class="input step-subject" data-step="' + step.id + '" placeholder="e.g. Quick question about {{businessName}}" value="' + U().escapeHtml(step.subject || "") + '"></div>' +
        '<div class="field"><label>Email body</label><textarea class="input step-body-input" data-step="' + step.id + '" rows="6" placeholder="Write your email template... Variables: {{businessName}}, {{contactName}}, {{location}}, {{senderName}}">' + U().escapeHtml(step.body || "") + '</textarea></div>' +
        '<div style="font-size:11px;color:var(--text-3)">Available variables: {{businessName}}, {{contactName}}, {{location}}, {{category}}, {{senderName}}, {{senderCompany}}</div>' +
        '</div></div>';
    }).join("");
  }

  function bindStepEvents(el, editId) {
    el.querySelectorAll("[data-remove-step]").forEach((btn) => btn.addEventListener("click", () => {
      S().deleteSequenceStep(btn.dataset.removeStep);
      if (editId) renderBuilder(editId);
    }));
    el.querySelectorAll(".step-delay").forEach((input) => input.addEventListener("change", () => {
      S().updateSequenceStep(input.dataset.step, { delayDays: parseInt(input.value, 10) || 1 });
    }));
    el.querySelectorAll(".step-subject").forEach((input) => input.addEventListener("change", () => {
      S().updateSequenceStep(input.dataset.step, { subject: input.value });
    }));
    el.querySelectorAll(".step-body-input").forEach((input) => input.addEventListener("change", () => {
      S().updateSequenceStep(input.dataset.step, { body: input.value });
    }));
  }

  function addStep(editId) {
    if (!editId) {
      V61.Toast.error("Save the sequence first, then add steps.");
      return;
    }
    S().addSequenceStep(editId, { type: "email" });
    renderBuilder(editId);
  }

  function saveSequence(editId) {
    const el = document.getElementById("content");
    const name = el.querySelector("#seq-name").value.trim();
    const description = el.querySelector("#seq-desc").value.trim();
    const active = el.querySelector("#seq-active").checked;

    if (!name) { V61.Toast.error("Sequence name is required"); return; }

    const data = { name, description, active };

    if (editId) {
      S().updateSequence(editId, data);
      V61.Toast.success("Sequence updated");
    } else {
      const seq = S().addSequence(data);
      V61.Toast.success("Sequence created — now add steps");
      renderBuilder(seq.id);
      return;
    }
    renderList();
  }

  V61.Pages.sequences = renderList;
  V61.Pages.sequenceBuilder = renderBuilder;
})();
