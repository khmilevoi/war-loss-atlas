import Globe, { type GlobeInstance } from 'globe.gl';
import landText from '../../public/geo/ne_110m_land.geojson?raw';
import type { Placement } from '../data/types';

export type CanvasState = { placements: readonly Placement[]; selectedId: string | null; paused: boolean;
  onSelect: (id: string) => void };
export type CanvasOwner = { update: (state: CanvasState) => void; dispose: () => void };
type Ring = number[][];
type Polygon = Ring[];
const idOf = (p: Placement) => 'conflict_id' in p ? p.conflict_id : p.highlight_id;

// Deterministic decorative particles from the pinned, public-domain land polygons.
// These dots are not observations, borders, casualties, or additional placements.
function landParticles() {
  const geo = JSON.parse(landText) as { features: { geometry: { type: string; coordinates: unknown } }[] };
  const polygons = geo.features.flatMap(feature => feature.geometry.type === 'Polygon'
    ? [feature.geometry.coordinates as Polygon] : feature.geometry.coordinates as Polygon[])
    .map(rings => ({ rings, minX: Math.min(...rings[0].map(p => p[0])), maxX: Math.max(...rings[0].map(p => p[0])),
      minY: Math.min(...rings[0].map(p => p[1])), maxY: Math.max(...rings[0].map(p => p[1])) }));
  const inRing = (x: number, y: number, ring: Ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  };
  const land: { lat: number; lng: number }[] = [], ocean: { lat: number; lng: number }[] = [];
  const count = 140000, angle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const lat = Math.asin(1 - 2 * (i + .5) / count) * 180 / Math.PI + Math.sin(i * 71.71) * .16;
    const lng = ((i * angle * 180 / Math.PI) % 360) - 180 + Math.sin(i * 43.17) * .16;
    if (polygons.some(p => lng >= p.minX && lng <= p.maxX && lat >= p.minY && lat <= p.maxY
      && inRing(lng, lat, p.rings[0]) && !p.rings.slice(1).some(ring => inRing(lng, lat, ring)))) land.push({ lat, lng });
    else if (i % 30 === 0) ocean.push({ lat, lng });
  }
  return [{ points: land, color: '#b1f0db', size: .38 }, { points: ocean, color: '#193531', size: .035 }];
}
const particles = landParticles();

/** Client-only resource owner. One globe, one observer; destruction is idempotent. */
export function mountGlobe(host: HTMLElement, initial: CanvasState, onFailure: () => void): CanvasOwner {
  let state = initial, disposed = false;
  let globe: GlobeInstance | undefined;
  const observer = new ResizeObserver(() => {
    if (globe && !disposed) globe.width(host.clientWidth).height(host.clientHeight);
  });
  const contextLost = (event: Event) => { event.preventDefault(); dispose(); onFailure(); };
  const visibility = () => {
    if (!globe || disposed) return;
    if (document.hidden) globe.pauseAnimation(); else globe.resumeAnimation();
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    document.removeEventListener('visibilitychange', visibility);
    const current = globe;
    if (current) {
      const renderer = current.renderer();
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      current.pauseAnimation();
      // Installed _destructor clears layers/geometry, controls, renderer and composer.
      current._destructor();
      renderer.forceContextLoss();
    }
    host.replaceChildren();
  };
  try {
    globe = new Globe(host, { animateIn: false, rendererConfig: { antialias: true, alpha: true } })
      .width(host.clientWidth).height(host.clientHeight).backgroundColor('#00000000')
      .showAtmosphere(true).atmosphereColor('#61b5a7').atmosphereAltitude(.075)
      .particlesData(particles).particlesList('points').particlesColor('color').particlesSize('size')
      .particleAltitude(.002).pointsMerge(false).pointLat('latitude').pointLng('longitude')
      .pointRadius(.6).pointAltitude(.012).pointResolution(20).pointsTransitionDuration(0)
      .pointLabel(() => '').onPointClick(point => state.onSelect(idOf(point as Placement)))
      .onPointHover(point => { if (point) state.onSelect(idOf(point as Placement)); });
    // Installed globeMaterial is a Three material; set existing colors without a second Three import.
    const material = globe.globeMaterial() as ReturnType<GlobeInstance['globeMaterial']> & {
      color: { set: (color: string) => void }; emissive: { set: (color: string) => void }; shininess: number };
    material.color.set('#071315'); material.emissive.set('#030b0c'); material.shininess = 0;
    globe.pointOfView({ lat: 23, lng: 10, altitude: 1.65 }, 0);
    globe.controls().enableZoom = false;
    globe.controls().enablePan = false;
    globe.controls().autoRotateSpeed = .22;
    globe.renderer().setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    globe.renderer().domElement.setAttribute('aria-hidden', 'true');
    globe.renderer().domElement.addEventListener('webglcontextlost', contextLost);
    observer.observe(host);
    document.addEventListener('visibilitychange', visibility);
    visibility();
  } catch (error) { dispose(); throw error; }
  const update = (next: CanvasState) => {
    state = next;
    if (!globe || disposed) return;
    globe.pointsData(next.placements.filter(p => p.latitude !== null && p.longitude !== null))
      .pointColor(point => idOf(point as Placement) === next.selectedId ? '#ffe2c9' : '#ff8b77');
    globe.controls().autoRotate = !next.paused;
    globe.controls().enableDamping = !next.paused;
  };
  update(initial);
  return { update, dispose };
}
