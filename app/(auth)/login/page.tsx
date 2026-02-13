"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useRouter } from "next/navigation";

type AuthMode = "login" | "signup";
type Msg = { type: "success" | "error"; text: string } | null;

export default function LoginPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");

  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authMsg, setAuthMsg] = useState<Msg>(null);

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
    const cleanFirst = String(meta.first_name ?? meta.name ?? "").trim().slice(0, 40);
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

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await ensureProfile(session.user);
        router.replace("/restaurants");
      }
    });

    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[var(--hr-cream)] text-[var(--hr-ink)] p-6 flex items-center justify-center">
        <p className="text-sm text-[var(--hr-muted)]">Chargement…</p>
      </main>
    );
  }

  const oauthBtn =
    "w-12 h-12 rounded-full border border-[var(--hr-sand)] bg-[var(--hr-surface)] " +
    "flex items-center justify-center shadow-sm active:scale-[0.98] disabled:opacity-60";

  return (
    <main className="min-h-screen bg-[var(--hr-cream)] text-[var(--hr-ink)] px-4 py-10">
      <div className="max-w-md mx-auto space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-center">🔐 Connexion</h1>
          <p className="text-sm text-[var(--hr-muted)]">Accède à ton carnet de restos.</p>
        </div>

        <section className="bg-[var(--hr-surface)] border border-[var(--hr-sand)] rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                setAuthMode("login");
                setAuthMsg(null);
              }}
              className={`flex-1 py-2 rounded-xl border text-sm font-medium ${
                authMode === "login"
                  ? "bg-[var(--hr-accent)] text-[var(--hr-cream)] border-[var(--hr-accent)]"
                  : "bg-[var(--hr-surface)] text-[var(--hr-muted)] border-[var(--hr-sand)]"
              } ${submitting ? "opacity-60" : ""}`}
            >
              Connexion
            </button>

            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                setAuthMode("signup");
                setAuthMsg(null);
              }}
              className={`flex-1 py-2 rounded-xl border text-sm font-medium ${
                authMode === "signup"
                  ? "bg-[var(--hr-accent)] text-[var(--hr-cream)] border-[var(--hr-accent)]"
                  : "bg-[var(--hr-surface)] text-[var(--hr-muted)] border-[var(--hr-sand)]"
              } ${submitting ? "opacity-60" : ""}`}
            >
              Inscription
            </button>
          </div>

          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setAuthMsg(null);

              const email = authEmail.trim().toLowerCase();
              const password = authPassword;

              if (!email) {
                setAuthMsg({ type: "error", text: "Entre un email valide." });
                return;
              }
              if (!password || password.length < 6) {
                setAuthMsg({
                  type: "error",
                  text: "Mot de passe trop court (minimum 6 caractères).",
                });
                return;
              }

              setSubmitting(true);
              try {
                if (authMode === "signup") {
                  const cleanFirst = firstName.trim().slice(0, 40);
                  const cleanLast = lastName.trim().slice(0, 40);

                  if (!cleanFirst || !cleanLast) {
                    setAuthMsg({ type: "error", text: "Prénom et nom requis." });
                    return;
                  }

                  const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
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
                  return;
                }

                const { data, error } = await supabase.auth.signInWithPassword({
                  email,
                  password,
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
                    className="w-full border border-[var(--hr-sand)] bg-[var(--hr-surface)] p-3 rounded-2xl placeholder:text-[var(--hr-muted)]"
                    required
                    disabled={submitting}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Nom</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full border border-[var(--hr-sand)] bg-[var(--hr-surface)] p-3 rounded-2xl placeholder:text-[var(--hr-muted)]"
                    required
                    disabled={submitting}
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
                className="w-full border border-[var(--hr-sand)] bg-[var(--hr-surface)] p-3 rounded-2xl placeholder:text-[var(--hr-muted)]"
                required
                disabled={submitting}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Mot de passe</label>
              <input
                type="password"
                placeholder="••••••••"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                className="w-full border border-[var(--hr-sand)] bg-[var(--hr-surface)] p-3 rounded-2xl placeholder:text-[var(--hr-muted)]"
                required
                disabled={submitting}
              />
              <p className="text-xs text-[var(--hr-muted)]">Minimum 6 caractères.</p>
            </div>

            <button
              disabled={submitting}
              className={`w-full py-3 rounded-2xl bg-[var(--hr-accent)] text-[var(--hr-cream)] font-semibold active:scale-[0.99] ${
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

          {authMode === "login" && (
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                className="text-sm underline text-[var(--hr-muted)] disabled:opacity-60"
                disabled={submitting}
                onClick={async () => {
                  setAuthMsg(null);

                  const email = authEmail.trim().toLowerCase();
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

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-[var(--hr-sand)]" />
            <span className="text-xs text-[var(--hr-muted)]">ou</span>
            <div className="h-px flex-1 bg-[var(--hr-sand)]" />
          </div>

          {/* ✅ Google + Apple côte à côte */}
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              disabled={submitting}
              onClick={() =>
                supabase.auth.signInWithOAuth({
                  provider: "google",
                  options: { redirectTo: `${getRedirectBase()}/restaurants` },
                })
              }
              className={oauthBtn}
              aria-label="Continuer avec Google"
              title="Continuer avec Google"
            >
              <GoogleIcon />
            </button>

              
            {/*Boutton Apple - Future option
            <button
              type="button"
              disabled={submitting}
              onClick={() =>
                supabase.auth.signInWithOAuth({
                  provider: "apple",
                  options: { redirectTo: `${getRedirectBase()}/restaurants` },
                })
              }
              className={oauthBtn}
              aria-label="Continuer avec Apple"
              title="Continuer avec Apple"
            >
              <AppleIcon />
            </button>*/}
          </div>

          {authMsg && (
            <div
              className={`text-sm rounded-2xl border p-3 ${
                authMsg.type === "error"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-[var(--hr-sand)] bg-[var(--hr-sand)]/25"
              }`}
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

/*Boutton Apple - Future option
function AppleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.365 1.43c0 1.14-.43 2.22-1.2 3.04-.83.9-2.19 1.59-3.36 1.5-.15-1.14.47-2.32 1.25-3.13.86-.9 2.28-1.55 3.31-1.41zM20.52 17.2c-.48 1.08-.71 1.56-1.33 2.52-.86 1.34-2.08 3.01-3.6 3.02-1.35.01-1.7-.88-3.53-.87-1.84.01-2.22.89-3.56.88-1.52-.01-2.68-1.52-3.54-2.86-2.48-3.84-2.74-8.34-1.21-10.68 1.09-1.67 2.81-2.65 4.42-2.65 1.64 0 2.67.9 4.02.9 1.31 0 2.11-.91 4-.91 1.43 0 2.95.78 4.04 2.12-3.55 1.94-2.98 7.01.29 8.53z"
      />
    </svg>
  );
}*/
