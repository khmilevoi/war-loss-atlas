import { reatomComponent } from '@reatom/react';
import { wrap } from '@reatom/core';
import type { AtlasModel } from '../model/atlas';

/** Deterministic SSR snapshot; Task4 replaces it with the measured virtual window. */
export const INITIAL_ROW_COUNT = 12;
type Props = { model: AtlasModel };

const SourceContent = reatomComponent(({ model }: Props) => {
  const filters = model.filters();
  if (filters.layer === 'history') return <ul>{model.historicalHighlights().map(item => <li key={item.highlight_id}>
    <button onClick={wrap(() => model.selectConflict(item.highlight_id))}>{item.name_ru}</button>
    <p>{item.start_year}–{item.end_year}: {item.display_ru}</p><p>{item.scope_ru}</p>
    <p>{item.uncertainty_ru}</p><a href={item.source_url}>{item.source_title}</a>
  </li>)}</ul>;
  const rows = model.filteredRows();
  return <>
    <p>{rows.length} исходных строк. Оценки относятся к конфликту за весь доступный период источника.</p>
    <table aria-label="Исходные строки UCDP" aria-rowcount={rows.length + 1}>
      <thead><tr aria-rowindex={1}><th scope="col">Конфликт</th><th scope="col">Год</th>
        <th scope="col">Основная оценка</th><th scope="col">Нижняя</th><th scope="col">Верхняя</th></tr></thead>
      <tbody>{rows.slice(0, INITIAL_ROW_COUNT).map((row, index) => <tr key={`${row.conflict_id}:${row.year}`}
        data-row-id={`${row.conflict_id}:${row.year}`} aria-rowindex={index + 2}>
        <td><button onClick={wrap(() => model.selectConflict(row.conflict_id))}>{row.location_inc ?? row.conflict_id}</button></td>
        <td>{row.year}</td><td>{row.bd_best ?? 'Нет данных'}</td><td>{row.bd_low ?? 'Нет данных'}</td><td>{row.bd_high ?? 'Нет данных'}</td>
      </tr>)}</tbody>
    </table>
    {!rows.length ? <p role="status">Нет строк по выбранным условиям.</p> : null}
    <p>Источник: <a href="https://ucdp.uu.se/downloads/">UCDP Battle-Related Deaths 26.1</a>, 1989–2025. CC BY 4.0.
      Исходные строки сгруппированы по конфликту; списки диад и условные метки не размножают значения. Нижняя и верхняя оценки — не доверительный интервал.</p>
  </>;
}, 'AtlasSourceContent');

const PageBody = reatomComponent(({ model, heading }: Props & { heading: string }) => {
  const filters = model.filters();
  return <section data-layer={filters.layer} data-selected-id={model.selectedId() ?? ''}>
    <h1>{heading}</h1>
    <p>{filters.layer === 'ucdp' ? 'UCDP: смерти, связанные с боевыми действиями' : 'Четыре независимые исторические карточки'}</p>
    <p>{model.periodNote()}</p>
    <label>Поиск <input type="search" value={filters.query} onChange={wrap(event => model.query.set(event.currentTarget.value))} /></label>
    <SourceContent model={model} />
  </section>;
}, 'AtlasPageBody');

export const Landing = ({ model }: Props) => <PageBody model={model} heading="Человеческая цена войн" />;
export const DataPage = ({ model }: Props) => <PageBody model={model} heading="Данные и расчёты" />;
