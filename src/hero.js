// The first-screen scene: the Tabora mark as a physical object. A dark T stands on a stone surface,
// a lime ball rolls along the groove of the crossbar and settles at the right end, like the dot in the logo.
// The cursor tilts the T slightly and the ball responds to the tilt; a click pushes the ball to the left.
import {
  ACESFilmicToneMapping,
  CapsuleGeometry,
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShadowMaterial,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  PCFShadowMap,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// Geometry of the mark in logo units (viewBox 256): crossbar 144×38, stem 38×134, dot r11
const U = 1 / 40;
const BAR = { w: 144 * U, h: 38 * U };
const STEM = { w: 38 * U, h: 134 * U };
const DEPTH = 34 * U;
const BALL_R = 11 * U * 1.18;
const SLOT_FROM = (-72 + 19) * U; // center of the left rounded end of the crossbar
const SLOT_TO = (72 - 19) * U; // center of the right rounded end: the dot of the logo is here

function capsuleShape(w, h) {
  const r = h / 2;
  const s = new Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.absarc(w / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(-w / 2 + r, h / 2);
  s.absarc(-w / 2 + r, 0, r, Math.PI / 2, (3 * Math.PI) / 2, false);
  return s;
}

function bar(w, h, material) {
  const bevel = 0.07;
  const geo = new ExtrudeGeometry(capsuleShape(w, h), {
    depth: DEPTH - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.9,
    bevelSegments: 6,
    curveSegments: 48,
  });
  geo.translate(0, 0, -(DEPTH - bevel * 2) / 2);
  const m = new Mesh(geo, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function mountHero(host, { reducedMotion = false } = {}) {
  let renderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (e) {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap; // soft shadow; PCFSoftShadowMap was removed in three r186, and VSM draws a dashed pattern on the plane
  renderer.setClearColor(0x000000, 0);
  host.append(renderer.domElement);

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const camera = new PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(3.2, 2.5, 9.6);
  camera.lookAt(0.75, 1.72, 0);

  // Light: a soft light from above and a key light from the upper left (it also casts the shadow on the surface)
  scene.add(new HemisphereLight(0xffffff, 0xb9b4a8, 0.55));
  const key = new DirectionalLight(0xffffff, 2.2);
  key.position.set(-3.6, 10, 4.5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -7;
  key.shadow.camera.right = 7;
  key.shadow.camera.top = 7;
  key.shadow.camera.bottom = -7;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 24;
  key.shadow.radius = 10;
  key.shadow.bias = -0.0006;
  scene.add(key);

  const floorMat = new ShadowMaterial({ color: 0x2a2620, opacity: 0.2 });
  const floor = new Mesh(new PlaneGeometry(40, 40), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // The mark: matte graphite ceramic, the groove is darker, the ball is glossy lime
  const body = new MeshPhysicalMaterial({ color: new Color("#1b1c20"), roughness: 0.42, metalness: 0.0, clearcoat: 0.35, clearcoatRoughness: 0.5 });
  const groove = new MeshStandardMaterial({ color: new Color("#0c0d0f"), roughness: 0.9 });
  const lime = new MeshPhysicalMaterial({ color: new Color("#c8f25a"), roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.2 });

  const mark = new Group();
  const stemY = STEM.h / 2; // the stem stands on the surface
  const barY = STEM.h - BAR.h / 2;
  const stem = bar(STEM.h, STEM.w, body);
  stem.rotation.z = Math.PI / 2;
  stem.position.set(0, stemY, 0);
  const cross = bar(BAR.w, BAR.h, body);
  cross.position.set(0, barY, 0);
  mark.add(stem, cross);

  // The groove in the front face of the crossbar; the ball rolls along it
  const slotLen = SLOT_TO - SLOT_FROM;
  const slot = new Mesh(new CapsuleGeometry(BALL_R * 1.04, slotLen, 8, 32), groove);
  slot.rotation.z = Math.PI / 2;
  slot.scale.set(1, 1, 0.18);
  slot.position.set((SLOT_FROM + SLOT_TO) / 2, barY, DEPTH / 2 - 0.02);
  mark.add(slot);

  const ball = new Mesh(new SphereGeometry(BALL_R, 64, 48), lime);
  ball.castShadow = true;
  ball.position.set(SLOT_FROM, barY, DEPTH / 2 + BALL_R * 0.22);
  mark.add(ball);

  // Page theme: on light stone the T is graphite; on dark stone it is light ceramic and the shadow is denser
  const themeQuery = window.matchMedia("(prefers-color-scheme: dark)");
  function applyTheme() {
    const dark = themeQuery.matches;
    body.color.set(dark ? "#e4e3dd" : "#1b1c20");
    groove.color.set(dark ? "#bdbcb5" : "#0c0d0f");
    floorMat.color.set(dark ? 0x000000 : 0x2a2620);
    floorMat.opacity = dark ? 0.5 : 0.2;
  }
  applyTheme();

  // The mark itself is turned slightly toward the viewer: a three-quarter product shot
  mark.rotation.y = -0.16;
  mark.position.set(0.15, 0, 0);
  scene.add(mark);

  // ---- ball motion: one-dimensional mechanics along the groove ----------------------------
  const state = { x: SLOT_FROM, v: 0, rest: SLOT_TO, tilt: 0, tiltTarget: 0, intro: !reducedMotion, t0: 0, visible: true, raf: 0 };
  if (reducedMotion) {
    state.x = SLOT_TO;
  }

  function place() {
    ball.position.x = state.x;
    ball.rotation.z = -(state.x - SLOT_FROM) / BALL_R; // it rolls, it does not slide
    mark.rotation.z = state.tilt;
  }

  // Intro: like the dot animation in the logo: to the end, back, and then it settles in place
  function intro(t) {
    const d = 2.6;
    const p = Math.min(1, t / d);
    const keys = [
      [0, SLOT_FROM],
      [0.42, SLOT_TO],
      [0.62, SLOT_FROM + slotLen * 0.55],
      [0.82, SLOT_TO],
      [0.91, SLOT_TO - slotLen * 0.06],
      [1, SLOT_TO],
    ];
    let i = 0;
    while (i < keys.length - 2 && p > keys[i + 1][0]) {
      i++;
    }
    const [p0, x0] = keys[i];
    const [p1, x1] = keys[i + 1];
    const k = MathUtils.clamp((p - p0) / (p1 - p0), 0, 1);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    state.x = x0 + (x1 - x0) * e;
    return p >= 1;
  }

  function step(dt) {
    state.tilt += (state.tiltTarget - state.tilt) * Math.min(1, dt * 6);
    if (state.intro) {
      if (intro((performance.now() - state.t0) / 1000)) {
        state.intro = false;
        state.v = 0;
      }
      return;
    }
    // the tilt pulls the ball down the groove, the spring returns it to its place, friction damps the oscillation
    const g = -9.8 * Math.sin(state.tilt) * 0.9;
    const spring = (state.rest - state.x) * 6;
    state.v += (g + spring - state.v * 2.6) * dt;
    state.x += state.v * dt;
    if (state.x > SLOT_TO) {
      state.x = SLOT_TO;
      state.v = -state.v * 0.35;
    } else if (state.x < SLOT_FROM) {
      state.x = SLOT_FROM;
      state.v = -state.v * 0.35;
    }
  }

  function resize() {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) {
      return;
    }
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // The whole mark must fit for any shape of the stage. The camera angle sets the frame height; the width
    // follows from the aspect ratio of the stage: the narrower the stage (a long heading next to it, a narrow
    // screen), the farther the camera. The camera used to move back in one jump, and the mark was cropped
    // between the thresholds.
    camera.position.z = Math.min(16, 9.6 * Math.max(1, 1.3 / (w / h)));
    camera.updateProjectionMatrix();
    place();
    renderer.render(scene, camera);
  }

  let last = performance.now();
  function frame(now) {
    state.raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    step(dt);
    place();
    renderer.render(scene, camera);
    const moving = state.intro || Math.abs(state.v) > 0.002 || Math.abs(state.x - state.rest) > 0.002 || Math.abs(state.tilt - state.tiltTarget) > 0.0005;
    if (moving && state.visible && !document.hidden) {
      state.raf = requestAnimationFrame(frame);
    }
  }

  function wake() {
    if (!state.raf && state.visible && !document.hidden && !reducedMotion) {
      last = performance.now();
      state.raf = requestAnimationFrame(frame);
    }
  }

  if (!reducedMotion) {
    host.addEventListener("pointermove", e => {
      const r = host.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      state.tiltTarget = MathUtils.clamp(-nx * 0.07, -0.07, 0.07);
      wake();
    });
    host.addEventListener("pointerleave", () => {
      state.tiltTarget = 0;
      wake();
    });
    host.addEventListener("pointerdown", () => {
      if (!state.intro) {
        state.v -= 5.5; // a push to the left; the ball rolls away and comes back
        wake();
      }
    });
  }

  new ResizeObserver(resize).observe(host);
  new IntersectionObserver(entries => {
    state.visible = entries.some(e => e.isIntersecting);
    if (state.visible) {
      wake();
    }
  }).observe(host);
  document.addEventListener("visibilitychange", wake);
  themeQuery.addEventListener("change", () => {
    applyTheme();
    place();
    renderer.render(scene, camera);
  });

  resize();
  host.classList.add("is-live");
  if (!reducedMotion) {
    state.t0 = performance.now() + 450;
    setTimeout(() => {
      state.t0 = performance.now();
      wake();
    }, 450);
  }
  return { renderer };
}
