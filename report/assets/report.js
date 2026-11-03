// Report page behaviour (local design preview).
//  - Ribbon videos: hero + footer share one source choice; each plays only while on
//    screen, over its matching static poster. Reduced motion / Data Saver: posters only.
//  - One Play/Pause control drives every animation on the page (videos + logo marquees).
//  - Logo strips become a slow marquee only when they don't fit their container.
//  - Download forms: soft gate. First name, last name and a valid email start the download
//    and open the confirmation modal; collection (Mailchimp) plugs into collect() later and
//    never blocks the download.
(function () {
  "use strict";

  // Set to the report PDF once it exists; until then the success state just confirms.
  var REPORT_PDF = "/report/assets/pdf/2026-San-Antonio-State-Of-Innovation-Report.pdf";

  var root = document.documentElement;
  var compact = matchMedia("(max-aspect-ratio: 5/8)");
  var reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  var button = document.querySelector(".motion-toggle");

  function constrained() {
    var c = navigator.connection;
    return !!(c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || "")));
  }

  var motion = !reduceMotion.matches;      // animations wanted (marquees + video)
  var videoAllowed = !constrained();

  /* ------------------------------ Videos ------------------------------ */
  var ASSETS = {
    desktop: { width: 2560, height: 1440, bitrate: 4000000, sources: [
      { file: "/assets/media/ribbon-desktop-av1.mp4", type: 'video/mp4; codecs="av01.0.12M.10"', av1: true },
      { file: "/assets/media/ribbon-desktop-hevc.mp4", type: 'video/mp4; codecs="hvc1.2.4.L150.B0"' },
      { file: "/assets/media/ribbon-desktop-h264.mp4", type: 'video/mp4; codecs="avc1.640032"' }
    ] },
    mobile: { width: 810, height: 1440, bitrate: 1100000, sources: [
      { file: "/assets/media/ribbon-mobile-av1.mp4", type: 'video/mp4; codecs="av01.0.08M.10"', av1: true },
      { file: "/assets/media/ribbon-mobile-hevc.mp4", type: 'video/mp4; codecs="hvc1.2.4.L120.B0"' },
      { file: "/assets/media/ribbon-mobile-h264.mp4", type: 'video/mp4; codecs="avc1.640028"' }
    ] }
  };
  var probe = document.createElement("video");
  var chosen = {};
  function pick(key) {
    if (chosen[key]) return chosen[key];
    var asset = ASSETS[key];
    var ok = asset.sources.filter(function (s) { return probe.canPlayType(s.type) !== ""; });
    if (!ok.length) return (chosen[key] = Promise.resolve(null));
    var first = ok[0], mc = navigator.mediaCapabilities;
    if (!first.av1 || !mc || !mc.decodingInfo) return (chosen[key] = Promise.resolve(first.av1 && ok[1] ? ok[1] : first));
    chosen[key] = mc.decodingInfo({ type: "file", video: { contentType: first.type, width: asset.width, height: asset.height, bitrate: asset.bitrate, framerate: 16 } })
      .then(function (i) { return i.supported && i.powerEfficient ? first : (ok[1] || first); }, function () { return ok[1] || first; });
    return chosen[key];
  }

  var ribbons = [].slice.call(document.querySelectorAll(".ribbon")).map(function (el) {
    var r = { el: el, video: el.querySelector("video"), onScreen: false, loadedFor: null };
    r.video.addEventListener("playing", function () { r.video.classList.add("is-visible"); });
    r.video.addEventListener("error", function () {
      if (!r.video.getAttribute("src")) return;
      r.video.classList.remove("is-visible");
      r.video.removeAttribute("src");
      r.video.load();
      r.loadedFor = null;
    });
    return r;
  });

  function load(r) {
    var key = compact.matches ? "mobile" : "desktop";
    if (r.loadedFor === key) return Promise.resolve(true);
    return pick(key).then(function (s) {
      if (!s) return false;
      var t = r.loadedFor ? r.video.currentTime : 0;
      r.loadedFor = key;
      r.video.classList.remove("is-visible");
      r.video.src = s.file;
      if (t) r.video.addEventListener("loadedmetadata", function () { r.video.currentTime = t; }, { once: true });
      return true;
    });
  }

  function sync(r) {
    var shouldPlay = motion && videoAllowed && r.onScreen && !document.hidden;
    if (!shouldPlay) { if (r.loadedFor) r.video.pause(); return; }
    load(r).then(function (ok) {
      if (!ok || !(motion && r.onScreen)) return;
      r.video.muted = true;
      var p = r.video.play();
      if (p && p.catch) p.catch(function (e) { if (e && e.name === "NotAllowedError") { motion = false; render(); } });
    });
  }
  function syncAll() { ribbons.forEach(sync); }

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var r = ribbons.filter(function (x) { return x.el.parentElement === e.target; })[0];
        if (r) { r.onScreen = e.isIntersecting; sync(r); }
      });
    }, { rootMargin: "200px 0px" });
    ribbons.forEach(function (r) { io.observe(r.el.parentElement); });
  } else {
    ribbons.forEach(function (r) { r.onScreen = true; });
  }
  document.addEventListener("visibilitychange", syncAll);
  if (compact.addEventListener) compact.addEventListener("change", function () {
    ribbons.forEach(function (r) { if (r.loadedFor) { r.loadedFor = null; } });
    syncAll();
  });

  /* ----------------------------- Marquees ----------------------------- */
  var strips = [].slice.call(document.querySelectorAll("[data-strip]")).map(function (el) {
    var track = el.querySelector(".strip-track");
    return { el: el, track: track, items: [].slice.call(track.children), clones: [] };
  });
  var SPEED = 32; // px per second

  function layoutStrip(s) {
    s.clones.forEach(function (c) { c.remove(); });
    s.clones = [];
    s.el.classList.remove("is-marquee");
    s.track.style.removeProperty("--marquee-shift");
    var gap = parseFloat(getComputedStyle(s.track).columnGap) || 0;
    var setWidth = s.items.reduce(function (w, li) { return w + li.getBoundingClientRect().width; }, 0) + gap * s.items.length;
    var fits = setWidth - gap <= s.el.clientWidth;
    if (fits || reduceMotion.matches) return;
    // Repeat the set until two copies cover the strip, then loop by one set's width.
    var copies = Math.max(1, Math.ceil(s.el.clientWidth / setWidth));
    for (var c = 0; c < copies; c++) {
      s.items.forEach(function (li) {
        var clone = li.cloneNode(true);
        clone.setAttribute("aria-hidden", "true");
        clone.querySelectorAll("img").forEach(function (img) { img.alt = ""; });
        clone.querySelectorAll("a").forEach(function (link) { link.tabIndex = -1; });
        s.track.appendChild(clone);
        s.clones.push(clone);
      });
    }
    s.track.style.setProperty("--marquee-shift", setWidth + "px");
    s.track.style.setProperty("--marquee-dur", (setWidth / SPEED).toFixed(1) + "s");
    s.el.classList.add("is-marquee");
  }
  function layoutStrips() { strips.forEach(layoutStrip); }
  var resizeTimer;
  window.addEventListener("resize", function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(layoutStrips, 150); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layoutStrips);
  window.addEventListener("load", layoutStrips);
  layoutStrips();

  /* ---------------------------- Play / Pause --------------------------- */
  function render() {
    root.classList.toggle("motion-paused", !motion);
    if (!button) return;
    button.hidden = false;
    button.dataset.state = motion ? "playing" : "paused";
    button.setAttribute("aria-label", motion ? "Pause animations" : "Play animations");
  }
  if (button) button.addEventListener("click", function () { motion = !motion; videoAllowed = true; render(); syncAll(); });
  if (reduceMotion.addEventListener) reduceMotion.addEventListener("change", function () {
    motion = !reduceMotion.matches; render(); syncAll(); layoutStrips();
  });
  render();
  syncAll();

  /* ------------------------- Midwave placement ------------------------- */
  // Keeps the background band centred on the stat cards at every size.
  var inside = document.querySelector(".inside");
  var statsList = document.querySelector(".stats");
  function placeMidwave() {
    if (!inside || !statsList) return;
    var a = inside.getBoundingClientRect(), b = statsList.getBoundingClientRect();
    inside.style.setProperty("--stats-mid", Math.round(b.top - a.top + b.height / 2) + "px");
  }
  window.addEventListener("resize", placeMidwave);
  window.addEventListener("load", placeMidwave);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeMidwave);
  placeMidwave();

  /* ------------------------------ Cursor ------------------------------ */
  // A soft white circle replaces the pointer everywhere (mouse devices only); it grows over
  // anything clickable. While the modal is open it lives inside the dialog (top layer).
  var dot = document.querySelector(".cursor-dot");
  if (dot && matchMedia("(hover: hover) and (pointer: fine)").matches) {
    root.classList.add("has-cursor");
    var CLICKABLE = "a, button, [role=option], label, input, select, textarea, [data-cursor]";
    document.addEventListener("pointermove", function (e) {
      dot.style.setProperty("--x", e.clientX + "px");
      dot.style.setProperty("--y", e.clientY + "px");
      dot.classList.add("is-on");
      dot.classList.toggle("is-hover", !!(e.target.closest && e.target.closest(CLICKABLE)));
    }, { passive: true });
    document.documentElement.addEventListener("pointerleave", function () { dot.classList.remove("is-on"); });
    var dlg = document.getElementById("details");
    if (dlg) {
      new MutationObserver(function () {
        (dlg.open ? dlg : document.body).appendChild(dot);
      }).observe(dlg, { attributes: true, attributeFilter: ["open"] });
    }
  }

  /* --------------------------- Stat reveal --------------------------- */
  // The three headline numbers resolve like a fast data readout when the cards come
  // into view: a decelerating count from a same-length start value with fading jitter
  // in the low digits, landing exactly on the real figure. Screen readers only ever
  // get the final value (the animated text is aria-hidden). Reduced motion: no effect.
  var counters = [].slice.call(document.querySelectorAll(".stat-count[data-to]"));
  var DURATION = 1300;

  function formatNumber(el, n) {
    var d = +el.dataset.decimals || 0;
    var s = n.toFixed(d);
    if (el.hasAttribute("data-group")) {
      var parts = s.split(".");
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      s = parts.join(".");
    }
    return (el.dataset.prefix || "") + s + (el.dataset.suffix || "");
  }

  function reveal(el, delay) {
    var to = parseFloat(el.dataset.to), from = parseFloat(el.dataset.from), d = +el.dataset.decimals || 0;
    var step = Math.pow(10, -d), span = to - from;
    var finalText = formatNumber(el, to);
    setTimeout(function () {
      var start = performance.now();
      (function tick() {
        var t = Math.min(1, (performance.now() - start) / DURATION);
        if (t >= 1) {
          el.textContent = finalText;
          // The comparison line blurs in once its number has landed.
          var meta = el.closest(".stat").querySelector(".stat-meta");
          if (meta) meta.classList.add("meta-in");
          return;
        }
        var eased = 1 - Math.pow(1 - t, 3);                       // decelerate toward the end
        var jitter = (Math.random() - 0.5) * span * 0.35 * Math.pow(1 - t, 2);
        var v = from + span * eased + jitter;
        v = Math.round(Math.min(to, Math.max(from, v)) / step) * step;
        el.textContent = formatNumber(el, v);
        // Updates come very fast at first, then spread out as the value settles.
        setTimeout(tick, 16 + 70 * t * t);
      })();
    }, delay);
  }

  if (counters.length && !reduceMotion.matches && "IntersectionObserver" in window) {
    // Lock each number's width to its final value, then show the start value.
    counters.forEach(function (el) {
      el.style.minWidth = el.getBoundingClientRect().width + "px";
      el.textContent = formatNumber(el, parseFloat(el.dataset.from));
      var meta = el.closest(".stat").querySelector(".stat-meta");
      if (meta) meta.classList.add("meta-wait");
    });
    // Each number starts as soon as it is on screen (half of the figure visible), once.
    // Numbers that appear together (the desktop row) start 90ms apart.
    var statsIO = new IntersectionObserver(function (entries) {
      var k = 0;
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        statsIO.unobserve(e.target);
        reveal(e.target, k++ * 90);
      });
    }, { threshold: 0.5 });
    counters.forEach(function (el) { statsIO.observe(el); });
    // Re-lock widths after web fonts settle (the first measurement may use a fallback).
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () {
      counters.forEach(function (el) {
        var cur = el.textContent;
        el.style.minWidth = "";
        el.textContent = formatNumber(el, parseFloat(el.dataset.to));
        el.style.minWidth = el.getBoundingClientRect().width + "px";
        el.textContent = cur;
      });
    });
  }

  /* ------------------------- Floating download ------------------------- */
  // The closing field floats 16px above the bottom of the screen across the page and
  // docks into its slot in the closing section once that slot reaches the same spot.
  // It stays hidden while the hero's own form is on screen, so two forms never show.
  var dock = document.querySelector("[data-dock]");
  var heroForm = document.querySelector(".hero [data-download]");
  if (dock) {
    var slot = dock.parentElement;
    var heroFormVisible = true;
    var queued = false;
    var updateDock = function () {
      queued = false;
      var floatTop = window.innerHeight - 16 - dock.offsetHeight;
      var box = slot.getBoundingClientRect();
      var docked = box.top <= floatTop;
      dock.style.setProperty("--dock-left", box.left + "px");
      dock.style.setProperty("--dock-width", box.width + "px");
      dock.classList.toggle("is-floating", !docked);
      dock.classList.toggle("is-hidden", !docked && heroFormVisible);
      if (dock.classList.contains("is-hidden") && dock.contains(document.activeElement)) document.activeElement.blur();
    };
    var queueDock = function () { if (!queued) { queued = true; requestAnimationFrame(updateDock); } };
    if (heroForm && "IntersectionObserver" in window) {
      new IntersectionObserver(function (es) { heroFormVisible = es[0].isIntersecting; queueDock(); }).observe(heroForm);
    } else {
      heroFormVisible = false;
    }
    window.addEventListener("scroll", queueDock, { passive: true });
    window.addEventListener("resize", queueDock);
    updateDock();
  }

  /* ------------------------- Download (soft gate) ------------------------ */
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  // Hook for Mailchimp later: must never throw or delay the download.
  function collect(data) {
    try { /* intentionally empty until the Mailchimp form address is provided */ } catch (e) {}
  }

  function startDownload() {
    if (!REPORT_PDF) return;
    var a = document.createElement("a");
    a.href = REPORT_PDF; a.download = ""; document.body.appendChild(a); a.click(); a.remove();
  }

  /* The download modal (Liquid Glass): confirms the download that has just started. */
  var dialog = document.getElementById("details");
  var returnFocus = null;

  function openDone(firstName, from) {
    returnFocus = from;
    document.getElementById("details-done-text").textContent = REPORT_PDF
      ? "Thanks, " + firstName + " — your download has started."
      : "Thanks, " + firstName + " — the report download will start here once the PDF is connected.";
    root.classList.add("modal-open");
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open", "");
    document.getElementById("details-done").focus();
  }
  function closeDone() {
    if (dialog.open && dialog.close) dialog.close(); else dialog.removeAttribute("open");
  }
  dialog.addEventListener("close", function () {
    root.classList.remove("modal-open");
    if (returnFocus) returnFocus.focus();
  });
  [].slice.call(dialog.querySelectorAll("[data-close]")).forEach(function (b) { b.addEventListener("click", closeDone); });
  // Click on the dimmed backdrop closes too.
  dialog.addEventListener("click", function (e) { if (e.target === dialog) closeDone(); });

  /* The download form (hero, footer and the floating copy): first name, last name, business email. */
  [].slice.call(document.querySelectorAll("[data-download]")).forEach(function (form) {
    var first = form.querySelector("input[name=firstName]");
    var last = form.querySelector("input[name=lastName]");
    var email = form.querySelector("input[type=email]");
    var msg = form.querySelector(".download-msg");

    function valid(input) {
      var v = input.value.trim();
      return input === email ? EMAIL.test(v) : v.length > 0;
    }

    // Errors show as a red outline on the field; the text is announced for screen readers.
    function sayError(text) {
      msg.classList.add("is-error");
      msg.textContent = text;
    }
    function clearError() {
      msg.classList.remove("is-error");
      msg.textContent = "";
    }

    // Clear each red outline as soon as that field becomes valid.
    form.addEventListener("input", function (e) {
      var t = e.target;
      if (t.getAttribute("aria-invalid") === "true" && valid(t)) t.removeAttribute("aria-invalid");
      if (!form.querySelector("[aria-invalid=true]")) clearError();
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var missing = [];
      [[first, "first name"], [last, "last name"], [email, "business email"]].forEach(function (k) {
        if (valid(k[0])) k[0].removeAttribute("aria-invalid");
        else { k[0].setAttribute("aria-invalid", "true"); missing.push(k); }
      });
      if (missing.length) {
        var bad = missing.length === 1 && missing[0][0] === email && email.value.trim();
        var labels = missing.map(function (m) { return m[1]; });
        var list = labels.length > 1 ? labels.slice(0, -1).join(", ") + " and " + labels[labels.length - 1] : labels[0];
        sayError(bad ? "Enter a valid email address, like name@company.com." : "Please fill in your " + list + ".");
        missing[0][0].focus();
        return;
      }
      clearError();
      var data = { firstName: first.value.trim(), lastName: last.value.trim(), email: email.value.trim() };
      collect(data);
      startDownload();   // never waits on collection
      openDone(data.firstName, email);
    });
  });
})();
