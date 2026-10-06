// Ribbon background video + Play/Pause control.
//
// The static artwork (<picture>) is always underneath. The video is only given a
// source when motion is wanted, stays invisible until it is actually playing, and
// fades in over the identical poster frame. Any failure leaves the static art.
(function () {
  "use strict";

  var ribbon = document.querySelector(".ribbon");
  var video = ribbon && ribbon.querySelector("video");
  var button = document.querySelector(".motion-toggle");
  if (!video || !button || typeof video.play !== "function") return;

  // Must match the CSS media query that switches to the mobile composition.
  var compact = matchMedia("(max-aspect-ratio: 1/1), (max-width: 767px)");
  var reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  var ASSETS = {
    desktop: {
      width: 2560, height: 1440, bitrate: 4000000,
      sources: [
        { file: "assets/media/ribbon-desktop-av1.mp4", type: 'video/mp4; codecs="av01.0.12M.10"', av1: true },
        { file: "assets/media/ribbon-desktop-hevc.mp4", type: 'video/mp4; codecs="hvc1.2.4.L150.B0"' },
        { file: "assets/media/ribbon-desktop-h264.mp4", type: 'video/mp4; codecs="avc1.640032"' }
      ]
    },
    mobile: {
      width: 810, height: 1440, bitrate: 1100000,
      sources: [
        { file: "assets/media/ribbon-mobile-av1.mp4", type: 'video/mp4; codecs="av01.0.08M.10"', av1: true },
        { file: "assets/media/ribbon-mobile-hevc.mp4", type: 'video/mp4; codecs="hvc1.2.4.L120.B0"' },
        { file: "assets/media/ribbon-mobile-h264.mp4", type: 'video/mp4; codecs="avc1.640028"' }
      ]
    }
  };

  var wantsMotion = false;   // the visitor's (or the default) intent
  var userChose = false;     // set once the visitor uses the control
  var loadedFor = null;      // "desktop" | "mobile" once a source is set
  var unavailable = false;   // no playable source in this browser

  function connectionIsConstrained() {
    var c = navigator.connection;
    return !!(c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || "")));
  }

  // Prefer AV1 only where it decodes efficiently (hardware), then HEVC, then H.264.
  function pickSource(asset) {
    var candidates = asset.sources.filter(function (s) { return video.canPlayType(s.type) !== ""; });
    if (!candidates.length) return Promise.resolve(null);
    var mc = navigator.mediaCapabilities;
    var first = candidates[0];
    if (!first.av1 || !mc || !mc.decodingInfo) {
      return Promise.resolve(first.av1 && candidates[1] ? candidates[1] : first);
    }
    return mc.decodingInfo({
      type: "file",
      video: { contentType: first.type, width: asset.width, height: asset.height, bitrate: asset.bitrate, framerate: 16 }
    }).then(function (info) {
      return info.supported && info.powerEfficient ? first : (candidates[1] || first);
    }, function () { return candidates[1] || first; });
  }

  function render() {
    var playing = wantsMotion && !unavailable;
    button.dataset.state = playing ? "playing" : "paused";
    button.setAttribute("aria-label", playing ? "Pause background animation" : "Play background animation");
    button.hidden = unavailable;
  }

  function load() {
    var key = compact.matches ? "mobile" : "desktop";
    if (loadedFor === key) return Promise.resolve(true);
    return pickSource(ASSETS[key]).then(function (source) {
      if (!source) { unavailable = true; render(); return false; }
      var resumeAt = loadedFor ? video.currentTime : 0;
      loadedFor = key;
      video.classList.remove("is-visible");
      video.src = source.file;
      if (resumeAt) {
        video.addEventListener("loadedmetadata", function () { video.currentTime = resumeAt; }, { once: true });
      }
      return true;
    });
  }

  function play() {
    return load().then(function (ok) {
      if (!ok || !wantsMotion) return;
      video.muted = true;
      var attempt = video.play();
      if (attempt && attempt.catch) {
        attempt.catch(function (err) {
          // Autoplay refused (iOS Low Power Mode, browser settings, …): stay on
          // the static art and offer Play.
          if (err && err.name === "NotAllowedError") { wantsMotion = false; render(); }
        });
      }
    });
  }

  function setMotion(on) {
    wantsMotion = on;
    render();
    if (on) play(); else if (loadedFor) video.pause();
  }

  video.addEventListener("playing", function () { video.classList.add("is-visible"); });
  video.addEventListener("error", function () {
    // Network or decode failure: drop the source so no broken element shows, keep
    // the static art, and offer Play so the visitor can try again.
    if (!video.getAttribute("src")) return;
    video.classList.remove("is-visible");
    video.removeAttribute("src");
    video.load();
    loadedFor = null;
    wantsMotion = false;
    render();
  });

  button.addEventListener("click", function () {
    userChose = true;
    setMotion(!wantsMotion);
  });

  reduceMotion.addEventListener && reduceMotion.addEventListener("change", function () {
    if (reduceMotion.matches) setMotion(false);
    else if (!userChose) setMotion(true);
  });

  compact.addEventListener && compact.addEventListener("change", function () {
    if (!loadedFor) return;
    var resume = wantsMotion;
    load().then(function () { if (resume) play(); });
  });

  document.addEventListener("visibilitychange", function () {
    if (!loadedFor) return;
    if (document.hidden) video.pause();
    else if (wantsMotion) play();
  });

  wantsMotion = !reduceMotion.matches && !connectionIsConstrained();
  button.hidden = false;
  render();
  if (wantsMotion) play();
})();
