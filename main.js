import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createParis } from './paris.js';

/* ================= Ajustes ================= */

// Fotos del corazón (cuadradas): se ven a través de los pétalos y van pasando en este orden
const PHOTOS = ['fotos/1.webp', 'fotos/2.webp', 'fotos/3.webp', 'fotos/4.webp', 'fotos/5.webp', 'fotos/6.webp'];
const PHOTO_HOLD = 4.5;        // segundos que se ve cada foto
const PHOTO_FADE = 1.4;        // fundido de una a la siguiente
const PHOTO_ZOOM = 1.0;        // >1 amplía las fotos dentro del corazón
const PHOTO_OFFSET = [0, 0];   // mueve las fotos dentro del corazón: [x, y] entre -0.5 y 0.5

const HEART_POS = new THREE.Vector3(0, 0.3, -22);
const HEART_WIDTH = 6.4;
const ROSE_Y = 0.25;
const BLOOM_Y = ROSE_Y + 1.4;  // altura aproximada del centro de la flor
const STEM_TIP_Y = ROSE_Y - 2.85;
const HEART_OPEN = 0.55;       // cuánto se abre cada pétalo al posarse en el corazón (0 = como en la rosa, 1 = plano)
const FOG_PLAY = 0.024;

/* ================= Utilidades ================= */

const V3 = THREE.Vector3;
const V2 = THREE.Vector2;
const isTouch = matchMedia('(pointer: coarse)').matches;

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261010);
const rr = (a, b) => a + (b - a) * rand();
const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);

const ease = {
  outCubic: (k) => 1 - (1 - k) ** 3,
  inOutCubic: (k) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2),
  inOutSine: (k) => -(Math.cos(Math.PI * k) - 1) / 2,
  outBack: (k) => 1 + 2.4 * (k - 1) ** 3 + 1.4 * (k - 1) ** 2,
};

function bezier(p0, p1, p2, p3, t, out) {
  const u = 1 - t;
  return out.set(0, 0, 0)
    .addScaledVector(p0, u * u * u)
    .addScaledVector(p1, 3 * u * u * t)
    .addScaledVector(p2, 3 * u * t * t)
    .addScaledVector(p3, t * t * t);
}

function randomUnit() {
  const z = rr(-1, 1), a = rr(0, Math.PI * 2), r = Math.sqrt(1 - z * z);
  return new V3(r * Math.cos(a), r * Math.sin(a), z);
}

// Animaciones sencillas basadas en tiempo
const tweens = [];
function tween(duration, onUpdate, { delay = 0, onDone } = {}) {
  tweens.push({ t: -delay, duration, onUpdate, onDone });
}
const wait = (sec, fn) => tween(sec, () => {}, { onDone: fn });
function updateTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dt;
    if (tw.t < 0) continue;
    const k = Math.min(tw.t / tw.duration, 1);
    tw.onUpdate(k);
    if (k >= 1) {
      tweens.splice(i, 1);
      tw.onDone?.();
    }
  }
}

/* ================= Render ================= */

const canvas = document.getElementById('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  document.getElementById('nogl').hidden = false;
  document.getElementById('veil').remove();
  throw err;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.75 : 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.transmissionResolutionScale = isTouch ? 0.5 : 0.75;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xffffff, FOG_PLAY);

const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 220);
const camLook = new V3();

// Entorno tipo "joyería": fondo oscuro con focos pequeños y muy brillantes → destellos en las facetas
function crystalEnvironment() {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(
    new THREE.SphereGeometry(20, 32, 16),
    new THREE.MeshBasicMaterial({ color: '#1a0715', side: THREE.BackSide }),
  ));
  const panel = (w, h, color, intensity, x, y, z) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }),
    );
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  panel(18, 8, '#ffe0ee', 1.4, 0, 11, 0);
  panel(14, 8, '#ff9fca', 0.5, 0, 1, 13);
  panel(5, 2.2, '#ffffff', 9, 0, 9, 6);
  panel(1.2, 7, '#ffffff', 7, -9, 2, 3);
  panel(1.2, 7, '#ffd6ea', 6, 9, 1, 2);
  panel(4, 4, '#ff5fa2', 4, 0, -3, -10);
  panel(2, 2, '#fff2d6', 8, 6, 6, -6);
  const r = mulberry32(77);
  for (let i = 0; i < 26; i++) {
    const d = new V3(r() - 0.5, r() * 0.9 - 0.2, r() - 0.5).normalize().multiplyScalar(12);
    const s = 0.25 + r() * 0.45;
    panel(s, s, r() < 0.7 ? '#ffffff' : '#ffc1dc', 14, d.x, d.y, d.z);
  }
  return pmrem.fromScene(env, 0.015).texture;
}

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = crystalEnvironment();

const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
keyLight.position.set(3, 5, 6);
scene.add(keyLight);
const rimLight = new THREE.PointLight(0xff7ab8, 30, 20, 2);
rimLight.position.set(-3, 2.5, -3);
scene.add(rimLight);

const uniforms = {
  uTime: { value: 0 },
  uPR: { value: renderer.getPixelRatio() },
  uScale: { value: 1 },
};

/* ================= Fondo: blanco → noche rosada → noche de París ================= */

const SKIES = [
  // arriba, horizonte, abajo, halo
  ['#ffffff', '#ffffff', '#fdf3f7', '#ffb6d3'], // blanco
  ['#f3d3e1', '#e9b5cb', '#d99bb7', '#ff8fbf'], // rosa empolvado (a mitad)
  ['#1c0a26', '#3a0f2e', '#0a0309', '#ff4f97'], // noche rosada
  ['#0b0d2c', '#3a1a4c', '#07060f', '#ff9a7a'], // París
];
const skyColors = (i) => SKIES.map((s) => new THREE.Color(s[i]));
const FOG_COLORS = SKIES.map((s) => new THREE.Color(s[1]).convertLinearToSRGB());

const bg = new THREE.Mesh(
  new THREE.SphereGeometry(60, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: skyColors(0) },
      uMid: { value: skyColors(1) },
      uBottom: { value: skyColors(2) },
      uGlow: { value: skyColors(3) },
      uMix: { value: 0 },
      uParis: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop[4], uMid[4], uBottom[4], uGlow[4];
      uniform float uMix, uParis;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      vec3 grad(int i, float y, float h) {
        vec3 c = mix(uBottom[i], uMid[i], smoothstep(h - 0.75, h + 0.05, y));
        return mix(c, uTop[i], smoothstep(h + 0.05, h + 0.9, y));
      }
      void main() {
        vec3 d = normalize(vDir);
        float g = max(dot(d, normalize(vec3(0.0, 0.08, -1.0))), 0.0);
        float halo = pow(g, 24.0) * 0.045 + pow(g, 160.0) * 0.06;
        const vec3 G = vec3(1.0 / 2.2);
        vec3 day = pow(grad(0, d.y, 0.0) + uGlow[0] * halo, G);
        vec3 blush = pow(grad(1, d.y, 0.0) + uGlow[1] * halo, G);
        vec3 night = pow(grad(2, d.y, 0.0) + uGlow[2] * halo, G);
        vec3 paris = pow(grad(3, d.y, -0.12) + uGlow[3] * exp(-pow((d.y + 0.12) * 9.0, 2.0)) * 0.07, G);
        // mezcla en espacio perceptual para que el cambio sea gradual
        vec3 col = uMix < 0.5 ? mix(day, blush, uMix * 2.0) : mix(blush, night, uMix * 2.0 - 1.0);
        col = mix(col, paris, uParis);
        col = pow(col, vec3(2.2)) + (hash(gl_FragCoord.xy) - 0.5) / 255.0;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  }),
);
bg.renderOrder = -1000;
bg.frustumCulled = false;
scene.add(bg);

let bgMix = 0;    // 0 blanco → 1 noche (sube con cada pétalo)
let parisMix = 0; // 0 → 1 al acercarnos al corazón
let reveal = 0;   // 0 → 1 al acercarnos: el cristal del corazón se aclara y deja ver la foto

/* ================= Destellos (points) ================= */

