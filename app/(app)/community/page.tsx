"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type PublicProfileRow = {
  id: string;
  name: string | null;
  last_name: string | null;
  is_public: boolean;
  updated_at: string | null;
};

type UserPreviewStats = {
  restaurantsCount: number;
  badge: string;
};

function norm(s: string) {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  const a = parts[0]?.[0] ?? "U";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (a + b).toUpperCase();
}

/**
 * Badge basé sur tes tags dispo :
 * Cuisine: Français, Italien, Asiatique, Indien, Oriental, Mexicain, Américain, Méditerranéen
 * Concept: Bistrot, Gastronomique, Fast-food, Street food, Volonté, Tapas / Partage, Brunch
 * Régimes: Vegan
 * Ambiance: Romantique, Familial
 */
function badgeFromTopTags(topTags: string[]) {
  const tags = topTags.map(norm);

  const has = (t: string) => tags.includes(norm(t));

  // Cuisine
  if (has("Italien")) return "🍕 Italien dans l’âme";
  if (has("Asiatique")) return "🍜 Aventurier d’Asie";
  if (has("Français")) return "🥖 Terroir lover";
  if (has("Indien")) return "🌶️ Curry lover";
  if (has("Oriental")) return "🥙 Orient express";
  if (has("Mexicain")) return "🌮 Team tacos";
  if (has("Américain")) return "🍔 USA vibes";
  if (has("Méditerranéen")) return "🫒 Méditerranée mood";

  // Concepts / vibes
  if (has("Gastronomique")) return "💎 Fine dining";
  if (has("Bistrot")) return "🍷 Esprit bistrot";
  if (has("Brunch")) return "🥐 Brunch addict";
  if (has("Tapas / Partage")) return "🍢 Team partage";
  if (has("Street food")) return "🛵 Street food lover";
  if (has("Fast-food")) return "🍟 Fast & fun";
  if (has("Volonté")) return "😋 À volonté master";

  // Régime
  if (has("Vegan")) return "🥗 Vegan mood";

  // Ambiance
  if (has("Romantique")) return "💘 Romantique";
  if (has("Familial")) return "👨‍👩‍👧 Familial";

  return "🍽️ Gourmand curieux";
}

