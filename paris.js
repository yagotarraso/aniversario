import * as THREE from 'three';

/* París en 3D y muy tenue, al fondo del corazón:
   la torre Eiffel como una celosía de luz dorada, el Sena con reflejos, una fila de edificios
   haussmannianos con unas pocas ventanas encendidas, farolas y árboles en el muelle,
   la cúpula de los Inválidos, la luna y algunas estrellas.
   Todo se coloca a partir de la vista final de la cámara (layout), para que encaje en cualquier pantalla. */

const QUAY_H = 1.2;   // altura del muelle sobre el agua
const TOWER_M = 324;  // la torre se dibuja en metros y luego se escala
const SPAN = 95;      // la orilla va de -SPAN a SPAN
const D_BANK = 70;    // distancia de la cámara final a la orilla
const D_TOWER = 115;  // … a la torre
const D_SKY = 200;    // … a la luna y las estrellas

function rng(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- Torre Eiffel: celosía de líneas (en metros, base en y = 0) ---------- */

function towerGeometry() {
  const p = [];
  const seg = (a, b) => p.push(...a, ...b);
  const mix3 = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  const hw = (h) => 4.5 + 58 * Math.exp(-h / 88);          // media anchura exterior a la altura h
  const legW = (h) => 26 - 6 * Math.min(h / 115.7, 1);      // anchura de cada pata
  const inner = (h) => Math.max(0, hw(h) - legW(h));

  // anillos horizontales unidos por montantes y cruces en cada cara
  const lattice = (rings, ringAt) => {
    let prev = null;
    for (const h of rings) {
      const r = ringAt(h);
      for (let k = 0; k < 4; k++) seg(r[k], r[(k + 1) % 4]);
      if (prev) {
        for (let k = 0; k < 4; k++) {
          const k1 = (k + 1) % 4;
          seg(prev[k], r[k]);
          seg(prev[k], r[k1]);
          seg(prev[k1], r[k]);
        }
      }
      prev = r;
    }
  };

  // las cuatro patas, separadas hasta el segundo piso
  const legRings = [0, 7, 15, 24, 33, 42, 50, 57.6, 66, 75, 85, 95, 105, 115.7];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      lattice(legRings, (h) => {
        const o = hw(h), i = inner(h);
        return [[sx * o, h, sz * o], [sx * o, h, sz * i], [sx * i, h, sz * i], [sx * i, h, sz * o]];
      });
    }
  }
  // el fuste
  lattice([115.7, 128, 141, 155, 170, 186, 203, 221, 239, 257, 276, 288, 300], (h) => {
    const o = hw(h);
    return [[o, h, o], [-o, h, o], [-o, h, -o], [o, h, -o]];
  });
  // el remate y la antena
  lattice([300, 306, 312], (h) => {
    const o = 6.4 - ((h - 300) / 12) * 3.4;
    return [[o, h, o], [-o, h, o], [-o, h, -o], [o, h, -o]];
  });
  seg([0, 312, 0], [0, 324, 0]);

  // los tres pisos, con su barandilla
  const deck = (h, extra, tall) => {
    const o = hw(h) + extra;
    const sq = (y) => [[o, y, o], [-o, y, o], [-o, y, -o], [o, y, -o]];
    const a = sq(h), b = sq(h + tall);
    for (let k = 0; k < 4; k++) {
      const k1 = (k + 1) % 4;
      seg(a[k], a[k1]);
      seg(b[k], b[k1]);
      for (let m = 0; m < 6; m++) seg(mix3(a[k], a[k1], m / 6), mix3(b[k], b[k1], m / 6));
    }
  };
  deck(57.6, 4, 6);
  deck(115.7, 2.5, 4);
  deck(276, 1.5, 3);

  // los arcos entre las patas
  for (let f = 0; f < 4; f++) {
    const c = Math.cos((f * Math.PI) / 2), s = Math.sin((f * Math.PI) / 2);
    let prev = null;
    for (let k = 0; k <= 24; k++) {
      const u = (k / 24) * 2 - 1;
      const h = 9 + 30 * Math.sqrt(1 - u * u);
      const x = u * inner(h), z = hw(h);
      const q = [x * c + z * s, h, -x * s + z * c];
      if (prev) seg(prev, q);
      prev = q;
    }
  }

  // puntos de luz repartidos por la estructura (el centelleo)
  const r = rng(324);
  const nSeg = p.length / 6;
  const lights = [];
  while (lights.length < 120) {
    const i = Math.floor(r() * nSeg) * 6, k = r();
    const y = p[i + 1] + (p[i + 4] - p[i + 1]) * k;
    if (y < 25) continue; // la base queda detrás de los edificios
    lights.push([p[i] + (p[i + 3] - p[i]) * k, y, p[i + 2] + (p[i + 5] - p[i + 2]) * k]);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  return { geometry: g, lights };
}

