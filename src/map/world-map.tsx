import { atom, computed } from '@reatom/core';
import { h, hf } from '@reatom/jsx';
import type { InterfaceCue } from '../audio/interface-audio';
import type { MapPlacement } from '../catalog';
import { copy, formatNumber, type Locale } from '../i18n/atlas-copy';
import { PixelIcon } from '../ui/pixel-icon';
import { drawLand, groupMarkers, mapHeight, mapRasterScale, mapWidth, project, scale, scaleRank, type Marker } from './land';
import { MapFlag, type MapFlagKind } from './map-flag';
import './map.css';

export interface MapViewState {
  zoom: number;
  left: number;
  top: number;
  flagId: string;
}

const zoomLevels = [1, 1.5, 2, 3];
const continentPositions = [
  [-106, 54], [-55, -22], [15, 56], [14, 13], [91, 48], [138, -24],
];
const naturalEarthTerms = 'https://www.naturalearthdata.com/about/terms-of-use/';

export function MapSources({ locale }: { locale: Locale }) {
  const text = copy[locale];
  return (
    <details class="map-sources">
      <summary class="atlas-sprite-button"><PixelIcon name="sources" />{text.sources}</summary>
      <div class="atlas-sprite-panel"><a href={naturalEarthTerms}>{text.mapSource}</a><p>{locale === 'ru'
        ? 'Границы не меняются при выборе года.'
        : 'Boundaries do not change with the selected year.'}</p></div>
    </details>
  );
}

function episodeMarkerOffsets(markers: readonly Marker[]) {
  const byWar = new Map<string, Marker[]>();
  for (const marker of markers) {
    const flag = marker.placements[0];
    if (marker.placements.length !== 1 || flag.episodeId === null) continue;
    const family = byWar.get(flag.warId) ?? [];
    family.push(marker);
    byWar.set(flag.warId, family);
  }
  const offsets = new Map<string, number>();
  for (const family of byWar.values()) {
    if (family.length !== 2) continue;
    const [left, right] = family;
    if (Math.hypot(right.x - left.x, right.y - left.y) > 5) continue;
    offsets.set(left.key, -3);
    offsets.set(right.key, 3);
  }
  return offsets;
}

