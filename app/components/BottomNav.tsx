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
];

function isActive(pathname: string, href: string) {
  if (href === "/restaurants")
    return pathname === "/restaurants" || pathname.startsWith("/restaurants/");
  if (href === "/search")
    return pathname === "/search" || pathname.startsWith("/search/");
  return pathname === href;
}

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="
        fixed bottom-0 left-0 right-0 z-40
        px-3
        pb-[calc(env(safe-area-inset-bottom)+8px)]
        pt-2
      "
      aria-label="Navigation principale"
    >
      <div
        className="
          w-full
          rounded-2xl
          border border-[var(--hr-sand)]
          bg-[var(--hr-surface)]/85
          backdrop-blur-md
          shadow-lg
          p-1
        "
      >
        <div className="relative grid grid-cols-2 gap-1">
          {TABS.map((t) => {
            const active = isActive(pathname, t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`
                  relative
                  flex items-center justify-center gap-2
                  py-3
                  rounded-xl
                  text-sm font-semibold
                  transition-all duration-200
                  active:scale-[0.97]
                  ${
                    active
                      ? "bg-[var(--hr-accent)] text-[var(--hr-cream)] shadow-sm"
                      : "text-[var(--hr-muted)]"
                  }
                `}
              >
                <span className="text-base leading-none">{t.icon}</span>
                <span>{t.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
