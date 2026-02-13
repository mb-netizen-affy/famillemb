import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const { restaurantId } = await req.json();

    if (!restaurantId) {
      return NextResponse.json({ error: "restaurantId manquant" }, { status: 400 });
    }

    // Service role obligatoire si tu veux faire ça côté server sans cookies auth.
    // MAIS on peut faire plus simple : utiliser les cookies auth de Supabase SSR.
    // Comme tu as déjà une config client-side, je te propose la version SIMPLE :
    // -> on fait un delete en client-side directement.
    // Donc ici je refuse volontairement si pas configuré.
    return NextResponse.json(
      {
        error:
          "API non configurée. Fais la suppression côté client Supabase (recommandé ici).",
      },
      { status: 501 }
    );
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
