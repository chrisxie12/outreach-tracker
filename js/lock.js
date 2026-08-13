/* VISION 61 CRM — client-side password lock (basic access gate; see app CSS .lock-screen) */
(function () {
  var PWD = "vision61";
  var KEY = "v61_unlocked";
  var lock = document.getElementById("lock");
  var input = document.getElementById("lock-pass");
  var err = document.getElementById("lock-err");

  function session() {
    try { return sessionStorage.getItem(KEY) === "1"; } catch (e) { return false; }
  }

  function setUnlocked() {
    try { sessionStorage.setItem(KEY, "1"); } catch (e) {}
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
    if (input.value === PWD) {
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
