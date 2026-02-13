"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import type { Restaurant } from "../../components/types";

function clampRating(v: number) {
  return Math.min(20, Math.max(0, v));
}

type ProfileRow = {
  name: string | null;
  last_name: string | null;
  locale: "fr" | "en" | "es" | "it" | "de";
};

type VisitRow = {
  id: string;
  restaurant_id: string;
  price_eur: number | null;
  visited_at: string;
};

const LOCALES: { value: ProfileRow["locale"]; label: string }[] = [
  { value: "fr", label: "🇫🇷 Français" },
  { value: "en", label: "🇬🇧 English" },
  { value: "es", label: "🇪🇸 Español" },
  { value: "it", label: "🇮🇹 Italiano" },
  { value: "de", label: "🇩🇪 Deutsch" },
];

function normalizeLocale(v: string | null | undefined): ProfileRow["locale"] {
  const x = (v ?? "").toLowerCase();
  if (x === "en" || x === "es" || x === "it" || x === "de") return x as any;
  return "fr";
}

function formatEUR(v: number) {
  return `${Math.round(v * 10) / 10}€`;
}

function formatDateFR(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
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

function yearFromISO(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  return Number.isFinite(y) ? y : null;
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("—");

  const [profile, setProfile] = useState<ProfileRow>({
    name: null,
    last_name: null,
    locale: "fr",
  });

  // Edition
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editLocale, setEditLocale] = useState<ProfileRow["locale"]>("fr");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Data stats
  const [restaurants, setRestaurants] = useState<
    (Restaurant & {
      id?: string;
      country?: string;
      city?: string;
      tags?: string[];
      rating?: number;
      name?: string;
    })[]
  >([]);
  const [visits, setVisits] = useState<VisitRow[]>([]);

  // ✅ filtre année
  const [yearFilter, setYearFilter] = useState<number | "all">("all");

  const loadAll = async () => {
    const { data } = await supabase.auth.getUser();
    const user = data.user;

    if (!user) {
      window.location.href = "/login";
      return;
    }

    setUserId(user.id);
    setEmail(user.email ?? "—");

    const { data: p } = await supabase
      .from("profiles")
      .select("name,last_name,locale")
      .eq("id", user.id)
      .maybeSingle();

    const pLocale = normalizeLocale((p as any)?.locale);

    setProfile({
      name: (p as any)?.name ?? null,
      last_name: (p as any)?.last_name ?? null,
      locale: pLocale,
    });

    setEditName(((p as any)?.name ?? "").toString());
    setEditLastName(((p as any)?.last_name ?? "").toString());
    setEditLocale(pLocale);

    const { data: restos } = await supabase
      .from("restaurants")
      .select("id,name,rating,tags,city,country,created_at")
      .order("created_at", { ascending: false });

    setRestaurants((restos ?? []) as any);

    const { data: v } = await supabase
      .from("restaurant_visits")
      .select("id,restaurant_id,price_eur,visited_at");

    setVisits((v ?? []) as VisitRow[]);
  };

  useEffect(() => {
    const init = async () => {
      await loadAll();
      setLoading(false);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ Années dispo (d’après les visites)
  const availableYears = useMemo(() => {
    const set = new Set<number>();
    for (const v of visits) {
      const y = yearFromISO(v.visited_at);
      if (y) set.add(y);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [visits]);

  useEffect(() => {
    if (availableYears.length === 0) return;
    if (yearFilter !== "all" && !availableYears.includes(yearFilter)) {
      setYearFilter("all");
    }
  }, [availableYears, yearFilter]);

  // ✅ visites filtrées par année
  const visitsFiltered = useMemo(() => {
    if (yearFilter === "all") return visits;
    return visits.filter((v) => yearFromISO(v.visited_at) === yearFilter);
  }, [visits, yearFilter]);

  // ✅ ids des restos concernés par l’année (restos visités dans la période)
  const restaurantIdsInYear = useMemo(() => {
    if (yearFilter === "all") return null;
    const set = new Set<string>();
    for (const v of visitsFiltered) set.add(v.restaurant_id);
    return set;
  }, [visitsFiltered, yearFilter]);

  // ✅ restos filtrés (si année sélectionnée : seulement ceux visités cette année)
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

    // ✅ BEST/WORST: uniquement sur les restos "pertinents" (déjà filtrés par visites si yearFilter)
    // + on ignore les notes invalides
    const validRatings = restaurantsFiltered
      .map((r: any) => Number(r.rating))
      .filter((n) => Number.isFinite(n))
      .map((n) => clampRating(n));

    const best = validRatings.length ? Math.max(...validRatings) : null;
    const worst = validRatings.length ? Math.min(...validRatings) : null;

    // Top tags (sur restos filtrés)
    const tagsCount = new Map<string, number>();
    for (const r of restaurantsFiltered as any) {
      for (const t of (r.tags ?? []) as string[]) {
        tagsCount.set(t, (tagsCount.get(t) ?? 0) + 1);
      }
    }
    const topTags = Array.from(tagsCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([tag]) => tag);

    // Ville #1 (sur restos filtrés)
    const cityCount = new Map<string, number>();
    for (const r of restaurantsFiltered as any) {
      const c = String((r.city ?? "")).trim();
      if (!c) continue;
      cityCount.set(c, (cityCount.get(c) ?? 0) + 1);
    }
    const topCity =
      cityCount.size === 0
        ? "—"
        : Array.from(cityCount.entries()).sort((a, b) => b[1] - a[1])[0][0];

    // Pays (sur restos filtrés)
    const countryCount = new Map<string, number>();
    for (const r of restaurantsFiltered as any) {
      const c = String((r.country ?? "")).trim();
      if (!c) continue;
      countryCount.set(c, (countryCount.get(c) ?? 0) + 1);
    }
    const countries = Array.from(countryCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    // Map id -> name (sur tous les restos)
    const restoNameById = new Map<string, string>();
    for (const r of restaurants as any) {
      if (r.id) restoNameById.set(String(r.id), String(r.name ?? "—"));
    }

    // Visites : total dépensé, visite la plus chère, resto le + mangé (sur visites filtrées)
    let totalSpent = 0;

    let priciestVisit:
      | { restaurantName: string; price: number; visited_at: string }
      | null = null;

    const visitsCountByRestaurant = new Map<string, number>();

    for (const v of visitsFiltered) {
      const price = v.price_eur == null ? null : Number(v.price_eur);
      if (price != null && Number.isFinite(price)) {
        totalSpent += price;
        if (!priciestVisit || price > priciestVisit.price) {
          priciestVisit = {
            restaurantName: restoNameById.get(v.restaurant_id) ?? "—",
            price,
            visited_at: v.visited_at,
          };
        }
      }

      visitsCountByRestaurant.set(
        v.restaurant_id,
        (visitsCountByRestaurant.get(v.restaurant_id) ?? 0) + 1
      );
    }

    // resto le + mangé
    let mostVisited: { restaurantName: string; count: number } | null = null;
    for (const [rid, count] of visitsCountByRestaurant.entries()) {
      if (!mostVisited || count > mostVisited.count) {
        mostVisited = {
          restaurantName: restoNameById.get(rid) ?? "—",
          count,
        };
      }
    }

    return {
      totalRestaurants,
      avg: Math.round(avg * 10) / 10,
      best,
      worst,
      topCity,
      topTags,
      totalSpent: Math.round(totalSpent * 10) / 10,
      priciestVisit,
      mostVisited,
      countries,
    };
  }, [restaurants, restaurantsFiltered, visitsFiltered]);

  const startEdit = () => {
    setMsg(null);
    setEditName((profile.name ?? "").toString());
    setEditLastName((profile.last_name ?? "").toString());
    setEditLocale(profile.locale);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setMsg(null);
    setIsEditing(false);
    setEditName((profile.name ?? "").toString());
    setEditLastName((profile.last_name ?? "").toString());
    setEditLocale(profile.locale);
  };

  const saveProfile = async () => {
    if (!userId) return;
    setSaving(true);
    setMsg(null);

    const cleanName = editName.trim().slice(0, 40);
    const cleanLast = editLastName.trim().slice(0, 40);

    const { error } = await supabase.from("profiles").upsert(
      {
        id: userId,
        name: cleanName,
        last_name: cleanLast,
        locale: editLocale,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (error) {
      setMsg("❌ Erreur lors de l’enregistrement.");
      setSaving(false);
      return;
    }

    setProfile((prev) => ({
      ...prev,
      name: cleanName,
      last_name: cleanLast,
      locale: editLocale,
    }));

    setIsEditing(false);
    setSaving(false);
    setMsg("✅ Profil mis à jour");
  };

  const chipBase =
    "px-3 py-2 rounded-full text-sm font-semibold transition active:scale-[0.98] " +
    "focus:outline-none focus:ring-2 focus:ring-[var(--hr-accent)]/30";
  const chipOn =
    "bg-[var(--hr-accent)] text-[var(--hr-cream)] shadow-sm border border-[var(--hr-accent)]";
  const chipOff =
    "bg-[var(--hr-surface)]/60 text-[var(--hr-muted)] border border-[var(--hr-sand)]/70 hover:bg-[var(--hr-sand)]/15";

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-7 w-28 rounded-xl bg-[var(--hr-sand)]/40" />
        <div className="rounded-2xl border border-[var(--hr-sand)] bg-[var(--hr-surface)] p-4 shadow-sm space-y-3">
          <div className="h-4 w-40 rounded-lg bg-[var(--hr-sand)]/40" />
          <div className="h-10 w-full rounded-2xl bg-[var(--hr-sand)]/40" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-12 rounded-2xl bg-[var(--hr-sand)]/40" />
            <div className="h-12 rounded-2xl bg-[var(--hr-sand)]/40" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="h-20 rounded-2xl bg-[var(--hr-sand)]/40" />
          <div className="h-20 rounded-2xl bg-[var(--hr-sand)]/40" />
          <div className="h-20 rounded-2xl bg-[var(--hr-sand)]/40" />
          <div className="h-20 rounded-2xl bg-[var(--hr-sand)]/40" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">👤 Profil</h1>

      {/* Bloc compte */}
      <section className="bg-[var(--hr-surface)] border border-[var(--hr-sand)] rounded-2xl p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-3 w-full">
            <div>
              <p className="text-xs text-[var(--hr-muted)]">Email</p>
              <p className="text-sm font-medium text-[var(--hr-ink)]">{email}</p>
            </div>

            {!isEditing ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <InfoPill label="Prénom" value={profile.name || "—"} />
                  <InfoPill label="Nom" value={profile.last_name || "—"} />
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-[var(--hr-muted)]">Langue</p>
                  <p className="text-sm font-semibold text-[var(--hr-ink)]">
                    {LOCALES.find((l) => l.value === profile.locale)?.label ?? "🇫🇷 Français"}
                  </p>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-[var(--hr-muted)]">Prénom</label>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Prénom"
                    className="w-full border border-[var(--hr-sand)] p-3 rounded-2xl bg-[var(--hr-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--hr-accent)]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-[var(--hr-muted)]">Nom</label>
                  <input
                    value={editLastName}
                    onChange={(e) => setEditLastName(e.target.value)}
                    placeholder="Nom"
                    className="w-full border border-[var(--hr-sand)] p-3 rounded-2xl bg-[var(--hr-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--hr-accent)]"
                  />
                </div>

                <div className="space-y-1 col-span-2">
                  <label className="text-xs text-[var(--hr-muted)]">Langue</label>
                  <select
                    value={editLocale}
                    onChange={(e) => setEditLocale(e.target.value as ProfileRow["locale"])}
                    className="w-full border border-[var(--hr-sand)] p-3 rounded-2xl bg-[var(--hr-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--hr-accent)]"
                  >
                    {LOCALES.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {msg && (
              <div className="mt-2 text-sm rounded-2xl border border-[var(--hr-sand)] bg-[var(--hr-sand)]/25 p-3">
                {msg}
              </div>
            )}

            {isEditing && (
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="flex-1 py-3 rounded-2xl border border-[var(--hr-sand)] bg-[var(--hr-surface)] text-[var(--hr-ink)] font-medium"
                >
                  Annuler
                </button>

                <button
                  type="button"
                  onClick={saveProfile}
                  disabled={saving}
                  className="flex-1 py-3 rounded-2xl bg-[var(--hr-accent)] text-[var(--hr-cream)] font-semibold disabled:opacity-60 active:scale-[0.99]"
                >
                  {saving ? "Enregistrement…" : "💾 Sauvegarder"}
                </button>
              </div>
            )}
          </div>

          {!isEditing && (
            <button
              type="button"
              onClick={startEdit}
              className="shrink-0 w-10 h-10 rounded-full border border-[var(--hr-sand)] bg-[var(--hr-surface)] text-[var(--hr-ink)] flex items-center justify-center"
              aria-label="Modifier le profil"
              title="Modifier"
            >
              ✏️
            </button>
          )}
        </div>
      </section>

      {/* Stats */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold shrink-0">📊 Mes stats</h2>

          <div className="flex gap-2 overflow-x-auto pb-1 -mr-1 pr-1">
            <button
              type="button"
              onClick={() => setYearFilter("all")}
              className={`whitespace-nowrap ${chipBase} ${yearFilter === "all" ? chipOn : chipOff}`}
              title="Toutes les années"
            >
              Tout
            </button>

            {availableYears.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => setYearFilter(y)}
                className={`whitespace-nowrap ${chipBase} ${yearFilter === y ? chipOn : chipOff}`}
                title={`Année ${y}`}
              >
                {y}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <MiniStat title="Restaurants" value={String(stats.totalRestaurants)} />
          <MiniStat title="Moyenne" value={`${stats.avg}/20`} />
          <MiniStat title="Meilleure note 🥇" value={stats.best == null ? "—" : `${stats.best}/20`} />
          <MiniStat title="Pire note 💔" value={stats.worst == null ? "—" : `${stats.worst}/20`} />
          <MiniStat title="Ville #1" value={stats.topCity} />
          <MiniStat title="Total dépensé" value={formatEUR(stats.totalSpent)} />
        </div>

        <div className="space-y-3">
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
        </div>

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
              Ajoute quelques restaurants pour voir tes tags favoris.
            </p>
          ) : (
            <div className="flex gap-2 flex-wrap mt-3">
              {stats.topTags.map((t) => (
                <span
                  key={t}
                  className="px-3 py-1 rounded-full border border-[var(--hr-sand)] bg-[var(--hr-surface)] text-[var(--hr-ink)] text-sm"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>

        {availableYears.length > 0 && (
          <p className="text-xs text-[var(--hr-muted)]">
            Filtre année basé sur tes <span className="font-medium text-[var(--hr-ink)]">visites</span>.
          </p>
        )}
      </section>
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--hr-sand)] bg-[var(--hr-surface)] px-4 py-3">
      <p className="text-xs text-[var(--hr-muted)]">{label}</p>
      <p className="text-sm font-semibold text-[var(--hr-ink)] truncate">{value}</p>
    </div>
  );
}

function MiniStat({ title, value }: { title: string; value: string }) {
  return (
    <div className="h-20 bg-[var(--hr-surface)] border border-[var(--hr-sand)] rounded-2xl px-4 py-3 shadow-sm flex flex-col justify-between">
      <p className="text-xs text-[var(--hr-muted)]">{title}</p>
      <p className="text-lg font-bold text-[var(--hr-ink)] leading-none truncate">{value}</p>
    </div>
  );
}
