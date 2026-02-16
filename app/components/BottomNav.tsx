"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = {
  href: string;
  label: string;
  icon: string;
};

const TABS: Tab[] = [
  { href: "/search", label: "Recherche", icon: "🔎" },
  { href: "/restaurants", label: "Mes restos", icon: "🍴" },
  { href: "/stats", label: "Stats", icon: "📊" },
  { href: "/community", label: "Communauté", icon: "👥" }, // ✅ NEW
];

function isActive(pathname: string, href: string) {
  // exact ou sous-routes (ex: /restaurants/123)
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function BottomNav() {
  const pathname = usePathname();

  const navWrap =
    "fixed bottom-0 left-0 right-0 z-40 px-3 pt-2 " +
    "pb-[calc(env(safe-area-inset-bottom)+8px)]";

  const shell =
    "w-full rounded-2xl border border-[var(--hr-sand)] " +
    "bg-[var(--hr-surface)]/85 backdrop-blur-md shadow-lg p-1";

  const itemBase =
    "relative flex items-center justify-center gap-2 py-3 rounded-xl " +
    "text-sm font-semibold transition-all duration-200 active:scale-[0.97] " +
    "focus:outline-none focus:ring-2 focus:ring-[var(--hr-accent)]/30";

  const itemOn = "bg-[var(--hr-accent)] text-[var(--hr-cream)] shadow-sm";
  const itemOff = "text-[var(--hr-muted)] hover:bg-[var(--hr-sand)]/15";

  return (
    <nav className={navWrap} aria-label="Navigation principale">
      <div className={shell}>
        <div
          className="relative grid gap-1"
          style={{ gridTemplateColumns: `repeat(${TABS.length}, minmax(0, 1fr))` }}
        >
          {TABS.map((t) => {
            const active = isActive(pathname, t.href);

            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`${itemBase} ${active ? itemOn : itemOff}`}
              >
                <span className="text-base leading-none">{t.icon}</span>
                <span className="hidden sm:inline">{t.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
