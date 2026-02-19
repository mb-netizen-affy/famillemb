"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import type { Restaurant } from "../../components/types";

function clampRating(v: number) {
  return Math.min(20, Math.max(0, v));
}

type VisitRow = {
  id: string;
  user_id: string;
  restaurant_id: string;
  price_eur: number | null;
  visited_at: string;
  covers: number;
};

function formatEUR(v: number) {
  const n = Math.round(v * 10) / 10;
  return `${n}€`;
}

function formatDateFR(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function yearFromISO(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  return Number.isFinite(y) ? y : null;
}

function monthKeyFR(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = d.toLocaleDateString("fr-FR", { month: "long" });
  return `${m} ${y}`;
}

function norm(s: string) {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
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

function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "accent" | "muted";
}) {
  const base = "inline-flex items-center px-3 py-1 rounded-full border text-xs font-semibold whitespace-nowrap";
  const cls =
    tone === "accent"
      ? "border-[var(--hr-accent)] bg-[var(--hr-accent)] text-[var(--hr-cream)]"
      : tone === "muted"
      ? "border-[var(--hr-sand)] bg-[var(--hr-sand)]/20 text-[var(--hr-muted)]"
      : "border-[var(--hr-sand)] bg-[var(--hr-surface)] text-[var(--hr-ink)]";
  return <span className={`${base} ${cls}`}>{children}</span>;
}

function InsightCard({
  title,
  main,
  sub,
}: {
  title: string;
  main: string;
  sub: string;
}) {
  return (
    <div className="bg-[var(--hr-surface)] border border-[var(--hr-sand)] rounded-2xl p-4 shadow-sm">
      <p className="text-sm font-semibold text-[var(--hr-ink)]">{title}</p>
      <p className="mt-2 text-base font-bold text-[var(--hr-ink)] truncate">{main}</p>
      <p className="mt-1 text-sm text-[var(--hr-muted)]">{sub}</p>
    </div>
  );
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
      <p className="mt-1 text-xl font-bold text-[var(--hr-ink)] leading-none truncate">{value}</p>
      {sub ? <p className="mt-2 text-xs text-[var(--hr-muted)]">{sub}</p> : null}
    </div>
  );
}

