import { action, atom, computed, withComputed, wrap } from '@reatom/core';
import { reatomFactoryComponent } from '@reatom/react';
import { atlasData } from '../app/routes';
import type { AtlasModel } from '../model/atlas';
import { ConflictDetails } from './ConflictDetails';
import { GlobeView } from './GlobeView';
import { formatEstimate } from './VirtualTable';
import './styles.css';

export const Landing = reatomFactoryComponent<{ model: AtlasModel }>(({ model }) => {
  const data = atlasData()!;
  const placementId = (item: (typeof data.placements)[number]) => 'conflict_id' in item ? item.conflict_id : item.highlight_id;
  const visibleRecords = computed(() => {
    const records = model.filters().layer === 'history'
      ? model.historicalHighlights().map(item => ({ id: item.highlight_id, name: item.name_ru, years: `${item.start_year}–${item.end_year}` }))
      : model.summaries().map(item => ({ id: item.id, name: item.name, years: `${item.firstObservedYear}–${item.lastObservedYear}` }));
    const ids = new Set(records.map(item => item.id));
    const placements = data.placements.filter(item => ids.has(placementId(item)));
    const locatedIds = new Set(placements.filter(item => item.latitude !== null).map(placementId));
    return { records, placements, locatedIds };
  }, 'atlas.landing.visibleRecords');
  // URL identity remains the visible record. Local interaction state distinguishes
  // an initial/hover/focus preview from a deliberate click/Enter/tap pin.
  const previewId = atom<string | null>(() => model.selectedId(), 'atlas.landing.previewId')
    .extend(withComputed(id => id === model.selectedId() ? id : null));
  const pinnedId = atom<string | null>(null, 'atlas.landing.pinnedId')
    .extend(withComputed(id => id === model.selectedId() ? id : null));
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
  const showCluster = action((ids: string[]) => {
    cluster.set({ ids, filterKey: JSON.stringify(model.filters()) });
  }, 'atlas.landing.showCluster');
  return () => {
    const filters = model.filters(), history = filters.layer === 'history';
    const historical = history ? model.historicalHighlights() : [];
    const summaries = history ? [] : model.summaries();
    const { records, placements, locatedIds } = visibleRecords();
    const placed = locatedIds.size;
    const selected = model.selectedId();
    const pinned = pinnedId();
    const clusterRecords = records.filter(item => cluster()?.ids.includes(item.id));
    const selectedHistory = history ? historical.find(item => item.highlight_id === selected) : undefined;
    const summary = history ? undefined : summaries.find(item => item.id === selected);
    const selectionPlacements = placements.filter(item => placementId(item) === selected);
    const shortValue = selectedHistory?.display_ru.split(' — ')[0];
    return <section className="landing-page" data-layer={filters.layer} data-selected-id={selected ?? ''}
      onKeyDown={wrap(event => { if (event.key === 'Escape') { if (selected) close(); else cluster.set(null); } })}>
      <div className="landing-hero">
        <GlobeView placements={placements} selectedId={selected} onSelect={wrap(id => activate(id))}
          onPreview={wrap(id => preview(id))} onCluster={wrap(showCluster)} />
        {clusterRecords.length > 1 ? <section className="marker-cluster" role="region" aria-label="Конфликты у выбранной метки">
          <div><h2>У этой метки: {clusterRecords.length}</h2><button className="text-button" aria-label="Закрыть список метки" onClick={wrap(() => cluster.set(null))}>×</button></div>
          <p>Общий ориентир, отдельные конфликты. Выберите запись; числа не складываются.</p>
          <ul>{clusterRecords.map(record => <li key={record.id}><button data-cluster-member={record.id} aria-pressed={pinned === record.id}
            onPointerEnter={wrap(event => { if (event.pointerType === 'mouse') preview(record.id, event.currentTarget); })}
            onFocus={wrap(event => preview(record.id, event.currentTarget))}
            onClick={wrap(event => activate(record.id, event.currentTarget))}>
            {record.name}<small>ID {record.id} · {record.years}</small></button></li>)}</ul>
        </section> : null}
        <div className="hero-copy">
          <div className="hero-layers" role="tablist" aria-label="Слой глобуса" onKeyDown={wrap(event => {
            if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const index = event.key === 'ArrowRight' || event.key === 'End' ? 1 : 0;
            model.switchLayer(index ? 'ucdp' : 'history');
            event.currentTarget.querySelectorAll<HTMLButtonElement>('button')[index]?.focus();
          })}>
            <button role="tab" aria-selected={history} tabIndex={history ? 0 : -1} aria-controls="conflict-list" onClick={wrap(() => model.switchLayer('history'))}>Исторические примеры</button>
            <button role="tab" aria-selected={!history} tabIndex={history ? -1 : 0} aria-controls="conflict-list" onClick={wrap(() => model.switchLayer('ucdp'))}>UCDP 1989–2025</button>
          </div>
          <h1>За каждой<br />точкой —<br />человеческие<br />жизни.</h1>
          <p className="hero-lead">Исследуйте войны, оценки<br className="desktop-break" /> потерь и источники.</p>
          <a className="hero-cta" href="#conflict-list">Исследовать глобус <span aria-hidden="true">→</span></a>
          <a className="hero-help" href="#reading-guide">Как читать данные</a>
        </div>
        {(selectedHistory || summary) ? <aside className="globe-callout" aria-label="Выбранный конфликт">
          <h2>{selectedHistory?.name_ru ?? summary?.name}</h2>
          <p>{selectedHistory ? `${selectedHistory.start_year}–${selectedHistory.end_year}` : `${summary!.firstObservedYear}–${summary!.lastObservedYear}`}</p>
          <strong>{shortValue ?? formatEstimate(summary!.best)}</strong>
          <p>{history ? selectedHistory?.metric === 'civilian_war_deaths' ? 'Только гражданские · оценка NAM' : selectedHistory?.highlight_id === 'ww1' ? 'Все умершие · оценка NARA' : selectedHistory?.highlight_id === 'us-civil' ? 'Умершие в результате войны · NPS' : 'Все умершие · оценка NAM' : 'Боевые смерти · лучшая оценка UCDP'}</p>
          <p className="callout-caveat">{history ? 'Оценки источников различаются.' : 'За весь доступный ряд источника.'}</p>
          <p className="callout-caveat">{pinned ? 'Закреплено · повторное нажатие закрывает' : 'Предпросмотр · нажмите, чтобы закрепить'}</p>
          <a href="#selected-detail">Источник и оговорки ↗</a>
        </aside> : null}
        <div className="hero-bottom"><div className="timeline">
          <div className="timeline-label"><span>{history ? 'Год начала войны' : 'Первый наблюдаемый год UCDP'}</span><strong>{filters.from}–{filters.to}</strong></div>
          <label><span className="sr-only">Период глобуса, от</span><input type="range" min={history ? 1861 : 1989} max={2025} value={filters.from}
            onChange={wrap(event => model.from.set(Math.min(Number(event.currentTarget.value), filters.to)))} /></label>
          <label><span className="sr-only">Период глобуса, до</span><input type="range" min={history ? 1861 : 1989} max={2025} value={filters.to}
            onChange={wrap(event => model.to.set(Math.max(Number(event.currentTarget.value), filters.from)))} /></label>
          <div className="timeline-ticks"><span>{history ? '1861' : '1989'}</span><span>{history ? '1900' : '2000'}</span><span>{history ? '1950' : '2010'}</span><span>2025</span></div>
        </div><p className="marker-note">Метки условные. Размер не показывает число погибших.</p></div>
      </div>
      <div className="map-context"><p data-testid="map-period">{history ? model.periodNote() : 'Отбор по первому наблюдаемому году UCDP, не по началу войны. Обе границы включены. Числа — за весь доступный срок источника, не только за выбранные годы.'}</p>
        <p>{history ? 'Четыре независимые публикации NARA, NPS и NAM. Разные определения; общего итога нет.' : 'UCDP Battle-Related Deaths 26.1 · боевые смерти, включая гражданских, погибших в ходе боёв; не все последствия войны.'}</p></div>
      <section id="conflict-list" className="map-records" aria-label="Список конфликтов" tabIndex={-1}>
        <div className="map-list-heading"><div><h2>{history ? 'Четыре войны. Четыре публикации.' : 'Конфликты в источнике'}</h2>
          <p data-testid="map-coverage">{placed} на глобусе · {records.length - placed} без координат · {records.length} всего</p></div>
          <a href={history ? '/data?layer=history' : '/data'}>Все данные и источники <span aria-hidden="true">↗</span></a></div>
        <p className="map-list-note">Метки — условные ориентиры, не места гибели или границы фронтов. Совпадающая метка открывает список отдельных конфликтов. Наведение — предпросмотр; нажатие закрепляет карточку, повторное нажатие закрывает.</p>
        <label className="map-search">{history ? 'Найти исторический пример' : 'Найти конфликт, страну или участника'}<input type="search" value={filters.query}
          onChange={wrap(event => model.query.set(event.currentTarget.value))} placeholder="Поиск по исходным данным" /></label>
        <div className={history ? 'map-record-grid' : 'map-record-grid modern-records'}>{records.map(record => {
          const located = locatedIds.has(record.id);
          return <button key={record.id} id={`map-record-${record.id}`} data-conflict-id={record.id} className={selected === record.id ? 'selected' : ''}
            aria-pressed={pinned === record.id} onPointerEnter={wrap(event => { if (event.pointerType === 'mouse') preview(record.id, event.currentTarget); })}
            onFocus={wrap(event => preview(record.id, event.currentTarget))} onClick={wrap(event => activate(record.id, event.currentTarget))}>
            <span className="record-years">{record.years}</span><span className="record-name">{record.name}</span><span className="record-place">{located ? 'Условная метка' : 'Без координат'}{history ? '' : ` · ID ${record.id}`}</span></button>;
        })}</div>
        {!records.length ? <p className="empty-state">Ничего не найдено. Измените период или поиск.</p> : null}
      </section>
      <div id="selected-detail"><ConflictDetails historical={selectedHistory} summary={summary} placements={selectionPlacements} onClose={close} /></div>
      <section id="reading-guide" className="source-definitions"><h2>Как читать данные</h2>
        <div className="glossary"><div><h3>Разные числа — разный охват</h3><p>UCDP — Уппсальская программа данных о конфликтах: смерти в боевых действиях. Исторические карточки используют определения своих авторов. Они не складываются в общий итог.</p></div>
          <div><h3>Источник важнее размера точки</h3><p>NAM — Национальный музей армии Великобритании; NARA — Национальные архивы США; NPS — Служба национальных парков США. «Около», «более» и «не менее» сохраняют смысл публикации.</p></div>
          <div><h3>Время — способ найти конфликт</h3><p>{model.periodNote()} Нижняя и верхняя оценки UCDP — варианты источника, не доверительный интервал.</p></div>
          <div><h3>География — условный ориентир</h3><p>Мировые войны показаны символическими метками в Европе. Они не сводятся к одной стране. Неизвестное размещение остаётся в списке; потери по странам не рассчитываются.</p></div></div>
        <p className="map-attribution">Схема суши: <a href="https://www.naturalearthdata.com/">Natural Earth</a>, public domain. <a href="/licenses/ATTRIBUTION.md" rel="external">Источники, версии и лицензии</a>.</p>
      </section>
    </section>;
  };
}, 'AtlasLanding');
