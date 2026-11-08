import { h } from '@reatom/jsx';
import { copy, formatPeriod, type Locale } from '@/i18n/atlas-copy';

type YearRange = Readonly<{ from: number; to: number }>;

export function PeriodSlider({ limits, selected, onSelect, locale }: {
  limits: YearRange;
  selected: () => YearRange;
  onSelect: (range: YearRange) => void;
  locale: Locale;
}) {
  const text = copy[locale];
  const span = limits.to - limits.from;
  let rail: HTMLDivElement;
  let drag: { id: number; x: number; width: number; range: YearRange } | null = null;
  const yearLabel = () => {
    const range = selected();
    return range.from === limits.from && range.to === limits.to ? text.mapAllYears : formatPeriod(range);
  };

  function moveRange(range: YearRange, shift: number) {
    const length = range.to - range.from;
    const from = Math.max(limits.from, Math.min(limits.to - length, range.from + shift));
    onSelect({ from, to: from + length });
  }

  function setEndpoint(event: Event, endpoint: keyof YearRange) {
    const input = event.currentTarget as HTMLInputElement;
    const current = selected();
    const value = endpoint === 'from' ? Math.min(input.valueAsNumber, current.to)
      : Math.max(input.valueAsNumber, current.from);
    // Native inputs change first, so restore their DOM value when the other handle limits the move.
    if (input.valueAsNumber !== value) input.valueAsNumber = value;
    onSelect({ ...current, [endpoint]: value });
  }

  function moveWithKeyboard(event: KeyboardEvent) {
    const range = selected();
    const shift = event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1
      : event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1
      : event.key === 'Home' ? limits.from - range.from
      : event.key === 'End' ? limits.to - range.to : null;
    if (shift === null) return;
    event.preventDefault();
    moveRange(range, shift);
  }

  function startDrag(event: PointerEvent) {
    if (!event.isPrimary || event.button !== 0) return;
    const width = rail.getBoundingClientRect().width;
    if (width <= 0) return;
    (event.currentTarget as HTMLButtonElement).setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX, width, range: selected() };
  }

  function updateDrag(event: PointerEvent) {
    if (drag?.id !== event.pointerId) return;
    moveRange(drag.range, Math.round((event.clientX - drag.x) * span / drag.width));
  }

  function finishDrag(event: PointerEvent) {
    if (drag?.id === event.pointerId) drag = null;
  }

  return (
    <div class="atlas-period" role="group" aria-labelledby="atlas-period-label">
      <div class="atlas-period__title">
        <span id="atlas-period-label">{text.mapPeriod}</span>
        <output id="atlas-period-value" aria-live="off" for="atlas-period-range atlas-period-range-end">{yearLabel}</output>
      </div>
      <div class="atlas-period__track">
        <div class="atlas-year-range" data-tight={() => selected().to - selected().from <= 2 ? 'true' : undefined}>
          <input id="atlas-period-range" class="atlas-sprite-range atlas-year-range__start" type="range"
            min={limits.from} max={limits.to} value={() => selected().from.toString()}
            aria-label={text.mapPeriodStart}
            on:input={event => setEndpoint(event, 'from')} />
          <div class="atlas-year-range__rail" ref={element => { rail = element; }}
            style={() => `--range-start:${(selected().from - limits.from) * 100 / (span || 1)}%;--range-end:${(limits.to - selected().to) * 100 / (span || 1)}%`}>
            <button class="atlas-year-range__window" type="button" aria-label={text.mapMovePeriod} title={text.mapMovePeriod}
              aria-describedby="atlas-period-value atlas-period-move-help"
              on:keydown={moveWithKeyboard} on:pointerdown={startDrag} on:pointermove={updateDrag}
              on:pointerup={finishDrag} on:pointercancel={finishDrag} on:lostpointercapture={finishDrag} />
          </div>
          <input id="atlas-period-range-end" class="atlas-sprite-range atlas-year-range__end" type="range"
            min={limits.from} max={limits.to} value={() => selected().to.toString()}
            aria-label={text.mapPeriodEnd}
            on:input={event => setEndpoint(event, 'to')} />
        </div>
        <div class="atlas-period__ticks" aria-hidden="true">
          <span>{limits.from}</span><span>{limits.to}</span>
        </div>
        <span id="atlas-period-move-help" hidden>{text.mapMovePeriodHelp}</span>
      </div>
    </div>
  );
}
