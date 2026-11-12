// Scripts of the tabora.app site. The three.js scene is loaded as a separate chunk, and only if
// the browser has WebGL; without it the static mark from the markup stays.

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch (e) {
    return false;
  }
}

async function startHero() {
  const host = document.querySelector("[data-hero-stage]");
  if (!host || !webglAvailable()) {
    return;
  }
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const { mountHero } = await import("./hero.js");
  mountHero(host, { reducedMotion });
}

// The scripts contain no UI text: the page in each language brings its own, in button text and data attributes.
function copyButtons() {
  for (const btn of document.querySelectorAll("[data-copy]")) {
    const idle = btn.textContent;
    let timer = 0;
    btn.addEventListener("click", async () => {
      const target = document.getElementById(btn.dataset.copy);
      const text = target?.textContent.trim() || "";
      const done = label => {
        btn.textContent = label;
        clearTimeout(timer);
        timer = setTimeout(() => (btn.textContent = idle), 1600);
      };
      try {
        await navigator.clipboard.writeText(text);
        done(btn.dataset.copied);
      } catch (e) {
        const range = document.createRange();
        range.selectNodeContents(target);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        done(btn.dataset.selected);
      }
    });
  }
}

// The 2FA code in the mockup changes every 30 seconds, like a real one
function demoCode() {
  const el = document.querySelector("[data-demo-code]");
  const ring = document.querySelector("[data-demo-ring]");
  if (!el) {
    return;
  }
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fresh = () => {
    const n = Math.floor(100000 + Math.random() * 900000);
    el.textContent = `${String(n).slice(0, 3)} ${String(n).slice(3)}`;
  };
  const tick = () => {
    const left = 30 - (Math.floor(Date.now() / 1000) % 30);
    if (ring) {
      ring.style.setProperty("--left", String(left / 30));
      ring.dataset.seconds = String(left);
      ring.setAttribute("aria-label", ring.dataset.label.replace("{0}", String(left)));
    }
    if (left === 30) {
      fresh();
    }
  };
  fresh();
  tick();
  if (!reduced) {
    setInterval(tick, 1000);
  }
}

// Alias toggles in the mail mockup: the row label follows the state
function aliasSwitches() {
  for (const input of document.querySelectorAll("[data-alias]")) {
    const status = input.closest(".alias")?.querySelector("[data-status]");
    input.addEventListener("change", () => {
      if (status) {
        status.textContent = input.checked ? status.dataset.on : status.dataset.off;
      }
    });
  }
}

// Section rail: highlights the section that is on screen now
function railSpy() {
  const links = new Map();
  for (const a of document.querySelectorAll(".rail a[href^='#']")) {
    links.set(a.getAttribute("href").slice(1), a);
  }
  if (!links.size || !("IntersectionObserver" in window)) {
    return;
  }
  const io = new IntersectionObserver(
    entries => {
      for (const e of entries) {
        if (e.isIntersecting) {
          for (const a of links.values()) {
            a.removeAttribute("aria-current");
          }
          links.get(e.target.id)?.setAttribute("aria-current", "true");
        }
      }
    },
    { rootMargin: "-35% 0px -60% 0px" }
  );
  for (const id of links.keys()) {
    const section = document.getElementById(id);
    if (section) {
      io.observe(section);
    }
  }
}

copyButtons();
demoCode();
aliasSwitches();
railSpy();
startHero();
