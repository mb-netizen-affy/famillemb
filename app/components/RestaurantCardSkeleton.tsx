"use client";

export default function RestaurantCardSkeleton() {
  return (
    <li className="bg-[var(--hr-surface)] border border-[var(--hr-sand)] rounded-2xl p-4 shadow-sm animate-pulse">
      <div className="flex items-start gap-4">
        {/* Texte */}
        <div className="flex-1 space-y-2">
          {/* Nom + note */}
          <div className="flex items-center gap-2">
            <div className="h-4 w-32 rounded-lg bg-[var(--hr-sand)]/40" />
            <div className="h-5 w-12 rounded-full bg-[var(--hr-sand)]/50" />
          </div>

          {/* Ville */}
          <div className="h-3 w-24 rounded-lg bg-[var(--hr-sand)]/30" />

          {/* Tags */}
          <div className="flex gap-2 mt-1">
            <div className="h-4 w-12 rounded-full bg-[var(--hr-sand)]/30" />
            <div className="h-4 w-16 rounded-full bg-[var(--hr-sand)]/30" />
            <div className="h-4 w-10 rounded-full bg-[var(--hr-sand)]/30" />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 self-center">
          <div className="w-10 h-10 rounded-full bg-[var(--hr-sand)]/40" />
          <div className="w-10 h-10 rounded-full bg-[var(--hr-sand)]/40" />
        </div>
      </div>
    </li>
  );
}
