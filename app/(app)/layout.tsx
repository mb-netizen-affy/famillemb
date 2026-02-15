"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import ProfileBubble from "../components/profileBubble";
import BottomNav from "../components/BottomNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const check = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) router.replace("/login");
      setLoading(false);
    };

    check();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) router.replace("/login");
    });

    return () => sub.subscription.unsubscribe();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--hr-cream)] text-[var(--hr-ink)] p-6">
        <p className="text-sm text-[var(--hr-muted)]">Chargement…</p>
      </div>
    );
  }

  const hideBottomNav =
    pathname.startsWith("/login") || pathname.startsWith("/auth");

  return (
    <div className="min-h-screen bg-[var(--hr-cream)] text-[var(--hr-ink)]">
      {/* Top bar */}
      <header className="sticky top-0 z-20 bg-[var(--hr-surface)]/90 backdrop-blur border-b border-[var(--hr-sand)]">
        <div className="px-4 py-3 flex items-center justify-between">
          {/* ✅ Logo + nom */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-2xl border border-[var(--hr-sand)] bg-[var(--hr-surface)] shadow-sm overflow-hidden flex items-center justify-center shrink-0">
              <Image
                src="/logo.png"
                alt="Logo"
                width={36}
                height={36}
                className="w-9 h-9 object-cover"
                priority
              />
            </div>

            <div className="min-w-0">
              <div className="font-semibold leading-tight truncate">FamilleMB</div>
              <div className="text-xs text-[var(--hr-muted)] leading-tight truncate">
                Carnet de restos
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ProfileBubble />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className={`px-4 py-4 ${hideBottomNav ? "" : "pb-32"}`}>
        {children}
      </main>

      {!hideBottomNav && <BottomNav />}
    </div>
  );
}