export function WorldMap({ placements, locale, onFlagOpen, registerRestore, playCue, selectedFlag, onFlagPreview }: {
  placements: () => readonly MapPlacement[];
  locale: Locale;
  onFlagOpen: (placement: MapPlacement, state: MapViewState) => void;
  registerRestore: (restore: (state: MapViewState) => void) => void;
  playCue: (cue: InterfaceCue) => void;
  selectedFlag: () => string | undefined;
  onFlagPreview: (placement: MapPlacement, open: () => void) => void;
}) {
  const text = copy[locale];
  const activeMarkers = computed(() => groupMarkers(placements()), 'map.visibleMarkers');
  const bands = scale.map((bin, index) => {
    const minimum = formatNumber(bin.min, locale);
    const next = scale[index + 1];
    return { color: bin.color, label: next ? `${minimum}–${formatNumber(next.min - 1, locale)}` : `${minimum}+` };
  });
  const zoom = atom(1, 'map.zoom');
  const showLegend = atom(true, 'map.legendVisible');
  const focusedIndex = atom(0, 'map.focusedMarker');
  const activeGroup = atom<Marker | null>(null, 'map.activeGroup');
  let viewport: HTMLDivElement;
  let panel: HTMLDivElement;
  const markerButtons: HTMLButtonElement[] = [];
  let pan: { pointer: number; x: number; y: number; left: number; top: number; started: boolean } | null = null;

  function canPan() {
    return viewport.scrollWidth - viewport.clientWidth > 1 || viewport.scrollHeight - viewport.clientHeight > 1;
  }

  function stopPan(pointer = pan?.pointer) {
    if (pointer === undefined || pointer !== pan?.pointer) return;
    pan = null;
    panel.removeAttribute('data-panning');
    if (panel.hasPointerCapture(pointer)) panel.releasePointerCapture(pointer);
  }

  const panObserver = new ResizeObserver(() => {
    if (!viewport || !panel) return;
    const pannable = canPan();
    panel.toggleAttribute('data-pannable', pannable);
    if (!pannable) stopPan();
  });

  function startPan(event: PointerEvent) {
    if (event.pointerType !== 'mouse' || event.button !== 0 || !event.isPrimary || !canPan()
      || (event.target instanceof Element && event.target.closest('button, a'))) return;
    panel.setPointerCapture(event.pointerId);
    pan = {
      pointer: event.pointerId, x: event.clientX, y: event.clientY,
      left: viewport.scrollLeft, top: viewport.scrollTop, started: false,
    };
  }

  function movePan(event: PointerEvent) {
    if (pan?.pointer !== event.pointerId) return;
    if (!(event.buttons & 1)) {
      stopPan(event.pointerId);
      return;
    }
    const x = event.clientX - pan.x;
    const y = event.clientY - pan.y;
    if (!pan.started && Math.hypot(x, y) < 4) return;
    if (!pan.started) {
      pan.started = true;
      panel.setAttribute('data-panning', '');
    }
    viewport.scrollLeft = pan.left - x;
    viewport.scrollTop = pan.top - y;
  }

  function setZoom(value: number) {
    const prior = zoom();
    if (value === prior) return;
    const { clientWidth, clientHeight, scrollLeft, scrollTop } = viewport;
    const priorWidth = panel.offsetWidth;
    const mapX = scrollLeft + clientWidth / 2 - panel.offsetLeft;
    const mapY = scrollTop + clientHeight / 2;
    zoom.set(value);
    panel.style.setProperty('--map-zoom', String(value));
    const ratio = panel.offsetWidth / priorWidth;
    viewport.scrollLeft = panel.offsetLeft + mapX * ratio - viewport.clientWidth / 2;
    viewport.scrollTop = mapY * ratio - viewport.clientHeight / 2;
  }

  function zoomByControl(value: number) {
    playCue('press');
    setZoom(value);
  }

  function openFlag(placement: MapPlacement) {
    onFlagOpen(placement, {
      zoom: zoom(),
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
      flagId: placement.flagId,
    });
  }

  function previewFlag(placement: MapPlacement) {
    onFlagPreview(placement, () => openFlag(placement));
  }

  function closeGroup() {
    const marker = activeGroup();
    if (!marker) return;
    activeGroup.set(null);
    markerButtons[activeMarkers().indexOf(marker)]?.focus({ preventScroll: true });
  }

  function moveFocus(event: KeyboardEvent, index: number) {
    const step = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1
      : event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : 0;
    if (step === 0 && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const markers = activeMarkers();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? markers.length - 1
      : (index + step + markers.length) % markers.length;
    markerButtons[next]?.focus();
  }

  registerRestore(state => {
    const markers = activeMarkers();
    const index = markers.findIndex(marker => marker.placements.some(placement => placement.flagId === state.flagId));
    if (index < 0) {
      document.getElementById('map-title')?.focus();
      return;
    }
    setZoom(state.zoom);
    viewport.scrollLeft = state.left;
    viewport.scrollTop = state.top;
    const marker = markers[index];
    if (marker.placements.length > 1) activeGroup.set(marker);
    queueMicrotask(() => {
      const groupFlag = Array.from(viewport.parentElement?.querySelectorAll<HTMLButtonElement>('[data-group-flag]') ?? [])
        .find(button => button.dataset.groupFlag === state.flagId);
      (groupFlag ?? markerButtons[index])?.focus({ preventScroll: true });
    });
  });

  return (
    <section class="world-map" aria-labelledby="map-title" aria-describedby="map-help"
      style={`--map-aspect:${mapHeight / mapWidth};--map-columns:${mapWidth}`}>
      <div class="map-toolbar">
        <div class="atlas-desktop-visually-hidden">
          <h2 id="map-title" tabindex={-1}>{text.worldMap}</h2>
          <p id="map-help" class="atlas-visually-hidden">{text.mapDescription}</p>
        </div>
        <div class="map-zoom" role="group" aria-label={text.worldMap}>
          <button type="button" class="atlas-sprite-button pixel-action" aria-label={text.zoomIn} disabled={() => zoom() === zoomLevels.at(-1)}
            on:click={() => zoomByControl(zoomLevels[zoomLevels.indexOf(zoom()) + 1])}><PixelIcon name="plus" size={24} /></button>
          <button type="button" class="atlas-sprite-button pixel-action" aria-label={text.zoomOut} disabled={() => zoom() === zoomLevels[0]}
            on:click={() => zoomByControl(zoomLevels[zoomLevels.indexOf(zoom()) - 1])}><PixelIcon name="minus" size={24} /></button>
          <button type="button" class="atlas-sprite-button" aria-label={text.zoomReset} data-testid="map-zoom"
            on:click={() => zoomByControl(zoomLevels[0])}>{() => `${zoom() * 100}%`}</button>
          <button type="button" class="atlas-sprite-button pixel-action map-legend-toggle" aria-label={text.mapToggleLegend}
            aria-controls="atlas-map-legend" aria-pressed={showLegend}
            on:click={() => { showLegend.set(!showLegend()); playCue('press'); }}><PixelIcon name="layers" size={24} /></button>
        </div>
      </div>
      <div class="map-board">
        <div class="map-viewport" data-testid="map-viewport" ref={element => {
          viewport = element;
          panObserver.observe(element);
          return () => panObserver.disconnect();
        }}>
          <div class="map-plane" ref={element => {
            panel = element;
            panObserver.observe(element);
            return () => stopPan();
          }}
            on:pointerdown={startPan} on:pointermove={movePan}
            on:pointerup={event => stopPan(event.pointerId)} on:pointercancel={event => stopPan(event.pointerId)}
            on:lostpointercapture={event => stopPan(event.pointerId)} on:dragstart={event => event.preventDefault()}>
            {() => {
              const markers = activeMarkers();
              const offsets = episodeMarkerOffsets(markers);
              markerButtons.length = 0;
              return <>
                <canvas class="map-land" data-testid="map-land" width={mapWidth * mapRasterScale} height={mapHeight * mapRasterScale} aria-hidden="true"
                  ref={element => { drawLand(element, markers); }} />
                {continentPositions.map(([longitude, latitude], index) => {
                  const { x, y } = project(longitude, latitude);
                  return <span class="map-continent" aria-hidden="true"
                    style={`--map-x:${x / mapWidth * 100}%;--map-y:${y / mapHeight * 100}%`}>{text.continents[index]}</span>;
                })}
                {markers.map((marker, index) => {
                  const multiple = marker.placements.length > 1;
                  const first = marker.placements[0];
                  const offset = offsets.get(marker.key) ?? 0;
                  const value = marker.estimate?.value;
                  const ink = value == null ? '#381823' : scale[scaleRank(value)].color;
                  const label = multiple ? `${text.flagGroup} (${marker.placements.length})` : first.names[locale];
                  const kind: MapFlagKind = marker.placements.every(placement => placement.sourceKind === 'history')
                    ? 'history' : value == null ? 'unknown' : 'estimate';
                  const y = marker.y / mapHeight;
                  const verticalClass = y < 0.21 ? ' map-marker--north' : y < 0.5 ? ' map-marker--upper' : '';
                  return (
                    <button
                      type="button"
                      class={`map-marker map-marker--${kind}${offset !== 0 ? ' map-marker--displaced' : ''}${verticalClass}${marker.x / mapWidth > 0.74 ? ' map-marker--east' : ''}`}
                      style={`--map-x:${(marker.x + offset) / mapWidth * 100}%;--map-y:${y * 100}%;--marker-ink:${ink}`}
                      aria-label={label}
                      aria-haspopup={multiple ? undefined : 'dialog'}
                      aria-expanded={multiple ? () => activeGroup() === marker : undefined}
                      tabindex={() => Math.min(focusedIndex(), markers.length - 1) === index ? 0 : -1}
                      data-flag-count={multiple ? String(marker.placements.length) : undefined}
                      data-flag-id={multiple ? undefined : first.flagId}
                      data-selected={() => {
                        const flagId = selectedFlag();
                        return marker.placements.some(placement => placement.flagId === flagId) ? 'true' : undefined;
                      }}
                      ref={element => { markerButtons[index] = element; }}
                      on:focus={() => {
                        focusedIndex.set(index);
                        playCue('flag');
                        if (!multiple) previewFlag(first);
                      }}
                      on:pointerenter={() => {
                        playCue('flag');
                        if (!multiple) previewFlag(first);
                      }}
                      on:keydown={event => moveFocus(event, index)}
                      on:click={() => {
                        if (!multiple) {
                          activeGroup.set(null);
                          openFlag(first);
                          return;
                        }
                        playCue('press');
                        if (activeGroup() === marker) {
                          closeGroup();
                          return;
                        }
                        activeGroup.set(marker);
                        queueMicrotask(() => viewport.parentElement?.querySelector<HTMLButtonElement>('[data-group-flag]')?.focus());
                      }}
                    >
                      {offset !== 0 ? <span class="map-marker__tether" aria-hidden="true"
                        style={`--tether-columns:${Math.abs(offset)};--tether-west:${Math.max(0, offset)}`} /> : null}
                      <span class="map-marker__point" aria-hidden="true" />
                      <MapFlag kind={kind} />
                      <MapFlag desktop kind={kind} />
                      {multiple ? <span class="map-marker__count" aria-hidden="true">{marker.placements.length}</span> : null}
                      <MapFlag raised />
                      <span class="map-marker__label" aria-hidden="true">{label}</span>
                    </button>
                  );
                })}
              </>;
            }}
          </div>
        </div>
        {() => {
          const group = activeGroup();
          return group && activeMarkers().includes(group) ? (
            <div class="map-group" role="group" aria-label={text.flagGroup}
              on:keydown={event => { if (event.key === 'Escape') closeGroup(); }}>
              <div class="map-group__heading">
                <strong>{text.flagGroup}</strong>
                <button type="button" class="atlas-sprite-button pixel-action" aria-label={text.close} on:click={closeGroup}><PixelIcon name="close" /></button>
              </div>
              <ul>
                {group.placements.map(placement => (
                  <li><button class="atlas-sprite-button" type="button" data-group-flag={placement.flagId} aria-haspopup="dialog"
                    on:focus={() => previewFlag(placement)}
                    on:pointerenter={() => previewFlag(placement)}
                    on:click={() => openFlag(placement)}>{placement.names[locale]}</button></li>
                ))}
              </ul>
            </div>
          ) : null;
        }}
      </div>
      <footer id="atlas-map-legend" class="map-legend atlas-sprite-panel" hidden={() => !showLegend()}>
        <h3>{text.mapScale}</h3>
        <ul class="map-legend__swatches">
          {bands.map(band => <li class="map-legend__item">
            <span class="map-legend__swatch" style={`background:${band.color}`} aria-hidden="true" />{band.label}
          </li>)}
        </ul>
        <ul class="map-legend__keys">
          <li class="map-legend__item"><MapFlag kind="history" /><MapFlag desktop kind="history" />{text.mapHistory}</li>
          <li class="map-legend__item"><MapFlag kind="unknown" /><MapFlag desktop kind="unknown" />{text.mapUnknown}</li>
        </ul>
        <details class="map-legend__method">
          <summary>{text.scaleDetails}</summary>
          <p>{text.scaleScope}</p>
          <p>{locale === 'ru' ? 'Оттенок зависит от фактуры карты; образцы показывают центр ореола.' : 'Shades vary with the map texture; swatches represent halo centres.'}</p>
          <p>{text.mapAnchors} <a class="map-source-inline" href={naturalEarthTerms}>{text.mapSource}</a></p>
        </details>
      </footer>
    </section>
  );
}
