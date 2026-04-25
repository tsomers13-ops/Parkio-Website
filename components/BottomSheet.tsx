"use client";

import { useEffect, useRef, useState } from "react";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Lightweight, dependency-free bottom sheet with drag-to-dismiss.
 * Mounted always; visibility controlled via translate transform.
 */
export function BottomSheet({ open, onClose, children }: BottomSheetProps) {
  const [dragY, setDragY] = useState(0);
  const startY = useRef<number | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function onPointerDown(e: React.PointerEvent) {
    startY.current = e.clientY;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (startY.current == null) return;
    const dy = e.clientY - startY.current;
    if (dy > 0) setDragY(dy);
  }
  function onPointerUp() {
    if (dragY > 120) {
      onClose();
    }
    startY.current = null;
    setDragY(0);
  }

  return (
    <>
      {/* Scrim */}
      <div
        aria-hidden
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-ink-900/20 backdrop-blur-[1px] transition-opacity duration-300 ${
          open
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        className={`fixed inset-x-0 bottom-0 z-50 mx-auto max-w-2xl transition-transform duration-300`}
        style={{
          transform: open
            ? `translateY(${dragY}px)`
            : "translateY(100%)",
          transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div className="surface-glass relative overflow-hidden rounded-t-4xl border border-b-0 border-ink-100 shadow-lift">
          <div
            className="flex h-7 cursor-grab items-center justify-center pt-2 active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <span className="sheet-handle" />
          </div>
          <div className="max-h-[78vh] overflow-y-auto pb-[env(safe-area-inset-bottom)]">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
