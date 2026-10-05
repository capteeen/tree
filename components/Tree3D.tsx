'use client';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useStore } from '@/lib/store';
import { onEvent } from '@/lib/bus';
import { coinsOfTree } from '@/lib/sim';
import { bounds, layoutTree, lerp3, type BranchNode, type V3 } from '@/lib/layout3d';
import { leafColor, PALETTES } from '@/lib/season';
import { hashStr } from '@/lib/rng';
import { fmtSol } from '@/lib/format';
import { sfx } from '@/lib/sound';
import type { Ca, TreeEvent } from '@/lib/types';

interface Props {
  rootCa: Ca;
  focusCa?: Ca | null;
  onSelect?: (ca: Ca) => void;
  /** Render scale: each rendered pixel becomes PIX×PIX screen pixels. */
  pixel?: number;
}

const MAX_WOOD = 14000;
const MAX_LEAF = 8000;
const MAX_SAP = 1200;
const MAX_DEBRIS = 600;
const GROW_MS = 1000;
const TRAIL = 7;

interface Packet {
  route: V3[];
  cum: number[];
  total: number;
  start: number;
  dur: number;
  size: number;
  payouts: { at: number; pos: V3; amount: number }[];
  fired: number;
  done: boolean;
}

interface Debris {
  p: V3;
  v: V3;
  born: number;
  life: number;
  color: THREE.Color;
  size: number;
  g: number;
  sway: number;
}

interface Label {
  pos: V3;
  text: string;
  born: number;
  color: string;
}

