'use client';

import { useEffect, type RefObject } from 'react';

/**
 * useFocusTrap — keep keyboard focus inside an open dialog and restore it on
 * close. A real modal must (1) not let Tab/Shift+Tab escape to the page behind
 * it, and (2) return focus to whatever was focused before it opened. Both are
 * WCAG 2.2 expectations for `role="dialog" aria-modal="true"`.
 *
 * Usage: pass the dialog container ref and an `active` flag. The hook wires a
 * keydown listener while active, cycling focus across the container's tabbable
 * elements, and restores the previously-focused element on teardown.
 *
 * Deliberately dependency-free and conservative: it only intercepts Tab, so
 * Escape/Enter handling stays with the component that owns them.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
): void {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const getTabbable = (): HTMLElement[] => {
      const nodes = container.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      return Array.from(nodes).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const tabbable = getTabbable();
      if (tabbable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = tabbable[0];
      const last = tabbable[tabbable.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (activeEl === first || !container.contains(activeEl)) {
          e.preventDefault();
          last.focus();
        }
      } else if (activeEl === last || !container.contains(activeEl)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      // Restore focus to the trigger so keyboard users aren't dropped at <body>.
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, [containerRef, active]);
}
