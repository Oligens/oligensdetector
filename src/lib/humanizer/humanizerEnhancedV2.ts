import { analyzeCalibrated } from "../detector/calibratedDetector";
import { countWords } from "../detector/heuristicEngine";
import type { HumanizeOutcome, HumanizerConfig, HumanizerProgress, HumanizerReport, IterationAnomaly, IterationRecord } from "./humanizerUltimate";

const DEFAULTS: HumanizerConfig = { seuilCible: 0.12, iterationsMax: 5, intensite: 0.72, langue: "mixte", modeAggressif: false };
const FR_REPLACEMENTS: Array<[RegExp,string[]]> = [
  [/\bil est important de noter que\b/gi,["il faut surtout retenir que","on remarque que","un point ressort :"]],
  [/\bil convient de souligner que\b/gi,["on peut souligner que","un élément ressort :","il faut relever que"]],
  [/\bil est essentiel de comprendre\b/gi,["il faut comprendre","le point clé est","on comprend mieux"]],
  [/\bil est à noter que\b/gi,["on remarque que","à noter :","on constate que"]],
  [/\bil est intéressant de constater\b/gi,["on observe que","un fait ressort :","on voit que"]],
  [/\bdans le paysage actuel\b/gi,["aujourd'hui","dans la situation actuelle","actuellement"]],
  [/\bdans ce contexte\b/gi,["ici","sur ce point","dans cette situation"]],
  [/\ben ce qui concerne\b/gi,["pour","quant à","sur"]],
  [/\bde manière générale\b/gi,["globalement","dans l'ensemble","en règle générale"]],
  [/\bpar conséquent\b/gi,["donc","de ce fait","ce qui conduit à"]],
  [/\ben conclusion\b/gi,["pour finir","au final","en résumé"]],
  [/\ben définitive\b/gi,["finalement","au bout du compte","au final"]],
  [/\bforce est de constater\b/gi,["on constate","les faits montrent","il faut reconnaître"]],
  [/\bon peut affirmer que\b/gi,["on peut dire que","les éléments montrent que","tout indique que"]],
  [/\bpremièrement\b/gi,["d'abord","pour commencer","en premier lieu"]],
  [/\bdeuxièmement\b/gi,["ensuite","puis","dans un second temps"]],
  [/\btroisièmement\b/gi,["enfin","pour finir"]],
  [/\bdans le cadre de\b/gi,["dans","pour","en vue de"]],
  [/\bau niveau de\b/gi,["concernant","sur","en matière de"]],
  [/\bafin de\b/gi,["pour","dans le but de"]],
];
const EN_REPLACEMENTS: Array<[RegExp,string[]]> = [
  [/\bit is important to note that\b/gi,["notably","one point is that","what matters is that"]],
  [/\bit should be noted that\b/gi,["notably","the point is that","we can observe that"]],
  [/\bin conclusion\b/gi,["finally","overall","to sum up"]],
  [/\bin the current landscape\b/gi,["today","in the current situation","currently"]],
  [/\bmoreover\b/gi,["also","besides that","another point is"]],
  [/\bfurthermore\b/gi,["also","in addition","another point is"]],
  [/\btherefore\b/gi,["so","as a result","that means"]],
];
const normalize=(s:string)=>s.replace(/[ \t]+/g," ").replace(/\s+([,.;!?…])/g,"$1").replace(/([.!?…])\s*([.!?…])/g,"$1").trim();
const splitSentences=(s:string)=>s.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g)?.map(x=>x.trim()).filter(Boolean)??[];
const choose=(arr:string[],seed:number)=>arr[Math.abs(seed)%arr.length];
function seed(s:string){let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return()=>{h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return(h>>>0)/4294967296;};}
function replaceBoilerplate(text:string,rng:()=>number,intensity:number){let out=text;for(const [re,opts] of [...FR_REPLACEMENTS,...EN_REPLACEMENTS])out=out.replace(re,m=>rng()<Math.max(.7,Math.min(.98,.72+intensity*.2))?choose(opts,Math.floor(rng()*100000)):m);return out;}
function varyFlow(text:string,intensity:number){const s=splitSentences(text);if(s.length<3)return text;const out:string[]=[];for(let i=0;i<s.length;i++){const words=s[i].split(/\s+/);if(words.length>30&&intensity>.55){const cut=Math.max(10,Math.min(words.length-8,Math.floor(words.length*.58)));out.push(words.slice(0,cut).join(" ")+".",words.slice(cut).join(" "));}else if(words.length<7&&out.length&&intensity>.68){out[out.length-1]=out[out.length-1].replace(/[.!?…]+$/g,"")+" "+s[i];}else out.push(s[i]);}return out.join(" ");}
function reduceConnectors(text:string){const connector=/^(cependant|par ailleurs|en outre|de plus|néanmoins|toutefois|par conséquent|however|moreover|furthermore|therefore)[,;:]\s+/i;let previous="";return splitSentences(text).map(s=>{const m=s.match(connector);if(!m)return s;const c=m[1].toLowerCase();if(c!==previous){previous=c;return s;}return s.slice(m[0].length).replace(/^./,x=>x.toUpperCase());}).join(" ");}
function ensureChange(original:string,candidate:string){if(candidate!==original)return candidate;const s=splitSentences(original);if(s.length>1){const idx=s.findIndex(x=>x.length>70);if(idx>=0){const words=s[idx].split(/\s+/);const cut=Math.floor(words.length*.6);s[idx]=words.slice(0,cut).join(" ")+". "+words.slice(cut).join(" ");return s.join(" ");}}return original.replace(/\bafin de\b/gi,"pour").replace(/\btherefore\b/gi,"so");}
function anomalies(r:any):IterationAnomaly[]{return (r.rapport_detaille??[]).filter((x:any)=>x.contribution>0.02).slice(0,5);}

