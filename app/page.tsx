"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "./lib/supabaseClient";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const go = async () => {
      const { data } = await supabase.auth.getUser();
      router.replace(data.user ? "/restaurants" : "/login");
    };
    go();
  }, [router]);

  return <p className="p-6 text-sm text-gray-500">Chargement…</p>;
}