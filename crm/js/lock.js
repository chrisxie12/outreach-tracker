/* VISION 61 CRM — local UI lock (NOT security).
   ------------------------------------------------------------------
   SECURITY LIMITATION — READ BEFORE USING THIS AS ANY KIND OF GATE:
   This is a cosmetic, client-side screen overlay only. It does NOT
   protect your data and must not be presented as real security.

   * The password is read from a data attribute on the lock element
     (set via server-side config or environment variable).
   * The unlock state is a plain `sessionStorage` flag; anyone can set
     it, or hide the overlay via devtools, to bypass the screen.
   * All CRM data is stored in plain `localStorage` (key "v61crm_v1")
     and is fully readable/editable from the browser devtools regardless
     of this lock.
   * Nothing else in the app (router, data layer, pages) checks this
     lock — it is purely a visual gate.

   Intended purpose: a light convenience screen to discourage casual
   peeking when the app is left open. If you need real authentication
   or access control, a server-side login (with credentials kept out of
   the front-end bundle) and encrypted/authorized storage are required.
   ------------------------------------------------------------------ */
(function () {
  var lock = document.getElementById("lock");
  var input = document.getElementById("lock-pass");
  var err = document.getElementById("lock-err");

  function getPassword() {
    return (lock && lock.dataset.password) || "";
  }

  function session() {
    try { return sessionStorage.getItem("v61_unlocked") === "1"; } catch (e) { return false; }
  }

  function setUnlocked() {
    try { sessionStorage.setItem("v61_unlocked", "1"); } catch (e) {}
  }

  function show() {
    if (lock) lock.classList.remove("hidden");
    if (input) setTimeout(function () { input.focus(); }, 60);
  }

  function hide() {
    if (lock) lock.classList.add("hidden");
  }

  function attempt() {
    if (!input) return;
    if (input.value && input.value === getPassword()) {
      err.textContent = "";
      input.value = "";
      setUnlocked();
      hide();
    } else {
      err.textContent = "Incorrect password";
      input.value = "";
      input.focus();
      if (input.parentNode) input.parentNode.classList.add("shake");
      setTimeout(function () { if (input.parentNode) input.parentNode.classList.remove("shake"); }, 450);
    }
  }

  function bind() {
    var btn = document.getElementById("lock-btn");
    if (btn) btn.addEventListener("click", attempt);
    if (input) input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); attempt(); }
    });
  }

  /* Block app shortcuts (Ctrl+K, N, Escape) while locked */
  function blockWhileLocked(e) {
    if (!lock || lock.classList.contains("hidden")) return;
    var k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === "k") { e.preventDefault(); e.stopPropagation(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); }
    else if (!/INPUT|TEXTAREA|SELECT/.test(document.activeElement && document.activeElement.tagName) && k === "n") { e.preventDefault(); e.stopPropagation(); }
  }

  document.addEventListener("DOMContentLoaded", function () {
    bind();
    document.addEventListener("keydown", blockWhileLocked, true);
    if (session()) hide();
    else show();
  });
})();
