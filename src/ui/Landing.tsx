import { action, atom, computed, withComputed, wrap } from '@reatom/core';
import { reatomFactoryComponent } from '@reatom/react';
import type { MouseEvent } from 'react';
import { atlasData } from '../app/routes';
import { defaultPeriod } from '../data/selectors';
import type { Layer } from '../data/types';
import type { AtlasModel } from '../model/atlas';
import { ConflictDetails } from './ConflictDetails';
import { FlatMap } from './FlatMap';
import { GlobeView } from './GlobeView';
import { battleDeathBins, clusterMarkerColor, historyMarkerColor, unknownMarkerColor } from './mapMarkers';
import { formatEstimate } from './VirtualTable';
import './styles.css';

const sources: { value: Layer; label: string }[] = [
  { value: 'all', label: 'Все записи' },
  { value: 'ucdp', label: 'UCDP' },
  { value: 'history', label: 'Исторические примеры' },
];
const [firstYear, lastYear] = defaultPeriod('all');
const years = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index);

function scrollToSection(event: MouseEvent<HTMLAnchorElement>) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const target = document.getElementById(event.currentTarget.hash.slice(1));
  target?.focus({ preventScroll: true });
  target?.scrollIntoView({ block: 'start' });
}

export const Landing = reatomFactoryComponent<{ model: AtlasModel }>(({ model }) => {
  const data = atlasData()!;
  const view = atom<'map' | 'globe'>('map', 'atlas.landing.view');
  const placementId = (item: (typeof data.placements)[number]) => 'conflict_id' in item ? item.conflict_id : item.highlight_id;
  const visibleRecords = computed(() => {
    const historical = model.historicalHighlights();
    const summaries = model.summaries();
    const records = [
      ...historical.map(item => ({ id: item.highlight_id, name: item.name_ru, years: `${item.start_year}–${item.end_year}`, history: true })),
      ...summaries.map(item => ({ id: item.id, name: item.name, years: `${item.firstObservedYear}–${item.lastObservedYear}`, history: false })),
    ];
    const ids = new Set(records.map(item => item.id));
    const placements = data.placements.filter(item => ids.has(placementId(item)));
    const locatedIds = new Set(placements.filter(item => item.latitude !== null).map(placementId));
    const estimates = new Map(summaries.map(item => [item.id, item.missingCounts.best ? null : item.best]));
    return { records, ids, placements, locatedIds, historical, summaries, estimates };
  }, 'atlas.landing.visibleRecords');
  // URL identity remains the visible record. Local interaction state distinguishes
  // an initial/hover/focus preview from a deliberate click/Enter/tap pin.
  const previewId = atom<string | null>(() => model.selectedId(), 'atlas.landing.previewId')
    .extend(withComputed(id => id === model.selectedId() ? id : null));
  const pinnedId = atom<string | null>(null, 'atlas.landing.pinnedId')
    .extend(withComputed(id => id && id === model.selectedId() && visibleRecords().ids.has(id) ? id : null));
  const cluster = atom<{ ids: string[]; filterKey: string } | null>(null, 'atlas.landing.cluster')
    .extend(withComputed(value => value?.filterKey === JSON.stringify(model.filters()) ? value : null));
  let closing = false;
  let lastTrigger: HTMLElement | null = null;
  const close = action(() => {
    const id = model.selectedId();
    closing = true;
    const target = lastTrigger?.isConnected ? lastTrigger : document.getElementById(`map-record-${id}`);
    target?.focus({ preventScroll: true });
    pinnedId.set(null);
    previewId.set(null);
    model.selectedId.set(null);
    closing = false;
  }, 'atlas.landing.close');
  const preview = action((id: string | null, target?: HTMLElement) => {
    if (closing || pinnedId()) return;
    if (id === null && previewId() === null) return;
    if (target) lastTrigger = target;
    model.selectedId.set(id);
    previewId.set(id);
  }, 'atlas.landing.preview');
  const activate = action((id: string, target?: HTMLElement) => {
    if (target) lastTrigger = target;
    else lastTrigger = document.getElementById(`map-record-${id}`);
    if (pinnedId() === id) { close(); return; }
    model.selectedId.set(id);
    previewId.set(null);
    pinnedId.set(id);
  }, 'atlas.landing.activate');
  const selectOnMap = action((id: string) => {
    activate(id);
    const row = document.getElementById(`map-record-${id}`);
    const list = row?.closest('.atlas-list');
    if (!row || !list || list.scrollHeight <= list.clientHeight) return;
    const rowBounds = row.getBoundingClientRect();
    const listBounds = list.getBoundingClientRect();
    if (rowBounds.top < listBounds.top) list.scrollTop += rowBounds.top - listBounds.top;
    else if (rowBounds.bottom > listBounds.bottom) list.scrollTop += rowBounds.bottom - listBounds.bottom;
  }, 'atlas.landing.selectOnMap');
  const showCluster = action((ids: string[]) => {
    cluster.set({ ids, filterKey: JSON.stringify(model.filters()) });
  }, 'atlas.landing.showCluster');
  const switchView = action((next: 'map' | 'globe') => {
    view.set(next);
    cluster.set(null);
  }, 'atlas.landing.switchView');
  return () => {
    const filters = model.filters(), projection = view();
    const { records, placements, locatedIds, historical, summaries, estimates } = visibleRecords();
    const selectedId = model.selectedId();
    const selectedHistory = historical.find(item => item.highlight_id === selectedId);
    const summary = summaries.find(item => item.id === selectedId);
    const selected = selectedHistory || summary ? selectedId : null;
    const pinned = pinnedId();
    const clusterIds = cluster()?.ids;
    const clusterRecords = clusterIds ? records.filter(item => clusterIds.includes(item.id)) : [];
    const selectionPlacements = placements.filter(item => placementId(item) === selected);
    const mapProps = { placements, selectedId: selected, estimates, onSelect: wrap(selectOnMap),
      onPreview: wrap((id: string | null) => preview(id)), onCluster: wrap(showCluster) };
    return <section className="landing-page" data-layer={filters.layer} data-selected-id={selected ?? ''}
      onKeyDown={wrap(event => { if (event.key === 'Escape') { if (selected) close(); else cluster.set(null); } })}>
      <div className="atlas-workspace">
        <div className="atlas-main">
          <div className="atlas-masthead"><strong>Атлас потерь</strong><span>1826–2026</span></div>
          <p className="atlas-subtitle">Исторические примеры и конфликты UCDP за 1989–2025 годы</p>
          <div className="atlas-heading"><h1>Человеческие потери в войнах и конфликтах за 200 лет</h1></div>
          <section className="atlas-visual" aria-label="География конфликтов">
            <div className="atlas-view-switch" role="group" aria-label="Вид карты">
              <button type="button" aria-pressed={projection === 'map'} onClick={wrap(() => switchView('map'))}>Карта</button>
              <button type="button" aria-pressed={projection === 'globe'} onClick={wrap(() => switchView('globe'))}>Глобус</button>
              <a className="atlas-jump" href="#conflict-list" onClick={scrollToSection}>К реестру</a>
            </div>
            <div className="atlas-map-frame">
              {projection === 'map' ? <FlatMap {...mapProps} /> : <GlobeView {...mapProps} />}
              {clusterRecords.length > 1 ? <section className="marker-cluster" role="region" aria-label="Конфликты у выбранной метки">
                <div><h2>У этой метки: {clusterRecords.length}</h2><button type="button" className="text-button" aria-label="Закрыть список метки"
                  onClick={wrap(() => cluster.set(null))}>×</button></div>
                <p>У записей общий ориентир. Цвет показывает наибольшую полную оценку UCDP среди них.</p>
                <ul>{clusterRecords.map(record => <li key={record.id}><button type="button" data-cluster-member={record.id} aria-pressed={pinned === record.id}
                  onPointerEnter={wrap(event => { if (event.pointerType === 'mouse') preview(record.id, event.currentTarget); })}
                  onFocus={wrap(event => preview(record.id, event.currentTarget))}
                  onClick={wrap(event => activate(record.id, event.currentTarget))}>
                  {record.name}<small>ID {record.id} · {record.years}</small></button></li>)}</ul>
              </section> : null}
              {(selectedHistory || summary) ? <aside className="globe-callout" aria-label="Выбранный конфликт">
                {selectedHistory ? <>
                  <h2>{selectedHistory.name_ru}</h2>
                  <p>{selectedHistory.start_year}–{selectedHistory.end_year} · исторический пример</p>
                  <strong>{selectedHistory.display_ru.split(' — ')[0]}</strong>
                  <p className="callout-caveat">{selectedHistory.metric === 'civilian_war_deaths' ? 'Гражданские потери' : 'Историческая оценка по источнику'}</p>
                </> : summary ? <>
                  <h2>{summary.name}</h2>
                  <p>{summary.firstObservedYear}–{summary.lastObservedYear} · UCDP</p>
                  <strong>{formatEstimate(summary.best)}</strong>
                  <p className="callout-caveat">Смерти, связанные с боями, за весь доступный период{summary.missingCounts.best ? ' · неполная оценка' : ''}</p>
                </> : null}
                <a href="#selected-detail" onClick={wrap(event => {
                  if (selected && !pinned) activate(selected);
                  scrollToSection(event);
                })}>Источник и оговорки</a>
                <button type="button" className="text-button" aria-label="Закрыть карточку" onClick={wrap(close)}>Закрыть</button>
              </aside> : null}
            </div>
            <div className="atlas-legend">
              <strong>Условные обозначения</strong>
              <ul>
                <li><span className="atlas-legend-marker is-history" style={{ color: historyMarkerColor }} />Исторические примеры</li>
                <li><span className="atlas-legend-marker is-unknown" style={{ color: unknownMarkerColor }} />UCDP без полной оценки</li>
                <li><span className="atlas-legend-marker is-cluster" style={{ color: clusterMarkerColor }} aria-hidden="true">2</span>Несколько записей в одной точке</li>
              </ul>
              <div className="atlas-legend-scale"><span>UCDP · смерти, связанные с боями</span><ul>
                {battleDeathBins.map(bin => <li key={bin.min}><span className="atlas-legend-marker"
                  style={{ backgroundColor: bin.color, width: bin.radius * 2, height: bin.radius * 2 }} />{bin.label}</li>)}
              </ul></div>
            </div>
            <div className="atlas-coverage">
              <p data-testid="map-coverage" role="status">{locatedIds.size} из {records.length} на карте · {records.length - locatedIds.size} без метки</p>
              <p>Метки условны <span aria-hidden="true">·</span> <a href="#reading-guide" onClick={scrollToSection}>Как читать данные</a></p>
            </div>
          </section>
        </div>
        <aside id="conflict-list" className="atlas-registry" role="region" aria-labelledby="atlas-registry-title" tabIndex={-1}>
          <h2 id="atlas-registry-title">Реестр событий</h2>
          <label className="atlas-search"><span className="sr-only">Поиск по названию, региону, стране</span>
            <input type="search" value={filters.query} placeholder="Поиск по названию, региону, стране"
              onChange={wrap(event => model.query.set(event.currentTarget.value))} />
          </label>
          <div className="atlas-source-filters" role="group" aria-label="Источник записей">
            {sources.map(source => <button type="button" key={source.value} aria-pressed={filters.layer === source.value}
              onClick={wrap(() => model.switchLayer(source.value))}>{source.label}</button>)}
          </div>
          <div className="atlas-period" role="group" aria-label="Период">
            <span>Период</span>
            <label><span className="sr-only">Год, от</span><select value={filters.from}
              onChange={wrap(event => model.from.set(Number(event.currentTarget.value)))}>
              {years.filter(year => year <= filters.to).map(year => <option key={year}>{year}</option>)}
            </select></label>
            <span aria-hidden="true">–</span>
            <label><span className="sr-only">Год, до</span><select value={filters.to}
              onChange={wrap(event => model.to.set(Number(event.currentTarget.value)))}>
              {years.filter(year => year >= filters.from).map(year => <option key={year}>{year}</option>)}
            </select></label>
          </div>
          <p className="atlas-period-note" data-testid="map-period">{model.periodNote()}</p>
          <ul className="atlas-list">{records.map(record => <li key={record.id} className="atlas-row" data-selected={selected === record.id}>
            <button type="button" id={`map-record-${record.id}`} data-conflict-id={record.id} aria-pressed={pinned === record.id}
              onPointerEnter={wrap(event => { if (event.pointerType === 'mouse') preview(record.id, event.currentTarget); })}
              onFocus={wrap(event => preview(record.id, event.currentTarget))} onClick={wrap(event => activate(record.id, event.currentTarget))}>
              <span className="atlas-row-name">{record.name}</span>
              <span className={`atlas-source-badge ${record.history ? 'is-history' : 'is-ucdp'}`}>{record.history ? 'Исторический' : 'UCDP'}</span>
              <span className="atlas-row-meta">{record.years}{locatedIds.has(record.id) ? '' : ' · Без метки на карте'}</span>
            </button>
          </li>)}</ul>
          {!records.length ? <p className="empty-state">Ничего не найдено. Измените период или поиск.</p> : null}
        </aside>
      </div>
      <div id="selected-detail" tabIndex={selected ? -1 : undefined}><ConflictDetails historical={selectedHistory} summary={summary} placements={selectionPlacements} onClose={close} /></div>
      <section id="reading-guide" className="source-definitions" tabIndex={-1}><h2>Как читать данные</h2>
        <div className="glossary"><div><h3>Разные числа — разный охват</h3><p>UCDP — Уппсальская программа данных о конфликтах: смерти в боевых действиях. Исторические карточки используют определения своих авторов. Они не складываются в общий итог.</p></div>
          <div><h3>Размер и цвет метки</h3><p>Круги UCDP показывают диапазон лучшей оценки за весь доступный период конфликта. Светлый ромб отмечает исторический пример. Если у записей общий ориентир, цвет кольца показывает наибольшую полную оценку UCDP среди них. На плоской карте внутри кольца указано число записей.</p></div>
          <div><h3>Время — способ найти конфликт</h3><p>{model.periodNote()} Нижняя и верхняя оценки UCDP — варианты источника, не доверительный интервал.</p></div>
          <div><h3>География — условный ориентир</h3><p>Мировые войны показаны символическими метками в Европе. Они не сводятся к одной стране. Неизвестное размещение остаётся в списке; потери по странам не рассчитываются.</p></div></div>
        <p className="map-attribution">Схема суши: <a href="https://www.naturalearthdata.com/">Natural Earth</a>, public domain. <a href="/licenses/ATTRIBUTION.md" rel="external">Источники, версии и лицензии</a>.</p>
      </section>
    </section>;
  };
}, 'AtlasLanding');
