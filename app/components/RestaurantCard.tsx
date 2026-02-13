"use client";

import { useEffect, useState } from "react";
import BottomSheet from "./BottomSheet";
import { AVAILABLE_TAGS } from "./Tags";
import type { Props } from "./types";

export default function RestaurantCard({ restaurant, onDelete, onSave, onOpenVisits }: Props) {
  const [openEdit, setOpenEdit] = useState(false);

  const [newRating, setNewRating] = useState(restaurant.rating);
  const [editingTags, setEditingTags] = useState<string[]>(restaurant.tags ?? []);

  useEffect(() => {
    setNewRating(restaurant.rating);
    setEditingTags(restaurant.tags ?? []);
  }, [restaurant.rating, restaurant.tags]);

  const toggleTag = (tag: string) => {
    setEditingTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const iconBtn =
    "w-10 h-10 rounded-full border border-[var(--hr-sand)] bg-[var(--hr-surface)] " +
    "text-[var(--hr-ink)] flex items-center justify-center active:scale-[0.98]";

  const priceChip =
    restaurant.total_spent_eur != null
      ? `€${restaurant.total_spent_eur}`
      : restaurant.price_eur != null
      ? `€${restaurant.price_eur}`
      : null;

  const maxIcons = 5;
  const count = restaurant.visit_count ?? 0;

  return (
    <li className="bg-[var(--hr-surface)] border border-[var(--hr-sand)] rounded-2xl p-4 shadow-sm">
      {/* ✅ carte cliquable (ouvre visites) */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpenVisits?.()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpenVisits?.();
          }
        }}
        className="w-full text-left"
        aria-label={`Ouvrir les visites : ${restaurant.name}${restaurant.city ? ` - ${restaurant.city}` : ""}`}
      >
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-[var(--hr-ink)] truncate">{restaurant.name}</p>

              <span className="px-2 py-0.5 rounded-full text-sm font-semibold bg-[var(--hr-accent)] text-[var(--hr-cream)]">
                {restaurant.rating}/20
              </span>

              {priceChip && (
                <span className="px-2 py-0.5 rounded-full text-sm font-semibold border border-[var(--hr-sand)] text-[var(--hr-ink)] bg-[var(--hr-surface)]">
                  {priceChip}
                </span>
              )}
            </div>

            {restaurant.city && (
              <p className="text-sm text-[var(--hr-muted)] truncate">{restaurant.city}</p>
            )}

            <div className="flex gap-2 mt-2 flex-wrap">
              {(restaurant.tags ?? []).map((tag) => (
                <span
                  key={tag}
                  className="text-xs bg-[var(--hr-sand)]/40 text-[var(--hr-ink)] px-2 py-0.5 rounded-full"
                >
                  #{tag}
                </span>
              ))}
            </div>

            {/* Hint visites */}
            <div className="mt-2 text-sm text-[var(--hr-muted)]">
              {count > 0 ? (
                <span aria-label={`${count} visites`}>
                  {Array.from({ length: Math.min(count, maxIcons) }).map((_, i) => (
                    <span key={i} className="mr-0.5">
                      🍽️
                    </span>
                  ))}
                  {count > maxIcons && <span className="ml-1 text-xs">+{count - maxIcons}</span>}
                </span>
              ) : (
                <span>Pas encore visité</span>
              )}
            </div>
          </div>

          {/* Actions (stop propagation) */}
          <div className="ml-auto flex gap-2 flex-shrink-0 self-center">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpenEdit(true);
              }}
              className={iconBtn}
              aria-label="Modifier"
              title="Modifier"
            >
              ✏️
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className={iconBtn}
              aria-label="Supprimer"
              title="Supprimer"
            >
              🗑
            </button>
          </div>
        </div>
      </div>

      {/* BottomSheet édition */}
      <BottomSheet open={openEdit} onClose={() => setOpenEdit(false)} title="Modifier">
        {/* Note */}
        <div className="space-y-2">
          <label className="text-sm text-[var(--hr-muted)]">Note (0 à 20)</label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={0}
              max={20}
              step={1}
              value={newRating}
              onChange={(e) => setNewRating(Number(e.target.value))}
              className="w-24 px-3 py-2 rounded-2xl border border-[var(--hr-sand)] bg-[var(--hr-surface)] text-center text-lg font-semibold"
            />
            <span className="text-sm text-[var(--hr-muted)]">/ 20</span>
          </div>
        </div>

        {/* Tags */}
        <div className="space-y-2 mt-4">
          <label className="text-sm text-[var(--hr-muted)]">Tags</label>
          <div className="flex gap-2 flex-wrap">
            {AVAILABLE_TAGS.map((tag) => {
              const isSelected = editingTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`px-3 py-2 rounded-full text-sm border transition active:scale-[0.98] ${
                    isSelected
                      ? "bg-[var(--hr-accent)] text-[var(--hr-cream)] border-[var(--hr-accent)]"
                      : "bg-[var(--hr-surface)]/60 text-[var(--hr-muted)] border border-[var(--hr-sand)]/70 hover:bg-[var(--hr-sand)]/15"
                  }`}
                >
                  #{tag}
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-5">
          <button
            type="button"
            onClick={() => setOpenEdit(false)}
            className="flex-1 py-3 rounded-2xl border border-[var(--hr-sand)] bg-[var(--hr-surface)] text-[var(--hr-ink)] font-medium"
          >
            Annuler
          </button>

          <button
            type="button"
            onClick={() => {
              const safeRating = Math.min(20, Math.max(0, Number(newRating) || 0));
              // ✅ plus de prix ici
              onSave(safeRating, editingTags, restaurant.price_eur ?? null);
              setOpenEdit(false);
            }}
            className="flex-1 py-3 rounded-2xl bg-[var(--hr-accent)] text-[var(--hr-cream)] font-semibold active:scale-[0.99]"
          >
            💾 Sauvegarder
          </button>
        </div>
      </BottomSheet>
    </li>
  );
}
