import { atom, clearStack, context } from '@reatom/core';
import { h, mount } from '@reatom/jsx';
import { PeriodSlider } from './period-slider';

const host = document.getElementById('atlas-period-example');
if (host) {
  clearStack();
  context.start(() => {
    const selection = atom({ from: 1939, to: 1945 }, 'showcase.period');
    mount(host, <PeriodSlider limits={{ from: 1861, to: 2025 }} selected={selection}
      onSelect={range => selection.set(range)} locale="ru" />);
  });
}
