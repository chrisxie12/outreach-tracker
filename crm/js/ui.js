/* VISION 61 CRM — reusable UI components */
(function () {
  const U = () => V61.Utils;
  const S = () => V61.Store;
  const I = V61.Icons;

  /* ── Modal ── */
  function openModal(opts) {
    const root = document.getElementById("modalRoot");
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    const size = opts.size || "";
    overlay.innerHTML =
      '<div class="modal ' + size + '" role="dialog" aria-modal="true">' +
      '<div class="modal-head"><div class="modal-title">' + (opts.icon || I.plus) + '<span>' + U().escapeHtml(opts.title) + "</span></div>" +
      '<button class="icon-btn" data-close>' + I.x + "</button></div>" +
      '<div class="modal-body"></div>' +
      (opts.footer !== false ? '<div class="modal-foot"></div>' : "") +
      "</div>";
    root.appendChild(overlay);

    const body = overlay.querySelector(".modal-body");
    const foot = overlay.querySelector(".modal-foot");

    function close(result) {
      overlay.remove();
      document.removeEventListener("keydown", onKey);
      if (opts.onClose) opts.onClose(result);
    }
    function onKey(e) { if (e.key === "Escape") { e.stopPropagation(); close(); } }
    document.addEventListener("keydown", onKey);
    overlay.querySelector("[data-close]").addEventListener("click", () => close());
    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });

    return { overlay, body, foot, close, q: (sel) => overlay.querySelector(sel), setBody: (h) => { body.innerHTML = h; bind(body); }, setFoot: (h) => { foot.innerHTML = h; bind(foot); } };
  }

  /* ── Binding for dynamically inserted HTML ── */
  function bind(root) {
    if (!root) return;
    root.querySelectorAll("[data-cmd]").forEach((el) => {
      const raw = el.dataset.cmd;
      const i = raw.indexOf(":");
      const cmd = i === -1 ? raw : raw.slice(0, i);
      const arg = i === -1 ? "" : raw.slice(i + 1);
      el.addEventListener("click", (e) => {
        e.preventDefault();
        const fn = V61.Cmd[cmd];
        if (fn) fn(arg, el, e);
      });
    });
  }

  /* ── Empty state ── */
  function emptyState(icon, title, sub, actionHtml) {
    return '<div class="empty"><div class="e-icon">' + (I[icon] || I.package) + '</div><h3>' + U().escapeHtml(title) + '</h3><p>' + U().escapeHtml(sub || "") + "</p>" + (actionHtml || "") + "</div>";
  }

  /* ── Score ring (SVG) ── */
  function scoreRing(score, label, size) {
    const sz = size || 92, stroke = 6.5, r = (sz - stroke) / 2, c = 2 * Math.PI * r;
    const off = c * (1 - Math.min(score, 100) / 100);
    return '<div class="score-ring" style="width:' + sz + 'px;height:' + sz + 'px">' +
      '<svg width="' + sz + '" height="' + sz + '"><circle class="ring-bg" cx="' + sz / 2 + '" cy="' + sz / 2 + '" r="' + r + '" fill="none" stroke-width="' + stroke + '"/>' +
      '<circle class="ring-fg" cx="' + sz / 2 + '" cy="' + sz / 2 + '" r="' + r + '" fill="none" stroke-width="' + stroke + '" stroke-dasharray="' + c + '" stroke-dashoffset="' + off + '"/></svg>' +
      '<div class="score-num">' + (score == null ? "—" : Math.round(score)) + (label ? "<small>" + U().escapeHtml(label) + "</small>" : "") + "</div></div>";
  }

  function scoreBar(score) {
    return '<div class="score-bar"><i style="width:' + Math.max(2, Math.min(100, score)) + '%"></i></div>';
  }

  /* ── Badges ── */
  function badge(text, color, dot) {
    const c = color || S().stageOf("new").color;
    return '<span class="badge" style="background:' + hexA(c, 0.13) + ";color:" + c + '">' + (dot ? '<span class="badge-dot" style="background:' + c + '"></span>' : "") + U().escapeHtml(text) + "</span>";
  }

  function stageBadge(stageKey) {
    const s = S().stageOf(stageKey);
    return badge(s.label, s.color, true);
  }
  function tempBadge(tempKey) {
    const t = S().tempOf(tempKey);
    return badge(t.label, t.color, true);
  }
  function miniScore(score) {
    const t = S().temperatureFor(score);
    return '<span class="mini-score ' + t + '">' + score + "</span>";
  }

  /* ── hex with alpha ── */
  function hexA(hex, a) {
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return "rgba(" + r + "," + g + "," + b + "," + a + ")";
  }

  /* ── Confirmation ── */
  function confirmDialog(title, message, onYes, yesLabel) {
    const m = openModal({ title, icon: I.alert, footer: false });
    m.setBody('<p style="color:var(--text-2);font-size:13.5px;line-height:1.6">' + U().escapeHtml(message || "This action cannot be undone.") + "</p>" +
      '<div style="display:flex;gap:8px;margin-top:18px;justify-content:flex-end">' +
      '<button class="btn" data-close>Cancel</button>' +
      '<button class="btn btn-danger" data-ok>Delete</button></div>');
    m.body.querySelector("[data-close]").addEventListener("click", () => m.close());
    m.body.querySelector("[data-ok]").addEventListener("click", () => { m.close(); onYes && onYes(); });
  }

  /* ── Generic prompt modal for quick forms ── */
  function formModal(opts) {
    const m = openModal({ title: opts.title, icon: opts.icon, size: opts.size || "" });
    m.setBody(opts.body);
    m.setFoot('<button class="btn" data-cancel>Cancel</button><button class="btn btn-primary" data-save>' + U().escapeHtml(opts.saveLabel || "Save") + "</button>");
    const $ = (id) => m.body.querySelector("#" + id);
    m.q("[data-cancel]").addEventListener("click", () => m.close());
    m.q("[data-save]").addEventListener("click", () => {
      const val = opts.validate ? opts.validate($) : null;
      if (val === false) return;
      opts.onSave && opts.onSave(val || collect(m.body, opts.fields));
      m.close();
    });
    if (opts.onOpen) opts.onOpen(m, $);
    return m;
  }

  function collect(root, fields) {
    const out = {};
    (fields || []).forEach((f) => {
      const el = root.querySelector('[name="' + f + '"]');
      if (el) out[f] = el.value.trim();
    });
    return out;
  }

  /* ── Contact channel mini buttons ── */
  function contactLinks(b) {
    const U2 = V61.Utils;
    const links = [];
    if (b.whatsapp) links.push('<a class="mini-btn" target="_blank" rel="noopener" href="' + U2.waLink(b.whatsapp) + '">' + I.whatsapp + "WhatsApp</a>");
    if (b.phone) links.push('<a class="mini-btn" href="tel:' + U2.phoneDigits(b.phone) + '">' + I.phone + "Call</a>");
    if (b.email) links.push('<a class="mini-btn" href="mailto:' + U().escapeHtml(b.email) + '">' + I.mail + "Email</a>");
    if (b.website) links.push('<a class="mini-btn" target="_blank" rel="noopener" href="' + (/^https?:\/\//i.test(b.website) ? b.website : "https://" + b.website) + '">' + I.globe + "Website</a>");
    if (b.instagramUrl) links.push('<a class="mini-btn" target="_blank" rel="noopener" href="' + b.instagramUrl + '">' + I.instagram + "IG</a>");
    if (b.facebookUrl) links.push('<a class="mini-btn" target="_blank" rel="noopener" href="' + b.facebookUrl + '">' + I.facebook + "FB</a>");
    return links.join(" ");
  }

  /* ── Simple context menu ── */
  function menuPop(anchor, items) {
    const root = document.getElementById("menuRoot");
    const el = document.createElement("div");
    el.className = "menu-pop";
    let actionIdx = -1;
    el.innerHTML = items.map((it) => it.sep ? '<div class="menu-divider"></div>' : (it.label ? '<div class="menu-label">' + U().escapeHtml(it.label) + "</div>" :
      ('<button class="menu-item' + (it.danger ? " danger" : "") + '" data-i="' + (++actionIdx) + '">' + (it.icon || "") + U().escapeHtml(it.text) + "</button>"))).join("");
    root.appendChild(el);
    const rect = anchor.getBoundingClientRect();
    const w = el.offsetWidth, h = el.offsetHeight;
    let x = Math.min(rect.left, window.innerWidth - w - 8);
    let y = rect.bottom + 6;
    if (y + h > window.innerHeight - 8) y = Math.max(8, rect.top - h - 6);
    el.style.left = x + "px"; el.style.top = y + "px";

    const clickable = items.filter((it) => !it.sep && !it.label);
    function close(e) { if (e && el.contains(e.target)) return; el.remove(); document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); }
    function esc(e) { if (e.key === "Escape") close(); }
    setTimeout(() => { document.addEventListener("mousedown", close); document.addEventListener("keydown", esc); }, 0);
    el.querySelectorAll(".menu-item").forEach((b) => b.addEventListener("click", () => {
      const idx = Number(b.dataset.i);
      el.remove(); document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc);
      const it = clickable[idx];
      if (it && it.action) it.action();
    }));
  }

  V61.UI = { openModal, formModal, confirmDialog, emptyState, scoreRing, scoreBar, badge, stageBadge, tempBadge, miniScore, hexA, bind, contactLinks, menuPop, collect };
})();