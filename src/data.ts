export type FileKind="pdf"|"docx"|"txt";
export interface RecentEntry{id:string;name:string;kind:FileKind;date:string;time:string;pages:number;ai:number;plagiat:number;fresh?:boolean;sizeKo?:number;mots?:number}
export interface OriginRow{model:string;vendor:string;share:number}
export interface GlobalResults{fileName:string;ia:number;plagiat:number;refs:number;human:number;refsTotal:number;refsDouteuses:number;passages:number;summary:string;origins:OriginRow[];confidence?:"Faible"|"Moyenne"|"Élevée";confidenceInterval?:[number,number];decision?:string;engine?:{mode:"direct"|"worker";durationMs:number;words:number};language?:"fr"|"en"|"mixte";signatureNote?:string;topFactors?:Array<{nom:string;z_score:number;contribution:number}>;metrics?:{precision:number;transitionDensity:number;burstiness:number;mattr:number;originalite:number;charEntropy:number}}
export interface ReportItem{id:string;entry:RecentEntry;hash:string;createdAt:string;analysisId?:string}
export const recentEntries:RecentEntry[]=[];
export const archiveEntries:RecentEntry[]=[];
export const seedReports:ReportItem[]=[];
export const monthlyAiRate:Array<{m:string;v:number}>=[];
export const facultyDistribution:Array<{name:string;v:number}>=[];
export const notifications:Array<{id:string;title:string;body:string;when:string;tone:"warn"|"ok"|"info"}>=[];
export const flaggedPassages:Array<{section:string;confidence:number;text:string;verdict:string}>=[];
export const scanStages=["Extraction du texte & OCR","Empreinte vectorielle du document","Détection IA générative","Vérification anti-plagiat","Contrôle des références","Génération du rapport"];
export const scanStageAt=(p:number)=>p<12?0:p<28?1:p<46?2:p<66?3:p<86?4:5;
export const reportIncludes=["Score global & ventilation par catégorie de risque","Bilan du plagiat conditionnel","Audit des références détectées","Facteurs explicatifs du moteur","Empreinte et horodatage du rapport"];
export function statusOf(ai:number):"faible"|"modere"|"eleve"{if(ai>=50)return"eleve";if(ai>=25)return"modere";return"faible"}
export function fmtInt(n:number){return n.toLocaleString("fr-FR")}
