import { action, atom, batch, reatomField, withComputed, wrap } from '@reatom/core';
import { reatomFactoryComponent } from '@reatom/react';
import { atlasData } from '../app/routes';
import { toCsv, toHistoricalCsv } from '../data/csv';
import type { AtlasModel } from '../model/atlas';
import { defaultPeriod, normalizeFilters, type Completeness } from '../data/selectors';
import { ConflictDetails } from './ConflictDetails';
import { nativeRowKey, VirtualTable } from './VirtualTable';
import './styles.css';

function downloadCsv(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  // Download has been handed to the browser; no recurring resource remains.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const SearchIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="10.5" cy="10.5" r="7.5" /><path d="m16 16 6 6" /></svg>;
const DownloadIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 2v14m-5-5 5 5 5-5M3 16v6h18v-6" /></svg>;

export const DataPage = reatomFactoryComponent<{ model: AtlasModel }>(({ model }) => {
  // Public URL selection is a raw conflict ID. This view owns the precise native
  // record key, retaining its year when another row of the same conflict opens.
  const data = atlasData()!;
  const historySourceCount = new Set(data.historicalHighlights.map(item => new URL(item.source_url).origin)).size;
  const historySpan = `${Math.min(...data.historicalHighlights.map(item => item.start_year))}–${Math.max(...data.historicalHighlights.map(item => item.end_year))}`;
  const committedPeriod = () => {
    const normalized = normalizeFilters({ layer: model.layer(), from: model.from(), to: model.to(), query: '', sort: 'year:asc' });
    return { from: String(normalized.from), to: String(normalized.to) };
  };
  // Incomplete text is an editable field, not a URL filter. Only a valid pair
  // is committed on blur/Enter; external model/layer changes reset its draft.
  const periodDraft = reatomField(committedPeriod(), {
    name: 'atlas.data.periodDraft',
    keepErrorOnChange: false,
    validate: ({ state }) => {
      const layer = model.layer();
      const normalized = normalizeFilters({ layer, from: Number(state.from), to: Number(state.to), query: '', sort: 'year:asc' });
      if (/^\d{4}$/.test(state.from) && /^\d{4}$/.test(state.to)
        && normalized.from === Number(state.from) && normalized.to === Number(state.to)) return;
      const [min, max] = defaultPeriod(layer);
      return `Период не применён. Введите два года из четырёх цифр от ${min} до ${max}; «от» не должно быть позже «до». Исправьте значения или сбросьте фильтры.`;
    },
  }).extend(withComputed(committedPeriod));
  const commitPeriod = action(() => {
    periodDraft.validation.trigger();
    // The installed field updates its derived error via a queued change hook;
    // the actual synchronous validation errors are available immediately.
    if (periodDraft.validation.errors().length) return;
    const draft = periodDraft();
    // Capture both strings before native URL-backed writes rederive the field.
    batch(() => model.from.set(Number(draft.from)), true);
    batch(() => model.to.set(Number(draft.to)), true);
  }, 'atlas.data.commitPeriod');
  const resetFilters = action(() => {
    model.resetFilters();
    // A dirty invalid draft must reset even if committed filters are defaults.
    periodDraft.reset(committedPeriod());
    periodDraft.validation.clearErrors();
  }, 'atlas.data.resetFilters');
  const selectedRowKey = atom<string | null>(null, 'atlas.data.selectedRowKey').extend(withComputed(previous => {
    const id = model.selectedId();
    if (!id || model.layer() !== 'ucdp') return null;
    return previous && data.nativeRows.some(row => nativeRowKey(row) === previous && row.conflict_id === id)
      ? previous : data.nativeRows.find(row => row.conflict_id === id) ? nativeRowKey(data.nativeRows.find(row => row.conflict_id === id)!) : null;
  }));
  const openRow = action((key: string) => {
    const row = data.nativeRows.find(item => nativeRowKey(item) === key);
    if (!row) return;
    model.selectedId.set(row.conflict_id);
    selectedRowKey.set(key);
  }, 'atlas.data.openRow');
  const closeDetails = action(() => {
    const returnTarget = model.layer() === 'ucdp' ? document.getElementById('source-table')
      : document.getElementById(`history-open-${model.selectedId()}`)
        ?? document.querySelector<HTMLElement>('.layer-tabs [aria-selected="true"]');
    model.selectedId.set(null);
    returnTarget?.focus({ preventScroll: true });
  }, 'atlas.data.closeDetails');
  return () => {
    const filters = model.filters();
    const isNative = filters.layer === 'ucdp';
    const rows = isNative ? model.filteredRows() : [];
    const history = isNative ? [] : model.historicalHighlights();
    const selected = model.selectedId();
    const key = isNative ? selectedRowKey() : null;
    const row = key ? data.nativeRows.find(item => nativeRowKey(item) === key) : null;
    const draft = periodDraft();
    const periodError = periodDraft.validation().error;
    return <section className="data-page" data-layer={filters.layer} data-selected-id={selected ?? ''}
      onKeyDown={wrap(event => { if (event.key === 'Escape' && selected) closeDetails(); })}>
      <div className="data-intro"><h1>Данные за каждой точкой</h1><p>Разные определения потерь нельзя складывать в общий итог.</p></div>
      <dl className="dataset-stats" aria-label={isNative ? 'Охват набора UCDP' : 'Охват исторических примеров'}>
        <div><dt>{isNative ? 'записей' : 'примера'}</dt><dd>{isNative ? '1 650' : data.historicalHighlights.length}</dd></div>
        <div><dt>{isNative ? 'конфликта' : 'основных источника'}</dt><dd>{isNative ? '202' : historySourceCount}</dd></div>
        <div><dt className="sr-only">{isNative ? 'Годы наблюдения' : 'Период четырёх примеров'}</dt><dd>{isNative ? '1989–2025' : historySpan}</dd></div>
      </dl>
      <div className="layer-tabs" role="tablist" aria-label="Набор данных" onKeyDown={wrap(event => {
        const index = event.key === 'ArrowRight' || event.key === 'End' ? 1 : event.key === 'ArrowLeft' || event.key === 'Home' ? 0 : null;
        if (index === null) return;
        event.preventDefault();
        model.switchLayer(index === 0 ? 'ucdp' : 'history');
        event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus();
      })}>
        <button role="tab" tabIndex={isNative ? 0 : -1} aria-selected={isNative} aria-controls="data-panel" onClick={wrap(() => model.switchLayer('ucdp'))}>UCDP: конфликт — год</button>
        <button role="tab" tabIndex={isNative ? -1 : 0} aria-selected={!isNative} aria-controls="data-panel" onClick={wrap(() => model.switchLayer('history'))}>Исторические примеры</button>
      </div>
      <div id="data-panel" role="tabpanel" aria-label={isNative ? 'UCDP: конфликт — год' : 'Исторические примеры'}>
        <div className="data-toolbar">
          <label className="search-field"><span>Поиск по исходным данным</span><div><SearchIcon /><input type="search" value={filters.query} placeholder="Конфликт, страна или участник"
            aria-describedby="search-help" onChange={wrap(event => model.query.set(event.currentTarget.value))} /></div></label>
          <label className="sort-field"><span>Сортировка</span><select value={filters.sort} onChange={wrap(event => model.sort.set(event.currentTarget.value))}>
            <option value="year:asc">По году ↑</option><option value="year:desc">По году ↓</option><option value="name:asc">По названию</option>
            {isNative ? <><option value="bd_best:desc">По лучшей оценке ↓</option><option value="bd_best:asc">По лучшей оценке ↑</option><option value="conflict_id:asc">По ID конфликта</option></> : null}
          </select></label>
          <button className="download-button" disabled={!(isNative ? rows.length : history.length)} onClick={wrap(() => downloadCsv(isNative ? toCsv(rows) : toHistoricalCsv(history), isNative ? 'ucdp-26.1-filtered.csv' : 'historical-sources-filtered.csv'))}><DownloadIcon />Скачать CSV</button>
        </div>
        <p id="search-help" className="search-help">{isNative ? 'Включая участников; показываем все годы найденного конфликта' : 'По названиям, определениям и источникам четырёх независимых примеров'}</p>
        <div className="filter-strip"><div className="period-filter"><span>{isNative ? 'Первый год наблюдения в UCDP' : 'Год начала войны'}</span><div>
          <label><span className="sr-only">{isNative ? 'Первый год наблюдения, от' : 'Год начала войны, от'}</span><input type="number" min={isNative ? 1989 : 1861} max={2025} value={draft.from} aria-describedby="period-help" aria-invalid={!!periodError}
            onChange={wrap(event => { const from = event.currentTarget.value; periodDraft.set(current => ({ ...current, from })); })}
            onBlur={wrap(() => commitPeriod())} onKeyDown={wrap(event => { if (event.key === 'Enter') { event.preventDefault(); commitPeriod(); } })} /></label>
          <span aria-hidden="true">—</span><label><span className="sr-only">{isNative ? 'Первый год наблюдения, до' : 'Год начала войны, до'}</span><input type="number" min={isNative ? 1989 : 1861} max={2025} value={draft.to} aria-describedby="period-help" aria-invalid={!!periodError}
            onChange={wrap(event => { const to = event.currentTarget.value; periodDraft.set(current => ({ ...current, to })); })}
            onBlur={wrap(() => commitPeriod())} onKeyDown={wrap(event => { if (event.key === 'Enter') { event.preventDefault(); commitPeriod(); } })} /></label>
        </div></div>
        {isNative ? <label className="completeness-field"><span>Полнота оценок</span><select value={filters.completeness} onChange={wrap(event => model.completeness.set(event.currentTarget.value as Completeness))}>
          <option value="all">Все записи</option><option value="complete">Все 3 оценки</option><option value="partial">Часть оценок</option><option value="missing">Нет оценок</option></select></label> : null}
        <button className="text-button reset-button" onClick={wrap(() => resetFilters())}>Сбросить фильтры</button>
        <p className="result-count" aria-live="polite">{isNative ? `${rows.length.toLocaleString('ru-RU')} строк · ${model.summaries().length} конфликтов` : `${history.length} независимых примера`}</p></div>
        <p id="period-help" className="search-help" role={periodError ? 'alert' : undefined}>{periodError ?? 'Период применяется по Enter или после выхода из поля.'}</p>
        <p className="period-note">{isNative ? 'Фильтр отбирает конфликты по первому году наблюдения, не по началу войны. Обе границы включены. В таблице остаются все их годы; число в строке относится к указанному году. Карточка показывает сумму за доступный срок.' : model.periodNote()}</p>
        {isNative ? <VirtualTable rows={rows} selectedId={key} onSelect={openRow} /> : <>
          <div className="historical-list">{history.map(item => <article data-history-id={item.highlight_id} key={item.highlight_id}>
            <div><span className="history-years">{item.start_year}–{item.end_year}</span><h2><button id={`history-open-${item.highlight_id}`} onClick={wrap(() => model.selectConflict(item.highlight_id))}>{item.name_ru}</button></h2></div>
            <div><p className="historical-value">{item.display_ru}</p><p>{item.scope_ru}</p><p>{item.uncertainty_ru}</p><a href={item.source_url}>{item.source_title}</a><small>{item.source_locator} · Проверено {item.accessed_on}</small></div>
          </article>)}</div>{!history.length ? <p role="status" className="empty-state">Ничего не найдено. Измените условия или сбросьте фильтры.</p> : null}
        </>}
      </div>
      <ConflictDetails row={row} summary={row ? data.conflicts.find(item => item.id === row.conflict_id) : null}
        historical={!isNative ? data.historicalHighlights.find(item => item.highlight_id === selected) : null}
        placements={data.placements.filter(item => 'conflict_id' in item ? item.conflict_id === selected : item.highlight_id === selected)} onClose={closeDetails} />
      <section className="source-definitions" aria-labelledby="sources-title"><h2 id="sources-title">Источники и определения</h2>
        <div className="source-summary"><div>{isNative ? <><p>UCDP Battle-Related Deaths 26.1 · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a></p><p>1989–2025 — окно наблюдения, а не даты начала всех войн.</p></> : <><p>NARA · National Park Service · National Army Museum</p><p>Четыре самостоятельные публикации о войнах {historySpan}. Охват оценок различается; общего итога нет.</p></>}</div>
          <a className="source-register-link" href="/licenses/ATTRIBUTION.md" rel="external">Реестр источников <span aria-hidden="true">↗</span></a></div>
        <details><summary>Как читать оценки и исходные поля UCDP</summary><dl className="glossary"><div><dt>Лучшая оценка (bd_best)</dt><dd>Основная оценка UCDP числа умерших в боевых действиях за год. Включает участников и гражданских, погибших в ходе боёв; не охватывает все последствия войны.</dd></div>
          <div><dt>Нижняя и верхняя (bd_low, bd_high)</dt><dd>Альтернативные оценки источника, не доверительный интервал. «Нет данных» не означает ноль.</dd></div>
          <div><dt>Конфликт — год</dt><dd>Одна строка на conflict_id и year. Список dyad_id не разворачивается в повторные строки; несколько географических меток не размножают число.</dd></div>
          <div><dt>Полнота оценок</dt><dd>Наличие трёх числовых полей во всём ряду конфликта. Это не оценка достоверности или полноты всех потерь.</dd></div></dl>
          <p>Сохранены все 25 исходных полей. Чтобы увидеть их, откройте любую строку. CSV всей выборки сохраняет английские имена, коды, списки и пропуски. Поиск учитывает все поля, в том числе вторичных участников, которые могут находиться вне места боёв.</p>
          <p>Обработка: импорт разрешённых строк, группировка по конфликту и году, агрегация и условная географическая навигация. Исторические карточки — самостоятельные факты с разными определениями; они не складываются между собой или с UCDP.</p>
          <a href="https://ucdp.uu.se/downloads/">Набор данных и кодбук UCDP</a>
        </details>
      </section>
    </section>;
  };
}, 'AtlasDataPage');
