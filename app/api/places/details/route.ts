import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { placeId } = await req.json();

    if (!placeId || typeof placeId !== "string") {
      return NextResponse.json({ error: "Missing placeId" }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing GOOGLE_PLACES_API_KEY" },
        { status: 500 }
      );
    }

    // Place Details (New) returns fields via FieldMask header :contentReference[oaicite:3]{index=3}
    const fields = [
      "id",
      "displayName",
      "formattedAddress",
      "location",
      "rating",
      "userRatingCount",
      "primaryType",
      "websiteUri",
      "nationalPhoneNumber",
      "photos",
    ].join(",");

    const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fields,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: "Google Places error", details: text },
        { status: 500 }
      );
    }

    const p = await res.json();

    // Photo: on renvoie une URL "proxy" (optionnel) ou on stocke juste le photo.name
    // Ici on renvoie photoName pour usage plus tard.
    const photoName = p?.photos?.[0]?.name ?? null;

    return NextResponse.json(
      {
        placeId: p.id,
        name: p?.displayName?.text ?? "",
        address: p?.formattedAddress ?? "",
        ratingGoogle: p?.rating ?? null,
        userRatingCount: p?.userRatingCount ?? null,
        primaryType: p?.primaryType ?? null,
        lat: p?.location?.latitude ?? null,
        lng: p?.location?.longitude ?? null,
        photoName,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: "Server error", details: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