/* ---------- La orilla: muelle, edificios, árboles y farolas (agua en y = 0, muelle en z = 0) ---------- */

const C = (hex) => new THREE.Color(hex);
const COL = {
  facadeLow: C('#211a2c'), facadeHigh: C('#16122a'), cornice: C('#2a2338'), side: C('#110d1e'),
  roofLow: C('#15152a'), roofHigh: C('#1d1e36'), roofTop: C('#21223b'), chimney: C('#141126'),
  quayLow: C('#0b0916'), quayHigh: C('#1c1729'), quayTop: C('#18142a'), road: C('#120f24'), post: C('#0b0914'),
  leafLow: C('#0a0c18'), leafHigh: C('#151a30'), trunk: C('#0b0912'),
};
const WARM = ['#ffcf8a', '#ffd9a6', '#ffe6c2', '#ffbe78', '#ffc98f', '#dfe6ff'];

function bankGeometry(seed) {
  const r = rng(seed);
  const rr = (a, b) => a + (b - a) * r();
  const pos = [], col = [], wpos = [], wcol = [];
  const lamps = [];

  const push = (P, Cl, verts, colors) => {
    for (const v of verts) P.push(v[0], v[1], v[2]);
    for (const c of colors) Cl.push(c.r, c.g, c.b);
  };
  // cuadrilátero a-b-c-d (antihorario visto desde fuera); c0 para a-b, c1 para c-d
  const quad = (a, b, c, d, c0, c1 = c0) => push(pos, col, [a, b, c, a, c, d], [c0, c0, c1, c0, c1, c1]);
  const box = (x0, x1, y0, y1, zb, zf, cLow, cHigh, cTop, cSide) => {
    quad([x0, y0, zf], [x1, y0, zf], [x1, y1, zf], [x0, y1, zf], cLow, cHigh);
    quad([x0, y1, zf], [x1, y1, zf], [x1, y1, zb], [x0, y1, zb], cTop);
    quad([x0, y0, zb], [x0, y0, zf], [x0, y1, zf], [x0, y1, zb], cSide);
    quad([x1, y0, zf], [x1, y0, zb], [x1, y1, zb], [x1, y1, zf], cSide);
  };
  const win = (x, y, w, h, z, k) => {
    const c = C(WARM[Math.floor(r() * (r() < 0.93 ? 5 : 6))]).multiplyScalar(k);
    push(wpos, wcol, [[x, y, z], [x + w, y, z], [x + w, y + h, z], [x, y, z], [x + w, y + h, z], [x, y + h, z]], [c, c, c, c, c, c]);
  };

  // muelle de piedra y calle
  box(-SPAN, SPAN, -0.6, QUAY_H, -1, 0, COL.quayLow, COL.quayHigh, COL.quayTop, COL.side);
  quad([-SPAN, QUAY_H, -1], [SPAN, QUAY_H, -1], [SPAN, QUAY_H, -2.8], [-SPAN, QUAY_H, -2.8], COL.road);

  // edificios
  let x = -SPAN;
  while (x < SPAN) {
    const w = rr(2.6, 4.4), h = rr(3.3, 4.5), d = rr(3, 5);
    const zf = -2.3 + rr(-0.3, 0.3), zb = zf - d;
    const y0 = QUAY_H, y1 = y0 + h;
    box(x, x + w, y0, y1, zb, zf, COL.facadeLow, COL.facadeHigh, COL.roofLow, COL.side);
    quad([x, y1 - 0.09, zf + 0.05], [x + w, y1 - 0.09, zf + 0.05], [x + w, y1, zf + 0.05], [x, y1, zf + 0.05], COL.cornice);
    // mansarda de zinc
    const mh = rr(0.7, 1.05), ins = 0.5, yt = y1 + mh;
    quad([x, y1, zf], [x + w, y1, zf], [x + w, yt, zf - ins], [x, yt, zf - ins], COL.roofLow, COL.roofHigh);
    quad([x, yt, zf - ins], [x + w, yt, zf - ins], [x + w, yt, zb + ins], [x, yt, zb + ins], COL.roofTop);
    quad([x, y1, zb], [x, y1, zf], [x, yt, zf - ins], [x, yt, zb + ins], COL.side);
    quad([x + w, y1, zf], [x + w, y1, zb], [x + w, yt, zb + ins], [x + w, yt, zf - ins], COL.side);
    for (let k = 1 + Math.floor(r() * 3); k > 0; k--) {
      const cx = x + rr(0.2, w - 0.6), cz = zf - ins - rr(0.3, 1.2);
      box(cx, cx + rr(0.25, 0.45), yt - 0.1, yt + rr(0.3, 0.6), cz - 0.3, cz, COL.chimney, COL.chimney, COL.chimney, COL.side);
    }
    // ventanas: pocas encendidas; en la planta baja, escaparates y cafés
    const cols = Math.max(2, Math.round(w / 0.62)), cw = w / cols;
    const floors = Math.floor((h - 0.9) / 0.68);
    for (let c = 0; c < cols; c++) {
      const wx = x + c * cw + cw * 0.3;
      if (r() < 0.3) win(wx - cw * 0.12, y0 + 0.12, cw * 0.64, 0.55, zf + 0.03, rr(0.5, 0.9));
      for (let f = 0; f < floors; f++) {
        if (r() < 0.13) win(wx, y0 + 1.05 + f * 0.68, cw * 0.4, 0.34, zf + 0.03, rr(0.3, 0.85));
      }
      if (r() < 0.1) win(wx, y1 + mh * 0.25, cw * 0.36, mh * 0.34, zf - ins * 0.25 + 0.03, rr(0.3, 0.7));
    }
    x += w + (r() < 0.1 ? rr(1, 2.2) : 0.03);
  }

  // farolas y plátanos de sombra a lo largo del muelle
  const ico = new THREE.IcosahedronGeometry(1, 0).attributes.position;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), Cc = new THREE.Vector3(), tmp = new THREE.Color();
  for (let lx = -SPAN + 1.5; lx < SPAN; lx += 3.4) {
    box(lx - 0.03, lx + 0.03, QUAY_H, QUAY_H + 0.85, -0.36, -0.3, COL.post, COL.post, COL.post, COL.post);
    lamps.push([lx, QUAY_H + 0.92, -0.33]);
    if (r() < 0.62) {
      const tx = lx + 1.7 + rr(-0.3, 0.3), rad = rr(0.75, 1.05), ty = QUAY_H + 1.5 + rad * 0.5;
      box(tx - 0.06, tx + 0.06, QUAY_H, ty, -1.6, -1.48, COL.trunk, COL.trunk, COL.trunk, COL.trunk);
      const S = { x: rad * 1.15, y: rad * 0.85, z: rad * 0.9 }, O = { x: tx, y: ty, z: -1.55 };
      for (let i = 0; i < ico.count; i += 3) {
        const v = [A, B, Cc].map((P, j) => P.fromBufferAttribute(ico, i + j).multiply(S).add(O));
        const ny = B.clone().sub(A).cross(Cc.clone().sub(A)).normalize().y;
        tmp.lerpColors(COL.leafLow, COL.leafHigh, 0.5 + 0.5 * ny);
        push(pos, col, v.map((P) => [P.x, P.y, P.z]), [tmp, tmp, tmp]);
      }
    }
  }

  const solid = new THREE.BufferGeometry();
  solid.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  solid.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const windows = new THREE.BufferGeometry();
  windows.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
  windows.setAttribute('color', new THREE.Float32BufferAttribute(wcol, 3));
  return { solid, windows, lamps };
}

