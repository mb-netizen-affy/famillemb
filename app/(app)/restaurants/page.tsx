"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import RestaurantCard from "../../components/RestaurantCard";
import RestaurantCardSkeleton from "../../components/RestaurantCardSkeleton";
import BottomSheet from "../../components/BottomSheet";
import type { Restaurant } from "../../components/types";

type SortMode = "recent" | "best" | "price";

type VisitRow = {
  id: string;
  restaurant_id: string;
  price_eur: number | null;
  visited_at: string;
};

export default function RestaurantsPage() {
  const initOnceRef = useRef(false);

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);

  const [visitsLoaded, setVisitsLoaded] = useState(false);
  const [visitsSheet, setVisitsSheet] = useState<{ id: string; name: string } | null>(null);

  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recent");

  const [toast, setToast] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState<string>("");

  const [editingVisit, setEditingVisit] = useState<VisitRow | null>(null);
  const [editVisitPrice, setEditVisitPrice] = useState<string>("");
  const [editVisitDate, setEditVisitDate] = useState<string>(""); // yyyy-mm-dd
  const [savingVisit, setSavingVisit] = useState(false);

  const [confirmVisitDelete, setConfirmVisitDelete] = useState<{
  id: string;
  label: string; // ex: "12 janv. 2026 · €25"
} | null>(null);


  const pushToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2000);
  };

  const fetchRestaurants = async () => {
    const { data, error } = await supabase
      .from("restaurants")
      .select("id,name,city,rating,tags,country,created_at,place_id,price_eur")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erreur fetch restaurants:", error.message);
      return;
    }

    setRestaurants((data ?? []) as any);
  };

  const fetchVisits = async () => {
    const { data, error } = await supabase
      .from("restaurant_visits")
      .select("id,restaurant_id,price_eur,visited_at");

    if (error) {
      console.error("Erreur fetch visits:", error.message);
      return;
    }

    setVisits((data ?? []) as VisitRow[]);
    setVisitsLoaded(true);
  };

  useEffect(() => {
    if (initOnceRef.current) return;
    initOnceRef.current = true;

    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        window.location.href = "/login";
        return;
      }

      await Promise.all([fetchRestaurants(), fetchVisits()]);
      setHasLoaded(true);
    };

    init();

    const onChanged = () => fetchVisits();
    window.addEventListener("visits:changed", onChanged);
    return () => window.removeEventListener("visits:changed", onChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteRestaurant = async (id: string) => {
    const { error } = await supabase.from("restaurants").delete().eq("id", id);

    if (error) {
      console.error("Erreur delete:", error.message);
      pushToast("❌ Erreur suppression");
      return;
    }

    await Promise.all([fetchRestaurants(), fetchVisits()]);
    pushToast("🗑 Restaurant supprimé");
  };

  const saveRestaurant = async (id: string, newRating: number, tags: string[], price_eur: number | null) => {
    const safeRating = Math.min(20, Math.max(0, newRating));

    const { error } = await supabase
      .from("restaurants")
      .update({ rating: safeRating, tags, price_eur })
      .eq("id", id);

    if (error) {
      console.error("Erreur save:", error.message);
      pushToast("❌ Erreur sauvegarde");
      return;
    }

    await fetchRestaurants();
    pushToast("💾 Modifications sauvegardées");
  };

  const saveVisit = async (visitId: string, price_eur: number | null, visited_at: string) => {
    const { error } = await supabase
      .from("restaurant_visits")
      .update({ price_eur, visited_at })
      .eq("id", visitId);

    if (error) {
      console.error("Erreur update visit:", error.message);
      pushToast("❌ Erreur sauvegarde visite");
      return;
    }

    await fetchVisits();
    window.dispatchEvent(new Event("visits:changed"));
    pushToast("💾 Visite modifiée");
  };

  const deleteVisit = async (visitId: string) => {
    const { error } = await supabase.from("restaurant_visits").delete().eq("id", visitId);

    if (error) {
      console.error("Erreur delete visit:", error.message);
      pushToast("❌ Erreur suppression visite");
      return;
    }

    await fetchVisits();
    window.dispatchEvent(new Event("visits:changed"));
    pushToast("🗑 Visite supprimée");
  };

  // UI chips
  const chipBase =
    "px-3 py-2 rounded-full text-sm font-semibold transition active:scale-[0.98] " +
    "focus:outline-none focus:ring-2 focus:ring-[var(--hr-accent)]/30";
  const chipOn =
    "bg-[var(--hr-accent)] text-[var(--hr-cream)] shadow-sm border border-[var(--hr-accent)]";
  const chipOff =
    "bg-[var(--hr-surface)]/60 text-[var(--hr-muted)] border border-[var(--hr-sand)]/70 hover:bg-[var(--hr-sand)]/15";

  // Stats : somme + count
  const restaurantsWithStats = useMemo(() => {
  const map = new Map<string, { count: number; sum: number; last: string | null }>();

  for (const v of visits) {
    const cur = map.get(v.restaurant_id) ?? { count: 0, sum: 0, last: null };
    cur.count += 1;
    cur.sum += Number(v.price_eur) || 0;

    // last visit (max visited_at)
    if (!cur.last || v.visited_at > cur.last) cur.last = v.visited_at;

    map.set(v.restaurant_id, cur);
  }

  return restaurants.map((r) => {
    const s = map.get(r.id);
    const count = s?.count ?? 0;
    const sum = s?.sum ?? 0;

    return {
      ...r,
      visit_count: count,
      total_spent_eur: Math.round(sum * 10) / 10,
      last_visit_at: s?.last ?? null,
    };
  });
  }, [restaurants, visits]);


  const visibleRestaurants = useMemo(() => {
    const terms = search.toLowerCase().split(" ").filter(Boolean);

    const filtered = restaurantsWithStats.filter((restaurant) => {
      if (terms.length === 0) return true;

      const name = (restaurant.name ?? "").toLowerCase();
      const city = (restaurant.city ?? "").toLowerCase();
      const tags = (restaurant.tags ?? []).map((t) => t.toLowerCase());

      return terms.every(
        (term) =>
          name.includes(term) ||
          city.includes(term) ||
          tags.some((tag) => tag.includes(term))
      );
    });

    const sorted = [...filtered];

    if (sortMode === "best") {
      sorted.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
      return sorted;
    }

    if (sortMode === "price") {
      sorted.sort((a, b) => (Number(b.total_spent_eur) || 0) - (Number(a.total_spent_eur) || 0));
      return sorted;
    }

    if (sortMode === "recent") {
  // Dernière visite d'abord; ceux sans visite à la fin
  sorted.sort((a: any, b: any) => {
    const la = a.last_visit_at;
    const lb = b.last_visit_at;

    if (la && lb) return la < lb ? 1 : -1; // desc ISO
    if (la && !lb) return -1;
    if (!la && lb) return 1;

    // fallback : created_at si tu l’as encore, sinon stable
    const ca = a.created_at ?? "";
    const cb = b.created_at ?? "";
    return ca < cb ? 1 : -1;
  });

  return sorted;
}


    return sorted;
  }, [restaurantsWithStats, search, sortMode]);

  // ✅ ouvrir l’édition visite
  const openEditVisit = (v: VisitRow) => {
    setEditingVisit(v);

    setEditVisitPrice(v.price_eur == null ? "" : String(v.price_eur));

    // input type="date" veut yyyy-mm-dd
    const d = new Date(v.visited_at);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    setEditVisitDate(`${yyyy}-${mm}-${dd}`);
  };

  // ✅ sauver l’édition visite
  const submitEditVisit = async () => {
    if (!editingVisit) return;

    setSavingVisit(true);
    try {
      const parsedPrice = editVisitPrice.trim() === "" ? null : Number(editVisitPrice);
      const safePrice =
        parsedPrice == null ? null : Number.isFinite(parsedPrice) ? Math.max(0, parsedPrice) : null;

      // on garde l’heure d’origine si possible, sinon midi pour éviter décalages
      const base = new Date(editingVisit.visited_at);
      const hh = Number.isNaN(base.getTime()) ? 12 : base.getHours();
      const min = Number.isNaN(base.getTime()) ? 0 : base.getMinutes();

      const newISO = new Date(`${editVisitDate}T${String(hh).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`).toISOString();

      await saveVisit(editingVisit.id, safePrice, newISO);

      setEditingVisit(null);
    } finally {
      setSavingVisit(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toast global */}
      {toast && (
        <div className="fixed top-16 left-4 right-4 z-50">
          <div className="mx-auto max-w-md bg-[var(--hr-ink)] text-[var(--hr-cream)] px-4 py-3 rounded-2xl shadow">
            {toast}
          </div>
        </div>
      )}

      {/* BottomSheet : Visites */}
      <BottomSheet
        open={Boolean(visitsSheet)}
        onClose={() => setVisitsSheet(null)}
        title={visitsSheet ? `Visites · ${visitsSheet.name}` : "Visites"}
      >
        {!visitsLoaded ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <VisitRowSkeleton key={i} />
            ))}
          </div>
        ) : (
          <VisitsList
  restaurantId={visitsSheet?.id ?? ""}
  visits={visits}
  onEditVisit={openEditVisit}
  onDeleteVisit={(visitId) => {
    const v = visits.find((x) => x.id === visitId);
    if (!v) return;

    setConfirmVisitDelete({
      id: v.id,
      label: `${formatDateFR(v.visited_at)} · ${formatPriceEUR(v.price_eur)}`,
    });
  }}
/>
        )}
      </BottomSheet>

      <BottomSheet
  open={Boolean(confirmVisitDelete)}
  onClose={() => setConfirmVisitDelete(null)}
  title="Supprimer la visite ?"
