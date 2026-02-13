export type Restaurant = {
  id: string;
  name: string;
  city: string;
  rating: number;
  tags: string[];
  // champs bonus que tu as déjà en DB / stats
  price_eur?: number | null;
  country?: string | null;

  // stats calculées côté page
  visit_count?: number;
  total_spent_eur?: number;
};

export type Props = {
  restaurant: Restaurant;
  onDelete: () => void;
  onSave: (rating: number, tags: string[], price_eur: number | null) => void;

  // ✅ NEW : ouverture de l’historique des visites
  onOpenVisits?: () => void;
};