/* ---------- Cúpula de los Inválidos (oscura, con nervios dorados) ---------- */

function domeGeometry() {
  const prof = [[0, 0], [3, 0], [3, 2.4], [2.6, 2.4], [2.6, 3.4], [2.8, 3.4], [2.8, 3.65], [2.5, 3.65]];
  for (let k = 1; k < 8; k++) {
    const a = (k / 8) * (Math.PI / 2);
    prof.push([2.5 * Math.cos(a), 3.65 + 3 * Math.sin(a)]);
  }
  prof.push([0.45, 6.6], [0.45, 7.7], [0.2, 7.7], [0.02, 9]);
  const lathe = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 20).toNonIndexed();
  const p = lathe.attributes.position, col = [];
  const low = C('#15111f'), high = C('#3a2f3a'), tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    tmp.lerpColors(low, high, THREE.MathUtils.smoothstep(p.getY(i), 2, 8));
    col.push(tmp.r, tmp.g, tmp.b);
  }
  lathe.deleteAttribute('normal');
  lathe.deleteAttribute('uv');
  lathe.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));

  const rib = [];
  for (let m = 0; m < 12; m++) {
    const a = (m / 12) * Math.PI * 2;
    for (let k = 0; k < 8; k++) {
      const p0 = (k / 8) * (Math.PI / 2), p1 = ((k + 1) / 8) * (Math.PI / 2);
      const r0 = 2.53 * Math.cos(p0), r1 = 2.53 * Math.cos(p1);
      rib.push(r0 * Math.cos(a), 3.65 + 3 * Math.sin(p0), r0 * Math.sin(a), r1 * Math.cos(a), 3.65 + 3 * Math.sin(p1), r1 * Math.sin(a));
    }
  }
  const ribs = new THREE.BufferGeometry();
  ribs.setAttribute('position', new THREE.Float32BufferAttribute(rib, 3));
  return { body: lathe, ribs };
}

