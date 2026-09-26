// Real-time 3D companions, built from simple shapes so all nine share one style and can
// change expression instantly. Tap them, and they react; move your finger, and they look.
import * as THREE from "./vendor/three.module.js";
import { byId } from "./companions.js";

const col = c => new THREE.Color(c);
function mat(color, rough = 0.62) { return new THREE.MeshStandardMaterial({ color: col(color), roughness: rough, metalness: 0 }); }
function sph(r, m, seg = 40) { return new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75)), m); }

function shadowTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d"), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(40,50,40,0.35)"); grd.addColorStop(1, "rgba(40,50,40,0)");
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
function textSprite(text, color = "#8E8BD0") {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"); g.fillStyle = color; g.font = "bold 44px Nunito, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 32, 34);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  s.scale.set(0.35, 0.35, 0.35); return s;
}

// ---------- the character ----------
function buildCharacter(def) {
  const C = def.colors, sp = def.species;
  const root = new THREE.Group();           // moves (jump / bob)
  const body = new THREE.Group(); root.add(body);   // squashes (breathing)
  const face = new THREE.Group(); body.add(face);
  const parts = { root, body, face, arms: [], eyes: {}, mouth: {}, extras: [] };

  const bodyMat = mat(C.body), bellyMat = mat(C.belly), accMat = mat(C.accent), dark = mat("#262A33", 0.35);
  const main = sph(1, bodyMat, 56); main.scale.set(1, 0.94, 0.9); body.add(main);

  // belly / face patch
  if (["bear", "fox", "penguin", "redpanda", "deer", "koala", "cat", "pip"].includes(sp)) {
    const belly = sph(0.72, bellyMat); belly.scale.set(sp === "penguin" ? 1.1 : 0.95, sp === "penguin" ? 1.12 : 0.8, 0.55);
    belly.position.set(0, sp === "penguin" ? 0.02 : -0.28, 0.5); body.add(belly);
  }
  // muzzle for mammals
  if (["bear", "fox", "cat", "redpanda", "deer"].includes(sp)) {
    const muz = sph(0.3, sp === "redpanda" ? mat("#FFFFFF") : bellyMat); muz.scale.set(1.25, 0.8, 0.7); muz.position.set(0, -0.08, 0.8); face.add(muz);
  }

  // ears / top pieces
  const ear = (geoFn, x, y, z, rz, m) => { const e = geoFn(m); e.position.set(x, y, z); e.rotation.z = rz; body.add(e); return e; };
  if (sp === "pip") {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.25, 12), mat("#6B8E3D")); stem.position.set(0, 1.02, 0); body.add(stem);
    const leaf = sph(0.22, accMat); leaf.scale.set(1.3, 0.28, 0.6); leaf.position.set(0.2, 1.14, 0); leaf.rotation.z = 0.5; body.add(leaf); parts.extras.push(leaf);
    const tuft = sph(0.09, bodyMat); tuft.position.set(-0.08, 0.96, 0.1); body.add(tuft);
  }
  if (sp === "koala") for (const s of [-1, 1]) {
    const e = ear(m => sph(0.42, m), s * 0.86, 0.62, -0.05, 0, bodyMat); e.scale.set(1, 1, 0.45);
    const inner = sph(0.28, mat("#F1F1F4")); inner.scale.set(1, 1, 0.3); inner.position.set(s * 0.86, 0.6, 0.12); body.add(inner);
  }
  if (sp === "bear") for (const s of [-1, 1]) {
    const e = ear(m => sph(0.26, m), s * 0.66, 0.74, 0, 0, bodyMat); e.scale.set(1, 1, 0.6);
    const inner = sph(0.14, bellyMat); inner.scale.set(1, 1, 0.3); inner.position.set(s * 0.66, 0.72, 0.13); body.add(inner);
  }
  if (sp === "bunny") for (const s of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(s * 0.34, 0.82, -0.05); g.rotation.z = -s * 0.18; body.add(g);
    const outer = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.75, 8, 20), bodyMat); outer.scale.set(1, 1, 0.55); outer.position.y = 0.45; g.add(outer);
    const inner = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.6, 8, 16), accMat); inner.scale.set(1, 1, 0.3); inner.position.set(0, 0.45, 0.07); g.add(inner);
    parts.extras.push(g);
  }
  if (["fox", "cat", "redpanda"].includes(sp)) for (const s of [-1, 1]) {
    const tall = sp === "fox" ? 0.55 : sp === "cat" ? 0.42 : 0.34;
    const e = new THREE.Mesh(new THREE.ConeGeometry(0.27, tall, 24), sp === "redpanda" ? mat("#FFFFFF") : bodyMat);
    e.position.set(s * 0.55, 0.82 + tall * 0.3, -0.05); e.rotation.z = -s * 0.35; e.scale.z = 0.6; body.add(e);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.15, tall * 0.7, 20), sp === "fox" ? mat("#3B2A26") : sp === "cat" ? mat("#FFC7D0") : bodyMat);
    inner.position.set(s * 0.53, 0.8 + tall * 0.27, 0.05); inner.rotation.z = -s * 0.35; inner.scale.z = 0.4; body.add(inner);
  }
  if (sp === "deer") {
    for (const s of [-1, 1]) {
      const e = sph(0.22, bodyMat); e.scale.set(1.6, 0.6, 0.5); e.position.set(s * 0.95, 0.5, 0); e.rotation.z = -s * 0.4; body.add(e);
      const ant = new THREE.Group(); ant.position.set(s * 0.35, 0.85, -0.05); ant.rotation.z = -s * 0.3; body.add(ant);
      const a1 = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.45, 10), accMat); a1.position.y = 0.22; ant.add(a1);
      const a2 = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.22, 10), accMat); a2.position.set(-s * 0.1, 0.3, 0); a2.rotation.z = s * 0.9; ant.add(a2);
    }
    for (const [x, y] of [[0.45, 0.3], [0.6, 0.05], [-0.5, 0.25], [-0.62, 0.0]]) { const dot = sph(0.07, mat("#FFF4E6")); dot.scale.z = 0.3; dot.position.set(x, y, 0.72); body.add(dot); }
  }
  if (sp === "redpanda") for (const s of [-1, 1]) {
    const brow = sph(0.1, mat("#FFFFFF")); brow.scale.set(1.2, 0.6, 0.3); brow.position.set(s * 0.3, 0.36, 0.84); face.add(brow);
    const cheek = sph(0.18, mat("#FFFFFF")); cheek.scale.set(1.1, 0.8, 0.35); cheek.position.set(s * 0.42, -0.18, 0.78); face.add(cheek);
  }
  if (sp === "penguin") {
    const cap = sph(1.005, bodyMat, 56); cap.scale.set(1, 0.94, 0.9); body.add(cap); cap.visible = false;
  }

  // tails
  if (["fox", "redpanda", "cat"].includes(sp)) {
    const tail = new THREE.Group(); tail.position.set(0.7, -0.55, -0.55); tail.rotation.set(0.4, 0, -0.9); root.add(tail);
    const t = new THREE.Mesh(new THREE.CapsuleGeometry(sp === "cat" ? 0.1 : 0.22, sp === "cat" ? 0.7 : 0.6, 8, 20), bodyMat); t.position.y = 0.4; tail.add(t);
    if (sp === "fox") { const tip = sph(0.22, mat("#FFF3E6")); tip.scale.set(1, 1.2, 1); tip.position.y = 0.82; tail.add(tip); }
    if (sp === "redpanda") for (const y of [0.25, 0.55]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.04, 8, 24), mat("#7A2E16")); r.rotation.x = Math.PI / 2; r.position.y = y; tail.add(r); }
    parts.tail = tail;
  }
  if (sp === "bunny") { const t = sph(0.2, bodyMat); t.position.set(0, -0.55, -0.85); body.add(t); }

  // nose / beak
  if (sp === "pip" || sp === "penguin") {
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.2, 20), mat("#FF9F2E", 0.45)); beak.rotation.x = Math.PI / 2; beak.position.set(0, -0.08, 0.97); face.add(beak);
  } else if (sp === "koala") {
    const n = sph(0.2, dark); n.scale.set(0.85, 1.1, 0.6); n.position.set(0, -0.06, 0.9); face.add(n);
  } else {
    const n = sph(0.075, sp === "bunny" || sp === "cat" ? mat("#F48FA6", 0.4) : dark); n.scale.set(1.3, 0.9, 0.8); n.position.set(0, 0.02, 1.02); face.add(n);
  }

  // eyes: open (glossy), happy ^^, sleepy ︶
  const eyeZ = sp === "koala" ? 0.84 : 0.86, eyeY = 0.2, eyeX = sp === "koala" ? 0.4 : 0.33;
  const openL = new THREE.Group(), openR = new THREE.Group();
  for (const [g, s] of [[openL, -1], [openR, 1]]) {
    const e = sph(0.135, dark, 32); e.scale.set(1, 1.12, 0.5); g.add(e);
    const hi = sph(0.045, mat("#FFFFFF", 0.2), 16); hi.position.set(0.04, 0.05, 0.06); g.add(hi);
    const hi2 = sph(0.02, mat("#FFFFFF", 0.2), 12); hi2.position.set(-0.04, -0.05, 0.06); g.add(hi2);
    g.position.set(s * eyeX, eyeY, eyeZ); face.add(g);
  }
  const arcEye = (flip) => { const t = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.028, 10, 24, Math.PI), dark); if (flip) t.rotation.z = Math.PI; return t; };
  const happyL = arcEye(false), happyR = arcEye(false), sleepL = arcEye(true), sleepR = arcEye(true);
  for (const [m, s] of [[happyL, -1], [happyR, 1], [sleepL, -1], [sleepR, 1]]) { m.position.set(s * eyeX, eyeY - 0.02, eyeZ + 0.03); face.add(m); }
  parts.eyes = { openL, openR, happyL, happyR, sleepL, sleepR };

  // mouth: smile ‿, open, small o
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 8, 20, Math.PI), dark); smile.rotation.z = Math.PI;
  const open = sph(0.09, mat("#7A2E2E", 0.5)); open.scale.set(1.1, 0.8, 0.4);
  const tongue = sph(0.05, mat("#F07A86", 0.5)); tongue.scale.set(1.2, 0.6, 0.4); tongue.position.set(0, -0.03, 0.02); open.add(tongue);
  const oh = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.02, 8, 20), dark);
  const mouthY = sp === "pip" || sp === "penguin" ? -0.24 : -0.22, mouthZ = sp === "koala" ? 0.9 : 0.97;
  for (const m of [smile, open, oh]) { m.position.set(0, mouthY, mouthZ); face.add(m); }
  parts.mouth = { smile, open, oh };

  // blush
  const blushMat = new THREE.MeshBasicMaterial({ color: col(C.cheek), transparent: true, opacity: 0.55, depthWrite: false });
  for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.CircleGeometry(0.11, 24), blushMat); b.position.set(s * 0.56, -0.02, 0.8); b.rotation.y = s * 0.55; face.add(b); }

  // arms (little wings for birds) and feet
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.86, -0.12, 0.12); body.add(pivot);
    const arm = sph(0.2, sp === "penguin" ? bodyMat : sp === "pip" ? mat("#F7C72E") : bodyMat); arm.scale.set(0.7, 1.15, 0.6); arm.position.y = -0.14; pivot.add(arm);
    pivot.rotation.z = s * 0.35; parts.arms.push(pivot);
    const foot = sph(0.2, sp === "pip" || sp === "penguin" ? mat("#FF9F2E") : sp === "fox" || sp === "redpanda" ? mat("#3B2A26") : bodyMat);
    foot.scale.set(1.2, 0.55, 1.3); foot.position.set(s * 0.38, -0.9, 0.25); root.add(foot);
  }
  return parts;
}