>
  <p className="text-sm text-[var(--hr-muted)]">
    Tu es sur le point de supprimer{" "}
    <span className="font-medium text-[var(--hr-ink)]">
      {confirmVisitDelete?.label ?? "cette visite"}
    </span>
    . Cette action est définitive.
  </p>

  <div className="flex gap-2 mt-4">
    <button
      type="button"
      onClick={() => setConfirmVisitDelete(null)}
      className="flex-1 py-3 rounded-2xl border border-[var(--hr-sand)] bg-[var(--hr-surface)] text-[var(--hr-ink)] font-medium"
    >
      Annuler
    </button>

    <button
      type="button"
      onClick={async () => {
        const id = confirmVisitDelete?.id;
        setConfirmVisitDelete(null);
        if (!id) return;
        await deleteVisit(id);
      }}
      className="flex-1 py-3 rounded-2xl bg-[var(--hr-accent)] text-[var(--hr-cream)] font-semibold active:scale-[0.99]"
    >
      Supprimer
    </button>
  </div>
</BottomSheet>

      {/* ✅ BottomSheet : Edit visite */}
      <BottomSheet
        open={Boolean(editingVisit)}
        onClose={() => setEditingVisit(null)}
        title="Modifier la visite"
      >
        {!editingVisit ? null : (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Date</label>
              <input
                type="date"
                value={editVisitDate}
                onChange={(e) => setEditVisitDate(e.target.value)}
                className="w-full border border-[var(--hr-sand)] p-3 rounded-2xl bg-[var(--hr-surface)]"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Montant (€)</label>
              <input
                type="number"
                min={0}
                step={0.5}
                placeholder="ex: 25"
                value={editVisitPrice}
                onChange={(e) => setEditVisitPrice(e.target.value)}
                className="w-full border border-[var(--hr-sand)] p-3 rounded-2xl bg-[var(--hr-surface)]"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditingVisit(null)}
                className="flex-1 py-3 rounded-2xl border border-[var(--hr-sand)] bg-[var(--hr-surface)] text-[var(--hr-ink)] font-medium"
              >
                Annuler
              </button>

              <button
                type="button"
                disabled={savingVisit}
                onClick={submitEditVisit}
                className="flex-1 py-3 rounded-2xl bg-[var(--hr-accent)] text-[var(--hr-cream)] font-semibold disabled:opacity-60 active:scale-[0.99]"
              >
                {savingVisit ? "Enregistrement…" : "💾 Sauvegarder"}
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      {/* Confirmation suppression restaurant */}
      <BottomSheet
        open={Boolean(confirmDeleteId)}
        onClose={() => setConfirmDeleteId(null)}
        title="Supprimer ?"
      >
        <p className="text-sm text-[var(--hr-muted)]">
          Tu es sur le point de supprimer{" "}
          <span className="font-medium text-[var(--hr-ink)]">{confirmDeleteName}</span>.
          Cette action est définitive.
        </p>

        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={() => setConfirmDeleteId(null)}
            className="flex-1 py-3 rounded-2xl border border-[var(--hr-sand)] bg-[var(--hr-surface)] text-[var(--hr-ink)] font-medium"
          >
            Annuler
          </button>

          <button
            type="button"
            onClick={async () => {
              const id = confirmDeleteId!;
              setConfirmDeleteId(null);
              await deleteRestaurant(id);
            }}
            className="flex-1 py-3 rounded-2xl bg-[var(--hr-accent)] text-[var(--hr-cream)] font-semibold active:scale-[0.99]"
          >
            Supprimer
          </button>
        </div>
      </BottomSheet>

      {/* Header + recherche */}
      <div className="space-y-2">
        <h1 className="text-xl font-bold">🍴 Mes restaurants</h1>

        <input
          type="text"
          placeholder="Rechercher (nom, ville, tags)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-[var(--hr-sand)] p-3 rounded-2xl bg-[var(--hr-surface)] placeholder:text-[var(--hr-muted)]"
        />
      </div>

      

      {/* Liste */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold shrink-0">
            📌 Liste · {hasLoaded ? visibleRestaurants.length : "—"}
          </h2>

          <div className="flex gap-2 overflow-x-auto pb-1 -mr-1 pr-1">
            <button
              type="button"
              onClick={() => setSortMode("recent")}
              className={`whitespace-nowrap ${chipBase} ${sortMode === "recent" ? chipOn : chipOff}`}
              title="Tri : récents"
            >
              🕒
            </button>
            <button
              type="button"
              onClick={() => setSortMode("best")}
              className={`whitespace-nowrap ${chipBase} ${sortMode === "best" ? chipOn : chipOff}`}
              title="Tri : meilleure note"
            >
              ⭐
            </button>
            <button
              type="button"
              onClick={() => setSortMode("price")}
              className={`whitespace-nowrap ${chipBase} ${sortMode === "price" ? chipOn : chipOff}`}
              title="Tri : total dépensé"
            >
              💰
            </button>
          </div>
        </div>

        {!hasLoaded ? (
          <ul className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <RestaurantCardSkeleton key={i} />
            ))}
          </ul>
        ) : visibleRestaurants.length === 0 ? (
  restaurants.length === 0 ? (
    // ✅ Etat vide "tu n'as aucun resto"
    <div className="flex flex-col items-center justify-center text-center px-6 py-16">
      <div className="text-5xl mb-4">🍝</div>

      <h3 className="text-lg font-semibold text-[var(--hr-ink)]">
        Aucun restaurant pour l’instant
      </h3>

      <p className="text-sm text-[var(--hr-muted)] mt-2 max-w-xs">
        Commence ton carnet perso en ajoutant ton premier resto via la recherche.
      </p>

      <Link
        href="/search"
        className="mt-6 px-6 py-3 rounded-2xl bg-[var(--hr-accent)] text-[var(--hr-cream)] font-semibold active:scale-[0.99]"
      >
        ➕ Ajouter mon premier restaurant
      </Link>
    </div>
  ) : (
    // ✅ Etat vide "aucun match dans la recherche"
    <div className="flex flex-col items-center justify-center text-center px-6 py-16">
      <div className="text-5xl mb-4">🔎</div>

      <h3 className="text-lg font-semibold text-[var(--hr-ink)]">
        Aucun résultat
      </h3>

      <p className="text-sm text-[var(--hr-muted)] mt-2 max-w-xs">
        Aucun restaurant ne correspond à{" "}
        <span className="font-medium text-[var(--hr-ink)]">
          “{search.trim()}”
        </span>
        .
      </p>

      <div className="mt-6 flex gap-2 w-full max-w-sm">
        <button
          type="button"
          onClick={() => setSearch("")}
          className="flex-1 py-3 rounded-2xl border border-[var(--hr-sand)] bg-[var(--hr-surface)] text-[var(--hr-ink)] font-semibold active:scale-[0.99]"
        >
          Réinitialiser
        </button>

        <Link
          href="/search"
          className="flex-1 py-3 rounded-2xl bg-[var(--hr-accent)] text-[var(--hr-cream)] font-semibold text-center active:scale-[0.99]"
        >
          Ajouter un resto
        </Link>
      </div>
    </div>
  )
) : (

          <ul className="space-y-3">
            {visibleRestaurants.map((restaurant) => (
              <RestaurantCard
                key={restaurant.id}
                restaurant={restaurant}
                onDelete={() => {
                  setConfirmDeleteId(restaurant.id);
                  setConfirmDeleteName(restaurant.name);
                }}
                onSave={(r, t, p) => saveRestaurant(restaurant.id, r, t, p)}
                onOpenVisits={() => setVisitsSheet({ id: restaurant.id, name: restaurant.name })}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ---------- UI Visites (BottomSheet) ---------- */

function formatDateFR(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function formatPriceEUR(v: number | null) {
  return v == null ? "—" : `€${v}`;
}

function VisitRowSkeleton() {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex-1 space-y-2">
        <div className="h-4 w-32 rounded bg-[var(--hr-sand)]/40 animate-pulse" />
        <div className="h-3 w-16 rounded bg-[var(--hr-sand)]/30 animate-pulse" />
      </div>
      <div className="h-10 w-10 rounded-full bg-[var(--hr-sand)]/35 animate-pulse" />
      <div className="h-10 w-10 rounded-full bg-[var(--hr-sand)]/35 animate-pulse" />
    </div>
  );
}

function VisitsList({
  restaurantId,
  visits,
  onEditVisit,
  onDeleteVisit,
}: {
  restaurantId: string;
  visits: VisitRow[];
  onEditVisit: (v: VisitRow) => void;
  onDeleteVisit: (visitId: string) => void;
}) {
  const iconBtn =
    "w-10 h-10 rounded-full border border-[var(--hr-sand)] bg-[var(--hr-surface)] " +
    "text-[var(--hr-ink)] flex items-center justify-center active:scale-[0.98]";

  const filtered = useMemo(() => {
    return visits
      .filter((v) => v.restaurant_id === restaurantId)
      .sort((a, b) => (a.visited_at < b.visited_at ? 1 : -1)); // ✅ desc (dernière en haut)
  }, [visits, restaurantId]);

  if (!restaurantId) return null;

  if (filtered.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-[var(--hr-muted)]">
        Aucune visite pour ce restaurant.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-[var(--hr-sand)]">
      {filtered.map((v) => (
        <li key={v.id} className="py-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[var(--hr-ink)]">{formatDateFR(v.visited_at)}</p>
              <p className="text-sm text-[var(--hr-muted)]">
                {v.price_eur == null ? "—" : `€${v.price_eur}`}
              </p>
            </div>

            <button
              type="button"
              className={iconBtn}
              title="Modifier"
              aria-label="Modifier la visite"
              onClick={() => onEditVisit(v)}
            >
              ✏️
            </button>

            <button
              type="button"
              onClick={() => onDeleteVisit(v.id)}
              className={iconBtn}
              title="Supprimer"
              aria-label="Supprimer la visite"
            >
                🗑
            </button>

            

          </div>
        </li>
      ))}
    </ul>
  );
}