function pixelTexture(kind: 'bark' | 'leaf' | 'ground') {
  const n = 8;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const h = hashStr(`${kind}${x},${y}`) % 100;
      let v = 255;
      if (kind === 'bark') v = x % 3 === 0 ? 190 : h < 20 ? 215 : 248;
      else if (kind === 'leaf') v = h < 25 ? 200 : h > 85 ? 255 : 232;
      else v = h < 30 ? 205 : 240;
      if (x === 0 || y === 0) v = Math.min(v, 205); // dark pixel edge = voxel outline
      const i = (y * n + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  const t = new THREE.DataTexture(data, n, n);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

export default function Tree3D({ rootCa, focusCa = null, onSelect, pixel }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef<Ca | null>(focusCa);
  const selectRef = useRef(onSelect);
  focusRef.current = focusCa;
  selectRef.current = onSelect;

  useEffect(() => {
    const wrap = wrapRef.current!;
    const tip = tipRef.current!;
    const PIX = pixel ?? (window.innerWidth > 900 ? 3 : 2);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
    } catch {
      return;
    }
    renderer.setPixelRatio(1);
    const canvas = renderer.domElement;
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;touch-action:none;';
    wrap.appendChild(canvas);

    const overlay = document.createElement('canvas');
    overlay.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
    wrap.appendChild(overlay);
    const octx = overlay.getContext('2d')!;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -500, 500);
    scene.add(new THREE.AmbientLight(0xffffff, 1.35));
    const sun = new THREE.DirectionalLight(0xffffff, 1.9);
    sun.position.set(6, 12, 8);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffe0b0, 0.45);
    fill.position.set(-8, 3, -5);
    scene.add(fill);

    const box = new THREE.BoxGeometry(1, 1, 1);
    const tex = { bark: pixelTexture('bark'), leaf: pixelTexture('leaf'), ground: pixelTexture('ground') };
    const wood = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ map: tex.bark }), MAX_WOOD);
    const leaves = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ map: tex.leaf }), MAX_LEAF);
    const sap = new THREE.InstancedMesh(
      box,
      new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false }),
      MAX_SAP,
    );
    sap.renderOrder = 10;
    const debris = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }), MAX_DEBRIS);
    debris.renderOrder = 5;
    const ground = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ map: tex.ground }), 400);
    for (const m of [wood, leaves, sap, debris, ground]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, new THREE.Color());
      m.count = 0;
      m.frustumCulled = false;
      scene.add(m);
    }

    const tmpM = new THREE.Matrix4();
    const tmpQ = new THREE.Quaternion();
    const tmpP = new THREE.Vector3();
    const tmpS = new THREE.Vector3();
    const tmpC = new THREE.Color();
    const setInst = (mesh: THREE.InstancedMesh, i: number, p: V3, s: number, color: THREE.Color | string, rot?: number) => {
      tmpP.set(p[0], p[1], p[2]);
      tmpS.set(s, s, s);
      if (rot) tmpQ.setFromAxisAngle(new THREE.Vector3(0.3, 1, 0.2).normalize(), rot);
      else tmpQ.identity();
      tmpM.compose(tmpP, tmpQ, tmpS);
      mesh.setMatrixAt(i, tmpM);
      mesh.setColorAt(i, typeof color === 'string' ? tmpC.set(color) : color);
    };

    // ---------- state ----------
    let nodes = new Map<Ca, BranchNode>();
    let woodOwner: Ca[] = [];
    let leafOwner: Ca[] = [];
    const growStart = new Map<Ca, number>();
    const popped = new Set<Ca>();
    let dirty = true;
    let lastVersion = -1;
    let lastBuild = 0;
    let treeH = 10;
    let treeR = 6;
    const packets: Packet[] = [];
    const parts: Debris[] = [];
    const labels: Label[] = [];

    const cam = {
      az: (hashStr(rootCa) % 628) / 100,
      el: 0.38,
      zoom: 1,
      zoomGoal: 1,
      target: new THREE.Vector3(0, 5, 0),
      targetGoal: new THREE.Vector3(0, 5, 0),
      lastUser: 0,
    };

    const palette = () => PALETTES[useStore.getState().season];
    const snap = (x: number) => Math.round(x * 8) / 8;

    function buildGround() {
      const p = palette();
      let i = 0;
      const R = Math.min(9, Math.max(4, Math.ceil(treeR * 0.55)));
      for (let x = -R; x <= R; x++)
        for (let z = -R; z <= R; z++) {
          const d = Math.hypot(x, z);
          if (d > R + 0.3 || i >= 398) continue;
          const h = hashStr(`g${x},${z}`) % 100;
          const top = d < R - 1 || h < 50;
          setInst(ground, i++, [x, -0.5 - (top ? 0 : 0.5), z], 1, top ? (h < 30 ? tmpC.set(p.grass).offsetHSL(0, 0, -0.04) : p.grass) : p.dirt);
        }
      ground.count = i;
      ground.instanceMatrix.needsUpdate = true;
      if (ground.instanceColor) ground.instanceColor.needsUpdate = true;
    }

    function rebuild(now: number) {
      const { world } = useStore.getState();
      nodes = layoutTree(world, rootCa);
      const b = bounds(nodes);
      const firstBuild = treeH === 10 && lastBuild === 0;
      treeH = b.maxY;
      treeR = b.maxR;
      if (firstBuild) {
        cam.target.set(0, treeH * 0.45, 0);
        cam.targetGoal.copy(cam.target);
      }
      const p = palette();
      const barkA = new THREE.Color(p.bark);
      const barkB = new THREE.Color(p.barkDark);
      const deadC = new THREE.Color(p.dead);
      let wi = 0;
      let li = 0;
      woodOwner = [];
      leafOwner = [];
      const coins = coinsOfTree(world, rootCa).sort((a, b2) => a.depth - b2.depth);
      for (const c of coins) {
        const n = nodes.get(c.ca);
        if (!n) continue;
        const gs = growStart.get(c.ca);
        const g = gs === undefined ? 1 : Math.min(1, (now - gs) / GROW_MS);
        const eased = 1 - Math.pow(1 - g, 3);
        const steps = Math.max(2, Math.ceil(n.len / (n.thick * 0.55)));
        const h = hashStr(c.ca);
        for (let k = 0; k < steps && wi < MAX_WOOD; k++) {
          const t = (k + 0.5) / steps;
          if (t > eased) break;
          const pos = lerp3(n.start, n.end, t);
          const s = n.thick * (1 - 0.28 * t) * (gs !== undefined && g < 1 ? 0.6 + 0.4 * eased : 1);
          const col = !c.alive ? deadC : (h + k) % 4 === 0 ? barkB : barkA;
          setInst(wood, wi, [snap(pos[0]), snap(pos[1]), snap(pos[2])], s, col);
          woodOwner[wi++] = c.ca;
        }
        if (!c.alive || g < 0.85) continue;
        // pop: overshoot when the leaves first appear
        let pop = 1;
        if (gs !== undefined) {
          const pt = (now - gs - GROW_MS * 0.85) / 380;
          pop = pt < 1 ? Math.max(0.05, Math.sin(Math.min(1, pt) * Math.PI * 0.75) * 1.35) : 1;
        }
        const lc = new THREE.Color(leafColor(p, c.bornAt, now));
        const count = 5 + (h % 5);
        const R = Math.min(1.25, 0.4 + n.len * 0.16 + n.thick * 0.35);
        for (let j = 0; j < count && li < MAX_LEAF; j++) {
          const hj = hashStr(`${c.ca}:${j}`);
          const a = (hj % 360) * (Math.PI / 180);
          const e = (((hj >>> 9) % 100) / 100) * 1.4 - 0.45;
          const r = R * (0.45 + ((hj >>> 17) % 100) / 180);
          const off: V3 = [Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r + 0.15, Math.sin(a) * Math.cos(e) * r];
          const pos: V3 = [n.end[0] + off[0], n.end[1] + off[1], n.end[2] + off[2]];
          const s = (0.36 + ((hj >>> 5) % 30) / 100) * pop;
          const col = lc.clone().offsetHSL(0, 0, (((hj >>> 3) % 20) - 10) / 160);
          setInst(leaves, li, [snap(pos[0]), snap(pos[1]), snap(pos[2])], s, col);
          leafOwner[li++] = c.ca;
        }
      }
      wood.count = wi;
      leaves.count = li;
      for (const m of [wood, leaves]) {
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
        m.computeBoundingSphere();
      }
      if (firstBuild) buildGround();
      lastBuild = now;
    }

    // ---------- events → animation (never on a timer) ----------
    function handle(e: TreeEvent) {
      if (e.rootCa !== rootCa || document.hidden) return;
      const now = performance.now();
      if (e.kind === 'sprout') {
        if (e.coinCa === rootCa) return;
        growStart.set(e.coinCa, Date.now());
        dirty = true;
        sfx.sprout();
      } else if (e.kind === 'death') {
        dirty = true;
        const n = nodes.get(e.coinCa);
        const c = useStore.getState().world.coins[e.coinCa];
        if (!n || !c) return;
        const lc = new THREE.Color(leafColor(palette(), c.bornAt));
        for (let i = 0; i < 12; i++) {
          parts.push({
            p: [n.end[0] + (Math.random() - 0.5), n.end[1] + Math.random() * 0.6, n.end[2] + (Math.random() - 0.5)],
            v: [(Math.random() - 0.5) * 0.6, Math.random() * 0.4, (Math.random() - 0.5) * 0.6],
            born: now,
            life: 2600 + Math.random() * 1200,
            color: lc.clone().lerp(new THREE.Color('#8b5a2b'), 0.55),
            size: 0.32,
            g: -1.1,
            sway: Math.random() * 6,
          });
        }
        sfx.leafFall();
      } else if (e.kind === 'climb' && e.path?.length) {
        const payer = nodes.get(e.coinCa);
        if (!payer) return;
        const route: V3[] = [payer.end, payer.start];
        const payouts: Packet['payouts'] = [];
        let prev = payer;
        for (let i = 0; i < e.path.length; i++) {
          const anc = nodes.get(e.path[i]);
          if (!anc) return;
          payouts.push({ at: route.length - 1, pos: prev.start, amount: e.amounts?.[i] ?? 0 });
          route.push(anc.start);
          prev = anc;
        }
        const cum = [0];
        for (let i = 1; i < route.length; i++) {
          const a = route[i - 1];
          const b = route[i];
          cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
        }
        packets.push({
          route,
          cum,
          total: cum[cum.length - 1],
          start: now,
          dur: 1100 + 420 * e.path.length,
          size: Math.min(0.75, 0.32 + Math.log1p((e.amount ?? 0) * 400) * 0.08),
          payouts: payouts.map((p) => ({ ...p, at: cum[p.at] })),
          fired: 0,
          done: false,
        });
        sfx.climb(e.path.length);
      }
    }
    const off = onEvent(handle);

    // ---------- sizing ----------
    let W = 1;
    let H = 1;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      W = Math.max(1, wrap.clientWidth);
      H = Math.max(1, wrap.clientHeight);
      renderer.setSize(Math.ceil(W / PIX), Math.ceil(H / PIX), false);
      overlay.width = Math.ceil(W * dpr);
      overlay.height = Math.ceil(H * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    let visible = true;
    const io = new IntersectionObserver(([en]) => (visible = en.isIntersecting));
    io.observe(wrap);

    // ---------- input ----------
    const pointers = new Map<number, { x: number; y: number }>();
    let downAt: { x: number; y: number; t: number } | null = null;
    let pinch = 0;
    const raycaster = new THREE.Raycaster();
    const pick = (cx: number, cy: number): Ca | null => {
      const r = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects([wood, leaves], false);
      for (const h of hits) {
        if (h.instanceId === undefined) continue;
        return h.object === wood ? woodOwner[h.instanceId] : leafOwner[h.instanceId];
      }
      return null;
    };
    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
      cam.lastUser = performance.now();
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    let hoverT = 0;
    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) {
        const now = performance.now();
        if (now - hoverT < 70) return;
        hoverT = now;
        const ca = pick(e.clientX, e.clientY);
        const c = ca ? useStore.getState().world.coins[ca] : null;
        canvas.style.cursor = c ? 'pointer' : 'grab';
        if (c) {
          const r = wrap.getBoundingClientRect();
          tip.style.display = 'block';
          tip.style.left = `${e.clientX - r.left + 12}px`;
          tip.style.top = `${e.clientY - r.top + 12}px`;
          tip.textContent = `${c.ticker} · DEPTH ${c.depth}${c.alive ? '' : ' · DORMANT'}`;
        } else tip.style.display = 'none';
        return;
      }
      if (pointers.size === 2) {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) cam.zoomGoal = Math.min(8, Math.max(0.5, cam.zoomGoal * (d / pinch)));
        pinch = d;
      } else {
        cam.az -= (e.clientX - prev.x) * 0.008;
        cam.el = Math.min(1.25, Math.max(-0.05, cam.el + (e.clientY - prev.y) * 0.005));
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      cam.lastUser = performance.now();
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = 0;
      if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 6 && pointers.size === 0) {
        const ca = pick(e.clientX, e.clientY);
        if (ca) selectRef.current?.(ca);
      }
      downAt = null;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cam.zoomGoal = Math.min(8, Math.max(0.5, cam.zoomGoal * Math.exp(-e.deltaY * 0.0012)));
      cam.lastUser = performance.now();
    };
    const onLeave = () => (tip.style.display = 'none');
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // ---------- frame ----------
    let raf = 0;
    let lastT = performance.now();
    let lastFocus: Ca | null | undefined;
    const bgColor = new THREE.Color();
    let bgCheck = -1e9;

    const pointAlong = (pk: Packet, d: number): V3 => {
      d = Math.max(0, Math.min(pk.total, d));
      let i = 1;
      while (i < pk.cum.length - 1 && pk.cum[i] < d) i++;
      const seg = pk.cum[i] - pk.cum[i - 1] || 1;
      return lerp3(pk.route[i - 1], pk.route[i], (d - pk.cum[i - 1]) / seg);
    };

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      if (!visible || document.hidden) return;
      const wall = Date.now();
      const st = useStore.getState();

      // theme background
      if (now - bgCheck > 500) {
        bgCheck = now;
        const bg = getComputedStyle(document.documentElement).getPropertyValue('--sky').trim() || '#1b1815';
        bgColor.set(bg);
        scene.background = bgColor;
      }

      let growing = false;
      growStart.forEach((t, ca) => {
        const age = wall - t;
        // pixel "pop" burst the moment the new branch's leaves appear
        if (!popped.has(ca) && age > GROW_MS * 0.85) {
          popped.add(ca);
          const n = nodes.get(ca);
          if (n)
            for (let i = 0; i < 14; i++) {
              const a = (i / 14) * Math.PI * 2;
              parts.push({
                p: [...n.end] as V3,
                v: [Math.cos(a) * 2.2, 1.2 + Math.random() * 1.6, Math.sin(a) * 2.2],
                born: now,
                life: 650,
                color: new THREE.Color(palette().fresh),
                size: 0.22,
                g: -6,
                sway: 0,
              });
            }
        }
        if (age < GROW_MS + 450) growing = true;
        else {
          growStart.delete(ca);
          popped.delete(ca);
          dirty = true;
        }
      });
      if (st.version !== lastVersion && (now - lastBuild > 700 || growing)) {
        dirty = true;
        lastVersion = st.version;
      }
      if (dirty || growing) {
        rebuild(wall);
        dirty = false;
      }

      // camera
      const f = focusRef.current;
      if (f !== lastFocus) {
        lastFocus = f;
        const n = f ? nodes.get(f) : null;
        if (n) {
          const mid = lerp3(n.start, n.end, 0.6);
          cam.targetGoal.set(mid[0], mid[1], mid[2]);
          cam.zoomGoal = Math.min(5, Math.max(1.8, treeH / (n.len * 2.4)));
        } else {
          cam.targetGoal.set(0, treeH * 0.45, 0);
          cam.zoomGoal = 1;
        }
      }
      if (!f) cam.targetGoal.y = treeH * 0.45;
      if (now - cam.lastUser > 2500 && pointers.size === 0) cam.az += dt * 0.14;
      cam.target.lerp(cam.targetGoal, 1 - Math.pow(0.02, dt));
      cam.zoom += (cam.zoomGoal - cam.zoom) * (1 - Math.pow(0.02, dt));
      const aspect = W / H;
      const viewH = (Math.max(treeH * 0.62, treeR * 0.75 / Math.max(0.6, aspect)) + 1) / cam.zoom;
      camera.left = -viewH * aspect;
      camera.right = viewH * aspect;
      camera.top = viewH;
      camera.bottom = -viewH;
      camera.updateProjectionMatrix();
      camera.position.set(
        cam.target.x + Math.sin(cam.az) * Math.cos(cam.el) * 100,
        cam.target.y + Math.sin(cam.el) * 100,
        cam.target.z + Math.cos(cam.az) * Math.cos(cam.el) * 100,
      );
      camera.lookAt(cam.target);

      // sap packets
      let si = 0;
      const sapCol = new THREE.Color(palette().sap);
      const hot = new THREE.Color('#fff3c4');
      for (const pk of packets) {
        const t = Math.min(1, (now - pk.start) / pk.dur);
        const d = (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2) * pk.total;
        while (pk.fired < pk.payouts.length && d >= pk.payouts[pk.fired].at - 1e-6) {
          const po = pk.payouts[pk.fired++];
          labels.push({ pos: po.pos, text: `+${fmtSol(po.amount)}`, born: now, color: '#ffc44d' });
          for (let i = 0; i < 6; i++) {
            const a = Math.random() * Math.PI * 2;
            parts.push({ p: [...po.pos] as V3, v: [Math.cos(a) * 1.6, 1 + Math.random(), Math.sin(a) * 1.6], born: now, life: 420, color: sapCol.clone(), size: 0.18, g: -4, sway: 0 });
          }
        }
        for (let k = 0; k <= TRAIL && si < MAX_SAP - 2; k++) {
          const p = pointAlong(pk, d - k * 0.32);
          const fade = 1 - k / (TRAIL + 1);
          setInst(sap, si++, p, pk.size * (0.45 + 0.55 * fade), (k === 0 ? hot : sapCol).clone().multiplyScalar(fade));
        }
        // halo
        setInst(sap, si++, pointAlong(pk, d), pk.size * 2.1, sapCol.clone().multiplyScalar(0.28));
        if (t >= 1 && !pk.done) {
          pk.done = true;
          // the sap arrived at the root: a ring of light at the trunk base
          for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2;
            parts.push({ p: [0, 0.2, 0], v: [Math.cos(a) * 3.2, 0.6, Math.sin(a) * 3.2], born: now, life: 520, color: sapCol.clone(), size: 0.2, g: 0, sway: 0 });
          }
        }
      }
      for (let i = packets.length - 1; i >= 0; i--) if (packets[i].done) packets.splice(i, 1);
      sap.count = si;
      sap.instanceMatrix.needsUpdate = true;
      if (sap.instanceColor) sap.instanceColor.needsUpdate = true;

      // debris (pops, falling leaves, sparks)
      let di = 0;
      for (let i = parts.length - 1; i >= 0; i--) {
        const q = parts[i];
        const age = now - q.born;
        if (age > q.life) {
          parts.splice(i, 1);
          continue;
        }
        q.v[1] += q.g * dt;
        if (q.sway) {
          q.v[0] = Math.sin(age / 300 + q.sway) * 0.8;
          q.v[1] = Math.max(q.v[1], -1.2);
        } else {
          q.v[0] *= 0.96;
          q.v[2] *= 0.96;
        }
        q.p[0] += q.v[0] * dt;
        q.p[1] = Math.max(0.05, q.p[1] + q.v[1] * dt);
        q.p[2] += q.v[2] * dt;
        if (di < MAX_DEBRIS) setInst(debris, di++, q.p, q.size * (1 - (age / q.life) * 0.5), q.color, q.sway ? age / 200 : 0);
      }
      debris.count = di;
      debris.instanceMatrix.needsUpdate = true;
      if (debris.instanceColor) debris.instanceColor.needsUpdate = true;

      renderer.render(scene, camera);

      // labels overlay
      octx.clearRect(0, 0, overlay.width, overlay.height);
      octx.font = `${Math.round(9 * dpr)}px "Press Start 2P", monospace`;
      octx.textAlign = 'center';
      for (let i = labels.length - 1; i >= 0; i--) {
        const L = labels[i];
        const a = (now - L.born) / 1300;
        if (a >= 1) {
          labels.splice(i, 1);
          continue;
        }
        tmpP.set(L.pos[0], L.pos[1], L.pos[2]).project(camera);
        const x = ((tmpP.x + 1) / 2) * overlay.width;
        const y = ((1 - tmpP.y) / 2) * overlay.height - a * 34 * dpr;
        octx.globalAlpha = 1 - a * a;
        octx.fillStyle = '#1b1815';
        octx.fillText(L.text, x + dpr * 1.5, y + dpr * 1.5);
        octx.fillStyle = L.color;
        octx.fillText(L.text, x, y);
      }
      octx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(frame);

    const unsubSeason = useStore.subscribe((s, p) => {
      if (s.season !== p.season) {
        dirty = true;
        buildGround();
      }
    });

    return () => {
      cancelAnimationFrame(raf);
      off();
      unsubSeason();
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
      for (const m of [wood, leaves, sap, debris, ground]) {
        m.dispose();
        (m.material as THREE.Material).dispose();
      }
      box.dispose();
      Object.values(tex).forEach((t) => t.dispose());
      renderer.dispose();
      canvas.remove();
      overlay.remove();
    };
  }, [rootCa, pixel]);

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden select-none">
      <div
        ref={tipRef}
        className="pointer-events-none absolute z-10 hidden whitespace-nowrap bg-black/80 px-2 py-1 font-pixel text-[9px] text-ink"
      />
    </div>
  );
}
