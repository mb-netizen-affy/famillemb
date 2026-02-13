"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function initials(first?: string | null, last?: string | null, email?: string | null) {
  const a = (first ?? "").trim()[0] ?? "";
  const b = (last ?? "").trim()[0] ?? "";
  const fromNames = (a + b).toUpperCase();
  if (fromNames.trim()) return fromNames;
  if (email) return (email[0] ?? "?").toUpperCase();
  return "?";
}

export default function ProfileBubble() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [lastName, setLastName] = useState<string | null>(null);

  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      if (!isMounted) return;

      setEmail(user?.email ?? null);

      if (!user) return;

      // fetch profile 1 fois
      const { data: p } = await supabase
        .from("profiles")
        .select("name,last_name")
        .eq("id", user.id)
        .maybeSingle();

      if (!isMounted) return;

      setFirstName((p?.name ?? null) as any);
      setLastName((p?.last_name ?? null) as any);
    };

    load();

    // écouter seulement login/logout
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
      // pas de refetch profile à chaque event, sinon lourd
    });

    return () => {
      isMounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const badge = useMemo(
    () => initials(firstName, lastName, email),
    [firstName, lastName, email]
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-10 h-10 rounded-full border border-[var(--hr-sand)] bg-[var(--hr-surface)] text-[var(--hr-ink)] font-semibold flex items-center justify-center"
        aria-label="Ouvrir le menu profil"
        title={email ?? "Profil"}
      >
        {badge}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-[var(--hr-sand)] bg-[var(--hr-surface)] shadow-lg overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-[var(--hr-sand)]">
            <p className="text-xs text-[var(--hr-muted)]">Connecté</p>
            <p className="text-sm font-medium text-[var(--hr-ink)] truncate">
              {email ?? "—"}
            </p>
          </div>

          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="block px-4 py-3 text-sm text-[var(--hr-ink)] hover:bg-[var(--hr-sand)]/20"
          >
            👤 Profil
          </Link>

          <button
            type="button"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/login";
            }}
            className="w-full text-left px-4 py-3 text-sm text-[var(--hr-ink)] hover:bg-[var(--hr-sand)]/20"
          >
            🚪 Déconnexion
          </button>
        </div>
      )}
    </div>
  );
}
