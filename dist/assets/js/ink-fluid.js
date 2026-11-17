/* TeaCafe home: ink-fluid cursor effect, a WebGL2 port of Art-Of-Ink's project_5.pde
 * (PixelFlow DwFluid2D with the painting re-injected as ink density).
 *
 * The picture under the cursor is the live background: the scroll-scrubbed film plus the
 * journey-live overlay (waterfall threads, birds, boat). Moving the pointer pushes a velocity
 * field (stable fluids: advection, vorticity confinement, pressure projection); the picture is
 * advected along it as ink, and wherever the fluid has calmed the real picture is mixed back in
 * slowly (project_5's 0.009 re-injection), so the painting smears, swirls and then settles.
 *
 * Cost control: the canvas only renders while the fluid is disturbed; after a few calm seconds
 * it hides and the untouched film/overlay underneath show through, pixel-identical.
 * No WebGL2 / float render targets / reduced motion: never attaches, page is unchanged.
 *
 *   const fluid = TeaInkFluid.attach(canvas, { video, overlay, active: () => bool });
 *   fluid.destroy();
 */
(function (global) {
  'use strict';

  const VERT = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main(){ vUv = aPos * .5 + .5; gl_Position = vec4(aPos, 0., 1.); }`;

  // Background picture at screen uv: film (object-fit: cover) under the premultiplied overlay.
  const SOURCE = `
uniform sampler2D uVideo, uOverlay; uniform vec4 uCover; uniform float uHasOverlay;
vec3 source(vec2 uv){
  vec3 film = texture(uVideo, uv * uCover.xy + uCover.zw).rgb;
  vec4 live = texture(uOverlay, uv) * uHasOverlay;
  return live.rgb + film * (1. - live.a);
}`;

  const FRAG = {
    // Velocity is capped (sim px/s) so vorticity confinement can never run away.
    advect: `uniform sampler2D uVel, uSrc; uniform vec2 uTexel; uniform float uDt, uDecay;
      void main(){ vec2 p = vUv - uDt * texture(uVel, vUv).xy * uTexel; vec4 v = uDecay * texture(uSrc, p);
        float s = length(v.xy); o = vec4(s > 900. ? v.xy * (900. / s) : v.xy, 0., 1.); }`,
    splat: `uniform sampler2D uSrc; uniform vec2 uPoint, uForce; uniform float uRadius, uAspect;
      void main(){ vec2 d = vUv - uPoint; d.x *= uAspect; float g = exp(-dot(d, d) / uRadius);
        o = texture(uSrc, vUv) + vec4(uForce * g, 0., 0.); }`,
    curl: `uniform sampler2D uVel; uniform vec2 uTexel;
      void main(){ float l = texture(uVel, vUv - vec2(uTexel.x, 0.)).y, r = texture(uVel, vUv + vec2(uTexel.x, 0.)).y;
        float b = texture(uVel, vUv - vec2(0., uTexel.y)).x, t = texture(uVel, vUv + vec2(0., uTexel.y)).x;
        o = vec4(.5 * (r - l - t + b), 0., 0., 1.); }`,
    vorticity: `uniform sampler2D uVel, uCurl; uniform vec2 uTexel; uniform float uStrength, uDt;
      void main(){ float l = texture(uCurl, vUv - vec2(uTexel.x, 0.)).x, r = texture(uCurl, vUv + vec2(uTexel.x, 0.)).x;
        float b = texture(uCurl, vUv - vec2(0., uTexel.y)).x, t = texture(uCurl, vUv + vec2(0., uTexel.y)).x;
        float c = texture(uCurl, vUv).x; vec2 f = .5 * vec2(abs(t) - abs(b), abs(r) - abs(l));
        f /= length(f) + 1e-4; f *= uStrength * c; f.y *= -1.;
        o = vec4(texture(uVel, vUv).xy + f * uDt, 0., 1.); }`,
    divergence: `uniform sampler2D uVel; uniform vec2 uTexel;
      void main(){ float l = texture(uVel, vUv - vec2(uTexel.x, 0.)).x, r = texture(uVel, vUv + vec2(uTexel.x, 0.)).x;
        float b = texture(uVel, vUv - vec2(0., uTexel.y)).y, t = texture(uVel, vUv + vec2(0., uTexel.y)).y;
        o = vec4(.5 * (r - l + t - b), 0., 0., 1.); }`,
    pressure: `uniform sampler2D uPressure, uDiv; uniform vec2 uTexel;
      void main(){ float l = texture(uPressure, vUv - vec2(uTexel.x, 0.)).x, r = texture(uPressure, vUv + vec2(uTexel.x, 0.)).x;
        float b = texture(uPressure, vUv - vec2(0., uTexel.y)).x, t = texture(uPressure, vUv + vec2(0., uTexel.y)).x;
        o = vec4(.25 * (l + r + b + t - texture(uDiv, vUv).x), 0., 0., 1.); }`,
    gradient: `uniform sampler2D uPressure, uVel; uniform vec2 uTexel;
      void main(){ float l = texture(uPressure, vUv - vec2(uTexel.x, 0.)).x, r = texture(uPressure, vUv + vec2(uTexel.x, 0.)).x;
        float b = texture(uPressure, vUv - vec2(0., uTexel.y)).x, t = texture(uPressure, vUv + vec2(0., uTexel.y)).x;
        o = vec4(texture(uVel, vUv).xy - .5 * vec2(r - l, t - b), 0., 1.); }`,
    // Ink: carry the picture along the flow, track how stirred each spot is (alpha), and re-inject
    // the live picture quickly where calm, slowly (project_5's 0.009) where stirred.
    ink: `uniform sampler2D uVel, uInk; uniform vec2 uTexel; uniform float uDt;
      void main(){ vec2 v = texture(uVel, vUv).xy; vec4 ink = texture(uInk, vUv - uDt * v * uTexel * .5);
        float stir = max(ink.a * .9935, smoothstep(6., 160., length(v)));
        o = vec4(mix(ink.rgb, source(vUv), mix(1., .0055, stir)), stir); }`,
    // Fresh ink buffer: the live picture, nothing stirred yet (alpha = how stirred).
    seed: `void main(){ o = vec4(source(vUv), 0.); }`,
    show: `uniform sampler2D uInk;
      void main(){ vec4 ink = texture(uInk, vUv); o = vec4(mix(source(vUv), ink.rgb, ink.a), 1.); }`,
  };

  function attach(canvas, opts) {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduced';
    const gl = !reduced && canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, premultipliedAlpha: false });
    if (!gl || !gl.getExtension('EXT_color_buffer_float')) return null;
    gl.getExtension('OES_texture_float_linear');

    const compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const programs = {};
    for (const [name, body] of Object.entries(FRAG)) {
      const p = gl.createProgram();
      gl.attachShader(p, vs);
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, `#version 300 es
precision highp float; in vec2 vUv; out vec4 o; ${['ink', 'show', 'seed'].includes(name) ? SOURCE : ''} ${body}`));
      gl.bindAttribLocation(p, 0, 'aPos');
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn('[ink-fluid] disabled:', gl.getProgramInfoLog(p)); return null; }
      const u = {};
      for (let i = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i--;) { const n = gl.getActiveUniform(p, i).name; u[n] = gl.getUniformLocation(p, n); }
      programs[name] = { p, u };
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const texture = (w, h) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (w) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      return t;
    };
    const target = (w, h) => { const tex = texture(w, h), fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0); return { tex, fb, w, h }; };
    const pair = (w, h) => { const a = target(w, h), b = target(w, h); return { read: a, write: b, swap() { [this.read, this.write] = [this.write, this.read]; } }; };
    const videoTex = texture(), overlayTex = texture();

    let W = 0, H = 0, simW = 0, simH = 0, vel, ink, curl, div, pressure;
    function resize() {
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      W = Math.max(1, Math.round(innerWidth * dpr)); H = Math.max(1, Math.round(innerHeight * dpr));
      canvas.width = W; canvas.height = H;
      const s = Math.min(1, 288 / Math.max(innerWidth, innerHeight)); // sim grid ~288 on the long side
      simW = Math.max(32, Math.round(innerWidth * s)); simH = Math.max(32, Math.round(innerHeight * s));
      const k = Math.min(1, 1100 / Math.max(innerWidth, innerHeight)); // ink buffer ~1100 on the long side
      vel = pair(simW, simH); pressure = pair(simW, simH); curl = target(simW, simH); div = target(simW, simH);
      ink = pair(Math.round(innerWidth * k), Math.round(innerHeight * k));
      fresh = true;
    }

    // uv(screen) -> uv(film) for object-fit: cover with the element's object-position.
    function cover() {
      const vw = opts.video.videoWidth || 16, vh = opts.video.videoHeight || 9;
      const s = Math.max(innerWidth / vw, innerHeight / vh), dw = vw * s, dh = vh * s;
      const pos = getComputedStyle(opts.video).objectPosition.split(' ').map((v) => (parseFloat(v) || 50) / 100);
      const ox = (innerWidth - dw) * pos[0], oy = (innerHeight - dh) * (pos[1] ?? .5);
      // screen uv has y up; textures are uploaded flipped so film uv has y up too
      return [innerWidth / dw, innerHeight / dh, -ox / dw, (oy + dh - innerHeight) / dh];
    }

    function run(name, out, uniforms) {
      const { p, u } = programs[name];
      gl.useProgram(p);
      let unit = 0;
      for (const [key, value] of Object.entries(uniforms)) {
        const loc = u[key];
        if (loc == null) continue;
        if (value instanceof WebGLTexture) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, value); gl.uniform1i(loc, unit++); }
        else if (typeof value === 'number') gl.uniform1f(loc, value);
        else if (value.length === 2) gl.uniform2fv(loc, value);
        else gl.uniform4fv(loc, value);
      }
      if (out) { gl.bindFramebuffer(gl.FRAMEBUFFER, out.fb); gl.viewport(0, 0, out.w, out.h); }
      else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H); }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    const splats = [];
    let last = null, lastInput = 0, raf = 0, prev = 0, fresh = true, alive = true, visible = false;
    function pointer(x, y, boost) {
      if (opts.active && !opts.active()) { last = null; return; }
      const now = performance.now();
      if (last && now - last.t < 80) {
        const dx = x - last.x, dy = y - last.y;
        if (dx || dy) splats.push({ x: x / innerWidth, y: 1 - y / innerHeight, dx: dx * simW / innerWidth, dy: -dy * simH / innerHeight, boost });
      }
      last = { x, y, t: now };
      lastInput = now;
      if (!raf) { prev = now; raf = requestAnimationFrame(frame); }
    }
    // project_5: left-drag pushes the fluid. On the web the hover alone stirs it gently; dragging pushes harder.
    const onMove = (e) => { if (e.pointerType !== 'touch') pointer(e.clientX, e.clientY, e.buttons ? 1.8 : 1); };
    const onTouch = (e) => { const t = e.touches[0]; if (t) pointer(t.clientX, t.clientY, 1.4); };
    const onTouchEnd = () => { last = null; };
    addEventListener('pointermove', onMove, { passive: true });
    addEventListener('touchstart', onTouch, { passive: true });
    addEventListener('touchmove', onTouch, { passive: true });
    addEventListener('touchend', onTouchEnd, { passive: true });
    addEventListener('resize', resize, { passive: true });

    function upload() {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.bindTexture(gl.TEXTURE_2D, videoTex);
      if (opts.video.readyState >= 2) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, opts.video);
      const live = opts.overlay;
      const hasOverlay = live && !live.hidden && live.width > 1;
      if (hasOverlay) {
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.bindTexture(gl.TEXTURE_2D, overlayTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, live);
      }
      return hasOverlay ? 1 : 0;
    }

    function frame(now) {
      raf = 0;
      if (!alive) return;
      const dt = Math.min((now - prev) / 1000, 1 / 30) || 1 / 60;
      prev = now;
      if (opts.video.readyState < 2) { raf = requestAnimationFrame(frame); return; }
      const src = { uVideo: videoTex, uOverlay: overlayTex, uCover: cover(), uHasOverlay: upload() };
      const texel = [1 / simW, 1 / simH];
      if (fresh) {
        run('seed', ink.write, src); ink.swap();
        for (const t of [vel, pressure]) { gl.bindFramebuffer(gl.FRAMEBUFFER, t.read.fb); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
        fresh = false;
      }

      run('advect', vel.write, { uVel: vel.read.tex, uSrc: vel.read.tex, uTexel: texel, uDt: dt, uDecay: 0.984 }); vel.swap();
      for (const s of splats.splice(0)) {
        const force = 0.9 * s.boost / dt; // pointer delta (sim px/frame) -> sim px/second
        run('splat', vel.write, { uSrc: vel.read.tex, uPoint: [s.x, s.y], uForce: [s.dx * force, s.dy * force], uRadius: 0.0016 * s.boost, uAspect: simW / simH });
        vel.swap();
      }
      run('curl', curl, { uVel: vel.read.tex, uTexel: texel });
      run('vorticity', vel.write, { uVel: vel.read.tex, uCurl: curl.tex, uTexel: texel, uStrength: 26, uDt: dt }); vel.swap();
      run('divergence', div, { uVel: vel.read.tex, uTexel: texel });
      for (let i = 0; i < 18; i++) { run('pressure', pressure.write, { uPressure: pressure.read.tex, uDiv: div.tex, uTexel: texel }); pressure.swap(); }
      run('gradient', vel.write, { uPressure: pressure.read.tex, uVel: vel.read.tex, uTexel: texel }); vel.swap();
      run('ink', ink.write, Object.assign({ uVel: vel.read.tex, uInk: ink.read.tex, uTexel: texel, uDt: dt }, src)); ink.swap();
      run('show', null, Object.assign({ uInk: ink.read.tex }, src));

      if (!visible) { visible = true; canvas.classList.add('is-stirred'); }
      // Calm for 11 s: the smoke has drifted and settled back into the picture; hand back to the raw layers.
      if (now - lastInput > 11000) { visible = false; canvas.classList.remove('is-stirred'); fresh = true; return; }
      raf = requestAnimationFrame(frame);
    }

    resize();
    return {
      destroy() {
        alive = false;
        cancelAnimationFrame(raf);
        removeEventListener('pointermove', onMove);
        removeEventListener('touchstart', onTouch);
        removeEventListener('touchmove', onTouch);
        removeEventListener('touchend', onTouchEnd);
        removeEventListener('resize', resize);
        canvas.classList.remove('is-stirred');
      },
    };
  }

  global.TeaInkFluid = { attach };
})(window);
