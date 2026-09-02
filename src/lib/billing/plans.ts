export type PlanId="free"|"flash"|"pro"|"gold";
export type BillingPeriod="month"|"year"|"lifetime";
export interface PlanDefinition{id:PlanId;name:string;flashDays?:number;maxWordsPerAnalysis?:number;analysesPerDay?:number;features:string[]}
export const PLANS:Record<PlanId,PlanDefinition>={
 free:{id:"free",name:"Free",maxWordsPerAnalysis:2500,features:["Analyse jusqu'à 2 500 mots","Humanisation jusqu'à 2 500 mots","Résultats à l'écran"]},
 flash:{id:"flash",name:"Flash / Découverte",flashDays:7,analysesPerDay:1,features:["Accès aux fonctions Pro","1 analyse par jour","Expiration automatique sous 7 jours"]},
 pro:{id:"pro",name:"Oligens Pro",features:["Fonctionnalités avancées","Rapports PDF","Statistiques","Historique avancé"]},
 gold:{id:"gold",name:"Oligens Gold",features:["Tout Pro","Bases institutionnelles illimitées","Rapports professionnels complets","Toutes les options"]}
};
export function formatHTG(value:number|null){return value===null?"Prix à définir":`${value.toLocaleString("fr-FR",{minimumFractionDigits:2,maximumFractionDigits:2})} HTG`}
