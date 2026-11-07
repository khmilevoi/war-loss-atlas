import './pixel-icon.css';

const glyphs = {
  close: [
    'M2 2h2v2H2zM4 4h2v2H4zM6 6h2v2H6zM8 8h2v2H8zM10 10h2v2h-2zM12 12h2v2h-2z',
    'M12 2h2v2h-2zM10 4h2v2h-2zM8 6h2v2H8zM6 8h2v2H6zM4 10h2v2H4zM2 12h2v2H2z',
  ],
  plus: ['M7 3h2v10H7z', 'M3 7h10v2H3z'],
  minus: ['M3 7h10v2H3z'],
  sound: [
    'M1 5h4V4h2V2h2v12H7v-2H5v-1H1z',
    'M11 5h2v6h-2zM13 3h2v2h-2zM13 11h2v2h-2z',
  ],
  mute: [
    'M1 5h4V4h2V2h2v12H7v-2H5v-1H1z',
    'M11 5h1v2h-1zM12 7h2v2h-2zM14 5h1v2h-1zM11 9h1v2h-1zM14 9h1v2h-1z',
  ],
  restart: [
    'M5 2h6v2h2v2h2v6h-2v2h-2v2H5v-2H3v-2H1V9h2v3h2v2h6v-2h2V6h-2V4H5z',
    'M1 1h2v4h4v2H1z',
  ],
  flag: ['M2 2h2v14H2z', 'M4 2h7v1h2v2h2v2h-2v2h-2v1H4z'],
} as const;

export type PixelIconName = keyof typeof glyphs;

/** Decorative silhouettes share a 16-cell grid and inherit the control color. */
export function PixelIcon({ name, size = 16 }: { name: PixelIconName; size?: 16 | 24 | 32 }): SVGSVGElement {
  const namespace = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(namespace, 'svg');
  icon.setAttribute('class', name === 'flag' ? 'pixel-icon flag-icon' : 'pixel-icon');
  icon.setAttribute('viewBox', '0 0 16 16');
  icon.setAttribute('width', String(size));
  icon.setAttribute('height', String(size));
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');
  icon.setAttribute('data-pixel-icon', name);
  for (const [index, data] of glyphs[name].entries()) {
    const path = document.createElementNS(namespace, 'path');
    path.setAttribute('d', data);
    if (name === 'flag') path.setAttribute('class', index === 0 ? 'flag-icon__pole' : 'flag-icon__cloth');
    icon.append(path);
  }
  return icon;
}
