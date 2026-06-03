"use client";

import { useEffect } from "react";

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
      >
        {/* Grab handle (mobile bottom-sheet affordance). */}
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-ink-500 sm:hidden" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            onClick={onClose}
            className="-mr-1 flex h-9 w-9 items-center justify-center rounded-full text-ink-300 hover:bg-ink-700 hover:text-ink-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
