import Globe, { type GlobeInstance } from 'globe.gl';
import { Raycaster, Vector2, type MeshPhongMaterial, type Object3D } from 'three';
import landText from '../../public/geo/ne_110m_land.geojson?raw';
import type { Placement } from '../data/types';

export type CanvasState = { placements: readonly Placement[]; selectedId: string | null; paused: boolean;
  onSelect: (id: string) => void; onPreview: (id: string | null) => void; onCluster: (ids: string[]) => void };
export type CanvasOwner = { update: (state: CanvasState) => void; dispose: () => void };
export type RendererStatus = 'loading' | 'ready' | 'recovering' | 'unavailable';
type Ring = number[][];
type Polygon = Ring[];
type Edge = [number[], number[]];
const idOf = (p: Placement) => 'conflict_id' in p ? p.conflict_id : p.highlight_id;
type Marker = { latitude: number; longitude: number; ids: string[] };
// Globe.GL's pinned three-globe layer tags its surface and navigation meshes.
type PickObject = Object3D & { __globeObjType?: string; __data?: Marker };

function indexRing(ring: Ring) {
  const bands = new Map<number, Edge[]>();
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if (a[1] === b[1]) continue;
    const edge: Edge = [a, b];
    const last = Math.floor(Math.max(a[1], b[1]));
    for (let band = Math.floor(Math.min(a[1], b[1])); band <= last; band++) {
      const edges = bands.get(band);
      if (edges) edges.push(edge);
      else bands.set(band, [edge]);
    }
  }
  return bands;
}

// Deterministic decorative particles from the pinned, public-domain land polygons.
// These dots are not observations, borders, casualties, or additional placements.
function landParticles() {
  const geo = JSON.parse(landText) as { features: { geometry: { type: string; coordinates: unknown } }[] };
  const polygons = geo.features.flatMap(feature => feature.geometry.type === 'Polygon'
    ? [feature.geometry.coordinates as Polygon] : feature.geometry.coordinates as Polygon[])
    .map(([outer, ...holes]) => ({
      outer: indexRing(outer), holes: holes.map(indexRing),
      minX: Math.min(...outer.map(p => p[0])), maxX: Math.max(...outer.map(p => p[0])),
      minY: Math.min(...outer.map(p => p[1])), maxY: Math.max(...outer.map(p => p[1])),
    }));
  const polygonBands = new Map<number, typeof polygons>();
  for (const polygon of polygons) {
    for (const band of polygon.outer.keys()) {
      const candidates = polygonBands.get(band);
      if (candidates) candidates.push(polygon);
      else polygonBands.set(band, [polygon]);
    }
  }
  const inRing = (x: number, y: number, edges: Edge[] | undefined) => {
    if (!edges) return false;
    let inside = false;
    for (const [a, b] of edges) {
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  };
  const land: { lat: number; lng: number }[] = [], ocean: { lat: number; lng: number }[] = [];
  const count = 140000, angle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const lat = Math.asin(1 - 2 * (i + .5) / count) * 180 / Math.PI + Math.sin(i * 71.71) * .16;
    const lng = ((i * angle * 180 / Math.PI) % 360) - 180 + Math.sin(i * 43.17) * .16;
    const band = Math.floor(lat);
    const onLand = polygonBands.get(band)?.some(p => lng >= p.minX && lng <= p.maxX && lat >= p.minY && lat <= p.maxY
      && inRing(lng, lat, p.outer.get(band)) && !p.holes.some(ring => inRing(lng, lat, ring.get(band))));
    if (onLand) land.push({ lat, lng });
    else if (i % 30 === 0) ocean.push({ lat, lng });
  }
  return [{ points: land, color: '#b1f0db', size: .38 }, { points: ocean, color: '#193531', size: .035 }];
}
let cachedParticles: ReturnType<typeof landParticles> | undefined;