/* ---------- Materiales ---------- */

// Líneas doradas aditivas; la copia reflejada en el agua ondula y se apaga
function lineMaterial(color, alpha, fade, uTime, mirror = false) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uAlpha: { value: alpha }, uFade: fade, uTime },
    defines: mirror ? { MIRROR: '' } : {},
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying float vH, vY;
      void main() {
        vH = position.y;
        vec4 w = modelMatrix * vec4(position, 1.0);
        #ifdef MIRROR
          w.x += sin(w.y * 1.3 + uTime * 1.1) * 0.18 + sin(w.y * 3.7 - uTime * 1.7) * 0.07;
        #endif
        vY = w.y;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uAlpha, uFade, uTime;
      varying float vH, vY;
      void main() {
        float a = uAlpha * uFade * (1.0 - 0.4 * vH / ${TOWER_M}.0);
        #ifdef MIRROR
          a *= 0.13 * smoothstep(40.0, 110.0, vH) * (1.0 - smoothstep(140.0, 260.0, vH)) * (0.4 + 0.6 * sin(vY * 5.0 + uTime * 2.2));
        #endif
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }`,
  });
}

// Puntos de luz suaves (farolas); con "streak" se estiran en vertical y tiemblan, como su reflejo en el río
function glowMaterial(color, alpha, fade, shared, streak = false) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) }, uAlpha: { value: alpha }, uFade: fade,
      uTime: shared.uTime, uPR: shared.uPR, uScale: shared.uScale,
    },
    defines: streak ? { STREAK: '' } : {},
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uPR, uScale;
      attribute float aSize, aPhase;
      varying float vPhase;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uPR * uScale / max(-mv.z, 0.1);
        vPhase = aPhase;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uAlpha, uFade, uTime;
      varying float vPhase;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        #ifdef STREAK
          float wob = sin(p.y * 30.0 + uTime * 2.4 + vPhase * 6.28) * 0.015;
          float a = exp(-pow((p.x + wob) * 24.0, 2.0)) * exp(-pow(p.y * 2.8, 2.0));
          a *= 0.55 + 0.45 * sin(p.y * 55.0 - uTime * 3.5 + vPhase * 9.0);
        #else
          float d2 = dot(p, p);
          float a = exp(-d2 * 70.0) + 0.2 * exp(-d2 * 14.0);
        #endif
        gl_FragColor = vec4(uColor, a * uAlpha * uFade);
        #include <colorspace_fragment>
      }`,
  });
}

