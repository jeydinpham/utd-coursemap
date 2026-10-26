// Small interface icons as pixel art, per the design system: drawn on a tiny
// grid, 2 screen px per pixel, filled with currentColor so they follow the theme.

// One character per pixel: X filled, . empty.
const ICONS = {
  close: ['XX....XX', 'XXX..XXX', '.XXXXXX.', '..XXXX..', '..XXXX..', '.XXXXXX.', 'XXX..XXX', 'XX....XX'],
  up: ['...XX...', '..XXXX..', '.XX..XX.', 'XX....XX'],
  left: ['...X', '..XX', '.XX.', 'XX..', 'XX..', '.XX.', '..XX', '...X'],
  right: ['X...', 'XX..', '.XX.', '..XX', '..XX', '.XX.', 'XX..', 'X...'],
  search: [
    '..XXXX....',
    '.XX..XX...',
    'XX....XX..',
    'X......X..',
    'X......X..',
    'XX....XX..',
    '.XX..XXX..',
    '..XXXXXXX.',
    '.......XXX',
    '........XX',
  ],
};

const PX = 2;

/** Each horizontal run of filled pixels becomes one rectangle in a single path. */
function runs(rows: string[]) {
  let d = '';
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      if (row[x] !== 'X') {
        x++;
        continue;
      }
      const start = x;
      while (row[x] === 'X') x++;
      d += `M${start} ${y}h${x - start}v1h-${x - start}z`;
    }
  });
  return d;
}

export default function PixelIcon({ name, className }: { name: keyof typeof ICONS; className?: string }) {
  const rows = ICONS[name];
  return (
    <svg
      className={className}
      width={rows[0].length * PX}
      height={rows.length * PX}
      viewBox={`0 0 ${rows[0].length} ${rows.length}`}
      shapeRendering="crispEdges"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d={runs(rows)} />
    </svg>
  );
}
