/**
 * A windowed grid for the Clip Library.
 *
 * 3868 tiles, each carrying a <video> element, cannot all be in the DOM — the
 * browser would hold thousands of media elements open. This keeps only the rows
 * intersecting the viewport (plus an overscan margin) mounted.
 *
 * Written in-repo rather than pulled from react-window because the grid needs
 * three things the fixed-size grid components don't give for free: a column
 * count that responds to container width, a row height derived from that
 * column width (the tiles are 16:9, so height is a function of width), and a
 * single scroll container shared with the page. That's ~60 lines here versus a
 * dependency plus the same measurement code wrapped around it.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

export interface VirtualGridOptions {
  /** How many tiles exist in total. */
  itemCount: number;
  /** Smallest acceptable tile width; column count is derived from it. */
  minTileWidth: number;
  /** Fixed pixel height added below each tile's 16:9 media area (the meta strip). */
  metaHeight: number;
  /** Gap between tiles, both axes. */
  gap: number;
  /** Extra rows rendered above and below the viewport to cover fast scrolling. */
  overscanRows?: number;
}

export interface VirtualGridResult {
  /** Attach to the scrolling element. */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  columnCount: number;
  rowHeight: number;
  /** Total scrollable height — the spacer that gives the scrollbar its size. */
  totalHeight: number;
  /** Indices to render, contiguous. */
  startIndex: number;
  endIndex: number;
  /** Pixel offset of the first rendered row, applied as a transform. */
  offsetTop: number;
}

export function useVirtualGrid({
  itemCount,
  minTileWidth,
  metaHeight,
  gap,
  overscanRows = 2,
}: VirtualGridOptions): VirtualGridResult {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  // Measure the scroll container. ResizeObserver covers window resizes, sidebar
  // collapse, and the cart drawer opening — all of which change column count.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      setWidth(el.clientWidth);
      setHeight(el.clientHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      // Coalesce to one state update per frame; scroll fires far more often.
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setScrollTop(el.scrollTop);
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return useMemo(() => {
    const columnCount = Math.max(1, Math.floor((width + gap) / (minTileWidth + gap)));
    const tileWidth = columnCount > 0 ? (width - gap * (columnCount - 1)) / columnCount : width;
    // 16:9 media area plus the fixed meta strip.
    const rowHeight = Math.round((tileWidth * 9) / 16) + metaHeight + gap;
    const rowCount = Math.ceil(itemCount / columnCount);

    const firstVisibleRow = Math.max(0, Math.floor(scrollTop / rowHeight) - overscanRows);
    const visibleRows = Math.ceil(height / rowHeight) + overscanRows * 2;
    const lastRow = Math.min(rowCount, firstVisibleRow + visibleRows);

    return {
      scrollRef,
      columnCount,
      rowHeight,
      totalHeight: Math.max(0, rowCount * rowHeight - gap),
      startIndex: firstVisibleRow * columnCount,
      endIndex: Math.min(itemCount, lastRow * columnCount),
      offsetTop: firstVisibleRow * rowHeight,
    };
  }, [width, height, scrollTop, itemCount, minTileWidth, metaHeight, gap, overscanRows]);
}
