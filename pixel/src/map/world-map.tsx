import { atom } from '@reatom/core';
import { h } from '@reatom/jsx';
import type { InterfaceCue } from '../audio/interface-audio';
import type { MapPlacement } from '../catalog';
import { copy, formatNumber, type Locale } from '../i18n/atlas-copy';
import { PixelIcon } from '../ui/pixel-icon';
import { drawLand, groupMarkers, mapHeight, mapWidth, project, scale, scaleRank, type Marker } from './land';
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
    if (Math.hypot(right.x - left.x, right.y - left.y) > 7) continue;
    offsets.set(left.key, -13);
    offsets.set(right.key, 13);
  }
  return offsets;
}

export function WorldMap({ placements, locale, onFlagOpen, registerRestore, playCue }: {
  placements: readonly MapPlacement[];
  locale: Locale;
  onFlagOpen: (placement: MapPlacement, state: MapViewState) => void;
  registerRestore: (restore: (state: MapViewState) => void) => void;
  playCue: (cue: InterfaceCue) => void;
}) {
  const text = copy[locale];
  const markers = groupMarkers(placements);
  const offsets = episodeMarkerOffsets(markers);
  const bands = scale.map((bin, index) => {
    const minimum = formatNumber(bin.min, locale);
    const next = scale[index + 1];
    return { color: bin.color, label: next ? `${minimum}–${formatNumber(next.min - 1, locale)}` : `${minimum}+` };
  });
  const zoom = atom(1, 'map.zoom');
  const focusedIndex = atom(0, 'map.focusedMarker');
  const activeGroup = atom<Marker | null>(null, 'map.activeGroup');
  let viewport: HTMLDivElement;
  let panel: HTMLDivElement;
  const markerButtons: HTMLButtonElement[] = [];

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

  function closeGroup() {
    const marker = activeGroup();
    if (!marker) return;
    activeGroup.set(null);
    markerButtons[markers.indexOf(marker)]?.focus({ preventScroll: true });
  }

  function moveFocus(event: KeyboardEvent, index: number) {
    const step = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1
      : event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : 0;
    if (step === 0 && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? markers.length - 1
      : (index + step + markers.length) % markers.length;
    markerButtons[next]?.focus();
  }

  registerRestore(state => {
    const index = markers.findIndex(marker => marker.placements.some(placement => placement.flagId === state.flagId));
    if (index < 0) return;
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
    <section class="world-map" aria-labelledby="map-title" aria-describedby="map-help">
      <div class="map-toolbar">
        <div>
          <h2 id="map-title" tabindex={-1}>{text.worldMap}</h2>
          <p id="map-help">{text.mapDescription}</p>
        </div>
        <div class="map-zoom" role="group" aria-label={text.worldMap}>
          <button type="button" class="pixel-action" aria-label={text.zoomOut} disabled={() => zoom() === zoomLevels[0]}
            on:click={() => zoomByControl(zoomLevels[zoomLevels.indexOf(zoom()) - 1])}><PixelIcon name="minus" /></button>
          <button type="button" aria-label={text.zoomReset} data-testid="map-zoom"
            on:click={() => zoomByControl(zoomLevels[0])}>{() => `${zoom() * 100}%`}</button>
          <button type="button" class="pixel-action" aria-label={text.zoomIn} disabled={() => zoom() === zoomLevels.at(-1)}
            on:click={() => zoomByControl(zoomLevels[zoomLevels.indexOf(zoom()) + 1])}><PixelIcon name="plus" /></button>
        </div>
      </div>
      <div class="map-board">
        <div class="map-viewport" data-testid="map-viewport" ref={element => { viewport = element; }}>
          <div class="map-plane" ref={element => { panel = element; }}>
            <canvas class="map-land" data-testid="map-land" width={mapWidth} height={mapHeight} aria-hidden="true"
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
              return (
                <button
                  type="button"
                  class={`map-marker map-marker--${multiple ? 'group' : first.sourceKind}${marker.estimate === null ? ' map-marker--no-scale' : ''}${marker.y < 26 ? ' map-marker--north' : ''}${marker.x > 185 ? ' map-marker--east' : ''}`}
                  style={`--map-x:${marker.x / mapWidth * 100}%;--map-y:${marker.y / mapHeight * 100}%;--marker-offset:${offset}px;--marker-ink:${ink}`}
                  aria-label={label}
                  aria-haspopup={multiple ? undefined : 'dialog'}
                  aria-expanded={multiple ? () => activeGroup() === marker : undefined}
                  tabindex={() => focusedIndex() === index ? 0 : -1}
                  data-flag-count={multiple ? String(marker.placements.length) : undefined}
                  data-flag-id={multiple ? undefined : first.flagId}
                  ref={element => { markerButtons[index] = element; }}
                  on:focus={() => {
                    focusedIndex.set(index);
                    playCue('flag');
                  }}
                  on:pointerenter={() => playCue('flag')}
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
                    style={`--tether-size:${Math.abs(offset)}px;--tether-start:${offset > 0 ? '-1px' : '50%'}`} /> : null}
                  <span class="map-marker__point" aria-hidden="true">{multiple ? marker.placements.length : null}</span>
                  <PixelIcon name="flag" size={32} />
                  <span class="map-marker__label" aria-hidden="true">{label}</span>
                </button>
              );
            })}
          </div>
        </div>
        {() => {
          const group = activeGroup();
          return group ? (
            <div class="map-group" role="group" aria-label={text.flagGroup}
              on:keydown={event => { if (event.key === 'Escape') closeGroup(); }}>
              <div class="map-group__heading">
                <strong>{text.flagGroup}</strong>
                <button type="button" class="pixel-action" aria-label={text.close} on:click={closeGroup}><PixelIcon name="close" /></button>
              </div>
              <ul>
                {group.placements.map(placement => (
                  <li><button type="button" data-group-flag={placement.flagId} aria-haspopup="dialog"
                    on:click={() => openFlag(placement)}>{placement.names[locale]}</button></li>
                ))}
              </ul>
            </div>
          ) : null;
        }}
      </div>
      <footer class="map-legend">
        <div class="map-legend__scale">
          <strong>{text.mapScale}</strong>
          <span>{text.scaleLow}</span>
          <div class="map-legend__swatches" aria-hidden="true">
            {bands.map(band => <span style={`background:${band.color}`} title={band.label} />)}
          </div>
          <span>{text.scaleHigh}</span>
        </div>
        <span class="map-legend__key"><i class="map-legend__diamond" aria-hidden="true" />{text.mapHistory}</span>
        <span class="map-legend__key"><i class="map-legend__unknown" aria-hidden="true" />{text.mapUnknown}</span>
        <p>{text.mapAnchors} <a href="https://www.naturalearthdata.com/about/terms-of-use/">{text.mapSource}</a></p>
        <details class="map-legend__method">
          <summary>{text.scaleDetails}</summary>
          <p>{text.scaleScope}</p>
          <ol>{bands.map(band => <li><span aria-hidden="true" style={`background:${band.color}`} />{band.label}</li>)}</ol>
        </details>
      </footer>
    </section>
  );
}
