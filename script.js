/* Vision 61 Studios — website interactions (V2) */
(function () {
  "use strict";

  var burger = document.getElementById("nav-burger");
  var links = document.getElementById("nav-links");

  if (burger && links) {
    burger.addEventListener("click", function () {
      var open = links.classList.toggle("open");
      burger.classList.toggle("open", open);
      burger.setAttribute("aria-expanded", open ? "true" : "false");
    });
    links.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        links.classList.remove("open");
        burger.classList.remove("open");
      });
    });
  }

  var sections = Array.prototype.slice.call(document.querySelectorAll("section[id]"));
  var navAnchors = Array.prototype.slice.call(
    document.querySelectorAll(".nav-links a[href^='#']:not(.nav-cta)")
  );
  var hasIO = "IntersectionObserver" in window;

  if (hasIO) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          navAnchors.forEach(function (a) {
            a.style.color = a.getAttribute("href") === "#" + e.target.id ? "var(--text)" : "";
          });
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    sections.forEach(function (s) { spy.observe(s); });
  }

  var reduced = false;
  try { reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { /* ignore */ }

  var reveal = Array.prototype.slice.call(
    document.querySelectorAll(".svc-card, .pkg-card, .why-card, .proc, .fact, .example-card")
  );
  if (hasIO && !reduced) {
    var ro = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); obs.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    reveal.forEach(function (el) { el.classList.add("reveal"); ro.observe(el); });
  } else {
    reveal.forEach(function (el) { el.classList.add("in"); });
  }

  var yearEl = document.getElementById("year");
  if (yearEl) { yearEl.textContent = String(new Date().getFullYear()); }

  var form = document.getElementById("contact-form");
  if (form) {
    var status = document.getElementById("form-status");
    var WA_NUMBER = "233201599949";
    var EMAIL = "hello@vision61studios.com";

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var val = function (id) {
        var el = document.getElementById(id);
        return el ? el.value.trim() : "";
      };
      var name = val("cf-name");
      var business = val("cf-business");
      var phone = val("cf-phone");
      var email = val("cf-email");
      var type = val("cf-type");
      var need = val("cf-need");
      var message = val("cf-message");

      if (!name && !message) {
        var firstField = document.getElementById("cf-name");
        if (firstField) firstField.focus();
        if (status) status.textContent = "Please add your name or a message.";
        return;
      }

      var lines = [];
      function push(label, value) { if (value) { lines.push(label + ": " + value); } }
      push("Name", name);
      push("Business", business);
      push("Phone / WhatsApp", phone);
      push("Email", email);
      push("Business type", type);
      push("I need help with", need);
      if (message) { lines.push(""); lines.push(message); }
      var body = "Hi Vision 61 Studios! I'd like to talk about my business.\n\n" + lines.join("\n");
      var subject = "Project enquiry" + (name ? " — " + name : "");

      var waUrl = "https://wa.me/" + WA_NUMBER + "?text=" + encodeURIComponent(body);
      var mailtoUrl = "mailto:" + EMAIL + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);

      window.open(waUrl, "_blank", "noopener");
      if (status) {
        status.textContent = "Opening WhatsApp with your details pre-filled…";
        var fb = document.createElement("a");
        fb.textContent = "WhatsApp didn't open? Send the same message by email instead.";
        fb.href = mailtoUrl;
        fb.className = "form-fallback";
        status.appendChild(document.createElement("br"));
        status.appendChild(fb);
      }
    });
  }
})();