/** Client-only resource owner. One globe, one observer; destruction is idempotent. */
export function mountGlobe(host: HTMLElement, initial: CanvasState,
  onStatus: (status: RendererStatus) => void): CanvasOwner | null {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('webgl2', { antialias: true, alpha: true });
  if (!context) return null;
  let state = initial, disposed = false, recovering = false, inViewport = true;
  let globe: GlobeInstance | undefined;
  let previousPlacements: readonly Placement[] = [];
  let previousSelected: string | null | undefined;
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  let press: { id: number; x: number; y: number } | null = null;
  const pointerDown = (event: PointerEvent) => {
    press = event.isPrimary && event.button === 0
      ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
  };
  const pointerMove = (event: PointerEvent) => {
    if (press?.id === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 5) press = null;
  };
  const pointerCancel = () => { press = null; };
  const pointerUp = (event: PointerEvent) => {
    pointerMove(event);
    if (press?.id !== event.pointerId) return;
    press = null;
    if (!globe || recovering || disposed) return;
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return;
    pointer.set(2 * (event.clientX - bounds.left) / bounds.width - 1,
      1 - 2 * (event.clientY - bounds.top) / bounds.height);
    if (Math.abs(pointer.x) > 1 || Math.abs(pointer.y) > 1) return;
    // The library's click callback reuses a throttled hover hit. A quick tap
    // can arrive between hover samples, so pick using the release coordinates.
    const scene = globe.scene(), camera = globe.camera();
    scene.updateMatrixWorld();
    camera.updateMatrixWorld();
    raycaster.setFromCamera(pointer, camera);
    for (const hit of raycaster.intersectObjects(scene.children)) {
      const object = hit.object as PickObject;
      if (object.__globeObjType === 'globe') return; // Surface occludes far-side markers.
      if (object.__globeObjType !== 'point' || !object.__data) continue;
      const { ids } = object.__data;
      if (ids.length > 1) state.onCluster(ids); else state.onSelect(ids[0]);
      return;
    }
  };
  const observer = new ResizeObserver(() => {
    if (!globe || disposed) return;
    if (host.clientWidth !== globe.width()) globe.width(host.clientWidth);
    if (host.clientHeight !== globe.height()) globe.height(host.clientHeight);
  });
  const syncAnimation = () => {
    if (!globe || disposed) return;
    if (recovering || !inViewport || document.hidden) globe.pauseAnimation();
    else globe.resumeAnimation();
  };
  const viewport = new IntersectionObserver(([entry]) => {
    inViewport = entry.isIntersecting;
    syncAnimation();
  });
  const contextLost = (event: Event) => {
    event.preventDefault();
    recovering = true;
    pointerCancel();
    syncAnimation();
    onStatus('recovering');
  };
  const contextRestored = () => {
    recovering = false;
    syncAnimation();
    onStatus('ready');
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    viewport.disconnect();
    document.removeEventListener('visibilitychange', syncAnimation);
    canvas.removeEventListener('webglcontextlost', contextLost);
    canvas.removeEventListener('webglcontextrestored', contextRestored);
    canvas.removeEventListener('pointerdown', pointerDown);
    canvas.removeEventListener('pointermove', pointerMove);
    canvas.removeEventListener('pointercancel', pointerCancel);
    canvas.removeEventListener('pointerup', pointerUp);
    // The installed _destructor stops animation and releases layers, controls and renderer.
    globe?._destructor();
    if (!context.isContextLost()) context.getExtension('WEBGL_lose_context')?.loseContext();
    host.replaceChildren();
  };
  try {
    // Globe.GL attaches scene objects to layer records. Share coordinates only.
    const particles = (cachedParticles ??= landParticles()).map(group => ({ ...group }));
    globe = new Globe(host, { animateIn: false, rendererConfig: { canvas, context, antialias: true, alpha: true } });
    globe
      .width(host.clientWidth).height(host.clientHeight).backgroundColor('#00000000')
      .showAtmosphere(true).atmosphereColor('#61b5a7').atmosphereAltitude(.075)
      .particlesData(particles).particlesList('points').particlesColor('color').particlesSize('size')
      .particleAltitude(.002).pointsMerge(false).pointLat('latitude').pointLng('longitude')
      .pointRadius(.6).pointAltitude(.012).pointResolution(20).pointsTransitionDuration(0)
      .pointLabel(() => '').onPointHover(point => {
        canvas.style.cursor = point ? 'pointer' : '';
        if (!point) { state.onPreview(null); return; }
        const { ids } = point as Marker;
        state.onPreview(ids.length > 1 ? null : ids[0]);
      });
    const scene = globe.scene();
    const beforeRender = scene.onBeforeRender;
    scene.onBeforeRender = (...args: Parameters<typeof beforeRender>) => {
      // Globe.GL builds its layers asynchronously. Decorative points must never
      // intercept marker picks or scan their vertices on every pointer frame.
      let particleLayers = 0;
      scene.traverse(object => {
        if (!('isPoints' in object) || !object.isPoints) return;
        object.raycast = () => {};
        particleLayers++;
      });
      if (particleLayers === particles.length) scene.onBeforeRender = beforeRender;
      beforeRender.apply(scene, args);
    };
    const material = globe.globeMaterial() as MeshPhongMaterial;
    material.color.set('#071315'); material.emissive.set('#030b0c'); material.shininess = 0;
    globe.pointOfView({ lat: 23, lng: 10, altitude: 1.65 }, 0);
    globe.controls().enableZoom = false;
    globe.controls().enablePan = false;
    globe.controls().autoRotateSpeed = .22;
    globe.renderer().setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    canvas.setAttribute('aria-hidden', 'true');
    canvas.addEventListener('webglcontextlost', contextLost);
    canvas.addEventListener('webglcontextrestored', contextRestored);
    canvas.addEventListener('pointerdown', pointerDown);
    canvas.addEventListener('pointermove', pointerMove);
    canvas.addEventListener('pointercancel', pointerCancel);
    canvas.addEventListener('pointerup', pointerUp);
    observer.observe(host);
    viewport.observe(host);
    document.addEventListener('visibilitychange', syncAnimation);
    syncAnimation();
  } catch (error) { dispose(); throw error; }
  const update = (next: CanvasState) => {
    state = next;
    if (!globe || disposed) return;
    if (next.placements !== previousPlacements && (next.placements.length !== previousPlacements.length
      || next.placements.some((p, i) => p !== previousPlacements[i]))) {
      // Group only coincident navigation anchors; never aggregate source values.
      const grouped = new Map<string, Marker>();
      for (const p of next.placements) {
        if (p.latitude === null || p.longitude === null) continue;
        const key = `${p.latitude}:${p.longitude}`, marker = grouped.get(key)
          ?? { latitude: p.latitude, longitude: p.longitude, ids: [] };
        if (!marker.ids.includes(idOf(p))) marker.ids.push(idOf(p));
        grouped.set(key, marker);
      }
      globe.pointsData([...grouped.values()]);
      previousPlacements = next.placements;
    }
    if (next.selectedId !== previousSelected) {
      globe.pointColor(point => (point as Marker).ids.includes(next.selectedId ?? '') ? '#ffe2c9' : '#ff8b77');
      previousSelected = next.selectedId;
    }
    globe.controls().autoRotate = !next.paused;
    globe.controls().enableDamping = !next.paused;
  };
  update(initial);
  return { update, dispose };
}
