// Report page behaviour (local design preview).
//  - Ribbon videos: hero + footer share one source choice; each plays only while on
//    screen, over its matching static poster. Reduced motion / Data Saver: posters only.
//  - One Play/Pause control drives every animation on the page (videos + logo marquees).
//  - Logo strips become a slow marquee only when they don't fit their container.
//  - Download forms: soft gate. A valid email immediately unlocks the report; email
//    collection (Mailchimp) plugs into collect() later and never blocks the download.
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
    var statsIO = new IntersectionObserver(function (entries) {
      if (!entries.some(function (e) { return e.isIntersecting; })) return;
      statsIO.disconnect();
      counters.forEach(function (el, i) { reveal(el, i * 90); });
    }, { threshold: 0.35 });
    statsIO.observe(document.querySelector(".stats"));
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
      var docked = slot.getBoundingClientRect().top <= floatTop;
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

  /* Step 2: the details modal (Liquid Glass). Opens once a valid email is entered. */
  var dialog = document.getElementById("details");
  var detailsForm = document.getElementById("details-form");
  var done = document.getElementById("details-done");
  var detailsError = document.getElementById("details-error");
  var pendingEmail = "";
  var returnFocus = null;

  function openDetails(email, from) {
    pendingEmail = email;
    returnFocus = from;
    detailsForm.hidden = false;
    done.hidden = true;
    detailsError.textContent = "";
    [].slice.call(detailsForm.querySelectorAll("[aria-invalid]")).forEach(function (el) { el.removeAttribute("aria-invalid"); });
    root.classList.add("modal-open");
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open", "");
    var first = detailsForm.querySelector("input[name=workplace]");
    if (first) first.focus();
  }
  function closeDetails() {
    if (dialog.open && dialog.close) dialog.close(); else dialog.removeAttribute("open");
  }
  dialog.addEventListener("close", function () {
    root.classList.remove("modal-open");
    if (returnFocus) returnFocus.focus();
  });
  [].slice.call(dialog.querySelectorAll("[data-close]")).forEach(function (b) { b.addEventListener("click", closeDetails); });
  // Click on the dimmed backdrop closes too.
  dialog.addEventListener("click", function (e) { if (e.target === dialog) closeDetails(); });

  // Clear the red outline as soon as a field becomes valid.
  detailsForm.addEventListener("input", function (e) {
    var t = e.target;
    if (t.name === "workplace") t.closest("fieldset").removeAttribute("aria-invalid");
    else if (t.value && t.value.trim()) t.removeAttribute("aria-invalid");
  });
  detailsForm.addEventListener("change", function (e) {
    if (e.target.name === "workplace") e.target.closest("fieldset").removeAttribute("aria-invalid");
    else if (e.target.value) e.target.removeAttribute("aria-invalid");
  });

  detailsForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var f = detailsForm.elements;
    var missing = [];
    var workplace = detailsForm.querySelector("input[name=workplace]:checked");
    var fieldset = detailsForm.querySelector("fieldset[data-required]");
    if (!workplace) { fieldset.setAttribute("aria-invalid", "true"); missing.push({ el: f.workplace[0], label: "where you work" }); }
    [["company", "company"], ["age", "age"], ["firstName", "first name"], ["lastName", "last name"]].forEach(function (k) {
      var el = f[k[0]];
      if (!el.value || !el.value.trim()) { el.setAttribute("aria-invalid", "true"); missing.push({ el: el, label: k[1] }); }
    });
    if (missing.length) {
      var labels = missing.map(function (m) { return m.label; });
      var list = labels.length > 1 ? labels.slice(0, -1).join(", ") + " and " + labels[labels.length - 1] : labels[0];
      detailsError.textContent = "Please fill in " + list + ".";
      missing[0].el.focus();
      return;
    }
    var data = {
      email: pendingEmail,
      workplace: workplace.value,
      company: f.company.value.trim(),
      age: f.age.value,
      firstName: f.firstName.value.trim(),
      lastName: f.lastName.value.trim()
    };
    collect(data);
    startDownload();   // never waits on collection
    document.getElementById("details-done-text").textContent = REPORT_PDF
      ? "Thanks, " + data.firstName + " — your download has started."
      : "Thanks, " + data.firstName + " — the report download will start here once the PDF is connected.";
    detailsForm.hidden = true;
    done.hidden = false;
    done.focus();
  });

  /* Step 1: business email (hero, footer and the floating field). */
  [].slice.call(document.querySelectorAll("[data-download]")).forEach(function (form) {
    var input = form.querySelector("input[type=email]");
    var msg = form.querySelector(".download-msg");

    // Errors show as a red outline on the field; the text is announced for screen readers.
    function sayError(text) {
      msg.classList.add("is-error");
      msg.textContent = text;
    }
    function clearError() {
      input.removeAttribute("aria-invalid");
      msg.classList.remove("is-error");
      msg.textContent = "";
    }

    input.addEventListener("input", function () {
      if (input.getAttribute("aria-invalid") === "true" && EMAIL.test(input.value.trim())) clearError();
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = input.value.trim();
      if (!email) { input.setAttribute("aria-invalid", "true"); sayError("Enter your business email to download the report."); input.focus(); return; }
      if (!EMAIL.test(email)) { input.setAttribute("aria-invalid", "true"); sayError("Enter a valid email address, like name@company.com."); input.focus(); return; }
      clearError();
      openDetails(email, input);
    });
  });
})();
