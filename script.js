/* Vision 61 Studios — website interactions */
(function () {
  const burger = document.getElementById("nav-burger");
  const links = document.getElementById("nav-links");

  if (burger && links) {
    burger.addEventListener("click", () => {
      const open = links.classList.toggle("open");
      burger.classList.toggle("open", open);
      burger.setAttribute("aria-expanded", open ? "true" : "false");
    });
    links.querySelectorAll("a").forEach((a) => {
      a.addEventListener("click", () => {
        links.classList.remove("open");
        burger.classList.remove("open");
      });
    });
  }

  const sections = Array.from(document.querySelectorAll("section[id]"));
  const navAnchors = Array.from(document.querySelectorAll(".nav-links a[href^='#']:not(.nav-cta)"));
  if ("IntersectionObserver" in window) {
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          navAnchors.forEach((a) => {
            a.style.color = a.getAttribute("href") === "#" + e.target.id ? "var(--text)" : "";
          });
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    sections.forEach((s) => spy.observe(s));
  }

  const reveal = document.querySelectorAll(".card, .proc, .work-card, .fact");
  if ("IntersectionObserver" in window) {
    const ro = new IntersectionObserver((entries, obs) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("in"); obs.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    reveal.forEach((el) => { el.classList.add("reveal"); ro.observe(el); });
  } else {
    reveal.forEach((el) => el.classList.add("in"));
  }
})();
