import Stripe from "stripe";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
});

export async function POST(req: Request) {
  try {
    const { userId } = (await req.json()) as { userId: string };
    if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .maybeSingle();

    const customerId = profile?.stripe_customer_id;
    if (!customerId) return NextResponse.json({ error: "No customer" }, { status: 400 });

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.NEXT_PUBLIC_SITE_URL}/profile`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error("Portal error:", e?.message ?? e);
    return NextResponse.json({ error: "Portal error" }, { status: 500 });
  }
}