// ---------- expressions ----------
const LOOKS = {
  happy:     { eyes: "open",  mouth: "smile", armUp: 0,    speed: 1 },
  joy:       { eyes: "happy", mouth: "open",  armUp: 0.6,  speed: 1.3 },
  calm:      { eyes: "open",  mouth: "smile", armUp: 0,    speed: 0.6, lid: 0.7 },
  caring:    { eyes: "open",  mouth: "smile", armUp: 0.2,  speed: 0.7, tilt: 0.14 },
  sleepy:    { eyes: "sleep", mouth: "oh",    armUp: -0.1, speed: 0.4, zzz: true },
  surprised: { eyes: "open",  mouth: "oh",    armUp: 0.4,  speed: 1.2, big: 1.18 },
  celebrate: { eyes: "happy", mouth: "open",  armUp: 1.2,  speed: 1.6, sparkle: true },
  wave:      { eyes: "open",  mouth: "open",  armUp: 0,    speed: 1.1, wave: true },
};

function applyLook(p, name) {
  const L = LOOKS[name] || LOOKS.happy;
  const { eyes, mouth } = p;
  const showOpen = L.eyes === "open";
  eyes.openL.visible = eyes.openR.visible = showOpen;
  eyes.happyL.visible = eyes.happyR.visible = L.eyes === "happy";
  eyes.sleepL.visible = eyes.sleepR.visible = L.eyes === "sleep";
  const big = L.big || 1, lid = L.lid || 1;
  for (const e of [eyes.openL, eyes.openR]) e.scale.set(big, big * lid, big);
  mouth.smile.visible = L.mouth === "smile"; mouth.open.visible = L.mouth === "open"; mouth.oh.visible = L.mouth === "oh";
  return L;
}