export default function CommunityPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true); // init auth
  const [searching, setSearching] = useState(false); // loading search results

  const [myId, setMyId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<PublicProfileRow[]>([]);

  const [statsByUser, setStatsByUser] = useState<Record<string, UserPreviewStats>>({});

  const searchReqId = useRef(0);

  // 1) Auth only
  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      if (!user) {
        router.replace("/login");
        return;
      }

      setMyId(user.id);
      setLoading(false);
    };

    init();
  }, [router]);

  // 2) Search profiles ONLY when user types
  useEffect(() => {
    const q = search.trim();
    const nq = norm(q);

    // reset when empty
    if (!nq) {
      setResults([]);
      setSearching(false);
      return;
    }

    const t = window.setTimeout(async () => {
      const req = ++searchReqId.current;
      setSearching(true);

      try {
        // Search in name OR last_name (simple & efficace)
        // Note: on garde is_public=true
        const { data, error } = await supabase
          .from("profiles")
          .select("id,name,last_name,is_public,updated_at")
          .eq("is_public", true)
          .or(`name.ilike.%${q}%,last_name.ilike.%${q}%`)
          .order("updated_at", { ascending: false })
          .limit(25);

        if (req !== searchReqId.current) return;

        if (error) {
          console.error("Erreur search profiles:", error.message);
          setResults([]);
          setSearching(false);
          return;
        }

        const list = ((data ?? []) as any as PublicProfileRow[]).filter((p) => p.id !== myId);
        setResults(list);
      } finally {
        if (req === searchReqId.current) setSearching(false);
      }
    }, 250);

    return () => window.clearTimeout(t);
  }, [search, myId]);

  // 3) For the displayed results: compute restaurantsCount + badge from their restaurants tags
  useEffect(() => {
    const run = async () => {
      // rien à faire si pas de résultats
      if (!results.length) return;

      // on limite pour éviter trop de charge si jamais
      const ids = results.slice(0, 25).map((p) => p.id);

      // fetch restaurants minimal fields for these users
      // ⚠️ nécessite RLS qui autorise la lecture si user public
      const { data, error } = await supabase
        .from("restaurants")
        .select("user_id,tags")
        .in("user_id", ids);

      if (error) {
        console.error("Erreur fetch restaurants for preview:", error.message);
        return;
      }

      // aggregate in JS
      const countBy = new Map<string, number>();
      const tagCountBy = new Map<string, Map<string, number>>();

      for (const row of (data ?? []) as any[]) {
        const uid = String(row.user_id);
        countBy.set(uid, (countBy.get(uid) ?? 0) + 1);

        const tags = (row.tags ?? []) as string[];
        if (!tagCountBy.has(uid)) tagCountBy.set(uid, new Map());
        const m = tagCountBy.get(uid)!;

        for (const t of tags) {
          const key = String(t ?? "").trim();
          if (!key) continue;
          m.set(key, (m.get(key) ?? 0) + 1);
        }
      }

      const next: Record<string, UserPreviewStats> = { ...statsByUser };

      for (const uid of ids) {
        const restaurantsCount = countBy.get(uid) ?? 0;

        const tagMap = tagCountBy.get(uid) ?? new Map<string, number>();
        const topTags = Array.from(tagMap.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([tag]) => tag);

        next[uid] = {
          restaurantsCount,
          badge: badgeFromTopTags(topTags),
        };
      }

      setStatsByUser(next);
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results]);

  const showList = useMemo(() => search.trim().length > 0, [search]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[var(--hr-cream)] text-[var(--hr-ink)] px-4 py-10 pb-28">
        <div className="max-w-md mx-auto space-y-4">
          <div className="h-7 w-40 rounded-xl bg-[var(--hr-sand)]/40" />
          <div className="h-12 rounded-2xl bg-[var(--hr-sand)]/35" />
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-16 rounded-2xl border border-[var(--hr-sand)] bg-[var(--hr-surface)] shadow-sm"
              />
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--hr-cream)] text-[var(--hr-ink)] px-4 py-10 pb-28">
      <div className="max-w-md mx-auto space-y-5">
        <header className="space-y-1">
          <h1 className="text-xl font-bold">👥 Communauté</h1>
          <p className="text-sm text-[var(--hr-muted)]">
            Cherche un utilisateur pour découvrir son carnet public.
          </p>
        </header>

        <section className="bg-[var(--hr-surface)] border border-[var(--hr-sand)] rounded-2xl p-4 shadow-sm space-y-3">
          <div className="relative">
            <input
              type="text"
              placeholder="Rechercher un utilisateur…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border border-[var(--hr-sand)] p-3 pr-12 rounded-2xl bg-[var(--hr-surface)] placeholder:text-[var(--hr-muted)]"
            />

            {search.trim() ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full border border-[var(--hr-sand)] bg-[var(--hr-surface)] text-[var(--hr-muted)] flex items-center justify-center active:scale-[0.98]"
                aria-label="Effacer"
                title="Effacer"
              >
                ✕
              </button>
            ) : null}
          </div>

          {/* ✅ On n’affiche rien tant qu’il n’y a pas de recherche */}
          {!showList ? (
            <div>
            </div>
          ) : searching ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-16 rounded-2xl border border-[var(--hr-sand)] bg-[var(--hr-surface)] shadow-sm"
                />
              ))}
            </div>
          ) : results.length === 0 ? (
            <p className="text-sm text-[var(--hr-muted)]">
              Aucun résultat pour{" "}
              <span className="font-medium text-[var(--hr-ink)]">“{search.trim()}”</span>.
            </p>
          ) : (
            <ul className="space-y-3">
              {results.map((p) => {
                const displayName = `${p.name ?? ""} ${p.last_name ?? ""}`.trim() || "Utilisateur";
                const stats = statsByUser[p.id];

                const restaurantsCount = stats?.restaurantsCount ?? 0;
                const badge = stats?.badge ?? "🍽️ Gourmand curieux";

                return (
                  <li key={p.id}>
                    <Link
                      href={`/p/${p.id}`}
                      className="block bg-[var(--hr-surface)] border border-[var(--hr-sand)] rounded-2xl p-4 shadow-sm active:scale-[0.99] transition"
                    >
                      <div className="flex items-center gap-3">
                        <div className="shrink-0 w-11 h-11 rounded-2xl border border-[var(--hr-sand)] bg-[var(--hr-sand)]/25 flex items-center justify-center font-bold">
                          {initials(displayName)}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="font-semibold truncate">{displayName}</p>
                          <p className="text-sm text-[var(--hr-muted)] truncate">
                            {restaurantsCount} resto{restaurantsCount > 1 ? "s" : ""} · {badge}
                          </p>
                        </div>

                        <span className="text-[var(--hr-muted)]">›</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <p className="text-xs text-[var(--hr-muted)]">
          Seuls les comptes en mode{" "}
          <span className="font-medium text-[var(--hr-ink)]">public</span>{" "}
          peuvent être trouvés ici.
        </p>
      </div>
    </main>
  );
}
