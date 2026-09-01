export type PlanId = "free" | "flash" | "pro" | "gold";
export type BillingPeriod = "month" | "year" | "lifetime";

export interface PlanDefinition {
  id: PlanId;
  name: string;
  monthlyPrice: number;
  flashDays?: number;
  maxWordsPerAnalysis?: number;
  analysesPerDay?: number;
  features: string[];
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    maxWordsPerAnalysis: 2500,
    features: ["Analyse jusqu'à 2 500 mots", "Humanisation jusqu'à 2 500 mots", "Résultats à l'écran"],
  },
  flash: {
    id: "flash",
    name: "Flash / Découverte",
    monthlyPrice: 65.85,
    flashDays: 7,
    analysesPerDay: 1,
    features: ["Accès aux fonctions Pro", "1 analyse par jour", "Expiration automatique sous 7 jours"],
  },
  pro: {
    id: "pro",
    name: "Oligens Pro",
    monthlyPrice: 250,
    features: ["Fonctionnalités avancées", "Rapports PDF", "Statistiques", "Historique avancé"],
  },
  gold: {
    id: "gold",
    name: "Oligens Gold",
    monthlyPrice: 2500,
    features: ["Tout Pro", "Bases institutionnelles illimitées", "Rapports professionnels complets", "Toutes les options"],
  },
};

export const ANNUAL_DISCOUNT = 0.13;
export const FLASH_PRICE = 65.85;

export function annualPrice(monthly: number): number {
  return Math.round(monthly * 12 * (1 - ANNUAL_DISCOUNT) * 100) / 100;
}

export function getPrice(plan: PlanId, period: BillingPeriod): number | null {
  if (plan === "free") return 0;
  if (period === "month") return PLANS[plan].monthlyPrice;
  if (period === "year") return annualPrice(PLANS[plan].monthlyPrice);
  // Lifetime pricing is deliberately configurable server-side; never invent a price.
  return null;
}

export function formatHTG(value: number | null): string {
  if (value === null) return "Prix à définir";
  return `${value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} HTG`;
}