// ---------- shared renderer for thumbnails ----------
let thumbRenderer = null;
export function renderThumbnail(companionId, expression = "happy", size = 256) {
  if (!thumbRenderer) {
    thumbRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    thumbRenderer.setPixelRatio(1);
    thumbRenderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  thumbRenderer.setSize(size, size, false);
  const scene = new THREE.Scene(); lights(scene);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50); cam.position.set(0, 0.35, 5.6); cam.lookAt(0, 0.05, 0);
  const p = buildCharacter(byId(companionId)); applyLook(p, expression); scene.add(p.root);
  p.root.rotation.y = -0.18;
  thumbRenderer.render(scene, cam);
  const url = thumbRenderer.domElement.toDataURL("image/png");
  scene.traverse(o => { o.geometry?.dispose?.(); });
  return url;
}

function lights(scene) {
  scene.add(new THREE.HemisphereLight(0xfff7ea, 0xc7d3be, 1.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(2.5, 4, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xdfe8ff, 0.9); rim.position.set(-4, 2, -3); scene.add(rim);
}

// ---------- live mascot ----------
export function createMascot(container, { companion = "pip", expression = "happy", onTap, distance = 7.2 } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  renderer.domElement.style.cssText = "width:100%;height:100%;display:block;touch-action:manipulation";

  const scene = new THREE.Scene(); lights(scene);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50); cam.position.set(0, 0.35, distance); cam.lookAt(0, 0, 0);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -1.06; scene.add(shadow);

  let parts = null, look = LOOKS.happy, current = expression, id = companion;
  const fx = new THREE.Group(); scene.add(fx);
  function mount() {
    if (parts) { scene.remove(parts.root); parts.root.traverse(o => o.geometry?.dispose?.()); }
    parts = buildCharacter(byId(id)); scene.add(parts.root); look = applyLook(parts, current);
  }
  mount();

  // state
  let jumpV = 0, jumpY = 0, t0 = performance.now(), blinkAt = t0 + 2500, blinkUntil = 0, tempUntil = 0, tempPrev = null;
  const target = { x: 0, y: 0 }, lookAt = { x: 0, y: 0 };
  let zAcc = 0, sparkAcc = 0;

  function resize() {
    const w = container.clientWidth || 300, h = container.clientHeight || 300;
    renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(container); resize();

  function onMove(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    const px = ev.touches ? ev.touches[0].clientX : ev.clientX, py = ev.touches ? ev.touches[0].clientY : ev.clientY;
    target.x = Math.max(-1, Math.min(1, ((px - r.left) / r.width) * 2 - 1));
    target.y = Math.max(-1, Math.min(1, ((py - r.top) / r.height) * 2 - 1));
  }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function onTapEv(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    if (ray.intersectObject(parts.root, true).length) { react("tap"); onTap && onTap(); }
  }
  window.addEventListener("pointermove", onMove, { passive: true });
  renderer.domElement.addEventListener("pointerdown", onTapEv);

  function react(kind) {
    if (kind === "tap") { jumpV = Math.max(jumpV, 3.2); temp(current === "sleepy" ? "surprised" : "joy", 1200); }
    if (kind === "celebrate") { jumpV = 4; temp("celebrate", 2200); burst(18); }
    if (kind === "wave") temp("wave", 1800);
  }
  function temp(name, ms) {
    if (!tempPrev) tempPrev = current;
    look = applyLook(parts, name); tempUntil = performance.now() + ms; current = name;
  }
  function setExpression(name) { tempPrev = null; tempUntil = 0; current = name; look = applyLook(parts, name); }
  function setCompanion(newId) { id = newId; mount(); }

  function burst(n) {
    const colors = ["#FFD84D", "#8FD27A", "#FF9EB5", "#8EC5FF", "#C8A2FF"];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), new THREE.MeshBasicMaterial({ color: col(colors[i % colors.length]), transparent: true }));
      m.position.set((Math.random() - 0.5) * 0.6, 0.6, 0.3); m.userData = { v: new THREE.Vector3((Math.random() - 0.5) * 3, 2 + Math.random() * 2.5, (Math.random() - 0.2) * 1.5), life: 1.4 };
      fx.add(m);
    }
  }
  function puffZ() { const s = textSprite("z"); s.position.set(0.6, 0.9, 0.3); s.userData = { v: new THREE.Vector3(0.25, 0.45, 0), life: 2.4, z: true }; fx.add(s); }

  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  let raf = 0, last = performance.now(), running = true;
  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = (now - t0) / 1000, sp = look.speed || 1;

    if (tempUntil && now > tempUntil) { const p = tempPrev; tempPrev = null; tempUntil = 0; setExpression(p || "happy"); }

    // breathing and bob
    const br = reduced ? 0 : Math.sin(t * 2.2 * sp);
    parts.body.scale.set(1 + br * 0.012, 1 - br * 0.02, 1 + br * 0.012);
    jumpV -= 12 * dt; jumpY += jumpV * dt; if (jumpY < 0) { jumpY = 0; jumpV = 0; }
    parts.root.position.y = jumpY + (reduced ? 0 : Math.sin(t * 1.3 * sp) * 0.03);
    shadow.scale.setScalar(1 - Math.min(jumpY, 1) * 0.35);

    // look toward finger, head tilt for caring
    lookAt.x += (target.x - lookAt.x) * 0.06; lookAt.y += (target.y - lookAt.y) * 0.06;
    parts.root.rotation.y = lookAt.x * 0.45;
    parts.root.rotation.x = lookAt.y * 0.18;
    parts.root.rotation.z = (look.tilt || 0) + (current === "sleepy" ? 0.08 : 0);

    // arms
    parts.arms.forEach((a, i) => {
      const s = i === 0 ? -1 : 1;
      let rz = s * 0.35 - s * (look.armUp || 0);
      if (look.wave && i === 1) rz = 1.9 + Math.sin(t * 12) * 0.4;
      if (current === "celebrate") rz = s * 0.35 - s * (1.1 + Math.sin(t * 14) * 0.25);
      a.rotation.z += (rz - a.rotation.z) * 0.2;
    });
    if (parts.tail) parts.tail.rotation.z = -0.9 + Math.sin(t * 3 * sp) * 0.18;
    parts.extras.forEach((e, i) => { e.rotation.x = Math.sin(t * 2 + i) * 0.06; });

    // blink when eyes are open
    if (look.eyes === "open" && now > blinkAt) { blinkUntil = now + 130; blinkAt = now + 2200 + Math.random() * 3000; }
    const blinking = now < blinkUntil && look.eyes === "open";
    const lid = blinking ? 0.1 : (look.lid || 1), big = look.big || 1;
    for (const e of [parts.eyes.openL, parts.eyes.openR]) e.scale.y += (big * lid - e.scale.y) * 0.5;

    // effects
    if (look.zzz && !reduced) { zAcc += dt; if (zAcc > 1.1) { zAcc = 0; puffZ(); } }
    if (look.sparkle && !reduced) { sparkAcc += dt; if (sparkAcc > 0.5) { sparkAcc = 0; burst(4); } }
    for (const m of [...fx.children]) {
      const u = m.userData; u.life -= dt;
      m.position.addScaledVector(u.v, dt); if (!u.z) u.v.y -= 6 * dt;
      m.rotation && (m.rotation.z += dt * 3);
      m.material.opacity = Math.max(0, Math.min(1, u.life));
      if (u.life <= 0) { fx.remove(m); m.geometry?.dispose?.(); m.material?.map?.dispose?.(); m.material?.dispose?.(); }
    }
    renderer.render(scene, cam);
  }
  raf = requestAnimationFrame(frame);

  // pause when off-screen or hidden to save battery
  const vis = () => { const on = document.visibilityState === "visible"; if (on && !running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); } if (!on) { running = false; cancelAnimationFrame(raf); } };
  document.addEventListener("visibilitychange", vis);

  return {
    setExpression, setCompanion, react,
    get expression() { return current; },
    dispose() {
      running = false; cancelAnimationFrame(raf); ro.disconnect();
      window.removeEventListener("pointermove", onMove); document.removeEventListener("visibilitychange", vis);
      scene.traverse(o => { o.geometry?.dispose?.(); });
      renderer.dispose(); renderer.domElement.remove();
    },
  };
}