export const enhancedHumanizerV2 = {
  async humanize(text:string, config:Partial<HumanizerConfig>={}, onProgress?:(p:HumanizerProgress)=>void):Promise<HumanizeOutcome>{
    const cfg={...DEFAULTS,...config}; const original=normalize(text); if(!original)return {texteFinal:"",rapport:{proba_initiale:0,proba_finale:0,reduction_pourcent:0,iterations_realisees:0,historique:[],features_finales:[],decision:"Aucun texte à humaniser.",config:cfg}};
    const initial=analyzeCalibrated(original); let current=original; let currentScore=initial.probabilite_IA; let best=original; let bestScore=currentScore; const history:IterationRecord[]=[]; const rng=seed(original);
    // A humanization request always performs at least one real rewrite pass.
    const passes=Math.max(1,cfg.iterationsMax); let iterations=0;
    for(let i=1;i<=passes;i++){
      iterations=i; const a=anomalies(analyzeCalibrated(current)); history.push({iteration:i,proba:currentScore,anomalies:a}); onProgress?.({iteration:i,total:passes,proba:currentScore,phase:`Réécriture naturelle ${i}/${passes}`,anomalies:a});
      if(i>1&&currentScore<=cfg.seuilCible)break;
      const intensity=Math.max(.35,Math.min(.96,cfg.intensite+(currentScore*.16)));
      let next=replaceBoilerplate(current,rng,intensity); next=reduceConnectors(next); next=varyFlow(next,intensity); next=normalize(next); next=ensureChange(current,next);
      const result=analyzeCalibrated(next); current=next; currentScore=result.probabilite_IA;
      if(currentScore<bestScore || (best===original&&next!==original)){best=current;bestScore=currentScore;}
    }
    const finalText=normalize(best); const final=analyzeCalibrated(finalText); const report:HumanizerReport={proba_initiale:initial.probabilite_IA,proba_finale:final.probabilite_IA,reduction_pourcent:(initial.probabilite_IA-final.probabilite_IA)*100,iterations_realisees:iterations,historique:history,features_finales:final.rapport_detaille,decision:final.probabilite_IA<=cfg.seuilCible?"Réécriture terminée : plusieurs marqueurs stylistiques ont été réduits.":"Réécriture terminée : le texte a été modifié, mais aucun détecteur ne peut garantir un score nul.",config:cfg,warning:"Le score indique des indices stylistiques et ne constitue pas une preuve d'origine humaine."};
    onProgress?.({iteration:iterations,total:passes,proba:final.probabilite_IA,phase:"Finalisation",anomalies:anomalies(final)}); return {texteFinal:finalText,rapport:report};
  }
};
