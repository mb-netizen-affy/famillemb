"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type ProfilePublic = {
  id: string;
  name: string | null;
  last_name: string | null;
  is_public: boolean;
};

type RestaurantRow = {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  rating: number | null;
  tags: string[] | null;
  created_at: string;
};

type VisitRow = {
  id: string;
  restaurant_id: string;
  price_eur: number | null;
  visited_at: string;
  covers: number;
};

function clampRating(v: number) {
  return Math.min(20, Math.max(0, v));
}

function yearFromISO(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  return Number.isFinite(y) ? y : null;
}

function formatEUR(v: number) {
  const n = Math.round(v * 10) / 10;
  return `${n}€`;
}

export default function PublicProfilePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [profile, setProfile] = useState<ProfilePublic | null>(null);
  const [restaurants, setRestaurants] = useState<RestaurantRow[]>([]);
  const [visits, setVisits] = useState<VisitRow[]>([]);

  const [yearFilter, setYearFilter] = useState<number | "all">("all");

  useEffect(() => {
    const load = async () => {
      if (!id) return;

      setLoading(true);
      setNotFound(false);

      // 1) profile
      const { data: p, error: pErr } = await supabase
        .from("profiles")
        .select("id,name,last_name,is_public")
        .eq("id", id)
        .maybeSingle();

      if (pErr || !p || !p.is_public) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setProfile(p as any);

      // 2) restaurants + visits (RLS fait le filtre public)
      const { data: r } = await supabase
        .from("restaurants")
        .select("id,name,city,country,rating,tags,created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false });

      setRestaurants((r ?? []) as any);

      const { data: v } = await supabase
        .from("restaurant_visits")
        .select("id,restaurant_id,price_eur,visited_at,covers")
        .eq("user_id", id);

      setVisits((v ?? []) as any);

      setLoading(false);
    };

    load();
  }, [id]);

  const availableYears = useMemo(() => {
    const set = new Set<number>();
    for (const v of visits) {
      const y = yearFromISO(v.visited_at);
      if (y) set.add(y);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [visits]);

  const visitsFiltered = useMemo(() => {
    if (yearFilter === "all") return visits;
    return visits.filter((v) => yearFromISO(v.visited_at) === yearFilter);
  }, [visits, yearFilter]);

  const restaurantIdsInYear = useMemo(() => {
    if (yearFilter === "all") return null;
    const set = new Set<string>();
    for (const v of visitsFiltered) set.add(v.restaurant_id);
    return set;
  }, [visitsFiltered, yearFilter]);

  const restaurantsFiltered = useMemo(() => {
    if (!restaurantIdsInYear) return restaurants;
    return restaurants.filter((r) => restaurantIdsInYear.has(r.id));
  }, [restaurants, restaurantIdsInYear]);

  const stats = useMemo(() => {
    const totalRestaurants = restaurantsFiltered.length;

    const avg =
      totalRestaurants === 0
        ? 0
        : restaurantsFiltered.reduce((sum, r) => {
            const val = Number(r.rating);
            return sum + (Number.isFinite(val) ? clampRating(val) : 0);
          }, 0) / totalRestaurants;

    let totalSpent = 0;
    let totalCovers = 0;

    for (const v of visitsFiltered) {
      const price = v.price_eur == null ? null : Number(v.price_eur);
      const covers = Number(v.covers ?? 0);

      if (price != null && Number.isFinite(price)) totalSpent += price;
      if (covers > 0 && Number.isFinite(covers)) totalCovers += covers;
    }

    const avgPerCover =
      totalCovers > 0 ? Math.round((totalSpent / totalCovers) * 10) / 10 : null;

    return {
      totalRestaurants,
      visitCount: visitsFiltered.length,
      totalSpent: Math.round(totalSpent * 10) / 10,
      totalCovers,
      avg: Math.round(avg * 10) / 10,
      avgPerCover,
    };
  }, [restaurantsFiltered, visitsFiltered]);

  const chipBase =
    "px-3 py-2 rounded-full text-sm font-semibold transition active:scale-[0.98] " +
    "focus:outline-none focus:ring-2 focus:ring-[var(--hr-accent)]/30 whitespace-nowrap";
  const chipOn =
    "bg-[var(--hr-accent)] text-[var(--hr-cream)] shadow-sm border border-[var(--hr-accent)]";
  const chipOff =
    "bg-[var(--hr-surface)]/60 text-[var(--hr-muted)] border border-[var(--hr-sand)]/70 hover:bg-[var(--hr-sand)]/15";

  if (loading) {
    return (
      <main className="min-h-screen bg-[var(--hr-cream)] text-[var(--hr-ink)] px-4 py-10">
        <div className="max-w-md mx-auto text-sm text-[var(--hr-muted)]">Chargement…</div>
      </main>
    );
  }

  if (notFound || !profile) {
    return (
      <main className="min-h-screen bg-[var(--hr-cream)] text-[var(--hr-ink)] px-4 py-10">
        <div className="max-w-md mx-auto bg-[var(--hr-surface)] border border-[var(--hr-sand)] rounded-2xl p-5 shadow-sm">
          <p className="font-semibold">Profil indisponible</p>
          <p className="text-sm text-[var(--hr-muted)] mt-1">
            Ce compte est privé ou le lien est invalide.
          </p>
        </div>
      </main>
    );
  }

  const displayName = `${profile.name ?? ""} ${profile.last_name ?? ""}`.trim() || "Profil public";

  return (
    <main className="min-h-screen bg-[var(--hr-cream)] text-[var(--hr-ink)] px-4 py-10 pb-10">
      <div className="max-w-md mx-auto space-y-5">
        <header className="space-y-1">
          <h1 className="text-xl font-bold">🍴 {displayName}</h1>
          <p className="text-sm text-[var(--hr-muted)]">Carnet public</p>
        </header>

        {/* Année */}
        <section className="space-y-2">
          <p className="text-sm font-semibold">Année</p>
          <div className="-mx-4 px-4">
            <div className="flex gap-2 overflow-x-auto pb-2 pt-1 pr-2">
              <button
                type="button"
                onClick={() => setYearFilter("all")}
                className={`${chipBase} ${yearFilter === "all" ? chipOn : chipOff}`}
              >
                Tout
              </button>
              {availableYears.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setYearFilter(y)}
                  className={`${chipBase} ${yearFilter === y ? chipOn : chipOff}`}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="grid grid-cols-2 gap-3">
          <StatCard title="Restaurants" value={String(stats.totalRestaurants)} />
          <StatCard title="Visites" value={String(stats.visitCount)} />
          <StatCard title="Total dépensé" value={formatEUR(stats.totalSpent)} />
          <StatCard title="€/couvert" value={stats.avgPerCover == null ? "—" : formatEUR(stats.avgPerCover)} />
        </section>

        {/* Liste (read-only) */}
        <section className="space-y-3">
          <p className="text-sm font-semibold">Restaurants</p>

          {restaurantsFiltered.length === 0 ? (
            <div className="bg-[var(--hr-surface)] border border-[var(--hr-sand)] rounded-2xl p-4 shadow-sm text-sm text-[var(--hr-muted)]">
              Aucun restaurant sur cette période.
            </div>
          ) : (
            <ul className="space-y-3">
              {restaurantsFiltered.map((r) => (
                <li
                  key={r.id}
                  className="bg-[var(--hr-surface)] border border-[var(--hr-sand)] rounded-2xl p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{r.name}</p>
                      <p className="text-sm text-[var(--hr-muted)] truncate">
                        {[r.city, r.country].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <div className="shrink-0 text-sm font-semibold">
                      {r.rating == null ? "—" : `${clampRating(Number(r.rating))}/20`}
                    </div>
                  </div>

                  {r.tags?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {r.tags.slice(0, 5).map((t) => (
                        <span
                          key={t}
                          className="px-3 py-1 rounded-full border border-[var(--hr-sand)] bg-[var(--hr-sand)]/25 text-sm"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs text-[var(--hr-muted)]">
            €/couvert = total dépensé ÷ total couverts (sur la période filtrée).
          </p>
        </section>
      </div>
    </main>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-[var(--hr-surface)] border border-[var(--hr-sand)] rounded-2xl p-4 shadow-sm">
      <p className="text-xs text-[var(--hr-muted)]">{title}</p>
      <p className="mt-1 text-xl font-bold text-[var(--hr-ink)] leading-none truncate">{value}</p>
    </div>
  );
}
