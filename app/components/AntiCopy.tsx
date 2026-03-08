'use client';

import { useEffect } from 'react';

/**
 * Blocks casual copy/inspect actions:
 * - Right-click context menu
 * - Ctrl+U (view source), Ctrl+S (save), Ctrl+P (print)
 * - Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+Shift+C (devtools)
 * - F12 (devtools)
 * - Text drag-and-drop
 *
 * Does NOT block Ctrl+C — wallet copy buttons use navigator.clipboard directly.
 */
export function AntiCopy() {
  useEffect(() => {
    function blockContextMenu(e: MouseEvent) {
      e.preventDefault();
    }

    function blockShortcuts(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+U (view source), Ctrl+S (save), Ctrl+P (print)
      if (ctrl && !e.shiftKey && ['u', 's', 'p'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        return;
      }

      // Ctrl+Shift+I (devtools), Ctrl+Shift+J (console), Ctrl+Shift+C (element picker)
      if (ctrl && e.shiftKey && ['i', 'j', 'c'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        return;
      }

      // F12 (devtools)
      if (e.key === 'F12') {
        e.preventDefault();
      }
    }

    function blockDrag(e: DragEvent) {
      e.preventDefault();
    }

    document.addEventListener('contextmenu', blockContextMenu);
    document.addEventListener('keydown', blockShortcuts);
    document.addEventListener('dragstart', blockDrag);

    return () => {
      document.removeEventListener('contextmenu', blockContextMenu);
      document.removeEventListener('keydown', blockShortcuts);
      document.removeEventListener('dragstart', blockDrag);
    };
  }, []);

  return null;
}
