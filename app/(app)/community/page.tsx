"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type PublicProfileRow = {
  id: string;
  name: string | null;
  last_name: string | null;
  is_public: boolean;
  updated_at: string | null;
};

function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export default function CommunityPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [myId, setMyId] = useState<string | null>(null);

  const [profiles, setProfiles] = useState<PublicProfileRow[]>([]);
  const [search, setSearch] = useState("");

  const load = async () => {
    // page dans (app) => user connecté
    const { data } = await supabase.auth.getUser();
    const user = data.user;

    if (!user) {
      router.replace("/login");
      return;
    }

    setMyId(user.id);

    // RLS: select public ok (is_public=true)
    const { data: p, error } = await supabase
      .from("profiles")
      .select("id,name,last_name,is_public,updated_at")
      .eq("is_public", true)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Erreur profiles publics:", error.message);
      setProfiles([]);
      setLoading(false);
      return;
    }

    setProfiles((p ?? []) as any);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(() => {
    const q = norm(search);
    if (!q) return profiles;

    return profiles.filter((p) => {
      const full = `${p.name ?? ""} ${p.last_name ?? ""}`.trim();
      return norm(full).includes(q);
    });
  }, [profiles, search]);

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
            Découvre les carnets publics des autres utilisateurs.
          </p>
        </header>

        <section className="bg-[var(--hr-surface)] border border-[var(--hr-sand)] rounded-2xl p-4 shadow-sm space-y-3">
          <input
            type="text"
            placeholder="Rechercher un utilisateur…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-[var(--hr-sand)] p-3 rounded-2xl bg-[var(--hr-surface)] placeholder:text-[var(--hr-muted)]"
          />

          {profiles.length === 0 ? (
            <p className="text-sm text-[var(--hr-muted)]">
              Aucun profil public pour l’instant.
            </p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-[var(--hr-muted)]">
              Aucun résultat pour{" "}
              <span className="font-medium text-[var(--hr-ink)]">“{search.trim()}”</span>.
            </p>
          ) : (
            <ul className="space-y-3">
              {visible
                .filter((p) => p.id !== myId) // optionnel : cacher soi-même
                .map((p) => {
                  const displayName =
                    `${p.name ?? ""} ${p.last_name ?? ""}`.trim() || "Utilisateur";
                  return (
                    <li key={p.id}>
                      <Link
                        href={`/p/${p.id}`}
                        className="block bg-[var(--hr-surface)] border border-[var(--hr-sand)] rounded-2xl p-4 shadow-sm active:scale-[0.99] transition"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold truncate">{displayName}</p>
                            <p className="text-sm text-[var(--hr-muted)] truncate">
                              Profil public · Voir stats & restos
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
          Seuls les comptes en mode <span className="font-medium text-[var(--hr-ink)]">public</span> apparaissent ici.
        </p>
      </div>
    </main>
  );
}
