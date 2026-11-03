// Report launch: the single source of truth for when "/" switches from the countdown to
// the report. Loaded (blocking, in <head>) by "/" and "/countdown/".
//
// ┌──────────────────────────────────────────────────────────────────────────────┐
// │ EMERGENCY OVERRIDE — change this one value and push:                         │
// │   null         automatic, time-based (normal)                                │
// │   "countdown"  force the countdown (/ always goes to /countdown/)            │
// │   "report"     force the report    (/ always shows the report)               │
// └──────────────────────────────────────────────────────────────────────────────┘
var SOI_OVERRIDE = null;

// November 4, 2026, 9:00 AM America/Chicago (CST, UTC−6). An absolute instant, so the
// visitor's own timezone never matters.
var SOI_LAUNCH_AT = "2026-11-04T15:00:00Z";

(function () {
  "use strict";
  var launchAt = Date.parse(SOI_LAUNCH_AT);

  // Testing only: ?now=… simulates the clock for this page load (it then keeps ticking in
  // real time). It is ignored unless the parameter is in the URL, so normal visitors are
  // never affected, and it is carried along when the countdown navigates to "/" so a
  // simulated launch can be followed end to end. Accepted forms:
  //   ?now=2026-11-04T14:59:50Z   an absolute instant
  //   ?now=launch                 exactly the launch moment
  //   ?now=launch-10s             relative to launch (s, m or h); for "after", use
  //   ?now=launch%2B1m            "%2B" for "+" (a bare "+" in a URL also works: it
  //                               arrives as a space and is read as "+")
  var offset = 0, testing = false;
  var param = null;
  try { param = new URLSearchParams(location.search).get("now"); } catch (e) {}
  if (param) {
    var sim = NaN, rel = /^launch(?:\s*([+ -])\s*(\d+(?:\.\d+)?)(s|m|h)?)?$/.exec(param);
    if (rel) sim = launchAt + (rel[1] ? (rel[1] === "-" ? -1 : 1) * parseFloat(rel[2]) * ({ s: 1e3, m: 6e4, h: 3.6e6 }[rel[3] || "s"]) : 0);
    else sim = Date.parse(param);
    if (!isNaN(sim)) { offset = sim - Date.now(); testing = true; }
  }

  function now() { return Date.now() + offset; }

  window.SOILaunch = {
    at: launchAt,
    override: SOI_OVERRIDE,
    now: now,
    testing: testing,
    // Has the report launched (honouring the override)?
    launched: function () {
      if (SOI_OVERRIDE === "report") return true;
      if (SOI_OVERRIDE === "countdown") return false;
      return now() >= launchAt;
    },
    // Query string to carry a simulated clock across a navigation ("" for real visitors).
    carry: function () {
      return testing ? "?now=" + encodeURIComponent(new Date(now()).toISOString()) : "";
    }
  };
})();
