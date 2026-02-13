"use client";

import { useEffect, useState } from "react";
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

  // Optionnel : si tu veux cacher la bottom nav sur certaines pages plus tard
  const hideBottomNav =
    pathname.startsWith("/login") || pathname.startsWith("/auth");

  return (
    <div className="min-h-screen bg-[var(--hr-cream)] text-[var(--hr-ink)]">
      {/* Top bar */}
      <header className="sticky top-0 z-20 bg-[var(--hr-surface)]/90 backdrop-blur border-b border-[var(--hr-sand)]">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="font-semibold">App Resto</div>
          <div className="flex items-center gap-2">
            <ProfileBubble />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className={`px-4 py-4 ${hideBottomNav ? "" : "pb-32"}`}>
        {children}
      </main>


      {/* Bottom nav (native feel) */}
      {!hideBottomNav && <BottomNav />}
    </div>
  );
}