function sparkMaterial(twinkle, fade = { value: 1 }) {
  return new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uTwinkle: { value: twinkle }, uFade: fade },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uTime, uPR, uScale, uTwinkle, uFade;
      attribute float aSize, aAlpha, aPhase;
      attribute vec3 aColor;
      varying float vA;
      varying vec3 vC;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float s = 0.5 + 0.5 * sin(uTime * (1.2 + fract(aPhase * 7.13) * 2.4) + aPhase * 6.2831);
        float tw = mix(1.0, s * s * s, uTwinkle);
        vA = aAlpha * tw * uFade;
        vC = aColor;
        gl_PointSize = aSize * uPR * uScale * (0.45 + 0.55 * tw) / max(-mv.z, 0.1);
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      varying vec3 vC;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float d = length(p);
        float glow = exp(-d * d * 30.0);
        float star = exp(-abs(p.x) * 40.0) * exp(-abs(p.y) * 5.5) + exp(-abs(p.y) * 40.0) * exp(-abs(p.x) * 5.5);
        float a = (glow * 0.75 + star * 0.9) * vA * smoothstep(0.5, 0.3, d);
        gl_FragColor = vec4(vC, a);
      }`,
  });
}
const twinkleMat = sparkMaterial(1);

function sparkGeometry(points) {
  const n = points.length;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const size = new Float32Array(n), alpha = new Float32Array(n), phase = new Float32Array(n);
  points.forEach((p, i) => {
    pos.set([p.x, p.y, p.z], i * 3);
    col.set(p.color ?? [1, 0.92, 0.96], i * 3);
    size[i] = p.size;
    alpha[i] = p.alpha ?? 1;
    phase[i] = rand();
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  return g;
}

const SPARK_COLORS = [[1, 0.93, 0.97], [1, 0.62, 0.8], [1, 0.85, 0.6], [0.85, 0.75, 1]];

// Polvo brillante que flota por toda la escena (la cámara lo atraviesa al final)
const dust = new THREE.Points(
  sparkGeometry(Array.from({ length: isTouch ? 220 : 320 }, () => ({
    x: rr(-9, 9), y: rr(-6, 7), z: rr(-34, 6),
    size: rr(0.05, 0.13), alpha: rr(0.35, 0.9),
    color: SPARK_COLORS[Math.floor(rand() * SPARK_COLORS.length)],
  }))),
  twinkleMat,
);
dust.frustumCulled = false;
scene.add(dust);

// Partículas de explosión (pool reutilizable)
class Burst {
  constructor(max) {
    this.max = max;
    this.next = 0;
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.ttl = new Float32Array(max);
    this.size0 = new Float32Array(max);
    const g = sparkGeometry(Array.from({ length: max }, () => ({ x: 0, y: 0, z: 0, size: 0, alpha: 0 })));
    this.pos = g.attributes.position;
    this.col = g.attributes.aColor;
    this.size = g.attributes.aSize;
    this.alpha = g.attributes.aAlpha;
    this.points = new THREE.Points(g, sparkMaterial(0));
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);
  }
  emit(p, n, { speed = 1.5, size = 0.12, life = 1.2, spread = 0.05, up = 0.2, colors = SPARK_COLORS } = {}) {
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      const d = randomUnit();
      this.pos.setXYZ(i, p.x + d.x * spread, p.y + d.y * spread, p.z + d.z * spread);
      const s = speed * rr(0.25, 1);
      this.vel.set([d.x * s, d.y * s + up, d.z * s], i * 3);
      const c = colors[Math.floor(rand() * colors.length)];
      this.col.setXYZ(i, c[0], c[1], c[2]);
      this.size0[i] = size * rr(0.6, 1.3);
      this.life[i] = 0;
      this.ttl[i] = life * rr(0.6, 1.25);
    }
    this.col.needsUpdate = true;
  }
  update(dt) {
    const v = this.vel, drag = Math.max(0, 1 - 1.6 * dt);
    for (let i = 0; i < this.max; i++) {
      if (this.ttl[i] <= 0) continue;
      this.life[i] += dt;
      const k = this.life[i] / this.ttl[i];
      if (k >= 1) {
        this.ttl[i] = 0;
        this.alpha.setX(i, 0);
        continue;
      }
      v[i * 3] *= drag; v[i * 3 + 1] = v[i * 3 + 1] * drag - 0.35 * dt; v[i * 3 + 2] *= drag;
      this.pos.setXYZ(i, this.pos.getX(i) + v[i * 3] * dt, this.pos.getY(i) + v[i * 3 + 1] * dt, this.pos.getZ(i) + v[i * 3 + 2] * dt);
      this.alpha.setX(i, (1 - k) ** 1.5 * Math.min(1, this.life[i] * 12));
      this.size.setX(i, this.size0[i] * (1 - 0.5 * k));
    }
    this.pos.needsUpdate = this.alpha.needsUpdate = this.size.needsUpdate = true;
  }
}
const burst = new Burst(700);

/* ================= Materiales de cristal ================= */

// La transmisión y el brillo propio se ajustan según el fondo (ver applyAtmosphere)
const pinkGlass = new THREE.MeshPhysicalMaterial({
  color: '#ffffff',
  vertexColors: true,
  emissive: '#ff4d94',
  emissiveIntensity: 0.1,
  roughness: 0.04,
  metalness: 0,
  transmission: 0.92,
  thickness: 0.35,
  ior: 1.85,
  dispersion: isTouch ? 0 : 3, // la dispersión triplica el coste de la refracción
  attenuationColor: '#ff7ab0',
  attenuationDistance: 1.0,
  clearcoat: 1,
  clearcoatRoughness: 0.03,
  envMapIntensity: 2.2,
  iridescence: 0.3,
  iridescenceIOR: 1.4,
  flatShading: true,
  fog: false,
});

const greenGlass = new THREE.MeshPhysicalMaterial({
  color: '#ffffff',
  vertexColors: true,
  emissive: '#1fae4a',
  emissiveIntensity: 0.1,
  roughness: 0.04,
  metalness: 0,
  transmission: 0.9,
  thickness: 0.3,
  ior: 1.8,
  dispersion: isTouch ? 0 : 2,
  attenuationColor: '#5fe08a',
  attenuationDistance: 1.0,
  clearcoat: 1,
  clearcoatRoughness: 0.03,
  envMapIntensity: 2,
  flatShading: true,
  fog: false,
});

/* ================= Geometría de la rosa ================= */

function buildGeometry(pos) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// Cada faceta con un tono distinto (más claro si mira hacia arriba): da el aspecto de cristal tallado
const PINK_FACETS = ['#fff0f6', '#e8357f'];
const GREEN_FACETS = ['#e3fde8', '#26b85a'];
function facetColors(geo, [light, dark], seed) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const r = mulberry32(seed), p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const a = new V3(), b = new V3(), c = new V3(), tmp = new THREE.Color();
  const L = new THREE.Color(light), D = new THREE.Color(dark);
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1).sub(a);
    c.fromBufferAttribute(p, i + 2).sub(a);
    const up = b.cross(c).normalize().y;
    tmp.lerpColors(D, L, clamp(0.6 * r() ** 0.8 + 0.4 * (0.5 + 0.5 * up), 0, 1));
    for (let v = 0; v < 3; v++) col.set([tmp.r, tmp.g, tmp.b], (i + v) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// Pétalo facetado con grosor, cóncavo hacia el centro de la flor.
// Lleva un "morph target" con el mismo pétalo aplanado, que es como encaja en el corazón.
function petalGeometry({ L, W, T, phi0, phi1, wrap, curl, seed }) {
  const rnd = mulberry32(seed);
  const NU = 4, NV = 5;
  const jit = [];
  for (let j = 0; j <= NV; j++) {
    for (let i = 0; i <= NU; i++) {
      const s = i > 0 && i < NU && j > 0 && j < NV ? 1 : 0.4;
      jit.push([(rnd() - 0.5) * 0.05 * s, (rnd() - 0.5) * 0.05 * s, (rnd() - 0.5) * 0.04 * s]);
    }
  }
  const flipDiag = Array.from({ length: NU * NV }, () => rnd() < 0.5);

  const build = (flat) => {
    const F = [], B = [];
    const p0 = flat ? 0 : phi0, p1 = flat ? 0 : phi1;
    let sy = 0, sz = 0;
    for (let j = 0; j <= NV; j++) {
      const v = j / NV;
      const phi = p0 + (p1 - p0) * v * v;
      const ny = -Math.sin(phi), nz = Math.cos(phi); // normal hacia fuera
      const ty = Math.cos(phi), tz = Math.sin(phi);  // tangente hacia la punta
      const width = W * (0.3 + 0.7 * Math.pow(Math.sin(Math.PI * (0.1 + 0.78 * v)), 0.7));
      const rowF = [], rowB = [];
      for (let i = 0; i <= NU; i++) {
        const u = (i / NU) * 2 - 1;
        const [jx, ja, jo] = jit[j * (NU + 1) + i];
        const x = u * width * 0.5 + jx;
        const along = ja - (j === NV ? L * 0.2 * u * u : 0);
        const ridge = i === NU / 2 ? T * (flat ? 1.4 : 0.4) : 0;
        const out = flat
          ? -(x * x) / 2.5 + ridge + jo * 2
          : -(x * x) / (2 * wrap) + curl * v * v * u * u * L + ridge + jo;
        const p = new V3(x, sy + ty * along + ny * out, sz + tz * along + nz * out);
        const t = T * (1 - 0.5 * Math.abs(u)) * (1 - 0.45 * v);
        rowF.push(p);
        rowB.push(new V3(p.x, p.y - ny * t, p.z - nz * t));
      }
      F.push(rowF);
      B.push(rowB);
      const vm = (j + 0.5) / NV, pm = p0 + (p1 - p0) * vm * vm;
      sy += (Math.cos(pm) * L) / NV;
      sz += (Math.sin(pm) * L) / NV;
    }

    const pos = [];
    const tri = (a, b, c) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let j = 0; j < NV; j++) {
      for (let i = 0; i < NU; i++) {
        const a = F[j][i], b = F[j][i + 1], c = F[j + 1][i + 1], d = F[j + 1][i];
        const a2 = B[j][i], b2 = B[j][i + 1], c2 = B[j + 1][i + 1], d2 = B[j + 1][i];
        if (flipDiag[j * NU + i]) {
          tri(a, b, c); tri(a, c, d); tri(a2, c2, b2); tri(a2, d2, c2);
        } else {
          tri(a, b, d); tri(b, c, d); tri(a2, d2, b2); tri(b2, d2, c2);
        }
      }
    }
    const loop = [];
    for (let i = 0; i <= NU; i++) loop.push([0, i]);
    for (let j = 1; j <= NV; j++) loop.push([j, NU]);
    for (let i = NU - 1; i >= 0; i--) loop.push([NV, i]);
    for (let j = NV - 1; j >= 1; j--) loop.push([j, 0]);
    for (let k = 0; k < loop.length; k++) {
      const [j0, i0] = loop[k], [j1, i1] = loop[(k + 1) % loop.length];
      tri(F[j0][i0], B[j1][i1], F[j1][i1]);
      tri(F[j0][i0], B[j0][i0], B[j1][i1]);
    }
    return pos;
  };

  const g = facetColors(buildGeometry(build(false)), PINK_FACETS, seed);
  const flatPos = build(true);
  g.morphAttributes.position = [new THREE.Float32BufferAttribute(flatPos, 3)];
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((flatPos.length / 3) * 2), 2));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < flatPos.length; i += 3) {
    minX = Math.min(minX, flatPos[i]); maxX = Math.max(maxX, flatPos[i]);
    minY = Math.min(minY, flatPos[i + 1]); maxY = Math.max(maxY, flatPos[i + 1]);
  }
  g.userData.flat = { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, l: maxY - minY };
  return g;
}

// Gema alargada (hojas, sépalos): sección en rombo a lo largo de +X, cara plana mirando a +Z
function gemGeometry({ length, width, height, below = 0.5, segs = 5, widest = 0.45, bend = 0, seed, palette = GREEN_FACETS }) {
  const rnd = mulberry32(seed);
  const S = [];
  for (let k = 0; k <= segs; k++) {
    const s = k / segs;
    const prof = s < widest
      ? Math.sin(((s / widest) * Math.PI) / 2)
      : Math.cos((((s - widest) / (1 - widest)) * Math.PI) / 2);
    const w = width * Math.pow(Math.max(prof, 0), 0.85), h = height * prof;
    const j = () => (k > 0 && k < segs ? (rnd() - 0.5) * width * 0.15 : 0);
    const x = s * length, z = bend * s * s;
    S.push([
      new V3(x + j(), j(), z + h),
      new V3(x + j(), w + j(), z + j()),
      new V3(x + j(), j(), z - h * below),
      new V3(x + j(), -w + j(), z + j()),
    ]);
  }
  const pos = [];
  const tri = (a, b, c) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let k = 0; k < segs; k++) {
    for (let e = 0; e < 4; e++) {
      const a = S[k][e], b = S[k][(e + 1) % 4], c = S[k + 1][(e + 1) % 4], d = S[k + 1][e];
      tri(a, c, b); tri(a, d, c);
    }
  }
  return facetColors(buildGeometry(pos), palette, seed);
}

/* ================= La rosa ================= */

const rose = {
  root: new THREE.Group(),
  tilt: new THREE.Group(),
  yaw: new THREE.Group(),
  bloom: new THREE.Group(),
  tiltAng: new V2(), tiltVel: new V2(),
  yawAng: 0, yawVel: 0,
  off: new V3(), offVel: new V3(),
  scale: 1, drop: 0,
  stem: new THREE.Group(), // tallo, hojas y espinas: dentro del tarro van recogidos y crecen al salir
  petals: [],
  pickables: [],
};
scene.add(rose.root);
rose.root.add(rose.tilt);
rose.tilt.add(rose.yaw);
rose.yaw.add(rose.bloom);
rose.bloom.position.y = 1.05;
rose.bloom.rotation.x = 0.32; // inclinada hacia la cámara, como en la foto

// De fuera hacia dentro: es el orden en el que se arrancan
const LAYERS = [
  { n: 5, L: 1.18, W: 1.25, T: 0.1, r: 0.36, y: -0.12, phi0: 0.62, phi1: 1.55, wrap: 0.9, curl: 0.16, off: 0.0 },
  { n: 5, L: 1.1, W: 1.05, T: 0.09, r: 0.25, y: -0.02, phi0: 0.32, phi1: 0.85, wrap: 0.6, curl: 0.08, off: 0.5 },
  { n: 3, L: 0.98, W: 0.92, T: 0.08, r: 0.15, y: 0.06, phi0: 0.1, phi1: 0.05, wrap: 0.36, curl: 0.0, off: 0.2 },
  { n: 2, L: 0.8, W: 0.7, T: 0.07, r: 0.06, y: 0.14, phi0: -0.02, phi1: -0.3, wrap: 0.2, curl: 0.0, off: 0.7 },
];
const TOTAL_PETALS = LAYERS.reduce((s, l) => s + l.n, 0);

LAYERS.forEach((Ld, li) => {
  for (let i = 0; i < Ld.n; i++) {
    const ang = ((i + Ld.off) / Ld.n) * Math.PI * 2 + rr(-0.12, 0.12);
    const geo = petalGeometry({
      L: Ld.L * rr(0.94, 1.06), W: Ld.W * rr(0.94, 1.06), T: Ld.T,
      phi0: Ld.phi0 + rr(-0.05, 0.05), phi1: Ld.phi1 + rr(-0.1, 0.1),
      wrap: Ld.wrap, curl: Ld.curl, seed: li * 100 + i + 1,
    });
    const mesh = new THREE.Mesh(geo, pinkGlass);
    mesh.position.set(Math.sin(ang) * Ld.r, Ld.y + rr(-0.02, 0.02), Math.cos(ang) * Ld.r);
    mesh.rotation.y = ang;
    mesh.frustumCulled = false; // al aplanarse crece más allá de su caja original
    rose.bloom.add(mesh);

    // un par de destellos que viajan con el pétalo
    const pa = geo.attributes.position;
    mesh.add(new THREE.Points(
      sparkGeometry(Array.from({ length: 2 }, () => {
        const k = Math.floor(rand() * pa.count);
        return { x: pa.getX(k), y: pa.getY(k), z: pa.getZ(k), size: rr(0.14, 0.24), alpha: 0.9 };
      })),
      twinkleMat,
    ));

    rose.petals.push({ mesh, layer: li, center: geo.boundingSphere.center.clone(), removed: false });
    rose.pickables.push(mesh);
  }
});

// Cáliz, sépalos, tallo, hojas y espinas
{
  rose.stem.position.y = 0.85; // crece desde lo alto del tallo, bajo la flor
  const stemParts = new THREE.Group();
  stemParts.position.y = -0.85;
  rose.stem.add(stemParts);
  rose.yaw.add(rose.stem);

  const receptacle = new THREE.Mesh(facetColors(new THREE.IcosahedronGeometry(0.2, 0), GREEN_FACETS, 401), greenGlass);
  receptacle.scale.set(1, 0.75, 1);
  receptacle.position.y = -0.22;
  rose.bloom.add(receptacle);

  for (let i = 0; i < 5; i++) {
    const holder = new THREE.Group();
    holder.rotation.y = (i / 5) * Math.PI * 2 + 0.3;
    const tiltG = new THREE.Group();
    tiltG.rotation.z = -0.35 + rr(-0.1, 0.15);
    const sepal = new THREE.Mesh(
      gemGeometry({ length: 0.72, width: 0.13, height: 0.06, widest: 0.3, seed: 500 + i }),
      greenGlass,
    );
    sepal.rotation.x = -Math.PI / 2;
    tiltG.position.set(0.08, -0.24, 0);
    tiltG.add(sepal);
    holder.add(tiltG);
    rose.bloom.add(holder);
    rose.pickables.push(sepal);
  }

  const stemTop = 0.85, stemBottom = -2.55, stemLen = stemTop - stemBottom;
  const stemGeo = new THREE.CylinderGeometry(0.07, 0.085, stemLen, 6, 6);
  stemGeo.translate(0, (stemTop + stemBottom) / 2, 0);
  const sp = stemGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) sp.setX(i, sp.getX(i) + Math.sin(sp.getY(i) * 0.9) * 0.05);
  stemGeo.computeVertexNormals();
  const stem = new THREE.Mesh(facetColors(stemGeo, GREEN_FACETS, 402), greenGlass);
  stemParts.add(stem);
  rose.pickables.push(stem);

  const tip = new THREE.Mesh(facetColors(new THREE.ConeGeometry(0.085, 0.3, 6), GREEN_FACETS, 403), greenGlass);
  tip.rotation.x = Math.PI;
  tip.position.set(Math.sin(stemBottom * 0.9) * 0.05, stemBottom - 0.15, 0);
  stemParts.add(tip);

  const leafDefs = [
    { y: -0.55, side: -1, len: 1.4, w: 0.36, up: 0.62, seed: 601 },
    { y: -1.35, side: 1, len: 1.15, w: 0.3, up: 0.5, seed: 602 },
  ];
  for (const d of leafDefs) {
    const leaf = new THREE.Mesh(
      gemGeometry({ length: d.len, width: d.w, height: 0.09, widest: 0.42, bend: -0.12, segs: 6, seed: d.seed }),
      greenGlass,
    );
    leaf.position.set(Math.sin(d.y * 0.9) * 0.05, d.y, 0.02);
    leaf.rotation.set(0, d.side < 0 ? Math.PI : 0, d.up);
    stemParts.add(leaf);
    rose.pickables.push(leaf);
  }

  for (const [y, a] of [[-0.15, 0.4], [-1.0, 2.6], [-1.9, 4.4], [0.4, 5.6]]) {
    const thorn = new THREE.Mesh(facetColors(new THREE.ConeGeometry(0.045, 0.22, 4), GREEN_FACETS, 404), greenGlass);
    const dir = new V3(Math.sin(a), 0.6, Math.cos(a)).normalize();
    thorn.quaternion.setFromUnitVectors(new V3(0, 1, 0), dir);
    thorn.position.set(Math.sin(y * 0.9) * 0.05 + Math.sin(a) * 0.1, y, Math.cos(a) * 0.1);
    stemParts.add(thorn);
  }
}

/* ================= El tarro (aparece primero; al tocarlo sale la rosa) ================= */

// Medidas del tarro en sus propias unidades (alto 3); luego se escala para que quepa en pantalla
const JAR = { H: 3, R: 0.77, neck: 0.56, lip: 0.65, wall: 0.035, base: 0.13, shoulder: 2.0 };
const ROSE_IN_JAR = { pos: new V3(0, 1.42 - 1.05 * 0.45, 0.12), scale: 0.45 };
const JAR_SPIN = 0.25; // giro solo, en rad/s, cuando no se toca
const hint = document.getElementById('hint');

const jar = {
  root: new THREE.Group(),
  spin: new THREE.Group(),
  content: new THREE.Group(),
  S: 1, baseY: 0, scale: 0, drop: 0,
  yaw: -0.5, yawVel: JAR_SPIN, tilt: 0, dragging: false,
  shake: 0,
};
scene.add(jar.root);
jar.root.add(jar.spin);
jar.spin.position.y = JAR.H / 2; // gira sobre su centro
jar.spin.add(jar.content);
jar.content.position.y = -JAR.H / 2;
jar.root.scale.setScalar(1e-4);

// Vidrio fino: casi transparente en el centro y más visible en los bordes, con reflejos
const jarFade = { value: 1 };
const jarGlass = new THREE.MeshPhysicalMaterial({
  color: '#f2faf7',
  roughness: 0.03,
  metalness: 0,
  transparent: true,
  opacity: 0.08,
  side: THREE.DoubleSide,
  depthWrite: false,
  clearcoat: 1,
  clearcoatRoughness: 0.02,
  envMapIntensity: 1.6,
  iridescence: 0.08,
  iridescenceIOR: 1.3,
  fog: false,
});
jarGlass.onBeforeCompile = (shader) => {
  shader.uniforms.uFade = jarFade;
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uFade;')
    .replace('#include <opaque_fragment>', /* glsl */ `#include <opaque_fragment>
      float fr = pow(1.0 - saturate(abs(dot(normal, normalize(vViewPosition)))), 2.2);
      float hi = smoothstep(0.75, 1.6, max(max(outgoingLight.r, outgoingLight.g), outgoingLight.b));
      gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.36, 0.5, 0.48), fr * 0.55 * (1.0 - hi));
      gl_FragColor.a = saturate(gl_FragColor.a + fr * 0.5 + hi * 0.5) * uFade;`);
};

// Cristal de las flores, con la misma estética que la rosa
const WHITE_FACETS = ['#ffffff', '#c4c7d6'];
const FUCHSIA_FACETS = ['#ffc4e7', '#e0158f'];
const SAGE_FACETS = ['#eef6f1', '#5f8a78'];
const DAISY_FACETS = ['#f3ffd9', '#5fc436'];
const whiteGlass = pinkGlass.clone();
Object.assign(whiteGlass, { transmission: 0.72, roughness: 0.08, iridescence: 0.08, thickness: 0.2, attenuationDistance: 3 });
whiteGlass.emissive.set('#fff4fa');
whiteGlass.attenuationColor.set('#ffffff');
const fuchsiaGlass = pinkGlass.clone();
Object.assign(fuchsiaGlass, { iridescence: 0.1, emissiveIntensity: 0.25, attenuationDistance: 0.6 });
fuchsiaGlass.emissive.set('#ff1f93');
fuchsiaGlass.attenuationColor.set('#ff3fa8');
const sageGlass = greenGlass.clone();
sageGlass.emissive.set('#4f8a74');
sageGlass.attenuationColor.set('#a6cdb9');

function jarGeometry() {
  const { H, R, neck, lip, wall, base, shoulder } = JAR;
  const P = (x, y) => new V2(x, y);
  const pts = [P(0, 0)];
  for (let i = 0; i <= 4; i++) { // canto redondeado de la base
    const a = -Math.PI / 2 + (i / 4) * (Math.PI / 2);
    pts.push(P(R - 0.1 + 0.1 * Math.cos(a), 0.1 + 0.1 * Math.sin(a)));
  }
  const sh = (r0, r1, h, k) => P(r1 + (r0 - r1) * Math.cos((k * Math.PI) / 2), shoulder + h * Math.sin((k * Math.PI) / 2));
  for (let i = 0; i <= 8; i++) pts.push(sh(R, neck, 0.32, i / 8)); // hombro
  pts.push(P(neck, 2.82), P(neck + 0.03, 2.85), P(lip, 2.88), P(lip + 0.01, 2.94), P(lip - 0.02, 2.99), P(lip - 0.07, H));
  pts.push(P(neck - wall + 0.01, H), P(neck - wall, 2.96));
  for (let i = 8; i >= 0; i--) pts.push(sh(R - wall, neck - wall, 0.32 - wall, i / 8));
  for (let i = 4; i >= 0; i--) {
    const a = -Math.PI / 2 + (i / 4) * (Math.PI / 2);
    pts.push(P(R - wall - 0.08 + 0.08 * Math.cos(a), base + 0.08 + 0.08 * Math.sin(a)));
  }
  pts.push(P(0, base));
  return new THREE.LatheGeometry(pts, 48);
}

// Tapón de corcho: más ancho arriba, facetado y mate, con el grano del corcho
const CORK_Y = 2.82; // su base, dentro del cuello
function corkTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d'), r = mulberry32(73);
  g.fillStyle = '#f1e2cf';
  g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 1400; i++) {
    const dark = r() < 0.7;
    g.fillStyle = dark ? `rgba(120,80,45,${0.15 + r() * 0.35})` : `rgba(255,248,235,${0.3 + r() * 0.4})`;
    g.beginPath();
    g.ellipse(r() * 256, r() * 128, 0.6 + r() * 2.6, 0.5 + r() * 1.4, r() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 1);
  return t;
}
function corkGeometry() {
  const prof = [[0, 0], [0.48, 0], [0.51, 0.025], [0.585, 0.34], [0.573, 0.37], [0.54, 0.385], [0, 0.385]];
  const g = new THREE.LatheGeometry(prof.map(([x, y]) => new V2(x, y)), 16);
  // un poco irregular, como el corcho de verdad (misma posición → mismo desplazamiento, así no se abren grietas)
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
    const k = 1 + 0.025 * Math.sin(a * 5 + y * 13) + 0.015 * Math.sin(a * 11 - y * 7);
    p.setXYZ(i, x * k, y, z * k);
  }
  return facetColors(g, ['#e8bb8e', '#a46c45'], 74);
}
const corkMat = new THREE.MeshStandardMaterial({
  vertexColors: true, map: corkTexture(), roughness: 0.92, metalness: 0, flatShading: true, envMapIntensity: 0.6,
});

// Ayuda: coloca una geometría (cara hacia +Z) mirando en la dirección dir, con un giro propio
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
function placed(geo, pos, dir, roll = 0, scale = 1) {
  _q.setFromUnitVectors(new V3(0, 0, 1), dir.clone().normalize());
  _q2.setFromAxisAngle(new V3(0, 0, 1), roll);
  _q.multiply(_q2);
  return geo.clone().applyMatrix4(_m.compose(pos, _q, new V3(scale, scale, scale)));
}
const noUV = (g) => { g.deleteAttribute('uv'); return g; };

// Margarita: dos coronas de pétalos finos alrededor de un botón verde
function daisy(seed) {
  const r = mulberry32(seed);
  const petals = [];
  for (let row = 0; row < 2; row++) {
    const n = row ? 12 : 14;
    for (let i = 0; i < n; i++) {
      const g = gemGeometry({
        length: (row ? 0.26 : 0.33) * (0.88 + r() * 0.24), width: 0.095, height: 0.024,
        widest: 0.62, bend: 0.03, segs: 4, seed: seed * 40 + row * 20 + i, palette: WHITE_FACETS,
      });
      g.rotateY(-(row ? 0.55 : 0.22) - r() * 0.15); // las puntas se curvan hacia delante
      g.translate(0.05, 0, row * 0.015);
      g.rotateZ(((i + row * 0.5) / n) * Math.PI * 2 + (r() - 0.5) * 0.15);
      petals.push(g);
    }
  }
  const center = noUV(facetColors(new THREE.IcosahedronGeometry(0.1, 1), DAISY_FACETS, seed + 7));
  center.scale(1, 1, 0.5).translate(0, 0, 0.03);
  return { petals: mergeGeometries(petals), center };
}

// Clavel: una bola de pétalos anchos y rizados
function carnation(seed) {
  const r = mulberry32(seed);
  const parts = [];
  const d = new V3();
  for (let i = 0; i < 34; i++) {
    d.set(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1 + 0.7).normalize();
    const g = gemGeometry({
      length: 0.2 + r() * 0.09, width: 0.13 + r() * 0.05, height: 0.02,
      widest: 0.72, bend: (r() - 0.5) * 0.1, segs: 3, seed: seed * 50 + i, palette: FUCHSIA_FACETS,
    });
    g.rotateX(r() * Math.PI * 2);
    _q.setFromUnitVectors(new V3(1, 0, 0), d);
    g.applyQuaternion(_q).translate(d.x * 0.05, d.y * 0.05, d.z * 0.05);
    parts.push(g);
  }
  return mergeGeometries(parts);
}

// Rama de eucalipto: tallo fino con hojas redondas por parejas que suben hasta el cuello
function sprig(path, seed) {
  const r = mulberry32(seed);
  const curve = new THREE.CatmullRomCurve3(path);
  const parts = [noUV(facetColors(new THREE.TubeGeometry(curve, 24, 0.013, 5), SAGE_FACETS, seed))];
  const leaf = noUV(facetColors(new THREE.IcosahedronGeometry(1, 1), SAGE_FACETS, seed + 1));
  const T = new V3(), S = new V3(), N = new V3(), arb = new V3(0.3, 0.1, 1).normalize();
  let k = 0;
  for (let t = 0.06; t < 0.96; t += 0.12, k++) {
    const p = curve.getPointAt(t);
    curve.getTangentAt(t, T);
    S.crossVectors(T, arb).normalize().applyAxisAngle(T, (k % 2) * (Math.PI / 2) + (r() - 0.5) * 0.4);
    N.crossVectors(S, T).normalize();
    const size = (0.16 - t * 0.06) * (0.85 + r() * 0.3);
    for (const side of [1, -1]) {
      const sx = S.clone().multiplyScalar(side);
      const basis = new THREE.Matrix4().makeBasis(sx, T, N.clone().multiplyScalar(side));
      const m = new THREE.Matrix4().compose(
        p.clone().addScaledVector(sx, size * 0.95),
        new THREE.Quaternion().setFromRotationMatrix(basis),
        new V3(size, size, size * 0.14),
      );
      parts.push(leaf.clone().applyMatrix4(m));
    }
  }
  return mergeGeometries(parts);
}

{
  const glass = new THREE.Mesh(jarGeometry(), jarGlass);
  glass.renderOrder = 5;
  jar.content.add(glass);

  const white = [], centers = [], pink = [], sage = [];
  const ring = (a, y, rad, up) => ({
    pos: new V3(Math.sin(a) * rad, y, Math.cos(a) * rad),
    dir: new V3(Math.sin(a), up, Math.cos(a)),
  });
  const addDaisy = ({ pos, dir }, seed, scale = 1) => {
    const g = daisy(seed), roll = mulberry32(seed)() * 6.28;
    white.push(placed(g.petals, pos, dir, roll, scale));
    centers.push(placed(g.center, pos, dir, roll, scale));
  };
  const deg = Math.PI / 180;
  // abajo, margaritas mirando al cristal
  [20, 110, 200, 290].forEach((a, i) => addDaisy(ring(a * deg, 0.5, 0.38, 0.25), 900 + i));
  // en medio, detrás de la rosa
  addDaisy(ring(140 * deg, 1.08, 0.38, 0.1), 910, 0.95);
  addDaisy(ring(255 * deg, 1.0, 0.4, 0.15), 911, 0.9);
  const c1 = carnation(920), c2 = carnation(921);
  pink.push(placed(c1, ring(215 * deg, 1.6, 0.36, 0.4).pos, ring(215 * deg, 0, 1, 0.6).dir, 0.4, 1.05));
  pink.push(placed(c2, ring(320 * deg, 1.15, 0.36, 0.2).pos, ring(320 * deg, 0, 1, 0.3).dir, 1.2, 0.95));
  pink.push(placed(c2, ring(75 * deg, 1.7, 0.34, 0.4).pos, ring(75 * deg, 0, 1, 0.5).dir, 2.2, 0.85));
  // arriba, margaritas algo inclinadas hacia la boca
  [60, 180, 300].forEach((a, i) => addDaisy(ring(a * deg, 1.98, 0.4, 0.6), 930 + i, 0.92));
  addDaisy(ring(-25 * deg, 2.12, 0.34, 0.9), 934, 0.8);
  // eucalipto, subiendo hasta el cuello (el tapón queda justo encima)
  sage.push(sprig([new V3(0.12, 1.15, 0.22), new V3(0.03, 1.75, 0.15), new V3(-0.08, 2.25, 0.06), new V3(-0.14, 2.72, 0)], 940));
  sage.push(sprig([new V3(-0.26, 1.35, -0.12), new V3(-0.02, 1.9, -0.06), new V3(0.14, 2.3, 0), new V3(0.2, 2.72, 0.04)], 941));

  for (const [list, mat] of [[white, whiteGlass], [centers, greenGlass], [pink, fuchsiaGlass], [sage, sageGlass]]) {
    jar.content.add(new THREE.Mesh(mergeGeometries(list), mat));
  }

  jar.cork = new THREE.Mesh(corkGeometry(), corkMat);
  jar.cork.position.y = CORK_Y;
  jar.content.add(jar.cork);

  // unos destellos dentro del cristal
  const jr = mulberry32(950);
  jar.content.add(new THREE.Points(sparkGeometry(Array.from({ length: 18 }, () => {
    const a = jr() * Math.PI * 2, rad = 0.2 + jr() * 0.55, y = 0.2 + jr() * 2.7;
    return { x: Math.sin(a) * Math.min(rad, y > 2.2 ? 0.5 : 0.75), y, z: Math.cos(a) * rad, size: 0.12 + jr() * 0.14, alpha: 0.85 };
  })), twinkleMat));
}

// La rosa empieza dentro del tarro, pequeña y con el tallo recogido
jar.content.add(rose.root);
rose.stem.scale.set(0.3, 0.02, 0.3);

// Tamaño y posición del tarro para que quepa en pantalla (deja sitio abajo para el texto)
function fitJar() {
  const halfH = Math.max(3.5, 3.8 / 2 / camera.aspect);
  const look = startView().look;
  jar.S = Math.min((0.56 * 2 * halfH) / JAR.H, (0.7 * 2 * halfH * camera.aspect) / (2 * JAR.R));
  jar.baseY = look.y + 0.08 * halfH - 1.6 * jar.S;
}

function updateJar(dt, t) {
  if (!jar.root.visible) return;
  if (!jar.dragging && state !== 'release') {
    jar.yawVel += (JAR_SPIN - jar.yawVel) * (1 - Math.exp(-dt * 1.2)); // tras soltarlo frena y vuelve a girar solo
    jar.yaw += jar.yawVel * dt;
    jar.tilt *= Math.exp(-dt * 3);
  }
  jar.shake *= Math.exp(-dt * 5);
  const sh = jar.shake * Math.sin(t * 38);
  jar.spin.rotation.set(jar.tilt + sh * 0.04, jar.yaw, sh * 0.06);
  jar.root.position.set(0, jar.baseY + Math.sin(t * 0.9) * 0.07 + jar.drop, 0);
  jar.root.scale.setScalar(Math.max(1e-4, jar.S * jar.scale));
}

// Al tocar el tarro: el tapón se afloja y salta, la rosa sube por la boca, crece y se queda flotando;
// el tarro cae y desaparece
let releaseFx = null;
const jarUp = () => new V3(0, 1, 0).applyQuaternion(jar.spin.getWorldQuaternion(new THREE.Quaternion()));
const jarMouth = () => jar.content.localToWorld(new V3(0, JAR.H + 0.1, 0));

function openJar() {
  if (state !== 'jar') return;
  state = 'release';
  document.body.classList.remove('show-hint');
  jar.dragging = false;
  jar.yawVel = 0;
  const cork = jar.cork;
  tween(0.38, (k) => {
    cork.rotation.y = Math.sin(k * Math.PI * 4) * 0.22;
    cork.position.y = CORK_Y + 0.07 * k;
  }, { onDone: popCork });
}

function popCork() {
  const cork = jar.cork;
  if (isTouch) navigator.vibrate?.(18);
  jar.shake = 1;
  burst.emit(jarMouth(), 45, { speed: 2.2, size: 0.15, life: 1.2, spread: 0.25, up: 0.8 });
  scene.attach(cork);
  const c0 = cork.position.clone(), q0 = cork.quaternion.clone();
  const v = jarUp().multiplyScalar(7.5).add(new V3((rand() < 0.5 ? -1 : 1) * rr(2.2, 3.2), 0, rr(0.5, 1.5)));
  const axis = randomUnit(), spinRate = rr(9, 13), D = 1.6;
  tween(D, (k) => {
    const t = k * D;
    cork.position.copy(c0).addScaledVector(v, t);
    cork.position.y -= 4.5 * t * t;
    cork.quaternion.copy(q0).premultiply(tmpQ.setFromAxisAngle(axis, spinRate * t));
  }, { onDone: () => { cork.visible = false; } });
  wait(0.12, releaseRose);
}

function releaseRose() {
  const up = jarUp();
  burst.emit(jarMouth(), 20, { speed: 1.2, size: 0.13, life: 1.1, spread: 0.3 });
  scene.attach(rose.root);
  const p0 = rose.root.position.clone(), q0 = rose.root.quaternion.clone(), s0 = rose.root.scale.x;
  const p1 = p0.clone().addScaledVector(up, 1.9 * jar.S); // la flor asoma por encima de la boca
  const tmp = new V3(), ident = new THREE.Quaternion();
  let t = 0, popped = false;
  const D = 2.6;

  releaseFx = (dt) => {
    t += dt;
    const k = Math.min(t / D, 1);
    // updateRose acaba de poner la rosa donde estará al jugar: mezclamos el camino de salida con ese sitio
    const rise = ease.inOutSine(smooth(0, 0.4, k));
    const move = ease.inOutCubic(smooth(0.28, 0.95, k));
    tmp.lerpVectors(p0, p1, rise);
    rose.root.position.lerpVectors(tmp, rose.root.position, move);
    rose.root.quaternion.slerpQuaternions(q0, ident, move);
    rose.root.scale.setScalar(lerp(s0, 1, ease.inOutSine(smooth(0.42, 0.95, k))));
    const g = smooth(0.42, 0.95, k);
    rose.stem.scale.set(lerp(0.3, 1, g), Math.max(0.02, ease.outBack(g)), lerp(0.3, 1, g));
    if (k > 0.4 && !popped) {
      popped = true;
      burst.emit(rose.bloom.getWorldPosition(tmp), 40, { speed: 2, size: 0.16, life: 1.4, spread: 0.5 });
    }
    // el tarro se va hacia abajo cuando la rosa ya ha salido
    const fall = smooth(0.38, 0.8, k);
    jar.drop = -12 * fall * fall;
    jarFade.value = 1 - smooth(0.6, 0.8, k);
    if (k >= 0.8) jar.root.visible = false;
    if (k >= 1) {
      releaseFx = null;
      state = 'play';
      hint.textContent = 'toca la rosa';
      wait(1.0, () => { if (removed === 0) document.body.classList.add('show-hint'); });
    }
  };
}

/* ================= El corazón del fondo ================= */

const heart = new THREE.Group();
heart.position.copy(HEART_POS);
scene.add(heart);

const heartPts = (() => {
  const raw = [];
  for (let i = 0; i < 240; i++) {
    const t = (i / 240) * Math.PI * 2;
    raw.push(new V2(
      16 * Math.sin(t) ** 3,
      13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t),
    ));
  }
  const box = new THREE.Box2().setFromPoints(raw);
  const c = box.getCenter(new V2());
  const s = HEART_WIDTH / (box.max.x - box.min.x);
  return raw.map((p) => p.sub(c).multiplyScalar(s));
})();
const heartBox = new THREE.Box2().setFromPoints(heartPts);
const HEART_H = heartBox.max.y - heartBox.min.y;

const photoSide = Math.max(HEART_WIDTH, HEART_H) / PHOTO_ZOOM;
const photoUV = (x, y) => [x / photoSide + 0.5 - PHOTO_OFFSET[0], y / photoSide + 0.5 - PHOTO_OFFSET[1]];

function insidePoly(pts, x, y) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}
// Fotos: se cargan al principio y se suben a la GPU en cuanto llegan, para que luego no haya tirones
const photoTexs = PHOTOS.map((url) => {
  const tex = new THREE.TextureLoader().load(
    url,
    (t) => renderer.initTexture(t),
    undefined,
    () => {
      // si una foto falla, un degradado en su lugar
      const c = document.createElement('canvas');
      c.width = c.height = 512;
      const g = c.getContext('2d');
      const grd = g.createLinearGradient(0, 0, 0, 512);
      grd.addColorStop(0, '#3a1460');
      grd.addColorStop(1, '#ff7aa8');
      g.fillStyle = grd;
      g.fillRect(0, 0, 512, 512);
      tex.image = c;
      tex.needsUpdate = true;
    },
  );
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
});

// Los pétalos del corazón son del mismo cristal que la rosa; al acercarnos se aclara para que se vea la foto a través
const heartTint = { value: 1 }; // 1 = facetas rosas como en la rosa; menos = cristal más limpio
const heartRim = { value: 0 };  // brillo en los cantos de las facetas (sube al acercarnos)
const heartGlass = pinkGlass.clone();
heartGlass.fog = true;
heartGlass.onBeforeCompile = (shader) => {
  shader.uniforms.uTintAmt = heartTint;
  shader.uniforms.uRim = heartRim;
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uTintAmt, uRim;')
    .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(vec3(1.0), diffuseColor.rgb, uTintAmt);')
    .replace('#include <emissivemap_fragment>', /* glsl */ `#include <emissivemap_fragment>
      float rim = pow(1.0 - saturate(abs(dot(normal, normalize(vViewPosition)))), 3.0);
      totalEmissiveRadiance += vec3(1.0, 0.74, 0.88) * rim * uRim;`);
};
heartGlass.customProgramCacheKey = () => 'heart-glass';

// El corazón se reparte en 15 zonas (una por pétalo) y el orden de llegada salta por todo el corazón
const heartCells = (() => {
  const r = mulberry32(4242);
  const pts = [];
  while (pts.length < 2400) {
    const x = lerp(heartBox.min.x, heartBox.max.x, r()), y = lerp(heartBox.min.y, heartBox.max.y, r());
    if (insidePoly(heartPts, x, y)) pts.push(new V2(x, y));
  }
  const K = TOTAL_PETALS;
  const centers = [pts[0].clone()];
  while (centers.length < K) {
    let best = pts[0], bestD = -1;
    for (const p of pts) {
      const d = Math.min(...centers.map((c) => c.distanceToSquared(p)));
      if (d > bestD) { bestD = d; best = p; }
    }
    centers.push(best.clone());
  }
  const assign = new Int32Array(pts.length);
  for (let it = 0; it < 30; it++) {
    pts.forEach((p, i) => {
      let b = 0, bd = Infinity;
      centers.forEach((c, k) => {
        const d = c.distanceToSquared(p);
        if (d < bd) { bd = d; b = k; }
      });
      assign[i] = b;
    });
    const sum = centers.map(() => [0, 0, 0]);
    pts.forEach((p, i) => { const s = sum[assign[i]]; s[0] += p.x; s[1] += p.y; s[2]++; });
    centers.forEach((c, k) => { if (sum[k][2]) c.set(sum[k][0] / sum[k][2], sum[k][1] / sum[k][2]); });
  }

  const mid = heartBox.getCenter(new V2());
  const cells = centers.map((c, k) => {
    let xx = 0, yy = 0, xy = 0, n = 0;
    pts.forEach((p, i) => {
      if (assign[i] !== k) return;
      const dx = p.x - c.x, dy = p.y - c.y;
      xx += dx * dx; yy += dy * dy; xy += dx * dy; n++;
    });
    xx /= n; yy /= n; xy /= n;
    const tr = (xx + yy) / 2, det = Math.sqrt(((xx - yy) / 2) ** 2 + xy * xy);
    const ang = 0.5 * Math.atan2(2 * xy, xx - yy);
    const dir = new V2(Math.cos(ang), Math.sin(ang));
    const out = c.clone().sub(mid);
    if (out.lengthSq() > 0.3 ? dir.dot(out) < 0 : r() < 0.5) dir.negate(); // la punta del pétalo mira hacia fuera
    return { c, dir, long: Math.sqrt(12 * (tr + det)), short: Math.sqrt(12 * Math.max(tr - det, 1e-3)) };
  });

  const left = cells.map((_, k) => k);
  const order = [];
  while (left.length) {
    const prev = order.length ? cells[order[order.length - 1]].c : null;
    const far = left.filter((k) => !prev || cells[k].c.distanceTo(prev) > 2.2);
    const pool = far.length ? far : left;
    const k = pool[Math.floor(r() * pool.length)];
    order.push(k);
    left.splice(left.indexOf(k), 1);
  }
  return order.map((k) => cells[k]);
})();

// La foto, detrás de los pétalos. Solo se dibuja en la pasada de transmisión,
// así que únicamente se ve a través del cristal: donde no hay pétalo, no hay foto.
// Lleva dos fotos a la vez para poder fundir de una a la siguiente.
const photoNext = { value: photoTexs[1 % photoTexs.length] };
const photoMix = { value: 0 };
const photoPanel = (() => {
  const geo = new THREE.ShapeGeometry(new THREE.Shape(heartPts.map((p) => p.clone().multiplyScalar(0.98))));
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, ...photoUV(p.getX(i), p.getY(i)));
  const mat = new THREE.MeshBasicMaterial({
    map: photoTexs[0], color: new THREE.Color().setScalar(1.35), opacity: 0, fog: false,
    blending: THREE.CustomBlending, // "opaca" para three.js (así entra en la transmisión), pero puede fundirse
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uMap2: photoNext, uMix: photoMix });
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uMap2;\nuniform float uMix;')
      .replace('#include <map_fragment>', 'diffuseColor *= mix(texture2D(map, vMapUv), texture2D(uMap2, vMapUv), uMix);');
  };
  const m = new THREE.Mesh(geo, mat);
  m.position.z = -0.4;
  m.visible = false;
  m.onBeforeRender = (r) => {
    geo.drawRange.count = r.getRenderTarget() !== null ? Infinity : 0;
  };
  heart.add(m);
  return m;
})();

// Halo detrás del corazón
const glowTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
const heartGlow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: glowTex, color: 0xff5fa0, transparent: true, opacity: 0.4,
  blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
}));
heartGlow.scale.set(14, 13, 1);
heartGlow.position.z = -1.2;
heart.add(heartGlow);

// Contorno de destellos: deja intuir desde el principio a dónde van los pétalos
heart.add(new THREE.Points(
  sparkGeometry(heartPts.filter((_, i) => i % 3 === 0).map((p) => ({
    x: p.x, y: p.y, z: 0.15, size: rr(0.12, 0.22), alpha: 0.8,
    color: SPARK_COLORS[Math.floor(rand() * 3)],
  }))),
  twinkleMat,
));

/* ================= París (aparece al acercarnos al corazón) ================= */

const paris = createParis({ scene, camera, uniforms, sparkGeometry, sparkMaterial });

/* ================= Cámara y encuadre ================= */

function startView() {
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const halfH = Math.max(3.5, 3.8 / 2 / camera.aspect);
  // la flor lo más centrada posible sin que el tallo se salga por abajo
  const bloomNDC = clamp((BLOOM_Y - STEM_TIP_Y) / halfH - 0.95, 0.12, 0.22);
  const look = new V3(0, BLOOM_Y - bloomNDC * halfH, 0);
  return { pos: new V3(0, look.y + 0.6, halfH / t), look };
}

function endView() {
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const dist = Math.max(HEART_H / 0.6 / 2 / t, HEART_WIDTH / 0.86 / 2 / (t * camera.aspect));
  const visH = 2 * dist * t;
  const look = HEART_POS.clone().add(new V3(0, -0.1 * visH, 0));
  return { pos: look.clone().add(new V3(0, 0, dist)), look, dist };
}

{
  const v = startView();
  camera.position.copy(v.pos);
  camLook.copy(v.look);
  camera.lookAt(camLook);
}

/* ================= Interacción ================= */

let state = 'intro';
let removed = 0;
let finalView = null;
const raycaster = new THREE.Raycaster();
const pointer = new V2();
const parallax = new V2();

function choosePetal(ndc) {
  const remaining = rose.petals.filter((p) => !p.removed);
  const layer = Math.min(...remaining.map((p) => p.layer));
  let best = null, bestD = Infinity;
  for (const p of remaining) {
    if (p.layer !== layer) continue;
    const s = p.mesh.localToWorld(p.center.clone()).project(camera);
    const d = Math.hypot((s.x - ndc.x) * camera.aspect, s.y - ndc.y) + (s.z < 1 ? 0 : 99);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

// Cada toque empuja la rosa con fuerza hacia un lado distinto (y algo según dónde se toque)
let pushSide = 1;
function pushRose(hitPoint) {
  const pivot = rose.tilt.getWorldPosition(new V3());
  const r = hitPoint.clone().sub(pivot);
  if (rand() < 0.75) pushSide = -pushSide; // casi siempre al lado contrario que la vez anterior
  const a = rr(-0.9, 0.9);                  // en diagonal hacia arriba, recto o hacia abajo
  const room = clamp(camera.aspect / 0.75, 0.6, 1); // en vertical hay menos sitio a los lados
  const dx = clamp(pushSide * Math.cos(a) - clamp(r.x, -1.5, 1.5) * 0.3, -1.3, 1.3) * room;
  const dy = Math.sin(a) * 0.7;
  const force = rr(0.85, 1.15);
  rose.tiltVel.y -= dx * 4.5 * force;           // se inclina hacia donde va
  rose.tiltVel.x -= (1.4 + dy * 2.2) * force;    // y hacia atrás
  rose.yawVel += rr(-1, 1) * 3 + dx * 2;
  rose.offVel.x += dx * 4.5 * force;
  rose.offVel.y += dy * 2.5 * force;
  rose.offVel.z -= 3 * force;
  // si se toca muy seguido, que no se dispare
  rose.tiltVel.clampLength(0, 6.5);
  rose.offVel.clampLength(0, 6);
}

function onTap(clientX, clientY) {
  if (state !== 'play') return;
  document.body.classList.remove('show-hint');
  pointer.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(rose.pickables, false)[0];
  let point = hit?.point;
  if (!point) {
    const pivot = rose.tilt.getWorldPosition(new V3());
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new V3()).negate(), pivot);
    point = raycaster.ray.intersectPlane(plane, new V3()) ?? pivot;
  }
  pushRose(point);
  if (isTouch) navigator.vibrate?.(12);
  const petal = choosePetal(pointer);
  if (petal) detachPetal(petal, removed++);
  if (removed === TOTAL_PETALS) finale();
}

// Con el tarro: arrastrar lo gira y un toque lo abre. Con la rosa, cada toque cuenta al instante.
const drag = { id: null, x: 0, y: 0, moved: 0, t: 0 };
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (state === 'intro' || state === 'jar') {
    Object.assign(drag, { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, t: performance.now() });
    try { canvas.setPointerCapture(e.pointerId); } catch {} // así el giro sigue aunque el dedo salga del lienzo
    jar.dragging = true;
    return;
  }
  onTap(e.clientX, e.clientY);
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y, now = performance.now();
  const k = 6 / Math.min(innerWidth, innerHeight); // radianes por píxel
  jar.yaw += dx * k;
  jar.yawVel = clamp(lerp(jar.yawVel, (dx * k) / Math.max((now - drag.t) / 1000, 1 / 60), 0.5), -7, 7);
  jar.tilt = clamp(jar.tilt + dy * k * 0.5, -0.45, 0.45);
  drag.moved += Math.hypot(dx, dy);
  Object.assign(drag, { x: e.clientX, y: e.clientY, t: now });
});
const endDrag = (e) => {
  if (e.pointerId !== drag.id) return;
  drag.id = null;
  jar.dragging = false;
  if (performance.now() - drag.t > 120) jar.yawVel *= 0.3; // si se quedó quieto antes de soltar, sin inercia
  if (e.type === 'pointerup' && drag.moved < 10) openJar();
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
addEventListener('keydown', (e) => {
  if (e.key !== ' ' && e.key !== 'Enter') return;
  if (state === 'jar') openJar();
  else onTap(innerWidth / 2, innerHeight * 0.4);
});
addEventListener('pointermove', (e) => {
  parallax.set((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
});
document.getElementById('replay').addEventListener('click', () => location.reload());

/* ================= Pétalos que vuelan al corazón ================= */

const tmpQ = new THREE.Quaternion();

// Dónde y cómo queda el pétalo en el corazón: centrado en su zona, con la punta hacia fuera
// y algo levantada hacia la cámara, para que el corazón tenga relieve
function heartPlacement(petal, cell, index) {
  const f = petal.mesh.geometry.userData.flat;
  const sy = (cell.long * 1.08) / f.l;
  const sx = clamp((cell.short * 1.3) / f.w, sy * 0.8, sy * 1.25);
  const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    rr(0.05, 0.22), rr(-0.12, 0.12), Math.atan2(cell.dir.y, cell.dir.x) - Math.PI / 2, 'ZYX',
  ));
  const scale = new V3(sx, sy, (sx + sy) / 2);
  const off = new V3(f.cx * sx, f.cy * sy, 0).applyQuaternion(quat);
  const pos = new V3(cell.c.x, cell.c.y, 0.05 + index * 0.02).sub(off);
  return { pos, quat, scale };
}

function detachPetal(petal, index) {
  petal.removed = true;
  rose.pickables.splice(rose.pickables.indexOf(petal.mesh), 1);
  const mesh = petal.mesh;
  scene.attach(mesh);

  const cell = heartCells[index];
  const place = heartPlacement(petal, cell, index);
  mesh.material = heartGlass;
  const target = heart.localToWorld(place.pos.clone());
  const start = mesh.position.clone();
  const q0 = mesh.quaternion.clone();
  const s0 = mesh.scale.clone();
  const center = rose.bloom.getWorldPosition(new V3());
  const outward = mesh.localToWorld(petal.center.clone()).sub(center).setY(0);
  if (outward.lengthSq() < 1e-4) outward.set(rr(-1, 1), 0, 1);
  outward.normalize();

  const c1 = start.clone().addScaledVector(outward, 1.5).add(new V3(0, 1.1, 1.0));
  const c2 = target.clone().add(new V3(outward.x * 3, 4.5, 6));
  const axis = randomUnit();
  const spin = rr(5, 9);
  const tumble = new THREE.Quaternion();

  rose.offVel.addScaledVector(outward, -0.5);
  burst.emit(mesh.localToWorld(petal.center.clone()), 22, { speed: 1.6, size: 0.14, life: 1.1 });

  tween(2.8, (k) => {
    bezier(start, c1, c2, target, ease.inOutSine(k), mesh.position);
    const land = ease.inOutCubic(smooth(0.5, 1, k));
    tumble.copy(q0).multiply(tmpQ.setFromAxisAngle(axis, spin * ease.outCubic(k)));
    mesh.quaternion.slerpQuaternions(tumble, place.quat, land);
    mesh.morphTargetInfluences[0] = HEART_OPEN * smooth(0.4, 0.95, k);
    mesh.scale.lerpVectors(s0, place.scale, land);
    if (rand() < 0.6) burst.emit(mesh.position, 1, { speed: 0.25, size: 0.1, life: 0.9, up: 0 });
  }, { onDone: () => landPetal(petal, cell) });
}

function landPetal(petal, cell) {
  const mesh = petal.mesh;
  heart.attach(mesh);
  const s = mesh.scale.clone();
  tween(0.7, (k) => mesh.scale.copy(s).multiplyScalar(1 + 0.08 * Math.sin(Math.PI * k) * (1 - k)));
  burst.emit(heart.localToWorld(new V3(cell.c.x, cell.c.y, 0.4)), 26, { speed: 1.8, size: 0.18, life: 1.3, spread: 0.4 });
}

/* ================= Final ================= */

function finale() {
  state = 'ending';
  // el tallo cae rápido y se va por abajo
  wait(0.3, () => {
    tween(1.0, (k) => { rose.drop = -(3 * k + 11 * k * k); }, { onDone: () => { rose.root.visible = false; } });
  });
  wait(1.0, flyCamera);
}

function flyCamera() {
  const from = camera.position.clone();
  const lookFrom = camLook.clone();
  finalView = endView();
  paris.layout(finalView, HEART_WIDTH / 2);
  renderer.transmissionResolutionScale = isTouch ? 0.85 : 1; // la foto se ve a través del cristal: mejor nítida
  photoPanel.visible = true;
  const c1 = from.clone().add(new V3(0, 0.8, -5));
  const c2 = finalView.pos.clone().add(new V3(0, 0.6, 6));
  let textShown = false;
  tween(6, (k) => {
    const e = ease.inOutCubic(k);
    bezier(from, c1, c2, finalView.pos, e, camera.position);
    camLook.lerpVectors(lookFrom, finalView.look, ease.inOutSine(k));
    scene.fog.density = lerp(FOG_PLAY, 0, e);
    reveal = smooth(0.25, 0.95, k);
    photoPanel.material.opacity = smooth(0.2, 0.8, k);
    parisMix = smooth(0.15, 0.8, k);
    paris.setFade(parisMix);
    heartGlow.material.opacity = lerp(0.4, 0.25, k);
    if (k > 0.75 && !textShown) {
      textShown = true;
      document.body.classList.add('final');
    }
  }, { onDone: () => { state = 'final'; } });
}

/* ================= Bucle ================= */

const fogTmp = new THREE.Color();

function applyAtmosphere(dt) {
  bgMix += (removed / TOTAL_PETALS - bgMix) * (1 - Math.exp(-dt * 1.2));
  bg.material.uniforms.uMix.value = bgMix;
  bg.material.uniforms.uParis.value = parisMix;
  if (bgMix < 0.5) fogTmp.lerpColors(FOG_COLORS[0], FOG_COLORS[1], bgMix * 2);
  else fogTmp.lerpColors(FOG_COLORS[1], FOG_COLORS[2], bgMix * 2 - 1);
  scene.fog.color.copy(fogTmp.lerp(FOG_COLORS[3], parisMix).convertSRGBToLinear());
  // sobre fondo claro el cristal es más transparente; sobre fondo oscuro necesita brillo propio
  for (const m of [pinkGlass, greenGlass]) {
    m.transmission = lerp(0.92, 0.62, bgMix);
    m.emissiveIntensity = lerp(0.1, 0.3, bgMix);
    m.attenuationDistance = lerp(1.0, 0.5, bgMix);
  }
  // los pétalos del corazón son como los de la rosa; al acercarnos, cristal más limpio para que se vea la foto
  heartGlass.transmission = lerp(pinkGlass.transmission, 1, reveal);
  heartGlass.emissiveIntensity = lerp(pinkGlass.emissiveIntensity, 0.06, reveal);
  heartGlass.attenuationDistance = lerp(pinkGlass.attenuationDistance, 2.5, reveal);
  heartGlass.thickness = lerp(0.35, 0.22, reveal);
  heartGlass.ior = lerp(1.85, 1.4, reveal);
  heartGlass.envMapIntensity = lerp(2.2, 1.0, reveal);
  heartGlass.clearcoat = lerp(1, 0.5, reveal);
  heartRim.value = 0.45 * reveal;
  heartGlass.iridescence = lerp(0.3, 0.15, reveal);
  heartTint.value = lerp(1, 0.5, reveal);
}

function updateRose(dt, t) {
  const k = 26, c = 3.2;
  rose.tiltVel.x += (-k * rose.tiltAng.x - c * rose.tiltVel.x) * dt;
  rose.tiltVel.y += (-k * rose.tiltAng.y - c * rose.tiltVel.y) * dt;
  rose.tiltAng.addScaledVector(rose.tiltVel, dt);
  rose.yawVel += (-2.5 * rose.yawAng - 1.8 * rose.yawVel) * dt;
  rose.yawAng += rose.yawVel * dt;
  rose.offVel.addScaledVector(rose.off, -18 * dt).multiplyScalar(Math.max(0, 1 - 3 * dt));
  rose.off.addScaledVector(rose.offVel, dt);

  rose.tilt.rotation.set(rose.tiltAng.x + Math.sin(t * 0.7) * 0.035, 0, rose.tiltAng.y + Math.sin(t * 0.53) * 0.05);
  rose.yaw.rotation.y = Math.sin(t * 0.31) * 0.4 + rose.yawAng;
  rose.root.position.set(rose.off.x, ROSE_Y + Math.sin(t * 0.9) * 0.09 + rose.off.y + rose.drop, rose.off.z);
  rose.root.scale.setScalar(rose.scale);
}

// Al final, las fotos van pasando en orden (y vuelven a empezar)
let photoIndex = 0, photoClock = 0;
function updatePhotos(dt) {
  if (photoTexs.length < 2) return;
  photoClock += dt;
  photoMix.value = ease.inOutSine(clamp((photoClock - PHOTO_HOLD) / PHOTO_FADE, 0, 1));
  if (photoClock >= PHOTO_HOLD + PHOTO_FADE) {
    photoIndex = (photoIndex + 1) % photoTexs.length;
    photoPanel.material.map = photoTexs[photoIndex];
    photoNext.value = photoTexs[(photoIndex + 1) % photoTexs.length];
    photoMix.value = 0;
    photoClock = 0;
  }
}

function heartbeat(t) {
  const p = (t % 1.4) / 1.4;
  return Math.exp(-(((p - 0.05) * 14) ** 2)) + 0.6 * Math.exp(-(((p - 0.22) * 14) ** 2));
}

const clock = new THREE.Timer();
let time = 0;

function step(dt) {
  time += dt;
  uniforms.uTime.value = time;

  updateTweens(dt);
  applyAtmosphere(dt);
  updateJar(dt, time);
  if (rose.root.visible) updateRose(dt, time);
  if (rose.root.parent === jar.content) {
    // mientras está en el tarro, la rosa se queda en su sitio dentro de él
    rose.root.position.copy(ROSE_IN_JAR.pos);
    rose.root.scale.setScalar(ROSE_IN_JAR.scale);
  }
  releaseFx?.(dt);
  burst.update(dt);

  if (state === 'final') {
    updatePhotos(dt);
    heart.scale.setScalar(1 + 0.018 * heartbeat(time));
    const drift = new V3(Math.sin(time * 0.3) * 0.25 + parallax.x * 0.5, Math.cos(time * 0.23) * 0.15 - parallax.y * 0.35, 0);
    camera.position.lerp(finalView.pos.clone().add(drift), 1 - Math.exp(-dt * 2));
  }
  camera.lookAt(camLook);
  bg.position.copy(camera.position);
}

let paused = false; // solo en ?debug
renderer.setAnimationLoop(() => {
  clock.update();
  if (!paused) step(Math.min(clock.getDelta(), 1 / 30));
  renderer.render(scene, camera);
});

// ?debug: permite avanzar el tiempo a mano desde la consola
if (new URLSearchParams(location.search).has('debug')) {
  window.__dbg = {
    advance(sec) {
      for (let t = 0; t < sec; t += 1 / 60) step(1 / 60);
      renderer.render(scene, camera);
    },
    tap: (x = innerWidth / 2, y = innerHeight * 0.35) => onTap(x, y),
    open: () => openJar(),
    spin(rad, tilt = 0) { jar.yaw += rad; jar.tilt = tilt; },
    get state() { return state; },
    pause(on = true) { paused = on; },
    scene, camera, heart, rose, heartCells, jar,
  };
}

/* ================= Arranque y tamaño ================= */

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
  uniforms.uPR.value = renderer.getPixelRatio();
  uniforms.uScale.value = innerHeight / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  if (state === 'intro' || state === 'jar' || state === 'release' || state === 'play') {
    const v = startView();
    camera.position.copy(v.pos);
    camLook.copy(v.look);
    if (state === 'intro' || state === 'jar') fitJar();
  } else if (finalView) {
    finalView = endView();
    paris.layout(finalView, HEART_WIDTH / 2);
    if (state === 'final') camLook.copy(finalView.look);
  }
}
addEventListener('resize', onResize);
onResize();

requestAnimationFrame(() => document.body.classList.add('ready'));
// Primero aparece el tarro
tween(1.8, (k) => { jar.scale = ease.outBack(k); }, {
  onDone: () => {
    state = 'jar';
    wait(1.2, () => { if (state === 'jar') document.body.classList.add('show-hint'); });
  },
});
burst.emit(new V3(0, jar.baseY + 1.5 * jar.S, 0), 50, { speed: 2, size: 0.16, life: 1.6, spread: 0.8 });
