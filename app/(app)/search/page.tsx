"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { AVAILABLE_TAGS } from "../../components/Tags";

type Prediction = { placeId: string; text: string };

type PlaceDetails = {
  placeId: string;
  name: string;
  address: string;
  ratingGoogle: number | null;
  userRatingCount: number | null;
  primaryType: string | null;
  lat: number | null;
  lng: number | null;
  photoName: string | null;
};

function extractCityFromAddress(address: string): string {
  const parts = address.split(",").map((p) => p.trim());
  const candidate = parts.length >= 2 ? parts[parts.length - 2] : "";
  return candidate.replace(/^\d{4,5}\s+/, "").trim();
}

function extractCountryFromAddress(address: string): string {
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

function clampRating(v: number) {
  return Math.min(20, Math.max(0, v));
}

function normalize(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function highlightMatch(text: string, q: string) {
  const nText = normalize(text);
  const nQ = normalize(q);
  if (!nQ) return { before: text, match: "", after: "" };

  const idx = nText.indexOf(nQ);
  if (idx === -1) return { before: text, match: "", after: "" };

  return {
    before: text.slice(0, idx),
    match: text.slice(idx, idx + q.length),
    after: text.slice(idx + q.length),
  };
}

export default function SearchPage() {
  const [userId, setUserId] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);

  const [selected, setSelected] = useState<PlaceDetails | null>(null);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [myRating, setMyRating] = useState<string>(""); // utilisé seulement si nouveau resto
  const [myTags, setMyTags] = useState<string[]>([]);
  const [myPrice, setMyPrice] = useState<string>(""); // prix de la visite

  const [alreadyAdded, setAlreadyAdded] = useState(false);
  const [existingRestaurantId, setExistingRestaurantId] = useState<string | null>(null);

  const autoCache = useRef(new Map<string, Prediction[]>());
  const detailsCache = useRef(new Map<string, PlaceDetails>());

  const autoReqId = useRef(0);
  const detailsReqId = useRef(0);

  const lastSelectedQuery = useRef<string>("");

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        window.location.href = "/login";
        return;
      }
      setUserId(data.user.id);
    };
    init();
  }, []);

  const toggleMyTag = (tag: string) => {
    setMyTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const resetSelection = () => {
    setSelected(null);
    setMyRating("");
    setMyTags([]);
    setMyPrice("");
    setAlreadyAdded(false);
    setExistingRestaurantId(null);
  };

  useEffect(() => {
    const raw = query.trim();
    const nQ = normalize(raw);

    setMsg(null);

    if (selected && normalize(lastSelectedQuery.current) !== nQ) {
      resetSelection();
    }

    if (!nQ) {
      setPredictions([]);
      resetSelection();
      return;
    }

    const cached = autoCache.current.get(nQ);
    if (cached) {
      setPredictions(cached);
      return;
    }

    const t = setTimeout(async () => {
      const req = ++autoReqId.current;
      setLoading(true);

      try {
        const res = await fetch("/api/places/autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: raw }),
        });

        const data = await res.json();
        if (req !== autoReqId.current) return;

        const preds = (data.predictions ?? []) as Prediction[];
        autoCache.current.set(nQ, preds);
        setPredictions(preds);
      } catch {
        if (req !== autoReqId.current) return;
        setMsg("❌ Erreur réseau (autocomplete).");
      } finally {
        if (req === autoReqId.current) setLoading(false);
      }
    }, 250);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const selectPlace = async (placeId: string) => {
    const req = ++detailsReqId.current;

    setLoading(true);
    setMsg(null);
    setPredictions([]);
    resetSelection();

    const cached = detailsCache.current.get(placeId);
    if (cached) {
      setSelected(cached);
      lastSelectedQuery.current = query;
      setLoading(false);

      // check existing restaurant by place_id + user_id
      if (userId) {
        const { data: existing } = await supabase
          .from("restaurants")
          .select("id,rating,tags")
          .eq("place_id", cached.placeId)
          .eq("user_id", userId)
          .maybeSingle();

        if (existing?.id) {
          setAlreadyAdded(true);
          setExistingRestaurantId(existing.id);
        }
      }

      return;
    }

    try {
      const res = await fetch("/api/places/details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId }),
      });

      const data = (await res.json()) as PlaceDetails;
      if (req !== detailsReqId.current) return;

      if (!res.ok) {
        setMsg("❌ Erreur Google Places.");
        setLoading(false);
        return;
      }

      detailsCache.current.set(placeId, data);
      setSelected(data);
      lastSelectedQuery.current = query;
      setLoading(false);

      if (userId) {
        const { data: existing } = await supabase
          .from("restaurants")
          .select("id")
          .eq("place_id", data.placeId)
          .eq("user_id", userId)
          .maybeSingle();

        if (existing?.id) {
          setAlreadyAdded(true);
          setExistingRestaurantId(existing.id);
        }
      }
    } catch {
      if (req !== detailsReqId.current) return;
      setMsg("❌ Erreur réseau (details).");
      setLoading(false);
    }
  };

  const addVisitOnly = async (restaurantId: string) => {
    if (!userId) return;

    const p = Number(myPrice);
    if (!myPrice.trim() || !Number.isFinite(p) || p < 0) {
      setMsg("❌ Entre un prix valide.");
      return;
    }

    const { error } = await supabase.from("restaurant_visits").insert([
      {
        user_id: userId,
        restaurant_id: restaurantId,
        price_eur: p,
      },
    ]);

    if (error) {
      console.error(error.message);
      setMsg("❌ Erreur ajout visite.");
      return;
    }

    setMsg("🍴 Visite ajoutée !");
    setAdding(false);
    setQuery("");
    resetSelection();
  };

  const addNewRestaurantWithFirstVisit = async () => {
    if (!selected || !userId) return;

    // Prix (visite)
    const p = Number(myPrice);
    if (!myPrice.trim() || !Number.isFinite(p) || p < 0) {
      setMsg("❌ Entre un prix valide (visite).");
      return;
    }

    // Note + tags (fiche)
    const parsed = myRating === "" ? 0 : Number(myRating);
    const safeRating = clampRating(Number.isFinite(parsed) ? parsed : 0);

    // 1) create restaurant
    const { data: inserted, error: rErr } = await supabase
      .from("restaurants")
      .insert([
        {
          user_id: userId,
          name: selected.name,
          city: extractCityFromAddress(selected.address),
          country: extractCountryFromAddress(selected.address),
          rating: safeRating,
          tags: myTags,
          place_id: selected.placeId,
          address: selected.address,
          lat: selected.lat,
          lng: selected.lng,
          google_rating: selected.ratingGoogle,
          google_user_ratings: selected.userRatingCount,
          photo_name: selected.photoName,
        },
      ])
      .select("id")
      .maybeSingle();

    if (rErr) {
      if ((rErr as any).code === "23505") {
        setMsg("ℹ️ Déjà dans tes restos. Ajoute une visite à la place.");
        setAlreadyAdded(true);
      } else if ((rErr as any).code === "23514") {
        setMsg("❌ La note doit être comprise entre 0 et 20.");
      } else {
        setMsg("❌ Erreur ajout restaurant.");
      }
      return;
    }

    const restaurantId = inserted?.id;
    if (!restaurantId) {
      setMsg("❌ Impossible de récupérer l’id du restaurant.");
      return;
    }

    // 2) create first visit
    const { error: vErr } = await supabase.from("restaurant_visits").insert([
      {
        user_id: userId,
        restaurant_id: restaurantId,
        price_eur: p,
      },
    ]);

    if (vErr) {
      console.error(vErr.message);
      setMsg("⚠️ Restaurant créé, mais erreur lors de l’ajout de la visite.");
      return;
    }

    setMsg("✅ Restaurant ajouté + 1ère visite 🍴");
    setQuery("");
    resetSelection();
  };

  const canShowSuggestions = predictions.length > 0 && !selected;
  const firstSuggestion = useMemo(() => predictions[0]?.placeId ?? null, [predictions]);

  const canSubmit =
    !adding &&
    !!selected &&
    myPrice.trim() !== "" &&
    Number.isFinite(Number(myPrice)) &&
    Number(myPrice) >= 0;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">🔎 Recherche</h1>

      <div className="bg-[var(--hr-surface)] border border-[var(--hr-sand)] rounded-2xl p-4 shadow-sm space-y-3">
        <div className="relative">
          <input
            className="w-full border border-[var(--hr-sand)] p-3 pr-12 rounded-2xl bg-[var(--hr-surface)] placeholder:text-[var(--hr-muted)]"
            placeholder="Tape le nom d’un restaurant…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && firstSuggestion) {
                e.preventDefault();
                selectPlace(firstSuggestion);
              }
              if (e.key === "Escape") setPredictions([]);
            }}
            inputMode="search"
            autoComplete="off"
            autoFocus
          />

          {query.trim() && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setPredictions([]);
                resetSelection();
                setMsg(null);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full border border-[var(--hr-sand)] bg-[var(--hr-surface)] text-[var(--hr-muted)] flex items-center justify-center active:scale-[0.98]"
              aria-label="Effacer"
              title="Effacer"
            >
              ✕
            </button>
          )}
        </div>

        {loading && <p className="text-sm text-[var(--hr-muted)]">Chargement…</p>}

        {msg && (
          <div className="text-sm rounded-2xl border border-[var(--hr-sand)] bg-[var(--hr-sand)]/25 p-3">
            {msg}
          </div>
        )}

        {canShowSuggestions && (
          <ul className="border border-[var(--hr-sand)] rounded-2xl overflow-hidden">
            {predictions.map((p) => {
              const h = highlightMatch(p.text, query);
              return (
                <li key={p.placeId} className="border-b border-[var(--hr-sand)] last:border-b-0">
                  <button
                    type="button"
                    className="w-full text-left px-4 py-3 bg-[var(--hr-surface)] hover:bg-[var(--hr-sand)]/20 active:bg-[var(--hr-sand)]/20"
                    onClick={() => selectPlace(p.placeId)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 text-lg">📍</div>

                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-[var(--hr-ink)] truncate">
                          {h.match ? (
                            <>
                              {h.before}
                              <span className="underline">{h.match}</span>
                              {h.after}
                            </>
                          ) : (
                            p.text
                          )}
                        </div>
                        <div className="text-xs text-[var(--hr-muted)] truncate">
                          Appuie pour voir les détails
                        </div>
                      </div>

                      <div className="text-[var(--hr-muted)] mt-1">›</div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selected && (
        <section className="bg-[var(--hr-surface)] border border-[var(--hr-sand)] rounded-2xl p-4 shadow-sm space-y-3">
          <div className="text-lg font-semibold">{selected.name}</div>
          <div className="text-sm text-[var(--hr-muted)]">{selected.address}</div>

          {selected.lat && selected.lng && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${selected.lat},${selected.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <div className="relative w-full h-28 sm:h-32 overflow-hidden rounded-2xl border border-[var(--hr-sand)] bg-[var(--hr-surface)]">
                <iframe
                  title="map"
                  className="absolute inset-0 w-full h-full"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  src={`https://www.google.com/maps?q=${selected.lat},${selected.lng}&z=15&output=embed`}
                />
              </div>
            </a>
          )}

          <div className="flex items-center gap-2 text-sm text-[var(--hr-muted)]">
            <span>⭐ {selected.ratingGoogle ?? "—"}</span>
            {selected.userRatingCount ? <span>({selected.userRatingCount})</span> : null}
            {selected.primaryType ? (
              <span className="ml-auto px-2 py-1 rounded-full border border-[var(--hr-sand)] text-[var(--hr-ink)] bg-[var(--hr-surface)] text-xs">
                {selected.primaryType}
              </span>
            ) : null}
          </div>

          {/* Prix visite (toujours) */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Prix de cette visite (€)</label>
            <input
              type="number"
              min={0}
              step={0.5}
              placeholder="ex: 25"
              value={myPrice}
              onChange={(e) => setMyPrice(e.target.value)}
              className="w-full border border-[var(--hr-sand)] p-3 rounded-2xl bg-[var(--hr-surface)]"
            />
          </div>

          {/* Si nouveau resto : note + tags */}
          {!alreadyAdded && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Ta note (sur 20)</label>
                <input
                  type="number"
                  min={0}
                  max={20}
                  step={1}
                  placeholder="0 - 20"
                  value={myRating}
                  onChange={(e) => setMyRating(e.target.value)}
                  className="w-full border border-[var(--hr-sand)] p-3 rounded-2xl bg-[var(--hr-surface)]"
                />
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Tes tags</div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {AVAILABLE_TAGS.map((tag) => {
                    const isSelected = myTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleMyTag(tag)}
                        className={`whitespace-nowrap px-3 py-2 rounded-full text-sm border transition active:scale-[0.98] ${
                          isSelected
                            ? "bg-[var(--hr-accent)] text-[var(--hr-cream)] border-[var(--hr-accent)]"
                            : "bg-[var(--hr-surface)]/60 text-[var(--hr-muted)] border-[var(--hr-sand)]/70 hover:bg-[var(--hr-sand)]/15"
                        }`}
                      >
                        #{tag}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          <button
            disabled={adding || !canSubmit}
            onClick={async () => {
              setAdding(true);
              setMsg(null);

              if (alreadyAdded && existingRestaurantId) {
                await addVisitOnly(existingRestaurantId);
              } else {
                await addNewRestaurantWithFirstVisit();
              }

              setAdding(false);
            }}
            className="w-full py-3 rounded-2xl bg-[var(--hr-accent)] text-[var(--hr-cream)] font-semibold disabled:opacity-60 active:scale-[0.99]"
          >
            {alreadyAdded ? (adding ? "Ajout…" : "🍴 Ajouter une visite") : adding ? "Ajout…" : "Ajouter à mes restaurants"}
          </button>

          {alreadyAdded && (
            <p className="text-xs text-[var(--hr-muted)]">
              Ce restaurant est déjà dans ta liste : tu ajoutes uniquement une nouvelle visite.
            </p>
          )}
        </section>
      )}
    </div>
  );
}