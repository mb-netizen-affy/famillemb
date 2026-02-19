"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import Link from "next/link";


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

function initials(name: string) {
  const parts = name
    .split(" ")
    .map((p) => p.trim())
    .filter(Boolean);
  const a = parts[0]?.[0] ?? "U";
  const b = parts[1]?.[0] ?? "";
  return (a + b).toUpperCase();
}

function norm(s: string) {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "accent" | "muted";
}) {
  const base =
    "inline-flex items-center px-3 py-1 rounded-full border text-xs font-semibold whitespace-nowrap";
  const cls =
    tone === "accent"
      ? "border-[var(--hr-accent)] bg-[var(--hr-accent)] text-[var(--hr-cream)]"
      : tone === "muted"
      ? "border-[var(--hr-sand)] bg-[var(--hr-sand)]/20 text-[var(--hr-muted)]"
      : "border-[var(--hr-sand)] bg-[var(--hr-surface)] text-[var(--hr-ink)]";
  return <span className={`${base} ${cls}`}>{children}</span>;
}

function StatCard({
  title,
  value,
  sub,
}: {
  title: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-[var(--hr-surface)] border border-[var(--hr-sand)] rounded-2xl p-4 shadow-sm">
      <p className="text-xs text-[var(--hr-muted)]">{title}</p>
      <p className="mt-1 text-xl font-bold text-[var(--hr-ink)] leading-none truncate">
        {value}
      </p>
      {sub ? <p className="mt-2 text-xs text-[var(--hr-muted)]">{sub}</p> : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-sm text-[var(--hr-muted)]">{label}</span>
      <span className="text-sm font-semibold text-right text-[var(--hr-ink)]">
        {value}
      </span>
    </div>
  );
}

/**
 * ✅ Badge profil basé UNIQUEMENT sur tes tags.
 * - On prend les top tags (sur la période filtrée).
 * - On choisit le badge selon le tag dominant (ou des combinaisons).
 */
function profileBadgeFromTopTags(topTags: { tag: string; n: number }[]) {
  const top = topTags.map((t) => t.tag);
  const topNorm = top.map((t) => norm(t));

  const has = (tag: string) => topNorm.includes(norm(tag));

  // combos "concept"
  if (has("Gastronomique")) return { label: "💎 Fine dining" };
  if (has("Bistrot")) return { label: "🍷 Bistrot lover" };
  if (has("Brunch")) return { label: "🥐 Brunch addict" };
  if (has("Tapas / Partage")) return { label: "🍢 Team partage" };
  if (has("Street food")) return { label: "🍔 Street-food lover" };
  if (has("Fast-food")) return { label: "⚡ Fast & tasty" };
  if (has("Volonté")) return { label: "🍽️ Buffet champion" };

  // régime / ambiance
  if (has("Vegan")) return { label: "🥗 Vegan mood" };
  if (has("Romantique")) return { label: "💘 Date night" };
  if (has("Familial")) return { label: "👨‍👩‍👧‍👦 Family friendly" };

  // cuisines
  if (has("Italien")) return { label: "🍕 Italien dans l’âme" };
  if (has("Français")) return { label: "🥖 Terroir & tradition" };
  if (has("Asiatique")) return { label: "🍜 Asia vibes" };
  if (has("Indien")) return { label: "🌶️ Spice lover" };
  if (has("Oriental")) return { label: "🧿 Saveurs orientales" };
  if (has("Mexicain")) return { label: "🌮 Mexico mood" };
  if (has("Américain")) return { label: "🗽 American diner" };
  if (has("Méditerranéen")) return { label: "🫒 Méditerranée" };

  // fallback si pas de tags
  return { label: "🍽️ Gourmand curieux" };
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

      // après restaurants/visits fetch
      const { data: p2 } = await supabase
        .from("profiles")
        .select("is_public")
        .eq("id", id)
        .maybeSingle();

      if (!p2?.is_public) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setProfile(p as any);

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

  const visitsCountByRestaurant = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of visitsFiltered) {
      map.set(v.restaurant_id, (map.get(v.restaurant_id) ?? 0) + 1);
    }
    return map;
  }, [visitsFiltered]);

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

    const cityCount = new Map<string, number>();
    const countryCount = new Map<string, number>();

    for (const r of restaurantsFiltered) {
      const city = (r.city ?? "").trim();
      const country = (r.country ?? "").trim();
      if (city) cityCount.set(city, (cityCount.get(city) ?? 0) + 1);
      if (country) countryCount.set(country, (countryCount.get(country) ?? 0) + 1);
    }

    const topCity =
      cityCount.size === 0
        ? "—"
        : Array.from(cityCount.entries()).sort((a, b) => b[1] - a[1])[0][0];

    const topCountry =
      countryCount.size === 0
        ? "—"
        : Array.from(countryCount.entries()).sort((a, b) => b[1] - a[1])[0][0];

    // ✅ Top tags (sur la période)
    const tagsCount = new Map<string, number>();
    for (const r of restaurantsFiltered) {
      for (const t of r.tags ?? []) {
        const key = String(t).trim();
        if (!key) continue;
        tagsCount.set(key, (tagsCount.get(key) ?? 0) + 1);
      }
    }
    const topTags = Array.from(tagsCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([tag, n]) => ({ tag, n }));

    return {
      totalRestaurants,
      visitCount: visitsFiltered.length,
      totalSpent: Math.round(totalSpent * 10) / 10,
      totalCovers,
      avg: Math.round(avg * 10) / 10,
      avgPerCover,
      topCity,
      topCountry,
      topTags,
    };
  }, [restaurantsFiltered, visitsFiltered]);

  const profileBadge = useMemo(() => {
    return profileBadgeFromTopTags(stats.topTags);
  }, [stats.topTags]);

  // ✅ TOP 3 par note (sur la période)
  const topRatedRestaurants = useMemo(() => {
    const rated = restaurantsFiltered
      .map((r) => ({
        ...r,
        _rating: r.rating == null ? null : clampRating(Number(r.rating)),
      }))
      .filter((r) => r._rating != null);

    rated.sort((a, b) => {
      const ra = a._rating ?? -1;
      const rb = b._rating ?? -1;
      if (rb !== ra) return rb - ra;

      const va = visitsCountByRestaurant.get(a.id) ?? 0;
      const vb = visitsCountByRestaurant.get(b.id) ?? 0;
      if (vb !== va) return vb - va;

      return String(a.name).localeCompare(String(b.name), "fr");
    });

    return rated.slice(0, 3);
  }, [restaurantsFiltered, visitsCountByRestaurant]);

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
        <div className="max-w-md mx-auto space-y-4">
          <div className="h-20 rounded-3xl bg-[var(--hr-sand)]/35" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-24 rounded-2xl bg-[var(--hr-sand)]/35" />
            <div className="h-24 rounded-2xl bg-[var(--hr-sand)]/35" />
            <div className="h-24 rounded-2xl bg-[var(--hr-sand)]/35" />
            <div className="h-24 rounded-2xl bg-[var(--hr-sand)]/35" />
          </div>
          <div className="h-48 rounded-2xl bg-[var(--hr-sand)]/35" />
        </div>
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

  const displayName =
    `${profile.name ?? ""} ${profile.last_name ?? ""}`.trim() || "Profil public";

  const empty =
    visits.length === 0 || (yearFilter !== "all" && visitsFiltered.length === 0);

  return (
    <main className="min-h-screen bg-[var(--hr-cream)] text-[var(--hr-ink)] px-4 py-10 pb-10">
      <div className="max-w-md mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <Link
            href="/community"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl border border-[var(--hr-sand)] bg-[var(--hr-surface)] text-[var(--hr-ink)] font-semibold active:scale-[0.99]"
            aria-label="Retour à la communauté"
            title="Retour"
          >
            <span className="text-lg leading-none">←</span>
            <span className="text-sm">Communauté</span>
          </Link>
        </div>
        {/* HERO */}
        <section className="bg-[var(--hr-surface)] border border-[var(--hr-sand)] rounded-3xl p-5 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl border border-[var(--hr-sand)] bg-[var(--hr-sand)]/20 flex items-center justify-center text-lg font-bold">
              {initials(displayName)}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-lg font-bold truncate">{displayName}</h1>
                  <p className="text-sm text-[var(--hr-muted)] truncate">
                    Carnet public · {stats.totalRestaurants} restos · {stats.visitCount} visites
                  </p>
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                  <Pill tone="accent">Public</Pill>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {/* ✅ BADGE PROFIL basé sur tags */}
                <Pill tone="neutral">{profileBadge.label}</Pill>
                {stats.topCity !== "—" ? <Pill tone="muted">📍 {stats.topCity}</Pill> : null}
                {stats.topCountry !== "—" ? <Pill tone="muted">🌍 {stats.topCountry}</Pill> : null}
              </div>
            </div>
          </div>
        </section>

        {/* FILTRE ANNÉE */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Période</p>
            <span className="text-xs text-[var(--hr-muted)]">
              {yearFilter === "all" ? "Toutes les années" : `Année ${yearFilter}`}
            </span>
          </div>

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

        {/* STATS */}
        {empty ? (
          <section className="bg-[var(--hr-surface)] border border-[var(--hr-sand)] rounded-2xl p-5 shadow-sm">
            <p className="font-semibold">
              {visits.length === 0
                ? "Aucune visite pour l’instant."
                : "Aucune visite sur cette période."}
            </p>
            <p className="text-sm text-[var(--hr-muted)] mt-1">
              Les stats publiques apparaissent quand des visites existent (avec prix & couverts).
            </p>
          </section>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-3">
              <StatCard title="Restaurants" value={String(stats.totalRestaurants)} sub="Sur la période" />
              <StatCard title="Visites" value={String(stats.visitCount)} sub={`${stats.totalCovers} couverts`} />
              <StatCard title="Total dépensé" value={formatEUR(stats.totalSpent)} sub="Somme des visites" />
              <StatCard
                title="€/couvert"
                value={stats.avgPerCover == null ? "—" : formatEUR(stats.avgPerCover)}
                sub="Total ÷ couverts"
              />
            </section>

            <section className="bg-[var(--hr-surface)] border border-[var(--hr-sand)] rounded-2xl p-4 shadow-sm space-y-2">
              <p className="text-sm font-semibold">Highlights</p>
              <div className="grid grid-cols-1 gap-2">
                <Row label="Note moyenne" value={`${stats.avg}/20`} />
                <Row label="Ville #1" value={stats.topCity} />
                <Row label="Pays #1" value={stats.topCountry} />
                <Row
                  label="Top tags"
                  value={
                    stats.topTags.length === 0 ? (
                      "—"
                    ) : (
                      <span className="inline-flex flex-wrap gap-2 justify-end">
                        {stats.topTags.map((t) => (
                          <span
                            key={t.tag}
                            className="px-3 py-1 rounded-full border border-[var(--hr-sand)] bg-[var(--hr-sand)]/25 text-xs font-semibold"
                          >
                            #{t.tag} <span className="text-[var(--hr-muted)]">• {t.n}</span>
                          </span>
                        ))}
                      </span>
                    )
                  }
                />
              </div>
            </section>
          </>
        )}

        {/* TOP 3 */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">🏆 Top 3 (meilleures notes)</p>
            <span className="text-xs text-[var(--hr-muted)]">
              {yearFilter === "all" ? "Tout" : yearFilter}
            </span>
          </div>

          {topRatedRestaurants.length === 0 ? (
            <div className="bg-[var(--hr-surface)] border border-[var(--hr-sand)] rounded-2xl p-4 shadow-sm text-sm text-[var(--hr-muted)]">
              Aucun restaurant noté sur cette période.
            </div>
          ) : (
            <ul className="space-y-3">
              {topRatedRestaurants.map((r, idx) => {
                const visitsCount = visitsCountByRestaurant.get(r.id) ?? 0;
                const rating = clampRating(Number(r.rating));
                const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉";

                return (
                  <li
                    key={r.id}
                    className="bg-[var(--hr-surface)] border border-[var(--hr-sand)] rounded-2xl p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold truncate">
                          {medal} {r.name}
                        </p>
                        <p className="text-sm text-[var(--hr-muted)] truncate">
                          {[r.city, r.country].filter(Boolean).join(" · ") || "—"}
                        </p>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <Pill tone="neutral">⭐ {rating}/20</Pill>
                          <Pill tone="muted">🍽 {visitsCount} visite(s)</Pill>
                        </div>
                      </div>

                      <span className="text-[var(--hr-muted)] text-lg leading-none">›</span>
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
                );
              })}
            </ul>
          )}

          <p className="text-xs text-[var(--hr-muted)]">
            Tri : note décroissante, puis nombre de visites (en cas d’égalité).
          </p>
        </section>

        <p className="text-xs text-[var(--hr-muted)]">
          €/couvert = total dépensé ÷ total couverts (sur la période filtrée).
        </p>
      </div>
    </main>
  );
}
