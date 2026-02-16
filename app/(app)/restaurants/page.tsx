"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  covers: number;
};

function formatDateFR(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function formatPriceEUR(v: number | null) {
  if (v == null) return "—";
  const n = Math.round(v * 10) / 10;
  return `€${n}`;
}

export default function RestaurantsPage() {
  const router = useRouter();
  const initOnceRef = useRef(false);
  const toastTimerRef = useRef<number | null>(null);

  const [userId, setUserId] = useState<string | null>(null);

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [visitsSheet, setVisitsSheet] = useState<{ id: string; name: string } | null>(null);

  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recent");

  const [toast, setToast] = useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState<string>("");

  const [editingVisit, setEditingVisit] = useState<VisitRow | null>(null);
  const [editVisitPrice, setEditVisitPrice] = useState<string>("");
  const [editVisitDate, setEditVisitDate] = useState<string>(""); // yyyy-mm-dd
  const [editVisitCovers, setEditVisitCovers] = useState<string>("2");
  const [savingVisit, setSavingVisit] = useState(false);

  const [confirmVisitDelete, setConfirmVisitDelete] = useState<{
    id: string;
    label: string; // ex: "12 janv. 2026 · €25 · 2 couverts"
  } | null>(null);

  const pushToast = (msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2000);
  };

  const fetchRestaurants = async (uid: string) => {
    const { data, error } = await supabase
      .from("restaurants")
      .select("id,name,city,rating,tags,country,created_at,place_id,price_eur")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erreur fetch restaurants:", error.message);
      return;
    }
    setRestaurants((data ?? []) as any);
  };

  const fetchVisits = async (uid: string) => {
    const { data, error } = await supabase
      .from("restaurant_visits")
      .select("id,restaurant_id,price_eur,visited_at,covers")
      .eq("user_id", uid);

    if (error) {
      console.error("Erreur fetch visits:", error.message);
      return;
    }
    setVisits((data ?? []) as VisitRow[]);
  };

  useEffect(() => {
    if (initOnceRef.current) return;
    initOnceRef.current = true;

    const init = async () => {
      setLoading(true);

      const { data } = await supabase.auth.getUser();
      const user = data.user;

      if (!user) {
        router.replace("/login");
        return;
      }

      setUserId(user.id);

      await Promise.all([fetchRestaurants(user.id), fetchVisits(user.id)]);
      setLoading(false);
    };

    init();

    const onChanged = async () => {
      if (!userId) return;
      await fetchVisits(userId);
    };
    window.addEventListener("visits:changed", onChanged);

    return () => {
      window.removeEventListener("visits:changed", onChanged);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, userId]);

  const deleteRestaurant = async (id: string) => {
    if (!userId) return;

    const { error } = await supabase.from("restaurants").delete().eq("id", id).eq("user_id", userId);

    if (error) {
      console.error("Erreur delete:", error.message);
      pushToast("❌ Erreur suppression");
      return;
    }

    await Promise.all([fetchRestaurants(userId), fetchVisits(userId)]);
    pushToast("🗑 Restaurant supprimé");
  };

  const saveRestaurant = async (
    id: string,
    newRating: number,
    tags: string[],
    price_eur: number | null
  ) => {
    if (!userId) return;

    const safeRating = Math.min(20, Math.max(0, newRating));

    const { error } = await supabase
      .from("restaurants")
      .update({ rating: safeRating, tags, price_eur })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      console.error("Erreur save:", error.message);
      pushToast("❌ Erreur sauvegarde");
      return;
    }

    await fetchRestaurants(userId);
    pushToast("💾 Modifications sauvegardées");
  };

  const saveVisit = async (
    visitId: string,
    price_eur: number | null,
    visited_at: string,
    covers: number
  ) => {
    if (!userId) return;

    const { error } = await supabase
      .from("restaurant_visits")
      .update({ price_eur, visited_at, covers })
      .eq("id", visitId)
      .eq("user_id", userId);

    if (error) {
      console.error("Erreur update visit:", error.message);
      pushToast("❌ Erreur sauvegarde visite");
      return;
    }

    await fetchVisits(userId);
    window.dispatchEvent(new Event("visits:changed"));
    pushToast("💾 Visite modifiée");
  };

  const deleteVisit = async (visitId: string) => {
    if (!userId) return;

    const { error } = await supabase
      .from("restaurant_visits")
      .delete()
      .eq("id", visitId)
      .eq("user_id", userId);

    if (error) {
      console.error("Erreur delete visit:", error.message);
      pushToast("❌ Erreur suppression visite");
      return;
    }

    await fetchVisits(userId);
    window.dispatchEvent(new Event("visits:changed"));
    pushToast("🗑 Visite supprimée");
  };

  // UI chips
  const chipBase =
    "px-3 py-2 rounded-full text-sm font-semibold transition active:scale-[0.98] " +
    "focus:outline-none focus:ring-2 focus:ring-[var(--hr-accent)]/30 whitespace-nowrap";
  const chipOn =
    "bg-[var(--hr-accent)] text-[var(--hr-cream)] shadow-sm border border-[var(--hr-accent)]";
  const chipOff =
    "bg-[var(--hr-surface)]/60 text-[var(--hr-muted)] border border-[var(--hr-sand)]/70 hover:bg-[var(--hr-sand)]/15";

  // Stats : somme + count + last visit
  const restaurantsWithStats = useMemo(() => {
    const map = new Map<string, { count: number; sum: number; last: string | null }>();

    for (const v of visits) {
      const cur = map.get(v.restaurant_id) ?? { count: 0, sum: 0, last: null };
      cur.count += 1;
      cur.sum += Number(v.price_eur) || 0;

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
      const tags = (restaurant.tags ?? []).map((t) => String(t).toLowerCase());

      return terms.every(
        (term) => name.includes(term) || city.includes(term) || tags.some((tag) => tag.includes(term))
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

    // recent
    sorted.sort((a: any, b: any) => {
      const la = a.last_visit_at;
      const lb = b.last_visit_at;

      if (la && lb) return la < lb ? 1 : -1;
      if (la && !lb) return -1;
      if (!la && lb) return 1;

      const ca = a.created_at ?? "";
      const cb = b.created_at ?? "";
      return ca < cb ? 1 : -1;
    });

    return sorted;
  }, [restaurantsWithStats, search, sortMode]);

  // ouvrir édition visite
  const openEditVisit = (v: VisitRow) => {
    setEditingVisit(v);
    setEditVisitPrice(v.price_eur == null ? "" : String(v.price_eur));
    setEditVisitCovers(String(v.covers ?? 2));

    const d = new Date(v.visited_at);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    setEditVisitDate(`${yyyy}-${mm}-${dd}`);
  };

  // sauver édition visite
  const submitEditVisit = async () => {
    if (!editingVisit) return;

    const parsedCovers = Number(editVisitCovers);
    const safeCovers =
      Number.isFinite(parsedCovers) && Number.isInteger(parsedCovers) ? Math.max(1, parsedCovers) : null;

    if (safeCovers == null) {
      pushToast("❌ Couverts invalides (min 1).");
      return;
    }

    setSavingVisit(true);
    try {
      const parsedPrice = editVisitPrice.trim() === "" ? null : Number(editVisitPrice);
      const safePrice =
        parsedPrice == null ? null : Number.isFinite(parsedPrice) ? Math.max(0, parsedPrice) : null;

      const base = new Date(editingVisit.visited_at);
      const hh = Number.isNaN(base.getTime()) ? 12 : base.getHours();
      const min = Number.isNaN(base.getTime()) ? 0 : base.getMinutes();

      const newISO = new Date(
        `${editVisitDate}T${String(hh).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`
      ).toISOString();

      await saveVisit(editingVisit.id, safePrice, newISO, safeCovers);
      setEditingVisit(null);
    } finally {
      setSavingVisit(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toast */}
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
        {loading ? (
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
                label: `${formatDateFR(v.visited_at)} · ${formatPriceEUR(v.price_eur)} · ${v.covers ?? 1} couvert(s)`,
              });
            }}
          />
        )}
      </BottomSheet>

      {/* Confirm delete visit */}
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

      {/* BottomSheet : Edit visite */}
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

            <div className="grid grid-cols-2 gap-3">
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

  <div className="space-y-2">
    <label className="text-sm font-medium">Couverts</label>
    <input
      type="number"
      min={1}
      step={1}
      placeholder="ex: 2"
      value={editVisitCovers}
      onChange={(e) => setEditVisitCovers(e.target.value)}
      className="w-full border border-[var(--hr-sand)] p-3 rounded-2xl bg-[var(--hr-surface)]"
    />
  </div>

  <p className="col-span-2 text-right text-xs text-[var(--hr-muted)] -mt-1">
    Minimum 1 couvert.
  </p>
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
          <span className="font-medium text-[var(--hr-ink)]">{confirmDeleteName}</span>. Cette action
          est définitive.
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
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">🍴 Mes restaurants</h1>
          </div>
        </div>

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
          <h2 className="font-semibold shrink-0">📌 Liste</h2>

          {/* ✅ anti-coupure chips */}
          <div className="-mx-4 px-4">
            <div className="flex gap-2 overflow-x-auto pb-2 pt-1 pr-2">
              <button
                type="button"
                onClick={() => setSortMode("recent")}
                className={`${chipBase} ${sortMode === "recent" ? chipOn : chipOff}`}
                title="Tri : récents"
              >
                🕒
              </button>
              <button
                type="button"
                onClick={() => setSortMode("best")}
                className={`${chipBase} ${sortMode === "best" ? chipOn : chipOff}`}
                title="Tri : meilleure note"
              >
                ⭐
              </button>
              <button
                type="button"
                onClick={() => setSortMode("price")}
                className={`${chipBase} ${sortMode === "price" ? chipOn : chipOff}`}
                title="Tri : total dépensé"
              >
                💰
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <ul className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <RestaurantCardSkeleton key={i} />
            ))}
          </ul>
        ) : visibleRestaurants.length === 0 ? (
          restaurants.length === 0 ? (
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
            <div className="flex flex-col items-center justify-center text-center px-6 py-16">
              <div className="text-5xl mb-4">🔎</div>

              <h3 className="text-lg font-semibold text-[var(--hr-ink)]">Aucun résultat</h3>

              <p className="text-sm text-[var(--hr-muted)] mt-2 max-w-xs">
                Aucun restaurant ne correspond à{" "}
                <span className="font-medium text-[var(--hr-ink)]">“{search.trim()}”</span>.
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
      .sort((a, b) => (a.visited_at < b.visited_at ? 1 : -1));
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
                {formatPriceEUR(v.price_eur)} · {v.covers ?? 1} couvert(s)
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
