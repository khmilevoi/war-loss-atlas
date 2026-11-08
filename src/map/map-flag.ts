const svgNamespace = 'http://www.w3.org/2000/svg';

export type MapFlagKind = 'estimate' | 'history' | 'unknown';

const rolled = [
  ['#2a0711', 'M1 0h5v1h4v1h2v7h-2v2H6v5H1Z'],
  ['#af917e', 'M2 1h2v14H2z'],
  ['#e9cf9f', 'M2 1h1v13H2z'],
  ['#b69a80', 'M4 2h5v1h2v5H9v2H4z'],
  ['#f6e6c8', 'M4 2h4v1h2v2H7v1H6v2H4z'],
  ['#d7ba98', 'M7 5h2v3H7z'],
] as const;

const pole = [
  ['#2a0711', 'M0 0h6v51H0z'],
  ['#ae9588', 'M2 1h3v49H2z'],
  ['#f0dfc9', 'M2 1h1v48H2z'],
] as const;

// Resting pennants remain distinct from the expanded flag at the map's overview zoom.
const pennant = [
  ['#260a10', 'M1 1h11v1h2v2h2v3h-2v2h-3v1H5v6H1z'],
  ['#e5c395', 'M2 2h1v13H2z'],
  ['var(--pennant-cloth, #d89c66)', 'M4 2h8v1h2v2h1v1h-2v2h-3v1H4z'],
  ['#f4cd9a', 'M4 2h7v1H5v5H4z'],
] as const;

const cloth = [
  ['#2a0711', 'M4 2h12v2h10v3h8v3h5v3h3v7h-5v3h-8v3H18v-2H4z'],
  ['#dfc8ad', 'M5 3h11v2h10v3h8v3h5v3h2v5h-5v3h-8v3H19v-2H5z'],
  ['#f7e8cf', 'M5 4h10v2h10v3h8v3h5v3h2v3h-5v1h-9v3H19v-2H5z'],
  ['#c6a591', 'M6 20h13v2h9v1h-9v-1H6z'],
] as const;

const emblems = {
  history: ['#ffe1a4', 'M12 8h1v1h1v1h-1v1h-1v-1h-1V9h1z'],
  unknown: ['#614c61', 'M5 4h4v2H5z'],
} as const;

const pennantEmblems = {
  history: ['#552923', 'M8 3h1v1h1v1h1v1h-1v1H9v1H8V7H7V6H6V5h1V4h1z'],
  unknown: ['#552923', 'M7 3h4v3H9v1H8V5h2V4H7zM8 8h1v1H8z'],
} as const;

function addPaths(parent: SVGElement, paths: readonly (readonly [string, string])[]) {
  for (const [fill, data] of paths) {
    const path = document.createElementNS(svgNamespace, 'path');
    path.setAttribute('fill', fill);
    path.setAttribute('d', data);
    parent.append(path);
  }
}

export function MapFlag({ raised = false, desktop = false, kind = 'estimate' }: {
  raised?: boolean; desktop?: boolean; kind?: MapFlagKind;
}) {
  const icon = document.createElementNS(svgNamespace, 'svg');
  icon.setAttribute('class', raised ? 'flag-icon' : desktop ? 'map-flag-pennant' : 'map-flag-rolled');
  icon.setAttribute('viewBox', raised ? '0 0 44 51' : '0 0 16 16');
  icon.setAttribute('width', raised ? '44' : '16');
  icon.setAttribute('height', raised ? '51' : '16');
  icon.setAttribute('shape-rendering', 'crispEdges');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');
  if (raised) {
    for (const [name, paths] of [['pole', pole], ['cloth', cloth]] as const) {
      const part = document.createElementNS(svgNamespace, 'g');
      part.setAttribute('class', `flag-icon__${name}`);
      addPaths(part, paths);
      icon.append(part);
    }
  } else {
    addPaths(icon, desktop ? pennant : rolled);
    if (kind !== 'estimate') addPaths(icon, [desktop ? pennantEmblems[kind] : emblems[kind]]);
  }
  return icon;
}