function pointsGeometry(list, size) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(list.flat(), 3));
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(list.map(() => size), 1));
  g.setAttribute('aPhase', new THREE.Float32BufferAttribute(list.map((_, i) => (i * 0.618) % 1), 1));
  return g;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.3, 'rgba(255,255,255,0.3)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/* ---------- La escena ---------- */

export function createParis({ scene, camera, uniforms, sparkGeometry, sparkMaterial }) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);
  const mirror = new THREE.Group(); // lo que se refleja en el agua (y → -y)
  mirror.scale.y = -1;
  group.add(mirror);

  const fade = { value: 0 };
  const shared = { uTime: uniforms.uTime, uPR: uniforms.uPR, uScale: uniforms.uScale };
  const fadeMats = []; // [material, opacidad máxima]

  // El agua: oscura, más clara en la lejanía (refleja el cielo), con ondas muy suaves
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(SPAN * 4, D_BANK + 40).rotateX(-Math.PI / 2).translate(0, 0, (D_BANK + 40) / 2 - 1),
    new THREE.ShaderMaterial({
      uniforms: { uFade: fade, uTime: uniforms.uTime, uDeep: { value: C('#04040c') }, uSky: { value: C('#2b1a3c') } },
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vW;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uDeep, uSky;
        uniform float uFade, uTime;
        varying vec3 vW;
        void main() {
          vec3 v = normalize(cameraPosition - vW);
          float graze = pow(1.0 - v.y, 6.0);
          float rip = sin(vW.x * 0.9 + sin(vW.z * 1.7 + uTime * 0.5) * 1.5) * sin(vW.z * 3.1 - uTime * 0.9 + sin(vW.x * 0.4));
          vec3 col = mix(uDeep, uSky, clamp(graze * (0.85 + 0.15 * rip), 0.0, 1.0));
          gl_FragColor = vec4(col, uFade);
          #include <colorspace_fragment>
        }`,
    }),
  );
  water.renderOrder = -370;
  group.add(water);

  // La orilla
  const bank = bankGeometry(1889);
  const solidMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, fog: false, toneMapped: false });
  fadeMats.push([solidMat, 1]);
  const solid = new THREE.Mesh(bank.solid, solidMat);
  solid.renderOrder = -400;
  group.add(solid);
  const windowMat = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
  });
  fadeMats.push([windowMat, 0.4]);
  const windows = new THREE.Mesh(bank.windows, windowMat);
  windows.renderOrder = -385;
  group.add(windows);

  const lamps = new THREE.Points(pointsGeometry(bank.lamps, 0.9), glowMaterial('#ffd49a', 0.5, fade, shared));
  lamps.renderOrder = -350;
  group.add(lamps);
  const lampRefl = new THREE.Points(pointsGeometry(bank.lamps, 4.2), glowMaterial('#ffc985', 0.28, fade, shared, true));
  lampRefl.renderOrder = -360;
  mirror.add(lampRefl);

  // La torre y su reflejo
  const towerInfo = towerGeometry();
  const tower = new THREE.LineSegments(towerInfo.geometry, lineMaterial('#ffb862', 0.26, fade, uniforms.uTime));
  tower.renderOrder = -390;
  group.add(tower);
  const towerRefl = new THREE.LineSegments(towerInfo.geometry, lineMaterial('#ffb862', 0.26, fade, uniforms.uTime, true));
  towerRefl.renderOrder = -360;
  mirror.add(towerRefl);
  const sparkle = new THREE.Points(sparkGeometry(towerInfo.lights.map(([x, y, z], i) => ({
    x, y, z, size: 0.2 + ((i * 0.618) % 1) * 0.25, alpha: 0.5, color: [1, 0.96, 0.88],
  }))), sparkMaterial(1, fade));
  sparkle.renderOrder = -380;
  tower.add(sparkle);
  const beacon = new THREE.Points(pointsGeometry([[0, 318, 0]], 2.4), glowMaterial('#fff0d8', 0.3, fade, shared));
  beacon.renderOrder = -380;
  tower.add(beacon);

  // La cúpula
  const domeInfo = domeGeometry();
  const dome = new THREE.Mesh(domeInfo.body, solidMat);
  dome.renderOrder = -400;
  const ribs = new THREE.LineSegments(domeInfo.ribs, lineMaterial('#ffbf70', 0.2, fade, uniforms.uTime));
  ribs.renderOrder = -390;
  dome.add(ribs);
  group.add(dome);

  // Luna y estrellas, muy al fondo
  const moonMat = new THREE.MeshBasicMaterial({ color: C('#e8dccb'), transparent: true, opacity: 0, fog: false, toneMapped: false, depthWrite: false });
  fadeMats.push([moonMat, 0.5]);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), moonMat);
  moon.renderOrder = -500;
  const haloMat = new THREE.SpriteMaterial({
    map: glowTexture(), color: C('#ffe0c0'), transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  fadeMats.push([haloMat, 0.1]);
  const halo = new THREE.Sprite(haloMat);
  halo.scale.setScalar(9);
  halo.renderOrder = -501;
  moon.add(halo);
  group.add(moon);

  const stars = new THREE.Points(sparkGeometry(Array.from({ length: 70 }, (_, i) => {
    const r = rng(500 + i);
    return { x: r() * 2 - 1, y: r(), z: 0, size: 0.5 + r() * 0.7, alpha: 0.15 + r() * 0.35, color: [1, 0.95, 0.9] };
  })), sparkMaterial(1, fade));
  stars.renderOrder = -510;
  group.add(stars);

  return {
    setFade(f) {
      fade.value = f;
      for (const [m, max] of fadeMats) m.opacity = f * max;
      group.visible = f > 0.001;
    },
    // Coloca la escena según la vista final, para que encaje en cualquier pantalla
    layout(view, heartHalfWidth) {
      const P = view.pos;
      const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), asp = camera.aspect;
      const portrait = asp < 1;
      const hz = portrait ? -0.3 : -0.4; // la orilla, en pantalla (-1 abajo, 1 arriba)
      const waterY = P.y + hz * D_BANK * t;
      group.position.set(P.x, waterY, P.z - D_BANK);
      // de pantalla (a una distancia D de la cámara final) a coordenadas locales de la orilla
      const at = (nx, ny, D) => [nx * D * t * asp, P.y + ny * D * t - waterY, D_BANK - D];

      // en vertical la torre queda detrás del corazón (asoma por arriba); en horizontal, a su derecha
      let nx = 0;
      if (!portrait) {
        const heartHalf = heartHalfWidth / (view.dist * t * asp);
        nx = Math.min(0.74, heartHalf + (1 - heartHalf) * 0.5);
      }
      const [tx, top, tz] = at(nx, portrait ? 0.86 : 0.74, D_TOWER);
      tower.scale.setScalar((top - QUAY_H) / TOWER_M);
      tower.position.set(tx, QUAY_H, tz);
      towerRefl.scale.copy(tower.scale);
      towerRefl.position.copy(tower.position);

      const [dx, , dz] = at(portrait ? -0.55 : -0.72, 0, D_BANK + 16);
      dome.position.set(dx, QUAY_H, dz);

      const [mx, my, mz] = at(portrait ? -0.55 : -0.62, portrait ? 0.8 : 0.7, D_SKY - 10);
      moon.position.set(mx, my, mz);
      moon.scale.setScalar(0.024 * (D_SKY - 10) * t);

      const [, sy0, sz] = at(0, hz + 0.25, D_SKY);
      const [sx1, sy1] = at(1.15, 1.1, D_SKY);
      stars.scale.set(sx1, sy1 - sy0, 1);
      stars.position.set(0, sy0, sz);
    },
  };
}
