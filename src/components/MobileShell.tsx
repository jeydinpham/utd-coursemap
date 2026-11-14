import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import BottomSheet, { type Snap } from './BottomSheet';
import ThemeToggle from './ThemeToggle';
import { FloorPicker, FreeUntil, Legend, LiveEyebrow, NowRow, SearchBox, TimeTravel } from './controls';
import type { ControlProps } from './ControlCard';
import PixelIcon from './PixelIcon';
import { formatMinutes } from '../lib/time';

interface Props extends ControlProps {
  /** The selected room's schedule (RoomPanel in its sheet variant), or null for the campus overview. */
  room: ReactNode | null;
  onCloseRoom: () => void;
  snap: Snap;
  onSnap: (s: Snap) => void;
  /** Reports the space the search bar and the sheet take, so the map can aim between them. */
  onInsets: (insets: { top: number; bottom: number }) => void;
}

/**
 * The phone layout: a floating search bar on top, an elevator-style floor rail on the
 * right, and a bottom sheet holding the clock, filters and room schedules.
 */
export default function MobileShell(p: Props) {
  const topRef = useRef<HTMLDivElement>(null);
  const [topInset, setTopInset] = useState(76);
  const [sheetH, setSheetH] = useState(0);
  const [timeOpen, setTimeOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const filtering = p.freeUntil !== null;

  useLayoutEffect(() => {
    const el = topRef.current;
    if (!el) return;
    const measure = () => setTopInset(Math.round(el.getBoundingClientRect().bottom));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { onInsets } = p;
  useLayoutEffect(() => {
    onInsets({ top: topInset, bottom: sheetH });
  }, [topInset, sheetH, onInsets]);

  return (
    <>
      <div ref={topRef} className={`topbar${searching ? ' topbar--searching' : ''}`}>
        <SearchBox
          query={p.query}
          onQuery={p.onQuery}
          results={p.results}
          moment={p.moment}
          hasInstructors={p.hasInstructors}
          onPickRoom={p.onPickRoom}
          variant="bar"
          onFocusChange={setSearching}
        />
        <ThemeToggle />
      </div>

      <FloorPicker
        floors={p.floors}
        floor={p.floor}
        onFloor={p.onFloor}
        counts={filtering ? p.freeByFloor : p.activeByFloor}
        freeUntil={p.freeUntil}
        variant="rail"
      />

      <BottomSheet
        snap={p.snap}
        onSnap={p.onSnap}
        onDismiss={p.room ? p.onCloseRoom : undefined}
        topInset={topInset}
        onHeight={setSheetH}
        label={p.room ? 'Room schedule' : 'Campus overview'}
      >
        {p.room ?? (
          <div className="overview">
            <div data-sheet-peek className="overview__peek">
              <LiveEyebrow live={p.live} sourceLabel={p.sourceLabel} />
              <NowRow
                moment={p.moment}
                activeClasses={p.activeClasses}
                activeEvents={p.activeEvents}
                timeOpen={timeOpen}
                onToggleTime={() => {
                  setTimeOpen((o) => !o);
                  if (p.snap === 'peek') p.onSnap('half');
                }}
              />
              {/* Keep an active filter visible (and easy to clear) even with the sheet folded down */}
              {filtering && (
                <button className="chip chip--on filter-pill" onClick={() => p.onFreeUntil(null)} aria-label="Turn off the free-room filter">
                  Free until {formatMinutes(p.freeUntil!)} <PixelIcon name="close" />
                </button>
              )}
            </div>
            {timeOpen && <TimeTravel moment={p.moment} live={p.live} onTimeTravel={p.onTimeTravel} />}
            {p.outOfRange && <p className="card__warn">{p.outOfRange}</p>}
            <FreeUntil
              moment={p.moment}
              floor={p.floor}
              freeUntil={p.freeUntil}
              onFreeUntil={(t) => {
                p.onFreeUntil(t);
                if (t !== null && p.snap === 'peek') p.onSnap('half');
              }}
              freeOnFloor={p.freeOnFloor}
              onPickRoom={p.onPickRoom}
              variant="chips"
            />
            <Legend className="legend--inline" />
            <p className="overview__brand">UTD Course Map</p>
          </div>
        )}
      </BottomSheet>
    </>
  );
}
