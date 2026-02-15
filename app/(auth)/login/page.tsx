"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useRouter } from "next/navigation";

type AuthMode = "login" | "signup";
type Msg = { type: "success" | "error"; text: string } | null;

export default function LoginPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authMsg, setAuthMsg] = useState<Msg>(null);

  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authPassword2, setAuthPassword2] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showPassword2, setShowPassword2] = useState(false);

  // Champs profil (utilisés seulement en inscription)
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const getRedirectBase = () =>
    typeof window === "undefined" ? "" : window.location.origin;

  const ensureProfile = async (user: any) => {
    const { data: existing, error: selErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (selErr) {
      console.error("Erreur select profile:", selErr.message);
      return;
    }
    if (existing?.id) return;

    const meta = user.user_metadata ?? {};
    const cleanFirst = String(meta.first_name ?? meta.name ?? "")
      .trim()
      .slice(0, 40);
    const cleanLast = String(meta.last_name ?? "").trim().slice(0, 40);

    const { error: insErr } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        name: cleanFirst || "",
        last_name: cleanLast || "",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (insErr) console.error("Erreur upsert profile:", insErr.message);
  };

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        await ensureProfile(data.user);
        router.replace("/restaurants");
        return;
      }
      setLoading(false);
    };

    init();

    const { data: sub } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          await ensureProfile(session.user);
          router.replace("/restaurants");
        }
      }
    );

    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // Reset des champs sensibles quand on change de mode
  useEffect(() => {
    setAuthMsg(null);
    setAuthPassword("");
    setAuthPassword2("");
    setShowPassword(false);
    setShowPassword2(false);
  }, [authMode]);

  const email = useMemo(() => authEmail.trim().toLowerCase(), [authEmail]);

  const passwordStrength = useMemo(() => {
    const p = authPassword || "";
    if (!p) return null;
    let score = 0;
    if (p.length >= 8) score++;
    if (/[A-Z]/.test(p)) score++;
    if (/[0-9]/.test(p)) score++;
    if (/[^A-Za-z0-9]/.test(p)) score++;
    if (score <= 1) return { label: "Faible", hint: "Ajoute longueur + chiffres." };
    if (score === 2) return { label: "Correct", hint: "Un peu plus de variété = mieux." };
    return { label: "Bon", hint: "Nickel." };
  }, [authPassword]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[var(--hr-cream)] text-[var(--hr-ink)] p-6 flex items-center justify-center">
        <p className="text-sm text-[var(--hr-muted)]">Chargement…</p>
      </main>
    );
  }

  const onGoogle = async () => {
    setAuthMsg(null);
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${getRedirectBase()}/restaurants` },
      });
      if (error) setAuthMsg({ type: "error", text: "Erreur : " + error.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[var(--hr-cream)] text-[var(--hr-ink)] px-4 py-10">
      <div className="max-w-md mx-auto space-y-5">
        {/* Header + vibe */}
        <header className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-[var(--hr-sand)]/60 border border-[var(--hr-sand)] shadow-sm flex items-center justify-center">
            <span className="text-xl">🍽️</span>
          </div>
          <h1 className="text-2xl font-bold">
            {authMode === "login" ? "Bon retour" : "Bienvenue"}
          </h1>
          <p className="text-sm text-[var(--hr-muted)]">
            {authMode === "login"
              ? "Reconnecte-toi à ton carnet de restos."
              : "Crée ton carnet et commence à noter tes meilleures adresses."}
          </p>
        </header>

        {/* Card */}
        <section className="relative bg-[var(--hr-surface)] border border-[var(--hr-sand)] rounded-2xl p-5 shadow-sm space-y-4 overflow-hidden">
          {/* petite touche chaleureuse */}
          <div className="pointer-events-none absolute -top-24 -right-24 w-64 h-64 rounded-full bg-[var(--hr-sand)]/35 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 w-64 h-64 rounded-full bg-[var(--hr-accent)]/10 blur-2xl" />

          {/* Tabs */}
          <div className="relative flex gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => setAuthMode("login")}
              className={`flex-1 py-2 rounded-xl border text-sm font-medium transition ${
                authMode === "login"
                  ? "bg-[var(--hr-accent)] text-[var(--hr-cream)] border-[var(--hr-accent)]"
                  : "bg-[var(--hr-surface)] text-[var(--hr-muted)] border-[var(--hr-sand)] hover:bg-[var(--hr-sand)]/20"
              } ${submitting ? "opacity-60" : ""}`}
            >
              Connexion
            </button>

            <button
              type="button"
              disabled={submitting}
              onClick={() => setAuthMode("signup")}
              className={`flex-1 py-2 rounded-xl border text-sm font-medium transition ${
                authMode === "signup"
                  ? "bg-[var(--hr-accent)] text-[var(--hr-cream)] border-[var(--hr-accent)]"
                  : "bg-[var(--hr-surface)] text-[var(--hr-muted)] border-[var(--hr-sand)] hover:bg-[var(--hr-sand)]/20"
              } ${submitting ? "opacity-60" : ""}`}
            >
              Inscription
            </button>
          </div>

          {/* ✅ Google mis en avant (full width) */}
          <button
            type="button"
            disabled={submitting}
            onClick={onGoogle}
            className={`relative w-full py-3 rounded-2xl border border-[var(--hr-sand)] bg-[var(--hr-sand)]/35 hover:bg-[var(--hr-sand)]/50 transition shadow-sm font-semibold flex items-center justify-center gap-3 active:scale-[0.99] ${
              submitting ? "opacity-70" : ""
            }`}
          >
            <GoogleIcon />
            <span>Continuer avec Google</span>
          </button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-[var(--hr-sand)]" />
            <span className="text-xs text-[var(--hr-muted)]">ou</span>
            <div className="h-px flex-1 bg-[var(--hr-sand)]" />
          </div>

          {/* Form email/mdp */}
          <form
            className="relative space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setAuthMsg(null);

              if (!email) {
                setAuthMsg({ type: "error", text: "Entre un email valide." });
                return;
              }
              if (!authPassword || authPassword.length < 6) {
                setAuthMsg({
                  type: "error",
                  text: "Mot de passe trop court (minimum 6 caractères).",
                });
                return;
              }
              if (authMode === "signup") {
                const cleanFirst = firstName.trim().slice(0, 40);
                const cleanLast = lastName.trim().slice(0, 40);
                if (!cleanFirst || !cleanLast) {
                  setAuthMsg({ type: "error", text: "Prénom et nom requis." });
                  return;
                }
                if (authPassword !== authPassword2) {
                  setAuthMsg({ type: "error", text: "Les mots de passe ne correspondent pas." });
                  return;
                }
              }

              setSubmitting(true);
              try {
                if (authMode === "signup") {
                  const cleanFirst = firstName.trim().slice(0, 40);
                  const cleanLast = lastName.trim().slice(0, 40);

                  const { data, error } = await supabase.auth.signUp({
                    email,
                    password: authPassword,
                    options: {
                      data: { first_name: cleanFirst, last_name: cleanLast },
                      emailRedirectTo: `${getRedirectBase()}/restaurants`,
                    },
                  });

                  if (error) {
                    setAuthMsg({ type: "error", text: "Erreur : " + error.message });
                    return;
                  }

                  if (data.user) await ensureProfile(data.user);

                  setAuthMsg({
                    type: "success",
                    text:
                      "✅ Compte créé ! Si la confirmation email est activée, vérifie ta boîte mail.",
                  });

                  setFirstName("");
                  setLastName("");
                  setAuthPassword("");
                  setAuthPassword2("");
                  return;
                }

                const { data, error } = await supabase.auth.signInWithPassword({
                  email,
                  password: authPassword,
                });

                if (error) {
                  setAuthMsg({ type: "error", text: "Erreur : " + error.message });
                  return;
                }

                if (data.user) await ensureProfile(data.user);
                router.replace("/restaurants");
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {authMode === "signup" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Prénom</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full border border-[var(--hr-sand)] bg-[var(--hr-surface)] p-3 rounded-2xl placeholder:text-[var(--hr-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hr-sand)]/60"
                    required
                    disabled={submitting}
                    autoComplete="given-name"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Nom</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full border border-[var(--hr-sand)] bg-[var(--hr-surface)] p-3 rounded-2xl placeholder:text-[var(--hr-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hr-sand)]/60"
                    required
                    disabled={submitting}
                    autoComplete="family-name"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <input
                type="email"
                placeholder="ton@email.com"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                className="w-full border border-[var(--hr-sand)] bg-[var(--hr-surface)] p-3 rounded-2xl placeholder:text-[var(--hr-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hr-sand)]/60"
                required
                disabled={submitting}
                autoComplete="email"
                inputMode="email"
              />
            </div>

            {/* Mot de passe + show/hide */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Mot de passe</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full border border-[var(--hr-sand)] bg-[var(--hr-surface)] p-3 pr-12 rounded-2xl placeholder:text-[var(--hr-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hr-sand)]/60"
                  required
                  disabled={submitting}
                  autoComplete={authMode === "signup" ? "new-password" : "current-password"}
                />
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl border border-[var(--hr-sand)] bg-[var(--hr-surface)] text-[var(--hr-muted)] hover:bg-[var(--hr-sand)]/20 transition flex items-center justify-center"
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  title={showPassword ? "Masquer" : "Afficher"}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>

              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-[var(--hr-muted)]">Minimum 6 caractères.</p>
                {passwordStrength && (
                  <p className="text-xs text-[var(--hr-muted)]">
                    Robustesse : <span className="font-medium">{passwordStrength.label}</span>
                  </p>
                )}
              </div>
            </div>

            {/* ✅ Confirmation MDP en inscription */}
            {authMode === "signup" && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Confirmer le mot de passe</label>
                <div className="relative">
                  <input
                    type={showPassword2 ? "text" : "password"}
                    placeholder="••••••••"
                    value={authPassword2}
                    onChange={(e) => setAuthPassword2(e.target.value)}
                    className="w-full border border-[var(--hr-sand)] bg-[var(--hr-surface)] p-3 pr-12 rounded-2xl placeholder:text-[var(--hr-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hr-sand)]/60"
                    required
                    disabled={submitting}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => setShowPassword2((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl border border-[var(--hr-sand)] bg-[var(--hr-surface)] text-[var(--hr-muted)] hover:bg-[var(--hr-sand)]/20 transition flex items-center justify-center"
                    aria-label={
                      showPassword2 ? "Masquer la confirmation" : "Afficher la confirmation"
                    }
                    title={showPassword2 ? "Masquer" : "Afficher"}
                  >
                    {showPassword2 ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>

                {authPassword2.length > 0 && (
                  <p
                    className={`text-xs ${
                      authPassword === authPassword2
                        ? "text-[var(--hr-muted)]"
                        : "text-red-700"
                    }`}
                  >
                    {authPassword === authPassword2
                      ? "✅ Les mots de passe correspondent."
                      : "Les mots de passe ne correspondent pas."}
                  </p>
                )}
              </div>
            )}

            <button
              disabled={submitting}
              className={`w-full py-3 rounded-2xl bg-[var(--hr-accent)] text-[var(--hr-cream)] font-semibold active:scale-[0.99] transition ${
                submitting ? "opacity-70" : ""
              }`}
            >
              {submitting
                ? "…"
                : authMode === "signup"
                ? "Créer mon compte"
                : "Se connecter"}
            </button>
          </form>

          {/* Actions login */}
          {authMode === "login" && (
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                className="text-sm underline text-[var(--hr-muted)] hover:text-[var(--hr-ink)] disabled:opacity-60"
                disabled={submitting}
                onClick={async () => {
                  setAuthMsg(null);

                  if (!email) {
                    setAuthMsg({ type: "error", text: "Entre ton email d’abord." });
                    return;
                  }

                  setSubmitting(true);
                  try {
                    const { error } = await supabase.auth.resetPasswordForEmail(email, {
                      redirectTo: `${getRedirectBase()}/login`,
                    });

                    setAuthMsg(
                      error
                        ? { type: "error", text: "Erreur : " + error.message }
                        : { type: "success", text: "✅ Email envoyé." }
                    );
                  } finally {
                    setSubmitting(false);
                  }
                }}
              >
                Mot de passe oublié ?
              </button>
            </div>
          )}

          {/* Message */}
          {authMsg && (
            <div
              className={`text-sm rounded-2xl border p-3 ${
                authMsg.type === "error"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-[var(--hr-sand)] bg-[var(--hr-sand)]/25"
              }`}
              role="status"
              aria-live="polite"
            >
              {authMsg.text}
            </div>
          )}
        </section>

        <p className="text-xs text-[var(--hr-muted)] text-center">
          En continuant, tu acceptes que l’app stocke tes restaurants dans ta base Supabase.
        </p>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303C33.651 32.656 29.176 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.049 6.053 29.279 4 24 4 12.954 4 4 12.954 4 24s8.954 20 20 20 20-8.954 20-20c0-1.341-.138-2.651-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.049 6.053 29.279 4 24 4 16.318 4 9.656 8.338 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.077 0 9.748-1.946 13.256-5.107l-6.118-5.174C29.078 35.091 26.654 36 24 36c-5.154 0-9.614-3.319-11.29-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.798 2.267-2.23 4.193-4.047 5.446l.003-.002 6.118 5.174C36.945 39.021 44 34 44 24c0-1.341-.138-2.651-.389-3.917z"
      />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 5c5.5 0 9.5 4.5 10.5 6c-1 1.5-5 6-10.5 6S2.5 12.5 1.5 11C2.5 9.5 6.5 5 12 5Zm0 2C8 7 4.8 10 3.7 11c1.1 1 4.3 4 8.3 4s7.2-3 8.3-4C19.2 10 16 7 12 7Zm0 1.5A2.5 2.5 0 1 1 9.5 11 2.5 2.5 0 0 1 12 8.5Zm0 2A.5.5 0 1 0 12.5 11 .5.5 0 0 0 12 10.5Z"
      />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3.3 2.6 21.4 20.7l-1.4 1.4-2.2-2.2c-1.6.8-3.5 1.1-5.8 1.1C6.5 21 2.5 16.5 1.5 15c.6-1 2.6-3.5 5.9-5.1L1.9 4l1.4-1.4Zm8.7 5.4c5.5 0 9.5 4.5 10.5 6c-.4.6-1.3 1.8-2.8 2.9l-1.5-1.5c1-.8 1.7-1.6 2.1-2.1-1.1-1-4.3-4-8.3-4-.7 0-1.4.1-2 .2L8.5 8.1c1.1-.1 2.2-.1 3.5-.1Zm-6.2 3.2c-1 .8-1.7 1.6-2.1 2.1 1.1 1 4.3 4 8.3 4 1.5 0 2.9-.4 4.1-.9l-1.6-1.6c-.7.3-1.6.5-2.5.5A3.5 3.5 0 0 1 8.5 11c0-.4.1-.8.2-1.2L5.8 11.2Z"
      />
    </svg>
  );
}
