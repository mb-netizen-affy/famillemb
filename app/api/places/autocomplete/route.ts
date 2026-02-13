import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { input } = await req.json();

    if (!input || typeof input !== "string") {
      return NextResponse.json({ predictions: [] }, { status: 200 });
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing GOOGLE_PLACES_API_KEY" },
        { status: 500 }
      );
    }

    // Places API (New) Autocomplete: POST https://places.googleapis.com/v1/places:autocomplete :contentReference[oaicite:2]{index=2}
    const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
      },
      body: JSON.stringify({
        input,
        // Astuce : limiter aux établissements (restaurants etc.)
        includedPrimaryTypes: ["restaurant"],
        // Tu peux ajouter languageCode / regionCode si tu veux
        languageCode: "fr",
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: "Google Places error", details: text },
        { status: 500 }
      );
    }

    const data = await res.json();

    // On normalise une réponse simple
    const predictions =
      data?.suggestions?.map((s: any) => ({
        placeId: s?.placePrediction?.placeId,
        text: s?.placePrediction?.text?.text,
      })) ?? [];

    return NextResponse.json({ predictions }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Server error", details: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
