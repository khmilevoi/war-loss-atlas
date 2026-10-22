import { wrap } from '@reatom/core';
import { reatomComponent } from '@reatom/react';
import { NATIVE_FIELDS, type ConflictSummary, type HistoricalHighlight, type NativeRow, type Placement } from '../data/types';
import { formatEstimate } from './VirtualTable';

type Props = { row?: NativeRow | null; summary?: ConflictSummary | null; historical?: HistoricalHighlight | null;
  placements?: readonly Placement[]; onClose: () => void };
const fieldLabels: Record<typeof NATIVE_FIELDS[number], string> = {
  conflict_id: 'ID конфликта', dyad_id: 'ID диад (список)', location_inc: 'Название / место конфликта',
  side_a: 'Сторона A', side_a_id: 'ID стороны A', side_a_2nd: 'Вторичные участники A', side_b: 'Сторона B',
  side_b_id: 'ID стороны B', side_b_2nd: 'Вторичные участники B', incompatibility: 'Предмет противоречия (код)',
  territory_name: 'Территория', year: 'Год', bd_best: 'Лучшая оценка', bd_low: 'Нижняя оценка', bd_high: 'Верхняя оценка',
  type_of_conflict: 'Тип конфликта (код)', battle_location: 'Место боевых действий', gwno_a: 'Коды стран A',
  gwno_a_2nd: 'Коды вторичных стран A', gwno_b: 'Коды стран B', gwno_b_2nd: 'Коды вторичных стран B',
  gwno_loc: 'Коды места конфликта', gwno_battle: 'Коды места боёв', region: 'Регион (код)', version: 'Версия',
};

/** Independent of the virtual row lifetime; also reusable by the map/list page. */
export const ConflictDetails = reatomComponent(({ row, summary, historical, placements, onClose }: Props) => {
  if (!row && !historical) return null;
  return <section className="conflict-details" role="region" aria-label="Подробности записи"
    onKeyDown={wrap(event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } })}>
    <div className="details-heading"><h2>{historical?.name_ru ?? `${row!.location_inc ?? 'Конфликт'} · ${row!.year}`}</h2>
      <button className="text-button" onClick={wrap(onClose)} aria-label="Закрыть подробности">Закрыть <span aria-hidden="true">×</span></button></div>
    {historical ? <>
      <p className="detail-value">{historical.display_ru}</p><p>{historical.start_year}–{historical.end_year} · {historical.scope_ru}</p>
      <p>{historical.uncertainty_ru}</p><p><a href={historical.source_url}>{historical.source_title}</a><br />{historical.source_locator} · Проверено {historical.accessed_on}</p>
    </> : <>
      <p>Исходная запись UCDP {row!.version}. Все 25 полей сохранены; английские названия и коды оставлены как в источнике.</p>
      {summary ? <p>Конфликт ID {summary.id}: первый наблюдаемый год {summary.firstObservedYear}, последний {summary.lastObservedYear}.
        За весь доступный ряд: {formatEstimate(summary.best)} умерших (лучшая оценка); нижняя {formatEstimate(summary.low)}, верхняя {formatEstimate(summary.high)}.
        Это весь срок источника, а не сумма только за выбранные годы. Пропуски best / low / high: {summary.missingCounts.best} / {summary.missingCounts.low} / {summary.missingCounts.high}.</p> : null}
      <dl className="native-fields">{NATIVE_FIELDS.map(field => <div key={field} data-native-field={field}>
        <dt>{fieldLabels[field]} <code>{field}</code></dt><dd>{row![field] === null ? field.startsWith('bd_') ? 'Нет числовой оценки' : 'Пустое поле источника' : row![field] === '' ? 'Пустое поле источника' : String(row![field])}</dd>
      </div>)}</dl>
      <p><a href="https://ucdp.uu.se/downloads/">UCDP Battle-Related Deaths 26.1</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>.
        Боевые смерти, включая гражданских, погибших в ходе боевых действий; не все последствия войны. Нижняя и верхняя оценки — не доверительный интервал.</p>
    </>}
    {placements?.length ? <details><summary>Условное географическое размещение</summary>{placements.map(placement => <p key={placement.placement_id}>
      {placement.label_ru} · точность: {placement.precision === 'unknown' ? 'неизвестна, без координат' : 'условный регион'}.
      Основание: {placement.basis}. <a href={placement.source_url}>Источник размещения</a></p>)}</details> : null}
  </section>;
}, 'AtlasConflictDetails');
