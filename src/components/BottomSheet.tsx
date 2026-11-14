import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

export type Snap = 'peek' | 'half' | 'full';

interface Props {
  snap: Snap;
  onSnap: (snap: Snap) => void;
  /** Swiping down past the peek height calls this (e.g. to close a room). */
  onDismiss?: () => void;
  /** Space kept clear at the top of the screen (the floating search bar). */
  topInset: number;
  /** Reports the sheet's resting height so the map can keep things above it. */
  onHeight?: (px: number) => void;
  label: string;
  children: ReactNode;
}

const DRAG_SLOP = 6; // px of movement before a press becomes a drag
const FLING_MS = 140; // how far ahead a flick's velocity is projected

/**
 * A phone-style bottom sheet with three resting heights. "Peek" is sized to the
 * element marked data-sheet-peek inside the content, so it shows exactly the summary.
 * Drag from the handle or the peek area; a fast flick carries in its direction.
 */
export default function BottomSheet({ snap, onSnap, onDismiss, topInset, onHeight, label, children }: Props) {
  const sheetRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [viewportH, setViewportH] = useState(() => window.innerHeight);
  const [peekH, setPeekH] = useState(150);
  const [dragH, setDragH] = useState<number | null>(null);
  const drag = useRef<{ startY: number; startH: number; lastY: number; lastT: number; v: number; active: boolean } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    const onResize = () => setViewportH(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Peek = from the top of the sheet to the bottom of the [data-sheet-peek] block, plus the
  // home-indicator safe area (the sheet's bottom padding).
  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    const peek = contentRef.current?.querySelector<HTMLElement>('[data-sheet-peek]');
    if (!sheet || !peek) return;
    const measure = () => {
      const safe = parseFloat(getComputedStyle(sheet).paddingBottom) || 0;
      const bottom = peek.getBoundingClientRect().bottom - sheet.getBoundingClientRect().top + (contentRef.current?.scrollTop ?? 0);
      setPeekH(Math.round(bottom + 14 + safe));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(peek);
    return () => ro.disconnect();
  }, [children]);

  const fullH = Math.max(peekH, viewportH - topInset - 10);
  const halfH = Math.min(fullH, Math.max(peekH + 140, Math.round(viewportH * 0.52)));
  const heights: Record<Snap, number> = { peek: peekH, half: halfH, full: fullH };
  const restingH = heights[snap];

  useEffect(() => {
    onHeight?.(restingH);
  }, [restingH, onHeight]);

  // Back at the top whenever the sheet folds down, so the summary is what shows.
  useEffect(() => {
    if (snap === 'peek') contentRef.current?.scrollTo({ top: 0 });
  }, [snap]);

  const nearest = (h: number): Snap =>
    (Object.entries(heights) as [Snap, number][]).reduce((best, cur) => (Math.abs(cur[1] - h) < Math.abs(best[1] - h) ? cur : best))[0];

  const onPointerDown = (e: ReactPointerEvent) => {
    const target = e.target as HTMLElement;
    // Drag from the handle or the summary; leave form controls and sideways chip rows alone.
    if (!target.closest('.sheet__grab, [data-sheet-peek]') || target.closest('input, select, textarea, .chip-row')) return;
    drag.current = { startY: e.clientY, startH: restingH, lastY: e.clientY, lastT: e.timeStamp, v: 0, active: false };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dy = d.startY - e.clientY; // up is positive
    if (!d.active) {
      if (Math.abs(dy) < DRAG_SLOP) return;
      d.active = true;
      try {
        // Keep receiving moves even if the finger slides off the sheet.
        sheetRef.current?.setPointerCapture(e.pointerId);
      } catch {
        // The pointer can already be gone (a very quick flick); the drag still works without capture.
      }
    }
    const dt = Math.max(1, e.timeStamp - d.lastT);
    d.v = (d.lastY - e.clientY) / dt; // px per ms, up is positive
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    setDragH(Math.min(fullH, Math.max(peekH * 0.55, d.startH + dy)));
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.active || dragH === null) return;
    suppressClick.current = true; // the drag shouldn't also count as a tap on whatever was under it
    const projected = dragH + d.v * FLING_MS;
    setDragH(null);
    if (onDismiss && projected < peekH * 0.7) {
      onDismiss();
      return;
    }
    onSnap(nearest(projected));
  };

  const cycle = () => onSnap(snap === 'peek' ? 'half' : 'peek');

  return (
    <section
      ref={sheetRef}
      className={`sheet sheet--${snap}${dragH !== null ? ' sheet--dragging' : ''}`}
      style={{ height: dragH ?? restingH }}
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClickCapture={(e) => {
        if (!suppressClick.current) return;
        suppressClick.current = false;
        e.stopPropagation();
        e.preventDefault();
      }}
    >
      <button className="sheet__grab" onClick={cycle} aria-label={snap === 'peek' ? 'Expand panel' : 'Collapse panel'} aria-expanded={snap !== 'peek'}>
        <span aria-hidden="true" />
      </button>
      <div ref={contentRef} className="sheet__content">
        {children}
      </div>
    </section>
  );
}
