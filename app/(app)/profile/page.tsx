"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type ProfileRow = {
  name: string | null;
  last_name: string | null;
  locale: "fr" | "en" | "es" | "it" | "de";
  is_public: boolean; // ✅ NEW
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

export default function ProfilePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("—");

  const [profile, setProfile] = useState<ProfileRow>({
    name: null,
    last_name: null,
    locale: "fr",
    is_public: false,
  });

  // Edition
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editLocale, setEditLocale] = useState<ProfileRow["locale"]>("fr");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // ✅ switch public/privé
  const [savingPrivacy, setSavingPrivacy] = useState(false);

  // ✅ toast (pour partage)
  const toastTimerRef = useRef<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const pushToast = (t: string) => {
    setToast(t);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2000);
  };

  const loadProfile = async () => {
    const { data } = await supabase.auth.getUser();
    const user = data.user;

    if (!user) {
      router.replace("/login");
      return;
    }

    setUserId(user.id);
    setEmail(user.email ?? "—");

    const { data: p, error: pErr } = await supabase
      .from("profiles")
      .select("name,last_name,locale,is_public")
      .eq("id", user.id)
      .maybeSingle();

    if (pErr) console.error("Erreur profile:", pErr.message);

    const pLocale = normalizeLocale((p as any)?.locale);

    const next: ProfileRow = {
      name: (p as any)?.name ?? null,
      last_name: (p as any)?.last_name ?? null,
      locale: pLocale,
      is_public: Boolean((p as any)?.is_public ?? false),
    };

    setProfile(next);

    setEditName((next.name ?? "").toString());
    setEditLastName((next.last_name ?? "").toString());
    setEditLocale(next.locale);
  };

  useEffect(() => {
    const init = async () => {
      await loadProfile();
      setLoading(false);
    };
    init();

    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        // ✅ IMPORTANT: on conserve la privacy
        is_public: profile.is_public,
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

  const togglePrivacy = async () => {
    if (!userId) return;

    // ✅ bloque pendant l’édition pour éviter des conflits UX
    if (isEditing) {
      setMsg("ℹ️ Termine l’édition avant de changer la visibilité.");
      return;
    }

    const next = !profile.is_public;

    // optimistic
    setProfile((p) => ({ ...p, is_public: next }));
    setSavingPrivacy(true);
    setMsg(null);

    const { error } = await supabase
      .from("profiles")
      .update({ is_public: next, updated_at: new Date().toISOString() })
      .eq("id", userId);

    setSavingPrivacy(false);

    if (error) {
      // rollback
      setProfile((p) => ({ ...p, is_public: !next }));
      setMsg("❌ Erreur lors de la mise à jour de la visibilité.");
      return;
    }

    setMsg(next ? "✅ Ton compte est maintenant public" : "✅ Ton compte est maintenant privé");
  };

  const shareMyProfile = async () => {
  if (!userId) return;

  if (!profile.is_public) {
    pushToast("Active le mode public pour partager ton profil.");
    return;
  }

  const url = `${window.location.origin}/p/${userId}`;
  const title = "Mon profil resto";
  const text = "Viens voir mes stats & restos 🍴";

  try {
    // ✅ Partage natif (mobile)
    if (navigator.share) {
      await navigator.share({ title, text, url });
      pushToast("✅ Partagé !");
      return;
    }

    // ✅ Fallback copie
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      pushToast("✅ Lien copié !");
      return;
    }

    // ✅ Fallback “old school”
    const ta = document.createElement("textarea");
    ta.value = url;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);

    pushToast("✅ Lien copié !");
  } catch (e: any) {
    // Si l’utilisateur annule le share, iOS/Android renvoie souvent une erreur -> on ignore
    const msg = String(e?.message ?? e ?? "");
    if (msg.toLowerCase().includes("abort") || msg.toLowerCase().includes("canceled")) return;

    pushToast("❌ Impossible de partager le lien.");
  }
};


  if (loading) {
    return (
      <main className="min-h-screen bg-[var(--hr-cream)] text-[var(--hr-ink)] px-4 py-10 pb-28">
        <div className="max-w-md mx-auto space-y-5">
          <div className="h-7 w-28 rounded-xl bg-[var(--hr-sand)]/40" />
          <div className="rounded-2xl border border-[var(--hr-sand)] bg-[var(--hr-surface)] p-4 shadow-sm space-y-3">
            <div className="h-4 w-40 rounded-lg bg-[var(--hr-sand)]/40" />
            <div className="h-10 w-full rounded-2xl bg-[var(--hr-sand)]/40" />
            <div className="grid grid-cols-2 gap-3">
              <div className="h-12 rounded-2xl bg-[var(--hr-sand)]/40" />
              <div className="h-12 rounded-2xl bg-[var(--hr-sand)]/40" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--hr-cream)] text-[var(--hr-ink)] px-4 py-10 pb-28">
      {/* ✅ Toast */}
      {toast ? (
        <div className="fixed top-16 left-4 right-4 z-50">
          <div className="mx-auto max-w-md bg-[var(--hr-ink)] text-[var(--hr-cream)] px-4 py-3 rounded-2xl shadow">
            {toast}
          </div>
        </div>
      ) : null}

      <div className="max-w-md mx-auto space-y-5">
        <header className="space-y-1">
          <h1 className="text-xl font-bold">👤 Profil</h1>
          <p className="text-sm text-[var(--hr-muted)]">Paramètres de ton compte.</p>
        </header>

        {/* ✅ Visibilité du compte */}
        <section className="bg-[var(--hr-surface)] border border-[var(--hr-sand)] rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--hr-ink)]">Compte public</p>
              <p className="text-xs text-[var(--hr-muted)] mt-1">
                {profile.is_public
                  ? "Visible via un lien public."
                  : "Seulement toi peux voir ton carnet."}
              </p>
            </div>

            <Switch
              checked={profile.is_public}
              onClick={togglePrivacy}
              disabled={savingPrivacy}
              label={profile.is_public ? "Public" : "Privé"}
            />
          </div>

          {savingPrivacy ? <p className="text-xs text-[var(--hr-muted)] mt-3">Sauvegarde…</p> : null}
        </section>

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

        {/* ✅ Partager mon profil */}
        {profile.is_public ? (
          <button
            type="button"
            onClick={shareMyProfile}
            className="w-full py-3 rounded-2xl bg-[var(--hr-accent)] text-[var(--hr-cream)] font-semibold active:scale-[0.99]"
          >
            🔗 Partager mon profil
          </button>
        ) : (
          <p className="text-xs text-[var(--hr-muted)]">
            Active le mode public pour générer un lien partageable.
          </p>
        )}

        {/* Déconnexion */}
        <button
          type="button"
          className="w-full py-3 rounded-2xl border border-[var(--hr-sand)] bg-[var(--hr-surface)] text-[var(--hr-ink)] font-semibold active:scale-[0.99]"
          onClick={async () => {
            await supabase.auth.signOut();
            router.replace("/login");
          }}
        >
          Se déconnecter
        </button>
      </div>
    </main>
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

function Switch({
  checked,
  onClick,
  disabled,
  label,
}: {
  checked: boolean;
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onClick}
      disabled={disabled}
      className={`shrink-0 inline-flex items-center gap-2 px-2 py-2 rounded-full border transition active:scale-[0.98] ${
        checked
          ? "border-[var(--hr-accent)] bg-[var(--hr-accent)]/15"
          : "border-[var(--hr-sand)] bg-[var(--hr-surface)]"
      } ${disabled ? "opacity-60" : ""}`}
      title={checked ? "Compte public" : "Compte privé"}
    >
      {label ? (
        <span className="text-xs font-semibold text-[var(--hr-ink)] w-12 text-center">{label}</span>
      ) : null}

      <span className={`relative inline-flex w-12 h-7 rounded-full transition ${checked ? "bg-[var(--hr-accent)]" : "bg-[var(--hr-sand)]"}`}>
        <span
          className={`absolute top-0.5 w-6 h-6 rounded-full bg-[var(--hr-cream)] shadow-sm transition-transform ${
            checked ? "translate-x-[22px]" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}
