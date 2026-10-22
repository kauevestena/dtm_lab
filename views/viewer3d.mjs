// Potree view of the whole cloud (streamed from the COPC) with the simulator's overlays:
// the tile box, the tile's points coloured by outcome, and the simulated DTM as a shaded mesh.
// Overlay geometry is kept in tile coordinates and placed with mesh.position, so the large UTM
// numbers cancel in double precision before reaching the GPU.
/* global Potree */
import * as THREE from '../vendor/potree-1.8.2/libs/three.js/build/three.module.js';
import { palette, hillshade } from './maps.mjs';

export function createViewer(el, url, { onReady, onError } = {}) {
  const viewer = new Potree.Viewer(el);
  viewer.setEDLEnabled(true);
  viewer.setFOV(60);
  viewer.setPointBudget(2_000_000);
  viewer.setBackground('gradient');
  const state = { viewer, pointcloud: null, box: null, overlay: null, mesh: null, origin: null, zBase: 0 };
  Potree.loadPointCloud(url, 'cloud', (e) => {
    if (!e || !e.pointcloud) { onError?.(new Error('no point cloud')); return; }
    state.pointcloud = e.pointcloud;
    viewer.scene.addPointCloud(e.pointcloud);
    const m = e.pointcloud.material;
    m.pointSizeType = Potree.PointSizeType.ADAPTIVE;
    m.size = 1;
    m.activeAttributeName = 'classification';
    viewer.fitToScreen(0.6);
    onReady?.(state);
  });
  return state;
}

export function setColoring(state, attr) {
  if (state.pointcloud) state.pointcloud.material.activeAttributeName = attr;
}

// Double click on the cloud: calls back with the picked world position.
export function onPick(state, cb) {
  const el = state.viewer.renderer.domElement;
  el.addEventListener('dblclick', (e) => {
    const rect = el.getBoundingClientRect();
    const mouse = new THREE.Vector2(e.clientX - rect.left, e.clientY - rect.top);
    const hit = Potree.Utils.getMousePointCloudIntersection(mouse, state.viewer.scene.getActiveCamera(), state.viewer, state.viewer.scene.pointclouds);
    if (hit) cb(hit.location);
  });
}

function clear(state, key) {
  if (state[key]) {
    state.viewer.scene.scene.remove(state[key]);
    state[key].geometry?.dispose();
    state[key].material?.dispose();
    state[key] = null;
  }
}

export function setTileBox(state, box, zmin, zmax) {
  clear(state, 'box');
  const g = new THREE.BoxGeometry(box[2] - box[0], box[3] - box[1], zmax - zmin);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: 0xf59e0b }));
  g.dispose();
  edges.position.set((box[0] + box[2]) / 2, (box[1] + box[3]) / 2, (zmin + zmax) / 2);
  state.viewer.scene.scene.add(edges);
  state.box = edges;
}

export function showOutcome(state, points, outcome, origin, visible = true) {
  clear(state, 'overlay');
  if (!visible || !points) return;
  const P = palette(), colors = [P.objectOk, P.groundOk, P.typeI, P.typeII];
  const pos = new Float32Array(points.n * 3), col = new Float32Array(points.n * 3);
  for (let i = 0; i < points.n; i++) {
    pos[3 * i] = points.x[i]; pos[3 * i + 1] = points.y[i]; pos[3 * i + 2] = points.z[i] - state.zBase;
    const c = colors[outcome[i]];
    col[3 * i] = c[0] / 255; col[3 * i + 1] = c[1] / 255; col[3 * i + 2] = c[2] / 255;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true }));
  pts.position.set(origin[0], origin[1], state.zBase);
  state.viewer.scene.scene.add(pts);
  state.overlay = pts;
}

// DTM mesh, one vertex per cell centre, grey hillshade as vertex colour; empty cells are skipped.
export function showDtm(state, geom, z, origin, visible = true) {
  clear(state, 'mesh');
  if (!visible || !z) return;
  const { w, h, cell } = geom, hs = hillshade(z, w, h, cell);
  const pos = new Float32Array(w * h * 3), col = new Float32Array(w * h * 3), idx = [];
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const k = r * w + c;
    pos[3 * k] = (c + 0.5) * cell; pos[3 * k + 1] = (r + 0.5) * cell;
    pos[3 * k + 2] = Number.isFinite(z[k]) ? z[k] - state.zBase : 0;
    const g = Number.isFinite(hs[k]) ? 0.25 + 0.7 * hs[k] : 0.5;
    col[3 * k] = g; col[3 * k + 1] = g * 0.97; col[3 * k + 2] = g * 0.92;
  }
  for (let r = 0; r < h - 1; r++) for (let c = 0; c < w - 1; c++) {
    const a = r * w + c, b = a + 1, d = a + w, e = d + 1;
    if ([a, b, d, e].every((k) => Number.isFinite(z[k]))) idx.push(a, b, e, a, e, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
  mesh.position.set(origin[0], origin[1], state.zBase);
  state.viewer.scene.scene.add(mesh);
  state.mesh = mesh;
}

// Flies the camera to the tile box (Potree's zoomTo takes an Object3D with a bounding sphere).
export function focusTile(state) {
  if (!state.box) return;
  state.box.geometry.computeBoundingSphere();
  state.box.updateMatrixWorld(true);
  state.viewer.zoomTo(state.box, 1.4, 600);
}