function DeltaPill({ value }: { value: number }) {
  const up = value > 0;
  const eq = value === 0;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-xs font-semibold whitespace-nowrap ${
        eq
          ? "border-[var(--hr-sand)] bg-[var(--hr-sand)]/20 text-[var(--hr-muted)]"
          : up
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-red-200 bg-red-50 text-red-700"
      }`}
    >
      {eq ? "—" : up ? "↗" : "↘"} {Math.abs(value)}%
    </span>
  );
}

function badgeFromTopTags(topTags: { tag: string; n: number }[], stats: { avg: number; visitCount: number; avgPerCover: number | null }) {
  const tags = topTags.map((t) => norm(t.tag));

  const hasExact = (label: string) => tags.includes(norm(label));
  const hasAny = (labels: string[]) => labels.some((l) => hasExact(l));

  // Cuisine
  if (hasExact("Japonais") || hasExact("Asiatique")) return { label: "🍣 Addict d’Asie", sub: "Cuisine favorite" };
  if (hasExact("Italien")) return { label: "🍕 Italien dans l’âme", sub: "Cuisine favorite" };
  if (hasExact("Français")) return { label: "🥖 Tradition française", sub: "Cuisine favorite" };
  if (hasExact("Indien")) return { label: "🍛 Épicé & curieux", sub: "Cuisine favorite" };
  if (hasAny(["Oriental", "Méditerranéen"])) return { label: "🫒 Soleil en bouche", sub: "Cuisine favorite" };
  if (hasExact("Mexicain")) return { label: "🌮 Team Mexique", sub: "Cuisine favorite" };
  if (hasExact("Américain")) return { label: "🍔 US vibes", sub: "Cuisine favorite" };

  // Concepts / Ambiance / Régime
  if (hasExact("Gastronomique")) return { label: "💎 Fine dining", sub: "Plutôt gastro" };
  if (hasAny(["Bistrot", "Brunch"])) return { label: "☕ Bistrot lover", sub: "Confort food" };
  if (hasAny(["Street food", "Fast-food"])) return { label: "🚀 Street-food lover", sub: "Rapide & bon" };
  if (hasExact("Tapas / Partage")) return { label: "🍷 Partageur", sub: "Tapas & convivialité" };
  if (hasExact("Vegan")) return { label: "🥗 Vegan mood", sub: "Green vibes" };
  if (hasExact("Romantique")) return { label: "🌹 Romantique", sub: "Ambiance favorite" };
  if (hasExact("Familial")) return { label: "👨‍👩‍👧‍👦 Family friendly", sub: "Ambiance favorite" };

  // Fallback “comportement”
  if (stats.visitCount >= 30) return { label: "🔥 Gros mangeur", sub: "Beaucoup de visites" };
  if (stats.avg >= 16) return { label: "⭐ Exigeant", sub: "Notes élevées" };
  if (stats.avgPerCover != null && stats.avgPerCover >= 30) return { label: "💸 Grand seigneur", sub: "Panier / couvert élevé" };

  return { label: "🍽️ Gourmand curieux", sub: "Toujours en exploration" };
}

export default function StatsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  const [restaurants, setRestaurants] = useState<
    (Restaurant & {
      id?: string;
      country?: string;
      city?: string;
      tags?: string[];
      rating?: number;
      name?: string;
      user_id?: string;
    })[]
  >([]);
  const [visits, setVisits] = useState<VisitRow[]>([]);

  const [yearFilter, setYearFilter] = useState<number | "all">("all");

  // petit affichage hero : nom
  const [displayName, setDisplayName] = useState<string>("Mon carnet");

  const loadStats = async () => {
    const { data } = await supabase.auth.getUser();
    const user = data.user;

    if (!user) {
      router.replace("/login");
      return;
    }

    // nom pour le hero
    const { data: p } = await supabase
      .from("profiles")
      .select("name,last_name")
      .eq("id", user.id)
      .maybeSingle();

    const dn = `${(p as any)?.name ?? ""} ${(p as any)?.last_name ?? ""}`.trim();
    setDisplayName(dn || "Mon carnet");

    const { data: restos, error: rErr } = await supabase
      .from("restaurants")
      .select("id,name,rating,tags,city,country,created_at,user_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (rErr) console.error("Erreur restaurants:", rErr.message);
    setRestaurants((restos ?? []) as any);

    const { data: v, error: vErr } = await supabase
      .from("restaurant_visits")
      .select("id,user_id,restaurant_id,price_eur,visited_at,covers")
      .eq("user_id", user.id);

    if (vErr) console.error("Erreur visits:", vErr.message);
    setVisits((v ?? []) as VisitRow[]);
  };

  useEffect(() => {
    const init = async () => {
      await loadStats();
      setLoading(false);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const availableYears = useMemo(() => {
    const set = new Set<number>();
    for (const v of visits) {
      const y = yearFromISO(v.visited_at);
      if (y) set.add(y);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [visits]);

  useEffect(() => {
    if (yearFilter !== "all" && !availableYears.includes(yearFilter)) {
      setYearFilter("all");
    }
  }, [availableYears, yearFilter]);

  const chipBase =
    "px-3 py-2 rounded-full text-sm font-semibold transition active:scale-[0.98] " +
    "focus:outline-none focus:ring-2 focus:ring-[var(--hr-accent)]/30 whitespace-nowrap";
  const chipOn =
    "bg-[var(--hr-accent)] text-[var(--hr-cream)] shadow-sm border border-[var(--hr-accent)]";
  const chipOff =
    "bg-[var(--hr-surface)]/60 text-[var(--hr-muted)] border border-[var(--hr-sand)]/70 hover:bg-[var(--hr-sand)]/15";

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
    return restaurants.filter((r: any) => r.id && restaurantIdsInYear.has(String(r.id)));
  }, [restaurants, restaurantIdsInYear]);

  const stats = useMemo(() => {
    const totalRestaurants = restaurantsFiltered.length;

    const avg =
      totalRestaurants === 0
        ? 0
        : restaurantsFiltered.reduce((sum, r: any) => {
            const val = Number(r.rating);
            return sum + (Number.isFinite(val) ? clampRating(val) : 0);
          }, 0) / totalRestaurants;

    const validRatings = restaurantsFiltered
      .map((r: any) => Number(r.rating))
      .filter((n) => Number.isFinite(n))
      .map((n) => clampRating(n));

    const best = validRatings.length ? Math.max(...validRatings) : null;
    const worst = validRatings.length ? Math.min(...validRatings) : null;

    // Top tags
    const tagsCount = new Map<string, number>();
    for (const r of restaurantsFiltered as any) {
      for (const t of (r.tags ?? []) as string[]) {
        const key = String(t ?? "").trim();
        if (!key) continue;
        tagsCount.set(key, (tagsCount.get(key) ?? 0) + 1);
      }
    }
    const topTags = Array.from(tagsCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([tag, n]) => ({ tag, n }));

    // Ville #1
    const cityCount = new Map<string, number>();
    for (const r of restaurantsFiltered as any) {
      const c = String((r.city ?? "")).trim();
      if (!c) continue;
      cityCount.set(c, (cityCount.get(c) ?? 0) + 1);
    }
    const topCity =
      cityCount.size === 0 ? "—" : Array.from(cityCount.entries()).sort((a, b) => b[1] - a[1])[0][0];

    // Pays #1 + liste
    const countryCount = new Map<string, number>();
    for (const r of restaurantsFiltered as any) {
      const c = String((r.country ?? "")).trim();
      if (!c) continue;
      countryCount.set(c, (countryCount.get(c) ?? 0) + 1);
    }
    const topCountry =
      countryCount.size === 0 ? "—" : Array.from(countryCount.entries()).sort((a, b) => b[1] - a[1])[0][0];

    const countries = Array.from(countryCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    // Map id -> name (tous restos)
    const restoNameById = new Map<string, string>();
    for (const r of restaurants as any) {
      if (r.id) restoNameById.set(String(r.id), String(r.name ?? "—"));
    }

    let totalSpent = 0;
    let totalCovers = 0;

    let priciestVisit:
      | { restaurantName: string; price: number; visited_at: string }
      | null = null;

    const visitsCountByRestaurant = new Map<string, number>();
    const monthCount = new Map<string, number>();

    let bestPerCover:
      | { restaurantName: string; unit: number; covers: number; visited_at: string }
      | null = null;

    let worstPerCover:
      | { restaurantName: string; unit: number; covers: number; visited_at: string }
      | null = null;

    for (const v of visitsFiltered) {
      const price = v.price_eur == null ? null : Number(v.price_eur);
      const covers = Number(v.covers ?? 0);

      if (covers > 0 && Number.isFinite(covers)) totalCovers += covers;

      if (price != null && Number.isFinite(price)) {
        totalSpent += price;

        if (!priciestVisit || price > priciestVisit.price) {
          priciestVisit = {
            restaurantName: restoNameById.get(v.restaurant_id) ?? "—",
            price,
            visited_at: v.visited_at,
          };
        }

        if (covers > 0 && Number.isFinite(covers)) {
          const unit = price / covers;

          if (!bestPerCover || unit < bestPerCover.unit) {
            bestPerCover = {
              restaurantName: restoNameById.get(v.restaurant_id) ?? "—",
              unit,
              covers,
              visited_at: v.visited_at,
            };
          }

          if (!worstPerCover || unit > worstPerCover.unit) {
            worstPerCover = {
              restaurantName: restoNameById.get(v.restaurant_id) ?? "—",
              unit,
              covers,
              visited_at: v.visited_at,
            };
          }
        }
      }

      visitsCountByRestaurant.set(v.restaurant_id, (visitsCountByRestaurant.get(v.restaurant_id) ?? 0) + 1);

      const mk = monthKeyFR(v.visited_at);
      monthCount.set(mk, (monthCount.get(mk) ?? 0) + 1);
    }

    let mostVisited: { restaurantName: string; count: number } | null = null;
    for (const [rid, count] of visitsCountByRestaurant.entries()) {
      if (!mostVisited || count > mostVisited.count) {
        mostVisited = { restaurantName: restoNameById.get(rid) ?? "—", count };
      }
    }

    let mostActiveMonth: { label: string; count: number } | null = null;
    for (const [label, count] of monthCount.entries()) {
      if (!mostActiveMonth || count > mostActiveMonth.count) {
        mostActiveMonth = { label, count };
      }
    }

    const visitCount = visitsFiltered.length;
    const avgPerVisit = visitCount > 0 ? totalSpent / visitCount : null;

    const avgPerCover = totalCovers > 0 ? Math.round((totalSpent / totalCovers) * 10) / 10 : null;

    return {
      totalRestaurants,
      visitCount,
      totalCovers,
      avg: Math.round(avg * 10) / 10,
      best,
      worst,
      topCity,
      topCountry,
      totalSpent: Math.round(totalSpent * 10) / 10,
      avgPerVisit: avgPerVisit == null ? null : Math.round(avgPerVisit * 10) / 10,
      avgPerCover,
      bestPerCover,
      worstPerCover,
      priciestVisit,
      mostVisited,
      mostActiveMonth,
      countries,
      topTags,
    };
  }, [restaurants, restaurantsFiltered, visitsFiltered]);

  const gourmetBadge = useMemo(() => {
    return badgeFromTopTags(stats.topTags, {
      avg: stats.avg,
      visitCount: stats.visitCount,
      avgPerCover: stats.avgPerCover,
    });
  }, [stats.topTags, stats.avg, stats.visitCount, stats.avgPerCover]);

  // Compare vs année précédente
  const compare = useMemo(() => {
    if (yearFilter === "all") return null;
    const prevYear = yearFilter - 1;
    if (!availableYears.includes(prevYear)) return { prevYear, ok: false as const };

    const prevVisits = visits.filter((v) => yearFromISO(v.visited_at) === prevYear);

    let prevSpent = 0;
    for (const v of prevVisits) {
      const price = v.price_eur == null ? null : Number(v.price_eur);
      if (price != null && Number.isFinite(price)) prevSpent += price;
    }

    const prevVisitCount = prevVisits.length;

    const deltaPct = (cur: number, prev: number) => {
      if (prev <= 0) return null;
      return Math.round(((cur - prev) / prev) * 100);
    };

    return {
      prevYear,
      ok: true as const,
      spentDelta: deltaPct(stats.totalSpent, prevSpent),
      visitsDelta: deltaPct(stats.visitCount, prevVisitCount),
    };
  }, [yearFilter, availableYears, visits, stats.totalSpent, stats.visitCount]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[var(--hr-cream)] text-[var(--hr-ink)] px-4 py-10 pb-28">
        <div className="max-w-md mx-auto space-y-5">
          <div className="h-20 rounded-3xl bg-[var(--hr-sand)]/35" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-24 rounded-2xl bg-[var(--hr-sand)]/40" />
            <div className="h-24 rounded-2xl bg-[var(--hr-sand)]/40" />
            <div className="h-24 rounded-2xl bg-[var(--hr-sand)]/40" />
            <div className="h-24 rounded-2xl bg-[var(--hr-sand)]/40" />
          </div>
          <div className="h-28 rounded-2xl bg-[var(--hr-sand)]/40" />
        </div>
      </main>
    );
  }

  const empty = visits.length === 0 || (yearFilter !== "all" && visitsFiltered.length === 0);

  return (
    <main className="min-h-screen bg-[var(--hr-cream)] text-[var(--hr-ink)] px-4 py-10 pb-28">
      <div className="max-w-md mx-auto space-y-5">
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
                    Tes stats · {stats.totalRestaurants} restos · {stats.visitCount} visites
                  </p>
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                  <Pill tone="accent">📊 Stats</Pill>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Pill tone="neutral">{gourmetBadge.label}</Pill>
                {stats.topCity !== "—" ? <Pill tone="muted">📍 {stats.topCity}</Pill> : null}
                {stats.topCountry !== "—" ? <Pill tone="muted">🌍 {stats.topCountry}</Pill> : null}
                {stats.topTags.length ? (
                  <Pill tone="muted">
                    🏷️ {stats.topTags.map((t) => t.tag).slice(0, 2).join(" · ")}
                    {stats.topTags.length > 2 ? " · +" : ""}
                  </Pill>
                ) : null}
              </div>

              {gourmetBadge.sub ? (
                <p className="mt-3 text-xs text-[var(--hr-muted)]">{gourmetBadge.sub}</p>
              ) : null}
            </div>
          </div>
        </section>

        {/* Année */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Année</p>
          </div>

          <div className="-mx-4 px-4">
            <div className="flex gap-2 overflow-x-auto pb-2 pt-1 pr-2">
              <button
                type="button"
                onClick={() => setYearFilter("all")}
                className={`${chipBase} ${yearFilter === "all" ? chipOn : chipOff}`}
                title="Toutes les années"
              >
                Tout
              </button>

              {availableYears.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setYearFilter(y)}
                  className={`${chipBase} ${yearFilter === y ? chipOn : chipOff}`}
                  title={`Année ${y}`}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>

          {compare && yearFilter !== "all" ? (
            <div className="text-xs text-[var(--hr-muted)] flex items-center justify-between gap-3">
              <span>Comparaison vs {compare.prevYear}</span>

              {compare.ok ? (
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-2">
                    <span className="text-[var(--hr-muted)]">Dépenses</span>
                    {compare.spentDelta != null ? <DeltaPill value={compare.spentDelta} /> : <span>—</span>}
                  </span>

                  <span className="inline-flex items-center gap-2">
                    <span className="text-[var(--hr-muted)]">Visites</span>
                    {compare.visitsDelta != null ? <DeltaPill value={compare.visitsDelta} /> : <span>—</span>}
                  </span>
                </div>
              ) : (
                <span>(pas de données)</span>
              )}
            </div>
          ) : null}
        </section>

        {empty ? (
          <section className="bg-[var(--hr-surface)] border border-[var(--hr-sand)] rounded-2xl p-5 shadow-sm">
            <p className="font-semibold">
              {visits.length === 0 ? "Aucune visite pour l’instant." : "Aucune visite sur cette année."}
            </p>
            <p className="text-sm text-[var(--hr-muted)] mt-1">
              Ajoute une visite (avec un prix) sur un restaurant pour débloquer tes statistiques.
            </p>
          </section>
        ) : (
          <>
            {/* Résumé */}
            <section className="grid grid-cols-2 gap-3">
              <StatCard title="Restaurants" value={String(stats.totalRestaurants)} />
              <StatCard
                title="Visites"
                value={String(stats.visitCount)}
                sub={stats.avgPerVisit == null ? undefined : `~ ${formatEUR(stats.avgPerVisit)} / visite`}
              />

              <StatCard title="Couverts" value={String(stats.totalCovers)} />
              <StatCard title="€/couvert" value={stats.avgPerCover == null ? "—" : formatEUR(stats.avgPerCover)} />

              <StatCard title="Moyenne" value={`${stats.avg}/20`} />
              <StatCard title="Total dépensé" value={formatEUR(stats.totalSpent)} />
            </section>

            {/* Highlights */}
            <section className="space-y-3">
              <div className="bg-[var(--hr-surface)] border border-[var(--hr-sand)] rounded-2xl p-4 shadow-sm space-y-2">
                <p className="text-sm font-semibold">Highlights</p>

                <div className="grid grid-cols-1 gap-2">
                  <Row label="Meilleure note" value={stats.best == null ? "—" : `${stats.best}/20`} />
                  <Row label="Pire note" value={stats.worst == null ? "—" : `${stats.worst}/20`} />
                  <Row label="Ville #1" value={stats.topCity} />
                  <Row
                    label="Mois le + actif"
                    value={
                      stats.mostActiveMonth
                        ? `${stats.mostActiveMonth.label} • ${stats.mostActiveMonth.count} visite(s)`
                        : "—"
                    }
                  />
                </div>
              </div>

              <InsightCard
                title="🍽️ Resto où tu as le plus mangé"
                main={stats.mostVisited ? stats.mostVisited.restaurantName : "—"}
                sub={stats.mostVisited ? `${stats.mostVisited.count} visite(s)` : "Aucune visite"}
              />

              <InsightCard
                title="💸 Visite la plus chère"
                main={stats.priciestVisit ? stats.priciestVisit.restaurantName : "—"}
                sub={
                  stats.priciestVisit
                    ? `${formatEUR(stats.priciestVisit.price)} · ${formatDateFR(stats.priciestVisit.visited_at)}`
                    : "Aucune visite avec prix"
                }
              />

              <InsightCard
                title="🥗 Meilleur prix par couvert"
                main={stats.bestPerCover ? stats.bestPerCover.restaurantName : "—"}
                sub={
                  stats.bestPerCover
                    ? `${formatEUR(Math.round(stats.bestPerCover.unit * 10) / 10)} / couvert · ${
                        stats.bestPerCover.covers
                      } couverts · ${formatDateFR(stats.bestPerCover.visited_at)}`
                    : "Aucune visite exploitable"
                }
              />

              <InsightCard
                title="🦞 Plus cher par couvert"
                main={stats.worstPerCover ? stats.worstPerCover.restaurantName : "—"}
                sub={
                  stats.worstPerCover
                    ? `${formatEUR(Math.round(stats.worstPerCover.unit * 10) / 10)} / couvert · ${
                        stats.worstPerCover.covers
                      } couverts · ${formatDateFR(stats.worstPerCover.visited_at)}`
                    : "Aucune visite exploitable"
                }
              />
            </section>

            {/* Breakdowns */}
            <section className="space-y-3">
              <div className="bg-[var(--hr-surface)] border border-[var(--hr-sand)] rounded-2xl p-4 shadow-sm">
                <p className="text-sm font-semibold text-[var(--hr-ink)]">🌍 Restaurants par pays</p>

                {stats.countries.length === 0 ? (
                  <p className="text-sm text-[var(--hr-muted)] mt-2">
                    Ajoute des restos via Google pour remplir automatiquement le pays.
                  </p>
                ) : (
                  <div className="flex gap-2 flex-wrap mt-3">
                    {stats.countries.map(([country, count]) => (
                      <span
                        key={country}
                        className="px-3 py-1 rounded-full border border-[var(--hr-sand)] bg-[var(--hr-surface)] text-[var(--hr-ink)] text-sm"
                      >
                        {country} · {count}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-[var(--hr-surface)] border border-[var(--hr-sand)] rounded-2xl p-4 shadow-sm">
                <p className="text-sm font-semibold text-[var(--hr-ink)]">🏷️ Top tags</p>

                {stats.topTags.length === 0 ? (
                  <p className="text-sm text-[var(--hr-muted)] mt-2">
                    Ajoute quelques tags à tes restaurants pour voir tes tendances.
                  </p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {stats.topTags.map((t) => (
                      <span
                        key={t.tag}
                        className="px-3 py-1 rounded-full border border-[var(--hr-sand)] bg-[var(--hr-sand)]/25 text-sm"
                      >
                        #{t.tag} <span className="text-[var(--hr-muted)]">• {t.n}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <p className="text-xs text-[var(--hr-muted)]">
                Le filtre année se base sur tes <span className="font-medium text-[var(--hr-ink)]">visites</span>, pas la
                date de création du resto.
              </p>

              <p className="text-xs text-[var(--hr-muted)]">
                <span className="font-medium text-[var(--hr-ink)]">€/couvert</span> = total dépensé ÷ total couverts (sur
                la période filtrée).
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-sm text-[var(--hr-muted)]">{label}</span>
      <span className="text-sm font-semibold text-right text-[var(--hr-ink)]">{value}</span>
    </div>
  );
}
