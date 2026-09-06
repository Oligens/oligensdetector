export type PlanId="free"|"flash"|"pro"|"gold";
export type BillingPeriod="month"|"year"|"lifetime";
export interface PlanDefinition{id:PlanId;name:string;priceMonthlyHTG?:number;flashDays?:number;maxWordsPerAnalysis?:number;analysesPerDay?:number;features:string[]}
export const PLANS:Record<PlanId,PlanDefinition>={
 free:{id:"free",name:"Free",maxWordsPerAnalysis:2500,features:["Analyse jusqu'à 2 500 mots","Humanisation jusqu'à 2 500 mots","Résultats à l'écran"]},
 flash:{id:"flash",name:"Flash / Découverte",priceMonthlyHTG:70,flashDays:7,analysesPerDay:1,maxWordsPerAnalysis:2500,features:["70,00 HTG / mois","1 analyse par jour","Rapports PDF","Historique avancé","Expiration automatique sous 7 jours"]},
 pro:{id:"pro",name:"Oligens Pro",priceMonthlyHTG:250,features:["250,00 HTG / mois","Fonctionnalités avancées","Rapports PDF","Statistiques","Historique avancé"]},
 gold:{id:"gold",name:"Oligens Gold",priceMonthlyHTG:2500,features:["2 500,00 HTG / mois","Tout Pro","Bases institutionnelles illimitées","Rapports professionnels complets","Toutes les options"]}
};
export function formatHTG(value:number|null){return value===null?"Prix à définir":`${value.toLocaleString("fr-FR",{minimumFractionDigits:2,maximumFractionDigits:2})} HTG`}
