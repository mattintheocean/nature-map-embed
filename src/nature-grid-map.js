/*
 * Nature Return Grid, embed version.
 * Mounts the interactive Auckland map into every element with class "nature-map" (or a data-nature-map attribute).
 * Nature returns around the pointer (or finger) and fades back once it moves on; drag pans, pinch or the + / − buttons zoom.
 * Page scrolling is left alone.
 * Needs window.LCDB (the land cover grid), which the build puts at the top of nature-grid-embed.js.
 *
 * Options, as data attributes on the element:
 *   data-frame="city|region|markers"   starting view (default city); markers fits all the markers in view
 *   data-zoom="1"              starting zoom relative to the frame: 1 fits it, 2 is twice as close, 0.5 further out
 *   data-recovery="0.5"        nature return level, 0 to 1
 *   data-cell="22"             cell size in px
 *   data-density="0.5"  data-weight="0.14"  data-texture="0.35"  data-scale="0.35"  data-brush="5"
 *   data-seed="12345"          fixed pattern (default random on each load)
 *   data-credit="off"          hide the data credit (only if it is credited elsewhere on the page)
 *   data-zoom-buttons="off"    hide the + / − buttons
 *   data-hint="…"              text of the hint beside the zoom buttons (default "Drag to move the map"); "off" hides it
 *
 * Markers: put elements with a data-marker attribute inside the map element. Each one becomes a marker at
 * data-lat / data-lng (or NZTM data-x / data-y), and its contents show in a card when the marker is clicked:
 *   <div data-marker data-lat="-36.848" data-lng="174.763" hidden>
 *     <div class="nature-map-number">520+</div>
 *     <div class="nature-map-label">Community groups active across Auckland's conservation network</div>
 *   </div>
 */
