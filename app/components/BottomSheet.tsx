"use client";

import { useEffect } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
};

export default function BottomSheet({ open, onClose, title, children }: Props) {
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Overlay */}
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        style={{ animation: "hrFadeIn 120ms ease-out" }}
        onClick={onClose}
        aria-label="Fermer"
      />

      {/* Sheet */}
      <div
        className="relative w-full sm:max-w-md bg-[var(--hr-surface)] border border-[var(--hr-sand)] rounded-t-2xl sm:rounded-2xl p-4 shadow-lg"
        style={{ animation: "hrSheetUp 160ms ease-out" }}
      >
        {/* Grabber iOS */}
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--hr-sand)]" />

        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="min-w-0">
            {title ? <h3 className="text-lg font-semibold truncate">{title}</h3> : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full border border-[var(--hr-sand)] bg-[var(--hr-surface)] text-[var(--hr-ink)] flex items-center justify-center active:scale-[0.98]"
            aria-label="Fermer"
            title="Fermer"
          >
            ✕
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}
