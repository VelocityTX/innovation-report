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
  var REPORT_PDF = "";

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

  /* ------------------------- Download (soft gate) ------------------------ */
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  // Hook for Mailchimp later: must never throw or delay the download.
  function collect(email) {
    try { /* intentionally empty until the Mailchimp form address is provided */ } catch (e) {}
  }

  [].slice.call(document.querySelectorAll("[data-download]")).forEach(function (form) {
    var input = form.querySelector("input[type=email]");
    var submit = form.querySelector("button[type=submit]");
    var msg = form.querySelector(".download-msg");

    function say(text, isError, html) {
      msg.classList.toggle("is-error", !!isError);
      if (html) msg.innerHTML = html; else msg.textContent = text;
    }

    input.addEventListener("input", function () {
      if (input.getAttribute("aria-invalid") === "true" && EMAIL.test(input.value.trim())) {
        input.removeAttribute("aria-invalid");
        say("");
      }
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = input.value.trim();
      if (!email) { input.setAttribute("aria-invalid", "true"); say("Enter your business email to download the report.", true); input.focus(); return; }
      if (!EMAIL.test(email)) { input.setAttribute("aria-invalid", "true"); say("Enter a valid email address, like name@company.com.", true); input.focus(); return; }

      input.removeAttribute("aria-invalid");
      submit.setAttribute("aria-busy", "true");
      submit.disabled = true;
      collect(email);

      // The download never waits on collection.
      setTimeout(function () {
        submit.removeAttribute("aria-busy");
        submit.disabled = false;
        form.classList.add("is-done");
        if (REPORT_PDF) {
          var a = document.createElement("a");
          a.href = REPORT_PDF; a.download = ""; document.body.appendChild(a); a.click(); a.remove();
          say("", false, 'Thanks — your download has started. <a href="' + REPORT_PDF + '" download>Download the report (PDF)</a>');
        } else {
          say("Thanks — the report download will start here once the PDF is connected.");
        }
        msg.setAttribute("tabindex", "-1");
        msg.focus();
      }, 350);
    });
  });
})();
