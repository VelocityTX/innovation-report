// Blur In: a dependency-free reproduction of ONONC "Blur In Text"
// (https://dev.ononc.com/text/blur-in-text), which is built on Motion/React:
//   per word: opacity 0 → 1, translateY(12px) → 0, blur(10px) → 0
//   duration 0.5s, easeOut (Motion's easeOut = cubic-bezier(0, 0, 0.58, 1) = CSS ease-out)
//   staggerChildren 0.09s, triggered once at 40% visibility (viewport amount 0.4)
// Headlines marked [data-blur-in] animate word by word. Body copy marked
// [data-blur-in-block] gets the same motion as a single unit (no split). Screen readers
// get the full text once; the animated word pieces are hidden from them.
// Image groups marked [data-blur-in-items] reveal image by image (each <li>), with the
// same stagger as words; the container is what's watched for 40% visibility, since a
// marquee track can be far wider than the screen.
// Reduced motion: nothing is split or animated.
(function () {
  "use strict";

  var root = document.documentElement;
  var STAGGER = 0.09; // seconds between words (ONONC default)
  var targets = [].slice.call(document.querySelectorAll("[data-blur-in]"));
  var blocks = [].slice.call(document.querySelectorAll("[data-blur-in-block]"));
  var groups = [].slice.call(document.querySelectorAll("[data-blur-in-items]"));

  function done() { root.classList.remove("blur-in-pending"); }
  if (!(targets.length || blocks.length || groups.length) || !("IntersectionObserver" in window) ||
      matchMedia("(prefers-reduced-motion: reduce)").matches) return done();

  targets.forEach(function (el) {
    var full = el.textContent.replace(/\s+/g, " ").trim();
    var index = 0;
    var delay = parseFloat(el.getAttribute("data-blur-in")) || 0;

    // Split every text node into word spans, keeping existing structure (line spans etc.).
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      if (!node.nodeValue.trim()) return;
      var frag = document.createDocumentFragment();
      node.nodeValue.split(/(\s+)/).forEach(function (part) {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
        var w = document.createElement("span");
        w.className = "bi-word";
        w.setAttribute("aria-hidden", "true");
        w.style.transitionDelay = (delay + index * STAGGER).toFixed(2) + "s";
        w.textContent = part;
        frag.appendChild(w);
        index++;
      });
      node.parentNode.replaceChild(frag, node);
    });

    var sr = document.createElement("span");
    sr.className = "sr-only";
    sr.textContent = full;
    el.insertBefore(sr, el.firstChild);
    el.classList.add("bi-ready");
  });
  blocks.forEach(function (el) { el.classList.add("bi-block"); });
  groups.forEach(function (el) {
    [].slice.call(el.querySelectorAll("li")).forEach(function (li, i) {
      li.classList.add("bi-item");
      li.style.transitionDelay = (i * STAGGER).toFixed(2) + "s";
    });
  });
  done();

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add("bi-in");
      io.unobserve(e.target); // once
    });
  }, { threshold: 0.4 });
  targets.concat(blocks, groups).forEach(function (el) { io.observe(el); });
})();
