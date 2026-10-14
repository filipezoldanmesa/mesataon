'use client';

/**
 * Horizontal scroll area whose scrollbar stays pinned to the bottom of the
 * window while the content is on screen, and that can also be dragged with the
 * mouse.
 *
 * A native `overflow-x: auto` puts the scrollbar at the END of the content, so
 * with a long list the user has to scroll down to find it, scroll sideways, and
 * scroll back up. Here the content's own scrollbar is hidden and a second one —
 * `position: sticky; bottom: 0` — drives it. The two are kept in sync, so the
 * trackpad, the mouse wheel (shift + wheel) and a drag on the bar all work.
 *
 * The bar only exists when the content is wider than the box.
 *
 * Click and drag (mouse only — touch already scrolls by swiping):
 * - A press that moves more than {@link DRAG_THRESHOLD_PX} is a drag: it scrolls
 *   the content, and the click that ends it is swallowed, so dragging never
 *   opens a row or follows a link. A press that stays under the threshold is a
 *   plain click and reaches whatever was clicked.
 * - A press that starts on a link, button or form control is left alone.
 * - Dragging over text no longer selects it (the trade-off of the gesture).
 *   Double and triple click still select.
 */

import { useEffect, useRef, useState } from 'react';

/** Movement under this is still a click. */
const DRAG_THRESHOLD_PX = 5;

/** A press that starts on one of these keeps its own behaviour. */
const INTERACTIVE = 'a, button, input, select, textarea, label, [role="button"]';

export function StickyScrollX({
  children,
  className = '',
}: {
  children: React.ReactNode;
  /** Applied to the scrolling box — borders, radius, shadow. */
  className?: string;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [contentWidth, setContentWidth] = useState(0);
  const [overflowing, setOverflowing] = useState(false);
  const [dragging, setDragging] = useState(false);
  /** Set when a drag ends, so the click that follows it is swallowed. */
  const swallowClick = useRef(false);

  // Measures the content, and re-measures when the box or the content resizes.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const measure = () => {
      setContentWidth(body.scrollWidth);
      setOverflowing(body.scrollWidth > body.clientWidth + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    if (body.firstElementChild) observer.observe(body.firstElementChild);
    return () => observer.disconnect();
  }, []);

  // Keeps the two scroll positions equal. Writing only when they differ is what
  // ends the echo: the second scroll event finds them already equal.
  function sync(from: HTMLDivElement | null, to: HTMLDivElement | null) {
    if (from && to && to.scrollLeft !== from.scrollLeft) {
      to.scrollLeft = from.scrollLeft;
    }
  }

  function onMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    const body = bodyRef.current;
    if (!body || e.button !== 0 || !overflowing) return;
    if ((e.target as HTMLElement).closest(INTERACTIVE)) return;

    // Without this the drag would start selecting text instead.
    e.preventDefault();

    const startX = e.clientX;
    const startScroll = body.scrollLeft;
    let active = false;

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      if (!active) {
        if (Math.abs(dx) <= DRAG_THRESHOLD_PX) return;
        active = true;
        setDragging(true);
      }
      body.scrollLeft = startScroll - dx;
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (active) {
        setDragging(false);
        // The click event fires right after mouseup; let it pass once swallowed.
        swallowClick.current = true;
        setTimeout(() => {
          swallowClick.current = false;
        }, 0);
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  return (
    <div>
      <div
        ref={bodyRef}
        data-dragging={dragging}
        onMouseDown={onMouseDown}
        onScroll={() => sync(bodyRef.current, barRef.current)}
        onClickCapture={(e) => {
          if (!swallowClick.current) return;
          e.preventDefault();
          e.stopPropagation();
        }}
        className={`overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&[data-dragging=true]_*]:cursor-grabbing ${overflowing ? 'cursor-grab' : ''} ${className}`}
      >
        {children}
      </div>
      <div
        ref={barRef}
        onScroll={() => sync(barRef.current, bodyRef.current)}
        aria-hidden="true"
        data-testid="sticky-scroll-x-bar"
        className={`sticky bottom-0 z-20 overflow-x-auto ${overflowing ? '' : 'hidden'}`}
      >
        <div style={{ width: contentWidth, height: 1 }} />
      </div>
    </div>
  );
}
