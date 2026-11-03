// Liquid Glass for the report page: the same lens as the countdown (assets/glass.js),
// generalised to any [data-glass] element. Each lens refracts the ribbon of its own
// section (hero or footer): the playing/paused <video>, otherwise the static poster.
// Figma Glass: refraction 1, depth 100, dispersion 0.5, light −45° at 0.8, no frost,
// #017ADB @ 30%. Controls never depend on this; failure leaves the CSS fallback.
(function () {
  "use strict";

  var root = document.documentElement;
  var targets = [].slice.call(document.querySelectorAll("[data-glass]"));

  function fallback() {
    root.classList.remove("glass-pending");
    targets.forEach(function (el) {
      el.classList.remove("is-glass");
      var c = el.querySelector(":scope > canvas");
      if (c) c.remove();
    });
  }
  if (!targets.length || !root.classList.contains("glass-pending")) return fallback();

  var VERT = "attribute vec2 a_pos;varying vec2 v_uv;void main(){v_uv=vec2(a_pos.x*.5+.5,.5-a_pos.y*.5);gl_Position=vec4(a_pos,0.,1.);}";
  var FRAG = [
    "precision highp float;",
    "varying vec2 v_uv;",
    "uniform sampler2D u_tex; uniform float u_hasTex;",
    "uniform vec2 u_size; uniform vec2 u_offset; uniform vec2 u_draw; uniform float u_dpr; uniform float u_shade;",
    "const vec2 LIGHT_DIR = vec2(-0.70710678, -0.70710678);",
    "const vec3 TINT = vec3(1.0, 122.0, 219.0) / 255.0;",
    "float pill(vec2 p, vec2 h){ float r=h.y; vec2 q=abs(p)-h+r; return length(max(q,0.))+min(max(q.x,q.y),0.)-r; }",
    "vec3 backdrop(vec2 px){ vec2 uv=(u_offset+px)/u_draw;",
    "  if(u_hasTex<.5||uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.) return vec3(0.); return texture2D(u_tex,uv).rgb; }",
    "void main(){",
    "  vec2 px=v_uv*u_size; vec2 h=u_size*.5; vec2 p=px-h; float d=pill(p,h);",
    "  float alpha=clamp(.5-d*u_dpr,0.,1.); if(alpha<=0.){gl_FragColor=vec4(0.);return;}",
    "  vec2 e=vec2(.5,0.);",
    "  vec2 n=normalize(vec2(pill(p+e.xy,h)-pill(p-e.xy,h), pill(p+e.yx,h)-pill(p-e.yx,h))+1e-5);",
    "  float t=clamp(-d/h.y,0.,1.); float bend=pow(1.-t,3.);",
    "  vec2 shift=n*bend*h.y*.9; float spread=.04;",
    "  vec3 col; col.r=backdrop(px+shift*(1.+spread)).r; col.g=backdrop(px+shift).g; col.b=backdrop(px+shift*(1.-spread)).b;",
    "  col=mix(col,TINT,.3)*(1.-u_shade);",
    "  float facing=dot(n,LIGHT_DIR); float rim=1.-smoothstep(0.,1.6,-d); float edge=1.-smoothstep(0.,7.,-d);",
    "  float spec=rim*(pow(max(facing,0.),1.5)+.45*pow(max(-facing,0.),1.5))*.8;",
    "  col+=vec3(spec*.85+edge*.12*.8*(.6+.4*facing));",
    "  gl_FragColor=vec4(min(col,1.)*alpha,alpha);",
    "}"
  ].join("\n");

  function createLens(el) {
    var scope = el.closest(".has-ribbon");
    var img = scope && scope.querySelector(".ribbon img");
    var video = scope && scope.querySelector(".ribbon video");
    if (!img || !video) return null;
    var canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    var gl;
    try { gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false }); } catch (e) { gl = null; }
    if (!gl) return null;
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; }
    var vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return null;
    var prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var a = gl.getAttribLocation(prog, "a_pos"); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    var tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(function (k) { gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE); });
    [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach(function (k) { gl.texParameteri(gl.TEXTURE_2D, k, gl.LINEAR); });
    var u = {};
    ["u_tex", "u_hasTex", "u_size", "u_offset", "u_draw", "u_dpr", "u_shade"].forEach(function (k) { u[k] = gl.getUniformLocation(prog, k); });
    gl.uniform1i(u.u_tex, 0);
    gl.uniform1f(u.u_shade, parseFloat(el.getAttribute("data-glass")) || 0);
    var has = false, src = null, visible = true;

    function source() {
      if (video.classList.contains("is-visible") && video.readyState >= 2) return video;
      if (img.complete && img.naturalWidth) return img;
      return null;
    }
    function upload() {
      var s = source(); if (!s) return;
      try { gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, s); has = true; src = s; } catch (e) {}
    }
    function draw() {
      if (!visible || gl.isContextLost()) return;
      var c = el.getBoundingClientRect();
      if (!c.width || !c.height) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 3);
      var w = Math.round(c.width * dpr), h = Math.round(c.height * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
      var s = src || img;
      var iw = s.videoWidth || s.naturalWidth || 16, ih = s.videoHeight || s.naturalHeight || 9;
      var box = img.getBoundingClientRect();
      var k = Math.max(box.width / iw, box.height / ih), dw = iw * k, dh = ih * k;
      var ox = box.left + (box.width - dw) * 0.5, oy = box.top + (box.height - dh);
      gl.uniform1f(u.u_hasTex, has ? 1 : 0);
      gl.uniform2f(u.u_size, c.width, c.height);
      gl.uniform2f(u.u_offset, c.left - ox, c.top - oy);
      gl.uniform2f(u.u_draw, dw, dh);
      gl.uniform1f(u.u_dpr, dpr);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    canvas.addEventListener("webglcontextlost", function (e) { e.preventDefault(); fallback(); });
    el.insertBefore(canvas, el.firstChild);
    return { el: el, video: video, img: img, upload: upload, draw: draw, setVisible: function (v) { visible = v; if (v) { upload(); draw(); } } };
  }

  var lenses = [];
  for (var i = 0; i < targets.length; i++) {
    var lens = createLens(targets[i]);
    if (!lens) return fallback();
    lenses.push(lens);
  }

  function refresh() { lenses.forEach(function (l) { l.upload(); l.draw(); }); }
  function drawAll() { lenses.forEach(function (l) { l.draw(); }); }

  // Per video: redraw its lenses once per decoded frame while it plays.
  var videos = [];
  lenses.forEach(function (l) { if (videos.indexOf(l.video) < 0) videos.push(l.video); });
  videos.forEach(function (v) {
    var mine = lenses.filter(function (l) { return l.video === v; });
    var looping = false;
    function frame() {
      if (!looping) return;
      mine.forEach(function (l) { l.upload(); l.draw(); });
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(frame); else requestAnimationFrame(frame);
    }
    v.addEventListener("playing", function () { if (!looping) { looping = true; frame(); } });
    ["pause", "emptied"].forEach(function (ev) { v.addEventListener(ev, function () { looping = false; mine.forEach(function (l) { l.upload(); l.draw(); }); }); });
    mine.forEach(function (l) { l.img.addEventListener("load", function () { l.upload(); l.draw(); }); });
  });

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { lenses.forEach(function (l) { if (l.el === e.target) l.setVisible(e.isIntersecting); }); });
    });
    lenses.forEach(function (l) { io.observe(l.el); });
  }
  window.addEventListener("resize", refresh);
  window.addEventListener("scroll", drawAll, { passive: true });
  if (window.ResizeObserver) { var ro = new ResizeObserver(refresh); lenses.forEach(function (l) { ro.observe(l.el); }); }
  if (window.MutationObserver) lenses.forEach(function (l) { new MutationObserver(refresh).observe(l.el, { attributes: true, attributeFilter: ["hidden"] }); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);

  refresh();
  targets.forEach(function (el) { el.classList.add("is-glass"); });
  root.classList.remove("glass-pending");
})();
