import { atom, wrap } from '@reatom/core';
import { reatomFactoryComponent } from '@reatom/react';
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual';
import { useLayoutEffect, useRef } from 'react';
import type { NativeRow } from '../data/types';

export const nativeRowKey = (row: NativeRow): string => `${row.conflict_id}:${row.year}`;
export const formatEstimate = (value: number | null): string => value === null ? 'Нет данных' : value.toLocaleString('ru-RU');
const ROW_HEIGHT = 64;
const HEADER_HEIGHT = 48;
// The server and the first client render use exactly the same window.
const INITIAL_RECT = { width: 1200, height: 256 };
type Props = { rows: readonly NativeRow[]; selectedId: string | null; onSelect: (id: string) => void };

export const VirtualTable = reatomFactoryComponent<Props>(() => {
  const activeRowId = atom<string | null>(null, 'atlas.table.activeRowId');
  return ({ rows, selectedId, onSelect }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const buttons = useRef(new Map<string, HTMLButtonElement>());
    const pendingFocus = useRef<string | null>(null);
    const focusedRow = useRef(false);
    const previousRows = useRef(rows);
    const activeKey = activeRowId();
    const foundIndex = rows.findIndex(row => nativeRowKey(row) === activeKey);
    const activeIndex = Math.max(0, foundIndex);
    const virtualizer = useVirtualizer<HTMLDivElement, HTMLTableRowElement>({
      count: rows.length,
      getScrollElement: () => scrollRef.current,
      getItemKey: index => nativeRowKey(rows[index]),
      estimateSize: () => ROW_HEIGHT,
      overscan: 8,
      initialRect: INITIAL_RECT,
      scrollMargin: HEADER_HEIGHT,
      scrollPaddingStart: HEADER_HEIGHT,
      useFlushSync: false,
      rangeExtractor: range => {
        const indexes = defaultRangeExtractor(range);
        // Keep the actual focused control mounted during pointer scrolling.
        if (focusedRow.current && rows.length && !indexes.includes(activeIndex)) indexes.push(activeIndex);
        return indexes.sort((a, b) => a - b);
      },
    });
    // This effect owns DOM scroll/focus only; rows and filters stay in Reatom.
    useLayoutEffect(() => {
      if (previousRows.current !== rows) {
        previousRows.current = rows;
        virtualizer.scrollToIndex(focusedRow.current ? activeIndex : 0, { align: 'start' });
      }
      const key = pendingFocus.current;
      const button = key ? buttons.current.get(key) : undefined;
      if (button) {
        pendingFocus.current = null;
        button.focus({ preventScroll: true });
      }
    });
    const moveFocus = (index: number) => {
      if (!rows.length) return;
      const next = Math.max(0, Math.min(index, rows.length - 1));
      const key = nativeRowKey(rows[next]);
      pendingFocus.current = key;
      focusedRow.current = true;
      activeRowId.set(key);
      virtualizer.scrollToIndex(next, { align: next === rows.length - 1 ? 'end' : 'auto' });
      // Already mounted rows need no range update to receive focus.
      const button = buttons.current.get(key);
      if (button) { pendingFocus.current = null; button.focus({ preventScroll: true }); }
    };
    return <>
      <p id="table-keyboard" className="sr-only">Стрелки вверх и вниз перемещают фокус. Home и End — первая и последняя запись. Enter открывает подробности. Escape закрывает их.</p>
      <div id="source-table" className="table-scroll" ref={scrollRef} role="region" aria-label="Таблица исходных данных"
        aria-describedby="table-keyboard" tabIndex={0}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) focusedRow.current = false; }}
        onKeyDown={wrap(event => {
          const next = event.key === 'End' ? rows.length - 1 : event.key === 'Home' ? 0
            : event.key === 'ArrowDown' ? activeIndex + 1 : event.key === 'ArrowUp' ? activeIndex - 1 : null;
          if (next !== null) { event.preventDefault(); moveFocus(next); }
          else if (event.key === 'Enter' && event.target === event.currentTarget && rows[activeIndex]) {
            event.preventDefault(); onSelect(nativeRowKey(rows[activeIndex]));
          }
        })}>
        <table aria-label="Исходные строки UCDP" aria-rowcount={rows.length + 1}>
          <thead><tr aria-rowindex={1}>
            <th scope="col">Конфликт</th><th scope="col">Год</th><th scope="col">Лучшая оценка</th>
            <th scope="col">Нижняя</th><th scope="col">Верхняя</th><th scope="col">Место по источнику</th><th scope="col">Источник / полнота</th>
          </tr></thead>
          <tbody style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map(item => {
              const row = rows[item.index];
              const key = nativeRowKey(row);
              const missing = [row.bd_best, row.bd_low, row.bd_high].filter(value => value === null).length;
              return <tr key={key} data-row-id={key} aria-rowindex={item.index + 2}
                className={selectedId === key ? 'is-selected' : undefined}
                style={{ position: 'absolute', height: ROW_HEIGHT, transform: `translateY(${item.start - HEADER_HEIGHT}px)`, width: '100%' }}>
                <td><button ref={node => { if (node) buttons.current.set(key, node); else buttons.current.delete(key); }}
                  className="row-open" tabIndex={item.index === activeIndex ? 0 : -1}
                  title={`${row.location_inc ?? 'Конфликт'} · ${row.side_a ?? ''} — ${row.side_b ?? ''} · ID ${row.conflict_id}`}
                  aria-label={`${row.location_inc ?? 'Конфликт'} · ${row.year} · открыть все поля`}
                  onFocus={wrap(() => { focusedRow.current = true; activeRowId.set(key); })}
                  onClick={wrap(() => onSelect(key))}>
                  <span>{row.location_inc ?? `Конфликт ${row.conflict_id}`}</span><small>ID {row.conflict_id} · {row.side_b ?? row.side_a ?? 'Участник не указан'}</small>
                </button></td>
                <td>{row.year}</td><td className="estimate">{formatEstimate(row.bd_best)}</td>
                <td>{formatEstimate(row.bd_low)}</td><td>{formatEstimate(row.bd_high)}</td>
                <td title={row.battle_location ?? 'Нет данных'}>{row.battle_location ?? 'Нет данных'}</td>
                <td><span>UCDP {row.version}</span><small>{missing === 0 ? 'Все 3 оценки' : missing === 3 ? 'Нет оценок' : 'Часть оценок'}</small></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      {!rows.length ? <div role="status" className="empty-state"><h2>Ничего не найдено</h2><p>Измените поиск, период или полноту оценок либо сбросьте фильтры.</p></div> : null}
      <p className="table-caption">Показаны видимые строки. Поиск работает по всему набору. Оценки в таблице — число умерших за указанный год; CSV содержит всю выборку.</p>
    </>;
  };
}, 'AtlasVirtualTable');
