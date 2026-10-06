// Liquid Glass CTA.
//
// A small WebGL lens drawn behind the CTA label. It samples the same ribbon the
// visitor sees (the playing/paused <video>, otherwise the static poster), maps
// the CTA's position into that artwork using the same object-fit/position as the
// CSS, and refracts it through a pill-shaped lens using the Figma Glass settings:
// refraction 1, depth 100, dispersion 0.5, light −45° at 0.8, no frost, and the
// #017ADB @ 30% fill. The link itself never depends on any of this.
(function () {
  "use strict";

  var root = document.documentElement;
  var cta = document.querySelector(".cta");
  var ribbon = document.querySelector(".ribbon");
  var img = ribbon && ribbon.querySelector("img");
  var video = ribbon && ribbon.querySelector("video");

  function fallback() {
    root.classList.remove("glass-pending");
    if (cta) cta.classList.remove("is-glass");
    var c = cta && cta.querySelector("canvas");
    if (c) c.remove();
  }

  if (!cta || !img || !video || !root.classList.contains("glass-pending")) return fallback();

  var VERT = [
    "attribute vec2 a_pos;",
    "varying vec2 v_uv;",
    "void main() {",
    "  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);",
    "  gl_Position = vec4(a_pos, 0.0, 1.0);",
    "}"
  ].join("\n");

  var FRAG = [
    "precision highp float;",
    "varying vec2 v_uv;",
    "uniform sampler2D u_tex;",
    "uniform float u_hasTex;",
    "uniform vec2 u_size;",    // CTA size, CSS px
    "uniform vec2 u_offset;",  // CTA top-left relative to the drawn artwork, CSS px
    "uniform vec2 u_draw;",    // drawn artwork size, CSS px
    "uniform float u_dpr;",
    "",
    "const float REFRACTION = 1.0;",
    "const float DISPERSION = 0.5;",
    "const float LIGHT = 0.8;",
    "const vec2 LIGHT_DIR = vec2(-0.70710678, -0.70710678);", // −45°: from the top left
    "const vec3 TINT = vec3(1.0, 122.0, 219.0) / 255.0;",
    "const float TINT_ALPHA = 0.3;",
    "",
    "float pill(vec2 p, vec2 halfSize) {",
    "  float r = halfSize.y;",
    "  vec2 q = abs(p) - halfSize + r;",
    "  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;",
    "}",
    "",
    "vec3 backdrop(vec2 px) {",
    "  vec2 uv = (u_offset + px) / u_draw;",
    "  if (u_hasTex < 0.5 || uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec3(0.0);",
    "  return texture2D(u_tex, uv).rgb;",
    "}",
    "",
    "void main() {",
    "  vec2 px = v_uv * u_size;",
    "  vec2 halfSize = u_size * 0.5;",
    "  vec2 p = px - halfSize;",
    "  float d = pill(p, halfSize);",           // < 0 inside, CSS px
    "  float alpha = clamp(0.5 - d * u_dpr, 0.0, 1.0);",
    "  if (alpha <= 0.0) { gl_FragColor = vec4(0.0); return; }",
    "",
    "  vec2 e = vec2(0.5, 0.0);",
    "  vec2 n = normalize(vec2(pill(p + e.xy, halfSize) - pill(p - e.xy, halfSize),",
    "                          pill(p + e.yx, halfSize) - pill(p - e.yx, halfSize)) + 1e-5);",
    "",
    // Depth 100 → the whole half-height is bevelled. A squircle-style profile keeps
    // the centre flat and bends light hardest at the rim, pulling in the artwork
    // just outside the pill.
    "  float bevel = halfSize.y;",
    "  float t = clamp(-d / bevel, 0.0, 1.0);",
    "  float bend = pow(1.0 - t, 3.0);",
    "  vec2 shift = n * bend * halfSize.y * 0.9 * REFRACTION;",
    "  float spread = 0.08 * DISPERSION;",
    "  vec3 col;",
    "  col.r = backdrop(px + shift * (1.0 + spread)).r;",
    "  col.g = backdrop(px + shift).g;",
    "  col.b = backdrop(px + shift * (1.0 - spread)).b;",
    "",
    "  col = mix(col, TINT, TINT_ALPHA);",
    "",
    // Specular rim: bright where the edge faces the light, fainter on the far side.
    "  float facing = dot(n, LIGHT_DIR);",
    "  float rim = 1.0 - smoothstep(0.0, 1.6, -d);",
    "  float edge = 1.0 - smoothstep(0.0, 7.0, -d);",
    "  float spec = rim * (pow(max(facing, 0.0), 1.5) + 0.45 * pow(max(-facing, 0.0), 1.5)) * LIGHT;",
    "  float sheen = edge * 0.12 * LIGHT * (0.6 + 0.4 * facing);",
    "  col += vec3(spec * 0.85 + sheen);",
    "",
    "  gl_FragColor = vec4(min(col, 1.0) * alpha, alpha);",
    "}"
  ].join("\n");

  var canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  var gl;
  try {
    gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: false });
  } catch (e) { gl = null; }
  if (!gl) return fallback();

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  }
  var vs = compile(gl.VERTEX_SHADER, VERT);
  var fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return fallback();
  var program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return fallback();
  gl.useProgram(program);

  var buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  var aPos = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  var texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  var u = {};
  ["u_tex", "u_hasTex", "u_size", "u_offset", "u_draw", "u_dpr"].forEach(function (name) {
    u[name] = gl.getUniformLocation(program, name);
  });
  gl.uniform1i(u.u_tex, 0);

  var hasTexture = false;
  var textureSource = null; // the element last uploaded

  // Which element is currently visible behind the CTA.
  function currentSource() {
    if (video.classList.contains("is-visible") && video.readyState >= 2) return video;
    if (img.complete && img.naturalWidth) return img;
    return null;
  }

  function upload(source) {
    try {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      hasTexture = true;
      textureSource = source;
    } catch (e) {
      // e.g. a cross-origin or not-yet-decodable frame; keep the previous texture.
    }
  }

  function draw() {
    if (gl.isContextLost()) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    var c = cta.getBoundingClientRect();
    var w = Math.max(1, Math.round(c.width * dpr));
    var h = Math.max(1, Math.round(c.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);

    // Same geometry as `object-fit: cover; object-position: 50% 100%`.
    var source = textureSource || img;
    var iw = source.videoWidth || source.naturalWidth || 16;
    var ih = source.videoHeight || source.naturalHeight || 9;
    var box = img.getBoundingClientRect();
    var scale = Math.max(box.width / iw, box.height / ih);
    var dw = iw * scale, dh = ih * scale;
    var ox = box.left + (box.width - dw) * 0.5;
    var oy = box.top + (box.height - dh);

    gl.uniform1f(u.u_hasTex, hasTexture ? 1 : 0);
    gl.uniform2f(u.u_size, c.width, c.height);
    gl.uniform2f(u.u_offset, c.left - ox, c.top - oy);
    gl.uniform2f(u.u_draw, dw, dh);
    gl.uniform1f(u.u_dpr, dpr);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // Re-upload the static source and redraw (poster loaded, video paused, resize…).
  function refresh() {
    var source = currentSource();
    if (source) upload(source);
    draw();
  }

  // While the video plays, redraw once per decoded frame (16 fps), not per display frame.
  var looping = false;
  function onFrame() {
    if (!looping) return;
    if (video.readyState >= 2) upload(video);
    draw();
    schedule();
  }
  function schedule() {
    if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(onFrame);
    else requestAnimationFrame(onFrame);
  }
  function startLoop() {
    if (looping) return;
    looping = true;
    schedule();
  }
  function stopLoop() {
    looping = false;
    refresh();
  }

  video.addEventListener("playing", startLoop);
  video.addEventListener("pause", stopLoop);
  video.addEventListener("emptied", stopLoop);
  img.addEventListener("load", refresh);
  window.addEventListener("resize", refresh);
  window.addEventListener("scroll", draw, { passive: true });
  if (window.ResizeObserver) new ResizeObserver(refresh).observe(cta);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);

  canvas.addEventListener("webglcontextlost", function (e) {
    e.preventDefault();
    looping = false;
    fallback();
  });

  cta.insertBefore(canvas, cta.firstChild);
  refresh();
  cta.classList.add("is-glass");
  root.classList.remove("glass-pending");
  if (!video.paused && video.classList.contains("is-visible")) startLoop();
})();