(function () {
  'use strict';
  const L = window.LCDB;
  if (!L) { console.warn('nature-map: land cover data (window.LCDB) is missing'); return; }

  // ---------- palette (mint) ----------
  const P = {
    bg:['#a5ffbd', '#5cfb92', '#78fb9e'],      // water, land, light land patches
    outside:'#5cfb92',                         // neighbouring regions blend into the mint background
    outsideCross:'#74fba4',                    // with a faint cross so they aren't flat colour
    bushBg:'#50f28c',                          // native bush sits on a slightly deeper green
    c:{ black:'#5af694', orange:'#c8fa96', brown:'#a6f89e', dkgreen:'#4cf8a4', ltgreen:'#a4fcae',
        yellow:'#e8fb96', ltblue:'#c6fcee', blue:'#6cf8d8', deepblue:'#52f4de' },
    // per-type ramps (degraded -> thriving)
    ramps:{
      [0]: ['#a6f89e', '#86fae0', '#6cf8d8', '#52f4de'],                          // water: lightest blue pulled towards the others
      [5]: ['#5cf496', '#48ec8c', '#3ee688', '#36e084'],                          // native bush
      [1]: ['#96f6ae', '#c6fcee', '#acfabe', '#c0fbcc', '#d6fdf4', '#e0fdf6'],    // urban
      [4]: ['#b4fa9c', '#ccfb98', '#defb96', '#ecfc96'],                          // urban parkland
      [2]: ['#96f8a0', '#b6fa9c', '#cefa98', '#e2fb96'],                          // pasture & crops
      [3]: ['#86f6a0', '#a6f8a0', '#c2fa9c', '#dafb98'],                          // exotic forest & scrub
    }
  };
  const BG_BLOCK = 2;                              // patch granularity in cells

  // ---------- land types ----------
  // base: where the type sits on its ramp at 50% return; sens: how far nature return moves it
  const T = { WATER:0, URBAN:1, RURAL:2, PLANT:3, PARK:4, BUSH:5, WETLAND:6, OUT:255 };
  const TYPES = {
    [T.WATER]:   { ramp:['brown', 'ltblue', 'blue', 'deepblue'],            base:0.6,  sens:0.6, dense:0 },
    [T.URBAN]:   { ramp:['black', 'brown', 'orange', 'dkgreen', 'ltgreen'], base:0.3,  sens:1.0, dense:-0.15 },
    [T.RURAL]:   { ramp:['orange', 'brown', 'dkgreen', 'ltgreen', 'yellow'],base:0.45, sens:1.0, dense:0 },
    [T.PLANT]:   { ramp:['brown', 'dkgreen', 'ltgreen', 'yellow'],          base:0.5,  sens:0.9, dense:0.05 },
    [T.PARK]:    { ramp:['dkgreen', 'ltgreen', 'yellow', 'ltblue'],         base:0.6,  sens:0.8, dense:0.15 },
    [T.BUSH]:    { ramp:['dkgreen', 'yellow', 'ltblue', 'blue'],            base:0.65, sens:0.7, dense:0.3 },
    [T.WETLAND]: { ramp:['brown', 'dkgreen', 'ltblue', 'blue'],             base:0.6,  sens:0.8, dense:0.2 },
  };
  // LCDB v5 class code -> land type. 255 = sea, 254 = land outside the region.
  const LCDB_TYPES = {
    1:T.URBAN, 2:T.PARK, 5:T.URBAN, 6:T.URBAN, 10:T.RURAL, 12:T.RURAL, 16:T.RURAL,
    20:T.WATER, 21:T.WATER, 22:T.WATER, 30:T.RURAL, 33:T.RURAL, 40:T.RURAL, 41:T.RURAL,
    45:T.WETLAND, 46:T.WETLAND, 47:T.WETLAND, 50:T.BUSH, 51:T.PLANT, 52:T.BUSH, 54:T.BUSH, 56:T.PLANT, 58:T.BUSH,
    64:T.PLANT, 68:T.PLANT, 69:T.BUSH, 70:T.WETLAND, 71:T.PLANT, 255:T.WATER, 254:T.OUT
  };
  const TYPE_OF = new Uint8Array(256).fill(T.RURAL);
  for (const k in LCDB_TYPES) TYPE_OF[k] = LCDB_TYPES[k];

  // ---------- land cover grid (NZTM metres) ----------
  const lc = (() => {
    const bin = atob(L.rle), out = new Uint8Array(L.w * L.h);
    for (let i = 0, o = 0; i < bin.length; i += 2) { out.fill(bin.charCodeAt(i), o, o + bin.charCodeAt(i+1)); o += bin.charCodeAt(i+1); }
    return out;
  })();
  function lcAt(wx, wy) {
    const c = Math.floor((wx - L.x0) / L.res), r = Math.floor((L.y1 - wy) / L.res);
    return (c < 0 || r < 0 || c >= L.w || r >= L.h) ? 254 : lc[r * L.w + c];
  }
  const EXTENT = { x0:L.x0, x1:L.x0 + L.w*L.res, y0:L.y1 - L.h*L.res, y1:L.y1 };
  const FRAMES = {
    region: { x0:EXTENT.x0, x1:EXTENT.x1, y0:EXTENT.y0, y1:EXTENT.y1 },
    city:   { x0:1738000, x1:1782000, y0:5895000, y1:5935000 },   // Waitematā & Manukau harbours
  };

  // WGS84 lat/long -> NZTM (EPSG:2193), transverse Mercator on GRS80
  function toNZTM(lat, lng) {
    const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996, l0 = 173 * Math.PI / 180;
    const e2 = f * (2 - f), e4 = e2 * e2, e6 = e4 * e2, ep2 = e2 / (1 - e2);
    const p = lat * Math.PI / 180, s = Math.sin(p), c = Math.cos(p), t = Math.tan(p);
    const N = a / Math.sqrt(1 - e2 * s * s), T = t * t, C = ep2 * c * c, A = (lng * Math.PI / 180 - l0) * c;
    const M = a * ((1 - e2/4 - 3*e4/64 - 5*e6/256) * p - (3*e2/8 + 3*e4/32 + 45*e6/1024) * Math.sin(2*p)
              + (15*e4/256 + 45*e6/1024) * Math.sin(4*p) - (35*e6/3072) * Math.sin(6*p));
    return [1600000 + k0 * N * (A + (1 - T + C) * A**3 / 6 + (5 - 18*T + T*T + 72*C - 58*ep2) * A**5 / 120),
            10000000 + k0 * (M + N * t * (A*A/2 + (5 - T + 9*C + 4*C*C) * A**4 / 24 + (61 - 58*T + T*T + 600*C - 330*ep2) * A**6 / 720))];
  }

  // ---------- seeded perlin noise ----------
  function makeNoise(seed) {
    let s = seed >>> 0;
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    const p = Array.from({length:256}, (_, i) => i);
    for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    const perm = new Uint8Array(512); for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const fade = t => t*t*t*(t*(t*6-15)+10);
    const lerp = (a,b,t) => a + (b-a)*t;
    const grad = (h,x,y) => { const a = (h & 7) * Math.PI / 4; return Math.cos(a)*x + Math.sin(a)*y; };
    const n2 = (x,y) => {
      const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
      x -= Math.floor(x); y -= Math.floor(y);
      const u = fade(x), v = fade(y);
      const a = perm[X]+Y, b = perm[X+1]+Y;
      return lerp(lerp(grad(perm[a],x,y), grad(perm[b],x-1,y), u),
                  lerp(grad(perm[a+1],x,y-1), grad(perm[b+1],x-1,y-1), u), v);
    };
    // fbm normalised to roughly 0..1
    return (x,y,oct=3) => {
      let amp = 1, f = 1, sum = 0, norm = 0;
      for (let o = 0; o < oct; o++) { sum += n2(x*f, y*f) * amp; norm += amp; amp *= 0.5; f *= 2; }
      return Math.min(1, Math.max(0, (sum / norm) * 1.4 + 0.5));
    };
  }

  // ---------- styles ----------
  const CSS = `
.ngm { position:relative; overflow:hidden; min-height:320px; background:${P.bg[1]}; }
.ngm canvas { position:absolute; inset:0; width:100%; height:100%; display:block; cursor:grab; touch-action:none; }
.ngm canvas.ngm-panning { cursor:grabbing; }
.ngm-zoom { position:absolute; left:12px; top:12px; display:flex; flex-direction:column; gap:6px; }
.ngm-hint { position:absolute; left:12px; top:12px; height:36px; padding:0 12px; border-radius:6px; pointer-events:none;
  background:rgba(255,255,255,.8); color:#1d6b4a; font:500 13px/36px system-ui, sans-serif; white-space:nowrap;
  box-shadow:0 1px 3px rgba(20,90,60,.15); transition:opacity .4s, transform .4s; }
.ngm-zoom + .ngm-hint { left:56px; }
.ngm-hint.ngm-gone { opacity:0; transform:translateX(-6px); }
.ngm-zoom button { width:36px; height:36px; padding:0; margin:0; border:0; border-radius:6px; cursor:pointer;
  background:rgba(255,255,255,.8); color:#1d6b4a; font:500 22px/36px system-ui, sans-serif; text-align:center;
  box-shadow:0 1px 3px rgba(20,90,60,.15); transition:background .15s, opacity .15s; }
.ngm-zoom button:hover { background:#fff; }
.ngm-zoom button:focus-visible { outline:2px solid #1d6b4a; outline-offset:2px; }
.ngm-zoom button:disabled { opacity:.4; cursor:default; }
.ngm-credit { position:absolute; left:10px; bottom:8px; max-width:calc(100% - 80px); pointer-events:none;
  font:10px/1.3 system-ui, sans-serif; color:rgba(20,90,60,.6); }
.ngm-markers { position:absolute; inset:0; pointer-events:none; }
.ngm-marker { position:absolute; left:0; top:0; margin:0; padding:0; border:0; background:none; cursor:pointer; pointer-events:auto;
  font:inherit; color:inherit; -webkit-tap-highlight-color:transparent; }
.ngm-marker:hover, .ngm-marker:focus-visible { z-index:2; outline:none; }
.ngm-marker:focus-visible .ngm-cell { outline:2px solid #0f3b2a; outline-offset:3px; }
/* the visible cell sits centred in a larger tap area: the reverse of the pattern, a dark cell with a pale cross */
.ngm-cell { position:absolute; left:50%; top:50%; width:var(--s); height:var(--s); margin:calc(var(--s) / -2) 0 0 calc(var(--s) / -2);
  border-radius:3px; background:#0f3b2a; box-shadow:0 1px 6px rgba(15,59,42,.35); transition:transform .15s, background .15s; }
.ngm-cell::before, .ngm-cell::after { content:''; position:absolute; left:50%; top:50%; width:var(--arm); height:var(--w);
  background:#fbf8f1; transform:translate(-50%,-50%); transition:background .15s; }
.ngm-cell::after { transform:translate(-50%,-50%) rotate(90deg); }
.ngm-marker:hover .ngm-cell { transform:scale(1.15); }
.ngm-active .ngm-cell { background:#fbf8f1; }
.ngm-active .ngm-cell::before, .ngm-active .ngm-cell::after { background:#0f3b2a; }
.ngm-pulse { position:absolute; inset:-2px; border:2px solid #0f3b2a; border-radius:3px; pointer-events:none;
  animation:ngm-pulse 2.4s ease-out infinite; }
.ngm-active .ngm-pulse { display:none; }
.ngm-tag { position:absolute; top:50%; left:calc(50% + var(--s) / 2 + 8px); transform:translateY(-50%); display:flex; align-items:center;
  padding:6px 10px; border-radius:3px; background:#0f3b2a; color:#fbf8f1; white-space:nowrap; font-size:17.5px; line-height:1;
  font-weight:800; letter-spacing:-.01em; box-shadow:0 1px 6px rgba(15,59,42,.25); transition:opacity .15s; }
.ngm-flip .ngm-tag { left:auto; right:calc(50% + var(--s) / 2 + 8px); }
.ngm-tag-label { display:inline-block; max-width:0; overflow:hidden; text-overflow:ellipsis; opacity:0; font-size:14px; font-weight:700;
  text-transform:uppercase; letter-spacing:.02em; transition:max-width .3s ease, opacity .2s, margin .3s; }
.ngm-marker:hover .ngm-tag-label, .ngm-marker:focus-visible .ngm-tag-label { max-width:310px; opacity:1; margin-left:10px; }
.ngm-active .ngm-tag { opacity:0; }
@keyframes ngm-pulse { 0% { transform:scale(1); opacity:.9; } 70%, 100% { transform:scale(2); opacity:0; } }
@media (prefers-reduced-motion: reduce) { .ngm-pulse { animation:none; opacity:0; } }
.ngm-card { position:absolute; left:0; top:0; box-sizing:border-box; width:min(280px, calc(100% - 16px)); padding:36px 28px 32px;
  background:#f9f6ee; color:#111; text-align:center; box-shadow:0 10px 30px rgba(20,90,60,.18); pointer-events:auto;
  visibility:hidden; opacity:0; transform:translateY(6px) scale(.97); transition:opacity .18s, transform .18s, visibility 0s .18s; }
.ngm-card.ngm-open { visibility:visible; opacity:1; transform:none; transition:opacity .18s, transform .18s; }
.ngm-card .nature-map-number { font-size:64px; line-height:1; font-weight:800; letter-spacing:-.03em; margin:0 0 20px; }
.ngm-card .nature-map-label { font-size:13px; line-height:1.35; font-weight:700; text-transform:uppercase; letter-spacing:.01em; }
.ngm-close { position:absolute; top:6px; right:6px; width:28px; height:28px; padding:0; margin:0; border:0; background:none;
  color:#666; font:400 20px/28px system-ui, sans-serif; cursor:pointer; }
.ngm-close:hover { color:#111; }
`;
  function injectCSS() {
    if (document.getElementById('ngm-style')) return;
    const st = document.createElement('style'); st.id = 'ngm-style'; st.textContent = CSS;
    document.head.appendChild(st);
  }

  // ---------- one map ----------
  function mount(el) {
    if (el.__natureMap) return el.__natureMap;
    injectCSS();
    const d = el.dataset;
    const num = (v, def) => (v === undefined || v === '' || isNaN(+v)) ? def : +v;
    const cfg = {
      frame: FRAMES[d.frame] || d.frame === 'markers' ? d.frame : 'city',
      zoom: Math.max(0.1, num(d.zoom, 1)),
      recovery: num(d.recovery, 0.5), cs: num(d.cell, 22), density: num(d.density, 0.5), weight: num(d.weight, 0.14),
      texture: num(d.texture, 0.35), scale: num(d.scale, 0.35), brush: num(d.brush, 5),
      seed: num(d.seed, Math.floor(Math.random() * 1e9)),
    };
    const cs = cfg.cs;

    // marker content is authored inside the map element; read it before adding the canvas
    const markerSrc = [...el.querySelectorAll('[data-marker]')].map(m => {
      m.remove();
      const md = m.dataset;
      const w = md.lat !== undefined && md.lng !== undefined ? toNZTM(+md.lat, +md.lng) : [+md.x, +md.y];
      const text = sel => { const t = m.querySelector(sel); return t ? t.textContent.replace(/\s+/g, ' ').trim() : ''; };
      return { w, html:m.innerHTML, label:(md.title || m.textContent).replace(/\s+/g, ' ').trim(),
               tag:md.tag || text('.nature-map-number'), tagLabel:md.tagLabel || text('.nature-map-label') };
    }).filter(m => isFinite(m.w[0]) && isFinite(m.w[1]));

    el.classList.add('ngm');
    const cv = document.createElement('canvas');
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', 'Interactive pattern map of the Auckland Region. Move over the map to restore nature.');
    el.appendChild(cv);
    const ctx = cv.getContext('2d');

    if (d.credit !== 'off') el.appendChild(Object.assign(document.createElement('div'), { className:'ngm-credit',
      textContent:'Land cover: LCDB v5.0, Manaaki Whenua – Landcare Research. Boundary: Stats NZ. CC BY 4.0.' }));

    const nA = makeNoise(cfg.seed), nB = makeNoise(cfg.seed ^ 0x9e3779b9), nC = makeNoise(cfg.seed ^ 0x51ed270b);
    let W = 0, H = 0, dpr = 1, grid = null, touched = false;
    const view = { cx:0, cy:0, mpp:100 };           // world centre (NZTM) and metres per screen px
    const MIN_MPP = 5;
    let maxMpp = 400;
    // the lens: nature returns around the pointer, and spots it has passed fade back to normal
    const LENS_FADE = 700;                          // ms for a passed-over spot to return
    const LENS_STRENGTH = 0.6;
    const trail = [];                               // recent pointer positions in world space
    let lens = [0, 0], lensOn = false;

    // per-frame cell sample: the visible grid is aligned to world cells of size m metres
    function sampleGrid() {
      const m = cs * view.mpp;
      const left = view.cx - W/2 * view.mpp, top = view.cy + H/2 * view.mpp;
      const gx0 = Math.floor(left / m), gy0 = Math.floor(-top / m);
      const cols = Math.ceil(W / cs) + 2, rows = Math.ceil(H / cs) + 2;
      const sk = cfg.scale / 1000;                                  // noise frequency per metre
      const S = Math.max(1, Math.min(4, Math.round(m / L.res)));    // land-cover samples per cell edge
      const n = cols * rows;
      const g = { cols, rows, ox:(gx0*m - left) / view.mpp, oy:(-gy0*m - top) / -view.mpp,
                  land:new Uint8Array(n), field:new Float32Array(n), dens:new Float32Array(n), tone:new Uint8Array(n) };
      const counts = new Uint16Array(8);
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const k = j*cols + i, gx = gx0 + i, gy = gy0 + j;
        const wx = (gx + 0.5) * m, wy = -(gy + 0.5) * m;
        // majority land type within the cell (sea/outside only win if nothing else is there)
        counts.fill(0); let out = 0;
        for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
          const t = TYPE_OF[lcAt(gx*m + (sx + 0.5) * m / S, -(gy*m + (sy + 0.5) * m / S))];
          if (t === T.OUT) out++; else counts[t]++;
        }
        let best = T.OUT, bc = 0;
        for (let t = 0; t < 7; t++) { const c = counts[t] * (t === T.WATER ? 0.8 : 1); if (c > bc) { bc = c; best = t; } }
        g.land[k] = out > S*S/2 ? T.OUT : best;
        g.field[k] = nA(wx*sk + 10, wy*sk + 10, 3);
        g.dens[k]  = nB(wx*sk*1.3 + 50, wy*sk*1.3 + 50, 2);
        const bx = (Math.floor(gx / BG_BLOCK) + 0.5) * BG_BLOCK * m, by = -(Math.floor(gy / BG_BLOCK) + 0.5) * BG_BLOCK * m;
        const t = nC(bx*sk*0.8 + 90, by*sk*0.8 + 90, 3);
        g.tone[k] = t < 0.4 ? 0 : t > 0.6 ? 2 : 1;
      }
      grid = g;
    }

    function draw() {
      const g = grid, { cols, rows, ox, oy } = g;
      ctx.fillStyle = P.outside; ctx.fillRect(0, 0, W, H);
      const at = (i, j) => [ox + i*cs, oy + j*cs];

      // background: water, land, light land patches, native bush
      const tones = [...P.bg, P.bushBg];
      for (let t = 0; t < tones.length; t++) {
        ctx.fillStyle = tones[t];
        ctx.beginPath();
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
          const k = j*cols + i, lt = g.land[k];
          const tone = lt === T.BUSH ? 3 : lt === T.WATER ? 0 : g.tone[k] === 2 ? 2 : 1;
          if (tone === t && lt !== T.OUT) { const [x, y] = at(i, j); ctx.rect(x, y, cs, cs); }
        }
        ctx.fill();
      }

      const wgt = cfg.weight * cs;
      const densT = 1 - cfg.density;      // threshold for 4-ticks
      const GAP = 1;                      // px between neighbouring crosses
      const arm = (cs - GAP) / 2;
      const tick = cs * 0.2, tickOff = cs * 0.2;
      const shift = cfg.recovery - 0.5;

      // lens spots in screen px: the pointer at full strength, its trail fading out
      const now = performance.now();
      while (trail.length && now - trail[0].t > LENS_FADE) trail.shift();
      const toScreen = (wx, wy) => [(wx - view.cx) / view.mpp + W/2, (view.cy - wy) / view.mpp + H/2];
      const spots = trail.map(p => [...toScreen(p.wx, p.wy), 1 - (now - p.t) / LENS_FADE]);
      if (lensOn) spots.push([...toScreen(lens[0], lens[1]), 1]);
      const R = cfg.brush * cs, R2 = R * R;
      const lensAt = (px, py) => {
        let best = 0;
        for (const [sx, sy, f] of spots) {
          const d2 = (px - sx) ** 2 + (py - sy) ** 2;
          if (d2 >= R2) continue;
          const s = 1 - Math.sqrt(d2) / R, e = s * s * (3 - 2 * s) * f;   // smooth falloff to the edge
          if (e > best) best = e;
        }
        return best * LENS_STRENGTH;
      };

      // bucket cells per colour so each colour is drawn as one path
      const crosses = new Map(), ticks = new Map();
      const push = (mp, c, x, y) => { let a = mp.get(c); if (!a) mp.set(c, a = []); a.push(x, y); };
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const k = j*cols + i, t = g.land[k];
        const [x, y] = at(i, j);
        // neighbouring regions: a faint plain cross, untouched by the lens
        if (t === T.OUT) { push(crosses, P.outsideCross, x + cs/2, y + cs/2); continue; }
        const ty = TYPES[t];
        const lb = spots.length ? lensAt(x + cs/2, y + cs/2) : 0;
        const v = Math.min(0.999, Math.max(0, ty.base + (g.field[k] - 0.5) * cfg.texture + shift * ty.sens + lb));
        const ramp = P.ramps[t] || ty.ramp;
        const c = ramp[Math.floor(v * ramp.length)];
        const colour = P.c[c] || c;
        push(crosses, colour, x + cs/2, y + cs/2);
        if (g.dens[k] + ty.dense + (v - 0.5) * 0.4 > densT) push(ticks, colour, x + cs/2, y + cs/2);
      }

      ctx.lineCap = 'butt';
      ctx.lineWidth = wgt;
      for (const [colour, p] of crosses) {
        ctx.strokeStyle = colour;
        ctx.beginPath();
        for (let k = 0; k < p.length; k += 2) {
          const cx = p[k], cy = p[k+1];
          ctx.moveTo(cx - arm, cy); ctx.lineTo(cx + arm, cy);
          ctx.moveTo(cx, cy - arm); ctx.lineTo(cx, cy + arm);
        }
        ctx.stroke();
      }
      ctx.lineWidth = wgt * 0.9;
      for (const [colour, p] of ticks) {
        ctx.strokeStyle = colour;
        ctx.beginPath();
        for (let k = 0; k < p.length; k += 2) {
          const cx = p[k], cy = p[k+1];
          for (const [sx, sy] of [[-1,-1],[1,-1],[-1,1],[1,1]]) {
            const ax = cx + sx*tickOff, ay = cy + sy*tickOff;
            ctx.moveTo(ax, ay);
            ctx.lineTo(ax + sx*tick*0.7, ay + sy*tick*0.7);
          }
        }
        ctx.stroke();
      }
      placeMarkers();
      if (trail.length) schedule(false);            // keep redrawing until the trail has faded
    }

    // ---------- markers and info card ----------
    const layer = Object.assign(document.createElement('div'), { className:'ngm-markers' });
    const card = Object.assign(document.createElement('div'), { className:'ngm-card' });
    card.setAttribute('role', 'dialog');
    const cardBody = document.createElement('div');
    const closeBtn = Object.assign(document.createElement('button'), { type:'button', className:'ngm-close', textContent:'×' });
    closeBtn.setAttribute('aria-label', 'Close');
    card.append(closeBtn, cardBody);
    let openIdx = -1;
    const markers = markerSrc.map((m, i) => {
      // a grid cell, plus a tag with the number that expands to show the label on hover
      const b = Object.assign(document.createElement('button'), { type:'button', className:'ngm-marker' });
      b.setAttribute('aria-label', m.label);
      const cell = b.appendChild(Object.assign(document.createElement('span'), { className:'ngm-cell' }));
      cell.appendChild(Object.assign(document.createElement('span'), { className:'ngm-pulse' }));
      if (m.tag) {
        const tag = b.appendChild(Object.assign(document.createElement('span'), { className:'ngm-tag', textContent:m.tag }));
        if (m.tagLabel) tag.appendChild(Object.assign(document.createElement('span'), { className:'ngm-tag-label', textContent:m.tagLabel }));
      }
      b.addEventListener('click', () => openIdx === i ? closeCard() : openCard(i));
      layer.appendChild(b);
      return { ...m, b, sx:0, sy:0, on:false };
    });
    if (markers.length) { layer.appendChild(card); el.appendChild(layer); }

    function openCard(i) {
      if (openIdx >= 0) markers[openIdx].b.classList.remove('ngm-active');
      openIdx = i;
      cardBody.innerHTML = markers[i].html;
      card.setAttribute('aria-label', markers[i].label);
      markers[i].b.classList.add('ngm-active');
      placeMarkers();
      card.classList.add('ngm-open');
      closeBtn.focus({ preventScroll:true });
    }
    function closeCard(refocus) {
      if (openIdx < 0) return;
      const b = markers[openIdx].b;
      b.classList.remove('ngm-active');
      card.classList.remove('ngm-open');
      openIdx = -1;
      if (refocus) b.focus({ preventScroll:true });
    }
    closeBtn.addEventListener('click', () => closeCard(true));
    el.addEventListener('keydown', e => { if (e.key === 'Escape') closeCard(true); });

    // markers sit centred on the grid cell that holds their point, 1.25 cells in size
    const MARKER_SCALE = 1.25;
    function placeMarkers() {
      if (!markers.length) return;
      const m = cs * view.mpp, size = Math.round(Math.max(14, cs - 2) * MARKER_SCALE), hit = Math.max(44, size + 12);
      for (const mk of markers) {
        const cx = (Math.floor(mk.w[0] / m) + 0.5) * m, cy = (Math.floor(mk.w[1] / m) + 0.5) * m;
        mk.sx = (cx - view.cx) / view.mpp + W/2; mk.sy = (view.cy - cy) / view.mpp + H/2;
        mk.on = mk.sx > -cs && mk.sy > -cs && mk.sx < W + cs && mk.sy < H + cs;
        const s = mk.b.style;
        s.width = s.height = hit + 'px';
        s.left = (mk.sx - hit/2) + 'px'; s.top = (mk.sy - hit/2) + 'px';
        s.setProperty('--s', size + 'px');
        s.setProperty('--arm', Math.round(size * 0.62) + 'px');
        s.setProperty('--w', Math.max(3, Math.round(cfg.weight * cs * MARKER_SCALE)) + 'px');
        s.display = mk.on ? '' : 'none';
        mk.b.classList.toggle('ngm-flip', mk.sx > W - 250);   // tag on the left near the right edge
      }
      if (openIdx < 0) return;
      const mk = markers[openIdx];
      if (!mk.on) { closeCard(); return; }
      // above the marker, or below it when there isn't room; kept inside the map
      const cw = card.offsetWidth, ch = card.offsetHeight, gap = size/2 + 12;
      let top = mk.sy - gap - ch;
      if (top < 8) top = Math.min(mk.sy + gap, H - ch - 8);
      card.style.left = Math.min(W - cw - 8, Math.max(8, mk.sx - cw/2)) + 'px';
      card.style.top = Math.max(8, top) + 'px';
    }

    // full: the view moved, so the grid needs resampling; otherwise only the colours change
    let raf = 0, resample = false;
    function schedule(full = true) {
      if (full) resample = true;
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (resample) sampleGrid(); resample = false; draw(); });
    }

    // ---------- view ----------
    const toWorld = (sx, sy) => [view.cx + (sx - W/2) * view.mpp, view.cy - (sy - H/2) * view.mpp];
    // keep the whole view inside the land cover extent, so the edge of the data never shows
    function clampView() {
      view.mpp = Math.min(maxMpp, Math.max(MIN_MPP, view.mpp));
      const hw = W/2 * view.mpp, hh = H/2 * view.mpp;
      view.cx = Math.min(EXTENT.x1 - hw, Math.max(EXTENT.x0 + hw, view.cx));
      view.cy = Math.min(EXTENT.y1 - hh, Math.max(EXTENT.y0 + hh, view.cy));
      if (zoomIn) { zoomIn.disabled = view.mpp <= MIN_MPP * 1.001; zoomOut.disabled = view.mpp >= maxMpp * 0.999; }
    }
    function fitFrame() {
      if (cfg.frame === 'markers' && markers.length) {
        // fit every marker, leaving room around the edges and for the tags, which sit to the right
        const xs = markers.map(m => m.w[0]), ys = markers.map(m => m.w[1]);
        const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        const PAD = 48, TAG = 138;
        view.mpp = Math.max((x1 - x0) / Math.max(1, W - 2*PAD - TAG), (y1 - y0) / Math.max(1, H - 2*PAD), MIN_MPP) / cfg.zoom;
        view.cx = (x0 + x1) / 2 + TAG/2 * view.mpp; view.cy = (y0 + y1) / 2;
        return;
      }
      const f = FRAMES[cfg.frame] || FRAMES.city;
      view.cx = (f.x0 + f.x1) / 2; view.cy = (f.y0 + f.y1) / 2;
      view.mpp = Math.max((f.x1 - f.x0) / W, (f.y1 - f.y0) / H) / cfg.zoom;   // zoom 1 fits the frame, 2 is twice as close
    }
    // zoom about a screen point, keeping the world point under it fixed
    function zoomAt(mpp, sx, sy) {
      const [wx, wy] = toWorld(sx, sy);
      view.mpp = Math.min(maxMpp, Math.max(MIN_MPP, mpp));
      view.cx = wx - (sx - W/2) * view.mpp; view.cy = wy + (sy - H/2) * view.mpp;
      clampView(); schedule();
    }

    function resize() {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width; H = r.height;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      maxMpp = Math.min((EXTENT.x1 - EXTENT.x0) / W, (EXTENT.y1 - EXTENT.y0) / H);
      if (!touched) fitFrame();                     // refit until the visitor has moved the map
      clampView(); sampleGrid(); draw();
    }

    // ---------- pointer: the lens follows the pointer, one pointer pans, two pointers pinch-zoom ----------
    const pts = new Map();
    let drag = null, pinch = null;
    const local = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    function moveLens(e) {
      lens = toWorld(...local(e)); lensOn = true;
      trail.push({ wx:lens[0], wy:lens[1], t:performance.now() });
      if (trail.length > 80) trail.shift();
      schedule(false);
    }
    function leaveLens() {
      if (!lensOn) return;
      lensOn = false;
      trail.push({ wx:lens[0], wy:lens[1], t:performance.now() });   // the last spot fades out too
      schedule(false);
    }
    // listened for on the whole map, so the lens keeps going over markers and the card;
    // touch has no hover, so a finger moves the lens only while it is down
    el.addEventListener('pointermove', e => { if (e.pointerType !== 'touch' || pts.has(e.pointerId)) moveLens(e); });
    el.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') leaveLens(); });
    function startGesture() {
      const p = [...pts.values()];
      drag = pinch = null;
      if (p.length === 1) {
        drag = { x:p[0][0], y:p[0][1], cx:view.cx, cy:view.cy };
        cv.classList.add('ngm-panning');
      } else if (p.length >= 2) {
        const [a, b] = p, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        pinch = { d:Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, mpp:view.mpp, w:toWorld(mx, my) };
      } else cv.classList.remove('ngm-panning');
    }
    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, local(e));
      touched = true;
      startGesture();
      if (e.pointerType === 'touch') moveLens(e);
    });
    const end = e => {
      if (!pts.has(e.pointerId)) return;
      // a click on the map (no drag) closes the info card
      const [x, y] = local(e);
      if (drag && pts.size === 1 && Math.hypot(x - drag.x, y - drag.y) < 5) closeCard();
      pts.delete(e.pointerId); startGesture();
      if (e.pointerType === 'touch' && !pts.size) leaveLens();
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointermove', e => {
      const p = local(e);
      if (pts.has(e.pointerId)) pts.set(e.pointerId, p);
      if (pinch) {
        const [a, b] = [...pts.values()];
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        view.mpp = Math.min(maxMpp, Math.max(MIN_MPP, pinch.mpp * pinch.d / (Math.hypot(a[0] - b[0], a[1] - b[1]) || 1)));
        view.cx = pinch.w[0] - (mx - W/2) * view.mpp; view.cy = pinch.w[1] + (my - H/2) * view.mpp;
        clampView(); schedule(); hideHint();
      } else if (drag) {
        view.cx = drag.cx - (p[0] - drag.x) * view.mpp;
        view.cy = drag.cy + (p[1] - drag.y) * view.mpp;
        clampView(); schedule();
        if (Math.hypot(p[0] - drag.x, p[1] - drag.y) > 5) hideHint();
      }
    });

    // ---------- zoom buttons ----------
    let zoomIn = null, zoomOut = null;
    if (d.zoomButtons !== 'off') {
      const box = Object.assign(document.createElement('div'), { className:'ngm-zoom' });
      const btn = (label, text, f) => {
        const b = Object.assign(document.createElement('button'), { type:'button', textContent:text });
        b.setAttribute('aria-label', label);
        b.addEventListener('click', () => { touched = true; animateZoom(view.mpp * f); });
        box.appendChild(b); return b;
      };
      zoomIn = btn('Zoom in', '+', 1 / 1.6);
      zoomOut = btn('Zoom out', '−', 1.6);
      el.appendChild(box);
    }
    // hint beside the zoom buttons; it fades once the visitor has panned or pinched the map
    const hint = d.hint === 'off' ? null
      : el.appendChild(Object.assign(document.createElement('div'), { className:'ngm-hint', textContent:d.hint || 'Drag to move the map' }));
    const hideHint = () => { if (hint) hint.classList.add('ngm-gone'); };
    let anim = 0;
    function animateZoom(target) {
      cancelAnimationFrame(anim);
      target = Math.min(maxMpp, Math.max(MIN_MPP, target));
      const from = view.mpp, t0 = performance.now(), dur = 220;
      const step = now => {
        const t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 3);
        zoomAt(from * Math.pow(target / from, e), W / 2, H / 2);
        if (t < 1) anim = requestAnimationFrame(step);
      };
      anim = requestAnimationFrame(step);
    }

    new ResizeObserver(resize).observe(el);
    resize();

    const api = {
      setRecovery(v) { cfg.recovery = Math.min(1, Math.max(0, +v)); schedule(); },
      resetView() { touched = false; fitFrame(); clampView(); schedule(); },
      openMarker(i) { if (markers[i]) openCard(i); },
      closeMarker() { closeCard(); },
    };
    el.__natureMap = api;
    return api;
  }

  function init() {
    document.querySelectorAll('.nature-map, [data-nature-map]').forEach(mount);
  }
  window.NatureMap = { mount, init };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
