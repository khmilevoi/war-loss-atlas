import { useMemo, useState, type KeyboardEvent } from 'react';
import landText from '../../public/geo/ne_110m_land.geojson?raw';
import type { CanvasState } from './GlobeCanvas';
import { battleDeathBins, clusterMarkerColor, mapMarkers, type MapMarker } from './mapMarkers';

const width = 960;
const height = 480;
type Coordinates = [longitude: number, latitude: number];
type Polygon = Coordinates[][];
type Geometry = { type: 'Polygon'; coordinates: Polygon } | { type: 'MultiPolygon'; coordinates: Polygon[] };

// Equal Earth. Both the Natural Earth land outlines and the reviewed placement
// anchors use the same projection with a Greenwich-centered view.
function project([longitude, latitude]: Coordinates) {
  const theta = Math.asin(Math.sqrt(3) / 2 * Math.sin(latitude * Math.PI / 180));
  const t2 = theta * theta;
  const t6 = t2 * t2 * t2;
  const a1 = 1.340264, a2 = -0.081106, a3 = 0.000893, a4 = 0.003796;
  const x = 2 * Math.sqrt(3) * longitude * Math.PI / 180 * Math.cos(theta)
    / (3 * (a1 + 3 * a2 * t2 + t6 * (7 * a3 + 9 * a4 * t2)));
  const y = theta * (a1 + a2 * t2 + t6 * (a3 + a4 * t2));
  return [width / 2 + 171 * x, height / 2 - 171 * y] as const;
}

const land = JSON.parse(landText) as { features: { geometry: Geometry }[] };
const landPaths = land.features.flatMap(({ geometry }) => geometry.type === 'Polygon'
  ? [geometry.coordinates] : geometry.coordinates).map(polygon => polygon.map(ring => ring.map((coordinate, i) => {
    const [x, y] = project(coordinate);
    return `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join('') + 'Z').join(''));

const markerNames = {
  cluster: 'Записи в одной точке',
  history: 'Исторический пример',
  ucdp: 'Конфликт UCDP',
  unknown: 'Конфликт UCDP без полной оценки',
};
const formatEstimate = new Intl.NumberFormat('ru-RU');
const markerKey = (marker: MapMarker) => `${marker.latitude}:${marker.longitude}`;
const lowContrastColors = new Set<string>(battleDeathBins.slice(0, 2).map(bin => bin.color));

function MarkerShape({ marker }: { marker: MapMarker }) {
  const { color, kind, radius } = marker;
  if (kind === 'history') {
    return <path d={`M0,${-radius}L${radius},0L0,${radius}L${-radius},0Z`} fill="#21191d" stroke={color} strokeWidth="1.8" />;
  }
  if (kind === 'cluster') {
    return <>
      <circle r={radius + 1} fill="#34252a" stroke={color} strokeWidth="1.6" />
      {lowContrastColors.has(color) ? <circle r={radius + 2} fill="none" stroke="#dc959d" strokeWidth=".65" /> : null}
      <text textAnchor="middle" dominantBaseline="central" fill={clusterMarkerColor} fontSize="9" fontWeight="700">{marker.ids.length}</text>
    </>;
  }
  return <circle r={radius} fill={kind === 'unknown' ? '#21191d' : color}
    stroke={lowContrastColors.has(color) ? '#dc959d' : color} strokeWidth="1.25" />;
}

export function FlatMap({ placements, selectedId, estimates, onSelect, onPreview, onCluster }: Omit<CanvasState, 'paused'>) {
  const markers = useMemo(() => mapMarkers(placements, estimates), [placements, estimates]);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const selectedIndex = markers.findIndex(marker => selectedId !== null && marker.ids.includes(selectedId));
  const focusedIndex = focusKey === null ? -1 : markers.findIndex(marker => markerKey(marker) === focusKey);
  const tabIndex = focusedIndex >= 0 ? focusedIndex : Math.max(selectedIndex, 0);
  const activate = (marker: MapMarker) => {
    if (marker.ids.length > 1) onCluster(marker.ids);
    else onSelect(marker.ids[0]);
  };
  const handleKey = (event: KeyboardEvent<SVGGElement>, marker: MapMarker, index: number) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate(marker);
    }
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (step) {
      event.preventDefault();
      const next = (index + step + markers.length) % markers.length;
      event.currentTarget.parentElement?.querySelector<SVGGElement>(`[data-marker-index="${next}"]`)?.focus();
    }
  };
  return <svg className="flat-map" viewBox={`0 0 ${width} ${height}`} width="100%"
    role="group" aria-label="Карта мира с условными метками событий" data-testid="flat-map">
    <g aria-hidden="true" fill="#393335" stroke="#655356" strokeWidth=".65" fillRule="evenodd">
      {landPaths.map((path, i) => <path key={i} d={path} />)}
    </g>
    <g role="group" aria-label="Метки событий. Для перемещения между ними используйте клавиши со стрелками.">
      {markers.map((marker, index) => {
        const [x, y] = project([marker.longitude, marker.latitude]);
        const selected = selectedId !== null && marker.ids.includes(selectedId);
        const label = marker.kind === 'cluster' ? `${markerNames.cluster}: ${marker.label} (${marker.ids.length})${marker.estimate === undefined
          ? '' : `, наибольшая оценка UCDP: ${formatEstimate.format(marker.estimate)}`}`
          : `${markerNames[marker.kind]}: ${marker.label}${marker.estimate === undefined ? ''
            : `, смертей, связанных с боями: ${formatEstimate.format(marker.estimate)}`}`;
        return <g key={markerKey(marker)} transform={`translate(${x.toFixed(3)},${y.toFixed(3)})`}
          role="button" aria-label={label} aria-pressed={selected}
          tabIndex={index === tabIndex ? 0 : -1} style={{ cursor: 'pointer' }}
          data-testid="map-marker" data-marker-kind={marker.kind} data-marker-index={index} data-record-ids={marker.ids.join(',')}
          onFocus={() => setFocusKey(markerKey(marker))}
          onClick={() => activate(marker)} onKeyDown={event => handleKey(event, marker, index)}
          onPointerEnter={() => onPreview(marker.kind === 'cluster' ? null : marker.ids[0])}
          onPointerLeave={() => onPreview(null)}>
          <circle r={Math.max(marker.radius + 3, 10)} fill="transparent" />
          {selected ? <circle r={marker.radius + 4} fill="none" stroke="#fff2e8" strokeWidth="1.25" pointerEvents="none" /> : null}
          <MarkerShape marker={marker} />
        </g>;
      })}
    </g>
  </svg>;
}
