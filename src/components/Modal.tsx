"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// How far (px) or how fast (px/ms) a downward drag must reach to dismiss.
const CLOSE_DISTANCE = 120;
const CLOSE_VELOCITY = 0.5;

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  // Vertical drag offset of the sheet, in px. 0 = resting position.
  const [dragY, setDragY] = useState(0);
  // Whether a drag is currently in progress (disables the snap transition).
  const [dragging, setDragging] = useState(false);
  // Tracks the active pointer gesture so move/up can compute delta + velocity.
  const drag = useRef<{ startY: number; lastY: number; lastT: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  // Reset the sheet to its resting position whenever it (re)opens.
  useEffect(() => {
    if (open) {
      setDragY(0);
      setDragging(false);
      drag.current = null;
    }
  }, [open]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Only start dragging from a primary pointer (touch / left mouse).
    if (e.button != null && e.button !== 0) return;
    drag.current = { startY: e.clientY, lastY: e.clientY, lastT: e.timeStamp };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current) return;
    const delta = e.clientY - drag.current.startY;
    drag.current.lastY = e.clientY;
    drag.current.lastT = e.timeStamp;
    // Only allow dragging downward; clamp upward pulls to 0.
    setDragY(delta > 0 ? delta : 0);
  }, []);

  const endDrag = useCallback(
    (e: React.PointerEvent) => {
      if (!drag.current) return;
      const { startY, lastY, lastT } = drag.current;
      const distance = lastY - startY;
      // Velocity from the last sampled move (guard against divide-by-zero).
      const dt = e.timeStamp - lastT;
      const velocity = dt > 0 ? (e.clientY - lastY) / dt : 0;
      drag.current = null;
      setDragging(false);

      if (distance > CLOSE_DISTANCE || velocity > CLOSE_VELOCITY) {
        onClose();
      } else {
        // Snap back to resting position.
        setDragY(0);
      }
    },
    [onClose],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md max-h-[92vh] overflow-y-auto rounded-b-none px-5 pt-3 pb-5
                   [padding-bottom:max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-2xl sm:pt-5 sm:pb-5"
        onClick={(e) => e.stopPropagation()}
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? "none" : "transform 0.25s ease-out",
        }}
      >
        {/* Grab handle + title double as the drag region (mobile bottom-sheet).
            touch-none keeps the browser from hijacking the gesture as a scroll. */}
        <div
          className="-mx-5 -mt-3 cursor-grab touch-none px-5 pt-3 active:cursor-grabbing sm:cursor-auto"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-ink-500 sm:hidden" />
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">{title}</h2>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
